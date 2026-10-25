// js/upload.js — 媒体上传（两条路，自动选）
//   ① 配了 window.UPLOAD_API  → 走 Cloudflare R2：Worker 签预签名 PUT，文件直传 R2（支持 2GB）
//   ② 没配                     → 走 Supabase Storage 兜底：直传同名桶，单文件 50MB 上限（免费计划硬限制）
// 依赖：config.js、js/sb.js（取登录 token）
// 用法：MEDIA.upload(file, 'img' | 'audio' | 'video', pct => {...})  →  { url, key, size, backend }
//
// ★ 本文件出现的专有名词速查（更全的看 术语表.md）：
//   · IIFE —— (function(){ ... })()：写完立刻执行一次，变量不外泄。
//   · XMLHttpRequest (XHR) —— 发请求的老写法，但只有它能拿到「上传进度」事件。
//   · Promise / async / await —— 异步三件套：Promise 是「未来才有结果」的凭据，
//                                async 标明函数是异步的，await 是在这里等结果。
//   · MIME 类型 —— "video/mp4" 这种「文件是什么」的标识，服务器靠它判断怎么处理。
//   · CORS 跨域 —— 浏览器默认不准 A 站脚本读 B 站数据，除非 B 在响应头里明确允许。
//   · Token（JWT）—— 登录后服务器发的凭证，之后每次请求都带着，服务器凭它认人。
//   · 桶 bucket —— 对象存储里放文件的大文件夹，类似「云盘里的一个目录」。
//   · 预签名 URL —— 服务器临时签一个有时效的上传地址，客户端拿着它直接传存储，
//                    大文件不用经过自己的业务服务器。
//   · 三元运算 —— 条件 ? 成立的值 : 不成立的值。
//   · 正则 —— /\.([a-z0-9]{2,5})$/i 这种文字规则，match() 用来从文件名里抠扩展名。
(function () {                                     // 立即执行函数：对外只暴露 window.MEDIA 一个入口
  // R2 的上限
  const MAX_R2 = { img: 8 * 1024 * 1024, audio: 30 * 1024 * 1024, video: 2 * 1024 * 1024 * 1024 };   // 8MB / 30MB / 2GB（1024 进制，2GB = 2×1024×1024×1024 字节）
  // Supabase Storage 免费计划单文件 50MB，再大传不上去
  const MAX_SB = { img: 8 * 1024 * 1024, audio: 30 * 1024 * 1024, video: 50 * 1024 * 1024 };        // 同一个对象结构，只是视频上限降到 50MB
  const LABEL = { img: '图片', audio: '音频', video: '视频' };   // 类型的中文名，报错时给人看
  const CT_EXT = {                                  // MIME 类型 → 文件后缀的对照表
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg'
  };                                                // 结尾逗号允许存在，JS 不在意

  function fmt(n) {                                 // 字节数 → 人看得懂的大小
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + 'GB';                       // ≥1GB，保留 1 位小数
    if (n >= 1048576) return (n / 1048576).toFixed(n >= 104857600 ? 0 : 1) + 'MB';        // ≥1MB；超过 100MB 就不显示小数，免得字太长
    return Math.max(1, Math.round(n / 1024)) + 'KB';                                      // 其余按 KB，最小 1KB
  }
  function backend() { return window.UPLOAD_API ? 'r2' : 'storage'; }   // 有配置就走 R2，没配置退回 Supabase（一个三元的简写）
  function limitOf(kind) { return (backend() === 'r2' ? MAX_R2 : MAX_SB)[kind] || MAX_SB.img; }   // 取对应后端的该类型上限；类型不认识时按图片上限
  function extOf(file) {                            // 猜文件后缀（三层兜底）
    return CT_EXT[file.type]                                        // ① 按 MIME 查表（最准）
      || (String(file.name).match(/\.([a-z0-9]{2,5})$/i) || [])[1]  // ② 从文件名末尾抠扩展名，正则捕获组 [1] 就是括号里的内容
      || 'bin';                                                     // ③ 都猜不到就用 .bin
  }
  function keyOf(uid, kind, file) {                 // 生成「存到桶里叫什么名字」
    const rnd = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2)).slice(0, 8);   // 随机串：优先用浏览器自带 UUID，老浏览器退回随机数
    return `${uid}/${kind}/${Date.now()}-${rnd}.${extOf(file).toLowerCase()}`;   // 路径形如 1/video/1729800000-ab12cd34.mp4：按用户分目录、按类型分目录、加时间戳防重名
  }

  // 通用 PUT / POST 上传，带进度
  function send(method, url, file, headers, onProgress) {   // 用 XMLHttpRequest 而不是 fetch，因为只有 XHR 能拿到「上传进度」事件
    return new Promise((resolve, reject) => {       // 包成 Promise，外面就能 await
      const xhr = new XMLHttpRequest();             // 造一个请求对象
      xhr.open(method, url, true);                  // true = 异步（不卡住页面）
      Object.keys(headers).forEach(k => xhr.setRequestHeader(k, headers[k]));   // 把传进来的头一个个设上去
      xhr.upload.onprogress = e => {                // upload 上的 progress 事件：文件往上发的进度
        if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));   // 已发/总量 → 百分比
      };
      xhr.onload = () => {                          // 请求完成（不管成功失败都会进来）
        if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.responseText);   // 2xx 算成功
        let msg = xhr.responseText || '';           // 失败时尽量把服务器说的话带出来
        try { msg = JSON.parse(msg).message || msg; } catch { /* 原样用 */ }           // 服务器常返回 JSON，能解析就取 message 字段
        reject(new Error('上传失败（' + xhr.status + '）' + (msg ? '：' + String(msg).slice(0, 140) : '')));   // 截断到 140 字，免得弹窗炸屏
      };
      xhr.onerror = () => reject(new Error('上传中断：跨域或网络问题（存储桶的 CORS 没配好）'));   // 跨域被拦也走这里
      xhr.ontimeout = () => reject(new Error('上传超时'));
      xhr.send(file);                               // 真正把文件发出去（File 对象可以直接当请求体）
    });
  }

  async function uploadR2(file, kind, s, onProgress) {   // 路线①：R2 预签名直传（文件不经过自己的服务器）
    const r = await fetch(String(window.UPLOAD_API).replace(/\/$/, '') + '/presign', {   // 先找 Worker 要一个「临时上传许可」
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },   // 带上登录凭证，Worker 才肯签
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, kind })  // 告诉它要传什么、多大
    });
    const j = await r.json().catch(() => ({}));     // 解析返回；不是 JSON 就给个空对象，避免 JSON.parse 抛错
    if (!r.ok || !j.uploadUrl) throw new Error(j.error || ('签发失败 HTTP ' + r.status));   // 没拿到 uploadUrl 就没法继续
    await send('PUT', j.uploadUrl, file, { 'Content-Type': file.type || 'application/octet-stream' }, onProgress);   // 拿许可直接 PUT 到 R2，进度也在这里
    return { url: j.publicUrl, key: j.key, size: file.size, backend: 'r2' };   // 返回统一结构：公开地址、对象键、大小、用的哪个后端
  }

  async function uploadStorage(file, kind, s, onProgress) {   // 路线②：Supabase Storage 兜底
    const bucket = window.STORAGE_BUCKET || 'media';   // 桶名（Supabase 里提前建好的「文件夹」）
    const key = keyOf(s.user.id, kind, file);          // 用当前登录用户的 id 当一级目录
    const url = `${window.SUPABASE_URL}/storage/v1/object/${bucket}/${key}`;   // 上传接口地址
    await send('POST', url, file, {                    // Storage 用 POST 上传
      apikey: window.SUPABASE_ANON_KEY,                // 项目公开 key
      Authorization: 'Bearer ' + s.access_token,       // 用户身份 token（权限靠它判断）
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',                             // 不允许覆盖同名文件
      'cache-control': 'max-age=31536000'              // 让 CDN 缓存一年（31536000 秒），减少重复下载
    }, onProgress);
    const pub = `${window.SUPABASE_URL}/storage/v1/object/public/${bucket}/${key}`;   // 公开访问地址（桶必须是 public 才行）
    return { url: pub, key, size: file.size, backend: 'storage' };
  }

  async function upload(file, kind, onProgress) {     // 对外的总入口
    kind = LABEL[kind] ? kind : 'img';                // 类型不合法就默认当图片处理
    if (!file) throw new Error('没有选到文件');         // 没选文件直接报错，不往下走

    const max = limitOf(kind);                        // 当前后端允许的最大字节数
    if (file.size > max) {                            // 超限：提前拦下来，省得传一半失败
      const hint = backend() === 'storage' && kind === 'video'   // 视频超限时额外解释一句为什么（因为走的是兜底方案）
        ? '（当前走 Supabase Storage 兜底，免费计划单文件上限 50MB；R2 批下来就能传 2GB）'
        : '';
      throw new Error(`${LABEL[kind]} ${fmt(file.size)}，超过上限 ${fmt(max)}${hint}`);   // 模板字符串拼提示语
    }

    const s = window.SBAPI && await SBAPI.getSession();   // 取登录状态；SBAPI 不存在时就得到 false
    if (!s || !s.access_token) throw new Error('请先登录');   // 没登录不能传（上传接口要身份）

    return backend() === 'r2'                          // 最后按配置分流
      ? uploadR2(file, kind, s, onProgress)            // 有 R2 → 大文件走这条
      : uploadStorage(file, kind, s, onProgress);      // 没有 → Supabase Storage
  }

  window.MEDIA = { upload, fmt, backend, limitOf, MAX_R2, MAX_SB };   // 挂到全局，其他脚本直接调 MEDIA.upload(...)
})();
