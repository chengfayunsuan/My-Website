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
 *   R2_ACCOUNT_ID      Cloudflare 账号 ID（c3dbe83cf4d4d08b1ceeef60f1f9045af0）
 *   R2_BUCKET          R2 桶名，例如 chengfa-media
 *   R2_ACCESS_KEY_ID   R2 → Manage R2 API Tokens 创建的 Access Key ID
 *   R2_SECRET_KEY      同上，Secret Access Key（用 Secret 类型存）
 *   R2_PUBLIC_BASE     桶绑定的自定义域，例如 https://media.chengfa.app（末尾不带斜杠）
 *   SUPABASE_URL       https://masgzimdndyewzpagrmd.supabase.co
 *   SUPABASE_ANON_KEY  sb_publishable_HfcHWpw7pFyRHu0p1aOZQQ_rG8powjC
 *   ALLOW_ORIGIN       https://chengfa-761.pages.dev（或你的正式域名）
 *
 * R2 桶要配 CORS（R2 → 桶 → Settings → CORS Policy），允许前端 PUT：
 *   [{"AllowedOrigins":["https://chengfa-761.pages.dev"],"AllowedMethods":["PUT","GET"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]
 */
/* ============================================================
   文件：worker/r2-presign.js（Cloudflare Worker：R2 上传签名）
   作用：校验登录 token 后，为客户端签发一个限时的 R2 上传地址，让大文件直传对象存储，不经过业务服务器。
   ============================================================ */


const MAX = { img: 8 * 1024 * 1024, audio: 30 * 1024 * 1024, video: 2 * 1024 * 1024 * 1024 };

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

async function sha256(str) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(str)));
}
async function hmac(key, str) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(str)));
}

// SigV4 预签名（R2 的 S3 兼容接口，region 固定 auto，service 固定 s3）
async function presignPut(env, key, expires = 3600) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');   // 20261022T164500Z
  const date = amzDate.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`;
  const path = '/' + [env.R2_BUCKET, ...key.split('/')].map(encodeURIComponent).join('/');

  const query = [
    'X-Amz-Algorithm=AWS4-HMAC-SHA256',
    'X-Amz-Credential=' + encodeURIComponent(`${env.R2_ACCESS_KEY_ID}/${scope}`),
    'X-Amz-Date=' + amzDate,
    'X-Amz-Expires=' + expires,
    'X-Amz-SignedHeaders=host'
  ].join('&');

  const canonical = ['PUT', path, query, `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');

  let k = await hmac(enc.encode('AWS4' + env.R2_SECRET_KEY), date);
  k = await hmac(k, 'auto');
  k = await hmac(k, 's3');
  k = await hmac(k, 'aws4_request');
  const sig = hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(stringToSign)));

  return `https://${host}${path}?${query}&X-Amz-Signature=${sig}`;
}

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
const json = (obj, status, env) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(env) } });

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg' };

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, env);

    // 1) 校验登录态：把 token 丢回 Supabase 验，验过才签名
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: '未登录' }, 401, env);
    const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
    });
    if (!who.ok) return json({ error: '登录已失效，请重新登录' }, 401, env);
    const uid = (await who.json()).id;
    if (!uid) return json({ error: '拿不到用户 id' }, 401, env);

    // 2) 校验参数
    let body;
    try { body = await req.json(); } catch { return json({ error: '请求体不是 JSON' }, 400, env); }
    const kind = body.kind === 'video' || body.kind === 'audio' ? body.kind : 'img';
    const size = Number(body.size) || 0;
    if (!size) return json({ error: '缺少 size' }, 400, env);
    if (size > MAX[kind]) return json({ error: `超过上限 ${Math.round(MAX[kind] / 1048576)}MB` }, 413, env);

    const ct = String(body.contentType || '');
    const ext = EXT[ct] || (String(body.filename || '').match(/\.([a-z0-9]{2,5})$/i) || [])[1] || 'bin';
    const key = `${uid}/${kind}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext.toLowerCase()}`;

    // 3) 签名
    try {
      const uploadUrl = await presignPut(env, key);
      const base = (env.R2_PUBLIC_BASE || '').replace(/\/$/, '');
      return json({ key, uploadUrl, publicUrl: `${base}/${key}`, expiresIn: 3600 }, 200, env);
    } catch (e) {
      return json({ error: '签名失败：' + e.message }, 500, env);
    }
  }
};
