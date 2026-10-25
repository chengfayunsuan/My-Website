/* ============================================================
   文件：functions/sb/[[path]].js（边缘函数：/sb 反向代理）
   作用：部署在 Cloudflare Pages 上。把 /sb/xxx 的请求原样转发到真正的 Supabase 地址，
        等于给后端套一层「同域名的壳」，绕开跨域限制、也绕开国内直连 Supabase 的 TLS 失败。
   ------------------------------------------------------------
   ★ 这个文件跑在 Cloudflare 的服务器上，不在你电脑、也不在访客浏览器里。
   ★ 文件名里的 [[path]] 是 Cloudflare 的约定：它代表「/sb/ 后面任意多段路径」，
     并会把这些路径放进 params.path 里交给你。
   ★ 本文件出现的专有名词：
     · export —— 把这个函数「导出」给 Cloudflare 调用（模块化写法）。
     · async —— 异步函数，里面可以用 await。
     · 解构 const { request, params } = context —— 从对象里一次取出两个字段。
     · Set —— 一种「不重复的集合」，用来做「这个头要不要扔掉」的快速判断。
     · Headers / Request / Response —— 浏览器和边缘函数通用的三个网络对象。
     · 502 —— 状态码：网关错误（我作为中间人，没能从上家拿到结果）。
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
// 【const】真正的目标地址（上游）。注意要和 js/config.js 里的 SB_UPSTREAM 保持一致，
// 否则会出现「前端以为在跟 A 说话，代理却转给了 B」的怪问题。

// 这些头不能在边缘 fetch 里原样带过去
const DROP = new Set([
// 【const】【new Set】创建集合。集合和数组很像，但判断「有没有这个值」更快，正好用来做排除名单。
  'host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade',
  // host：目标站看到 host 是自己才正常，不能带原来的；
  // connection / keep-alive / transfer-encoding / upgrade：这些是「连接层」的头，
  //   代理转发时会重新建立连接，带着会冲突。
  'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cf-worker',
  'x-forwarded-proto', 'x-real-ip', 'accept-encoding'
  // 前面几个是 Cloudflare 自己的头，不该传给上游；
  // accept-encoding 去掉是因为边缘会自己解压/压缩，带着会导致响应头对不上。
]);

export async function onRequest(context) {
// 【export】把 onRequest 导出 —— Cloudflare 规定：页面目录下的函数文件要导出这个名字，
// 每次有请求进来，它就会调用这个函数。
// 【async】因为里面要 await 网络请求。
// context 是 Cloudflare 递进来的「上下文对象」，里面装着这次请求的各种信息。
  const { request, params } = context;
  // 【解构赋值】从 context 里一次取出两个字段：
  //   request = 这次请求（方法、网址、头、body 都在里面）
  //   params  = 路径参数，这里会有 params.path

  const url = new URL(request.url);
  // 【new URL】把网址字符串解析成对象，方便取 .search（问号后面那串参数）等部分。
  const seg = params.path;
  // 【const】[[path]] 捕获到的部分。可能是一段字符串，也可能是数组（多段路径时）。
  const sub = Array.isArray(seg) ? seg.join('/') : (seg || '');
  // 【三元】是数组就用 '/' 拼回去（['rest','v1','post'] → 'rest/v1/post'）；
  // 不是数组就用它本身；都没有就给空字符串。
  // 【join】把数组用指定字符连接成一个字符串。

  // 去掉 /sb 前缀，拼回 Supabase 的真实路径
  const target = UPSTREAM + '/' + sub + url.search;
  // 【const】拼出最终地址：上游域名 + 路径 + 原来的查询参数。
  // 例如 /sb/rest/v1/posts?select=*  →  https://xxx.supabase.co/rest/v1/posts?select=*

  const headers = new Headers();
  // 【new Headers】创建一个空的「请求头容器」。
  for (const [k, v] of request.headers) {
    // 【for...of】遍历。这里有个技巧：request.headers 遍历出来的是「键值对数组」，
    // 所以用 [k, v] 解构，一次拿到头名和头值。
    if (!DROP.has(k.toLowerCase())) headers.set(k, v);
    // 【if】不在排除名单里才转发（toLowerCase 统一小写再比对，避免大小写不一致漏掉）。
  }

  const init = {
  // 【const】准备 fetch 的参数对象。
    method: request.method,
    // 方法原样带过去：GET / POST / PATCH / DELETE 都要保留，否则写操作会变成读操作。
    headers,
    // 上面筛选过的头。
    redirect: 'follow'
    // 如果上游回 301/302，就让 fetch 自己跟着跳转，不把跳转原样丢给浏览器。
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
  // 【if】GET 和 HEAD 是没有 body 的，只有其他方法才需要把请求体带上。
    init.body = request.body;
    // body 是「流」，直接传引用就行，不用读进内存 —— 上传大文件也扛得住。
  }

  let res;
  // 【let】等下要存上游的响应。
  try {
    res = await fetch(target, init);
    // 【await】【fetch】真正发出请求，等上游（Supabase）回应。
  } catch (e) {
  // 【catch】网络层直接失败（上游挂了、DNS 出错等）会走到这里。
    return new Response(JSON.stringify({
    // 【return】【new Response】造一个响应返回给浏览器。
    // JSON.stringify 把对象转成 JSON 字符串 —— 响应体必须是字符串或流。
      error: 'proxy_failed',
      message: String((e && e.message) || e)
      // 把错误信息带出来，方便你在控制台看到到底为什么失败。
    }), { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } });
    // 502 = 网关错误：我作为中间人没能从上家拿到结果。
  }

  const out = new Headers(res.headers);
  // 【const】复制一份上游的响应头（不能直接改原始的）。
  // 边缘已解压，这两个头留着会让浏览器解析失败
  out.delete('content-encoding');
  out.delete('content-length');
  // 为什么要删？
  // 上游可能返回了「我用 gzip 压缩了，长度是 1234」。但 Cloudflare 边缘已经帮你解压了，
  // 如果还把这两个头原样给浏览器，浏览器就会按压缩格式去解压一段已经解压过的数据 → 直接报错。

  return new Response(res.body, {
  // 【return】把上游的响应体原样返回（res.body 是流，边收边发，不占内存）。
    status: res.status,
    // 状态码照抄：200 / 201 / 400 / 401 都要原样给浏览器，前端才能正确判断成功失败。
    statusText: res.statusText,
    headers: out
    // 上面清理过的响应头。
  });
}
