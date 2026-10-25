/* ============================================================
   文件：js/main.js
   ------------------------------------------------------------
   【这个文件干什么】
   首页（index.html）最下面有一块「更新日志」。这个文件全权负责它：
     1. 向后端要一份日志列表，要不到就用写死的兜底数据；
     2. 把每条日志画成一行 <li>，先显示 5 条；
     3. 点「加载更多」再放 5 条出来；
     4. 如果你是站长 / 管理员，还会多出一个「添加」按钮，点开能发布新日志。

   【怎么读这个文件】
   从上往下读。JS 是一行一行执行的（除了函数体，函数要等被调用才执行）。
   注释里凡是【关键字 xxx】的，都是 JS 语言自带、不能拿来当变量名的保留字。
   ============================================================ */

/* ============================================================
   第 0 课 A：符号（不是关键字，是语法记号）
   ------------------------------------------------------------
   =        赋值：把右边的值装进左边的变量。x = 5 读作「x 等于 5」。
   ===      严格比较：问「左右是不是完全一样」，得到 true / false。
   .        取东西：listEl.innerHTML 读作「listEl 这个元素的 innerHTML 属性」。
   ()       调用：函数名后面跟 () 就是「执行它」。getId('a') 里的 'a' 是参数。
   []       取下标：数组用数字取第几个（从 0 开始），对象用名字取（obj['name']）。
   {}       造对象：{ 键: 值 }，像一个贴了标签的抽屉柜；也用来包住函数体。
   =>       箭头函数：「(参数) => 代码」，写函数的简写。
   ${}      插值：只在反引号 ` ` 包的模板字符串里有效，会被替换成变量值。
   //       单行注释：从两个斜杠开始，到这一行结束，浏览器完全忽略。
   斜杠加星号 … 星号加斜杠   多行注释：夹在中间的内容全部忽略（本段开头和结尾就是这个）。
   ============================================================ */

/* ============================================================
   第 0 课 B：JS 关键字（keyword）速查 —— 本文件会出现哪些
   ------------------------------------------------------------
   【关键字 const】   声明一个「常量」：变量名以后不能再指向别的值。
   【关键字 let】     声明一个「可改的变量」：以后能重新赋值。
   【关键字 function】声明一个函数。
   【关键字 return】  ① 把结果交出去；② 只写 return 就是「立刻结束这个函数」。
   【关键字 if】      如果……就……（条件成立才执行大括号里的代码）。
   【关键字 else】    否则……（和 if 配套）。
   【关键字 try】     试着执行，出错就跳到 catch。
   【关键字 catch】   接住 try 里抛出的错误。
   【关键字 async】   标在函数前，表示「这个函数是异步的，里面能用 await」。
   【关键字 await】   等一个异步结果出来，再继续往下走。
   【关键字 true】    真 / 是（布尔值）。
   【关键字 false】   假 / 否。
   【关键字 null】    空值：有这个东西，但它是空的。
   【关键字 undefined】未定义：压根没有这个东西（没赋值、没返回）。
   【关键字 typeof】  问「这个东西是什么类型」，返回 'string' 'number' 之类。
   【关键字 new】     造一个新对象 / 新实例。
   ============================================================ */

/* ---------- 5. 更新日志 ---------- */
/* 上面的「5.」是历史编号，没有作用，忽略即可。 */

