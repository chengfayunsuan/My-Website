/* ============================================================
   文件：functions/api/[[path]].js（边缘函数：R2 上传与读取）
   作用：把原来 worker/r2-guard.js 的逻辑搬到 Pages 上，走 chengfa-761.pages.dev 域名。

   为什么要搬：*.workers.dev 在国内被 DNS 污染（解析到假 IP），
   浏览器连不上，Worker 部署得再对也用不了。pages.dev 是通的，
   所以对外接口放在这里，Worker 只留一个每小时跑的定时任务。

   路由（都在 /api 下）：
     POST /api/presign        申请一个上传地址（鉴权 + 配额检查）
     GET  /api/f/<key>        从 R2 读文件返回（带边缘缓存）
     GET  /api/quota          看当前用量和档位

   绑定（Pages 项目 → 设置 → 函数 → 绑定，名字一个字都不能改）：
     KV 命名空间  QUOTA   → r2-quota
     R2 存储桶    MEDIA   → chengfa-bucket

   变量（Pages 项目 → 设置 → 环境变量）：
     R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_KEY
     SUPABASE_URL / SUPABASE_ANON_KEY
     PUBLIC_BASE / ALLOW_ORIGIN / MAX_UPLOAD_MB
     LIMIT_STORAGE_GB / LIMIT_OPS_A / LIMIT_OPS_B
   ============================================================ */

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/* ---------------- 工具：Web Crypto ---------------- */

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(str) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
}

async function hmacRaw(key, data) {
  const k = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const ck = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(data));
}

async function hmacHex(key, data) {
  return hex(await hmacRaw(key, data));
}

// S3 要求 RFC3986 编码：除 A-Za-z0-9-_.~ 外全部编码
function rfc3986(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function encodeKey(key) {
  return key.split('/').map(rfc3986).join('/');
}

/* ---------------- 配额状态 ---------------- */

function limits(env) {
  return {
    storageBytes: Number(env.LIMIT_STORAGE_GB || 10) * GB,
    opsA: Number(env.LIMIT_OPS_A || 100) * 10_000,
    opsB: Number(env.LIMIT_OPS_B || 1000) * 10_000,
  };
}

async function readUsage(env) {
  const raw = await env.QUOTA.get('usage');
  return raw ? JSON.parse(raw) : { storage: 0, opsA: 0, opsB: 0, uploadPending: 0, updated: 0 };
}

async function writeUsage(env, u) {
  u.updated = Date.now();
  await env.QUOTA.put('usage', JSON.stringify(u));
}

/** 按用量算档位；哪一项最紧就按哪一项算 */
function levelOf(env, u) {
  const L = limits(env);
  const storage = u.storage + (u.uploadPending || 0);
  const ratios = [
    ['storage', storage / L.storageBytes],
    ['opsA', u.opsA / L.opsA],
    ['opsB', u.opsB / L.opsB],
  ];
  let worst = ratios[0];
  for (const r of ratios) if (r[1] > worst[1]) worst = r;

  const pct = Math.round(worst[1] * 1000) / 10;
  let level = 'green';
  if (worst[1] >= 0.95) level = 'black';
  else if (worst[1] >= 0.85) level = 'red';
  else if (worst[1] >= 0.70) level = 'yellow';

  return { level, pct, driver: worst[0], storage, lim: L, opsA: u.opsA, opsB: u.opsB };
}

/* ---------------- 响应 ---------------- */

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra,
    },
  });
}

function corsHeaders(env) {
  return {
    'access-control-allow-origin': env.ALLOW_ORIGIN || '*',
    'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
  };
}

/** 维护页：只在 black 档用，给用户看的是人话，给程序看的是 503 */
function maintenancePage(st) {
  const html = `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>媒体服务暂停</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0e0e16;color:#c8c8dc;font-family:-apple-system,"Microsoft YaHei",sans-serif}
  .box{max-width:520px;padding:32px;border:1px solid #3a3a52;border-radius:10px;background:#14141e}
  h1{margin:0 0 12px;font-size:20px;color:#e8b84b}
  p{margin:8px 0;line-height:1.8;font-size:14px}
  code{color:#67d9ef;background:#1a1a28;padding:1px 5px;border-radius:3px}
  .dim{color:#7a7a94;font-size:13px}
</style>
<div class="box">
  <h1>媒体服务暂时停止</h1>
  <p>本站对象存储的免费额度即将用尽，按预设的保护策略已自动停服，不会产生任何费用。</p>
  <p class="dim">当前用量：${st.pct}%（最紧的一项：${st.driver}）</p>
  <p class="dim">下个月 1 日额度重置后自动恢复。站长可在 Cloudflare KV 中把 <code>usage</code> 清空以提前恢复。</p>
  <p class="dim">— 503 Service Unavailable</p>
</div></html>`;
  return new Response(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/* ---------------- 鉴权 ---------------- */

/**
 * 配了 SUPABASE_URL → 校验 Authorization: Bearer <access_token>
 * 没配 → 校验 x-upload-key
 * 都没配 → 拒绝（避免变成公开上传盘）
 */
async function authorize(request, env) {
  if (env.SUPABASE_URL) {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return { ok: false, reason: 'missing_token' };
    try {
      const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          authorization: `Bearer ${token}`,
          apikey: env.SUPABASE_ANON_KEY || '',
        },
      });
      if (!r.ok) return { ok: false, reason: 'bad_token' };
      const user = await r.json();
      return { ok: true, uid: user?.id || null };
    } catch {
      return { ok: false, reason: 'auth_unreachable' };
    }
  }

  if (env.UPLOAD_KEY) {
    const k = request.headers.get('x-upload-key');
    return k === env.UPLOAD_KEY ? { ok: true, uid: 'shared-key' } : { ok: false, reason: 'bad_key' };
  }

  return { ok: false, reason: 'not_configured' };
}

