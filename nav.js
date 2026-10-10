(function () {
  const API = window.API_BASE || 'https://api.chengfa.dpdns.org';

  /* 头像字段有两种可能：新后端给完整网址（…/avatar/uid1.jpg?v=123），
     旧后端只给文件名（uid1.jpg）。两种都要能正常显示。 */
  function fixAvatar(a) {
    if (!a) return '/avatar-default.jpg';
    let s = a;
    if (!s.startsWith('data:') && !s.startsWith('/') && !/^https?:\/\//.test(s)) {
      s = API.replace(/\/+$/, '') + '/avatar/' + s;
    }
    if (s.indexOf('"') !== -1 || s.indexOf('<') !== -1) return '/avatar-default.jpg';
    return s;
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
  const moonSVG = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  const sunSVG  = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>';

  const forceDark = document.body.hasAttribute('data-force-dark');

  if (forceDark || localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
    themeIcon.innerHTML = sunSVG;
  }
  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    themeIcon.innerHTML = isDark ? sunSVG : moonSVG;
    if (!forceDark) {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }
  });

  /* ========== 5. 获取 IP ========== */
  fetch('https://api.ip.sb/ip')
    .then(r => r.text())
    .then(ip => {
      const el = document.getElementById('ip');
      if (el) el.textContent = ip.trim();
    })
    .catch(() => {
      const el = document.getElementById('ip');
      if (el) el.textContent = '获取失败';
    });

  /* ========== 6. 登录状态判断 ========== */
  function showLoggedIn(role, avatar, uid) {
    loginBtn.style.display = 'none';
    avatarBox.style.display = 'block';
    gearLogout.style.display = 'block';
    gearEmpty.style.display = 'none';

    // 头像点进去 = 自己的主页
    if (uid) {
      avatarBox.href = '/profile/?uid=' + uid;
      avatarBox.title = '我的主页';
    }

    const navAvatarImg = document.getElementById('avatarImg');
    if (navAvatarImg && avatar) navAvatarImg.src = fixAvatar(avatar);

    if (adminBtn) {
      adminBtn.style.display = (role === 'owner' || role === 'admin') ? 'flex' : 'none';
    }
    if (mailWrap) mailWrap.style.display = 'block';
    loadMail();               // 看一眼有没有未读，好显示小红点
  }
  function showLoggedOut() {
    loginBtn.style.display = '';
    avatarBox.style.display = 'none';
    gearLogout.style.display = 'none';
    gearEmpty.style.display = 'block';
    if (adminBtn) adminBtn.style.display = 'none';
    if (mailWrap) mailWrap.style.display = 'none';
    if (mailPanel) mailPanel.classList.remove('show');
    if (mailDot) mailDot.style.display = 'none';
    mailAll = [];
    const mm = document.getElementById('mailModal');
    if (mm) mm.classList.remove('show');
  }

  async function checkLogin() {
    const token = localStorage.getItem('token');
    if (!token) return showLoggedOut();
    try {
      const res = await fetch(API + '/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      if (data.ok) {
        showLoggedIn(data.role, data.avatar, data.uid);
        const name = localStorage.getItem('username');
        const navAvatarImg = document.getElementById('avatarImg');
        if (name && navAvatarImg) navAvatarImg.alt = name;
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        showLoggedOut();
      }
    } catch {
      showLoggedOut();
    }
  }
  checkLogin();

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
  gearLogout.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
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
      const badge = un
        ? '<span class="mail-cat-n">' + (un > 99 ? '99+' : un) + '</span>'
        : '<span class="mail-cat-n zero">' + items.length + '</span>';
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
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      await fetch(API + '/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(payload)
      });
    } catch { /* 隧道抖一下就忽略，下次打开信箱还会显示未读 */ }
  }

  let mailBusy = false;
  async function loadMail() {
    const token = localStorage.getItem('token');
    if (!token || mailBusy) return;
    mailBusy = true;
    try {
      const res = await fetch(API + '/notifications', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const d = await res.json();
      if (!d || !d.ok) return;
      mailAll = d.list || [];
      renderMail();
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
      const res = await fetch(API + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!data.ok) return showMsg(data.error || '登录失败', false);
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      localStorage.setItem('uid', data.uid || '');
      location.reload();
    } catch {
      showMsg('网络错误，请重试', false);
    }
  });

  registerSubmit.addEventListener('click', async () => {
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) return showMsg('用户名密码必填', false);
    try {
      const res = await fetch(API + '/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!data.ok) return showMsg(data.error || '注册失败', false);
      showMsg('注册成功，请登录', true);
    } catch {
      showMsg('网络错误，请重试', false);
    }
  });

  passInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginSubmit.click();
  });
})();