/**
 * 乘法站 · R2 直传签名 Worker
 * ------------------------------------------------------------------
 * 作用：给前端签发 R2 预签名 PUT 地址，浏览器直接传文件到 R2，
 *       文件不经过 Worker（所以不受 Worker 100MB 请求体限制，视频能传 2GB）。
 *
 * 部署方式（不需要命令行）：
 *   Cloudflare Dashboard → Workers & Pages → Create → Worker → 起名 r2-presign
 *   → Edit code → 把本文件全部内容粘进去 → Deploy
 *
 * 需要配置的环境变量（Worker → Settings → Variables and Secrets）：
 *   R2_ACCOUNT_ID      Cloudflare 账号 ID
 *   R2_BUCKET          R2 桶名，例如 chengfa-media
 *   R2_ACCESS_KEY_ID   R2 → Manage R2 API Tokens 创建的 Access Key ID
 *   R2_SECRET_KEY      同上，Secret Access Key（用 Secret 类型存）
 *   R2_PUBLIC_BASE     桶绑定的自定义域，例如 https://media.chengfa.app（末尾不带斜杠）
 *   SUPABASE_URL       https://masgzimdndyewzpagrmd.supabase.co
 *   SUPABASE_ANON_KEY  sb_publishable_...
 *   ALLOW_ORIGIN       https://chengfa-761.pages.dev（或你的正式域名）
 *
 * R2 桶要配 CORS（R2 → 桶 → Settings → CORS Policy），允许前端 PUT：
 *   [{"AllowedOrigins":["https://chengfa-761.pages.dev"],"AllowedMethods":["PUT","GET"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
 */
/* ============================================================
   文件：worker/r2-presign.js（Cloudflare Worker：R2 上传签名）
   作用：校验登录 token 后，为客户端签发一个限时的 R2 上传地址，让大文件直传对象存储，
        不经过业务服务器。
   ------------------------------------------------------------
   ★ 说人话：前端想传一个 500MB 视频，但又不想把它先传到自己的服务器（扛不住、还费流量）。
     于是它先来这里「申请一张通行证」，Worker 验明身份后签一个「1 小时内有效、
     只能往这个路径写」的地址，前端拿着它直接把文件怼进 R2。
   ★ 本文件出现的专有名词：
     · Worker —— 跑在 Cloudflare 边缘的 JS 函数，没有传统服务器。
     · env —— 环境变量集合（密钥都存在这里，不写在代码里）。
     · 预签名 presign —— 用密钥算出一串签名，拼进网址；R2 收到后自己再算一遍。
     · SigV4 —— AWS 的签名算法版本 4，R2 兼容 S3 接口所以也要用它。
     · TextEncoder / crypto.subtle —— Web Crypto：浏览器和 Worker 都内置的加密工具。
     · CORS —— 跨域规则：告诉浏览器「哪些外站可以调我」。
   ============================================================ */


const MAX = { img: 8 * 1024 * 1024, audio: 30 * 1024 * 1024, video: 2 * 1024 * 1024 * 1024 };
// 【const】各类型的大小上限（字节）：8MB / 30MB / 2GB。
// 1024 * 1024 = 1MB；再乘 1024 = 1GB。
// 注意这里只是「签名前的检查」，防君子不防小人（真要绕过还得靠 R2 的规则）。

const enc = new TextEncoder();
// 【const】TextEncoder：把字符串转成字节（UTF-8）。
// 加密算法只吃字节，不吃字符串，所以每次算哈希前都要先 encode。
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
// 【箭头函数】把字节数组变成十六进制字符串（签名结果最终长这样：a3f9c1...）。
// 拆开看：
//   new Uint8Array(buf)  把缓冲转成「0~255 的字节数组」
//   [...数组]            展开成真正的数组，这样才能用数组方法
//   .map(b => ...)       每个字节转成 16 进制
//   b.toString(16)       数字转 16 进制字符串
//   .padStart(2, '0')    不足两位前面补 0（5 → '05'），否则拼出来会错位
//   .join('')            全部拼成一个长字符串

async function sha256(str) {
// 【async function】算 SHA-256 哈希。函数名就叫 sha256，名副其实 ——
//   它干的就是 SHA-256，没有任何历史包袱。
//   （之前我在这一行写过「名字是历史遗留」，那是误判，已撤回：
//     排查环境回显时把这串字符显示成了别的词，实际文件一直是对的。）
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(str)));
  // 【await】crypto.subtle.digest(算法, 数据) = 算摘要（哈希）：把任意长度的内容变成固定长度的指纹。
  // 同样的输入永远得到同样的输出，输入变一个字结果就完全不同 —— 签名就靠这个特性。
}
async function hmac(key, str) {
// 【async function】算 HMAC：带密钥的哈希。没有密钥就算不出同样结果，所以能证明「是我签的」。
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  // 【const】importKey：把一段原始字节「导入」成加密用的密钥对象。
  // 'raw' = 原始格式；{ name:'HMAC', hash:'SHA-256' } = 要用 HMAC + SHA256；
  // false = 不允许导出；['sign'] = 这个密钥只用来签名。
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(str)));
  // 【await】用这个密钥对 str 签名，结果转成字节数组返回。
}

