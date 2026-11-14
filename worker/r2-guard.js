/**
 * 乘法站 · R2 配额守卫 Worker
 * ==========================================================================
 * 作用：把 R2 的所有读写都收在这一层，按免费额度设三道闸，超了自动停服务。
 *
 * 为什么需要它：R2 没有"额度到顶自动停"的开关，超了就是按量计费。
 * 唯一能"绝对不超"的办法，是让所有请求都经过一个能数数的地方。
 *
 * 三道闸（阈值都在 env 里，可改）：
 *   green  < 70%   正常
 *   yellow < 85%   只允许小文件上传（默认 ≤ 20MB），读取正常
 *   red    < 95%   停止上传，读取正常（站点还能看，只是不能发新东西）
 *   black  ≥ 95%   全部停止，返回维护页
 *
 * 两个数据来源，取更保守的那个：
 *   1. 定时任务每小时用 GraphQL 拉真实用量 → 写 KV
 *   2. Worker 自己累加每次上传的字节数 → 防止 GraphQL 延迟（最多晚 1 小时）
 *
 * 部署（5 步）：
 *   1) Cloudflare Dashboard → R2 → 你的桶 → Settings → 关闭 Public Access 的 r2.dev 子域
 *   2) Workers & Pages → Create Worker → 名字 r2-guard → 粘贴本文件 → Deploy
 *   3) Settings → Bindings 加：KV 命名空间 QUOTA；R2 桶绑定 MEDIA
 *      Settings → Variables 加下面的环境变量（R2_SECRET_KEY 用 Secret 类型）
 *   4) Settings → Triggers → Cron 加 `0 * * * *`（每小时）
 *   5) 给这个 Worker 绑自定义域名（如 media.你的域名），前端上传和播放都指向它
 *
 * 环境变量：
 *   R2_ACCOUNT_ID      账号 ID（Dashboard 右下角那串 32 位）
 *   R2_BUCKET          桶名
 *   R2_ACCESS_KEY_ID   R2 → Manage R2 API Tokens 创建
 *   R2_SECRET_KEY      同上（Secret）
 *   CF_API_TOKEN       带 Account Analytics Read 权限的 Token，用于查真实用量
 *   ALLOW_ORIGIN       允许的前端来源，如 https://chengfa-761.pages.dev
 *   MAX_UPLOAD_MB      单文件硬上限，默认 200
 *
 * 阈值（GB / 万次），不填用默认：
 *   LIMIT_STORAGE_GB=10  LIMIT_OPS_A=100  LIMIT_OPS_B=1000
 * ==========================================================================
 */

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

const DEFAULTS = {
  storageBytes: 10 * GB,
  opsA: 1_000_000,
  opsB: 10_000_000,
};

function limits(env) {
  return {
    storageBytes: Number(env.LIMIT_STORAGE_GB || 10) * GB,
    opsA: Number(env.LIMIT_OPS_A || 100) * 10_000,
    opsB: Number(env.LIMIT_OPS_B || 1000) * 10_000,
  };
}

/**
 * 读当前用量。KV 里存 JSON：
 * { storage, opsA, opsB, uploadPending, updated }
 * storage 来自 GraphQL（真实值），uploadPending 是 Worker 自己记的待确认增量。
 */
async function readUsage(env) {
  const raw = await env.QUOTA.get('usage');
  const u = raw ? JSON.parse(raw) : { storage: 0, opsA: 0, opsB: 0, uploadPending: 0, updated: 0 };
  return u;
}

async function writeUsage(env, u) {
  u.updated = Date.now();
  await env.QUOTA.put('usage', JSON.stringify(u));
}

