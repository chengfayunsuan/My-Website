/* ============================================================
   文件：js/nav.js（全站导航栏）
   作用：每个页面都会引入。负责：生成顶部导航栏、登录/注册弹窗、登录状态与头像、齿轮菜单、信箱红点、深色模式切换。
   ============================================================ */

(function () {
  /* 后端已切 Supabase 直连，主调用走 window.SBAPI（见 js/sb.js）。 */

  /* 头像字段有两种可能：新后端给完整网址（…/avatar/uid1.jpg?v=123），
     旧后端只给文件名（uid1.jpg）。两种都要能正常显示。 */
  function fixAvatar(a) {
    if (!a) return '/avatar-default.jpg';
    if (a.startsWith('data:') || /^https?:\/\//.test(a)) return a;
    if (a.indexOf('"') !== -1 || a.indexOf('<') !== -1) return '/avatar-default.jpg';
    return (window.MEDIA_BASE || '').replace(/\/+$/, '') + '/' + a.replace(/^\/+/, '');
  }

  /* ========== 1. 生成导航栏 ========== */
  const isManage = location.pathname.indexOf('/manage') === 0;
  const adminHref = isManage ? '/' : '/manage/dashboard';
  const adminTitle = isManage ? '返回普通界面' : '管理后台';

  const navHTML = `
    <nav>
      <div class="nav-inner">
        <a class="logo" href="/">乘法</a>
        <div class="nav-right">
          <a class="nav-link" href="/pages/video-write.html" title="传视频">🎬 传视频</a>
          <span class="ip-wrap">你的 IP：<span id="ip">获取中…</span></span>
          <a class="login-btn" id="loginBtn" href="javascript:;">登录</a>
          <a class="user-avatar" id="userAvatar" href="/profile/" style="display:none;">
            <img id="avatarImg" src="/avatar-default.jpg" alt="头像">
          </a>
          <a class="admin-btn" id="adminBtn" href="${adminHref}" aria-label="${adminTitle}" title="${adminTitle}" style="display:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
          </a>
          <div class="mail-wrap" id="mailWrap" style="display:none;">
            <button class="mail-btn" id="mailBtn" aria-label="信箱" title="信箱">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <path d="m3 7 9 6 9-6"/>
              </svg>
              <span class="mail-dot" id="mailDot" style="display:none;"></span>
            </button>
            <div class="mail-panel" id="mailPanel">
              <div class="mail-head">
                <span>信箱</span>
                <button class="mail-readall" id="mailReadAll" type="button">全部已读</button>
              </div>
              <div class="mail-cats" id="mailCats"><p class="mail-empty">加载中…</p></div>
            </div>
          </div>
          <button class="theme-btn" id="themeBtn" aria-label="切换深色模式">
            <svg id="themeIcon" viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          </button>
          <div class="gear-wrap">
            <button class="gear-btn" id="gearBtn" aria-label="设置">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            <div class="gear-menu" id="gearMenu">
              <a class="gear-item" id="gearLogout" href="javascript:;" style="display:none;">退出登录</a>
              <span class="gear-empty" id="gearEmpty">请先登录</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;

  /* ========== 2. 生成登录弹窗 ========== */
  const modalHTML = `
    <div class="login-modal" id="loginModal">
      <div class="login-box">
        <button class="login-close" id="loginClose">×</button>
        <h2 class="login-title">登录 / 注册</h2>
        <input class="login-input" id="loginUser" placeholder="用户名（2~20 字）">
        <input class="login-input" id="loginPass" type="password" placeholder="密码（至少 6 位）">
        <div class="login-actions">
          <button class="login-submit" id="loginSubmit">登录</button>
          <button class="login-submit reg" id="registerSubmit">注册</button>
        </div>
        <p class="login-msg" id="loginMsg"></p>
      </div>
    </div>

    <div class="mail-modal" id="mailModal">
      <div class="mail-modal-box">
        <div class="mail-modal-head">
          <span id="mailModalTitle">消息</span>
          <button class="mail-modal-close" id="mailModalClose" type="button" aria-label="关闭">×</button>
        </div>
        <div class="mail-modal-body" id="mailModalBody"></div>
      </div>
    </div>
  `;

  const navRoot = document.getElementById('navbar');
  if (navRoot) navRoot.innerHTML = navHTML;
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  /* ========== 3. 元素引用 ========== */
  const themeBtn  = document.getElementById('themeBtn');
  const themeIcon = document.getElementById('themeIcon');
  const loginBtn  = document.getElementById('loginBtn');
  const avatarBox = document.getElementById('userAvatar');
  const gearBtn   = document.getElementById('gearBtn');
  const gearMenu  = document.getElementById('gearMenu');
  const gearLogout = document.getElementById('gearLogout');
  const gearEmpty  = document.getElementById('gearEmpty');
  const modal     = document.getElementById('loginModal');
  const closeBtn  = document.getElementById('loginClose');
  const userInput = document.getElementById('loginUser');
  const passInput = document.getElementById('loginPass');
  const loginSubmit    = document.getElementById('loginSubmit');
  const registerSubmit = document.getElementById('registerSubmit');
  const msgBox    = document.getElementById('loginMsg');
  const adminBtn  = document.getElementById('adminBtn');
  const mailWrap  = document.getElementById('mailWrap');
  const mailBtn   = document.getElementById('mailBtn');
  const mailPanel = document.getElementById('mailPanel');
  const mailDot   = document.getElementById('mailDot');

  /* ========== 4. 主题切换 ========== */
  /* 两个图标：月亮和太阳，本质就是两段 SVG 字符串（矢量图，放大不糊）。
     切主题时把按钮里的图标换成另一个，用户就看得见「变了」。 */
  const moonSVG = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';   // 【const】月亮的 SVG 路径
  const sunSVG  = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>';   // 【const】太阳（圆 + 8 根光芒线）

  const forceDark = document.body.hasAttribute('data-force-dark');   // 检查 <body> 上有没有 data-force-dark 这个属性：
                                                                     // 有 = 这页强制深色，禁止切换（比如鼠标特效页，浅色下看不见轨迹）。
                                                                     // hasAttribute 返回 true / false。

  /* 全站默认就是「深空磨砂」，点小太阳切成「磨砂白」。
     以前是默认浅色、加 .dark 变深；现在反过来，用 .light 标记浅色。
     网址加 ?theme=light 可以直接预览浅色。 */
  function applyLight(on) {                          // 【function】切换主题的函数，on = true 变浅色，false 变深色。
    document.body.classList.toggle('light', on);     // 【classList】元素身上的 class 列表。toggle(名字, 要不要有)：
                                                     // on 为 true 就加上 light 类，false 就移除。不用自己写 if/else。
    document.body.classList.remove('dark');          // 顺便把老的 dark 类清掉，避免两套主题类同时存在打架。
    if (themeIcon) themeIcon.innerHTML = on ? moonSVG : sunSVG;   // 【if】按钮图标跟着换：
                                                                  // 现在是浅色 → 显示月亮（提示「点我变深」）；深色 → 显示太阳。
                                                                  // 三元运算符：条件 ? 真时 : 假时。
  }
  var qLight = false;                                // 【var】老式声明（这里历史遗留）。先假设网址没带 ?theme=light。
  try { qLight = new URLSearchParams(location.search).get('theme') === 'light'; } catch (e) { qLight = false; }
                                                     // 【try/catch】URLSearchParams 解析网址参数，个别老浏览器不支持会抛错，
                                                     // 所以包一层 try；出错就当没有参数（false）。
                                                     // location.search = 问号后面那一串，如 "?theme=light"。
                                                     // === 'light' 得到 true / false，存进 qLight。
  applyLight(!forceDark && (qLight || localStorage.getItem('theme') === 'light'));
                                                     // 这一行决定「页面一打开是什么主题」，括号从里往外读：
                                                     // ① qLight：网址上写了要浅色；
                                                     // ② localStorage.getItem('theme') === 'light'：上次手动选过浅色（浏览器本地记着）；
                                                     // ③ 两者满足一个就行（||）；
                                                     // ④ 【!】强制深色的页面一律不算（!forceDark）；
                                                     // ⑤ 最后把结果交给 applyLight。

  themeBtn.addEventListener('click', () => {         // 【事件】给主题按钮装点击监听。
    if (forceDark) return;                           // 【if】强制深色的页面，点了也什么都不做（【return】直接结束）。
    const nextLight = !document.body.classList.contains('light');   // 【const】取反当前状态：
                                                                    // 现在是深色（没有 light 类）→ nextLight = true → 下次变浅。
    applyLight(nextLight);                           // 应用。
    localStorage.setItem('theme', nextLight ? 'light' : 'dark');    // 记住选择。localStorage 只能存字符串，
                                                                    // 下次打开页面时上面那行会读它，实现「记住我的偏好」。
  });

  /* ========== 5. 获取 IP ========== */
  /* 思路：准备三个公共查 IP 的接口，挨个试；谁先成功就用谁，全失败就显示「获取失败」。
     为什么要三个？单个接口经常被墙、限流、或临时挂掉，多准备几个才稳。 */
  (function showIP() {                               // IIFE：这块逻辑自成一体，变量不外泄。
    const sources = [                                // 【const】接口地址列表，按顺序尝试。
      'https://api.ipify.org?format=text',
      'https://ipapi.co/ip/',
      'https://api.ip.sb/ip'
    ];
    const el = () => document.getElementById('ip');  // 【箭头函数】每次调用都重新找一次元素。
                                                     // 为什么不存下来？因为导航栏可能是后来才插进页面的，
                                                     // 提前找会拿到 null。用函数「现用现找」最保险。
    let i = 0;                                       // 【let】当前试到第几个接口，从 0 开始。
    function next() {                                // 【function】试下一个接口。
      if (i >= sources.length) { const e = el(); if (e) e.textContent = '获取失败'; return; }
                                                     // 【if】所有接口都试完了 → 显示「获取失败」；
                                                     // 【return】结束，不再往下。
      const url = sources[i++];                      // 【const】取出当前地址；i++ 是「先用 i 的值，再把 i 加 1」。
      const ac = new AbortController();              // 【new】AbortController 是浏览器提供的「中断器」，
                                                     // 可以强行掐断一个还没返回的 fetch 请求。
      const timer = setTimeout(() => ac.abort(), 3000);   // 3 秒不回来就掐断，换下一个，不让它一直挂着。
                                                          // setTimeout(要执行的函数, 毫秒) 是定时器。
      fetch(url, { signal: ac.signal, cache: 'no-store' })   // 【fetch】发网络请求：
                                                             // signal 绑上中断器（上面掐断的就是它）；
                                                             // cache:'no-store' = 别用浏览器缓存，要最新的。
        .then(r => r.text())                         // 【.then】请求成功后，把响应内容读成纯文本（IP 就是一行文字）。
        .then(tp => {                                // 【.then】拿到文本后接着处理。tp = text 的缩写。
          clearTimeout(timer);                       // 成功了就取消那个 3 秒定时器，别误伤。
          const ip = (tp || '').trim().split('\n')[0].slice(0, 60);
                                                     // 三步清洗：去掉首尾空白（trim）→ 按换行切开取第一行（split('\n')[0]）→
                                                     // 最多留 60 个字符（slice(0,60)），防止接口返回一大段 HTML。
          if (!/^[0-9a-fA-F.:]+$/.test(ip)) throw new Error('格式不对');
                                                     // 【正则】只允许数字、a-f、点、冒号（IPv4 和 IPv6 都用得上）。
                                                     // 【throw】主动抛错 → 直接跳到下面的 catch，等于「这个接口的结果不能用」。
          const e = el(); if (e) e.textContent = ip; // 【if】把 IP 写进页面上那个 <span id="ip">。
        })
        .catch(() => { clearTimeout(timer); next(); });   // 【catch】任何一步失败（超时、网络错、格式不对）：
                                                          // 取消定时器，然后试下一个接口。
    }
    next();                                          // 启动：先试第一个。
  })();

  /* ========== 6. 登录状态判断 ========== */
  /* 两个函数，分别对应「已登录」和「未登录」两种界面状态。
     核心思路：登录框 / 头像 / 退出项 / 后台按钮 / 信箱，统统靠改 display 来显示或隐藏。 */
  function showLoggedIn(role, avatar, uid) {         // 【function】已登录：role 角色、avatar 头像、uid 用户编号。
    loginBtn.style.display = 'none';                 // 藏掉「登录」按钮。
    avatarBox.style.display = 'block';               // 显示头像。
    gearLogout.style.display = 'block';              // 齿轮菜单里显示「退出登录」。
    gearEmpty.style.display = 'none';                // 藏掉「请先登录」那行提示。

    // 头像点进去 = 自己的主页
    if (uid) {                                       // 【if】有用户编号才做（老数据可能没有）。
      avatarBox.href = '/profile/?uid=' + uid;       // 改链接地址：个人主页 + ?uid=编号。
                                                     // 字符串用 + 拼接。
      avatarBox.title = '我的主页';                   // 鼠标悬停时显示的提示文字。
    }

    const navAvatarImg = document.getElementById('avatarImg');   // 头像那张 <img>。
    if (navAvatarImg && avatar) navAvatarImg.src = fixAvatar(avatar);   // 【if】两者都有才设地址。
                                                                        // fixAvatar 是文件最上面那个函数，
                                                                        // 负责把「只有文件名」补成完整网址。
    if (adminBtn) {
      adminBtn.style.display = (role === 'owner' || role === 'admin') ? 'flex' : 'none';
                                                     // 【if + 三元】站长或管理员才显示后台按钮，
                                                     // 普通人设成 none（等于没有）。
    }
    if (mailWrap) mailWrap.style.display = 'block';  // 登录了才显示信箱入口。
    loadMail();               // 看一眼有没有未读，好显示小红点
  }
  function showLoggedOut() {                          // 【function】未登录：把上面那些全反过来。
    loginBtn.style.display = '';                      // 赋空字符串 = 恢复 CSS 里的默认显示方式（最省心的写法）。
    avatarBox.style.display = 'none';
    gearLogout.style.display = 'none';
    gearEmpty.style.display = 'block';                // 齿轮菜单里显示「请先登录」。
    if (adminBtn) adminBtn.style.display = 'none';
    if (mailWrap) mailWrap.style.display = 'none';
    if (mailPanel) mailPanel.classList.remove('show');   // 【classList.remove】收起信箱面板（去掉 show 类）。
    if (mailDot) mailDot.style.display = 'none';         // 藏掉未读小红点。
    mailAll = [];                                        // 清空本地缓存的消息列表（别人登出后不该看到上一个账号的消息）。
    const mm = document.getElementById('mailModal');     // 消息详情弹窗。
    if (mm) mm.classList.remove('show');                 // 一起关掉。
  }

  async function checkLogin() {                       // 【async function】去问后端「我现在登录了吗」。
    const s = await SBAPI.getSession();               // 【await】等结果。没登录会得到 null。
    if (!s) return showLoggedOut();                   // 【if】没登录 → 直接把界面切到未登录状态（return 后面跟函数调用 = 执行完就结束）。
    try {                                             // 【try】后面要请求用户资料，可能失败。
      const data = await SBAPI.me();                  // 【await】拿「我」的资料（角色、头像、编号、用户名）。
      if (data.ok) {                                  // 后端说成功。
        showLoggedIn(data.role, data.avatar, data.uidNo || data.uid);   // 切到已登录界面。
                                                     // uidNo || uid：优先用 uidNo，没有就退回 uid（兼容新旧两种字段）。
        const navAvatarImg = document.getElementById('avatarImg');
        if (data.username && navAvatarImg) navAvatarImg.alt = data.username;   // alt 是图片的替代文字：
                                                                              // 图挂了时显示，也供读屏软件念出来。
      } else {
        showLoggedOut();                              // 后端说不行（token 过期等）→ 当未登录处理。
      }
    } catch {                                         // 【catch】网络错也当未登录。
      showLoggedOut();
    }
  }
  checkLogin();                                       // 页面一加载就执行一次，决定顶部显示什么。

  /* ========== 7. 后台按钮：平滑跳转 ========== */
  if (adminBtn) {
    adminBtn.addEventListener('click', function (e) {
      e.preventDefault();
      const href = this.getAttribute('href');
      document.body.style.transition = 'opacity .18s';
      document.body.style.opacity = '0';
      setTimeout(() => { location.href = href; }, 180);
    });
  }

  /* ========== 8. 齿轮菜单 ========== */
  gearBtn.addEventListener('click', e => {
    e.stopPropagation();
    closeMail();
    gearMenu.classList.toggle('show');
  });
  document.addEventListener('click', e => {
    gearMenu.classList.remove('show');
    // 点信箱面板里面（滚动、看内容）不该把它关掉
    if (!e.target.closest('.mail-wrap')) closeMail();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { gearMenu.classList.remove('show'); closeMail(); closeMailModal(); }
  });
  gearLogout.addEventListener('click', async () => {
    await SBAPI.signOut();
    location.reload();
  });

  /* ========== 9. 信箱（被点赞 / 被回复 / 举报结果）========== */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 信箱五栏：我的点赞 / 我的回复 / 我的@ / 我的举报 / 系统消息 */
  const CATS = [
    { key: 'like',    label: '我的点赞', ico: '♥', cls: 'like',    empty: '还没有人赞过你的留言' },
    { key: 'reply',   label: '我的回复', ico: '↩', cls: 'reply',   empty: '还没有人回复过你' },
    { key: 'mention', label: '我的@',    ico: '@', cls: 'mention', empty: '还没有人在留言里 @ 过你' },
    { key: 'report',  label: '我的举报', ico: '!', cls: 'report',  empty: '你还没有举报过谁' },
    { key: 'system',  label: '系统消息', ico: '⚙', cls: 'system',  empty: '没有系统消息' }
  ];

  let mailAll = [];        // 后端给的全部通知，切栏目时在这里面筛
  let mailKey = 'like';    // 小窗现在开着哪一栏

  function mailLine(n) {
    const who = '<b>' + esc(n.fromName || '有人') + '</b>';
    if (n.type === 'like')    return who + ' 赞了你的留言';
    if (n.type === 'mention') return who + ' 在留言里 @ 了你';
    if (n.type === 'report')  return '你的举报处理好了：<b>' + esc(n.action || '') + '</b>';
    if (n.type === 'system')  return esc(n.note || '有一条系统消息');
    return who + ' 回复了你的留言';
  }

  function mailIcon(type) {
    if (type === 'like')    return '<span class="mail-ico like">♥</span>';
    if (type === 'mention') return '<span class="mail-ico mention">@</span>';
    if (type === 'report')  return '<span class="mail-ico report">!</span>';
    if (type === 'system')  return '<span class="mail-ico system">⚙</span>';
    return '<span class="mail-ico reply">↩</span>';
  }

  function mailItemHTML(n) {
    const cls = 'mail-item' + (n.read ? '' : ' new');
    const body = mailIcon(n.type) +
      '<div class="mail-body">' +
        '<div class="mail-line">' + mailLine(n) + '</div>' +
        (n.text ? '<div class="mail-ex">' + esc(String(n.text).slice(0, 80)) + '</div>' : '') +
        '<div class="mail-time">' + esc(n.time || '') + '</div>' +
      '</div>';
    // href 由后端算好（能回复的就带上 ?reply= 和 @对象）
    return n.href
      ? '<a class="' + cls + '" href="' + esc(n.href) + '">' + body + '</a>'
      : '<div class="' + cls + '">' + body + '</div>';
  }

  function paintDot() {
    if (!mailDot) return;
    const un = mailAll.filter(n => !n.read).length;
    mailDot.textContent = un > 99 ? '99+' : String(un);
    mailDot.style.display = un > 0 ? 'inline-flex' : 'none';
  }

  /* 信箱下拉里那五栏，右边的数字是未读数（都读过了就显示总数） */
  function renderCats() {
    const box = document.getElementById('mailCats');
    if (!box) return;
    if (!mailAll.length) { box.innerHTML = '<p class="mail-empty">还没有消息</p>'; return; }

    box.innerHTML = CATS.map(c => {
      const items = mailAll.filter(n => (n.type || 'reply') === c.key);
      const un = items.filter(n => !n.read).length;
      // 看过了（没有未读）就干脆不挂数字，别老顶着个圆圈
      const badge = un
        ? '<span class="mail-cat-n">' + (un > 99 ? '99+' : un) + '</span>'
        : '';
      return '<button type="button" class="mail-cat" data-cat="' + c.key + '">' +
        '<span class="mail-ico ' + c.cls + '">' + c.ico + '</span>' +
        '<span class="mail-cat-label">' + c.label + '</span>' +
        badge +
        '<span class="mail-cat-go">›</span>' +
      '</button>';
    }).join('');
  }

  function renderMail() {
    paintDot();
    renderCats();
  }

  /* 小窗内容（只画，不负责开关） */
  function paintModal() {
    const c = CATS.filter(x => x.key === mailKey)[0];
    const title = document.getElementById('mailModalTitle');
    const body  = document.getElementById('mailModalBody');
    if (!c || !title || !body) return;

    const items = mailAll.filter(n => (n.type || 'reply') === c.key);
    title.textContent = c.label + (items.length ? '（' + items.length + '）' : '');
    body.innerHTML = items.length
      ? items.map(mailItemHTML).join('')
      : '<p class="mail-empty">' + c.empty + '</p>';
  }

  /* 点某一栏 → 弹小窗看详细内容，看过就算已读 */
  function openCat(key) {
    if (!CATS.some(x => x.key === key)) return;
    mailKey = key;

    const modal = document.getElementById('mailModal');
    if (!modal) return;
    paintModal();
    modal.classList.add('show');
    closeMail();

    const unreadIds = mailAll
      .filter(n => (n.type || 'reply') === key && !n.read)
      .map(n => n.id);
    if (!unreadIds.length) return;
    mailAll.forEach(n => { if ((n.type || 'reply') === key) n.read = true; });
    renderMail();
    markRead({ ids: unreadIds });
  }

  function closeMailModal() {
    const modal = document.getElementById('mailModal');
    if (modal) modal.classList.remove('show');
  }

  async function markRead(payload) {
    try { await SBAPI.markRead(payload); } catch { /* 忽略 */ }
  }

  let mailBusy = false;
  async function loadMail() {
    const s = await SBAPI.getSession();
    if (!s || mailBusy) return;
    mailBusy = true;
    try {
      const d = await SBAPI.getNotifications();
      if (!d || !d.ok) return;
      mailAll = d.list || [];
      renderMail();

      // 信箱一打开就算「看过了」，红圈数字不再一直挂着
      if (mailPanel && mailPanel.classList.contains('show') && mailAll.some(n => !n.read)) {
        mailAll.forEach(n => { n.read = true; });
        renderMail();
        markRead({ all: true });
      }

      // 小窗正开着的话跟着刷新（比如刚处理完举报）
      const modal = document.getElementById('mailModal');
      if (modal && modal.classList.contains('show')) paintModal();
    } catch {
      /* 隧道抖一下就忽略，点开信箱时会重试 */
    } finally {
      mailBusy = false;
    }
  }

  function closeMail() {
    if (mailPanel) mailPanel.classList.remove('show');
  }

  if (mailBtn) {
    mailBtn.addEventListener('click', e => {
      e.stopPropagation();
      gearMenu.classList.remove('show');
      const open = mailPanel.classList.contains('show');
      if (open) return closeMail();
      mailPanel.classList.add('show');
      loadMail();              // 只拉最新的，算已读要等你点进某一栏
    });
  }

  // 点五栏里任意一栏 → 弹小窗看这一类的消息
  const mailCats = document.getElementById('mailCats');
  if (mailCats) {
    mailCats.addEventListener('click', e => {
      const b = e.target.closest('.mail-cat');
      if (b) openCat(b.dataset.cat);
    });
  }

  const mailModal = document.getElementById('mailModal');
  if (mailModal) {
    mailModal.addEventListener('click', e => {
      if (e.target === mailModal || e.target.closest('.mail-modal-close')) closeMailModal();
    });
  }

  const mailReadAll = document.getElementById('mailReadAll');
  if (mailReadAll) {
    mailReadAll.addEventListener('click', e => {
      e.stopPropagation();
      if (!mailAll.some(n => !n.read)) return;
      mailAll.forEach(n => { n.read = true; });
      renderMail();
      const modal = document.getElementById('mailModal');
      if (modal && modal.classList.contains('show')) paintModal();
      markRead({ all: true });
    });
  }

  // 每 60 秒偷偷看一眼有没有新消息，好更新小红点
  setInterval(() => { if (!mailPanel.classList.contains('show')) loadMail(); }, 60000);

  /* ========== 10. 登录弹窗 ========== */
  function openModal() {
    modal.classList.add('show');
    msgBox.textContent = '';
    msgBox.className = 'login-msg';
  }
  function closeModal() {
    modal.classList.remove('show');
    userInput.value = '';
    passInput.value = '';
    msgBox.textContent = '';
    msgBox.className = 'login-msg';
  }
  loginBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
  });

  function showMsg(text, ok) {
    msgBox.textContent = text;
    msgBox.className = 'login-msg ' + (ok ? 'ok' : 'err');
  }

  loginSubmit.addEventListener('click', async () => {
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) return showMsg('用户名密码必填', false);
    try {
      const { data, error } = await SBAPI.signIn(username, password);
      if (error) return showMsg(error.message || '登录失败', false);
      showMsg('登录成功', true);
      setTimeout(() => location.reload(), 400);
    } catch {
      showMsg('网络错误，请重试', false);
    }
  });

  registerSubmit.addEventListener('click', async () => {
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) return showMsg('用户名密码必填', false);
    try {
      const { data, error } = await SBAPI.signUp(username, password);
      if (error) return showMsg(error.message || '注册失败', false);
      if (!data.session) {
        showMsg('注册成功，请去邮箱完成验证后再登录', true);
      } else {
        showMsg('注册成功，已自动登录', true);
        setTimeout(() => location.reload(), 400);
      }
    } catch {
      showMsg('网络错误，请重试', false);
    }
  });

  passInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginSubmit.click();
  });
})();