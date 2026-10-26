/* ============================================================
   文件：js/upload.js（媒体上传）
   ------------------------------------------------------------
   作用：全站统一的「选文件 → 上传 → 拿到网址」入口。
         配了 R2 就走预签名直传（支持大文件，视频最大 2GB），
         没配就退回 Supabase Storage（免费计划单文件 50MB 硬限制）。
         上传过程中会持续回调进度百分比，界面上能显示进度条。

   为什么要有这个文件：
     图片、音频、视频三种媒体的上传流程几乎一样，
     区别只是大小上限和存放目录。
     如果把上传代码散落在 write.html / video-write.html 里，
     以后改一次接口就要改好几个地方，还容易漏。
     集中成一个文件、对外只暴露 MEDIA.upload()，改一处全站生效。

   ★ 本文件的名词速查（更全的看 术语表.md）：
     · IIFE —— (function(){ ... })()：写完立刻执行一次，变量不外泄。
     · const / let —— 块级作用域声明。const 不许重新赋值，
                      但不代表内容不可变（对象的属性照样能改）。
     · XMLHttpRequest (XHR) —— 发请求的老写法，
                      但只有它能拿到「上传进度」事件。
     · Promise / async / await —— 异步三件套：
                       Promise 是「未来才有结果」的凭据，
                       async 标明函数是异步的，
                       await 是在这里等结果（只能在 async 函数里用）。
     · MIME 类型 —— "video/mp4" 这种「文件是什么」的标识，
                       服务器靠它判断怎么处理。
     · CORS 跨域 —— 浏览器默认不准 A 站脚本读 B 站数据，
                       除非 B 在响应头里明确允许。
     · Token（JWT）—— 登录后服务器发的凭证，之后每次请求都带着，
                       服务器凭它认人。
     · 桶 bucket —— 对象存储里放文件的大文件夹，
                       类似「云盘里的一个目录」。
     · 预签名 URL —— 服务器临时签一个有时效的上传地址，
                       客户端拿着它直接传存储，大文件不用经过业务服务器。
     · 对象键 key —— 文件在桶里的完整路径（含目录），
                       类似「相对路径」。
     · 三元运算 —— 条件 ? 成立的值 : 不成立的值。
     · 正则 —— /\.([a-z0-9]{2,5})$/i 这种文字规则，
                match() 用来从文件名里抠扩展名。
   ============================================================ */

