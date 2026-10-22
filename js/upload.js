// js/upload.js — 媒体上传（R2 直传，经 Cloudflare Worker 签发预签名地址）
// 依赖：config.js 的 window.UPLOAD_API（Worker 地址）、js/sb.js 的 window.SBAPI（取登录 token）
// 用法：MEDIA.upload(file, 'img' | 'audio' | 'video', pct => {...})  →  { url, key, size }
(function () {
  const MAX = { img: 8 * 1024 * 1024, audio: 30 * 1024 * 1024, video: 2 * 1024 * 1024 * 1024 };
  const LABEL = { img: '图片', audio: '音频', video: '视频' };

  function fmt(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(n >= 104857600 ? 0 : 1) + 'MB';
    return Math.max(1, Math.round(n / 1024)) + 'KB';
  }

  function put(url, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('R2 返回 ' + xhr.status + (xhr.responseText ? '：' + xhr.responseText.slice(0, 120) : ''))));
      xhr.onerror = () => reject(new Error('上传中断（网络或 R2 的 CORS 没配好）'));
      xhr.ontimeout = () => reject(new Error('上传超时'));
      xhr.send(file);
    });
  }

  async function upload(file, kind, onProgress) {
    kind = MAX[kind] ? kind : 'img';
    if (!file) throw new Error('没有选到文件');
    if (!window.UPLOAD_API) throw new Error('上传服务未配置：js/config.js 里的 UPLOAD_API 还空着');
    if (file.size > MAX[kind]) throw new Error(`${LABEL[kind]} ${fmt(file.size)}，超过上限 ${fmt(MAX[kind])}`);

    const s = window.SBAPI && await SBAPI.getSession();
    if (!s || !s.access_token) throw new Error('请先登录');

    const r = await fetch(String(window.UPLOAD_API).replace(/\/$/, '') + '/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, kind })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.uploadUrl) throw new Error(j.error || ('签发失败 HTTP ' + r.status));

    await put(j.uploadUrl, file, onProgress);
    return { url: j.publicUrl, key: j.key, size: file.size };
  }

  window.MEDIA = { upload, fmt, MAX };
})();
