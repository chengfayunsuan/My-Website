/* ============================================================
   文件：js/nav.js（全站导航栏）
   作用：每个页面都会引入。负责：生成顶部导航栏、登录/注册弹窗、登录状态与头像、齿轮菜单、信箱红点、深色模式切换。
   ============================================================ */

(function () {                                    // 【IIFE】立即执行函数：整份代码包在自己的作用域里，
                                                  // 里面的变量不会和别的 js 文件重名打架。
  /* 后端已切 Supabase 直连，主调用走 window.SBAPI（见 js/sb.js）。 */

  /* 头像字段有两种可能：新后端给完整网址（…/avatar/uid1.jpg?v=123），
     旧后端只给文件名（uid1.jpg）。两种都要能正常显示。 */
  function fixAvatar(a) {                         // 【function】把「头像字段」统一成一个能直接放进 <img src> 的地址。
    if (!a) return '/avatar-default.jpg';         // 【if】没有头像（null / 空字符串）→ 用默认头像。
    if (a.startsWith('data:') || /^https?:\/\//.test(a)) return a;
                                                  // 【if】两种情况直接原样返回：
                                                  // ① a.startsWith('data:')：这是 base64 内嵌图片，本身就是完整地址；
                                                  // ② /^https?:\/\//.test(a) 是正则：以 http:// 或 https:// 开头的完整网址。
                                                  // || 表示满足一个就行。
    if (a.indexOf('"') !== -1 || a.indexOf('<') !== -1) return '/avatar-default.jpg';
                                                  // 【if】安全兜底：字段里出现引号或尖括号，说明有人在尝试注入代码，
                                                  // 一律不要，换成默认头像。
                                                  // indexOf('x') !== -1 = 「字符串里有 x 这个字符」。
    return (window.MEDIA_BASE || '').replace(/\/+$/, '') + '/' + a.replace(/^\/+/, '');
                                                  // 剩下的情况 = 只有文件名，要拼成完整地址：
                                                  // ① window.MEDIA_BASE 是媒体前缀（在 config.js 里配），没有就用空字符串；
                                                  // ② .replace(/\/+$/, '') 去掉结尾的斜杠（正则 /\/+$/ = 结尾处一个或多个 /）；
                                                  // ③ 加一个 / 再拼上文件名；
                                                  // ④ a.replace(/^\/+/, '') 去掉文件名开头多余的斜杠（/^\/+/ = 开头处一个或多个 /）。
                                                  // 这样无论前缀带不带斜杠、文件名带不带斜杠，拼出来都不会出现 // 或缺斜杠。
  }

  /* ========== 1. 生成导航栏 ========== */
  /* 思路：导航栏不写在每个 HTML 里，而是这里用 JS 生成再塞进页面。
     好处：十几个页面只需要维护这一份，改一次全站生效。 */
  const isManage = location.pathname.indexOf('/manage') === 0;
                                                  // 【const】location.pathname = 当前网址的路径部分，比如 /manage/dashboard.html。
                                                  // indexOf('/manage') === 0 = 「/manage 出现在第 0 个位置」= 路径以 /manage 开头。
                                                  // 结果：当前是不是管理后台页面（true / false）。
  const adminHref = isManage ? '/' : '/manage/dashboard';
                                                  // 【三元】在后台 → 按钮回首页；在普通页面 → 按钮进后台。
  const adminTitle = isManage ? '返回普通界面' : '管理后台';
                                                  // 【三元】按钮的提示文字也跟着变。

  /* 下面这一大段是【模板字符串】：反引号 ` 包住整段 HTML，${} 里可以插变量。
     因为里面的每个字符都会被当成真实 HTML，所以内部不能写 // 注释。
     结构速览（从上往下）：
       <nav> 里面是 .nav-inner
         ├─ .logo          左边「乘法」两个字，点回首页
         └─ .nav-right     右边一排：传视频 / IP / 登录 / 头像 / 后台 / 信箱 / 主题 / 齿轮
     带 style="display:none" 的元素默认是藏着的，等 JS 判断完登录状态再决定要不要露出来。 */
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
  `;                                              // 模板字符串结束，回到普通 JS。

  /* ========== 2. 生成登录弹窗 ========== */
  /* 这里生成两个东西：
       ① .login-modal  登录 / 注册弹窗；
       ② .mail-modal   点开信箱某一栏后，看详细消息的小窗。
     它们默认是隐藏的（CSS 里没有 .show 类就不显示），靠 JS 加 show 类才弹出来。 */
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
  `;                                              // type="password" 会让输入框显示成圆点；
                                                  // placeholder 是输入框里的灰色提示文字。

  /* 把上面拼好的 HTML 真正塞进页面，分两步： */
  const navRoot = document.getElementById('navbar');   // 【const】每个页面都留了一个空壳 <div id="navbar"></div>。
  if (navRoot) navRoot.innerHTML = navHTML;            // 【if】把导航栏 HTML 塞进这个空壳里。
  document.body.insertAdjacentHTML('beforeend', modalHTML);
                                                  // 【insertAdjacentHTML】在指定位置插入 HTML。
                                                  // 'beforeend' = 插到 body 内部的末尾（也就是页面最后）。
                                                  // 和 innerHTML 的区别：innerHTML 会覆盖原有内容，这个只是追加。

  /* ========== 3. 元素引用 ========== */
  /* 导航栏和弹窗刚插进页面，现在才能按 id 找到它们。
     先把常用的元素统统存进变量，后面用起来就短一些：直接写 themeBtn，不用每次都 getElementById。
     注意：这些元素必须在上面插入 HTML 之后才存在，顺序不能颠倒。 */
  const themeBtn  = document.getElementById('themeBtn');     // 主题切换按钮（太阳/月亮）
  const themeIcon = document.getElementById('themeIcon');    // 按钮里的那个图标 <svg>
  const loginBtn  = document.getElementById('loginBtn');     // 顶部「登录」按钮
  const avatarBox = document.getElementById('userAvatar');   // 登录后显示的头像链接
  const gearBtn   = document.getElementById('gearBtn');      // 齿轮按钮
  const gearMenu  = document.getElementById('gearMenu');     // 齿轮展开的菜单
  const gearLogout = document.getElementById('gearLogout');  // 菜单里的「退出登录」
  const gearEmpty  = document.getElementById('gearEmpty');   // 菜单里的「请先登录」提示
  const modal     = document.getElementById('loginModal');   // 登录弹窗整体
  const closeBtn  = document.getElementById('loginClose');   // 弹窗的关闭按钮
  const userInput = document.getElementById('loginUser');    // 用户名输入框
  const passInput = document.getElementById('loginPass');    // 密码输入框
  const loginSubmit    = document.getElementById('loginSubmit');     // 「登录」按钮
  const registerSubmit = document.getElementById('registerSubmit');  // 「注册」按钮
  const msgBox    = document.getElementById('loginMsg');     // 弹窗里的提示文字
  const adminBtn  = document.getElementById('adminBtn');     // 后台入口按钮
  const mailWrap  = document.getElementById('mailWrap');     // 信箱整体（按钮 + 下拉面板）
  const mailBtn   = document.getElementById('mailBtn');      // 信箱按钮（信封图标）
  const mailPanel = document.getElementById('mailPanel');    // 信箱下拉面板
  const mailDot   = document.getElementById('mailDot');      // 信封右上角的未读小红点

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
  /* 为什么不用普通的 <a> 直接跳？因为想做一个「淡出再跳」的效果，显得不那么生硬。 */
  if (adminBtn) {                                     // 【if】按钮存在才绑事件。
    adminBtn.addEventListener('click', function (e) {   // 【事件】点击时执行。这里用 function 而不是箭头函数，
                                                        // 因为下面要用 this —— 箭头函数没有自己的 this。
      e.preventDefault();                             // 【方法】阻止链接的默认跳转行为（不然页面立刻就跑了，看不到淡出）。
      const href = this.getAttribute('href');          // 【this】= 被点击的那个元素本身（adminBtn）。
                                                        // getAttribute('href') = 读出它身上 href 属性的值。
      document.body.style.transition = 'opacity .18s'; // 给整页加一条过渡：opacity 变化时用 0.18 秒平滑过去。
      document.body.style.opacity = '0';               // 把整页改成全透明（开始淡出）。
      setTimeout(() => { location.href = href; }, 180);   // 等 180 毫秒（和上面的过渡时长对齐）再真跳转。
                                                          // location.href = 地址 = 让浏览器去那个页面。
    });
  }

  /* ========== 8. 齿轮菜单 ========== */
  /* 这是「点一下打开、点别处关掉」的经典套路：
     打开按钮上要 stopPropagation（阻止事件往上冒），否则同一瞬间就被下面的「点别处关掉」给关了。 */
  gearBtn.addEventListener('click', e => {            // 【事件】点齿轮。
    e.stopPropagation();                              // 【事件对象】stopPropagation = 阻止事件继续往上冒泡，
                                                      // 不然会立刻触发 document 上的「点一下就关」。
    closeMail();                                      // 先把信箱面板收起，两个浮层别叠一起。
    gearMenu.classList.toggle('show');                // 【classList.toggle】有 show 类就去掉，没有就加上 ——
                                                      // 一行实现「开/关」切换。
  });
  document.addEventListener('click', e => {           // 在整个页面上监听点击（因为点哪里都要判断）。
    gearMenu.classList.remove('show');                // 任何点击都先关齿轮菜单。
    // 点信箱面板里面（滚动、看内容）不该把它关掉
    if (!e.target.closest('.mail-wrap')) closeMail(); // 【closest】从被点的元素开始，往上层找最近的
                                                      // 「带 .mail-wrap 的祖先元素」，找到就返回它，找不到返回 null。
                                                      // 所以 !e.target.closest('.mail-wrap') = 「点的不是信箱区域」→ 才关信箱。
  });
  document.addEventListener('keydown', e => {         // 【事件】键盘按下。
    if (e.key === 'Escape') { gearMenu.classList.remove('show'); closeMail(); closeMailModal(); }
                                                      // 按 Esc 一键收起所有浮层，符合用户习惯。
  });
  gearLogout.addEventListener('click', async () => {  // 【async】退出登录要发请求，所以是异步。
    await SBAPI.signOut();                            // 【await】等后端把会话清掉（清本地 token）。
    location.reload();                                // 刷新页面，让所有状态回到未登录。
  });

  /* ========== 9. 信箱（被点赞 / 被回复 / 举报结果）========== */
  function esc(s) {                                   // 【function】转义函数（和 main.js 里那个一样，每个文件各写一份，避免依赖）。
    return String(s == null ? '' : s)                 // 【return】【三元】空值 → 空字符串，其余 → 转成字符串。
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                                                      // 连续调用四次 replace，把 & < > 换成 HTML 实体。
                                                      // 注意 & 必须第一个换，否则会把后面生成的 &amp; 里的 & 又换一遍。
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');   // 再换双引号和单引号，防止属性被截断。
  }

  /* 信箱五栏：我的点赞 / 我的回复 / 我的@ / 我的举报 / 系统消息 */
  const CATS = [                                      // 【const】一个数组，每一项描述一个栏目。
    { key: 'like',    label: '我的点赞', ico: '♥', cls: 'like',    empty: '还没有人赞过你的留言' },
                                                      // key = 后端数据里的类型值（用来筛选）；
                                                      // label = 显示的名字；ico = 图标字符；cls = CSS 类名（决定颜色）；
                                                      // empty = 这一栏没有消息时显示的文案。
    { key: 'reply',   label: '我的回复', ico: '↩', cls: 'reply',   empty: '还没有人回复过你' },
    { key: 'mention', label: '我的@',    ico: '@', cls: 'mention', empty: '还没有人在留言里 @ 过你' },
    { key: 'report',  label: '我的举报', ico: '!', cls: 'report',  empty: '你还没有举报过谁' },
    { key: 'system',  label: '系统消息', ico: '⚙', cls: 'system',  empty: '没有系统消息' }
  ];

  let mailAll = [];        // 【let】后端给的全部通知，切栏目时在这里面筛
  let mailKey = 'like';    // 【let】小窗现在开着哪一栏（默认点赞那一栏）

  function mailLine(n) {                              // 【function】把一条通知变成一行文字。n = 这一条通知对象。
    const who = '<b>' + esc(n.fromName || '有人') + '</b>';   // 【const】发起人名字，用 <b> 加粗。
                                                              // n.fromName || '有人'：没名字就显示「有人」。
    if (n.type === 'like')    return who + ' 赞了你的留言';    // 【if】按类型拼不同的话；【return】直接交出结果。
    if (n.type === 'mention') return who + ' 在留言里 @ 了你';
    if (n.type === 'report')  return '你的举报处理好了：<b>' + esc(n.action || '') + '</b>';
    if (n.type === 'system')  return esc(n.note || '有一条系统消息');
    return who + ' 回复了你的留言';                        // 上面都没命中时，默认当成「回复」。
  }

  function mailIcon(type) {                           // 【function】按类型返回一个带颜色的小图标 HTML。
    if (type === 'like')    return '<span class="mail-ico like">♥</span>';
    if (type === 'mention') return '<span class="mail-ico mention">@</span>';
    if (type === 'report')  return '<span class="mail-ico report">!</span>';
    if (type === 'system')  return '<span class="mail-ico system">⚙</span>';
    return '<span class="mail-ico reply">↩</span>';    // 默认回复图标。
  }

  function mailItemHTML(n) {                          // 【function】把一条通知变成一行 HTML。n = 一条通知对象。
    const cls = 'mail-item' + (n.read ? '' : ' new');  // 【const】CSS 类名：基础类 + （已读 ? 什么都不加 : 加一个 new）。
                                                       // n.read 为 true 表示已读；没读的会多一个 new 类，样式上加个高亮。
    const body = mailIcon(n.type) +                    // 【const】拼出这一行的「主体」：左边小图标
      '<div class="mail-body">' +
        '<div class="mail-line">' + mailLine(n) + '</div>' +   // 中间那句话（谁赞了你…）
        (n.text ? '<div class="mail-ex">' + esc(String(n.text).slice(0, 80)) + '</div>' : '') +
                                                       // 那行灰色原文预览：
                                                       // n.text ? ... : '' = 有原文才显示，没有就留空（三元运算）。
                                                       // String(...) 保证是字符串才能 .slice();
                                                       // slice(0, 80) 只取前 80 个字符，太长会撑破布局。
        '<div class="mail-time">' + esc(n.time || '') + '</div>' +   // 时间；没有就给空字符串。
      '</div>';
    // href 由后端算好（能回复的就带上 ?reply= 和 @对象）
    return n.href                                      // 【return】【三元】最终决定这一行是「能点的链接」还是「普通块」：
      ? '<a class="' + cls + '" href="' + esc(n.href) + '">' + body + '</a>'   // 有 href → 用 <a> 包起来，点了能跳过去回复。
      : '<div class="' + cls + '">' + body + '</div>';                        // 没有 → 用 <div>，不可点。
  }

  function paintDot() {                               // 【function】画信封右上角的小红点（未读数量）。
    if (!mailDot) return;                             // 【if】元素不存在就退出。
    const un = mailAll.filter(n => !n.read).length;    // 【const】筛选出所有未读，再取长度 = 未读条数。
                                                       // filter 不改变原数组，只是筛一份新的。
    mailDot.textContent = un > 99 ? '99+' : String(un);   // 【三元】超过 99 就显示 99+，否则显示真实数字。
                                                          // String() 是必要的：textContent 赋值会隐式转换，但显式写更清楚。
    mailDot.style.display = un > 0 ? 'inline-flex' : 'none';   // 【三元】有未读才显示，没未读藏起来。
  }

  /* 信箱下拉里那五栏，右边的数字是未读数（都读过了就显示总数） */
  function renderCats() {                             // 【function】画下拉面板里的五个栏目按钮。
    const box = document.getElementById('mailCats');   // 【const】装五栏的容器。
    if (!box) return;                                 // 【if】没有就退出。
    if (!mailAll.length) { box.innerHTML = '<p class="mail-empty">还没有消息</p>'; return; }
                                                      // 【if】一条消息都没有 → 显示占位文字，然后【return】结束。
    /* 下面用 map + join 拼 HTML，这是「批量生成列表」的标准套路：
       map：把每栏数据变成一个 HTML 字符串（得到数组）
       join('')：把数组拼成一个长字符串（中间不加任何分隔符） */
    box.innerHTML = CATS.map(c => {                   // CATS.map(函数) → 遍历五个栏目，c 是当前这一栏的数据对象。
      const items = mailAll.filter(n => (n.type || 'reply') === c.key);
                                                      // 【const】这一栏的所有消息（老数据没 type 就按回复算）。
      const un = items.filter(n => !n.read).length;    // 【const】其中未读有几条。
      // 看过了（没有未读）就干脆不挂数字，别老顶着个圆圈
      const badge = un                                // 【const】小红圈 HTML：有未读才生成。
        ? '<span class="mail-cat-n">' + (un > 99 ? '99+' : un) + '</span>'   // 三元套三元：超过 99 显示 99+
        : '';                                          // 没有未读 → 空字符串（等于什么都不加）。
      return '<button type="button" class="mail-cat" data-cat="' + c.key + '">' +
             // data-cat 是「自定义属性」：把栏目名存进 DOM，点击时能通过 dataset 读出来。
        '<span class="mail-ico ' + c.cls + '">' + c.ico + '</span>' +     // 图标（颜色由 c.cls 决定）
        '<span class="mail-cat-label">' + c.label + '</span>' +           // 栏目名
        badge +                                                           // 未读小红圈（可能为空）
        '<span class="mail-cat-go">›</span>' +                            // 右边的 › 箭头，暗示「能点进去」
      '</button>';
    }).join('');                                      // 【join('')】把五段 HTML 拼成一整段，空字符串表示中间不加分隔符。
  }

  function renderMail() {                             // 【function】重画整个信箱（红点 + 五栏）。
    paintDot();                                       // 先画红点。
    renderCats();                                     // 再画五栏。
  }                                                   // 把「哪些要一起变」收在一个函数里，改数据后只调它一个就行。

  /* 小窗内容（只画，不负责开关） */
  function paintModal() {                             // 【function】画弹出的小窗内容。
    const c = CATS.filter(x => x.key === mailKey)[0];  // 【const】从五个栏目里找出当前这一栏。
                                                       // filter 返回数组，[0] 取第一个（也就是唯一那个）。
                                                       // 这是「按条件找一个」的常见写法（用 find 也行）。
    const title = document.getElementById('mailModalTitle');   // 小窗标题
    const body  = document.getElementById('mailModalBody');    // 小窗内容区
    if (!c || !title || !body) return;                 // 【if】三者缺一个就退出，防止报错。

    const items = mailAll.filter(n => (n.type || 'reply') === c.key);   // 【const】这一栏的所有消息。
    title.textContent = c.label + (items.length ? '（' + items.length + '）' : '');
                                                       // 【三元】有消息就显示「我的点赞（3）」，没有就只显示名字。
    body.innerHTML = items.length                      // 【三元】有消息 → 逐条生成 HTML；没消息 → 显示空状态文案。
      ? items.map(mailItemHTML).join('')               // 【map】注意这里直接写了函数名 mailItemHTML：
                                                       // map 会把每条消息依次传给它，不用写成 n => mailItemHTML(n)。
      : '<p class="mail-empty">' + c.empty + '</p>';   // c.empty 就是 CATS 里配的那句「还没有人赞过你的留言」。
  }

  /* 点某一栏 → 弹小窗看详细内容，看过就算已读 */
  function openCat(key) {                             // 【function】打开某一类消息（key = like / reply / mention…）。
    if (!CATS.some(x => x.key === key)) return;       // 【if】.some(条件) = 数组里「有没有任意一项满足条件」。
                                                      // 这里判断 key 是不是合法栏目；不合法就【return】退出，防止乱传参数。
    mailKey = key;                                    // 记住当前看的是哪一栏（小窗刷新时要用）。

    const modal = document.getElementById('mailModal');   // 【const】找消息小窗那个元素。
    if (!modal) return;                               // 【if】页面上没有就退出。
    paintModal();                                     // 先把内容画好，再显示，避免闪一下空白。
    modal.classList.add('show');                      // 【classList.add】加上 show 类 = CSS 里控制它显示出来。
    closeMail();                                      // 收起下拉面板，两者别同时开。

    const unreadIds = mailAll                         // 【const】准备「哪些消息要标记已读」：
      .filter(n => (n.type || 'reply') === key && !n.read)   // 【filter】筛出「属于这一栏、并且还没读」的。
                                                      // (n.type || 'reply')：老数据可能没有 type 字段，默认当回复处理。
      .map(n => n.id);                                // 【map】把筛出来的每条通知，转成它的 id（只留 id 传给后端）。
    if (!unreadIds.length) return;                    // 【if】没有未读，就不用发请求了。
    mailAll.forEach(n => { if ((n.type || 'reply') === key) n.read = true; });   // 本地先把这一栏全部标记成已读，
                                                                                // 界面立刻更新，不用等服务器。
    renderMail();                                     // 重画（红点数字会跟着变）。
    markRead({ ids: unreadIds });                     // 再告诉服务器「这些 id 我读过了」。
                                                      // { ids: unreadIds } 是对象字面量，作为参数打包传进去。
  }

  function closeMailModal() {                         // 【function】关掉消息小窗。
    const modal = document.getElementById('mailModal');
    if (modal) modal.classList.remove('show');        // 去掉 show 类 = 隐藏。
  }

  async function markRead(payload) {                  // 【async】发给后端标记已读。payload = 要传的数据。
    try { await SBAPI.markRead(payload); } catch { /* 忽略 */ }
                                                      // 【try/catch】标记失败不影响界面（本地已经标过了），
                                                      // 所以静默吞掉错误，避免弹窗打扰。
  }

  let mailBusy = false;                               // 【let】「正在请求中」的开关，防止同时发多个请求。
  async function loadMail() {                         // 【async】拉取信箱数据。
    const s = await SBAPI.getSession();               // 【await】先确认登录状态。
    if (!s || mailBusy) return;                       // 【if】没登录、或正在请求 → 直接退出（这就是防抖）。
    mailBusy = true;                                  // 上锁。
    try {                                             // 【try】下面可能失败。
      const d = await SBAPI.getNotifications();       // 【await】向后端要通知列表。
      if (!d || !d.ok) return;                        // 【if】失败就退出（但 finally 仍会执行，锁会解开）。
      mailAll = d.list || [];                         // 存进变量；万一 list 不存在，给空数组兜底。
      renderMail();                                   // 重画红点和五栏。

      // 信箱一打开就算「看过了」，红圈数字不再一直挂着
      if (mailPanel && mailPanel.classList.contains('show') && mailAll.some(n => !n.read)) {
                                                      // 【if】三个条件：
                                                      // ① 面板元素存在；
                                                      // ② 面板正开着（有 show 类）；
                                                      // ③ 里面有未读（some 只要有一条未读就为真）。
        mailAll.forEach(n => { n.read = true; });     // 全部标记已读。
        renderMail();                                 // 重画。
        markRead({ all: true });                      // 告诉服务器「全读了」。
      }

      // 小窗正开着的话跟着刷新（比如刚处理完举报）
      const modal = document.getElementById('mailModal');
      if (modal && modal.classList.contains('show')) paintModal();   // 【if】小窗开着就重画内容，保持同步。
    } catch {
      /* 隧道抖一下就忽略，点开信箱时会重试 */
    } finally {                                       // 【finally】不管成功失败，最后一定执行。
      mailBusy = false;                               // 解锁，否则以后再也拉不到消息了。
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
  /* 登录和注册共用同一个弹窗、同一个输入框，只是点了不同按钮走不同接口。
     这是很常见的省事做法：少写一套界面，用户也不用跳页。 */
  function openModal() {                               // 【function】打开登录弹窗。
    modal.classList.add('show');                       // 【classList.add】加上 show 类 → CSS 里 .login-modal.show 才显示出来。
    msgBox.textContent = '';                           // 清空上次的提示文字。
    msgBox.className = 'login-msg';                    // 类名复位（去掉上一轮的 ok / err 颜色）。
  }
  function closeModal() {                              // 【function】关闭弹窗。
    modal.classList.remove('show');                    // 【classList.remove】去掉 show 类 → 隐藏。
    userInput.value = '';                              // 【value】输入框里的内容，赋空 = 清空。
    passInput.value = '';                              // 密码也清空 —— 安全习惯：密码不留在页面上。
    msgBox.textContent = '';
    msgBox.className = 'login-msg';
  }
  loginBtn.addEventListener('click', openModal);       // 顶部「登录」按钮 → 打开弹窗。
  closeBtn.addEventListener('click', closeModal);      // 弹窗右上角 × → 关闭。
  modal.addEventListener('click', e => {               // 【事件】点弹窗区域。
    if (e.target === modal) closeModal();              // 【if】e.target = 真正被点的那个元素：
                                                       // 如果点的就是遮罩本身（而不是里面的白框），才关闭。
                                                       // 这是判断「点里还是点外」最常用的技巧。
  });
  document.addEventListener('keydown', e => {          // 【事件】键盘按下。
    if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();   // 【if】Esc 且弹窗开着 → 关闭。
  });

  function showMsg(text, ok) {                         // 【function】弹窗里的提示行。ok = true 绿字，false 红字。
    msgBox.textContent = text;
    msgBox.className = 'login-msg ' + (ok ? 'ok' : 'err');   // 拼接类名：中间的空格不能少，
                                                             // 否则会拼成 login-msgok 这种根本不存在的类名，样式就不生效。
  }

  loginSubmit.addEventListener('click', async () => {   // 【事件 + async】点「登录」，要发请求所以是异步。
    const username = userInput.value.trim();            // 【const】取用户名并去掉首尾空格。
    const password = passInput.value;                   // 【const】取密码（不能 trim，空格也可能属于密码）。
    if (!username || !password) return showMsg('用户名密码必填', false);
                                                        // 【if】有一个为空就提示；【return】立刻结束函数。
                                                        // return showMsg(...) = 先执行 showMsg，再把它的返回值（undefined）交出去并结束。
    try {                                               // 【try】请求可能出错。
      const { data, error } = await SBAPI.signIn(username, password);
                                                        // 【解构赋值】把返回对象里的 data、error 两个字段直接拆成两个变量。
                                                        // 等价于：const r = await ...; const data = r.data; const error = r.error;
                                                        // 【await】等登录结果。
      if (error) return showMsg(error.message || '登录失败', false);
                                                        // 【if】有错误就显示原因（优先用后端返回的 message，没有就用默认文案）。
      showMsg('登录成功', true);                          // 走到这里 = 成功。
      setTimeout(() => location.reload(), 400);          // 【setTimeout】等 400 毫秒（让用户看清提示）再刷新整页。
                                                         // 为什么刷新？导航栏、权限、内容都要按登录状态重画，
                                                         // 刷一次最省事、最不容易出 bug。
    } catch {                                            // 【catch】断网、跨域这类网络层错误。
      showMsg('网络错误，请重试', false);
    }
  });

  registerSubmit.addEventListener('click', async () => {   // 【事件 + async】点「注册」。
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) return showMsg('用户名密码必填', false);
    try {
      const { data, error } = await SBAPI.signUp(username, password);   // 【解构】这次调的是注册接口。
      if (error) return showMsg(error.message || '注册失败', false);
      if (!data.session) {                                // 【if】注册成功但没拿到 session：
                                                          // 说明 Supabase 开了「邮箱验证」，要先去邮箱点确认链接。
        showMsg('注册成功，请去邮箱完成验证后再登录', true);
      } else {                                            // 否则就是没开邮箱验证，已经直接登录了。
        showMsg('注册成功，已自动登录', true);
        setTimeout(() => location.reload(), 400);         // 刷新，让界面切到已登录状态。
      }
    } catch {
      showMsg('网络错误，请重试', false);
    }
  });

  passInput.addEventListener('keydown', e => {         // 【事件】在密码框里按键。
    if (e.key === 'Enter') loginSubmit.click();        // 【if】按回车 = 点一下「登录」按钮。
                                                      // .click() 让元素「假装被点」，会触发它绑定的所有事件。
  });
})();                                                  // 最外层 IIFE 结束：} 关闭函数体，) 关闭包裹括号，() 表示执行。