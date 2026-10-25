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
(function () {                                    // 立即执行函数：所有变量都关在这个小房间里，不污染全局
  'use strict';                                   // 严格模式：把一些「写了但没报错」的坏习惯变成明确报错，帮你早发现 bug

  var LS_KEY = 'site.bg.video';                   // localStorage 的键名（存「直链」用；直链不是大文件，几十字节，localStorage 够用）

  /* ============ IndexedDB：把本地视频存进浏览器（只在这台设备、这个浏览器可见）============
     localStorage 只能存 5MB 左右，视频根本放不下，所以用 IndexedDB（配额通常几百 MB 甚至更多）。*/
  var DB_NAME = 'site.bg.db';                     // 数据库名字
  var STORE = 'files';                            // 数据库里的「表」名（IndexedDB 叫 object store）
  var REC_KEY = 'current';                        // 只存一条记录，键名固定叫 current，相当于「当前这个视频」

  function idbOpen() {                            // 打开数据库，返回一个 Promise（异步结果）
    return new Promise(function (resolve, reject) {   // Promise：未来某个时刻会得到结果，成功调 resolve，失败调 reject
      if (!window.indexedDB) return reject(new Error('浏览器不支持 IndexedDB'));   // 极老的浏览器才会没有
      var req = indexedDB.open(DB_NAME, 1);       // 打开数据库；第二个参数 1 是版本号，只有第一次创建时才用得上
      req.onupgradeneeded = function () {         // 数据库第一次创建（或版本号变大）时触发，用来建表
        var db = req.result;                      // req.result 就是数据库对象
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);   // 表不存在才创建，避免重复建表报错
      };
      req.onsuccess = function () { resolve(req.result); };   // 打开成功：把数据库对象交出去
      req.onerror = function () { reject(req.error); };       // 打开失败：把错误交出去
    });
  }
  /* 读回存过的视频记录：{ name, size, type, blob, t } */
  function idbGet() {                             // 取出 current 那条记录
    return idbOpen().then(function (db) {         // then：等上面的 Promise 成功后再做下一步
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');    // 开一个只读事务（IndexedDB 的读写都必须包在事务里）
        var req = tx.objectStore(STORE).get(REC_KEY);  // 按键取值
        req.onsuccess = function () { resolve(req.result || null); };   // 没存过时 result 是 undefined，统一成 null
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });       // 任何一步出错都当成「没有」处理，不让页面崩
  }
  function idbPut(rec) {                          // 写入 / 覆盖 current 记录
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');   // 这次要写，所以是 readwrite
        tx.objectStore(STORE).put(rec, REC_KEY);       // put = 有就覆盖、没有就新建
        tx.oncomplete = function () { resolve(true); };   // 事务提交成功（数据真正落盘）
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbDel() {                             // 删掉 current 记录（清空本地视频）
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(REC_KEY);    // delete 按键删除
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { return false; });      // 删不掉也不报错
  }
  var root = document.createElement('div');       // 造一个全屏容器，专门放背景（视频 / 极光）
  root.id = 'site-bg';                            // id 对应 style.css 里的 #site-bg（position:fixed; z-index:-2）
  root.setAttribute('aria-hidden', 'true');       // 告诉读屏软件：这层是纯装饰，不用朗读
  root.innerHTML =                                // 先塞几个空 div，极光效果就是靠它们（CSS 里 .aurora 默认 display:none，Local 风格不用）
    '<div class="aurora a1"></div>' +
    '<div class="aurora a2"></div>' +
    '<div class="aurora a3"></div>' +
    '<div class="noise"></div>';
  // 尽量插到 body 的第一个位置，保证在所有内容之下
  (document.body || document.documentElement).insertBefore(root, document.body ? document.body.firstChild : null);   // 三元：body 还没生成时退而挂到 html 上

  var veil = document.createElement('div');       // 暗幕层（压一层黑让文字更清楚）
  veil.className = 'veil';
  veil.style.display = 'none';                    // 默认不显示（CSS 里也是 display:none，Local 风格不压暗）
  root.appendChild(veil);                         // 挂进背景容器

  var video = null;                                // 当前正在播放的 <video> 元素（没有就是 null）
  var objUrl = '';   // 当前正在播放的本地 blob 地址，换片/卸载时要释放，否则占内存

  function releaseObj(keep) {                      // 释放旧的 blob 地址（keep = 这次要留着用的那个，不释放）
    if (objUrl && objUrl !== keep) {               // 有旧地址、且不是这次要用的
      try { URL.revokeObjectURL(objUrl); } catch (e) { /* 忽略 */ }   // blob: 地址是浏览器内存里的临时地址，用完必须手动释放
      objUrl = '';                                 // 清空记录
    }
  }

  function readSaved() {                           // 读出存过的「直链」地址
    try {
      var raw = localStorage.getItem(LS_KEY);      // localStorage 只能存字符串，所以存的时候是 JSON
      if (!raw) return '';                         // 没存过 → 空字符串
      var o = JSON.parse(raw);                     // JSON.parse：字符串 → 对象
      return (o && typeof o.url === 'string') ? o.url : '';   // 结构不对就返回空，防止旧数据把人坑了
    } catch (e) { return ''; }                     // JSON 坏了也不崩
  }
  function saveUrl(u) {                            // 保存 / 清除直链
    try {
      if (u) localStorage.setItem(LS_KEY, JSON.stringify({ url: u, t: Date.now() }));   // 存地址 + 时间戳（t 只是留个记录，方便以后调试）
      else localStorage.removeItem(LS_KEY);        // 传空 = 删除这条记录
    } catch (e) { /* 隐私模式存不了就算了 */ }
  }

  /* 读取网址参数里的 ?bg= 值（没写返回 null，写成空也算没写） */
  function pickParam() {
    try {
      var q = new URLSearchParams(location.search).get('bg');   // location.search 就是问号后面那一串；URLSearchParams 负责解析
      return q || null;                            // 空字符串也当成 null
    } catch (e) { return null; }
  }

  function mountVideo(src, isBlob) {               // 挂载一段视频：src 是地址，isBlob 表示「这是本地文件生成的 blob 地址」
    releaseObj(src);            // 先释放上一段本地 blob，避免内存越用越多
    if (video) { video.remove(); video = null; }   // 把旧视频从页面上摘掉
    veil.style.display = 'none';                   // 先关暗幕，等视频真加载出来再开
    if (!src) return;                              // 没有地址 = 就想要纯背景，直接结束
    if (isBlob) objUrl = src;                      // 记下来，下次换片时好释放

    var v = document.createElement('video');       // 造一个 <video> 元素（不写在 HTML 里，全靠 JS 生成）
    v.muted = true;                                // 静音：不静音的话浏览器会禁止自动播放
    v.defaultMuted = true;                         // 给 Firefox 看的同一层保险
    v.loop = true;                                 // 循环播放（背景视频当然要循环）
    v.autoplay = true;                             // 自动播放
    v.playsInline = true;                          // iOS 上不要一播就全屏
    v.setAttribute('muted', '');                   // 再写一遍 HTML 属性，兼容只认属性的老浏览器
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');      // 老版本 iOS Safari 认这个前缀
    v.preload = 'auto';                            // 尽量提前加载
    v.src = src;                                   // 指定视频地址

    // 加载失败（文件不存在 / 跨域被挡 / 编码不支持）→ 静默退回极光，不弹错
    v.addEventListener('error', function () {
      if (video === v) { v.remove(); video = null; veil.style.display = 'none'; }   // video === v 判断「失败的确实是我当前这版」，避免误删新视频
    });
    v.addEventListener('loadeddata', function () {  // loadeddata = 已经拿到第一帧数据，可以开始播了
      veil.style.display = 'block';                 // 视频真的能播了，这时才打开暗幕
      root.insertBefore(v, veil);                   // 插在暗幕前面（DOM 里靠前的在上面？不，这里靠 z-index 与顺序配合：视频在下，暗幕盖在上面）
      var p = v.play();                             // play() 返回 Promise，可能被浏览器拦
      if (p && p.catch) p.catch(function () { /* 某些浏览器需要交互才播，静默 */ });
    });
    video = v;                                      // 记住当前这版
  }

  /* ============ 弹窗：导入背景视频 ============ */
  function fmtSize(n) {                             // 把字节数变成人看得懂的 KB / MB / GB
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';   // 1024³ = 1GB，toFixed(1) 保留一位小数
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';         // 1024² = 1MB
    return Math.max(1, Math.round(n / 1024)) + ' KB';                   // 最小也显示 1 KB，避免出现 0 KB
  }
  function esc(s) {                                 // 转义 HTML 特殊字符，防止文件名里的 < > 把页面结构搞坏
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function openDialog() {                           // 打开「背景视频」设置弹窗
    var old = document.getElementById('bgDlg');     // 先看看是不是已经开着一个了
    if (old) old.remove();                          // 有就先删掉，避免点两次弹出两个

    var cur = readSaved();                          // 读出之前存过的直链，填进输入框
    var dlg = document.createElement('div');        // 弹窗最外层容器
    dlg.id = 'bgDlg';
    dlg.className = 'generic-modal show';           // 复用全站通用的弹窗样式（.generic-modal）
    /* 下面是一大段 HTML 字符串拼接：每一行 '...' 后面跟 + 号，表示「接下一段」。
       注意这些是字符串内容，里面写 // 会被当成文字显示出来，所以注释都写在字符串外面。 */
    dlg.innerHTML =
      '<div class="generic-box" style="width:500px">' +                                   // 弹窗白/黑本体，固定 500px 宽
        '<button class="generic-close" type="button" aria-label="关闭">×</button>' +      // 右上角关闭按钮
        '<h3 class="generic-title">背景视频</h3>' +                                        // 弹窗标题
        '<div class="generic-body">' +                                                     // 内容区
          '<p style="font-size:13px;color:var(--text-light);line-height:1.7;margin-bottom:14px">' +
            '铺满整页、自动循环、静音播放。留空就是默认的极光玻璃背景。' +                    // 一句话说明用途
          '</p>' +

          /* —— 推荐方式：本地文件存进浏览器 —— */
          '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px">' +   // 这一块单独描边，突出「推荐」
            '<div style="font-size:14px;font-weight:600;margin-bottom:4px">本机视频（推荐 · 别人看不到）</div>' +   // 小标题
            '<p style="font-size:12px;color:var(--text-light);line-height:1.6;margin:0 0 8px">' +
              '文件存在你这个浏览器的 IndexedDB 里，不经过任何服务器，<b>零流量</b>。' +       // <b> 是加粗
              '刷新后依然有效；换设备或换浏览器就没有了。' +
            '</p>' +
            /* 浏览器按「域名」隔离存储：localhost 存的，pages.dev 看不到。先讲清楚免得以为没生效 */
            '<p style="font-size:12px;color:#FFB020;line-height:1.6;margin:0 0 10px">' +   // #FFB020 是那行橙色提醒
              '只在当前域名生效：<b>' + esc(location.host || location.hostname) + '</b>' +  // esc() 防注入：把当前域名安全地插进 HTML
              '　其它域名 / 换端口都要重新选一次。' +
            '</p>' +
            '<p id="bgLocalInfo" style="font-size:12.5px;margin:0 0 10px;color:var(--text-light)">读取中…</p>' +   // 占位：稍后由 JS 填「当前已存 xxx」
            '<label class="log-submit" style="display:inline-flex;align-items:center;cursor:pointer">' +          // 用 label 包住 input：点文字等于点文件框
              '选一个视频文件' +
              '<input id="bgFile" type="file" accept="video/mp4,video/webm,video/*" style="display:none">' +     // accept 限制只能选视频
            '</label>' +
          '</div>' +

          /* —— 次要方式：直链（会经过网络，可能踩条款） —— */
          '<label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px">' +
            '视频直链（mp4 / webm，会占用托管流量）' +
          '</label>' +
          '<input class="login-input" id="bgUrl" type="url" placeholder="https://…/bg.mp4" value="' + esc(cur) + '">' +   // 把存过的直链回填进去
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +                 // 两个按钮横排，窄屏自动换行
            '<button class="log-submit" id="bgApply" type="button">应用直链</button>' +
            '<button class="log-cancel" id="bgClear" type="button">全部清除</button>' +
          '</div>' +

          '<p id="bgMsg" style="font-size:12.5px;color:var(--text-light);margin-top:12px;line-height:1.6">' +   // 操作结果提示区
            '提示：直链视频由 Cloudflare 分发，占流量、且大规模视频会违反其条款；自己看请用上面的本机文件。' +
          '</p>' +
        '</div>' +
      '</div>';

    document.body.appendChild(dlg);                 // 把弹窗真正插进页面（这一步之前它只存在内存里）

    var urlEl = dlg.querySelector('#bgUrl');        // 在弹窗内部找元素（用 dlg.querySelector 而不是 document，避免和页面上同 id 的元素冲突）
    var msgEl = dlg.querySelector('#bgMsg');        // 提示文字元素
    var fileEl = dlg.querySelector('#bgFile');      // 文件选择框
    var infoEl = dlg.querySelector('#bgLocalInfo'); // 「当前已存」那行字

    /* 显示当前存在浏览器里的本地视频 */
    idbGet().then(function (rec) {                  // 异步去 IndexedDB 查
      if (!infoEl) return;                          // 弹窗可能已经被关了，元素没了就跳过
      if (rec && rec.blob) {                        // 存过
        infoEl.innerHTML = '当前已存：<b style="color:var(--primary)">' + esc(rec.name) +   // 显示文件名（转义过，安全）
          '</b>（' + fmtSize(rec.size || rec.blob.size) + '）';                            // 大小优先用存下来的 size 字段
      } else {
        infoEl.textContent = '当前没有存本地视频。';   // textContent 只写纯文字，不会被当成 HTML 解析
      }
    });

    function close() { dlg.remove(); }              // 关闭弹窗 = 直接从 DOM 里删掉（比隐藏更干净，下次重新生成）
    dlg.querySelector('.generic-close').addEventListener('click', close);   // 点 × 关闭
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });   // 点遮罩（也就是弹窗外面那圈）关闭；e.target === dlg 说明点的是遮罩本身而不是里面的内容

    /* 应用直链 */
    dlg.querySelector('#bgApply').addEventListener('click', function () {
      var u = urlEl.value.trim();                   // 取输入框内容，去掉首尾空格
      saveUrl(u);                                   // 存进 localStorage，下次打开自动用
      mountVideo(u);                                // 立刻换上（u 为空则等于恢复纯色/极光背景）
      msgEl.textContent = u ? '直链已应用 ✓（会占用托管流量）' : '已恢复极光背景 ✓';   // 三元：有地址 / 没地址，提示不同
      setTimeout(close, 600);                       // 600 毫秒后再关，让人看清提示
    });

    /* 全部清除：直链 + 本机文件一起清掉 */
    dlg.querySelector('#bgClear').addEventListener('click', function () {
      saveUrl('');                                  // 清直链（传空字符串 → saveUrl 里走 removeItem）
      urlEl.value = '';                             // 清输入框
      mountVideo('');                               // 卸掉视频，露出纯背景
      idbDel().then(function () {                   // 再清 IndexedDB 里的本地视频
        if (infoEl) infoEl.textContent = '当前没有存本地视频。';
        msgEl.textContent = '已全部清除，恢复极光背景 ✓';
      });
    });

    /* 选本地文件 → 存进 IndexedDB，刷新后仍在，别人看不到 */
    fileEl.addEventListener('change', function () {   // change = 用户选完文件后触发
      var f = fileEl.files && fileEl.files[0];        // files 是 FileList，取第 0 个就是选中的那个文件
      if (!f) return;                                 // 点了取消 → 没有文件，直接返回

      if (!/^video\//.test(f.type)) {                 // 正则测试：MIME 类型必须以 video/ 开头（比如 video/mp4）
        msgEl.textContent = '这个文件不是视频，换一个（mp4 / webm）。';
        return;
      }
      msgEl.textContent = '正在存入本浏览器…';

      idbPut({                                        // 把文件整个塞进 IndexedDB（File 对象可以直接存，浏览器会落盘）
        name: f.name,                                 // 文件名（弹窗里显示用）
        size: f.size,                                 // 字节数
        type: f.type,                                 // MIME 类型
        blob: f,                                      // 文件本体（关键：视频内容就存在这里）
        t: Date.now()                                 // 存入时间戳
      }).then(function () {                           // 存完之后的回调
        mountVideo(URL.createObjectURL(f), true);     // createObjectURL 给文件造一个 blob: 临时地址，第二个参数 true 表示「这是本地 blob，要记着释放」
        if (infoEl) {
          infoEl.innerHTML = '当前已存：<b style="color:var(--primary)">' + esc(f.name) +
            '</b>（' + fmtSize(f.size) + '）';
        }
        msgEl.textContent = '已存入本浏览器 ✓ 刷新后仍然生效，只有这台设备能看到，不产生任何 CDN 流量。';
        if (f.size > 80 * 1024 * 1024) {              // 80MB = 80×1024×1024 字节
          msgEl.textContent += ' （文件偏大，首次加载会慢几秒）';
        }
      }).catch(function (err) {                       // 存失败（最常见：浏览器存储配额不够）
        msgEl.textContent = '存不进去：' + ((err && err.message) || err) + '。可能是浏览器空间不足。';
      });
    });
  }

  /* 把入口挂进齿轮菜单（菜单由 nav.js 生成，等它渲染完） */
  function injectMenuItem() {
    var menu = document.getElementById('gearMenu');   // 齿轮菜单容器（nav.js 生成）
    if (!menu) return false;                          // 还没生成 → 返回 false，让调用方稍后重试
    if (menu.querySelector('#gearBgVideo')) return true;   // 已经加过了 → 返回 true 表示「搞定」
    var a = document.createElement('a');              // 用 <a> 做菜单项，样式直接复用 .gear-item
    a.className = 'gear-item';
    a.id = 'gearBgVideo';
    a.href = 'javascript:;';                          // 写 javascript:; 是为了让鼠标变小手，又不会跳转页面
    a.textContent = '背景视频';
    a.addEventListener('click', function (e) {
      e.preventDefault();                             // 拦住 href 的默认行为，防止页面跳动
      menu.classList.remove('show');                  // 点完把菜单收起来
      openDialog();                                   // 弹出设置框
    });
    menu.appendChild(a);                              // 加进菜单
    return true;                                      // 报告：成功
  }

  /* 启动：按优先级找一个背景视频挂上去。
     顺序 = 网址参数 > 本机存的本地文件 > 存过的直链 > config 里的全站默认 > 极光 */
  function boot() {
    var q = pickParam();                              // 先看网址上有没有 ?bg=

    // ① ?bg=xxx 临时指定
    if (q === 'off') {
      // off = 彻底关掉（清直链 + 清本机文件），恢复极光
      saveUrl('');
      idbDel().then(function () { mountVideo(''); afterBoot(); });   // 删完本地文件再挂空（=回到纯背景）
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
      if (rec && rec.blob) {                          // 有：优先用它（本地文件比直链更快、更合规）
        mountVideo(URL.createObjectURL(rec.blob), true);
        return;                                        // 后面的直链就不再考虑了
      }
      // ③ 直链 → ④ config 全站默认 → ⑤ 极光
      mountVideo(readSaved() || (typeof window.BG_VIDEO === 'string' ? window.BG_VIDEO.trim() : ''));   // || 是「前面没有就用后面」
    }).then(afterBoot);                               // 不管有没有视频，都要继续插菜单入口
  }

  /* 挂完视频后再去插齿轮菜单入口 */
  function afterBoot() {
    if (injectMenuItem()) return;                     // 一次就成功最好
    var n = 0;                                        // 重试次数
    var timer = setInterval(function () {             // 每 100 毫秒试一次（因为 nav.js 可能还没渲染出菜单）
      if (injectMenuItem() || ++n > 40) clearInterval(timer);   // 成功或试够 40 次（4 秒）就停，避免无限循环
    }, 100);
  }

  if (document.readyState === 'loading') {            // 如果 HTML 还没解析完
    document.addEventListener('DOMContentLoaded', boot);   // 等 DOM 就绪再启动（这时才找得到 body）
  } else {
    boot();                                           // 已经就绪（脚本放在底部时会这样）就直接跑
  }

  // 让别处也能调用（例如 config 里想动态换）
  window.BgVideo = { open: openDialog, set: function (u) { saveUrl(u || ''); mountVideo(u || ''); } };   // 挂到全局，控制台里可以直接 BgVideo.open()
})();
