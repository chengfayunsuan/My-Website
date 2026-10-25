/* ============================================================
   文件：functions/bili.js（边缘函数：B 站数据代理）
   作用：代理 B 站相关接口，拿到视频的封面 / 标题 / 时长，避免浏览器直连被跨域拦截。
   ------------------------------------------------------------
   ★ 为什么不能直接在浏览器里请求 B 站？
     因为 api.bilibili.com 不返回 CORS 头，浏览器会拦下响应（详见下面那串踩坑记录）。
     这个函数跑在 Cloudflare 边缘，由它去请求 B 站，再把结果转给浏览器 —— 服务器之间没有 CORS 限制。
   ============================================================ */

// functions/bili.js
// GET /bili?bv=BVxxxxxxxxxx
//
// 拿 B 站视频的封面 / 标题 / 时长。
//
// 背景（都是踩过的坑，别退回）：
//   1) 浏览器端 fetch 不行：api.bilibili.com 不返 CORS 头，读不到内容。
//   2) 浏览器端 JSONP 也不行：响应 Content-Type 是 application/json，
//      <script> 加载会被浏览器按 MIME 拒绝执行，回调根本不触发。
//   3) api.bilibili.com 走 Cloudflare 边缘经常 -412 request was banned
//      （B 站对数据中心 IP 的风控），时通时不通，不能当唯一来源。
//   4) www.bilibili.com 的视频页是前端渲染，HTML 里没有 og:image。
//   5) **m.bilibili.com 是服务端渲染的**，HTML 里直接带 og:image / og:title，
//      所以以它为主力；API 作为补充（能拿到时长）。
//
// 优先级：m 站 HTML（封面+标题） → API（+时长） → 失败

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// 【const】User-Agent（UA）= 浏览器报给网站的「我是什么浏览器」。
// 这里伪装成桌面 Chrome 和 iPhone Safari，因为 B 站对不同 UA 返回的页面不一样：
// 手机版（m 站）是服务端渲染的，HTML 里直接带封面和标题，最好抓。

function json(obj, status, extra) {
// 【function】快速造一个 JSON 响应。
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    // 【||】没传状态码就用 200。注意这里不能用 ??，因为 0 也会被 || 当成假值（虽然状态码不会是 0）。
    headers: Object.assign({
    // 【Object.assign(目标, 来源)】把来源对象的字段合并进目标对象。
    // 等价于 { ...目标, ...来源 }，写法老一点但兼容性好。
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*'
      // 允许任何网站来调这个接口（它只是公开数据，没敏感信息）。
    }, extra || {})
    // extra = 调用方想额外加的头（比如缓存策略）；没传就给空对象，避免 Object.assign 报错。
  });
}

function makeBuvid() {
// 【function】造一个假的 B 站访客 id。
// 为什么需要：B 站接口对「没有访客标识」的请求更容易返回 -412。
// 这是社区常见的生成方式：8-4-4-4-12 位十六进制，末尾拼 infoc。
  const hex = '0123456789ABCDEF';        // 【const】十六进制字符表。
  const seg = n => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join('');
  // 【箭头函数】生成 n 位随机十六进制字符串：
  //   Array.from({length: n}, 回调)  造一个长度 n 的数组，每个元素用回调的返回值填。
  //   Math.random()                  0 ~ 1 的随机小数。
  //   * 16 后取整                     0 ~ 15 的整数。
  //   hex[数字]                       从字符表里取对应字符。
  //   .join('')                       拼成一个字符串。
  return seg(8) + '-' + seg(4) + '-' + seg(4) + '-' + seg(4) + '-' + seg(12) + 'infoc';
  // 【return】拼成标准 UUID 形状，末尾加 infoc。
}

// 从 HTML 的 meta 里取内容，属性顺序不固定，两种写法都匹配
function meta(html, prop) {
// 【function】从一大段 HTML 里抠出某个 meta 标签的 content 值。
// 例：<meta property="og:image" content="https://...">
  const a = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]+content=["\']([^"\']*)["\']', 'i');
  // 【new RegExp(字符串, 标志)】用字符串动态拼正则（因为 prop 是变量）。
  // 逐段解释：
  //   <meta[^>]+                <meta 后面跟至少一个「不是 > 的字符」
  //   (?:property|name)=        属性名是 property 或 name（?: 表示不捕获这一段）
  //   ["\']                     " 或 '（在单引号字符串里写 \' 是为了转义）
  //   + prop +                  把传进来的属性名拼进去，比如 og:image
  //   [^>]+content=["\']       再来一个不是 > 的字符序列，然后是 content="
  //   ([^"\']*)                捕获组：引号里的内容（这就是要的值）
  // 末尾 'i' = 忽略大小写。
  const b = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + prop + '["\']', 'i');
  // 第二种写法：有的网站把 content 写在前面、property 写在后面，所以得再准备一条。
  const m = html.match(a) || html.match(b);
  // 【match】用正则去匹配，匹配到返回数组（m[1] 是捕获组），匹配不到返回 null。
  // 【||】第一条没匹配到就试第二条。
  return m ? m[1] : '';
  // 【三元】匹配到就返回捕获组内容，否则返回空字符串。
}