/** 按用量算档位；哪一项最紧就按哪一项算 */
function levelOf(env, u) {
  const L = limits(env);
  const storage = u.storage + u.uploadPending;
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
  <p class="dim">当前用量：存储 / 操作 ${st.pct}%（最紧的一项：${st.driver}）</p>
  <p class="dim">下个月 1 日额度重置后自动恢复。站长可在 Cloudflare KV 中把 <code>usage</code> 清空以提前恢复。</p>
  <p class="dim">— 503 Service Unavailable</p>
</div></html>`;
  return new Response(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/* ---------------- 鉴权：不给钱也不能让陌生人来传 ---------------- */

/**
 * 两道门，按配置走：
 *   1. 配了 SUPABASE_URL → 校验 Authorization: Bearer <access_token>
 *   2. 没配 → 校验自定义头 x-upload-key 是否等于 UPLOAD_KEY
 * 两个都没配 → 直接拒绝（安全默认，避免变成公开上传盘）
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

/* ---------------- 定时同步真实用量 ---------------- */

async function syncUsage(env) {
  const u = await readUsage(env);
  // 注意：这里必须是 Date! 而不是 Time!，传进去的也得是 '2026-11-14' 这种纯日期。
  // 传带时分秒的 ISO 串会报 date format should be '2006-01-02'。
  // orderBy 里的 date 必须同时在 dimensions 里请求，否则会报「not aggregated nor a dimension」。
  const query = `query($tag:String!,$s:Date!,$e:Date!){
    viewer{accounts(filter:{accountTag:$tag}){
      r2StorageAdaptiveGroups(limit:1,filter:{date_geq:$s,date_leq:$e},orderBy:[date_DESC]){
        max{payloadSize metadataSize objectCount}
        dimensions{date}
      }
      r2OperationsAdaptiveGroups(limit:100,filter:{date_geq:$s,date_leq:$e}){
        sum{requests}
        dimensions{actionType}
      }
    }}
  }`;

  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const day = (d) => d.toISOString().slice(0, 10); // '2026-11-01'
  const body = JSON.stringify({
    query,
    variables: { tag: env.R2_ACCOUNT_ID, s: day(start), e: day(end) },
  });

  let ok = false;
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.CF_API_TOKEN}`,
      },
      body,
    });
    const data = await r.json();
    const acct = data?.data?.viewer?.accounts?.[0];
    if (acct) {
      const st = acct.r2StorageAdaptiveGroups?.[0]?.max;
      /* 【月度重置】
         R2 的免费额度是按自然月算的，Analytics 也按月清零。
         这里跟着重置一次，否则下面那个「只增不减」的记账会永远停在历史峰值，
         到了下个月 1 号站点还停在黑档起不来。 */
      const monthKey = new Date().toISOString().slice(0, 7);
      if (u.monthKey !== monthKey) {
        u.monthKey = monthKey;
        u.storage = 0;
        u.opsA = 0;
        u.opsB = 0;
        u.uploadPending = 0;
      }

      if (st) {
        /* 【为什么用 max 而不是直接覆盖】
           R2 的存储指标是按天聚合的，今天刚传的文件通常要到明天才出现在这里。
           如果直接覆盖，「已用空间」会在传完之后掉回昨天的旧值，
           于是又能继续传 —— 那就等于存储这道闸是虚的，
           一天之内把 10GB 传满也拦不住，正是最怕的情况。
           所以取「真实值」和「本地记账（已用 + 待确认）」里的较大者。
           代价：删掉文件后数字不会立刻回落，要等 Analytics 追上来。
           这是有意选的：宁可提前停服，也不要超额扣费。 */
        const real = (st.payloadSize || 0) + (st.metadataSize || 0);
        u.storage = Math.max(real, (u.storage || 0) + (u.uploadPending || 0));
      }
      let a = 0;
      let b = 0;
      for (const row of acct.r2OperationsAdaptiveGroups || []) {
        const t = row?.dimensions?.actionType || '';
        const n = row?.sum?.requests || 0;
        // A 类：写入 / 列举类；B 类：读取类。
        // 这里刻意用宽口径：Put / Copy / List / Delete / Create / Upload / Complete / Abort
        // 全部记到 A 类。A 类免费额度只有 100 万、B 类 1000 万，
        // 宁可把 B 类误算成 A 类（提前熔断），也不能把 A 类漏算（超了要扣钱）。
        if (/^(Put|Copy|List|Delete|Create|Upload|Complete|Abort)/i.test(t)) a += n;
        else b += n;
      }
      u.opsA = a;
      u.opsB = b;
      u.uploadPending = 0; // 上面已经并进 u.storage 了，这里清掉避免重复计算
      ok = true;
    }
  } catch (e) {
    // GraphQL 挂了就保留上一次的值，宁可保守
  }

  const st = levelOf(env, u);
  u.level = st.level;
  u.pct = st.pct;
  u.driver = st.driver;
  u.syncedOk = ok;
  await writeUsage(env, u);
  return u;
}

