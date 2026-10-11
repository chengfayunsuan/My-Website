/* ---------- 5. 更新日志 ---------- */
(function () {
  // ===== 后端连不上时用的兜底日志（从上到下 = 从新到旧）=====
  const FALLBACK = [
    { date: '2026-10-02', text: '加了首页登录弹窗和导航栏头像' },
    { date: '2026-10-02', text: '留言板接入登录验证' },
    { date: '2026-10-01', text: '后端接入 Cloudflare Tunnel，外网可访问' },
    { date: '2026-10-01', text: '完成登录/注册功能' },
    { date: '2026-09-30', text: '小工具集上线（12 个 JS 小程序）' },
    { date: '2026-09-30', text: '天气预报页面完成' },
    { date: '2026-09-29', text: '鼠标拖尾特效完成' },
    { date: '2026-09-29', text: '网站第一次部署到 Cloudflare Pages' },
  ];
  // =============================================

  const PAGE = 5;                     // 每次显示 / 加载几条
  const API = window.API_BASE || '';
  let logs = [];
  let shown = 0;

  const listEl = document.getElementById('logList');
  const moreBtn = document.getElementById('logMore');
  if (!listEl || !moreBtn) return;    // 不在首页就跳过

  const addBtn = document.getElementById('logAdd');
  const editor = document.getElementById('logEditor');
  const input = document.getElementById('logInput');
  const submitBtn = document.getElementById('logSubmit');
  const cancelBtn = document.getElementById('logCancel');
  const msgEl = document.getElementById('logEditorMsg');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ---------- 渲染 ---------- */
  function renderMore() {
    const next = logs.slice(shown, shown + PAGE);
    next.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="log-date">${esc(item.date)}</span>
        <span class="log-text">${esc(item.text)}</span>
      `;
      listEl.appendChild(li);
    });
    shown += next.length;

    if (shown >= logs.length) {
      moreBtn.disabled = true;
      moreBtn.textContent = '没有更多了';
    }
  }

  function draw() {
    shown = 0;
    listEl.innerHTML = '';
    moreBtn.disabled = false;
    moreBtn.textContent = '加载更多';

    if (!logs.length) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="log-text">还没有更新日志</span>';
      listEl.appendChild(li);
      moreBtn.disabled = true;
      moreBtn.textContent = '没有更多了';
      return;
    }
    renderMore();
  }

  /* ---------- 从后端拿日志 ---------- */
  async function fetchLogs() {
    try {
      const res = await fetch(API + '/logs');
      const data = await res.json();
      if (Array.isArray(data)) return data;
    } catch { /* 后端没起来就用兜底那份 */ }
    return null;
  }

  /* ---------- 只有站长 / 管理员才显示「添加」按钮 ---------- */
  async function checkAdmin() {
    if (!addBtn) return;
    const token = localStorage.getItem('token');
    if (!token) return;                 // 没登录 → 按钮根本不出现
    try {
      const res = await fetch(API + '/me', { headers: { Authorization: 'Bearer ' + token } });
      const me = await res.json();
      if (me && me.ok && (me.role === 'owner' || me.role === 'admin')) {
        addBtn.style.display = 'inline-flex';
      }
    } catch { /* 拿不到身份就当普通人处理 */ }
  }

  /* ---------- 发布 ---------- */
  function setMsg(t, isErr) {
    if (!msgEl) return;
    msgEl.textContent = t || '';
    msgEl.className = 'log-editor-msg' + (isErr ? ' err' : ' ok');
  }

  function closeEditor() {
    if (editor) editor.style.display = 'none';
    setMsg('');
  }

  async function submit() {
    const text = ((input && input.value) || '').trim();
    if (!text) { setMsg('写点内容再发布', true); return; }

    const token = localStorage.getItem('token');
    if (!token) { setMsg('请先登录', true); return; }

    submitBtn.disabled = true;
    setMsg('发布中…');
    try {
      const res = await fetch(API + '/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (!data.ok) {
        submitBtn.disabled = false;
        setMsg(data.error || '发布失败', true);
        return;
      }

      logs.unshift({ date: data.date, text: data.text });   // 直接插到最新的一条
      draw();
      if (input) input.value = '';
      submitBtn.disabled = false;
      closeEditor();
    } catch {
      submitBtn.disabled = false;
      setMsg('网络错误，发布失败', true);
    }
  }

  /* ---------- 事件 ---------- */
  moreBtn.addEventListener('click', renderMore);

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const open = editor.style.display !== 'none';
      if (open) { closeEditor(); return; }
      editor.style.display = 'block';
      setMsg('');
      if (input) input.focus();
    });
  }
  if (cancelBtn) cancelBtn.addEventListener('click', closeEditor);
  if (submitBtn) submitBtn.addEventListener('click', submit);
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();   // Ctrl+Enter 快速发布
    });
  }

  /* ---------- 启动 ---------- */
  (async () => {
    const remote = await fetchLogs();
    logs = (remote && remote.length) ? remote : FALLBACK;
    draw();
    checkAdmin();
  })();
})();