// 1) m 站 HTML：拿封面和标题
async function fromMobile(bv, dbg) {
// 【async function】去 m.bilibili.com 抓页面。bv = 视频号，dbg = 是否返回调试信息。
  const res = await fetch('https://m.bilibili.com/video/' + bv, {
  // 【await】发请求。网址形如 https://m.bilibili.com/video/BV1xx411c7mD
    headers: {
      'User-Agent': MOBILE_UA,          // 伪装成手机浏览器
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      // 告诉对方「我能接受 HTML」；q=0.9 是优先级权重。
      'Accept-Language': 'zh-CN,zh;q=0.9',   // 期望中文页面
      'Referer': 'https://m.bilibili.com/'
      // Referer = 「你是从哪个页面点过来的」。有些站会检查它，不带上会被当成盗链。
    },
    redirect: 'follow'
    // 如果对方回跳转，自动跟过去。
  });
  if (!res.ok) return { err: 'm站 HTTP ' + res.status };
  // 【if】状态码不是 2xx → 返回一个带 err 字段的对象（约定：有 err 就是失败）。
  const html = await res.text();
  // 【await】把响应体读成纯文本（就是整个 HTML 源码）。

  let pic = meta(html, 'og:image') || meta(html, 'og:image:secure_url');
  // 【let】取封面地址。og:image 是「Open Graph」标准，页面分享到社交平台时用的缩略图。
  // 两种属性名都试一下。
  if (!pic) {
  // 【if】meta 里没找到 → 退一步用正则去 HTML 正文里找 JSON 数据里的 pic / cover 字段。
    const m = html.match(/"(?:pic|cover)"\s*:\s*"(https?:\\?\/\\?\/[^"]+\.(?:jpg|png|webp))"/i);
    // 注意 \\?\/ —— 因为 JSON 里的斜杠常被转义成 \/，所以要容忍反斜杠。
    // \s* 表示「可能有空格」。
    if (m) pic = m[1].replace(/\\\//g, '/');
    // 【if】匹配到就把所有 \/ 还原成 /（JSON 转义的斜杠）。
  }
  if (!pic) {
  // 【if】还是没有 → 放弃，返回错误信息。
    return {
      err: 'm站无 og:image（len=' + html.length + '）',   // 带上 HTML 长度，方便判断是不是被拦了（返回错误页通常很短）
      head: dbg ? html.slice(0, 300).replace(/\s+/g, ' ') : undefined
      // 【三元】只有加了 ?debug=1 才返回前 300 个字符，方便排查；
      // 否则 undefined（JSON 序列化时这个字段会消失）。
      // replace(/\s+/g, ' ') 把换行空格压成单个空格，方便一眼看完。
    };
  }

  // 去掉 @1200w_630h 这类裁剪后缀，取原图
  pic = pic.split('@')[0].replace(/^http:/, 'https:');
  // 【split('@')[0]】B 站图片地址常带 @1200w_630h.webp 这种尺寸参数，砍掉取原图。
  // 【replace】把 http: 改成 https:，避免混合内容被浏览器拦。

  let title = meta(html, 'og:title');
  // 【let】取标题。
  if (title) title = title.replace(/_哔哩哔哩.*$/, '').replace(/哔哩哔哩bilibili.*$/, '').trim();
  // 【if】B 站标题后面会自动加「_哔哩哔哩_bilibili」，用正则删掉：
  // _哔哩哔哩.*$ 表示「下划线+哔哩哔哩 一直到结尾」。
  // .trim() 去掉首尾空格。

  return { pic, title };
  // 【return】成功结果。{ pic, title } 是简写，等价于 { pic: pic, title: title }。
}

