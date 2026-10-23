// js/upload.js — 媒体上传（两条路，自动选）
//   ① 配了 window.UPLOAD_API  → 走 Cloudflare R2：Worker 签预签名 PUT，文件直传 R2（支持 2GB）
//   ② 没配                     → 走 Supabase Storage 兜底：直传同名桶，单文件 50MB 上限（免费计划硬限制）
// 依赖：config.js、js/sb.js（取登录 token）
// 用法：MEDIA.upload(file, 'img' | 'audio' | 'video', pct => {...})  →  { url, key, size, backend }
(function () {
  // R2 的上限
  const MAX_R2 = { img: 8 * 1024 * 1024, audio: 30 * 1024 * 1024, video: 2 * 1024 * 1024 * 1024 };
  // Supabase Storage 免费计划单文件 50MB，再大传不上去
  const MAX_SB = { img: 8 * 1024 * 1024, audio: 30 * 1024 * 1024, video: 50 * 1024 * 1024 };
  const LABEL = { img: '图片', audio: '音频', video: '视频' };
  const CT_EXT = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg'
  };

  function fmt(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + 'GB';
    if (n >= 1048576) return (n / 1048576).toFixed(n >= 104857600 ? 0 : 1) + 'MB';
    return Math.max(1, Math.round(n / 1024)) + 'KB';
  }
  function backend() { return window.UPLOAD_API ? 'r2' : 'storage'; }
  function limitOf(kind) { return (backend() === 'r2' ? MAX_R2 : MAX_SB)[kind] || MAX_SB.img; }
  function extOf(file) {
    return CT_EXT[file.type] || (String(file.name).match(/\.([a-z0-9]{2,5})$/i) || [])[1] || 'bin';
  }
  function keyOf(uid, kind, file) {
    const rnd = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2)).slice(0, 8);
    return `${uid}/${kind}/${Date.now()}-${rnd}.${extOf(file).toLowerCase()}`;
  }

  // 通用 PUT / POST 上传，带进度
  function send(method, url, file, headers, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      Object.keys(headers).forEach(k => xhr.setRequestHeader(k, headers[k]));
      xhr.upload.onprogress = e => {
        if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.responseText);
        let msg = xhr.responseText || '';
        try { msg = JSON.parse(msg).message || msg; } catch { /* 原样用 */ }
        reject(new Error('上传失败（' + xhr.status + '）' + (msg ? '：' + String(msg).slice(0, 140) : '')));
      };
      xhr.onerror = () => reject(new Error('上传中断：跨域或网络问题（存储桶的 CORS 没配好）'));
      xhr.ontimeout = () => reject(new Error('上传超时'));
      xhr.send(file);
    });
  }

  async function uploadR2(file, kind, s, onProgress) {
    const r = await fetch(String(window.UPLOAD_API).replace(/\/$/, '') + '/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, kind })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.uploadUrl) throw new Error(j.error || ('签发失败 HTTP ' + r.status));
    await send('PUT', j.uploadUrl, file, { 'Content-Type': file.type || 'application/octet-stream' }, onProgress);
    return { url: j.publicUrl, key: j.key, size: file.size, backend: 'r2' };
  }

  async function uploadStorage(file, kind, s, onProgress) {
    const bucket = window.STORAGE_BUCKET || 'media';
    const key = keyOf(s.user.id, kind, file);
    const url = `${window.SUPABASE_URL}/storage/v1/object/${bucket}/${key}`;
    await send('POST', url, file, {
      apikey: window.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + s.access_token,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',
      'cache-control': 'max-age=31536000'
    }, onProgress);
    const pub = `${window.SUPABASE_URL}/storage/v1/object/public/${bucket}/${key}`;
    return { url: pub, key, size: file.size, backend: 'storage' };
  }

  async function upload(file, kind, onProgress) {
    kind = LABEL[kind] ? kind : 'img';
    if (!file) throw new Error('没有选到文件');

    const max = limitOf(kind);
    if (file.size > max) {
      const hint = backend() === 'storage' && kind === 'video'
        ? '（当前走 Supabase Storage 兜底，免费计划单文件上限 50MB；R2 批下来就能传 2GB）'
        : '';
      throw new Error(`${LABEL[kind]} ${fmt(file.size)}，超过上限 ${fmt(max)}${hint}`);
    }

    const s = window.SBAPI && await SBAPI.getSession();
    if (!s || !s.access_token) throw new Error('请先登录');

    return backend() === 'r2'
      ? uploadR2(file, kind, s, onProgress)
      : uploadStorage(file, kind, s, onProgress);
  }

  window.MEDIA = { upload, fmt, backend, limitOf, MAX_R2, MAX_SB };
})();