(function () {                                    // 这一行同时做了两件事：定义一个匿名函数，并立刻调用它。
                                                  // 拆开看：最外面这对括号 ( ... ) 把函数「包」成一个整体；
                                                  // 最后那对 () 表示「现在就执行」。
                                                  // 这种写法叫 IIFE（立即执行函数），好处是里面的变量只在这里有效，不会和别的文件抢名字。
  // ===== 后端连不上时用的兜底日志（从上到下 = 从新到旧）=====
  const FALLBACK = [                              // 【关键字 const】声明常量：FALLBACK 这个名字以后不能再指向别的数组（数组内容仍可改）。
                                                  // = 是赋值；[ ] 表示数组：一串有顺序的数据，用逗号隔开，第一个下标是 0。
    { date: '2026-10-02', text: '加了首页登录弹窗和导航栏头像' },   // 每一项是一个对象 { }：
                                                                  // 'date' / 'text' 是「键」，冒号右边是「值」。
                                                                  // 单引号 '...' 包起来的是字符串（文字）。
                                                                  // 两个键之间用逗号隔开，最后一项的逗号可写可不写。
    { date: '2026-10-02', text: '留言板接入登录验证' },
    { date: '2026-10-01', text: '后端接入 Cloudflare Tunnel，外网可访问' },
    { date: '2026-10-01', text: '完成登录/注册功能' },
    { date: '2026-09-30', text: '小工具集上线（12 个 JS 小程序）' },
    { date: '2026-09-30', text: '天气预报页面完成' },
    { date: '2026-09-29', text: '鼠标拖尾特效完成' },
    { date: '2026-09-29', text: '网站第一次部署到 Cloudflare Pages' },
  ];                                              // 右边的 ] 收尾数组；分号 ; 表示「这句话说完了」。
                                                  // 分号在 JS 里不是强制的（浏览器会自动补），但写上更清楚、也少踩坑。
  // =============================================

  const PAGE = 5;                     // 【const】每次显示几条。后面两处用到它，改这一个数字就全改。
  let logs = [];                      // 【关键字 let】可改的变量：现在先给空数组，等会儿用真数据替换（所以不能用 const）。
  let shown = 0;                      // 【let】已经显示了多少条。从 0 开始，每显示一批就往上加。

  const listEl = document.getElementById('logList');   // 分三步读：
                                                      // ① document 是「整个网页」这个对象；
                                                      // ② .getElementById('logList') 是「按 id 找元素」，找到页面上的 <ul id="logList">；
                                                      // ③ 把它装进变量 listEl（El = element 的缩写）。
  const moreBtn = document.getElementById('logMore');  // 同理，找到「加载更多」按钮，存进 moreBtn（Btn = button）。
  if (!listEl || !moreBtn) return;    // 【关键字 if】如果条件成立就执行后面这句。
                                      // ! 是取反：!listEl = 「listEl 不存在」；|| 是「或者」。
                                      // 【关键字 return】只写 return、后面不跟值 = 立刻结束这个函数，后面的代码都不执行了。
                                      // 为什么？不在首页时页面上没有这两个元素，硬往下写会报错。

  const addBtn = document.getElementById('logAdd');       // 「添加日志」按钮（只有站长 / 管理员能看到，平时隐藏）
  const editor = document.getElementById('logEditor');   // 发布日志的编辑面板（整块）
  const input = document.getElementById('logInput');      // 面板里那个输入框
  const submitBtn = document.getElementById('logSubmit'); // 面板里的「发布」按钮
  const cancelBtn = document.getElementById('logCancel'); // 面板里的「取消」按钮
  const msgEl = document.getElementById('logEditorMsg');  // 显示「发布中…」「失败」这类提示的小字元素

  function esc(s) {                                  // 【关键字 function】定义一个函数，名字 esc（escape 缩写）。
                                                     // 括号里的 s 是「参数」：调用时要喂给它的东西。
                                                     // 作用：把用户输入里的特殊符号换成安全写法，防止有人写一段 <script> 在你页面上执行（这叫 XSS 攻击）。
    return String(s == null ? '' : s)                // 【return】把这一行的结果交出去。
                                                     // 这一行分三块：
                                                     // ① s == null：判断是不是 null 或 undefined（两个等号会做类型转换，正好一并判断「空」）；
                                                     // ② ? : 三元运算，读作「如果…就…否则…」：空就给 ''，不空就用 s；
                                                     // ③ String(...) 把任何东西转成字符串，保证下一步能调用 .replace()。
      .replace(/[&<>"']/g, c => ({                   // .replace(找什么, 换成什么)：字符串替换方法。
                                                     // /[&<>"']/g 是正则表达式：方括号 = 「这五个字符中任意一个」，g = 全部替换。
                                                     // c => (...) 是箭头函数：每找到一个字符就交给 c，返回值就是替换内容。
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'   // 对照表（对象）：键是原字符，值是它的 HTML 实体。
                                                                              // 浏览器会把实体显示成字符本身，而不会当成标签解析。
      }[c]));                                        // [c] = 「用变量 c 去对象里取对应的值」：
                                                     // c 是 '&' 就取到 '&amp;'，是 '<' 就取到 '&lt;'。
  }

  /* ---------- 渲染 ---------- */
  function renderMore() {                            // 【function】定义 renderMore：再往列表里塞 5 条。
    const next = logs.slice(shown, shown + PAGE);    // 【const】.slice(从哪, 到哪) 从数组切一段出来，不改原数组。
                                                     // shown = 已显示条数，shown + PAGE = 这次切到哪儿（不含这一项）。
                                                     // 例：shown=0、PAGE=5 → 切出下标 0~4 这 5 条。
    next.forEach(item => {                           // .forEach(函数) = 对这个数组每一项都执行一次括号里的函数。
                                                     // item 是形参名，代表「当前这一条」，每轮自动换成下一条。
      const li = document.createElement('li');       // 【const】document.createElement('li') = 凭空造一个 <li> 标签。
                                                     // 注意：此刻它只存在内存里，还没出现在页面上。
      /* 下面用「模板字符串」拼 HTML。
         反引号 ` 包起来的部分可以换行、可以插值；${ } 里的内容会被算出来替换进去。
         重要：模板字符串里每个字符都会变成页面真实内容，所以里面不能写 // 注释，否则用户会看到注释文字。 */
      li.innerHTML = `
        <span class="log-date">${esc(item.date)}</span>
        <span class="log-text">${esc(item.text)}</span>
      `;                                             // innerHTML = 把这段 HTML 当作这个 <li> 的内容塞进去。
                                                     // ${esc(item.date)} 先调 esc 转义，再把结果填进 span。
      listEl.appendChild(li);                        // appendChild = 把一个元素挂到另一个元素的最后面。
                                                     // 执行完这句，页面上才真的多出一行。
    });                                              // forEach 的收尾：这里的 ); 关闭前面的 next.forEach(
    shown += next.length;                            // += 是「自己加上右边再装回自己」：等价于 shown = shown + next.length。
                                                     // next.length = 这次实际加了几条。

    if (shown >= logs.length) {                      // 【if】>= 是「大于或等于」。已显示追上总数，说明全放完了。
      moreBtn.disabled = true;                       // disabled 是按钮的「禁用」属性，设 true 就变灰、点不动。
      moreBtn.textContent = '没有更多了';             // textContent = 元素里的纯文字。
                                                     // 和 innerHTML 的区别：textContent 不当 HTML 解析，最安全。
    }
  }

  function draw() {                                  // 【function】定义 draw：把整个列表清空重画。
    shown = 0;                                       // 计数归零，重新从第 0 条开始。
    listEl.innerHTML = '';                           // 给 innerHTML 赋空字符串 = 删掉里面所有子元素（一句顶十句）。
    moreBtn.disabled = false;                        // 恢复可点。
    moreBtn.textContent = '加载更多';                 // 恢复按钮文字。

    if (!logs.length) {                              // 【if】数组的 length 属性 = 有几项；!logs.length 就是「一项都没有」。
      const li = document.createElement('li');       // 【const】造一个占位项。
      li.innerHTML = '<span class="log-text">还没有更新日志</span>';   // 单行 HTML 直接赋值，不用模板字符串。
      listEl.appendChild(li);                        // 插进去。
      moreBtn.disabled = true;                       // 没数据就别让人点「加载更多」。
      moreBtn.textContent = '没有更多了';
      return;                                        // 【return】不带值 = 到此为止，立刻结束函数。
                                                     // 不写这句的话，下面还会再去找数据渲染，没有意义。
    }
    renderMore();                                    // 有数据，就先放第一批 5 条。
  }

  /* ---------- 从后端拿日志 ---------- */
  async function fetchLogs() {                       // 【关键字 async】写在 function 前面，表示「这是异步函数」。
                                                     // 特点：里面可以用 await；它本身总是返回一个 Promise。
                                                     // Promise 可以先理解成「取餐凭条」：现在没有结果，好了凭条会通知你。
    try {                                            // 【关键字 try】试着执行下面代码。出错会跳到 catch，而不是让整页崩掉。
      const data = await SBAPI.getLogs();            // 【关键字 await】= 「在这儿等结果，等到再往下走」。
                                                     // SBAPI 是 js/sb.js 封装好的后端接口集合。
                                                     // .getLogs() 调用它的「拿日志」方法，内部会发网络请求。
                                                     // 等到的结果装进 data（const 声明的变量）。
      if (Array.isArray(data)) return data;          // 【if】Array.isArray(x) 判断 x 是不是数组，返回 true / false。
                                                     // 【return】确认是数组才返回；万一是错误对象（如 {error:'...'}），就用下面的兜底。
    } catch { /* 忽略 */ }                            // 【关键字 catch】后面不写括号 = 不关心具体错误。
                                                     // 出错就当「没拿到」，不弹窗打扰用户，属于「优雅降级」。
    return null;                                     // 【return】【关键字 null】空值：这里代表「没拿到数据」。
  }

  /* ---------- 只有站长 / 管理员才显示「添加」按钮 ---------- */
  async function checkAdmin() {                      // 【async】异步函数，因为要问后端「我是谁」。
    if (!addBtn) return;                             // 【if】页面上没有这个按钮（比如在别的页面），直接退出。
    const s = await SBAPI.getSession();              // 【await】getSession = 问「现在有人登录吗」。没登录返回 null。
    if (!s) return;                                  // 【if】没登录 → 按钮保持隐藏，不往下走。
    try {
      const me = await SBAPI.me();                   // 【await】me = 「我」的资料，其中 role 字段是角色：
                                                     // owner = 站长，admin = 管理员，user = 普通用户。
      if (me && me.ok && (me.role === 'owner' || me.role === 'admin')) {   // 【if】三个条件都要成立（&& 是「并且」）：
                                                                          // me 存在、请求成功（me.ok 为真）、角色是站长或管理员。
                                                                          // 这里的括号不能省：|| 两边要先单独算完。
        addBtn.style.display = 'inline-flex';        // .style 直接改这个元素的行内样式。
                                                     // display:inline-flex = 按弹性盒显示出来。它原本是 display:none（藏起来的）。
      }
    } catch { /* 拿不到身份就当普通人处理 */ }        // 【catch】出错就走这里，按钮继续藏着。
  }

  /* ---------- 发布 ---------- */
  function setMsg(t, isErr) {                        // 【function】统一设置提示文字。t = 内容，isErr = 是不是错误。
    if (!msgEl) return;                              // 【if】元素不存在就别往下写（否则会报错）。
    msgEl.textContent = t || '';                     // || 在这里起「兜底」作用：
                                                     // t 是空字符串 / null / undefined 时，就用右边的 ''。
                                                     // 这样可以避免页面上出现 undefined 三个字。
    msgEl.className = 'log-editor-msg' + (isErr ? ' err' : ' ok');   // className = 给元素换一整套 CSS 类名。
                                                                     // 「基础类 + 状态类」拼起来，中间必须有空格（' err' 开头那个空格就是干这个的）。
                                                                     // 三元：出错用 err（红色样式），没错用 ok（绿色样式）。
  }

  function closeEditor() {                           // 【function】收起编辑框。
    if (editor) editor.style.display = 'none';       // 【if】display:none = 元素从页面消失，但仍留在 DOM 里，下次能再显示。
    setMsg('');                                      // 顺手清空提示，免得下次打开还挂着上次的错误。
  }

  async function submit() {                          // 【async function】点「发布」时执行。
    const text = ((input && input.value) || '').trim();   // 【const】这行有四层，从里往外读：
                                                          // ① input.value = 输入框当前内容；
                                                          // ② input && ... = input 存在才取 value（&& 左边假就直接停）；
                                                          // ③ || '' = 万一得到 undefined，换成空字符串；
                                                          // ④ .trim() = 去掉首尾空格和换行。
    if (!text) { setMsg('写点内容再发布', true); return; }  // 【if】去掉空格后是空的就不让发；true 表示这是错误提示；
                                                            // 【return】结束函数。
    const s = await SBAPI.getSession();              // 【await】先确认登录状态。
    if (!s) { setMsg('请先登录', true); return; }     // 【if】没登录就提示并结束。

    submitBtn.disabled = true;                       // 防连点：请求没回来之前按钮禁用（否则狂点会发好几条）。
    setMsg('发布中…');                                // 告诉用户「正在处理」，别以为卡了。
    try {                                            // 【try】下面的请求可能失败。
      const data = await SBAPI.addLog(text);         // 【await】把内容发给后端，等结果。
      if (!data.ok) {                                // 【if】后端返回 ok:false = 失败（登录过期、没权限等）。
        submitBtn.disabled = false;                  // 恢复按钮，让人能重试。
        setMsg(data.error || '发布失败', true);       // 优先显示后端给的错误原因（data.error），没有就用默认文案。
        return;                                      // 【return】结束。
      }

      logs.unshift({ date: data.date, text: data.text });   // unshift = 插到数组最前面。
                                                            // 为什么插最前？因为日志「新的在上」。
                                                            // 这样只把新的一条加进内存，不用为看一条而重新请求整个列表。
      draw();                                        // 重画列表。
      if (input) input.value = '';                   // 【if】清空输入框，方便写第二条。
      submitBtn.disabled = false;                    // 恢复按钮。
      closeEditor();                                 // 收起面板。
    } catch {                                        // 【catch】网络层错误走这里。
      submitBtn.disabled = false;
      setMsg('网络错误，发布失败', true);
    }
  }

  /* ---------- 事件 ---------- */
  /* 「事件」= 用户做了某件事（点击、输入、按键…）。
     addEventListener('事件名', 要做的事) = 装一个监听器：事情发生时自动调用后面的函数。 */
  moreBtn.addEventListener('click', renderMore);     // 给按钮装「点击」监听，点了就执行 renderMore。
                                                     // 注意写的是 renderMore 而不是 renderMore()：
                                                     // 写名字 = 把函数本身交给监听器，等点击才调用；
                                                     // 写括号 = 立刻执行它，并把返回值交出去（那就错了）。

  if (addBtn) {                                      // 【if】按钮存在才装监听。
    addBtn.addEventListener('click', () => {         // () => { ... } 是箭头函数：没有参数，函数体在大括号里。
      const open = editor.style.display !== 'none';  // 【const】!== 是「严格不等于」：当前 display 不是 none，说明面板开着。
      if (open) { closeEditor(); return; }           // 【if】开着 → 这次点击当「收起」；【return】结束。
      editor.style.display = 'block';                // 关着 → 打开（block = 作为块级元素显示）。
      setMsg('');                                    // 清掉上次的残留提示。
      if (input) input.focus();                      // 【if】.focus() = 把光标放进输入框，用户可以立刻打字。
    });
  }
  if (cancelBtn) cancelBtn.addEventListener('click', closeEditor);   // 点取消 = 收起。
  if (submitBtn) submitBtn.addEventListener('click', submit);        // 点发布 = 执行 submit。
  if (input) {
    input.addEventListener('keydown', e => {         // keydown = 键盘按下事件。
                                                     // e 是「事件对象」：浏览器把这次按键的信息打包递给你。
                                                     // e.key = 按的哪个键（'Enter' / 'a' / 'Escape'…）；
                                                     // e.ctrlKey / e.metaKey = 有没有按着 Ctrl / Cmd，是 true / false。
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();   // 【if】Ctrl+Enter（Mac 上 Cmd+Enter）直接发布。
    });
  }

  /* ---------- 启动 ---------- */
  /* 下面又是一个 IIFE，只是前面多了 async：定义异步函数并立刻执行。
     它做的事：拿数据 → 决定用真数据还是兜底 → 画出来 → 检查权限。 */
  (async () => {
    const remote = await fetchLogs();                // 【await】先试着从后端拿真数据（拿不到会返回 null）。
    logs = (remote && remote.length) ? remote : FALLBACK;   // 三元运算，读作：
                                                            // 「如果 remote 存在、并且不是空数组，就用 remote，否则用 FALLBACK」。
                                                            // 这里用 = 重新赋值给 logs，所以 logs 必须用 let 声明，不能用 const。
    draw();                                          // 画出第一批。
    checkAdmin();                                    // 顺手判断当前用户能不能看到「添加」按钮（不写 await，因为不急着等它）。
  })();
})();                                                // 最外层 IIFE 收尾：先 } 关闭函数体，再 ) 关闭包住函数的括号，最后 () 表示执行。