// 2) API：补时长（封面已有就不覆盖）
async function fromApi(bv, withCookie) {
// 【async function】调 B 站官方接口补时长。withCookie = 要不要带假 Cookie（风控严的时候带上更容易通）。
  const headers = {
    'User-Agent': DESKTOP_UA,               // 这次伪装成桌面浏览器
    'Referer': 'https://www.bilibili.com/',
    'Origin': 'https://www.bilibili.com',   // Origin = 发起请求的站点，比 Referer 更严格
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9'
  };                                        // 【const】注意：headers 是对象，后面可以继续加字段。
  if (withCookie) headers['Cookie'] = 'buvid3=' + makeBuvid() + '; b_nut=' + Math.floor(Date.now() / 1000);
  // 【if】【方括号赋值】给对象加一个名字带特殊逻辑的字段时用 obj['名字'] 这种写法。
  // Cookie 里塞一个随机访客 id 和当前时间戳（b_nut）。
  // Date.now() 是毫秒，除以 1000 取整 = 秒。

  const res = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bv, { headers });
  // 【await】调「视频详情」接口，把 BV 号作为参数传过去。
  const text = await res.text();
  // 先读成文本（不直接 .json()），因为 B 站被风控时可能返回 HTML，直接解析会抛错。
  let j = null;
  // 【let】先置空。
  try { j = JSON.parse(text); } catch (e) { return null; }
  // 【try/catch】解析 JSON；失败（返回的不是 JSON）就返回 null，交给调用方换别的办法。
  if (!j || j.code !== 0 || !j.data) return null;
  // 【if】B 站约定：code === 0 才是成功，其他数字是错误码；data 才是内容。
  const d = j.data;
  // 【const】把 data 取出来，后面少写几层。
  return {
    pic: String(d.pic || '').replace(/^http:/, 'https:'),   // 封面（可能没有，给空字符串兜底）
    title: d.title || '',                                    // 标题
    duration: Number(d.duration) || 0
    // 时长（秒）。Number() 转数字，转不出来当 0。
  };
}

export async function onRequestGet(context) {
// 【export async function】导出 GET 请求的处理函数。
// 注意名字：onRequestGet 只处理 GET；如果叫 onRequest 就处理所有方法。
  const { request } = context;
  // 【解构】从上下文里取出 request。
  const url = new URL(request.url);
  // 【new URL】解析网址对象。
  const bv = (url.searchParams.get('bv') || '').trim();
  // 【const】取问号后面的 bv 参数：
  // url.searchParams 是参数集合，.get('bv') 取不到时返回 null，|| '' 兜底成空字符串，trim 去空格。

  if (!/^BV[0-9A-Za-z]{10}$/.test(bv)) {
  // 【if】正则校验 BV 号格式：BV 开头 + 正好 10 位字母或数字。
  // 为什么要校验？因为后面要把它拼进 URL，不校验就等于允许别人随便传路径。
    return json({ error: 'bad_bv', message: 'BV 号格式不对' }, 400);
    // 400 = 请求参数有误。
  }

  let pic = '', title = '', duration = 0, via = [];
  // 【let】准备四个变量：封面、标题、时长、以及「数据是从哪条路拿到的」（调试用）。
  const errs = [];
  // 【const】收集每一路的错误原因（数组可以 push，所以用 const 也够）。
  const dbg = url.searchParams.get('debug') === '1';
  // 【const】带了 ?debug=1 才返回排查信息。

  // 主力：m 站 HTML
  try {
    const m = await fromMobile(bv, dbg);
    // 【await】先试主力方案。
    if (m && m.pic) { pic = m.pic; title = m.title; via.push('m-html'); }
    // 【if】拿到了封面 → 记下数据来源。
    else if (m && m.err) { errs.push(m.err + (m.head ? ' :: ' + m.head : '')); }
    // 【三元】失败就把原因记进 errs；有调试片段也一起带上。
  } catch (e) { errs.push('m站 ' + String((e && e.message) || e)); }
  // 【catch】网络层异常也记下来，然后继续尝试下一条路。

  // 补时长 / 兜底封面
  if (!duration || !pic) {
  // 【if】缺时长或缺封面才去调 API（都有了就不用多打一次请求）。
    for (const wc of [true, false]) {
    // 【for...of】遍历数组 [true, false]：先试「带 Cookie」，不行再试「不带」。
    // const wc 是循环变量，每轮取一个值。
      try {
        const a = await fromApi(bv, wc);
        if (a) {
          if (!pic && a.pic) pic = a.pic;         // 【if】之前没封面才用 API 的（别覆盖已抓到的）
          if (!title && a.title) title = a.title; // 标题同理
          duration = duration || a.duration || 0; // 有时长就用，没有就保持原值
          via.push(wc ? 'api+cookie' : 'api');    // 记录来源
          break;                                  // 【break】拿到了就不再试下一种
        } else {
          errs.push('api' + (wc ? '+cookie' : '') + ' 无数据');
        }
      } catch (e) { errs.push('api ' + String((e && e.message) || e)); }
    }
  }

  if (!pic && !title) {
  // 【if】两样都没拿到 → 判定失败。
    return json({ error: 'bili_blocked', message: errs.join(' | ') || '没拿到数据' }, 200, {
      'cache-control': 'no-store'
      // 【缓存头】不缓存失败结果，否则一次被风控会连着一天都拿不到。
    });
  }

  return json({
    ok: true,
    via: via.join('+'),   // 数据来自哪条路（m-html / api / api+cookie，可能带加号）
    bv,                   // 简写，等于 bv: bv
    title,                // 简写
    pic,                  // 简写
    duration
  }, 200, {
    // 封面和标题基本不会变，边缘缓存一天，列表页批量补图也扛得住
    'cache-control': 'public, max-age=86400'
    // 86400 秒 = 24 小时。public 表示 CDN 也可以缓存。
  });
}