/* ---------------- 主入口 ---------------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const u = await readUsage(env);
    const st = levelOf(env, u);

    // 配额查询：随时打开看
    if (url.pathname === '/__quota') {
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
      }, 200);
    }

    // 黑档：整站停
    if (st.level === 'black') {
      if (url.pathname === '/presign') return json({ error: 'quota_exceeded', level: 'black' }, 503);
      return maintenancePage(st);
    }

    // 签发上传地址
    if (url.pathname === '/presign') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

      if (st.level === 'red') {
        return json({ error: 'quota_exceeded', level: 'red', message: '存储接近上限，已停止上传' }, 503);
      }

      const auth = await authorize(request, env);
      if (!auth.ok) {
        return json({ error: 'unauthorized', reason: auth.reason }, 401, cors);
      }

      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: 'bad_json' }, 400);
      }

      const size = Number(payload.size || 0);
      const name = String(payload.name || 'file');
      const limitMb = Number(env.MAX_UPLOAD_MB || 200);

      if (!size || size <= 0) return json({ error: 'size_required' }, 400);
      if (size > limitMb * MB) {
        return json({
          error: 'too_large',
          message: `单文件不能超过 ${limitMb}MB`,
          maxMB: limitMb,
        }, 413);
      }
      // 黄档：只放小文件（默认 20MB）
      if (st.level === 'yellow' && size > 20 * MB) {
        return json({
          error: 'quota_tight',
          level: 'yellow',
          message: '免费额度已用七成以上，暂只接受 20MB 以内的文件',
        }, 413);
      }

      // 关键：剩余空间装不下就拒
      const remain = st.lim.storageBytes - st.storage - u.uploadPending;
      if (size > remain) {
        return json({
          error: 'no_space',
          remainMB: Math.max(0, Math.floor(remain / MB)),
          message: '剩余免费空间不足',
        }, 507);
      }

      const ext = (name.match(/\.[a-z0-9]{1,8}$/i) || [''])[0].toLowerCase();
      const d = new Date();
      const key = `u/${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}${ext}`;

      const putUrl = await presignPut(env, key);

      // 先记账（保守）：传失败最多让额度提前一点被判定用完，不会超
      u.uploadPending += size;
      await writeUsage(env, u);

      return json({
        url: putUrl,
        key,
        publicUrl: `${env.PUBLIC_BASE || ''}/${key}`,
        expiresIn: 900,
        level: st.level,
      }, 200, cors);
    }

    // 读取/下载：走 R2 绑定，带边缘缓存
    if (request.method === 'GET' || request.method === 'HEAD') {
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (!key) return json({ error: 'not_found' }, 404);

      // 红档只挡「读次数超标」这一种，存储超标时读还是让读
      if (st.level === 'red' && st.driver === 'opsB') {
        return json({ error: 'quota_exceeded', message: '读取次数接近上限，已暂停访问' }, 503);
      }

      const cache = caches.default;
      const cacheKey = new Request(url.toString(), { method: 'GET' });
      const hit = await cache.match(cacheKey);
      if (hit) return hit;

      const obj = await env.MEDIA.get(key);
      if (!obj) return json({ error: 'not_found' }, 404);

      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      headers.set('cache-control', 'public, max-age=2592000, immutable');
      headers.set('access-control-allow-origin', env.ALLOW_ORIGIN || '*');

      const res = new Response(request.method === 'HEAD' ? null : obj.body, { headers });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }

    return json({ error: 'not_found' }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncUsage(env));
  },
};