// SigV4 预签名（R2 的 S3 兼容接口，region 固定 auto，service 固定 s3）
async function presignPut(env, key, expires = 3600) {
// 【async function】生成一个「只能 PUT 这个 key」的限时地址。
// env = 环境变量；key = 文件在桶里的路径；expires = 有效期秒数（默认 3600 秒 = 1 小时）。
// 默认值写法：参数 = 3600，调用时不传就用 3600。
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  // 【模板字符串】R2 的 S3 兼容地址：账号ID.r2.cloudflarestorage.com
  const now = new Date();
  // 【new Date()】当前时间对象。
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');   // 20261022T164500Z
  // 【const】把时间转成 SigV4 要求的格式：
  // toISOString 得到 '2026-10-22T16:45:00.000Z'，
  // 正则 /[:-]|\.\d{3}/g 把冒号、横杠、毫秒部分全删掉 → '20261022T164500Z'。
  // | 在正则里是「或者」：要么是 : 或 -，要么是 .000 这种毫秒。
  const date = amzDate.slice(0, 8);
  // 【const】只要前 8 位 = 年月日（20261022），签名范围里要用。
  const scope = `${date}/auto/s3/aws4_request`;
  // 【const】签名作用域：日期/区域/服务/版本。R2 的区域固定写 auto，服务固定 s3。
  const path = '/' + [env.R2_BUCKET, ...key.split('/')].map(encodeURIComponent).join('/');
  // 【const】拼出对象路径：/桶名/用户id/类型/文件名。
  // key.split('/') 把 '1/video/a.mp4' 拆成 ['1','video','a.mp4']；
  // ... 展开后和桶名一起放进数组；
  // map(encodeURIComponent) 每段做 URL 编码（中文、空格会被转义）；
  // join('/') 再用斜杠拼回去。

  const query = [
  // 【const】要拼进网址的查询参数（SigV4 规定顺序不能乱）。
    'X-Amz-Algorithm=AWS4-HMAC-SHA256',                          // 用的算法
    'X-Amz-Credential=' + encodeURIComponent(`${env.R2_ACCESS_KEY_ID}/${scope}`),   // 用哪个 key、作用域是什么
    'X-Amz-Date=' + amzDate,                                     // 签名时间
    'X-Amz-Expires=' + expires,                                  // 多少秒后过期
    'X-Amz-SignedHeaders=host'                                   // 只对 host 这个头签名
  ].join('&');                                                   // 【join】用 & 连起来，就是网址里那串参数。

  const canonical = ['PUT', path, query, `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  // 【const】「规范请求」：把方法、路径、参数、头、签名头列表、内容哈希按固定格式拼起来。
  // 这是 SigV4 的核心：服务端会用同样方式再拼一遍，两边的字符串必须一模一样。
  // 'UNSIGNED-PAYLOAD' 表示「内容不参与签名」，所以大文件也不需要先算哈希。
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  // 【const】待签字符串：算法 + 时间 + 作用域 + 上一步的哈希。

  let k = await hmac(enc.encode('AWS4' + env.R2_SECRET_KEY), date);
  // 【let】派生密钥第一步：用「AWS4 + 密钥」作为 key，日期作为内容。
  k = await hmac(k, 'auto');       // 第二步：区域
  k = await hmac(k, 's3');         // 第三步：服务
  k = await hmac(k, 'aws4_request');   // 第四步：版本
  // 这种「一次次套娃」的做法是 AWS 的设计，目的是让最终密钥只对「这一天 + 这个区域 + 这个服务」有效。
  const sig = hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(stringToSign)));
  // 【const】用派生出的密钥给 stringToSign 签名，再转成十六进制字符串。
  // 这一长串嵌套读法：importKey 把 k 变成密钥 → sign 用它签 stringToSign → hex 转字符串。

  return `https://${host}${path}?${query}&X-Amz-Signature=${sig}`;
  // 【return】最终地址：域名 + 路径 + 参数 + 签名。
  // 前端拿这个地址 PUT 文件，R2 会自己重算一遍签名，对得上才允许写入。
}

function cors(env) {
// 【function】返回一组 CORS 响应头。
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
    // 允许哪个网站调我。配了具体域名就只允许它；没配就 *（谁都能调，不安全，仅测试用）。
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // 允许的方法：POST（申请签名）和 OPTIONS（浏览器预检）。
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    // 允许前端带这两个头过来（Authorization 里装登录 token）。
    'Access-Control-Max-Age': '86400'
    // 预检结果缓存 24 小时（86400 秒），省得每次请求都先问一遍。
  };
}
const json = (obj, status, env) =>
// 【箭头函数】快速造一个 JSON 响应。
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(env) } });
  // 【展开】...cors(env) 把上面那三个头「摊开」并进 headers 对象里。
  // 对象展开语法：{ ...a, ...b } = 把 a 和 b 的所有字段合并到一个新对象。

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg' };
  // 【const】MIME 类型 → 文件后缀。存对象时带上正确后缀，以后下载/播放才认得出。

