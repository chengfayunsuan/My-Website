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
   从上往下读。JS 是一行一行执行的（除了函数定义，函数体要等被调用才执行）。
   每一行后面都有注释，遇到符号不认识就对照 术语表.md。
   ============================================================ */

/* ============================================================
   第 0 课：贯穿全文的 8 个符号，先认脸
   ------------------------------------------------------------
   =        赋值：把右边的值装进左边的变量。x = 5 读作「x 等于 5」。
   ===      比较：问「左边和右边是不是完全一样」，得到 true 或 false。
   .        取东西：listEl.innerHTML 读作「listEl 这个元素的 innerHTML 属性」。
   ()       调用：函数名后面跟 () 就是「执行这个函数」。getId('a') 里的 'a' 是传给它的参数。
   []       取下标：数组用数字取第几个（从 0 开始），对象用名字取（obj['name']）。
   {}       造对象：{ 键: 值, 键: 值 }，像一个贴了标签的抽屉柜。
   =>       箭头函数：「(参数) => 要执行的代码」，是写函数的简写。
   ${}      插值：只有写在反引号 ` ` 里的模板字符串中才有效，会被替换成变量的值。
   ============================================================ */

/* ---------- 5. 更新日志 ---------- */
/* 上面的「5.」是历史编号，没有作用，忽略即可。 */

