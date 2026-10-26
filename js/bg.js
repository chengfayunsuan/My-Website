/* ============================================================
   文件：js/bg.js（背景层与背景视频）
   ------------------------------------------------------------
   作用：生成一层全屏背景，按优先级决定挂什么视频上去
         （网址参数 > 本机 IndexedDB 文件 > 直链 > config 全站默认），
         并在齿轮菜单里提供一个「背景视频」设置入口。

   为什么要有这个文件：
     网页默认是白底黑字。这个文件给整站铺一层「极光玻璃」渐变，
     或者铺一段循环播放的静音视频，让页面看起来不那么像文档。

   ★ 这个文件碰到的都是浏览器里比较「硬」的 API，先列一份名词速查：
     · IIFE —— (function(){ ... })()，写完立刻执行一次，变量不外泄，
               相当于「圈一块自己的地，用完收拾干净」。
     · 严格模式 —— 'use strict'，让 JS 用更严的规则检查，
               把「悄悄写错」变成「明确报错」。
     · DOM —— 浏览器把 HTML 解析出的元素树；
               document.createElement 就是在这棵树上造节点。
     · localStorage —— 浏览器本地存储，只能存字符串，约 5MB，
               适合放几十字节的配置，不适合放文件。
     · JSON —— 一种文本格式，长得像 JS 对象；
               stringify 是对象转字符串，parse 是字符串转对象。
     · IndexedDB —— 浏览器里的「小数据库」，能存几百 MB 甚至文件本体；
               异步，所有读写都必须包在事务里。
     · 事务 transaction —— 一组要么全成功、要么全失败的操作，
               像转账的「扣钱 + 加钱」，不会只完成一半。
     · object store —— IndexedDB 里的「表」，类似数据库的表。
     · Blob —— 一段二进制数据（视频/图片的原始字节）。
     · URL.createObjectURL —— 给 Blob 造一个临时地址
               （形如 blob:http://...），用完必须 revoke 释放。
     · Promise / then / catch —— 「未来会有结果」的凭据，
               then 接成功、catch 接失败。
     · 正则 —— /^video\// 这种文字规则，test() 判断字符串符不符合。

   注：本文件是 .js 不是 .html，所以下面写的注释都不会出现在页面上。
       浏览器只执行代码，注释单纯是给人看的。
   ============================================================ */
/* ============================================================
   背景层 + 背景视频导入
   ------------------------------------------------------------
   用法（三选一，优先级从高到低）：
     1) 网址带 ?bg=https://xxx.mp4      —— 临时预览，会记住
     2) 齿轮菜单 →「选本地文件」        —— 存进本浏览器，只有自己看得到
     3) js/config.js 里 window.BG_VIDEO —— 全站默认（所有人都能看到）
   都没有 → 只用极光玻璃背景，同样好看，零流量。

   ★ 为什么「选本地文件」是安全的（不违反 Cloudflare 条款）：
     视频文件存在你自己浏览器的 IndexedDB 里，播放时由浏览器从本地磁盘读，
     一个字节都不经过 Cloudflare。别人访问你的站，他们浏览器里没有这个文件，
     于是自动退回极光背景 —— 他们看不到，也不产生任何 CDN 流量。
     Cloudflare 的条款限制的是「用它的网络分发视频」，
     而不是「页面上有没有视频」。
     所以：本地文件 = 合规且零流量；
           传到 Pages/R2 之外的任何免费直链 = 违规。
   ============================================================ */


/* 【IIFE 立即执行函数】
   最外层这一对括号是个经典套路：(function () { ... })();
   拆开看是三件事：
     1. function () { ... }  —— 造一个「没有名字」的函数（函数表达式）
     2. 外面套一层 ( )       —— 把它包起来，让它是「表达式」而不是「声明」
     3. 末尾再加一个 ( )     —— 立刻调用它，不用等谁喊
   为什么要这么写？
     · JS 里用 var/function 声明的变量默认是「全局」的，
       也就是挂在 window 上。全站有十几个脚本，
       大家都能往 window 上扔同名的变量，一定会打架。
       包进函数里，就是给这个文件的变量圈一块自己的地，
       外面看不见，也不会被外面覆盖。
     · 文件里所有的变量（LS_KEY、db、video……）都活在这个函数作用域里，
       函数执行完，除了特意挂到 window 上的东西，其余全部可以被回收。
   【为什么外层还要再包一对括号？】
     如果写成 function () {}()，JS 解析器看到行首的 function 关键字，
     会认为这是「函数声明」，而函数声明必须有名字 —— 直接语法错误。
     加一对括号让它变成「表达式」，解析器就不会挑名字了。
   顺带一提：现代写法还有 () => { ... }() 和 { ... } 块级作用域，
   但这段代码用了 var 和 ES5 写法，说明作者有意兼容老浏览器。 */