export default {
// 【export default】Worker 的标准写法：导出一个带 fetch 方法的对象（不是普通函数）。
// Cloudflare 收到请求就会调用这里的 fetch。
  async fetch(req, env) {
  // 【async】req = 进来的请求，env = 环境变量（那些密钥）。
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    // 【if】浏览器的「预检请求」（OPTIONS）：只要回一句「允许」，不用给内容。
    // 204 = 成功但没有内容。
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, env);
    // 【if】只接受 POST；其他方法回 405（方法不允许）。

    // 1) 校验登录态：把 token 丢回 Supabase 验，验过才签名
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    // 【const】从请求头取 'Bearer xxxxx'，再正则去掉前面的 'Bearer '（大小写都行，i 表示忽略大小写）。
    // 剩下的就是纯 token。
    if (!token) return json({ error: '未登录' }, 401, env);
    // 【if】没有 token 直接拒绝。401 = 需要登录。
    const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    // 【await】拿这个 token 去问 Supabase：「这人是谁？」
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
    });
    if (!who.ok) return json({ error: '登录已失效，请重新登录' }, 401, env);
    // 【if】who.ok 为 false（比如 401）说明 token 过期或伪造 → 拒绝。
    const uid = (await who.json()).id;
    // 【const】把响应解析成 JSON，取里面的 id（用户唯一编号）。
    if (!uid) return json({ error: '拿不到用户 id' }, 401, env);
    // 【if】拿不到 id 也不给签。

    // 2) 校验参数
    let body;
    // 【let】等下装请求体。
    try { body = await req.json(); } catch { return json({ error: '请求体不是 JSON' }, 400, env); }
    // 【try/catch】解析 JSON；格式不对会抛错 → 回 400（请求有误）。
    const kind = body.kind === 'video' || body.kind === 'audio' ? body.kind : 'img';
    // 【const】【三元】类型只认三种，其他一律当图片。
    const size = Number(body.size) || 0;
    // 【const】Number() 转数字；转不出来（NaN）就当 0。
    if (!size) return json({ error: '缺少 size' }, 400, env);
    if (size > MAX[kind]) return json({ error: `超过上限 ${Math.round(MAX[kind] / 1048576)}MB` }, 413, env);
    // 【if】超限直接拒绝。413 = 请求体太大。
    // 模板字符串里嵌表达式，把字节数换算成 MB 显示给用户。

    const ct = String(body.contentType || '');
    // 【const】强制转字符串，防止传了奇怪类型。
    const ext = EXT[ct] || (String(body.filename || '').match(/\.([a-z0-9]{2,5})$/i) || [])[1] || 'bin';
    // 【const】三层兜底猜后缀（和 js/upload.js 里一样）：
    // ① 按 MIME 查表；② 从文件名末尾用正则抠；③ 都不行就 bin。
    const key = `${uid}/${kind}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext.toLowerCase()}`;
    // 【const】对象路径：用户id/类型/时间戳-随机8位.后缀。
    // 时间戳 + 随机串 = 几乎不可能重名，不用查重。

    // 3) 签名
    try {
      const uploadUrl = await presignPut(env, key);
      // 【await】调上面的函数生成限时上传地址。
      const base = (env.R2_PUBLIC_BASE || '').replace(/\/$/, '');
      // 【const】公开访问前缀，去掉末尾斜杠，避免拼出 //。
      return json({ key, uploadUrl, publicUrl: `${base}/${key}`, expiresIn: 3600 }, 200, env);
      // 【return】把三样东西交给前端：
      // uploadUrl → 拿去 PUT 文件；publicUrl → 以后访问这个文件用；expiresIn → 提醒多久过期。
    } catch (e) {
      return json({ error: '签名失败：' + e.message }, 500, env);
      // 500 = 服务器内部错误（多半是密钥配错了）。
    }
  }
};
