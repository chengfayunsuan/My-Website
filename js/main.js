/* ---------- 5. 更新日志 ---------- */
/* 这一整个文件只干一件事：把首页「更新日志」那块渲染出来、并处理站长发布新日志。 */
(function () {                                    // 立即执行函数（IIFE）：变量都关在这个小房间里，不污染全局
  // ===== 后端连不上时用的兜底日志（从上到下 = 从新到旧）=====
  const FALLBACK = [                              // const 声明常量：这个数组以后不能再整体换成别的数组
    { date: '2026-10-02', text: '加了首页登录弹窗和导航栏头像' },   // 每一项是一个对象 {日期, 内容}
    { date: '2026-10-02', text: '留言板接入登录验证' },             // 逗号分隔，最后一项可以带尾逗号
    { date: '2026-10-01', text: '后端接入 Cloudflare Tunnel，外网可访问' },
    { date: '2026-10-01', text: '完成登录/注册功能' },
    { date: '2026-09-30', text: '小工具集上线（12 个 JS 小程序）' },
    { date: '2026-09-30', text: '天气预报页面完成' },
    { date: '2026-09-29', text: '鼠标拖尾特效完成' },
    { date: '2026-09-29', text: '网站第一次部署到 Cloudflare Pages' },
  ];                                              // 数组结束；分号是一条语句的收尾（JS 里大部分语句都用 ; 结尾）
  // =============================================

  const PAGE = 5;                     // 每次显示 / 加载几条（点一次「加载更多」多出 5 条）
  let logs = [];                      // let 声明可变的变量：存放全部的日志数组，后面会被真正数据替换
  let shown = 0;                      // 已经显示了多少条（用来算下一次从哪开始切）

  const listEl = document.getElementById('logList');   // 按 id 找到页面上的 <ul id="logList">，把 DOM 元素存起来
  const moreBtn = document.getElementById('logMore');  // 「加载更多」按钮
  if (!listEl || !moreBtn) return;    // 不在首页就跳过（! 是「取反」，|| 是「或者」：两个缺一个就直接退出这个函数）

  const addBtn = document.getElementById('logAdd');       // 「添加日志」按钮（只有管理员能看到）
  const editor = document.getElementById('logEditor');   // 发布日志的编辑框容器
  const input = document.getElementById('logInput');      // 里面那个输入框
  const submitBtn = document.getElementById('logSubmit'); // 发布按钮
  const cancelBtn = document.getElementById('logCancel'); // 取消按钮
  const msgEl = document.getElementById('logEditorMsg');  // 用来显示「发布中…」「失败」等提示的那行字

  function esc(s) {                                    // 转义函数：把用户输入里的特殊符号换成 HTML 实体
    return String(s == null ? '' : s)                  // s == null 会把 null 和 undefined 都算进来；有值就转成字符串
      .replace(/[&<>"']/g, c => ({                     // 正则找 & < > " ' 这五个字符，g 表示「全部替换」，不是只换第一个
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'   // 每个字符对应的安全写法
      }[c]));                                          // [c] 是按字符去上面那个对象里取值，取到什么就替换成什么
  }                                                    // 不转义的话，别人写一段 <script> 就能在你页面上执行代码（XSS 攻击）

  /* ---------- 渲染 ---------- */
  function renderMore() {                              // 再渲染 5 条到列表里
    const next = logs.slice(shown, shown + PAGE);      // slice(开始下标, 结束下标) 取一段，不修改原数组
    next.forEach(item => {                             // forEach = 对数组里每一项执行一次回调函数
      const li = document.createElement('li');         // 凭空造一个 <li> 元素（还没插进页面）
      /* 下面这段用「模板字符串」拼 HTML：反引号 ` 包起来，${表达式} 会被替换成实际值。
         重要：模板字符串内部绝对不能放注释，因为里面的每个字符都会被当成 HTML 插进页面。 */
      li.innerHTML = `
        <span class="log-date">${esc(item.date)}</span>
        <span class="log-text">${esc(item.text)}</span>
      `;
      listEl.appendChild(li);                          // appendChild = 把这个 <li> 挂到列表末尾（这时才真正显示）
    });
    shown += next.length;                              // 已显示数量往后推（next.length 是这次实际加了几条）

    if (shown >= logs.length) {                        // 全部显示完了
      moreBtn.disabled = true;                         // 按钮禁用，点不动
      moreBtn.textContent = '没有更多了';               // 顺便改按钮文字
    }
  }

  function draw() {                                    // 整个列表重画一遍（清空 + 从头渲染）
    shown = 0;                                         // 计数器归零
    listEl.innerHTML = '';                             // 清空列表（赋空字符串 = 删掉所有子元素）
    moreBtn.disabled = false;                          // 按钮恢复可点
    moreBtn.textContent = '加载更多';                   // 文字恢复

    if (!logs.length) {                                // 一条日志都没有（!数组.length 就是「长度为 0」）
      const li = document.createElement('li');         // 造一个占位 <li>
      li.innerHTML = '<span class="log-text">还没有更新日志</span>';  // 单行 HTML 直接写
      listEl.appendChild(li);                          // 插进去
      moreBtn.disabled = true;                         // 没数据就别让人点「加载更多」
      moreBtn.textContent = '没有更多了';
      return;                                          // 提前结束这个函数，后面不执行了
    }
    renderMore();                                      // 有数据就先渲染第一批 5 条
  }

  /* ---------- 从后端拿日志 ---------- */
  async function fetchLogs() {                         // async = 异步函数，里面可以用 await 等网络请求
    try {                                              // try 里出错会跳到 catch，不会让整个页面崩掉
      const data = await SBAPI.getLogs();              // 等后端返回（SBAPI 是 js/sb.js 提供的接口封装）
      if (Array.isArray(data)) return data;            // 确认拿到的确实是数组才用，防止后端返回错误格式
    } catch { /* 忽略 */ }                              // 出错就当没拿到（不弹窗打扰用户）
    return null;                                       // 返回 null 表示「没拿到」，交给下面用兜底数据
  }

  /* ---------- 只有站长 / 管理员才显示「添加」按钮 ---------- */
  async function checkAdmin() {
    if (!addBtn) return;                               // 页面上压根没这个按钮就退出
    const s = await SBAPI.getSession();                // 问一句：现在有人登录吗？
    if (!s) return;                                     // 没登录 → 按钮根本不出现
    try {
      const me = await SBAPI.me();                     // 拿当前登录用户的资料（里面有 role 角色字段）
      if (me && me.ok && (me.role === 'owner' || me.role === 'admin')) {   // 站长或管理员才放行
        addBtn.style.display = 'inline-flex';          // 显示按钮（CSS 里默认是 display:none 藏起来的）
      }
    } catch { /* 拿不到身份就当普通人处理 */ }
  }

  /* ---------- 发布 ---------- */
  function setMsg(t, isErr) {                          // 统一设置提示文字
    if (!msgEl) return;
    msgEl.textContent = t || '';                       // t 为空时写空字符串（避免显示 undefined）
    msgEl.className = 'log-editor-msg' + (isErr ? ' err' : ' ok');  // 三元运算：错就加 err 类（红），对就加 ok 类（绿）
  }

  function closeEditor() {                             // 收起编辑框
    if (editor) editor.style.display = 'none';         // display:none = 从页面上隐藏（但元素还在）
    setMsg('');                                        // 顺手清掉提示文字
  }

  async function submit() {                            // 点「发布」时执行
    const text = ((input && input.value) || '').trim();  // 取输入框内容并去掉首尾空格；input 不存在时用空字符串兜底
    if (!text) { setMsg('写点内容再发布', true); return; }  // 空内容不让发

    const s = await SBAPI.getSession();                // 先确认登录状态
    if (!s) { setMsg('请先登录', true); return; }

    submitBtn.disabled = true;                         // 防连点：请求没回来之前按钮禁用
    setMsg('发布中…');
    try {
      const data = await SBAPI.addLog(text);           // 真正发给后端
      if (!data.ok) {                                  // 后端说失败（比如没权限）
        submitBtn.disabled = false;                    // 恢复按钮，让人能重试
        setMsg(data.error || '发布失败', true);          // 优先显示后端给的错误原因
        return;
      }

      logs.unshift({ date: data.date, text: data.text });   // unshift = 插到数组最前面（最新的在最上面），不用重新请求整个列表
      draw();                                          // 重画列表
      if (input) input.value = '';                     // 清空输入框
      submitBtn.disabled = false;
      closeEditor();                                   // 收起编辑框
    } catch {
      submitBtn.disabled = false;
      setMsg('网络错误，发布失败', true);
    }
  }

  /* ---------- 事件 ---------- */
  moreBtn.addEventListener('click', renderMore);       // 给按钮绑定「点击」事件：点了就执行 renderMore

  if (addBtn) {
    addBtn.addEventListener('click', () => {           // 箭头函数 = 简写的匿名函数
      const open = editor.style.display !== 'none';    // 判断编辑框当前是不是展开的
      if (open) { closeEditor(); return; }             // 已经开着 → 这次点击就当「收起」
      editor.style.display = 'block';                  // 关着 → 打开
      setMsg('');                                      // 清空旧提示
      if (input) input.focus();                        // 自动把光标放进输入框，少点一下
    });
  }
  if (cancelBtn) cancelBtn.addEventListener('click', closeEditor);
  if (submitBtn) submitBtn.addEventListener('click', submit);
  if (input) {
    input.addEventListener('keydown', e => {           // keydown = 键盘按下事件，e 是这次按键的信息
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();   // Ctrl+Enter（Mac 是 Cmd+Enter）快速发布
    });
  }

  /* ---------- 启动 ---------- */
  (async () => {                                       // 这里又是一个立即执行的异步函数，页面加载时马上跑
    const remote = await fetchLogs();                  // 先试着从后端拿真数据
    logs = (remote && remote.length) ? remote : FALLBACK;   // 拿到了就用真的，没拿到就用写死的兜底
    draw();                                            // 画出来
    checkAdmin();                                      // 顺便看看当前用户能不能看到「添加」按钮
  })();
})();
