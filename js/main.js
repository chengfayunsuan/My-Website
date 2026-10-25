/* ============================================================
   js/main.js —— 首页「更新日志」模块
   ------------------------------------------------------------
   ★ 本文件会出现的专有名词（第一次看不明白就对照这里，完整版见项目根目录 术语表.md）：
     · IIFE 立即执行函数 —— (function(){ ... })()，写完马上执行一次，
                            里面的变量外面访问不到，用来「圈一块自己的地盘」。
     · DOM —— 浏览器把 HTML 解析出来的元素树。改页面就是改这棵树。
     · 回调 callback —— 把函数当参数传进去，等某件事发生了再调用。
     · Promise —— 「未来会有结果」的凭据，.then() 是成功后的动作，.catch() 是失败后的动作。
     · async / await —— 让异步代码写成同步的样子；await 就是「在这儿等结果」。
     · 模板字符串 —— 用反引号包起来的字符串，${} 里可以塞变量。内部不能写注释。
     · 三元运算 —— 条件 ? 成立时的值 : 不成立时的值。
     · 短路运算 —— a || b：a 为假就用 b；a && b：a 为真才用 b。
   ============================================================ */

/* ---------- 5. 更新日志 ---------- */
/* 这个文件只干一件事：把首页「更新日志」那块渲染出来，并处理站长发布新日志。
   前面的「5.」是历史编号，没有实际作用，可以忽略。 */
