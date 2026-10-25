/* ============================================================
   文件：functions/sb/[[path]].js（边缘函数：/sb 反向代理）
   作用：部署在 Cloudflare Pages 上。把 /sb/xxx 的请求转发到后端真实地址，等于给后端套一层同域名的壳，绕开跨域限制。
   ============================================================ */

// functions/sb/[[path]].js
// Cloudflare Pages Function：把 /sb/* 同域反代到 Supabase。
//
// 为什么要有它：国内直连 *.supabase.co 会被 TLS 中断（DNS 正常，握手失败），
// 浏览器里所有数据请求都失败 → 页面空、封面裂、换浏览器一篇不剩。
// 走这里以后，浏览器只访问 chengfa-761.pages.dev（Cloudflare 可达），
// 真正的 Supabase 请求由 Cloudflare 边缘发起，绕开本地网络。
//
// 前端把 window.SUPABASE_URL 设成 location.origin + '/sb' 即可，其余代码不用改。

const UPSTREAM = 'https://masgzimdndyewzpagrmd.supabase.co';

// 这些头不能在边缘 fetch 里原样带过去
const DROP = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade',
  'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cf-worker',
  'x-forwarded-proto', 'x-real-ip', 'accept-encoding'
]);

export async function onRequest(context) {
  const { request, params } = context;

  const url = new URL(request.url);
  const seg = params.path;
  const sub = Array.isArray(seg) ? seg.join('/') : (seg || '');

  // 去掉 /sb 前缀，拼回 Supabase 的真实路径
  const target = UPSTREAM + '/' + sub + url.search;

  const headers = new Headers();
  for (const [k, v] of request.headers) {
    if (!DROP.has(k.toLowerCase())) headers.set(k, v);
  }

  const init = {
    method: request.method,
    headers,
    redirect: 'follow'
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  let res;
  try {
    res = await fetch(target, init);
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'proxy_failed',
      message: String((e && e.message) || e)
    }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  const out = new Headers(res.headers);
  // 边缘已解压，这两个头留着会让浏览器解析失败
  out.delete('content-encoding');
  out.delete('content-length');

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: out
  });
}