// js/upload.js — 媒体上传（两条路，自动选）
//   ① 配了 window.UPLOAD_API  → 走 Cloudflare R2：
//      Worker 签预签名 PUT，文件直传 R2（支持 2GB）
//   ② 没配                    → 走 Supabase Storage 兜底：
//      直传同名桶，单文件 50MB 上限（免费计划硬限制）
// 依赖：config.js、js/sb.js（取登录 token）
// 用法：MEDIA.upload(file, 'img' | 'audio' | 'video', pct => {...})
//       → 返回 { url, key, size, backend }
//
// 【为什么要有两条路？】
//   R2 是对象存储，专门干这个的，便宜、支持大文件、还免出网流量费。
//   Supabase Storage 免费计划卡在 50MB，传视频根本不够用。
//   但 R2 需要单独申请，不是所有人都配好了。
//   所以设计成「配了就用好的，没配也能跑」——
//   这种「优雅降级」的思路值得学：别让用户因为少配一个东西就完全用不了。
//
// 【两条路的最大区别：文件经过谁】
//   R2 预签名直传：浏览器 ──直接──> R2
//                  你的 Worker 只负责「签个许可」，不碰文件本体。
//                  传 2GB 也不占 Worker 的带宽和内存。
//   Supabase 直传：浏览器 ──直接──> Supabase Storage
//                  同样不经过自己的业务代码，但容量受限。
//   两条路都是「直传」，没有一条是「先传到我的服务器再中转」——
//   因为中转大文件会拖垮服务器（内存撑爆、超时断开）。
(function () {   // 立即执行函数：对外只暴露 window.MEDIA 一个入口，其余全部私有

  /* 【四个常量，都是「查表用」的配置】
     为什么放在函数最上面？
       ① 一眼能看全这个文件的配置项，改上限不用翻代码
       ② 常量提到外层作用域，不用每次调用都重新创建
       ③ const 声明有「暂时性死区」（TDZ）——
          声明之前访问会报错，所以必须先声明后使用。 */

  /* 【R2 的上限】
     1024 进制：2GB = 2 × 1024 × 1024 × 1024 = 2147483648 字节。
     为什么不用 1000 进制？
       计算机按二进制算，存储厂商按十进制标，
       这就是「买 1TB 硬盘只有 931GB」的来源。
       代码里判断大小一律用 1024。
     【8MB / 30MB / 2GB 这个梯度是怎么定的？】
       图片 8MB —— 手机原图一般 2~5MB，留点余量
       音频 30MB —— 一首无损 30MB 左右，够用
       视频 2GB  —— R2 单次 PUT 的上限就是 5GB 左右，
                   2GB 是留了安全余量的实用值 */
  const MAX_R2 = { img: 8 * 1024 * 1024, audio: 30 * 1024 * 1024, video: 2 * 1024 * 1024 * 1024 };

  /* 【Supabase Storage 的上限】
     同样的对象结构，只是视频从 2GB 砍到 50MB ——
     因为免费计划硬限制就是单文件 50MB，超了直接被拒。
     【为什么还要保留图 8MB / 音频 30MB？】
       既然后端换成 Storage 了，为什么不干脆都卡到 50MB？
       因为「能传」不等于「该传」——
       图片 8MB 已经够清晰了，放宽到 50MB 只会让页面加载变慢。
       上限的职责是引导用户别传不该传的东西，不只是技术限制。 */
  const MAX_SB = { img: 8 * 1024 * 1024, audio: 30 * 1024 * 1024, video: 50 * 1024 * 1024 };

  /* 【类型的中文名】
     报错信息里要用中文，比如「视频 120MB，超过上限 50MB」。
     用查表而不是 if/else 或 switch：
       加新类型时只改这一行，不用去动报错逻辑。 */
  const LABEL = { img: '图片', audio: '音频', video: '视频' };

  /* 【MIME 类型 → 文件后缀 的对照表】
     为什么要转换？
       上传时浏览器给的是 MIME（video/mp4），
       但存到桶里要一个好读的文件名（.mp4），
       而且某些 CDN 会按后缀推断类型。
     【注意这里没列全所有类型】
       只列了常见的。没列到的会走 extOf 的第二层兜底（从原文件名抠）。
       这是有意为之 —— 不必穷举，够用就行，
       硬要列举全世界的 MIME 类型是永远列不完的。 */
  const CT_EXT = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg'
  };   // 结尾多一个逗号是合法的，JS 不在意（这叫「尾随逗号」，方便以后加行）

  /* 【fmt：字节数 → 人看得懂的大小】
     和 bg.js 里的 fmtSize 功能重复了 ——
     两个文件各写了一份，属于「复制粘贴」产生的小冗余。
     更干净的做法是抽到一个公共的 utils.js 里，
     但这里是两个独立的 IIFE，谁也不想依赖谁，
     所以作者选择了「各留一份，各自独立」。
     【这种重复要不要消除？】
       看情况。3 行代码重复两处，改了要记得改两处 —— 有风险。
       但如果合并，就要引入文件依赖，加载顺序也变成约束。
       小项目里重复一点点往往比强行抽象更划算。 */
  function fmt(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + 'GB';
    /* 【这行有条件判断的 toFixed】
       n >= 104857600 是 100MB。
       大于 100MB 就不显示小数（123MB 而不是 123.4MB），
       因为这时候小数点后的精度毫无意义，反而让字变长。
       注意这里没有空格，「123MB」比「123 MB」更紧凑。 */
    if (n >= 1048576) return (n / 1048576).toFixed(n >= 104857600 ? 0 : 1) + 'MB';
    /* 【Math.max(1, ...)】小于 512 字节会 round 成 0，
       显示「0KB」很怪，所以强行拉到最小 1KB。 */
    return Math.max(1, Math.round(n / 1024)) + 'KB';
  }

  /* 【backend：判断走哪条路】
     window.UPLOAD_API 存在 → 'r2'，否则 → 'storage'。
     【这里的 if/else 写成了三元】
       因为逻辑只有一个判断、两个结果，三元更短。
       【window.UPLOAD_API 是什么？】
       在 config.js 里配置的一个 Worker 地址，形如
         window.UPLOAD_API = 'https://upload.example.workers.dev';
       没配就是 undefined，undefined 是 falsy，所以判断成立。
       【这里假设 UPLOAD_API 一定是个有效字符串】
         如果有人配了个空字符串 ''，那也是 falsy，会退回 storage —— 安全。
         但如果配了个错地址，就会在 fetch 那一步失败，不会在这里发现。
         这是「配置错误留到运行时才暴露」的典型取舍。 */
  function backend() { return window.UPLOAD_API ? 'r2' : 'storage'; }

  /* 【limitOf：取当前后端 + 当前类型的上限】
     这一行用了两个技巧，拆开看：
       ① (backend() === 'r2' ? MAX_R2 : MAX_SB)
          先根据后端选出「整张表」
       ② [kind]
          再从这张表里按类型取具体数字
     这叫「先选对象再取属性」，比写三四个 if 短得多。
     【|| MAX_SB.img 的兜底】
       如果 kind 是个表里没有的值（比如 'doc'），
       table['doc'] 是 undefined，|| 会兜底成图片上限 8MB。
       但实际调用方已经保证 kind 只能是三种（见 upload 里的校验），
       所以这个兜底永远不会触发 —— 属于「防御性冗余」。
       不算错，只是有点多余。 */
  function limitOf(kind) { return (backend() === 'r2' ? MAX_R2 : MAX_SB)[kind] || MAX_SB.img; }

  /* 【extOf：猜文件后缀（三层兜底）】
     为什么要猜？
       上传要求一个文件名，但用户选的文件可能：
         · 没有扩展名（手机拍的某些视频）
         · 有奇怪的扩展名（.hevc、.m4v）
         · 扩展名和真实类型不符（改过名的）
     优先用 MIME，因为它来自系统对文件内容的识别，最可信。 */
  function extOf(file) {
    return CT_EXT[file.type]                                        // ① 按 MIME 查表（最准）
      /* ② 从文件名末尾抠扩展名
         【正则 /\.([a-z0-9]{2,5})$/i 逐段拆】
           \.        一个字面点号（点号在正则里是「任意字符」，
                     所以必须转义成 \. 才是真正的点）
           ( ... )   捕获组 —— 记住括号里匹配到的内容
           [a-z0-9]  字母或数字
           {2,5}     重复 2 到 5 次（.js 是 2 位，.webm 是 4 位，.jpeg 是 4 位）
           $         必须是字符串结尾（防止匹配到中间的点）
           i         忽略大小写（.MP4 也能匹配）
         【为什么是 2 到 5 位？】
           太短（1 位）容易误伤，太长（>5）没有常见格式。
           正常的扩展名都在这个范围里。
         【match 返回什么？】
           匹配成功 → 数组，[0] 是整体「.mp4」，[1] 是捕获组「mp4」
           匹配失败 → null
           所以 (xxx || [])[1] 的意思是：
             match 成功 → 取 [1]
             match 失败（null）→ 转成空数组 → [1] 是 undefined
           这个「|| [] 兜底」的写法避免了 null[1] 直接抛错。 */
      || (String(file.name).match(/\.([a-z0-9]{2,5})$/i) || [])[1]
      || 'bin';                                                     // ③ 都猜不到就用 .bin
      /* 【为什么最终兜底是 bin？】
         服务端和 CDN 看到 .bin 会当成二进制流处理，不尝试解析。
         比起瞎猜一个 .mp4（可能被当视频解码而报错），
         .bin 最安全 —— 至少不会因为类型错而崩。 */
  }

  /* 【keyOf：生成「存到桶里叫什么名字」】 */
  function keyOf(uid, kind, file) {
    /* 【随机串】
       优先用 crypto.randomUUID()（现代浏览器都有），
       老浏览器退回 Math.random()。
       【crypto.randomUUID 返回什么？】
         形如 '36b8f84d-df4e-4d49-b662-bcde71a8764f' 的 UUID v4，
         128 位随机，碰撞概率可以忽略。
       【Math.random().toString(16) 是什么？】
         Math.random() 返回 0~1 的小数，比如 0.7123456。
         .toString(16) 转成十六进制字符串，
         典型结果 '0.b851eb851eb851f'（前缀 0. 是整数部分）。
         .slice(2) 砍掉前面的 '0.'，剩下后面的随机十六进制串。
         【坑：长度不固定！】
           如果 Math.random() 恰好返回一个很短的小数（比如 0.5），
           toString(16) 得到 '0.8'，slice(2) 就只剩 '8' 一个字符。
           这时 .slice(0,8) 只能拿到 1 位 —— 随机性大打折扣。
           实际概率很低（要精确到那种值），但确实存在。
           严格做法是补零或者多次拼接，这里没做，算个小瑕疵。
       【最后的 .slice(0, 8)】
         只取前 8 位。够用就行 ——
         配合 Date.now() 的时间戳，重名概率已经极低了。 */
    const rnd = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2)).slice(0, 8);

    /* 【模板字符串拼路径】
       结果形如：1/video/1729800000123-ab12cd34.mp4
       分三段看：
         uid           用户 id —— 按用户分目录，
                       好处：删除用户时整个目录删掉就行，
                       也方便统计「这个用户占了多少空间」
         kind          类型 —— 按类型分目录，
                       方便按类型做缓存策略（图片缓存久、视频缓存短）
         Date.now()    毫秒时间戳 —— 防止同一用户同一秒传两个同名文件
         -rnd          随机后缀 —— 时间戳相同也能区分
         .ext          后缀小写化，避免 .MP4 和 .mp4 被当两种东西
       【toLowerCase() 为什么要加？】
         有些系统的文件名是大写扩展名。
         桶里 .MP4 和 .mp4 会被当成不同对象，
         而 CDN 通常只按小写匹配类型，会导致类型识别失败。 */
    return `${uid}/${kind}/${Date.now()}-${rnd}.${extOf(file).toLowerCase()}`;
  }

  /* 【send：通用上传，带进度】
     参数：
       method     —— 'PUT' 或 'POST'
       url        —— 目标地址
       file       —— File 对象，直接作为请求体
       headers    —— 需要带的请求头
       onProgress —— 进度回调，收一个 0~100 的整数
     为什么用 XMLHttpRequest 而不是更现代的 fetch？
       唯一原因：进度。
         · XHR 有 xhr.upload.onprogress 事件，浏览器帮你算好「已发多少字节」
         · fetch 想拿上传进度，只能用 ReadableStream 手动包请求体，
           兼容性差、代码复杂好几倍
       所以凡是「需要上传进度」的场景，XHR 至今仍是唯一实用选择。
       【fetch 什么时候够用？】
         文件小、不需要进度、或者只需要「转圈」的那种加载态。 */
  function send(method, url, file, headers, onProgress) {
    /* 【包成 Promise】
       XHR 是回调式 API（onsuccess/onerror），
       包一层 Promise 之后，调用方就能用 await 拿到结果，
       而且能让 async 函数里的 try/catch 捕获到错误。
       【箭头函数体的两种写法】
         () => { return x; }   带花括号要显式 return
         () => x               不带花括号，自动 return
       这里用了第二种，所以 new Promise(...) 的值就是返回值。 */
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      /* 【open(方法, 地址, 是否异步)】
         第三个参数 true = 异步。
         传 false 会「同步阻塞」—— 请求期间整个页面卡死，
         连鼠标都动不了。现代浏览器对主线程上的同步请求
         已经给了弃用警告，绝对不要用。 */
      xhr.open(method, url, true);

      /* 【逐个设置请求头】
         Object.keys(headers) 拿到所有头名组成的数组，
         forEach 遍历，一个个 set。
         【为什么不能直接把对象丢进去？】
         XHR 没有「批量设置头」的 API，只能一个一个设。
         【setRequestHeader 的坑】
         有些头浏览器不许你手动设（比如 Content-Length、Host），
         设了会被静默忽略，或者直接报 Refused to set unsafe header。
         这是安全设计 —— 不让 JS 伪造底层协议信息。 */
      Object.keys(headers).forEach(k => xhr.setRequestHeader(k, headers[k]));

      /* 【upload 上的 progress 事件】
         注意是 xhr.upload 而不是 xhr：
           xhr.upload.onprogress  —— 文件「往上发」的进度
           xhr.onprogress         —— 服务器「往下回」的进度
         上传场景当然要前者。
         【e.lengthComputable】
           表示「总大小是否已知」。
           什么情况下不知道？
             · 用 chunked 编码分块发送、没给总长时
             · 某些服务器/代理不返回 Content-Length
           这时 e.total 是 0，拿去做除法会得到 Infinity 或 NaN，
           进度条就会疯掉。所以必须先判断。
         【Math.round(e.loaded / e.total * 100)】
           已发字节 / 总字节 → 0~1 的小数 → ×100 → 四舍五入成整数百分比。
           取整是为了避免界面上的数字疯狂抖动（99.87% → 99.88%…）。 */
      xhr.upload.onprogress = e => {
        if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
      };

      /* 【onload：HTTP 层面有响应了】
         【最容易搞混的一点】
           onload 不等于「成功」！
           服务器返回 404、500 也会触发 onload ——
           因为那些都是「服务器正常回了话，只是内容是错误」。
           onerror 只在「压根没连上、连接被重置」这类网络层问题时触发。
         所以状态码必须自己检查，这就是下面那行的作用。 */
      xhr.onload = () => {
        /* 【2xx 都算成功】
           200 OK、201 Created、204 No Content 等等。
           不要写 xhr.status === 200，
           因为上传成功的常见返回是 200 或 204，
           写死 200 会把 204 误判成失败。 */
        if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.responseText);

        /* 失败：尽量把服务器说的话带出来，方便排查 */
        let msg = xhr.responseText || '';

        /* 【尝试按 JSON 解析】
           对象存储和自建接口通常返回 {"message": "文件过大"} 这种结构，
           直接显示原始 JSON 用户看不懂，取 message 字段更友好。
         【catch 后面没有参数】
           老写法必须写 catch (e) {}，哪怕 e 用不到。
           ES2019 开始可以省略 —— 这叫 optional catch binding。
           这里省略了，说明目标浏览器是较新的。
           如果这行真的抛错（不是 JSON），msg 保持原样，不影响后面。 */
        try { msg = JSON.parse(msg).message || msg; } catch { /* 原样用 */ }

        /* 【错误信息要「够用但不炸屏」】
           服务器可能返回一整页 HTML 错误页（几千字），
           直接塞进弹窗会把界面撑爆。
           所以 .slice(0, 140) 截断，超出的部分直接砍掉。
           140 是经验值：能装下两行中文，又不会顶掉别的元素。
         【String(msg) 的必要性】
           msg 理论上可能是对象或数字（当 JSON.parse 返回非字符串时），
           先转成字符串才能安全调用 .slice。 */
        reject(new Error(
          '上传失败（' + xhr.status + '）' + (msg ? '：' + String(msg).slice(0, 140) : '')
        ));
      };

      /* 【onerror：网络层失败】
         常见原因：
           · 跨域被拦（服务器没给 Access-Control-Allow-Origin）
           · 断网
           · DNS 解析失败
           · 上传过程中连接被重置
         【跨域被拦时，控制台会报一个吓人的红色错误，
           但 JS 拿不到具体原因 —— 这是浏览器故意的安全设计】
           攻击者不能通过 JS 探测内网，所以错误细节被隐藏了。
           因此这里只能给出「可能是 CORS 没配好」这种猜测性提示。 */
      xhr.onerror = () => reject(new Error('上传中断：跨域或网络问题（存储桶的 CORS 没配好）'));

      /* 【ontimeout 永远不会触发】
         因为上面从来没有设置 xhr.timeout = 多少毫秒。
         不设 timeout，请求就永远不会超时，
         这个回调自然也不会被调用。
         【这是这个文件的一个真实瑕疵】
           大文件上传确实不该设太短的 timeout，
           但完全不设意味着「网络卡死时永远转圈」，
           用户只能手动刷新页面。
           正确做法是设一个宽松值（比如 10 分钟），
           或者干脆用 AbortController + 手动计时。
           我在这里标注，不动代码。 */
      xhr.ontimeout = () => reject(new Error('上传超时'));

      /* 【send：真正发出去】
         File 对象可以直接当请求体传 ——
         因为 File 继承自 Blob，而 XHR 的 send() 接受 Blob。
         浏览器会流式读取文件内容发出去，
         不会把整个 2GB 读进内存（这点很重要，不然直接 OOM）。
         【为什么放在最后一行？】
           因为 send 一执行就开始发了。
           所有的事件监听、请求头都必须在这之前配好，
           否则会漏掉早期的事件（尤其是快速的失败）。 */
      xhr.send(file);
    });
  }

  /* 【uploadR2：路线① 预签名直传】
     async 函数的特点：
       · 调用它一定返回 Promise（就算内部 return 一个数字，外面也收到包好的 Promise）
       · 内部抛错不会同步炸出来，而是变成 Promise 的拒绝，
         调用方要用 .catch 或者 await + try/catch 才能接住
     【整个流程分三步】
       ① 找自己的 Worker 要一个「临时上传许可」
       ② 拿着许可，直接把文件 PUT 到 R2（不经过 Worker）
       ③ 返回统一结果 */
  async function uploadR2(file, kind, s, onProgress) {
    /* 【第①步：要许可】
       String(window.UPLOAD_API).replace(/\/$/, '') 是在处理地址末尾的斜杠：
         配成 'https://x.dev/'  → 去掉末尾斜杠 → 'https://x.dev'
         配成 'https://x.dev'   → 不变
       为什么必须去？因为下面要拼 '/presign'，
       不去的话会变成 'https://x.dev//presign'，
       有些服务器会把双斜杠当成不同的路径，返回 404。
       【先 String() 再 replace】
         万一有人把 UPLOAD_API 配成了一个 URL 对象（不是字符串），
         直接调 .replace 会报错。先转字符串更稳。
       【fetch 的默认行为】
         默认 method 是 GET，所以 POST 必须显式写。
         默认不带 cookie（credentials: 'same-origin' 才带），
         所以这里必须靠 Authorization 头传 token ——
         这也符合跨域调用的通用做法。 */
    const r = await fetch(String(window.UPLOAD_API).replace(/\/$/, '') + '/presign', {
      method: 'POST',
      /* 【两个必须的头】
         Content-Type: application/json —— 告诉服务器 body 是 JSON，
                                          它才知道怎么解析
         Authorization: 'Bearer ' + token —— 标准的 token 传法，
                     Bearer 后面必须有一个空格，这是 OAuth 规范的格式，
                     少了空格服务器会认为格式非法
         【为什么要带登录凭证？】
           如果谁都能签许可，任何人都能往你的桶里塞文件，
           很快就会被滥用（存盗版视频、当免费图床）。
           所以 Worker 会校验 token，只给登录用户签。 */
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token },
      /* 告诉 Worker：文件名、类型、大小，它据此决定签名参数和是否拒绝 */
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, kind })
    });

    /* 【解析返回】
       .catch(() => ({})) 是挂在 r.json() 这个 Promise 上的，
       不是挂在 fetch 上的 —— 这点容易看错。
       含义：如果响应不是合法 JSON（比如返回了 HTML 错误页），
             不要抛错，给个空对象继续往下走。
       然后下面用 !j.uploadUrl 统一判断「拿没拿到许可」。
       【为什么不在这里直接判断 r.ok？】
       因为要看具体原因 —— 403 可能是没登录，413 可能是太大。
       统一交给下面的错误判断，用服务器返回的 error 字段说明，
       信息量比「HTTP 403」大得多。 */
    const j = await r.json().catch(() => ({}));

    /* 【没拿到地址就没法继续】
       两种情况都拦：HTTP 非 2xx、或者 2xx 但响应里没有 uploadUrl。
       后者说明 Worker 的实现有问题（或者接口改了），
       同样必须拦下来，否则下面会拿 undefined 去上传，报一个莫名其妙的错。
       【j.error || ('签发失败 HTTP ' + r.status)】
         优先用服务器给的中文说明，没有就退回状态码。 */
    if (!r.ok || !j.uploadUrl) throw new Error(j.error || ('签发失败 HTTP ' + r.status));

    /* 【第②步：直传 R2】
       注意这里没有带 Authorization 头！
       为什么？因为权限已经「签进地址里」了 ——
       这就是预签名 URL 的精髓：
         Worker 用自己的密钥，把「允许 PUT 这个 key、10 分钟内有效」
         这些信息算成一个签名，拼在 URL 的查询参数里。
         R2 收到请求后自己验签，不需要认识你的用户。
       好处：文件不经过 Worker，上传 2GB 也不占它的资源。
       【Content-Type 必须和签名时一致】
         预签名会把 Content-Type 也算进签名。
         这里传的 file.type 和上面申请许可时传的 contentType 是同一个值，
         所以能对上。
         如果对不上，R2 会返回 SignatureDoesNotMatch —— 
         这是预签名最经典的坑。
       【兜底 application/octet-stream】
         file.type 在极少数情况下是空字符串（系统不认识这个格式），
         空字符串当请求头不合法，所以兜底成「未知二进制流」。 */
    await send('PUT', j.uploadUrl, file, {
      'Content-Type': file.type || 'application/octet-stream'
    }, onProgress);

    /* 【第③步：返回统一结构】
       两条路线返回的字段完全一样，调用方就不用关心走的是哪条。
       这叫「统一接口」——
       对上层屏蔽底层差异，是抽象最常见的价值。
       【file.size 而不是读服务器返回】
         因为大小我们本来就知道，没必要让服务器再告诉一遍。 */
    return { url: j.publicUrl, key: j.key, size: file.size, backend: 'r2' };
  }

  /* 【uploadStorage：路线② Supabase Storage 兜底】 */
  async function uploadStorage(file, kind, s, onProgress) {
    /* 桶名可以在 config.js 里改，没配就默认 'media' */
    const bucket = window.STORAGE_BUCKET || 'media';

    /* 【用登录用户的 id 当一级目录】
       s 是 getSession() 拿到的会话对象，结构大致是：
         { access_token: '...', user: { id: 'uuid', email: '...' } }
       所以 s.user.id 就是当前用户。
       【这里能直接点 s.user.id 而不判空吗？】
         能 —— 因为调用方 upload() 里已经检查过 s 和 s.access_token 了。
         但严格说，s.access_token 存在不代表 s.user 一定存在
         （某些异常情况下 token 有效但用户信息没解析出来）。
         真出问题会抛 TypeError，被上层 catch 住，不会静默错乱。
         属于「风险很低但确实存在」的写法。 */
    const key = keyOf(s.user.id, kind, file);

    /* 【拼上传地址】
       Supabase Storage 的 REST 接口格式是固定的：
         {项目地址}/storage/v1/object/{桶名}/{对象键}
       对象键里带斜杠不要紧 —— 存储服务会把它当目录层级，
       和本地文件系统的路径是一个意思。 */
    const url = `${window.SUPABASE_URL}/storage/v1/object/${bucket}/${key}`;

    await send('POST', url, file, {
      /* 【apikey：项目公开 key】
         这个 key 写在前端代码里，所有人可见 ——
         因为它本来就不是秘密，它只标识「哪个项目」，
         真正的权限靠下面的用户 token 判断。
         【别把 service_role key 放到前端】
           那个 key 绕过所有权限检查，一旦泄露等于数据库全裸。
           前端只能放 anon（匿名）key。 */
      apikey: window.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + s.access_token,
      'Content-Type': file.type || 'application/octet-stream',
      /* 【x-upsert: 'false' —— 不许覆盖】
         如果对象键已存在，直接报错，而不是静默覆盖。
         为什么要这样？
           覆盖是危险操作：万一 key 算重了，
           新文件会把旧文件顶掉，且不可恢复（没有回收站）。
           报错虽然对用户不友好，但至少数据不会丢。
         相反，如果业务确实需要「更新同一个文件」，
         就该设成 'true'，但那样必须自己保证 key 的语义正确。 */
      'x-upsert': 'false',
      /* 【cache-control：缓存一年】
         31536000 秒 = 365 天。
         为什么敢缓存这么久？
           因为对象键里带了时间戳和随机串，
           同一个 key 永远对应同一个内容 —— 内容不会变。
           既然不变，缓存越久越好，用户第二次访问直接从 CDN 拿。
         【这依赖一个前提：永不覆盖】
           正好和上面的 x-upsert: 'false' 配合上了。
           如果允许覆盖，就必须把缓存时间调短，
           否则用户会一直看到旧文件（这是最常见的「改了没生效」原因）。 */
      'cache-control': 'max-age=31536000'
    }, onProgress);

    /* 【拼公开访问地址】
       注意路径多了一段 /public/ ——
       这是 Supabase 的约定：public 桶里的文件可以匿名下载。
       【如果桶不是 public 会怎样？】
         这个地址会返回 401/403，图片显示不出来。
         代码里没有检查桶的可见性 ——
         因为它假设配置阶段已经建好 public 桶了。
         真出问题的话，现象是「上传成功但图片裂开」，
         排查时先去看桶的权限设置。 */
    const pub = `${window.SUPABASE_URL}/storage/v1/object/public/${bucket}/${key}`;

    return { url: pub, key, size: file.size, backend: 'storage' };
  }

  /* 【upload：对外的总入口】
     参数顺序：文件、类型、进度回调。
     【为什么类型放在文件后面？】
       因为最常见的调用是 MEDIA.upload(file, 'img', cb) ——
       文件是主角，类型是修饰。这样读起来最顺。
     【这个函数不接收「上限」参数】
       因为上限是根据后端 + 类型自动算的，不需要调用方操心。
       调用方只管传文件和类型，剩下的都封在内部 ——
       这就是好接口的特征：参数少、不用懂内部细节。 */
  async function upload(file, kind, onProgress) {
    /* 【类型校验 + 兜底】
       LABEL[kind] 存在说明是合法类型，否则当成图片。
       为什么不直接报错说「类型不对」？
         因为这个参数是开发者传的，不是用户输入的。
         真传错了，硬报错会让整个功能挂掉；
         当成图片处理至少还能跑，问题也更容易被发现（图传上去了）。
       【这种「容错优先」的取舍适合什么地方？】
         适合内部参数 —— 出错概率低，报错成本高。
         不适合外部输入（用户填的数据），那里必须严格校验并明确告知。 */
    kind = LABEL[kind] ? kind : 'img';

    /* 没选文件直接报错，不往下走 */
    if (!file) throw new Error('没有选到文件');

    /* 【提前检查大小】
       为什么必须提前？
         不提前的话，2GB 的文件会真的开始上传，
         传了 10 分钟才被服务器拒绝 ——
         白白浪费用户的流量和时间，体验极差。
       这叫「fail fast」（快速失败）：
         能在本地判断的问题，绝不留到远端。
       【file.size 是怎么来的？】
         浏览器读文件元信息得到，不需要真的读内容，所以瞬间返回。 */
    const max = limitOf(kind);
    if (file.size > max) {
      /* 【视频超限时多解释一句】
         因为 50MB 这个限制是「没配 R2」导致的临时状态，
         用户看到「视频 120MB 超过上限 50MB」会一头雾水：
         为什么别人能传 2GB，我只能传 50MB？
         所以补一句解释，顺便告诉用户「以后会好的」。
         【这个判断用 && 串了两个条件】
           必须是「走 storage 后端」且「类型是视频」才提示。
           图片/音频的上限在两种后端下是一样的，
           提示了反而多余。 */
      const hint = backend() === 'storage' && kind === 'video'
        ? '（当前走 Supabase Storage 兜底，免费计划单文件上限 50MB；R2 批下来就能传 2GB）'
        : '';
      /* 【模板字符串里可以直接插变量】
         ${LABEL[kind]} 会自动把值转成字符串拼进去。
         结果形如「视频 120.5MB，超过上限 50MB（当前走 …）」——
         数字带单位、有对比、有原因，用户一看就知道怎么办。 */
      throw new Error(`${LABEL[kind]} ${fmt(file.size)}，超过上限 ${fmt(max)}${hint}`);
    }

    /* 【取登录状态】
       这一行有个容易看错的点：
         window.SBAPI && await SBAPI.getSession()
       && 的优先级比 await 高吗？不 ——
       && 左边先算，左边为 falsy 就直接返回左边，右边根本不执行。
       所以：SBAPI 不存在 → 整个表达式是 undefined，不会去调 getSession（避免报错）
             SBAPI 存在   → 执行 await SBAPI.getSession()
       【await 和 && 混用的风险】
         这种写法能跑，但可读性差。更清楚的写法是：
           if (!window.SBAPI) throw new Error('请先登录');
           const s = await SBAPI.getSession();
         【getSession 是同步还是异步？】
           Supabase 的 getSession 是异步的（要读 localStorage 并可能刷新 token），
           所以必须 await。忘了 await 会拿到一个 Promise 对象，
           然后 s.access_token 是 undefined，报「请先登录」——
           这个 bug 很隐蔽，因为现象和「真的没登录」一模一样。 */
    const s = window.SBAPI && await SBAPI.getSession();

    /* 【没登录不能传】
       上传接口都要身份，因为：
         · 要按用户分目录（keyOf 里用 s.user.id）
         · 要防止匿名用户刷流量
       这个检查放在大小检查之后，是因为大小检查不需要网络、更便宜。
       先做便宜的检查，再做贵的检查 —— 这是通用的性能优化顺序。 */
    if (!s || !s.access_token) throw new Error('请先登录');

    /* 【最后按配置分流】
       写成三元而不是 if/else，是因为两个分支都是「返回一个 Promise」，
       形态完全对称，三元读起来更紧凑。
       【注意没有 await 这两行】
         因为函数本身是 async 的，
         return 一个 Promise 时，async 会自动把它「摊平」——
         调用方 await 拿到的仍然是最终结果，不会拿到嵌套的 Promise。
         这叫 Promise 的自动展开（thenable 会被处理）。
         加上 await 也一样，只是多绕一圈。
       【两条分支的参数完全一样】
         (file, kind, s, onProgress) ——
         又一次体现了「统一接口」：调用方不需要分支，
         upload 内部替它选好。 */
    return backend() === 'r2'
      ? uploadR2(file, kind, s, onProgress)
      : uploadStorage(file, kind, s, onProgress);
  }

  /* 【暴露到全局】
     只暴露 6 个：
       upload     主入口
       fmt        格式化大小（界面上要显示「当前大小 / 上限」时用得上）
       backend    当前走哪条路（可以据此在界面上提示不同文案）
       limitOf    某类型的上限（做前端预校验用）
       MAX_R2     原始上限表（万一要自己算）
       MAX_SB     同上
     【为什么不暴露 send / keyOf / extOf？】
       它们是实现细节。
       暴露得越多，以后改动时越要小心翼翼（怕破坏别人的依赖）。
       只暴露必要的，内部随便重构 —— 这是封装的核心价值。
     【对象字面量的简写语法】
       { upload, fmt, backend, limitOf } 
       等价于 { upload: upload, fmt: fmt, ... }
       ES6 的简写，属性名和变量名相同时可以只写一个。
     【调用方怎么用？】
       const r = await MEDIA.upload(file, 'video', pct => {
         bar.style.width = pct + '%';
       });
       console.log(r.url);   // 拿到可以放进 <img src> / <video src> 的地址
     注意：这个文件必须在 config.js 和 sb.js 之后加载，
     否则 window.UPLOAD_API / SBAPI 还不存在，
     不过因为都是运行时才读，实际只要在「调用 upload 之前」加载好就行。 */
  window.MEDIA = { upload, fmt, backend, limitOf, MAX_R2, MAX_SB };
})();
