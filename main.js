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

/* ---------- 4. 导航登录状态 ---------- */
(async function checkLogin() {
  const token = localStorage.getItem('token');
  const loginBtn = document.getElementById('loginBtn');
  const avatarBox = document.getElementById('userAvatar');

  if (!token) return;   // 没 token，保持显示"登录"按钮

  try {
    const res = await fetch('https://api.chengfa.dpdns.org/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();

    if (data.ok) {
      // token 有效 → 显示头像
      loginBtn.style.display = 'none';
      avatarBox.style.display = 'block';
    } else {
      // token 失效（比如后端删了这个用户）→ 清掉，显示登录
      localStorage.removeItem('token');
      localStorage.removeItem('username');
    }
  } catch {
    // 请求失败（后端挂了/断网）→ 保持原样，不折腾用户
  }
})();