/* ---------------- 预签名：PUT ---------------- */

async function presignPut(env, key, expiresSec = 900) {
  const account = env.R2_ACCOUNT_ID;
  const bucket = env.R2_BUCKET;
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_KEY;
  const host = `${account}.r2.cloudflarestorage.com`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${bucket}/${encodeKey(key)}`;

  const qs = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSec),
    'X-Amz-SignedHeaders': 'host',
  });
  const canonicalQuery = [...qs.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
    .join('&');

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  let k = await hmacRaw('AWS4' + secretKey, dateStamp);
  k = await hmacRaw(k, 'auto');
  k = await hmacRaw(k, 's3');
  k = await hmacRaw(k, 'aws4_request');
  const sig = await hmacHex(k, stringToSign);

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${sig}`;
}

/* ---------------- 主入口 ---------------- */

export async function onRequest(context) {
  const { request, env, params, waitUntil } = context;
  const url = new URL(request.url);
  const cors = corsHeaders(env);

  // /api 之后的所有段，例如 ['f','u','202611','x.mp4']
  const seg = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const head = seg[0] || '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const u = await readUsage(env);
  const st = levelOf(env, u);

  /* ---- 用量查询 ---- */
  if (head === 'quota') {
    return json({
      level: st.level,
      percent: st.pct + '%',
      driver: st.driver,
      usage: {
        storage: (st.storage / GB).toFixed(2) + ' GB',
        opsA: st.opsA,
        opsB: st.opsB,
      },
      limits: {
        storage: (st.lim.storageBytes / GB).toFixed(0) + ' GB',
        opsA: st.lim.opsA,
        opsB: st.lim.opsB,
      },
      updated: u.updated ? new Date(u.updated).toISOString() : null,
      note: 'green<70% / yellow<85% / red<95% / black≥95%',
    }, 200, cors);
  }

  /* ---- 黑档：停上传 ---- */
  if (st.level === 'black') {
    if (head === 'presign') return json({ error: 'quota_exceeded', level: 'black' }, 503, cors);
    return maintenancePage(st);
  }

  /* ---- 签发上传地址 ---- */
  if (head === 'presign') {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

    if (st.level === 'red') {
      return json({ error: 'quota_exceeded', level: 'red', message: '存储接近上限，已停止上传' }, 503, cors);
    }

    const auth = await authorize(request, env);
    if (!auth.ok) {
      return json({ error: 'unauthorized', reason: auth.reason }, 401, cors);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'bad_json' }, 400, cors);
    }

    const size = Number(payload.size || 0);
    const name = String(payload.name || 'file');
    const limitMb = Number(env.MAX_UPLOAD_MB || 200);

    if (!size || size <= 0) return json({ error: 'size_required' }, 400, cors);
    if (size > limitMb * MB) {
      return json({
        error: 'too_large',
        message: `单文件不能超过 ${limitMb}MB`,
        maxMB: limitMb,
      }, 413, cors);
    }
    // 黄档：只放小文件（默认 20MB）
    if (st.level === 'yellow' && size > 20 * MB) {
      return json({
        error: 'quota_tight',
        level: 'yellow',
        message: '免费额度已用七成以上，暂只接受 20MB 以内的文件',
      }, 413, cors);
    }

    const remain = st.lim.storageBytes - st.storage - (u.uploadPending || 0);
    if (size > remain) {
      return json({
        error: 'no_space',
        remainMB: Math.max(0, Math.floor(remain / MB)),
        message: '剩余免费空间不足',
      }, 507, cors);
    }

    const ext = (name.match(/\.[a-z0-9]{1,8}$/i) || [''])[0].toLowerCase();
    const d = new Date();
    const key = `u/${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${ext}`;

    const putUrl = await presignPut(env, key);

    // 先记账（保守）：传失败最多让额度提前一点被判定用完，不会超
    u.uploadPending = (u.uploadPending || 0) + size;
    await writeUsage(env, u);

    const base = (env.PUBLIC_BASE || url.origin).replace(/\/+$/, '');
    return json({
      url: putUrl,
      key,
      publicUrl: `${base}/api/f/${key}`,
      expiresIn: 900,
      level: st.level,
    }, 200, cors);
  }

  /* ---- 读取文件 ---- */
  if (head === 'f' && (request.method === 'GET' || request.method === 'HEAD')) {
    const key = seg.slice(1).map((x) => decodeURIComponent(x)).join('/');
    if (!key) return json({ error: 'not_found' }, 404, cors);

    // 红档只挡「读次数超标」这一种，存储超标时读还是让读
    if (st.level === 'red' && st.driver === 'opsB') {
      return json({ error: 'quota_exceeded', message: '读取次数接近上限，已暂停访问' }, 503, cors);
    }

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    const obj = await env.MEDIA.get(key);
    if (!obj) return json({ error: 'not_found' }, 404, cors);

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    headers.set('cache-control', 'public, max-age=2592000, immutable');
    headers.set('access-control-allow-origin', env.ALLOW_ORIGIN || '*');

    const res = new Response(request.method === 'HEAD' ? null : obj.body, { headers });
    if (waitUntil) waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  return json({ error: 'not_found', path: seg.join('/') }, 404, cors);
}