(function () {                                    // IIFE：整段代码包在自己的作用域里，不会和别的 js 抢变量名
  // ===== 后端连不上时用的兜底日志（从上到下 = 从新到旧）=====
  const FALLBACK = [                              // 【const】声明一个常量：这个变量以后不能再指向别的数组（但数组里的内容仍可改）
    { date: '2026-10-02', text: '加了首页登录弹窗和导航栏头像' },   // 【对象】{ 键: 值 } 形式的一条数据；这里表示「一条日志」
    { date: '2026-10-02', text: '留言板接入登录验证' },             // 【数组】[ ] 里用逗号分隔，下标从 0 开始
    { date: '2026-10-01', text: '后端接入 Cloudflare Tunnel，外网可访问' },
    { date: '2026-10-01', text: '完成登录/注册功能' },
    { date: '2026-09-30', text: '小工具集上线（12 个 JS 小程序）' },
    { date: '2026-09-30', text: '天气预报页面完成' },
    { date: '2026-09-29', text: '鼠标拖尾特效完成' },
    { date: '2026-09-29', text: '网站第一次部署到 Cloudflare Pages' },
  ];                                              // 末尾的分号：表示一条语句结束（JS 里大部分语句用 ; 收尾）
  // =============================================

  const PAGE = 5;                     // 每次显示 / 加载几条（点一次「加载更多」，多出 5 条）
  let logs = [];                      // 【let】可变的变量：现在先给个空数组，等会儿用真数据填进来
  let shown = 0;                      // 已经显示了多少条，用来算下一次从哪一条开始切

  const listEl = document.getElementById('logList');   // 【DOM 操作】按 id 在页面上找到 <ul id="logList">，存进变量备用
  const moreBtn = document.getElementById('logMore');  // 找到「加载更多」按钮
  if (!listEl || !moreBtn) return;    // 不在首页就跳过：! 是取反，|| 是「或者」，两个元素缺一个就提前结束这个函数

  const addBtn = document.getElementById('logAdd');       // 「添加日志」按钮（只有站长 / 管理员看得到）
  const editor = document.getElementById('logEditor');   // 发布日志的编辑框容器
  const input = document.getElementById('logInput');      // 编辑框里的输入框
  const submitBtn = document.getElementById('logSubmit'); // 发布按钮
  const cancelBtn = document.getElementById('logCancel'); // 取消按钮
  const msgEl = document.getElementById('logEditorMsg');  // 显示「发布中…」「失败」这类提示的那行字

  function esc(s) {                                  // 【函数】转义函数：把用户输入里的特殊字符换成 HTML 实体，防止 XSS（别人写一段 <script> 就能在你页面上跑代码）
    return String(s == null ? '' : s)                // 【三元】s 是 null 或 undefined 就当空字符串，否则转成字符串（String() 什么都能转）
      .replace(/[&<>"']/g, c => ({                   // 【正则】/[&<>"']/g 表示「全文找这五个字符」；g = global，全部替换而不是只换第一个
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'   // 每个字符对应的安全写法（&amp; 这种叫 HTML 实体）
      }[c]));                                        // 【箭头函数】c => ({...}[c])：传进来一个字符，去对象里取它对应的实体；[c] 是「按变量名取值」
  }

  /* ---------- 渲染 ---------- */
  function renderMore() {                            // 再往列表里塞 PAGE 条
    const next = logs.slice(shown, shown + PAGE);    // 【slice】从下标 shown 切到 shown+PAGE（不含末尾），不修改原数组
    next.forEach(item => {                           // 【forEach】对数组里每一项执行一次回调，回调参数 item 就是当前这一条
      const li = document.createElement('li');       // 【DOM】凭空造一个 <li> 元素，此时还没插进页面
      /* 下面用【模板字符串】拼 HTML：反引号 ` 包住，${表达式} 会被替换成真实值。
         重点：模板字符串内部的每个字符都会变成 HTML 内容，所以里面绝对不能写注释。 */
      li.innerHTML = `
        <span class="log-date">${esc(item.date)}</span>
        <span class="log-text">${esc(item.text)}</span>
      `;
      listEl.appendChild(li);                        // 【DOM】appendChild = 把这个 <li> 挂到列表末尾，这时页面上才真的多一条
    });
    shown += next.length;                            // 已显示条数往后推；+= 是「自己加上右边」的简写

    if (shown >= logs.length) {                      // 全部显示完了
      moreBtn.disabled = true;                       // disabled = 按钮禁用，点不动、变灰
      moreBtn.textContent = '没有更多了';             // textContent = 元素里的纯文字（不会被当成 HTML 解析，最安全）
    }
  }

  function draw() {                                  // 重画整个列表：先清空，再从头渲染
    shown = 0;                                       // 计数归零
    listEl.innerHTML = '';                           // 给 innerHTML 赋空字符串 = 删掉里面所有子元素
    moreBtn.disabled = false;                        // 恢复可点
    moreBtn.textContent = '加载更多';                 // 恢复文字

    if (!logs.length) {                              // 一条日志都没有（数组长度为 0）
      const li = document.createElement('li');       // 造一个占位项
      li.innerHTML = '<span class="log-text">还没有更新日志</span>';   // 单行 HTML 直接赋值
      listEl.appendChild(li);
      moreBtn.disabled = true;                       // 没数据就别让人点「加载更多」
      moreBtn.textContent = '没有更多了';
      return;                                        // 【return】提前结束函数，后面的代码不再执行
    }
    renderMore();                                    // 有数据就先渲染第一批
  }

  /* ---------- 从后端拿日志 ---------- */
  async function fetchLogs() {                       // 【async】标了这个的函数，内部可以用 await，调用它得到的是 Promise
    try {                                            // 【try】这里出错会跳到下面的 catch，不会让整个页面崩掉
      const data = await SBAPI.getLogs();            // 【await】等后端返回结果再往下走；SBAPI 是 js/sb.js 提供的接口封装
      if (Array.isArray(data)) return data;          // 【return value】确认拿到的是数组才用，防止后端返回错误格式把页面搞崩
    } catch { /* 忽略 */ }                            // 出错就当没拿到（不弹窗打扰用户）；catch 后面不写参数 = 不关心错误内容
    return null;                                     // 【null】表示「空」，这里代表「没拿到」
  }

  /* ---------- 只有站长 / 管理员才显示「添加」按钮 ---------- */
  async function checkAdmin() {
    if (!addBtn) return;                             // 页面上没有这个按钮就直接退出
    const s = await SBAPI.getSession();              // 问一句：现在有人登录吗？没登录会返回 null
    if (!s) return;                                  // 没登录 → 按钮根本不出现
    try {
      const me = await SBAPI.me();                   // 拿当前登录用户的资料，里面有个 role 字段表示角色
      if (me && me.ok && (me.role === 'owner' || me.role === 'admin')) {   // 【===】严格相等（值和类型都要一样）；owner=站长，admin=管理员
        addBtn.style.display = 'inline-flex';        // 【style】直接改元素的行内样式；inline-flex 让它按弹性盒显示出来
      }
    } catch { /* 拿不到身份就当普通人处理 */ }
  }

  /* ---------- 发布 ---------- */
  function setMsg(t, isErr) {                        // 统一设置提示文字
    if (!msgEl) return;
    msgEl.textContent = t || '';                     // 【短路】t 是空值就写空字符串，避免页面上出现 undefined
    msgEl.className = 'log-editor-msg' + (isErr ? ' err' : ' ok');   // 【三元】出错加 err 类（CSS 里是红色），成功加 ok 类（绿色）
  }

  function closeEditor() {                           // 收起编辑框
    if (editor) editor.style.display = 'none';       // 【display:none】元素从页面上消失，但还在 DOM 里（和 remove 不同）
    setMsg('');                                      // 顺手清掉提示文字
  }

  async function submit() {                          // 点「发布」时执行
    const text = ((input && input.value) || '').trim();   // 【.trim()】去掉首尾空格；input 不存在时用 '' 兜底
    if (!text) { setMsg('写点内容再发布', true); return; }  // 空内容不让发

    const s = await SBAPI.getSession();              // 先确认登录状态
    if (!s) { setMsg('请先登录', true); return; }

    submitBtn.disabled = true;                       // 防连点：请求还没回来之前按钮先禁用
    setMsg('发布中…');
    try {
      const data = await SBAPI.addLog(text);         // 真正把内容发给后端
      if (!data.ok) {                                // 后端返回 ok:false 表示失败（比如没权限）
        submitBtn.disabled = false;                  // 恢复按钮，让人能重试
        setMsg(data.error || '发布失败', true);       // 优先显示后端给的错误原因
        return;
      }

      logs.unshift({ date: data.date, text: data.text });   // 【unshift】插到数组最前面（最新的排最上），这样不用重新请求整个列表
      draw();                                        // 重画
      if (input) input.value = '';                   // 清空输入框
      submitBtn.disabled = false;
      closeEditor();                                 // 收起编辑框
    } catch {
      submitBtn.disabled = false;
      setMsg('网络错误，发布失败', true);
    }
  }

  /* ---------- 事件 ---------- */
  moreBtn.addEventListener('click', renderMore);     // 【addEventListener】给按钮装监听：click 事件发生时执行 renderMore

  if (addBtn) {
    addBtn.addEventListener('click', () => {         // 【箭头函数】匿名的简写函数，这里不需要 this，所以用箭头最省事
      const open = editor.style.display !== 'none';  // 【!==】严格不相等：当前不是 none 就说明编辑框是开着的
      if (open) { closeEditor(); return; }           // 开着 → 这次点击当「收起」
      editor.style.display = 'block';                // 关着 → 打开
      setMsg('');
      if (input) input.focus();                      // 【.focus()】把光标自动放进输入框，省一次点击
    });
  }
  if (cancelBtn) cancelBtn.addEventListener('click', closeEditor);
  if (submitBtn) submitBtn.addEventListener('click', submit);
  if (input) {
    input.addEventListener('keydown', e => {         // 【事件对象 e】keydown = 按键按下；e 里带着「按的是哪个键」「有没有按 Ctrl」
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();   // Ctrl+Enter（Mac 上是 Cmd+Enter）快速发布
    });
  }

  /* ---------- 启动 ---------- */
  (async () => {                                     // 又一个 IIFE，这次是异步的：写完后立刻执行
    const remote = await fetchLogs();                // 先试着从后端拿真数据
    logs = (remote && remote.length) ? remote : FALLBACK;   // 【三元】拿到了真数据就用真的，没拿到就用写死的兜底
    draw();                                          // 画出来
    checkAdmin();                                    // 顺便判断当前用户能不能看到「添加」按钮
  })();
})();