(function () {                                    // 这一行同时做了两件事：定义一个匿名函数，并立刻调用它。
                                                  // 拆开看：最外面这对括号 ( ... ) 把函数「包」成一个整体；
                                                  // 最后那对 () 表示「现在就执行」。
                                                  // 这种写法叫 IIFE（立即执行函数），作用是：里面的变量只在里面有效，不会和别的文件抢名字。
  // ===== 后端连不上时用的兜底日志（从上到下 = 从新到旧）=====
  const FALLBACK = [                              // const = 定义一个常量。常量 = 这个变量以后不能再指向别的数组。
                                                  // FALLBACK 是变量名（随便起，但要有意义），= 把右边的值装给它。
                                                  // [ 和 ] 表示这是一个数组：一串有顺序的数据，用逗号隔开，第一个的下标是 0。
    { date: '2026-10-02', text: '加了首页登录弹窗和导航栏头像' },   // 数组里的每一项都是一个对象 { }。
                                                                  // 'date' 和 'text' 是「键」，冒号右边是「值」。
                                                                  // 单引号 '...' 表示这是一段文字（字符串）。
                                                                  // 两个键之间用逗号隔开，最后一项的逗号可以写也可以不写。
    { date: '2026-10-02', text: '留言板接入登录验证' },
    { date: '2026-10-01', text: '后端接入 Cloudflare Tunnel，外网可访问' },
    { date: '2026-10-01', text: '完成登录/注册功能' },
    { date: '2026-09-30', text: '小工具集上线（12 个 JS 小程序）' },
    { date: '2026-09-30', text: '天气预报页面完成' },
    { date: '2026-09-29', text: '鼠标拖尾特效完成' },
    { date: '2026-09-29', text: '网站第一次部署到 Cloudflare Pages' },
  ];                                              // 右边的 ] 收尾数组，再跟一个分号 ; 表示「这句话说完了」。
                                                  // JS 里分号不是必须的（浏览器会自动补），但写上更清楚、也避免踩坑。
  // =============================================

  const PAGE = 5;                     // 每次显示几条。这里定成 5，后面两处用到它，改这一个数字就全改。
  let logs = [];                      // let = 定义一个可以被重新赋值的变量（const 不行）。
                                      // logs 用来装「全部日志」，现在先给一个空数组 []，等会儿用真数据替换。
  let shown = 0;                      // 已经显示了多少条。从 0 开始，每显示一批就往上加。

  const listEl = document.getElementById('logList');   // 分三步读：
                                                      // ① document 是「整个网页」；
                                                      // ② .getElementById('logList') 是「按 id 去找元素」，找到页面上 id="logList" 的那个 <ul>；
                                                      // ③ 把找到的元素装进变量 listEl（El 是 element 的缩写，习惯这么起名）。
  const moreBtn = document.getElementById('logMore');  // 同理，找到「加载更多」按钮，存进 moreBtn（Btn = button）。
  if (!listEl || !moreBtn) return;    // if = 如果。括号里是要判断的条件，条件成立才执行后面的代码。
                                      // ! 是「取反」：!listEl 意思是「listEl 不存在」。
                                      // || 是「或者」：两个条件有一个成立就算成立。
                                      // 所以整句 = 「如果找不到列表，或者找不到按钮，就 return」。
                                      // return 在这里表示「直接结束整个函数，后面的都不做了」。
                                      // 为什么？因为不在首页时页面上根本没有这两个元素，硬往下写会报错。

  const addBtn = document.getElementById('logAdd');       // 「添加日志」按钮（只有站长 / 管理员能看到，平时是隐藏的）
  const editor = document.getElementById('logEditor');   // 发布日志的编辑框（整个面板）
  const input = document.getElementById('logInput');      // 编辑框里那个输入框（写内容的地方）
  const submitBtn = document.getElementById('logSubmit'); // 面板里的「发布」按钮
  const cancelBtn = document.getElementById('logCancel'); // 面板里的「取消」按钮
  const msgEl = document.getElementById('logEditorMsg');  // 用来显示「发布中…」「失败」这类提示的那行小字

  function esc(s) {                                  // function = 定义一个函数，名字叫 esc（escape 的缩写）。
                                                     // 括号里的 s 是「参数」：调用这个函数时要喂给它的东西。
                                                     // 这个函数的作用：把用户输入里的特殊符号换成安全写法，防止有人写一段 <script> 在你页面上执行（这叫 XSS 攻击）。
    return String(s == null ? '' : s)                // return = 把结果交出去。这一行分三块：
                                                     // s == null 判断是不是 null 或 undefined（两个等号会做类型转换，这里正好用来「一并判断空值」）；
                                                     // ? : 是三元运算，读作「如果…就…否则…」：是空就给 ''，不是空就用 s；
                                                     // String(...) 把任何东西都转成字符串，保证下一步能调用 .replace()。
      .replace(/[&<>"']/g, c => ({                   // .replace(要找什么, 换成什么) 是字符串的替换方法。
                                                     // /[&<>"']/g 是正则表达式：方括号表示「这五个字符中的任意一个」，g 表示「全部替换，不是只换第一个」。
                                                     // c => (...) 是箭头函数：replace 会把每找到一个字符交给 c，返回值就是替换成的内容。
                                                     // 整体 ( ... ) 是把下面那个对象包起来，避免和后面的 [c] 混淆。
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'   // 这是一张对照表（对象）：
                                                                              // 键是原字符，值是它的 HTML 实体（浏览器会把它显示成字符本身，而不会当成标签解析）。
                                                                              // 例如 & 写成 &amp;，页面显示还是 &，但浏览器不会误以为它是代码。
      }[c]));                                        // 最后 [c] 是「用变量 c 去对象里取对应的值」。
                                                     // c 是 '&' 就取到 '&amp;'，c 是 '<' 就取到 '&lt;'。
  }

  /* ---------- 渲染 ---------- */
  function renderMore() {                            // 定义函数 renderMore：再往列表里塞 5 条。
    const next = logs.slice(shown, shown + PAGE);    // .slice(从哪, 到哪) 从数组里切一段出来，不改原数组。
                                                     // shown 是已经显示了几条，shown + PAGE 是这次要切到哪儿（不含这一项）。
                                                     // 比如 shown=0、PAGE=5 → 切出下标 0、1、2、3、4 这 5 条。
    next.forEach(item => {                           // .forEach(函数) = 对这个数组里的每一项，都执行一次括号里的函数。
                                                     // item 是形参名，代表「当前这一条」；每轮自动换成下一条。
      const li = document.createElement('li');       // document.createElement('li') = 凭空造一个 <li> 标签。
                                                     // 注意：这时候它只存在于内存里，还没出现在页面上。
      /* 下面用「模板字符串」拼 HTML。
         反引号 ` 包起来的部分可以换行、可以插值；${ } 里的内容会被算出来替换进去。
         重点：模板字符串里的每个字符都会变成页面上真实的内容，所以里面不能写 // 注释，否则用户会看到注释文字。 */
      li.innerHTML = `
        <span class="log-date">${esc(item.date)}</span>
        <span class="log-text">${esc(item.text)}</span>
      `;                                             // innerHTML = 把这段 HTML 当作这个 <li> 的内容塞进去。
                                                     // ${esc(item.date)} 会先调用 esc 转义，再把结果填到 span 里。
      listEl.appendChild(li);                        // appendChild = 把一个元素挂到另一个元素的最后面。
                                                     // 执行完这一句，页面上才真的多出一行。
    });                                              // forEach 的收尾：这里的 ); 是在关闭前面的 next.forEach(
    shown += next.length;                            // += 是「自己加上右边再装回自己」的简写：shown = shown + next.length。
                                                     // next.length 是这次实际加了几条。

    if (shown >= logs.length) {                      // >= 是「大于或等于」。已显示数量追上总数，说明全放完了。
      moreBtn.disabled = true;                       // disabled 是按钮的「禁用」属性，设成 true 就变灰、点不动。
      moreBtn.textContent = '没有更多了';             // textContent = 元素里的纯文字。
                                                     // 和 innerHTML 的区别：textContent 不会把内容当 HTML 解析，最安全。
    }
  }

  function draw() {                                  // 定义函数 draw：把整个列表清空重画。
    shown = 0;                                       // 计数器归零，重新从第 0 条开始。
    listEl.innerHTML = '';                           // 给 innerHTML 赋值空字符串 = 删掉里面所有子元素（一句顶十句）。
    moreBtn.disabled = false;                        // 恢复可点。
    moreBtn.textContent = '加载更多';                 // 恢复按钮文字。

    if (!logs.length) {                              // 数组的 length 属性是「有几项」。!logs.length 就是「一项都没有」。
      const li = document.createElement('li');       // 造一个占位项。
      li.innerHTML = '<span class="log-text">还没有更新日志</span>';   // 单行 HTML 直接赋值，不需要模板字符串。
      listEl.appendChild(li);                        // 插进去。
      moreBtn.disabled = true;                       // 没数据就别让人点「加载更多」。
      moreBtn.textContent = '没有更多了';
      return;                                        // return 后面什么都不写 = 到此为止，立刻结束这个函数。
                                                     // 不写这句的话，下面还会再去找数据渲染，没有意义。
    }
    renderMore();                                    // 有数据，就先放第一批 5 条出来。
  }

  /* ---------- 从后端拿日志 ---------- */
  async function fetchLogs() {                       // async 写在 function 前面，表示这是「异步函数」。
                                                     // 异步函数的特点是：里面可以用 await，并且它本身总是返回一个 Promise。
                                                     // Promise 可以先理解成「一张取餐凭条」：现在没有结果，等好了凭条会通知你。
    try {                                            // try = 试着执行下面这些代码。如果出错，会跳到下面的 catch，而不是让整页崩掉。
      const data = await SBAPI.getLogs();            // await = 「在这儿等结果，等到再往下走」。
                                                     // SBAPI 是 js/sb.js 里封装好的后端接口集合（S 大写的 SBAPI）。
                                                     // .getLogs() 表示调用它的「拿日志」方法，它内部会发网络请求。
                                                     // 等到的结果装进 data。
      if (Array.isArray(data)) return data;          // Array.isArray(x) 判断 x 是不是数组，返回 true / false。
                                                     // 确认是数组才返回；万一是错误信息（比如 {error:'...'}），就用下面的兜底数据。
    } catch { /* 忽略 */ }                            // catch 后面不写括号 = 不关心具体是什么错误。
                                                     // 出错就当「没拿到」，不弹窗打扰用户，属于「优雅降级」。
    return null;                                     // null 意思是「空值」，这里代表「没拿到数据」。
  }

  /* ---------- 只有站长 / 管理员才显示「添加」按钮 ---------- */
  async function checkAdmin() {                      // 同样是异步函数，因为要问后端「我是谁」。
    if (!addBtn) return;                             // 页面上没有这个按钮（比如在别的页面），直接退出。
    const s = await SBAPI.getSession();              // getSession = 问「现在有人登录吗」。没登录会返回 null。
    if (!s) return;                                  // 没登录 → 按钮保持隐藏，不往下走了。
    try {
      const me = await SBAPI.me();                   // me = 「我」的资料，里面有个 role 字段写角色：
                                                     // owner = 站长，admin = 管理员，user = 普通用户。
      if (me && me.ok && (me.role === 'owner' || me.role === 'admin')) {   // 三个条件都要成立（&& 是「并且」）：
                                                                          // me 存在、请求成功（me.ok 为真）、角色是站长或管理员。
                                                                          // 这里的括号不能省：|| 的两边要先单独算完。
        addBtn.style.display = 'inline-flex';        // .style 直接改这个元素的行内样式。
                                                     // display:inline-flex 表示「按弹性盒显示出来」。原来它是 display:none（藏起来的）。
      }
    } catch { /* 拿不到身份就当普通人处理 */ }
  }

  /* ---------- 发布 ---------- */
  function setMsg(t, isErr) {                        // 统一设置提示文字。t = 文字内容，isErr = 是不是错误（true/false）。
    if (!msgEl) return;
    msgEl.textContent = t || '';                     // || 是「或者」，但在这里起「兜底」作用：
                                                     // t 是空字符串 / null / undefined 时，就用右边的 ''。
                                                     // 这样可以避免页面上出现 undefined 三个字。
    msgEl.className = 'log-editor-msg' + (isErr ? ' err' : ' ok');   // className = 给元素换一整套 CSS 类名。
                                                                     // 这里是「基础类 + 状态类」两个类名拼起来，中间要有空格（' err' 前面那个空格就是干这个的）。
                                                                     // 三元：出错就用 err（红色样式），没错就用 ok（绿色样式）。
  }

  function closeEditor() {                           // 收起编辑框。
    if (editor) editor.style.display = 'none';       // display:none = 元素从页面上消失，但还留在 DOM 里，下次能再显示。
    setMsg('');                                      // 顺手把提示文字清空，免得下次打开还挂着上次的错误。
  }

  async function submit() {                          // 点「发布」时执行。
    const text = ((input && input.value) || '').trim();   // 这一行有四层，从里往外读：
                                                          // ① input.value = 输入框里当前的内容；
                                                          // ② input && ... = 如果 input 存在才取 value（&& 是「并且」，左边假就直接停）；
                                                          // ③ || '' = 万一前面得到 undefined，换成空字符串；
                                                          // ④ .trim() = 去掉首尾的空格和换行。
    if (!text) { setMsg('写点内容再发布', true); return; }  // 去掉空格后是空的，就不让发。true 表示这是错误提示。

    const s = await SBAPI.getSession();              // 先确认登录状态。
    if (!s) { setMsg('请先登录', true); return; }

    submitBtn.disabled = true;                       // 防连点：请求还没回来之前按钮禁用（否则用户狂点会发好几条）。
    setMsg('发布中…');                                // 告诉用户「正在处理」，别以为卡了。
    try {
      const data = await SBAPI.addLog(text);         // 把内容发给后端，等它返回结果。
      if (!data.ok) {                                // 后端返回 ok:false 表示失败（比如登录过期、没权限）。
        submitBtn.disabled = false;                  // 恢复按钮，让人能重试。
        setMsg(data.error || '发布失败', true);       // 优先显示后端给的错误原因（data.error），没有就用默认文案。
        return;
      }

      logs.unshift({ date: data.date, text: data.text });   // unshift = 插到数组最前面。
                                                            // 为什么插最前？因为日志是「新的在上」。
                                                            // 这样只把新的一条加到内存里，不用为了看一条而重新请求整个列表。
      draw();                                        // 重画列表。
      if (input) input.value = '';                   // 清空输入框，方便写第二条。
      submitBtn.disabled = false;                    // 恢复按钮。
      closeEditor();                                 // 收起面板。
    } catch {
      submitBtn.disabled = false;
      setMsg('网络错误，发布失败', true);
    }
  }

  /* ---------- 事件 ---------- */
  /* 「事件」= 用户做了某件事（点击、输入、按键…）。
     addEventListener('事件名', 要做的事) 就是「装一个监听器」：事情发生时自动调用后面的函数。 */
  moreBtn.addEventListener('click', renderMore);     // 给按钮装上「点击」监听，点了就执行 renderMore。
                                                     // 注意这里写的是 renderMore 而不是 renderMore()：
                                                     // 写名字 = 把函数本身交给监听器，等点击时才调用；写括号 = 立刻执行并把它返回值交出去（那就错了）。

  if (addBtn) {
    addBtn.addEventListener('click', () => {         // () => { ... } 是箭头函数的写法：没有参数，函数体在大括号里。
                                                     // 这里不需要 this，用箭头函数更短也更安全。
      const open = editor.style.display !== 'none';  // !== 是「严格不等于」。当前 display 不是 none，就说明面板是开着的。
      if (open) { closeEditor(); return; }           // 开着 → 这次点击当作「收起」，然后结束。
      editor.style.display = 'block';                // 关着 → 打开它（block = 作为块级元素显示）。
      setMsg('');                                    // 清掉上次的残留提示。
      if (input) input.focus();                      // .focus() = 把光标放进输入框，用户可以直接打字，省一次点击。
    });
  }
  if (cancelBtn) cancelBtn.addEventListener('click', closeEditor);   // 点取消 = 收起。
  if (submitBtn) submitBtn.addEventListener('click', submit);        // 点发布 = 执行 submit。
  if (input) {
    input.addEventListener('keydown', e => {         // keydown = 键盘按下事件。
                                                     // e 是「事件对象」：浏览器把这次按键的信息打包递给你。
                                                     // e.key 是按的哪个键（'Enter'、'a'、'Escape'…）；
                                                     // e.ctrlKey / e.metaKey 是「有没有按着 Ctrl / Cmd」，是 true / false。
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();   // Ctrl+Enter（Mac 上 Cmd+Enter）直接发布。
    });
  }

  /* ---------- 启动 ---------- */
  /* 下面又是一个 IIFE，只不过这次前面多了 async：定义一个异步函数并立刻执行。
     它做的事情：拿数据 → 决定用真数据还是兜底 → 画出来 → 检查权限。 */
  (async () => {
    const remote = await fetchLogs();                // 先试着从后端拿真数据（拿不到会返回 null）。
    logs = (remote && remote.length) ? remote : FALLBACK;   // 三元运算，读作：
                                                            // 「如果 remote 存在、并且它不是空数组，就用 remote，否则用 FALLBACK」。
                                                            // 注意这里是用 = 重新赋值给 logs（所以 logs 必须用 let 声明，不能用 const）。
    draw();                                          // 画出第一批。
    checkAdmin();                                    // 顺手判断当前用户能不能看到「添加」按钮（这句不用 await，因为不急着等它）。
  })();
})();                                                // 最外层 IIFE 的收尾：先 } 关闭函数体，再 ) 关闭包住函数的括号，最后 () 表示执行。
