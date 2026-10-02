/* ---------- 1. 获取访客 IP ---------- */
fetch('https://ipv4.icanhazip.com')
  .then(r => r.text())
  .then(ip => {
    document.getElementById('ip').textContent = ip.trim();
  })
  .catch(() => {
    document.getElementById('ip').textContent = '获取失败';
  });

/* ---------- 2. 主题切换 ---------- */
const themeBtn  = document.getElementById('themeBtn');
const themeIcon = document.getElementById('themeIcon');

const moonSVG = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
const sunSVG  = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>';

// 初始化：读 localStorage
if (localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark');
  themeIcon.innerHTML = sunSVG;
}

themeBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  themeIcon.innerHTML = isDark ? sunSVG : moonSVG;
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

/* ---------- 3. Logo 平滑回顶 ---------- */
document.querySelector('.logo').addEventListener('click', e => {
  e.preventDefault();
  location.href = '/';   // ← 这一行改成滚动
});

/* ---------- 4. 导航登录状态 + 弹窗 ---------- */
(function () {
  const API = 'https://api.chengfa.dpdns.org';
  const loginBtn   = document.getElementById('loginBtn');
  const avatarBox  = document.getElementById('userAvatar');
  const modal      = document.getElementById('loginModal');
  const closeBtn   = document.getElementById('loginClose');
  const userInput  = document.getElementById('loginUser');
  const passInput  = document.getElementById('loginPass');
  const loginSubmit    = document.getElementById('loginSubmit');
  const registerSubmit = document.getElementById('registerSubmit');
  const msgBox     = document.getElementById('loginMsg');

  /* --- 显示状态切换 --- */
  function showLoggedIn() {
    loginBtn.style.display = 'none';
    avatarBox.style.display = 'block';
  }
  function showLoggedOut() {
    loginBtn.style.display = '';
    avatarBox.style.display = 'none';
  }

  /* --- 检查本地 token 是否有效 --- */
  async function checkLogin() {
    const token = localStorage.getItem('token');
    if (!token) return showLoggedOut();
    try {
      const res = await fetch(API + '/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      if (data.ok) showLoggedIn();
      else {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        showLoggedOut();
      }
    } catch {
      // 后端没响应，保持原样
    }
  }

  /* --- 弹窗开关 --- */
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

  /* --- 提示 --- */
  function showMsg(text, ok) {
    msgBox.textContent = text;
    msgBox.className = 'login-msg ' + (ok ? 'ok' : 'err');
  }

  /* --- 登录 --- */
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
      showLoggedIn();
      closeModal();
    } catch {
      showMsg('网络错误，请重试', false);
    }
  });

  /* --- 注册 --- */
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

  /* 回车提交 */
  passInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginSubmit.click();
  });

  /* --- 启动 --- */
  checkLogin();
})();