/* ============================================================
   背景层 + 背景视频导入
   ------------------------------------------------------------
   用法（三选一，优先级从高到低）：
     1) 网址带 ?bg=https://xxx.mp4      —— 临时预览，会记住
     2) 齿轮菜单 →「选本地文件」        —— 存进本浏览器，只有自己看得到
     3) js/config.js 里 window.BG_VIDEO —— 全站默认（所有人都能看到）
   都没有 → 只用极光玻璃背景，同样好看，零流量。

   ★ 为什么「选本地文件」是安全的（不违反 Cloudflare 条款）：
     视频文件存在你自己浏览器的 IndexedDB 里，播放时由浏览器从本地磁盘读，
     一个字节都不经过 Cloudflare。别人访问你的站，他们浏览器里没有这个文件，
     于是自动退回极光背景 —— 他们看不到，也不产生任何 CDN 流量。
     Cloudflare 的条款限制的是「用它的网络分发视频」，而不是「页面上有没有视频」。
     所以：本地文件 = 合规且零流量；传到 Pages/R2 之外的任何免费直链 = 违规。
   ============================================================ */
(function () {
  'use strict';

  var LS_KEY = 'site.bg.video';

  /* ============ IndexedDB：把本地视频存进浏览器（只在这台设备、这个浏览器可见）============
     localStorage 只能存 5MB 左右，视频根本放不下，所以用 IndexedDB（配额通常几百 MB 甚至更多）。*/
  var DB_NAME = 'site.bg.db';
  var STORE = 'files';
  var REC_KEY = 'current';

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('浏览器不支持 IndexedDB'));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  /* 读回存过的视频记录：{ name, size, type, blob, t } */
  function idbGet() {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(REC_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }
  function idbPut(rec) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec, REC_KEY);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbDel() {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(REC_KEY);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { return false; });
  }
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
  var objUrl = '';   // 当前正在播放的本地 blob 地址，换片/卸载时要释放，否则占内存

  function releaseObj(keep) {
    if (objUrl && objUrl !== keep) {
      try { URL.revokeObjectURL(objUrl); } catch (e) { /* 忽略 */ }
      objUrl = '';
    }
  }

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

  /* 读取网址参数里的 ?bg= 值（没写返回 null，写成空也算没写） */
  function pickParam() {
    try {
      var q = new URLSearchParams(location.search).get('bg');
      return q || null;
    } catch (e) { return null; }
  }

  function mountVideo(src, isBlob) {
    releaseObj(src);            // 先释放上一段本地 blob，避免内存越用越多
    if (video) { video.remove(); video = null; }
    veil.style.display = 'none';
    if (!src) return;
    if (isBlob) objUrl = src;

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
  function fmtSize(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    return Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function openDialog() {
    var old = document.getElementById('bgDlg');
    if (old) old.remove();

    var cur = readSaved();
    var dlg = document.createElement('div');
    dlg.id = 'bgDlg';
    dlg.className = 'generic-modal show';
    dlg.innerHTML =
      '<div class="generic-box" style="width:500px">' +
        '<button class="generic-close" type="button" aria-label="关闭">×</button>' +
        '<h3 class="generic-title">背景视频</h3>' +
        '<div class="generic-body">' +
          '<p style="font-size:13px;color:var(--text-light);line-height:1.7;margin-bottom:14px">' +
            '铺满整页、自动循环、静音播放。留空就是默认的极光玻璃背景。' +
          '</p>' +

          /* —— 推荐方式：本地文件存进浏览器 —— */
          '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px">' +
            '<div style="font-size:14px;font-weight:600;margin-bottom:4px">本机视频（推荐 · 别人看不到）</div>' +
            '<p style="font-size:12px;color:var(--text-light);line-height:1.6;margin:0 0 8px">' +
              '文件存在你这个浏览器的 IndexedDB 里，不经过任何服务器，<b>零流量</b>。' +
              '刷新后依然有效；换设备或换浏览器就没有了。' +
            '</p>' +
            /* 浏览器按「域名」隔离存储：localhost 存的，pages.dev 看不到。先讲清楚免得以为没生效 */
            '<p style="font-size:12px;color:#FFB020;line-height:1.6;margin:0 0 10px">' +
              '只在当前域名生效：<b>' + esc(location.host || location.hostname) + '</b>' +
              '　其它域名 / 换端口都要重新选一次。' +
            '</p>' +
            '<p id="bgLocalInfo" style="font-size:12.5px;margin:0 0 10px;color:var(--text-light)">读取中…</p>' +
            '<label class="log-submit" style="display:inline-flex;align-items:center;cursor:pointer">' +
              '选一个视频文件' +
              '<input id="bgFile" type="file" accept="video/mp4,video/webm,video/*" style="display:none">' +
            '</label>' +
          '</div>' +

          /* —— 次要方式：直链（会经过网络，可能踩条款） —— */
          '<label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px">' +
            '视频直链（mp4 / webm，会占用托管流量）' +
          '</label>' +
          '<input class="login-input" id="bgUrl" type="url" placeholder="https://…/bg.mp4" value="' + esc(cur) + '">' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
            '<button class="log-submit" id="bgApply" type="button">应用直链</button>' +
            '<button class="log-cancel" id="bgClear" type="button">全部清除</button>' +
          '</div>' +

          '<p id="bgMsg" style="font-size:12.5px;color:var(--text-light);margin-top:12px;line-height:1.6">' +
            '提示：直链视频由 Cloudflare 分发，占流量、且大规模视频会违反其条款；自己看请用上面的本机文件。' +
          '</p>' +
        '</div>' +
      '</div>';

    document.body.appendChild(dlg);

    var urlEl = dlg.querySelector('#bgUrl');
    var msgEl = dlg.querySelector('#bgMsg');
    var fileEl = dlg.querySelector('#bgFile');
    var infoEl = dlg.querySelector('#bgLocalInfo');

    /* 显示当前存在浏览器里的本地视频 */
    idbGet().then(function (rec) {
      if (!infoEl) return;
      if (rec && rec.blob) {
        infoEl.innerHTML = '当前已存：<b style="color:var(--primary)">' + esc(rec.name) +
          '</b>（' + fmtSize(rec.size || rec.blob.size) + '）';
      } else {
        infoEl.textContent = '当前没有存本地视频。';
      }
    });

    function close() { dlg.remove(); }
    dlg.querySelector('.generic-close').addEventListener('click', close);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });

    /* 应用直链 */
    dlg.querySelector('#bgApply').addEventListener('click', function () {
      var u = urlEl.value.trim();
      saveUrl(u);
      mountVideo(u);
      msgEl.textContent = u ? '直链已应用 ✓（会占用托管流量）' : '已恢复极光背景 ✓';
      setTimeout(close, 600);
    });

    /* 全部清除：直链 + 本机文件一起清掉 */
    dlg.querySelector('#bgClear').addEventListener('click', function () {
      saveUrl('');
      urlEl.value = '';
      mountVideo('');
      idbDel().then(function () {
        if (infoEl) infoEl.textContent = '当前没有存本地视频。';
        msgEl.textContent = '已全部清除，恢复极光背景 ✓';
      });
    });

    /* 选本地文件 → 存进 IndexedDB，刷新后仍在，别人看不到 */
    fileEl.addEventListener('change', function () {
      var f = fileEl.files && fileEl.files[0];
      if (!f) return;

      if (!/^video\//.test(f.type)) {
        msgEl.textContent = '这个文件不是视频，换一个（mp4 / webm）。';
        return;
      }
      msgEl.textContent = '正在存入本浏览器…';

      idbPut({
        name: f.name,
        size: f.size,
        type: f.type,
        blob: f,
        t: Date.now()
      }).then(function () {
        mountVideo(URL.createObjectURL(f), true);
        if (infoEl) {
          infoEl.innerHTML = '当前已存：<b style="color:var(--primary)">' + esc(f.name) +
            '</b>（' + fmtSize(f.size) + '）';
        }
        msgEl.textContent = '已存入本浏览器 ✓ 刷新后仍然生效，只有这台设备能看到，不产生任何 CDN 流量。';
        if (f.size > 80 * 1024 * 1024) {
          msgEl.textContent += ' （文件偏大，首次加载会慢几秒）';
        }
      }).catch(function (err) {
        msgEl.textContent = '存不进去：' + ((err && err.message) || err) + '。可能是浏览器空间不足。';
      });
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

  /* 启动：按优先级找一个背景视频挂上去。
     顺序 = 网址参数 > 本机存的本地文件 > 存过的直链 > config 里的全站默认 > 极光 */
  function boot() {
    var q = pickParam();

    // ① ?bg=xxx 临时指定
    if (q === 'off') {
      // off = 彻底关掉（清直链 + 清本机文件），恢复极光
      saveUrl('');
      idbDel().then(function () { mountVideo(''); afterBoot(); });
      return;
    }
    if (q) {
      saveUrl(q);              // 记住，下次不带参数也用
      mountVideo(q);
      afterBoot();
      return;
    }

    // ② 先看本机有没有存过本地视频（只有自己这台设备能看到）
    idbGet().then(function (rec) {
      if (rec && rec.blob) {
        mountVideo(URL.createObjectURL(rec.blob), true);
        return;
      }
      // ③ 直链 → ④ config 全站默认 → ⑤ 极光
      mountVideo(readSaved() || (typeof window.BG_VIDEO === 'string' ? window.BG_VIDEO.trim() : ''));
    }).then(afterBoot);
  }

  /* 挂完视频后再去插齿轮菜单入口 */
  function afterBoot() {
    if (injectMenuItem()) return;
    var n = 0;
    var timer = setInterval(function () {
      if (injectMenuItem() || ++n > 40) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 让别处也能调用（例如 config 里想动态换）
  window.BgVideo = { open: openDialog, set: function (u) { saveUrl(u || ''); mountVideo(u || ''); } };
})();
