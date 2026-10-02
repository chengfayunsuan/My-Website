/* ---------- 5. 更新日志 ---------- */
(function () {
  // ===== 在这改你的日志，从上到下 = 从新到旧 =====
  const logs = [
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

  const PAGE = 5;          // 每次显示/加载几条
  let shown = 0;

  const listEl = document.getElementById('logList');
  const moreBtn = document.getElementById('logMore');
  if (!listEl || !moreBtn) return;   // 不在首页就跳过

  function renderMore() {
    const next = logs.slice(shown, shown + PAGE);
    next.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="log-date">${item.date}</span>
        <span class="log-text">${item.text}</span>
      `;
      listEl.appendChild(li);
    });
    shown += next.length;

    if (shown >= logs.length) {
      moreBtn.disabled = true;
      moreBtn.textContent = '没有更多了';
    }
  }

  renderMore();   // 先显示第一批

  moreBtn.addEventListener('click', renderMore);
})();