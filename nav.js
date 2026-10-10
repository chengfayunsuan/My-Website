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
  }
  function showLoggedOut() {
    loginBtn.style.display = '';
    avatarBox.style.display = 'none';
    gearLogout.style.display = 'none';
    gearEmpty.style.display = 'block';
    if (adminBtn) adminBtn.style.display = 'none';
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
    gearMenu.classList.toggle('show');
  });
  document.addEventListener('click', () => gearMenu.classList.remove('show'));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') gearMenu.classList.remove('show');
  });
  gearLogout.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    location.reload();
  });

  /* ========== 9. 登录弹窗 ========== */
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