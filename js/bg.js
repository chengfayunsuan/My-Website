/* ============================================================
   背景层 + 背景视频导入
   ------------------------------------------------------------
   用法（三选一，优先级从高到低）：
     1) 网址带 ?bg=https://xxx.mp4      —— 临时预览，会记住
     2) 齿轮菜单 →「背景视频」自己导入 —— 存在浏览器里
     3) js/config.js 里 window.BG_VIDEO —— 全站默认（推荐）
   都没有 → 只用极光玻璃背景，同样好看，零流量。
   ============================================================ */
(function () {
  'use strict';

  var LS_KEY = 'site.bg.video';
  var root = document.createElement('div');
  root.id = 'site-bg';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML =
    '<div class="aurora a1"></div>' +
    '<div class="aurora a2"></div>' +
    '<div class="aurora a3"></div>' +
    '<div class="noise"></div>';
  // 尽量插到 body 的第一个位置，保证在所有内容之下
  (document.body || document.documentElement).insertBefore(root, document.body ? document.body.firstChild : null);

  var veil = document.createElement('div');
  veil.className = 'veil';
  veil.style.display = 'none';
  root.appendChild(veil);

  var video = null;

  function readSaved() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return '';
      var o = JSON.parse(raw);
      return (o && typeof o.url === 'string') ? o.url : '';
    } catch (e) { return ''; }
  }
  function saveUrl(u) {
    try {
      if (u) localStorage.setItem(LS_KEY, JSON.stringify({ url: u, t: Date.now() }));
      else localStorage.removeItem(LS_KEY);
    } catch (e) { /* 隐私模式存不了就算了 */ }
  }

  /* 当前应该用的视频地址 */
  function pickSrc() {
    // 1) 网址参数（临时预览）
    try {
      var q = new URLSearchParams(location.search).get('bg');
      if (q) {
        if (q === 'off') { saveUrl(''); return ''; }
        saveUrl(q);
        return q;
      }
    } catch (e) { /* 老浏览器 */ }
    // 2) 本地保存的
    var saved = readSaved();
    if (saved) return saved;
    // 3) config.js 里的全局默认
    if (typeof window.BG_VIDEO === 'string' && window.BG_VIDEO.trim()) return window.BG_VIDEO.trim();
    // 否则只用极光（不额外发请求，页面更快）
    return '';
  }

  function mountVideo(src) {
    if (video) { video.remove(); video = null; }
    veil.style.display = 'none';
    if (!src) return;

    var v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    v.src = src;

    // 加载失败（文件不存在 / 跨域被挡 / 编码不支持）→ 静默退回极光，不弹错
    v.addEventListener('error', function () {
      if (video === v) { v.remove(); video = null; veil.style.display = 'none'; }
    });
    v.addEventListener('loadeddata', function () {
      veil.style.display = 'block';
      root.insertBefore(v, veil);
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* 某些浏览器需要交互才播，静默 */ });
    });
    video = v;
  }

  /* ============ 弹窗：导入背景视频 ============ */
  function openDialog() {
    var old = document.getElementById('bgDlg');
    if (old) old.remove();

    var cur = readSaved() || (typeof window.BG_VIDEO === 'string' ? window.BG_VIDEO : '');
    var dlg = document.createElement('div');
    dlg.id = 'bgDlg';
    dlg.className = 'generic-modal show';
    dlg.innerHTML =
      '<div class="generic-box" style="width:460px">' +
        '<button class="generic-close" type="button" aria-label="关闭">×</button>' +
        '<h3 class="generic-title">背景视频</h3>' +
        '<div class="generic-body">' +
          '<p style="font-size:13px;color:var(--text-light);line-height:1.7;margin-bottom:12px">' +
            '视频会铺满整页、自动循环、静音播放。留空就是默认的极光玻璃背景。' +
          '</p>' +
          '<label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px">视频直链（mp4 / webm）</label>' +
          '<input class="login-input" id="bgUrl" type="url" placeholder="https://…/bg.mp4" value="' + String(cur).replace(/"/g, '&quot;') + '">' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">' +
            '<button class="log-submit" id="bgApply" type="button">应用</button>' +
            '<button class="log-cancel" id="bgClear" type="button">清除</button>' +
            '<label class="log-cancel" id="bgPick" style="display:inline-flex;align-items:center;cursor:pointer">选本地文件' +
              '<input id="bgFile" type="file" accept="video/mp4,video/webm,video/*" style="display:none">' +
            '</label>' +
          '</div>' +
          '<p id="bgMsg" style="font-size:13px;color:var(--text-light);margin-top:10px;line-height:1.6">' +
            '提示：本地文件只在本浏览器本次有效。要全站长期生效，请把视频传到存储（或任意直链）后填上面的地址。' +
          '</p>' +
        '</div>' +
      '</div>';

    document.body.appendChild(dlg);

    var urlEl = dlg.querySelector('#bgUrl');
    var msgEl = dlg.querySelector('#bgMsg');
    var fileEl = dlg.querySelector('#bgFile');

    function close() { dlg.remove(); }
    dlg.querySelector('.generic-close').addEventListener('click', close);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });

    dlg.querySelector('#bgApply').addEventListener('click', function () {
      var u = urlEl.value.trim();
      saveUrl(u);
      mountVideo(u);
      msgEl.textContent = u ? '已应用 ✓' : '已恢复极光背景 ✓';
      setTimeout(close, 500);
    });

    dlg.querySelector('#bgClear').addEventListener('click', function () {
      saveUrl('');
      urlEl.value = '';
      mountVideo('');
      msgEl.textContent = '已清除 ✓';
    });

    fileEl.addEventListener('change', function () {
      var f = fileEl.files && fileEl.files[0];
      if (!f) return;
      // 本地预览：不写入存储（刷新就没了），只做临时效果
      var blobUrl = URL.createObjectURL(f);
      mountVideo(blobUrl);
      msgEl.textContent = '本地预览中（' + (f.size / 1048576).toFixed(1) + ' MB）。刷新后失效，要长期用请填直链。';
      if (f.size > 25 * 1024 * 1024) {
        msgEl.textContent += ' 注意：超过 25MB 的文件不能直接放在 Cloudflare Pages 上。';
      }
    });
  }

  /* 把入口挂进齿轮菜单（菜单由 nav.js 生成，等它渲染完） */
  function injectMenuItem() {
    var menu = document.getElementById('gearMenu');
    if (!menu) return false;
    if (menu.querySelector('#gearBgVideo')) return true;
    var a = document.createElement('a');
    a.className = 'gear-item';
    a.id = 'gearBgVideo';
    a.href = 'javascript:;';
    a.textContent = '背景视频';
    a.addEventListener('click', function (e) {
      e.preventDefault();
      menu.classList.remove('show');
      openDialog();
    });
    menu.appendChild(a);
    return true;
  }

  function boot() {
    mountVideo(pickSrc());
    if (!injectMenuItem()) {
      var n = 0;
      var timer = setInterval(function () {
        if (injectMenuItem() || ++n > 40) clearInterval(timer);
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 让别处也能调用（例如 config 里想动态换）
  window.BgVideo = { open: openDialog, set: function (u) { saveUrl(u || ''); mountVideo(u || ''); } };
})();