(function () {
  /* 【严格模式 'use strict'】
     必须是函数体的第一句（前面只能有注释），否则整个文件都不会生效。
     它把 JS 从「宽松模式」切到「严格模式」，主要变化：
       · 没声明就给变量赋值 → 直接报错（宽松模式会偷偷建一个全局变量）
       · 函数里 this 是 undefined 而不是 window（防止误用）
       · 不许给只读属性赋值（比如 Math.PI = 3，会抛错）
       · 不许用八进制字面量 012、不许 delete 变量、不许重复参数名
     一句话：把「写错了但能跑」变成「写错了立刻报错」。
     代价是：某些老代码搬过来会报错。但这是好事，问题提前暴露。 */
  'use strict';

  /* 【localStorage 的键名】
     起名用「点分前缀」site.bg.video，而不是随便叫 video。
     为什么？localStorage 是「同一个域名下所有页面共用一个大抽屉」，
     你放进去的键，同域名下任何脚本都能读。
     加前缀相当于给自己的东西贴个标签，避免和别的库撞名。
     这条记录里存的是「视频直链」（一个几十字节的网址），
     不是视频文件本身 —— 文件太大，localStorage 存不下。 */
  var LS_KEY = 'site.bg.video';

  /* ============ IndexedDB：把本地视频存进浏览器 ============
     为什么不能用 localStorage 存视频？
       localStorage 的容量上限大约 5MB，而且是「同步」API ——
       读写会阻塞主线程，存大文件页面直接卡死。
     为什么 IndexedDB 可以？
       它是浏览器内置的数据库，配额通常几百 MB 到几 GB
       （具体看磁盘剩余空间和浏览器策略），
       而且全异步，存的时候页面照样流畅。
     【代价】
       用起来啰嗦：开库 → 开事务 → 拿 request → 等回调，
       四步起步，不像 localStorage 一行搞定。
       所以下面会封装四个函数：idbOpen / idbGet / idbPut / idbDel。 */

  /* 【数据库名】
     同一个域名下可以建很多个 IndexedDB 数据库，靠名字区分。
     这个名字只在本机有效，不联网、不上传。 */
  var DB_NAME = 'site.bg.db';

  /* 【object store 名字】
     IndexedDB 的结构是：数据库 → 表（object store）→ 记录。
     这里只需要一张表，专门放文件，所以叫 files。
     注意：store 名字一旦建好就不能改名，
           要改名必须升级版本号、删旧建新。 */
  var STORE = 'files';

  /* 【记录键名】
     这张表只存一条记录（当前用的那段视频），
     所以键名固定写死 current，相当于「当前这个」。
     想换视频？直接 put 覆盖同一条记录就行。
     这种「单例记录」的思路在配置类场景很常见。 */
  var REC_KEY = 'current';

  /* 【idbOpen：打开数据库】
     返回 Promise 的原因：
       indexedDB.open() 是异步的，结果不是立刻拿到，
       而是通过 onsuccess / onerror 回调通知。
       用 Promise 包一层，调用方就能写 idbOpen().then(...) 链式调用，
       不用嵌套一堆回调（那叫「回调地狱」）。 */
  function idbOpen() {
    /* 【new Promise(executor)】
       构造 Promise 时要传一个函数，这个函数会立刻被执行，
       并且拿到两个参数：resolve（成功）和 reject（失败）。
       注意：这个函数是「立刻执行」的，
       所以下面的 indexedDB.open 会马上被调用，不用等谁。 */
    return new Promise(function (resolve, reject) {
      /* 【能力检测】
         极老的浏览器（IE 早期、某些嵌入式内核）没有 indexedDB。
         直接访问 window.indexedDB 不会报错（只是 undefined），
         但调用 indexedDB.open 就会 TypeError 崩掉。
         所以先检查，没有就自己 reject 一个带中文说明的错误。
         【return reject(...) 为什么要 return？】
           reject 本身不需要 return，但加上 return 之后，
           这一行执行完就离开函数，后面的代码不会再跑。
           如果忘了 return，代码会继续往下 try 着 open，
           那就直接抛出真正的 TypeError，错误信息变得难懂。 */
      if (!window.indexedDB) return reject(new Error('浏览器不支持 IndexedDB'));

      /* 【open(名字, 版本号)】
         第二个参数 1 是「版本号」，非常重要：
           · 第一次调用时，数据库不存在 → 创建它，
             并触发 onupgradeneeded（升级回调）
           · 之后每次调用版本号相同 → 直接打开，不触发升级
           · 如果哪天把 1 改成 2 → 再次触发 onupgradeneeded，
             可以在这个回调里改表结构（加字段、建索引）
         【版本号只能加不能减】
           用旧版本号去开一个已经升级过的库，会直接报 VersionError。
           所以升级要谨慎，改完就回不去了（除非让用户清数据）。 */
      var req = indexedDB.open(DB_NAME, 1);

      /* 【onupgradeneeded】
         建库/升级时触发，这是唯一能「改表结构」的时机。
         错过这个回调，之后就没法建表了（只能在版本号 +1 时再改）。
         req.result 就是数据库对象（在升级事件里也能拿到，但规范建议用 event.target.result，两者通常一致）。 */
      req.onupgradeneeded = function () {
        var db = req.result;

        /* 【contains + createObjectStore】
           为什么要先 contains 判断？
             如果表已经存在还去 createObjectStore，会抛 ConstraintError 让整个升级失败。
             第一次建库时表不存在，所以要建；
             如果以后升到版本 2，表已经在了，就得跳过。
           创建时的细节：
             createObjectStore(STORE) 没传第二个参数，
             意味着「不指定 keyPath」——
             也就是主键不由记录内容决定，而是在 put 时手动传进去。
             下面 idbPut 里的 put(rec, REC_KEY) 就是这个原因：
             第二个参数 REC_KEY 就是手动指定的主键。
           【另一种常见写法】
             createObjectStore('files', { keyPath: 'id' })
             这样记录里必须有 id 字段，put 时不用传键。
             两种方式都合法，区别只是「主键从哪来」。 */
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };

      /* 【onsuccess / onerror】
         打开成功 → 把数据库对象交出去（resolve 出去），
         调用方的 .then 就能拿到它。
         打开失败 → 把错误对象交出去。
         【req.error 长什么样？】
           是一个 DOMException，有 name（如 'QuotaExceededError'）
           和 message 两个关键属性，排查问题时看 name 最有用。 */
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* 【idbGet：读回存过的视频记录】
     结构是 { name, size, type, blob, t }：
       name —— 原始文件名，弹窗里显示「当前已存：xxx.mp4」
       size —— 字节数，显示大小用
       type —— MIME 类型（video/mp4 之类）
       blob —— 文件本体，最关键的一项
       t    —— 存入时间戳，方便以后调试
     返回值：Promise<记录对象 | null>。 */
  function idbGet() {
    /* 【then 的返回值会「穿透」】
       这里 .then 的回调返回的是一个新的 Promise，
       所以整个 idbGet() 返回的也是那个新 Promise。
       这叫「Promise 链」：前一步成功了才走下一步。
       【这种嵌套写法其实可以拍平】
         idbOpen().then(db => ...) 里又 new Promise，
         是「在 Promise 里再造 Promise」，
         更扁的写法是用 async/await 或者把事务封装成函数。
         但这段代码用了 ES5 语法（var、function），
         说明作者为了兼容老浏览器放弃了 async/await。 */
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        /* 【事务 transaction】
           参数一：表名（可以传数组 ['files','meta'] 表示同时操作多张表）
           参数二：模式
             'readonly'  —— 只读，多个只读事务可以并发
             'readwrite' —— 读写，同一张表同一时刻只能有一个
             'versionchange' —— 改表结构用，一般不用手动开
           为什么读也要开事务？
             这是 IndexedDB 的设计：所有操作都在事务里，
             事务保证「要么都成功要么都失败」。
             只读事务虽然是只读，但也必须存在，否则拿不到 objectStore。 */
        var tx = db.transaction(STORE, 'readonly');

        /* 【get(键)】
           返回一个 IDBRequest，同样靠 onsuccess / onerror 回调。
           【注意 request 成功 ≠ 事务成功】
             req.onsuccess 表示「这一条操作完成」；
             tx.oncomplete 表示「整个事务提交、数据真正落盘」。
             读操作两者差别不大；
             写操作就必须等 tx.oncomplete，
             否则可能在数据真正写入前就告诉用户「保存成功」，
             而实际上可能因为配额不足在提交时失败。
             下面的 idbPut 用的是 tx.oncomplete，这是正确的。 */
        var req = tx.objectStore(STORE).get(REC_KEY);

        /* 【req.result || null】
           如果这个键从来没存过，get 不会报错，
           而是让 result 等于 undefined。
           undefined 和 null 在业务上都是「没有」，
           但返回 null 更明确（undefined 容易让人怀疑是写错了）。
           || 运算符在这里起了「兜底」作用：falsy 就用右边。
           【falsy 值有哪些？】
             false、0、''、null、undefined、NaN
             注意 0 和 '' 也是 falsy，
             所以如果 result 可能是 0，就不能用 || 兜底，
             得用 ?? （空值合并，只认 null/undefined）。 */
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    /* 【.catch 的位置很关键】
       这个 catch 挂在最外层，所以它既能接住 idbOpen 的失败，
       也能接住里面 new Promise 的失败 —— 整条链上任何一步出错都被吞掉。
       吞掉的方式是 return null，也就是「当成没存过」，
       于是调用方会自然退回极光背景，页面不崩。
       【这是有意的「降级」设计】
         背景视频是锦上添花的功能，
         它挂了也不该让整个页面用不了。
         所以这里宁可吞掉错误，也不往上抛。
       【代价】
         真出问题时你完全看不到错误，排查会很痛苦。
         调试时应该临时把它改成 .catch(e => { console.error(e); return null; })。 */
    }).catch(function () { return null; });
  }

  /* 【idbPut：写入 / 覆盖 current 记录】 */
  function idbPut(rec) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        /* 这次是写，所以模式必须是 readwrite */
        var tx = db.transaction(STORE, 'readwrite');

        /* 【put(记录, 主键)】
           put 的语义是「有就覆盖、没有就新建」（upsert）。
           想「只在不存在时新建」用 add()，
           但 add 在键已存在时会报 ConstraintError。
           这里要的就是覆盖，所以用 put。
           【第二个参数 REC_KEY 为什么必须传？】
             上面 createObjectStore(STORE) 没有指定 keyPath，
             说明主键要手动给。不传第二个参数会报 DataError。
           【rec.blob 传的是 File 对象，这能存吗？】
             能。IndexedDB 用「结构化克隆」序列化数据，
             支持的类型包括：普通对象、数组、Date、Blob、File、
             ArrayBuffer、Map、Set 等。
             不支持：函数、DOM 节点、class 实例（会丢原型变成普通对象）。
             存 File 的时候，浏览器会把二进制内容整个落到磁盘上，
             所以刷新、关浏览器、重开都还在。 */
        tx.objectStore(STORE).put(rec, REC_KEY);

        /* 【tx.oncomplete，不是 req.onsuccess】
           前面讲过：写入要看事务提交。
           put 本身没有 return 出 request（这里没接 onsuccess），
           直接等事务完成更简洁，也更能反映「真的存好了」。
           【oncomplete 什么时候触发？】
             事务里所有请求都成功完成，且事务还没被人为中止，
             这时才触发。如果中途有任何一个请求失败，
             整个事务会被中止，触发 onabort 或 onerror，数据一个都不会写入。 */
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* 【idbDel：删掉 current 记录】 */
  function idbDel() {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        /* 【delete(键)】
           按键删一条记录。
           有别于 clear() —— clear 是清空整张表。
           这里只有一条记录，两者效果相同，
           但 delete 语义更精确（只删 current，不碰别的）。 */
        tx.objectStore(STORE).delete(REC_KEY);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    /* 删不掉也当失败处理（返回 false），不往上抛错。
       常见失败原因：数据库被别的标签页占用、用户开了隐私模式等等。 */
    }).catch(function () { return false; });
  }

  /* ============ 造背景层的 DOM ============ */

  /* 【createElement：纯内存造节点】
     这时候元素还没进页面，只是存在于内存里。
     必须 appendChild / insertBefore 之后才会显示。
     【这样做的两个好处】
       1. 可以在挂上去之前把所有属性、内容都配好，
          避免用户看到一个「半成品闪一下」
       2. 不写死在 HTML 里，全站任何页面引入这个 js 就自动有背景，
          不用每个 html 都复制一遍这段结构 */
  var root = document.createElement('div');

  /* 【id 对应 CSS 里的 #site-bg】
     在 style.css 里应该能找到 #site-bg { position: fixed; z-index: -2; ... }
        position: fixed —— 相对视口固定，滚动时不动
        z-index: -2    —— 负数！跑到所有正常内容的下面
        inset: 0       —— 等价于 top/right/bottom/left 全 0，铺满整屏
     负 z-index 的意义：它是「最底层的地板」，
     页面上的内容天然就在它上面，不需要给每个元素加 z-index。
     【坑】如果 body 上有背景色，会把负 z-index 的元素完全盖住，
          所以 body 的背景色必须设成 transparent。 */
  root.id = 'site-bg';

  /* 【aria-hidden="true"】
     给屏幕阅读器（盲人用的朗读软件）的提示：
     「这一层是纯装饰，不用管它」。
     如果不加，阅读器可能会去读里面的 video 元素，
     甚至念出「视频，无字幕，循环播放」之类的噪音，
     干扰真正的内容。
     【什么该设 aria-hidden？】
       纯视觉装饰：背景图、分隔线、纯图标。
       有信息量的东西：图片、视频内容、数据图表。
       拿不准的话问自己：删掉它，用户损失了什么信息？
       没损失 → aria-hidden 或者空 alt。 */
  root.setAttribute('aria-hidden', 'true');

  /* 【innerHTML 一次性塞多个子元素】
     用字符串拼接造 4 个空 div：
       .aurora.a1/.a2/.a3 —— 三个不同颜色的模糊光斑，
                            靠 CSS 的 filter: blur() + 动画做成极光
       .noise             —— 一层噪点纹理，
                            让纯色渐变看起来有颗粒感、不那么廉价
     这些 div 都没有内容，纯粹是给 CSS 当画布用的。
     【为什么不用 createElement 一个个造？】
       四个元素的话，字符串一次拼完更短。
       但凡有用户输入要插进来，就必须转义（见下面的 esc 函数），
       否则就有 XSS 风险。这里全是写死的字符串，安全。 */
  root.innerHTML =
    '<div class="aurora a1"></div>' +
    '<div class="aurora a2"></div>' +
    '<div class="aurora a3"></div>' +
    '<div class="noise"></div>';

  /* 【插到 body 最前面】
     为什么是「第一个子元素」而不是最后？
       虽然 z-index: -2 已经能保证它在下面，
       但 DOM 里的顺序也会影响一点点渲染顺序。
       放在最前面，逻辑上更符合「背景在内容之前」。
     【三元表达式的兜底】
       如果这个脚本在 <head> 里执行，
       那时 document.body 还是 null（body 标签都还没解析到）。
       document.body || document.documentElement 保证一定有个父节点可以挂：
         body 存在 → 挂 body
         body 不存在 → 挂 <html>（documentElement 就是 html 元素）
     【insertBefore(新节点, 参照节点)】
       把新节点插到参照节点前面。
       参照节点传 null 的效果等于 appendChild（加到末尾）。
       所以这里的表达式是：body 在就插到 body 第一个子元素前，否则加到 html 末尾。 */
  (document.body || document.documentElement).insertBefore(
    root,
    document.body ? document.body.firstChild : null
  );

  /* 【暗幕 veil】
     盖一层半透明黑色，压暗背景，
     让上面的白色文字在亮色视频背景上也能看清。
     【Local 风格默认不压暗】
       下面立刻把 display 设成 none，
       因为 Local 的视觉是「视频直接露出来」，
       压了黑反而糊。
       但元素还是留着 —— 换个风格改一行 CSS 就能打开。 */
  var veil = document.createElement('div');
  veil.className = 'veil';
  veil.style.display = 'none';   // 内联样式优先级高于 CSS 类，所以这句能覆盖 CSS 里的设置
  root.appendChild(veil);        // veil 是 root 的子元素，所以跟着 root 一起定位、一起铺满

  /* 【两个状态变量】
     video —— 当前正在播的那个 <video> 元素。
     为什么要记着它？
       换片时要先把旧的删掉，否则屏幕上会叠好几段视频同时播，
       既耗性能又难看。
     objUrl —— 当前播放的本地 blob 地址。
     为什么要单独记？
       见下面 releaseObj 的讲解：blob 地址不释放会内存泄漏。 */
  var video = null;
  var objUrl = '';

  /* 【releaseObj：释放旧的 blob 地址】
     【什么是 blob 地址？】
       URL.createObjectURL(file) 会返回一个形如
         blob:http://localhost:8080/9f8a-3c2d-...
       的字符串。它是一个「临时的本地地址」，
       可以直接塞进 <video src> 或 <img src>，
       浏览器会从内存里的那个 Blob 读数据，不走网络。
     【为什么必须手动释放？】
       这个地址会让浏览器一直「引用」住那个 Blob，
       就算没人用了也不回收。一个 500MB 的视频，
       反复换十次就是 5GB 内存，浏览器直接卡死。
       所以只要不再用了，就必须调 URL.revokeObjectURL 断开引用。
     【参数 keep 是什么？】
       「这次要留着用的那个地址」。
       场景：从 blob A 换到 blob A（同一段）时不应该释放它。
       调用方传 keep = 新地址，函数内部比较：
         旧地址存在、且旧地址 ≠ 新地址 → 旧的没用了，释放
       这个参数设计很简洁，避免了「先释放再发现是同一个」的尴尬。 */
  function releaseObj(keep) {
    if (objUrl && objUrl !== keep) {
      /* 【try...catch 包一层】
         revokeObjectURL 传一个已经释放过的地址通常不会报错，
         但某些浏览器的实现里可能抛异常。
         这里静默忽略 —— 释放失败不是致命问题，
         最坏结果是内存多占一会儿。 */
      try { URL.revokeObjectURL(objUrl); } catch (e) { /* 忽略 */ }
      objUrl = '';
    }
  }

  /* ============ localStorage 读写（存直链） ============ */

  /* 【readSaved：读出存过的直链】
     整个函数包在 try 里，原因有两个：
       1. localStorage.getItem 在「禁用 Cookie / 无痕模式某些设置」下
          会直接抛 SecurityError
       2. JSON.parse 遇到坏数据会抛 SyntaxError
     任何一个炸掉都会让后面整个脚本停摆，所以必须兜住。 */
  function readSaved() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      /* 【没存过时 getItem 返回什么？】
         返回 null（不是空字符串，也不是 undefined）。
         !raw 对 null、''、undefined 都成立，所以这句能兜住所有「没有」的情况。 */
      if (!raw) return '';

      /* 【JSON.parse：字符串 → 对象】
         存进去的时候是 JSON.stringify({url, t})，
         取出来必须 parse 回来才能读 .url 字段。
         【为什么不直接存裸地址？】
           因为 localStorage 只能存字符串。
           理论上直接 setItem(LS_KEY, u) 也能工作，
           但那样就没法附加时间戳等额外信息了。
           用 JSON 包一层，以后加字段不用改结构。 */
      var o = JSON.parse(raw);

      /* 【防御性检查】
         raw 可能不是这个网站写的 ——
         同一个域名下别的脚本、或者手贱在控制台改过，
         都可能留下结构不对的数据。
         o && typeof o.url === 'string' 确保：
           · o 不是 null / undefined
           · o.url 真的存在且是字符串
         不满足就返回空，让调用方当成「没设置」。 */
      return (o && typeof o.url === 'string') ? o.url : '';
    } catch (e) { return ''; }
  }

  /* 【saveUrl：保存 / 清除直链】 */
  function saveUrl(u) {
    try {
      /* 【这段是「if 后面不带花括号」的写法】
         if (u) 语句A; else 语句B;
         JS 允许 if 后面只跟一条语句，不写花括号。
         优点是短；缺点是分支里超过一行就容易看错，
         而且以后想加第二行代码时，忘了补花括号就会出 bug。
         所以现代编码规范（ESLint 默认规则）一般都要求必须写花括号。
         这里保留原样，读的时候注意：只有紧接着的那一条语句属于 if。 */
      if (u) localStorage.setItem(LS_KEY, JSON.stringify({ url: u, t: Date.now() }));
      /* 【JSON.stringify】对象 → 字符串。
         t: Date.now() 是毫秒时间戳，存下来只是方便以后调试
         （比如怀疑「设置没生效」，可以看看到底什么时候写的）。 */
      else localStorage.removeItem(LS_KEY);
      /* 【传空 = 删除】
         removeItem 比 setItem(LS_KEY, '') 更干净：
         前者把键整个删掉，后者会留下一个值为空字符串的键。
         两者在 readSaved 里都会被当成「没有」，
         但 removeItem 不占位，语义也更准确。 */
    } catch (e) { /* 隐私模式 / 配额满了，存不了就算了，不影响页面 */ }
  }

  /* 【pickParam：读网址上的 ?bg= 参数】
     比如访问 https://site.com/?bg=https://x.com/a.mp4
     这个函数就返回 'https://x.com/a.mp4'。
     用途：临时预览某个视频，不用改代码、不用进设置界面。 */
  function pickParam() {
    try {
      /* 【location.search】
         就是网址里问号开始的那一截，比如 '?bg=abc&x=1'。
       【URLSearchParams】
         浏览器内置的查询串解析器，把 '?a=1&b=2' 变成一个可以 .get() 的对象。
         它会自动处理：
           · URL 解码（%20 变回空格、%E4%B8%AD 变回中文）
           · & 和 = 的分隔
           · + 号转空格（表单提交的历史遗留规则）
         比自己 split('&') 再 split('=') 靠谱得多。 */
      var q = new URLSearchParams(location.search).get('bg');
      /* 【q || null】
         参数写成 ?bg=（空值）时，get 返回空字符串 ''。
         空字符串是 falsy，所以会被转成 null，
         后面 boot 里就能用 if (q) 统一判断「有没有有效参数」。 */
      return q || null;
    } catch (e) { return null; }
  }

  /* ============ 挂载视频 ============ */

  /* 【mountVideo：把一段视频铺到背景上】
     参数：
       src    —— 视频地址（http 直链 或 blob: 地址）
       isBlob —— 是不是本地文件生成的 blob 地址
     这个函数同时承担「卸载」的职责：
       传空字符串进来就等于「不要视频了，回到极光背景」。 */
  function mountVideo(src, isBlob) {
    /* 【先释放上一段的 blob】
       注意顺序：一定要在换 src 之前释放，
       否则 objUrl 被覆盖后，旧地址就再也找不到了，
       内存永远泄漏（这是最典型的 blob 内存泄漏写法）。 */
    releaseObj(src);

    /* 【摘掉旧视频】
       video.remove() 把元素从 DOM 里删掉。
       【只 remove 就够了吗？】
         元素从 DOM 移除后，浏览器的媒体引擎会停止播放；
         但如果 JS 里还有变量引用着它，
         内存不会立刻回收。所以下面同时把 video 置为 null，
         让垃圾回收（GC）能够收走它。
       【remove() 兼容性】
         IE 不支持 remove()，得写 parentNode.removeChild(video)。
         现代浏览器（2015 年之后）都支持。 */
    if (video) { video.remove(); video = null; }

    /* 先把暗幕关掉：新视频还没加载出来，这时候压暗只会让画面一片黑 */
    veil.style.display = 'none';

    /* 【早退：没有地址就是「不要视频」】
       这种「先处理边界情况，再走主流程」的写法叫 guard clause（守卫语句），
       好处是不用把主逻辑包在一层层 if 里面，读起来更直。 */
    if (!src) return;

    /* 【只记住 blob 地址，不记 http 地址】
       为什么？因为 URL.revokeObjectURL 只对 blob: 地址有效，
       对 http 地址调用虽然不报错，但毫无意义。
       isBlob 这个参数就是干这个用的。 */
    if (isBlob) objUrl = src;

    /* 造一个新的 video 元素（同样不写死在 HTML 里） */
    var v = document.createElement('video');

    /* 【静音：自动播放的硬性前提】
       现代浏览器的自动播放策略（Autoplay Policy）：
         有声音的视频，必须先有用户交互（点击/按键）才能自动播，
         否则 play() 会被拒绝，元素显示成一个播放按钮。
         静音的视频不受此限制，可以直接播。
       背景视频本来也不该出声，所以静音既合规又合理。
       【三重保险的必要性】
         v.muted = true          —— JS 属性，现代浏览器认
         v.defaultMuted = true   —— 对应 HTML 的 muted 属性，
                                    有些浏览器只在初始加载时读这个
         setAttribute('muted')   —— 真正写 HTML 属性，
                                    兼容只认属性的老内核
       三个都写看起来啰嗦，但这确实是踩过坑之后的写法：
       只写 v.muted 在部分浏览器的某些版本上，
       自动播放依然会被拦。 */
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;          // 循环播放：背景视频播完就没了会很奇怪
    v.autoplay = true;      // 自动播放
    v.playsInline = true;   // iOS 上不自动进全屏
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');                  // 属性写法：有值就行，空字符串也行
    v.setAttribute('webkit-playsinline', '');           // 老版 iOS Safari 只认这个带前缀的
    v.preload = 'auto';     // 提前缓冲：背景视频希望它尽快能播

    /* 【指定地址】
       这一行会立刻触发浏览器开始下载/读取。
       所以放在最后 —— 前面把所有属性都配好了再赋值，
       避免浏览器拿到半配置的元素就开始加载。 */
    v.src = src;

    /* 【加载失败：静默退回极光】
       可能的原因：
         · 文件不存在（404）
         · 跨域被挡（服务器没给 CORS 头）
         · 编码不支持（比如 .mov 的 HEVC 在 Chrome 上放不了）
         · 不是视频文件（用户手滑选了张图片）
       处理策略：什么都不提示，直接删掉视频，露出极光背景。
       理由：这是装饰功能，用户没主动要求时报错只会让人困惑。 */
    v.addEventListener('error', function () {
      /* 【关键的一行判断：video === v】
         考虑这个时序：
           1. 挂载视频 A（开始加载）
           2. 用户立刻换成视频 B
           3. A 的加载失败了，error 回调触发
         如果没有这个判断，A 的 error 回调会把「当前视频」
         （其实已经是 B 了）给删掉，B 白白消失。
         加上 video === v 之后，A 的回调发现
         「当前不是我了」，就不动手。
         【这个模式叫「过期回调守卫」】
           凡是异步回调里要改全局状态，都应该先确认
           「我是不是还是最新的那个」。
           发请求防竞态用的是同一套思路。 */
      if (video === v) {
        v.remove();
        video = null;
        veil.style.display = 'none';
      }
    });

    /* 【loadeddata：已经拿到第一帧数据】
       视频的生命周期事件，顺序大概是：
         loadstart  → 开始加载
         loadedmetadata → 拿到时长、尺寸等元信息
         loadeddata → 拿到当前播放位置的第一帧 ← 这里用这个
         canplay → 缓冲够了，可以开始播
         canplaythrough → 预计能不卡地播完
       为什么选 loadeddata 而不是 canplay？
         loadeddata 更早，用户能更快看到画面。
         背景视频不需要「零卡顿」，只要尽快出画就行。
       【为什么不直接在这里 appendChild？】
         因为「必须先确认能播，再把元素挂上去」——
         否则用户会看到一块黑色的空白区域闪一下。 */
    v.addEventListener('loadeddata', function () {
      veil.style.display = 'block';

      /* 【insertBefore(v, veil)：插到暗幕前面】
         注意 DOM 顺序决定层级：
           在都没有 z-index 的情况下，
           后面的元素盖在前面的元素上面。
         所以 v 插在 veil 之前 → v 在下，veil 在上，
         veil 那层半透明黑才能盖住视频。
         （当前 veil 是 display:none，所以实际看不到，但结构是对的。）
       【重复挂载的风险】
         如果 loadeddata 因为某种原因触发两次
         （比如 src 被重新赋值），这里会重复插入同一个节点。
         同一个节点重复插入其实是「移动到新位置」，不会真的变两个，
         所以这里没有明显 bug，但严格说加个检查更稳妥。 */
      root.insertBefore(v, veil);

      /* 【play() 返回 Promise】
         老规范里 play() 返回 undefined，新规范返回 Promise。
         Promise 的拒绝原因通常是「自动播放被拦截」。
         【为什么还要调一次 play？】
           虽然设了 autoplay 属性，但在某些浏览器上
           动态创建的元素不会自动遵守 autoplay，
           必须手动调一次才播。
         【p && p.catch 这个判断】
           兼容老浏览器（返回 undefined 的情况），
           不然 undefined.catch 会 TypeError。
         播放失败就静默 —— 用户至少还能看到视频的第一帧（暂停状态），
         不至于一片黑。 */
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* 某些浏览器需要交互才播，静默 */ });
    });

    /* 最后才把当前视频记下来。
       注意：这一步在加载完成之前就执行了，
       因为后面如果马上又调 mountVideo，要靠 video 变量找到它并删掉。 */
    video = v;
  }

  /* ============ 弹窗：导入背景视频 ============ */

  /* 【fmtSize：把字节数变成人话】
     1024 而不是 1000 —— 计算机用二进制，
     但硬盘厂商用十进制标容量，
     这就是「买 1TB 硬盘只有 931GB」的原因。 */
  function fmtSize(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';  // 1024³
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';        // 1024²
    /* 【Math.max(1, ...) 的作用】
       小于 512 字节的文件会被 round 成 0，
       显示成「0 KB」很怪，所以强行拉到最小 1 KB。
       【toFixed(1) 的坑】
         返回的是字符串（不是数字），而且会四舍五入，
         对 NaN 和 Infinity 会返回 'NaN' / 'Infinity'。 */
    return Math.max(1, Math.round(n / 1024)) + ' KB';
  }

  /* 【esc：转义 HTML 特殊字符】
     这是防 XSS（跨站脚本攻击）的第一道门。
     场景：用户上传的文件名可能是
       <img src=x onerror=alert(1)>.mp4
     如果直接拼进 innerHTML，
     浏览器会把这段当真正的标签解析，onerror 里的代码就执行了。
     这就是「存储型 XSS」—— 攻击代码存在数据库/本地，
     以后每次渲染都执行一遍。
     【五个字符的作用】
       & → &amp;   实体本身，必须最先转，否则会把自己的 & 重复转义成 &amp;amp;
       < → &lt;    左尖括号，最常见的标签起点
       > → &gt;    右尖括号
       " → &quot;  双引号，用于属性值里突破引号边界
       ' → &#39;   单引号，同理（HTML 里 &#39; 比 &apos; 兼容性好）
     【正则 /[&<>"']/g 里的 g】
       全局匹配，替换所有出现的位置。
       不加 g 只替换第一个，等于没防住。
     【用对象查表代替 switch】
       { '&': '&amp;', ... }[c] 这种写法叫「查表法」，
       比 if/else 链或 switch 更短也更快，
       而且一眼能看出每个字符对应什么。 */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 【openDialog：打开设置弹窗】
     这个弹窗不用 HTML 文件里写死，而是全用 JS 现场拼出来。
     好处：一个 js 文件管到底，html 里一行都不用加。
     坏处：结构藏在字符串里，改样式要翻代码（下面会讲这个代价）。 */
  function openDialog() {
    /* 【单例检查】
       连点两次「背景视频」不应该弹出两个窗。
       先找有没有 id 为 bgDlg 的元素，有就先删掉。
       这种「打开前先清理」的模式比「防止重复点击」更可靠 ——
       不管因为什么原因留下了残留，都能被这次清理掉。 */
    var old = document.getElementById('bgDlg');
    if (old) old.remove();

    /* 读出之前存过的直链，稍后填进输入框（让用户看到当前设置） */
    var cur = readSaved();

    var dlg = document.createElement('div');
    dlg.id = 'bgDlg';
    /* 【复用全站通用弹窗样式】
       generic-modal 负责遮罩（fixed + inset:0 + 半透明黑 + 居中），
       show 负责把它从「隐藏」切到「显示」（通常带个淡入动画）。
       这种「一套通用样式 + 场景特化」的思路很值得学：
       全站所有弹窗长得一样，只有内容不同。 */
    dlg.className = 'generic-modal show';

    /* 【大段字符串拼接】
       每一行 '...' 后面跟 + 号，接下一行。
       注意注释必须写在字符串外面 ——
       字符串里面写 // 会被当成文字内容，直接显示在页面上！
       这是新手最常踩的坑之一，尤其从别的语言（Python/C）转过来的人。
       【拼接 vs 模板字符串】
         这里用 + 拼，是因为要保持 IE/老浏览器兼容
         （模板字符串是 ES6，IE 完全不支持）。
         现代项目里直接用一个反引号包住整段更清爽。 */
    dlg.innerHTML =
      /* 外层容器：固定 500px 宽（内联样式，优先级最高，改起来不方便，算是这段代码的瑕疵） */
      '<div class="generic-box" style="width:500px">' +
        /* 关闭按钮 ×，aria-label 让屏幕阅读器念出「关闭」而不是「乘号」 */
        '<button class="generic-close" type="button" aria-label="关闭">×</button>' +
        '<h3 class="generic-title">背景视频</h3>' +
        '<div class="generic-body">' +
          /* 一句话说明用途，字号 13px 是注释性文字的标准尺寸 */
          '<p style="font-size:13px;color:var(--text-light);line-height:1.7;margin-bottom:14px">' +
            '铺满整页、自动循环、静音播放。留空就是默认的极光玻璃背景。' +
          '</p>' +

          /* —— 推荐方式：本地文件存进浏览器 —— */
          /* 单独描边 + 圆角，视觉上把「推荐」这条路突出出来。
             1px solid var(--border) 用的是 CSS 变量，换主题时自动跟着变。 */
          '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px">' +
            '<div style="font-size:14px;font-weight:600;margin-bottom:4px">本机视频（推荐 · 别人看不到）</div>' +
            '<p style="font-size:12px;color:var(--text-light);line-height:1.6;margin:0 0 8px">' +
              '文件存在你这个浏览器的 IndexedDB 里，不经过任何服务器，<b>零流量</b>。' +
              '刷新后依然有效；换设备或换浏览器就没有了。' +
            '</p>' +

            /* 【橙色提醒：只在当前域名生效】
               浏览器按「源（域名 + 端口 + 协议）」隔离存储：
                 http://localhost:8080 存的东西
                 http://localhost:3000 完全看不到
                 https://xxx.pages.dev 也看不到
               这是安全设计（防止 A 网站读 B 网站的数据），
               但用户很容易以为是 bug，所以要在界面上写明。
               #FFB020 是硬编码的橙色 —— 没有用 CSS 变量，
               换主题时这行颜色不会变，算个小瑕疵。 */
            '<p style="font-size:12px;color:#FFB020;line-height:1.6;margin:0 0 10px">' +
              '只在当前域名生效：<b>' + esc(location.host || location.hostname) + '</b>' +
              '　其它域名 / 换端口都要重新选一次。' +
            '</p>' +

            /* 【占位元素】
               现在写「读取中…」，等下面 idbGet 拿到数据后再替换成文件名。
               为什么不在这里直接同步显示？
                 因为 IndexedDB 是异步的，得等回调。
                 先给个占位，用户才不会以为界面卡了。
               这个元素的引用会在下面通过 id 拿到。 */
            '<p id="bgLocalInfo" style="font-size:12.5px;margin:0 0 10px;color:var(--text-light)">读取中…</p>' +

            /* 【label 包 input 的经典套路】
               <label> 和它内部的 <input> 会自动关联：
               点击 label 里的任何文字，都等于点击了那个 input。
               所以这里 input 设 display:none 藏起来，
               用户看到的是一个好看的按钮文字「选一个视频文件」，
               实际点击的是那个隐藏的文件框。
               【另一种写法】
                 <label for="bgFile">文字</label>
                 <input id="bgFile" type="file">
                 通过 for 属性关联，两元素不用挨着。
               区别：嵌套写法不需要 id，写法更省事；
                     for 写法更灵活（可以远距离关联）。
               【accept 属性】
                 只是给对话框里的「文件类型」下拉框一个默认筛选，
                 用户可以手动改成「所有文件」绕过去。
                 所以真正的校验必须在 JS 里再做一次（下面有做）。 */
            '<label class="log-submit" style="display:inline-flex;align-items:center;cursor:pointer">' +
              '选一个视频文件' +
              '<input id="bgFile" type="file" accept="video/mp4,video/webm,video/*" style="display:none">' +
            '</label>' +
          '</div>' +

          /* —— 次要方式：直链（会经过网络，可能踩条款） —— */
          '<label style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px">' +
            '视频直链（mp4 / webm，会占用托管流量）' +
          '</label>' +
          /* value="' + esc(cur) + '" —— 把存过的直链回填进去。
             【这里必须 esc】
               直链是用户输入过的内容，可能包含双引号。
               如果用户曾经输入  a" onfocus="alert(1)
               不转义的话就会变成：
                 value="" onfocus="alert(1)"
               引号提前闭合，多出来一个 onfocus 事件 —— 典型属性型 XSS。
               转义成 &quot; 之后就只是普通文字。 */
          '<input class="login-input" id="bgUrl" type="url" placeholder="https://…/bg.mp4" value="' + esc(cur) + '">' +
          /* 两个按钮横排：flex + gap:8px 控制间距，
             flex-wrap:wrap 让窄屏自动换行（不然会挤出屏幕外） */
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
            '<button class="log-submit" id="bgApply" type="button">应用直链</button>' +
            '<button class="log-cancel" id="bgClear" type="button">全部清除</button>' +
          '</div>' +

          /* 结果提示区：所有操作的结果都写到这里，不弹 alert。
             用 alert 会打断用户、而且要手动点确定，体验很差。 */
          '<p id="bgMsg" style="font-size:12.5px;color:var(--text-light);margin-top:12px;line-height:1.6">' +
            '提示：直链视频由 Cloudflare 分发，占流量、且大规模视频会违反其条款；自己看请用上面的本机文件。' +
          '</p>' +
        '</div>' +
      '</div>';

    /* 【appendChild 之后才真正显示】
       在这一步之前，dlg 只是内存里的一个游离节点，
       里面有内容但页面上看不到。
       这也是「先配好再挂上去」的思路：避免用户看到半成品。 */
    document.body.appendChild(dlg);

    /* 【用 dlg.querySelector 而不是 document.querySelector】
       为什么？因为页面上可能已经有同 id 的元素
       （比如打开着另一个弹窗，或者别的地方也用了 #bgUrl）。
       document.querySelector 会返回「文档里第一个」，
       有可能拿到别人家的元素，操作错对象。
       dlg.querySelector 只在弹窗内部找，目标明确。
       【querySelector vs getElementById】
         getElementById 更快，但只能在 document 上用（不能限定范围）。
         querySelector 慢一点，但支持任意 CSS 选择器，且可以在任意元素上调用。
         只在 document 上用、只按 id 找 → 用 getElementById。
         要限定范围或按类名/属性找 → 用 querySelector。 */
    var urlEl = dlg.querySelector('#bgUrl');
    var msgEl = dlg.querySelector('#bgMsg');
    var fileEl = dlg.querySelector('#bgFile');
    var infoEl = dlg.querySelector('#bgLocalInfo');

    /* 【异步查 IndexedDB，填「当前已存」那一行】 */
    idbGet().then(function (rec) {
      /* 【回调里必须重新检查元素还在不在】
         因为 idbGet 是异步的 —— 从发起查询到回调执行，
         中间可能有几十毫秒。
         在这段时间里用户完全可能已经点 × 把弹窗关了。
         那时 infoEl 指向的节点已经从 DOM 移除，
         给它设 innerHTML 不会报错，但也没意义（而且可能引起内存泄漏）。
         所以先判空，这是异步回调里的标准动作。 */
      if (!infoEl) return;

      if (rec && rec.blob) {
        /* 【innerHTML 里插 esc(rec.name)】
           文件名来自用户的磁盘，是不可信输入。
           必须转义 —— 理由同上面的 esc 函数说明。
           而 <b style="..."> 这些是我们自己写死的，不需要转义。 */
        infoEl.innerHTML =
          '当前已存：<b style="color:var(--primary)">' + esc(rec.name) +
          '</b>（' + fmtSize(rec.size || rec.blob.size) + '）';
        /* 【rec.size || rec.blob.size 的兜底】
           老版本存进去的记录可能没有 size 字段，
           那就从 blob 本身拿（Blob 一定自带 size 属性）。 */
      } else {
        /* 【textContent vs innerHTML】
           这里用 textContent 是因为内容是纯文字，没有 HTML。
           textContent 会把内容完全当文字处理，
           就算里面有 <b> 也会原样显示。
           好处：不用手动转义，天然安全，而且比 innerHTML 快。
           规则：内容是纯文字 → textContent；需要 HTML 结构 → innerHTML + 转义。 */
        infoEl.textContent = '当前没有存本地视频。';
      }
    });

    /* 【close：关弹窗 = 直接删掉】
       为什么不设 display:none 藏起来？
         · 藏起来的话，里面的 <input> 还留着上次选的文件，
           下次打开可能触发奇怪的行为
         · 藏起来的 DOM 越积越多，占用内存
         · 直接删除最干净，下次用重新生成
       代价：重新打开要重新拼 HTML（性能开销可忽略）。 */
    function close() { dlg.remove(); }

    dlg.querySelector('.generic-close').addEventListener('click', close);

    /* 【点遮罩关闭】
       e.target 是「实际被点击的那个元素」，
       点遮罩时它正好是 dlg 本身；
       点弹窗内容时它是里面的某个子元素（因为事件会冒泡上来）。
       所以 e.target === dlg 就能区分「点外面」还是「点里面」。
       【这就是事件委托的基本判断方式】
         如果写成 dlg.addEventListener('click', close) 而不判断 target，
         那点弹窗里面任何位置都会把弹窗关掉，完全没法用。 */
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) close();
    });

    /* 【应用直链】 */
    dlg.querySelector('#bgApply').addEventListener('click', function () {
      /* 【trim() 去首尾空格】
         用户从别处复制链接经常带上空格或换行。
         不去掉的话，地址里混进空格会 404，
         而且肉眼看输入框完全正常，极难排查。
         【trim 只去两端】
           中间的 `a b` 不会被去掉 —— 这是对的，
           地址中间的空格本来就是非法的，应该暴露问题而不是偷偷修。 */
      var u = urlEl.value.trim();

      saveUrl(u);            // 存进 localStorage，下次打开自动用
      mountVideo(u);         // 立刻换上（u 为空则等于恢复纯色/极光背景）

      /* 三元：有地址 / 没地址，提示不同 */
      msgEl.textContent = u ? '直链已应用 ✓（会占用托管流量）' : '已恢复极光背景 ✓';

      /* 【延迟 600ms 再关】
         如果立刻关掉，用户根本看不到「已应用 ✓」这句提示，
         会怀疑到底有没有生效。
         600ms 是个经验值：够读完一行短提示，又不至于让人等。
         【坑：这里没有清理 setTimeout】
           如果用户在 600ms 内手动关了弹窗，
           定时器到点后仍然会调 close()，
           对一个已经删除的元素调 remove() 是安全的（不会报错），
           所以这里侥幸没出问题。 */
      setTimeout(close, 600);
    });

    /* 【全部清除：直链 + 本机文件一起清掉】 */
    dlg.querySelector('#bgClear').addEventListener('click', function () {
      saveUrl('');          // 清直链（传空字符串 → saveUrl 里走 removeItem）
      urlEl.value = '';     // 清输入框，让界面和实际状态一致
      mountVideo('');       // 卸掉视频，露出纯背景
      idbDel().then(function () {
        /* 【这里的 if (infoEl) 和上面的判空意义一样】
           只不过 idbDel 通常很快，弹窗被关掉的概率低。
           但既然存在这种可能，检查一下没坏处。 */
        if (infoEl) infoEl.textContent = '当前没有存本地视频。';
        msgEl.textContent = '已全部清除，恢复极光背景 ✓';
      });
    });

    /* 【选本地文件 → 存进 IndexedDB】 */
    fileEl.addEventListener('change', function () {
      /* 【files 是个 FileList，不是数组】
         长得像数组（有 length、能用下标），但没有 map/filter/forEach。
         要转真数组得写 [...fileEl.files] 或 Array.from(...)。
         [0] 取第一个 —— 这里没加 multiple 属性，所以最多一个。 */
      var f = fileEl.files && fileEl.files[0];

      /* 点了取消 → files 为空，直接返回 */
      if (!f) return;

      /* 【服务端校验思路：accept 不可信，必须再验一次】
         上面 accept="video/*" 只是对话框的筛选提示，
         用户切到「所有文件」就能绕过。
         所以真正的校验必须在拿到文件后做。
         这里用 MIME 类型判断：f.type 形如 'video/mp4'。
         【正则 /^video\// 的含义】
           ^     开头
           video 字面文字
           \/    斜杠（不转义也行，但转义更明确）
           合起来：以 video/ 开头就算视频。
         【这个校验能被伪造吗？】
           能。f.type 来自文件扩展名或系统注册表，
           用户可以改扩展名骗过它。
           但对于「存进自己浏览器的背景视频」这个场景，
           最坏后果就是自己放不出视频，没有安全风险，够用了。
           真要严格校验，得读文件头部的魔数（magic number）判断真实格式。 */
      if (!/^video\//.test(f.type)) {
        msgEl.textContent = '这个文件不是视频，换一个（mp4 / webm）。';
        return;
      }

      /* 【先给「正在处理」的反馈】
         存 500MB 的视频可能要几秒，没有反馈用户会以为点没反应，
         然后反复点击、反复重试，反而更卡。
         任何超过 200ms 的操作都应该有加载提示。 */
      msgEl.textContent = '正在存入本浏览器…';

      idbPut({
        name: f.name,     // 文件名（弹窗里显示用）
        size: f.size,     // 字节数（显示大小用，避免每次都读 blob.size）
        type: f.type,     // MIME 类型
        blob: f,          // 【文件本体】File 是 Blob 的子类，可以直接存进 IndexedDB
        t: Date.now()     // 存入时间戳
      }).then(function () {
        /* 【createObjectURL 的作用】
           给这份文件造一个临时地址（blob:http://...），
           可以直接塞给 <video src>。
           浏览器会从内存/磁盘里的那份数据读，完全不走网络。
           第二个参数 true 是传给 mountVideo 的 isBlob，
           意思是「这是 blob 地址，换片时要记着释放」。
         【为什么不直接用 f 当 src？】
           <video src> 只认字符串地址，不认 File 对象。
           必须经过 createObjectURL 转成地址。 */
        mountVideo(URL.createObjectURL(f), true);

        if (infoEl) {
          infoEl.innerHTML = '当前已存：<b style="color:var(--primary)">' + esc(f.name) +
            '</b>（' + fmtSize(f.size) + '）';
        }
        msgEl.textContent = '已存入本浏览器 ✓ 刷新后仍然生效，只有这台设备能看到，不产生任何 CDN 流量。';

        /* 【超过 80MB 额外提示】
           为什么是 80MB？
             这是个经验阈值 —— 家用宽带下载 80MB 大概几秒到几十秒，
             用户能忍受；再大就该提醒了。
             另外很多手机浏览器对单个 IndexedDB 记录的体积有隐式限制，
             太大的文件可能出现「存进去了但读不出来」。
           【+= 是追加】
             注意用的是 +=，把这句话接在上一句后面，
             不是覆盖。所以用户会看到两句话连在一起。 */
        if (f.size > 80 * 1024 * 1024) {
          msgEl.textContent += ' （文件偏大，首次加载会慢几秒）';
        }
      }).catch(function (err) {
        /* 【catch 里必须给用户看得懂的话】
           err.message 通常是 'QuotaExceededError: ...' 这类英文技术信息，
           直接甩给用户没有意义。
           所以格式是「中文说明 + 原始信息」：
           前半句让用户知道发生了什么、能做什么，
           后半句留着给懂技术的人排查。
         【(err && err.message) || err 的兜底】
           err 可能是 null，也可能是个没有 message 字段的东西，
           这两种情况都退回显示 err 本身。 */
        msgEl.textContent = '存不进去：' + ((err && err.message) || err) + '。可能是浏览器空间不足。';
      });
    });
  }

  /* ============ 把入口挂进齿轮菜单 ============ */

  /* 【injectMenuItem：往齿轮菜单里加一项】
     难点在于「时机」：
       齿轮菜单是 nav.js 生成的，
       而 bg.js 和 nav.js 谁先执行完全看 <script> 的顺序和网络快慢，
       不能假设菜单一定已经存在。
     所以这个函数被设计成「可以被反复调用」：
       菜单还没出来 → 返回 false，调用方稍后重试
       菜单已存在且已加过 → 返回 true
       刚加成功 → 返回 true
     返回值就是「搞定了没有」的信号。 */
  function injectMenuItem() {
    var menu = document.getElementById('gearMenu');

    /* 菜单还没生成 → 报告失败，让调用方重试 */
    if (!menu) return false;

    /* 【幂等保护】
       已经加过了就直接返回成功，不重复加。
       没有这句的话，重试机制会加出好几个「背景视频」菜单项。
       【什么叫幂等？】
         同一个操作执行一次和执行一百次，结果一样。
         写会被反复触发的代码时，幂等是最重要的性质。 */
    if (menu.querySelector('#gearBgVideo')) return true;

    var a = document.createElement('a');
    a.className = 'gear-item';   // 复用现成的菜单项样式
    a.id = 'gearBgVideo';        // 给上面的幂等检查用

    /* 【href="javascript:;" 这个写法】
       目的只有一个：让 <a> 带有「可以点」的默认样式
       （鼠标变小手、能被 Tab 聚焦）。
       但这是有历史包袱的老写法：
         · 严格 CSP（内容安全策略）下会被拦
         · 某些浏览器的无障碍工具会念出奇怪的地址
         · 语义上它根本不是链接，是个按钮
       【现在更推荐的做法】
         用 <button> 加 CSS 重置样式，
         或者 href="#" 配合 preventDefault。
         这里保留是为了和老代码风格一致，不建议新代码模仿。 */
    a.href = 'javascript:;';
    a.textContent = '背景视频';

    a.addEventListener('click', function (e) {
      /* 拦住 href 的默认行为（虽然 javascript:; 本来也不跳转，
         但写上是好习惯，以后改成真链接也不会出问题） */
      e.preventDefault();
      menu.classList.remove('show');   // 点完把菜单收起来，符合用户预期
      openDialog();                     // 弹出设置框
    });

    menu.appendChild(a);
    return true;
  }

  /* ============ 启动 ============ */

  /* 【boot：按优先级挑一个背景视频挂上去】
     优先级链（从高到低）：
       ① 网址 ?bg=xxx   —— 最高，用于临时预览/调试
       ② 本机 IndexedDB —— 用户自己存的，最快最合规
       ③ 存过的直链     —— 之前设置过的网络地址
       ④ config 全站默认 —— window.BG_VIDEO，所有人可见
       ⑤ 什么都没有     —— 退回极光玻璃背景
     为什么这个顺序？
       越靠前的「越临时、越个人」，越靠后的「越通用、越公共」。
       临时设置覆盖长期设置，个人设置覆盖全局设置 —— 这是配置系统的基本原则。 */
  function boot() {
    var q = pickParam();

    /* ① 特例：?bg=off 表示「彻底关掉」 */
    if (q === 'off') {
      /* 【这个分支为什么要删 IndexedDB？】
         如果只清直链，本机还存着本地视频，
         下次刷新又会拿出来播 —— 用户会觉得「off 没生效」。
         所以必须把两个存储都清干净。
       【为什么放在 then 里而不是顺序执行？】
         idbDel 是异步的。
         如果写成：
           idbDel();
           mountVideo('');   ← 这时本地视频可能还在内存里播着
         顺序就错了。必须等删除完成后再挂空。
       【afterBoot 也要调】
         不调的话齿轮菜单入口就没有了，
         用户想重新设置视频都找不到入口，彻底没救了。 */
      saveUrl('');
      idbDel().then(function () { mountVideo(''); afterBoot(); });
      return;
    }

    /* ① 正常参数：?bg=某地址 */
    if (q) {
      saveUrl(q);    // 记住它，下次不带参数也用
      mountVideo(q);
      afterBoot();
      /* 【return 的位置很重要】
         这几个分支都是「做完就结束」，必须 return。
         漏了 return 会继续往下走到 ②③④ 的逻辑，
         等于一个设置被处理两遍，后一遍会覆盖前一遍。 */
      return;
    }

    /* ② 先看本机有没有存过本地视频 */
    idbGet().then(function (rec) {
      if (rec && rec.blob) {
        /* 【重新造 blob 地址，不是复用】
           上次页面关掉时，那个 blob: 地址就已经失效了
           （它只存在于那次页面会话的内存里）。
           所以每次打开都得从存的 Blob 重新 createObjectURL 一份。
           这也是为什么要把文件本体（blob 字段）存下来 ——
           存地址是没用的，地址会过期。 */
        mountVideo(URL.createObjectURL(rec.blob), true);
        return;   // 有本地文件就不再考虑直链和默认值
      }

      /* ③ 直链 → ④ config 全站默认 → ⑤ 极光 */
      /* 【|| 的短路链】
         从左往右算，遇到第一个「有值」的就停下：
           readSaved() 有值 → 用它
           空的 → 看 window.BG_VIDEO 是不是字符串
                  是 → 取它的 trim()（去掉首尾空格，防止配置里多打了空格）
                  不是 → ''   → mountVideo 收到空字符串就退回极光
         【typeof 检查的必要性】
           window.BG_VIDEO 可能根本不存在（config.js 没配），
           那时它是 undefined，直接调 .trim() 会 TypeError。
           所以先确认是字符串再操作。 */
      mountVideo(
        readSaved() ||
        (typeof window.BG_VIDEO === 'string' ? window.BG_VIDEO.trim() : '')
      );
    /* 【.then(afterBoot) 直接传函数名的写法】
       等价于 .then(function () { afterBoot(); })
       但更短 —— 因为 afterBoot 不接收参数、不需要返回值，
       正好能直接当回调。
       【注意位置】
         idbGet 内部已经有 .catch(() => null) 兜住了所有错误，
         所以这个 then 一定会执行，不会因为异常被跳过。
         也就保证了「不管有没有视频，菜单入口一定会插」。
         如果 idbGet 的错误没被兜住，这里就得配一个 .catch(afterBoot)。 */
    }).then(afterBoot);
  }

  /* 【afterBoot：插齿轮菜单入口，带重试】 */
  function afterBoot() {
    if (injectMenuItem()) return;   // 一次成功最好，直接结束

    /* 【为什么用轮询（setInterval）而不是事件？】
       理想方案是「等 nav.js 生成菜单后通知我」——
       但 nav.js 是一段独立的老代码，没有暴露任何事件或回调。
       改 nav.js 加事件也行，但那是侵入性改动，容易牵连别处。
       所以这里用最笨但最稳的办法：每 100ms 看一眼菜单出来没有。
       【更优雅的替代方案】
         MutationObserver（监听 DOM 变化）：
           new MutationObserver(...).observe(document.body, { childList: true })
         它会在菜单插入的瞬间触发，不用空转轮询。
         但兼容性稍差（IE11 才支持），且代码更复杂。
         对于「最多等 4 秒」这种场景，轮询完全够用。 */
    var n = 0;
    var timer = setInterval(function () {
      /* 【短路运算的执行顺序】
         injectMenuItem() || ++n > 40
         左边为真 → 直接返回真，右边根本不执行（++n 不会加）
         左边为假 → 才去算右边
         所以 n 只在「这次没成功」时才 +1，
         计的就是「失败了几次」。
         【为什么是 40 次？】
           100ms × 40 = 4 秒。
           正常情况下 nav.js 几十毫秒就渲染完了，
           4 秒还没出来说明是网络太慢或者脚本报错了，
           再等下去也没意义，放弃即可（页面上少一个菜单入口不影响使用）。
         【不加这个上限会怎样？】
           如果 nav.js 因为某种原因永远不出菜单，
           这个定时器就永远跑着，每秒空转 10 次，
           一直消耗 CPU —— 典型的定时器泄漏。 */
      if (injectMenuItem() || ++n > 40) clearInterval(timer);
    }, 100);
  }

  /* 【启动时机】
     document.readyState 有四个值：
       'loading'      —— HTML 还在解析，body 可能还不存在
       'interactive'  —— HTML 解析完，DOM 就绪（DOMContentLoaded 之后）
       'complete'     —— 连图片视频都加载完了（load 事件之后）
     如果现在还是 loading，说明脚本在 <head> 里或者页面还没解析完，
       必须等 DOMContentLoaded 再跑 boot，
       否则 document.body 是 null，insertBefore 会直接报错。
     否则（脚本放在 </body> 前这种常见情况），
       直接用 document.documentElement 也能挂，立即执行即可。
     【为什么这个判断必须写？】
       因为 bg.js 可能被任何页面以任意方式引入，
       作者不能假设它一定在 body 末尾。
       这个判断让脚本「放在哪都能正常工作」。 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 【暴露到全局，供外部调用】
     IIFE 把变量都藏起来了，但总得留个对外接口 ——
     这就是「模块模式」的做法：内部私有，只暴露必要的东西。
     window.BgVideo = {
       open: openDialog,                          —— 打开设置弹窗
       set:  function (u) { saveUrl(u || ''); mountVideo(u || ''); }
                                                —— 编程式设置背景视频
     }
     【u || '' 的兜底】
       传 undefined / null 进来会被转成空字符串，
       等于「清除视频」，而不是让 saveUrl 里存一个字符串 'undefined'。
     【变量名首字母大写 BgVideo】
       这是约定：大写开头表示「这是一个类/命名空间」，
       不是普通变量。全站约定俗成，方便一眼区分。
     【实际用途】
       在浏览器控制台里可以直接调：
         BgVideo.open()                              打开设置框
         BgVideo.set('https://x.com/a.mp4')          换一个
         BgVideo.set('')                             清掉
       排查问题时非常方便，不用点界面。 */
  window.BgVideo = { open: openDialog, set: function (u) { saveUrl(u || ''); mountVideo(u || ''); } };
})();
