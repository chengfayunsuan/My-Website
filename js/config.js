/* ============================================================
   文件：js/config.js（全站配置）
   作用：集中存放所有「写死的参数」：后端接口地址、Supabase 地址与公开 key、
        媒体地址前缀、默认背景视频。改配置只改这一个文件，别的页面不用动。
   ------------------------------------------------------------
   ★ 读这个文件前先懂两件事：
     1) window 是浏览器的「全局对象」。写 window.XXX = 值，等于把这个值挂到全局，
        任何别的 js 文件都能直接用 XXX 访问到。项目里所有配置都这么存。
     2) 这里全是「赋值语句」，没有函数、没有逻辑，所以特别适合拿来认语法。
   ============================================================ */

// ============ 全局配置 ============

// ============ Supabase 配置 ============
// Publishable (anon) key：设计上可公开，受 Row Level Security(RLS) 保护，可放心放前端。
// 前端用 supabase-js 初始化；写操作权限靠 RLS 兜底（铭牌/删除/举报等）。
// Service Role key 绝不能放前端，只在 Edge Functions / 服务端脚本里用。
// 真实 Supabase 地址（仅作记录；实际反代目标写在 functions/sb/[[path]].js 里，两处要一致）
window.SB_UPSTREAM = 'https://masgzimdndyewzpagrmd.supabase.co';
// 【语法】window.SB_UPSTREAM = '...'
//   window    浏览器全局对象
//   .         取它的属性
//   =         赋值：把右边的字符串装进左边这个属性里
//   '...'     单引号包起来的是字符串（文字）
// 含义：把 Supabase 的「原始地址」记在全局，后面要用它拼别的地址。

// 是否走「同域反代」。国内直连 *.supabase.co 会 TLS 握手中断（DNS 正常但连不上），
// 开了这个开关就变成请求 chengfa-761.pages.dev/sb/...，由 Cloudflare 边缘转给 Supabase。
// 反代哪天出问题，把它改成 false 就退回直连（能不能通取决于你的网络）。
window.SB_PROXY = true;
// 【语法】true 是布尔值（只有 true / false 两种），表示「开」。改成 false 就是「关」。
// 这个开关决定下一行算出哪个地址。

// 页面实际使用的 Supabase 地址。本地 file:// 打开时退回直连，否则用同域 /sb。
window.SUPABASE_URL = (window.SB_PROXY && /^https?:$/.test(location.protocol))
  ? location.origin.replace(/\/+$/, '') + '/sb'
  : window.SB_UPSTREAM;
// 【语法】这一行跨了三行，是一个「三元运算」：
//   条件 ? 成立时用这个 : 不成立时用那个
// 拆开看条件：(window.SB_PROXY && /^https?:$/.test(location.protocol))
//   ① window.SB_PROXY —— 上面的开关是不是开的；
//   ② && —— 「并且」，两个都成立才算成立；
//   ③ location.protocol —— 当前页面的协议，线上是 'https:'，本地文件是 'file:'
//      （location 是浏览器给的对象，装着当前网址的各种信息）；
//   ④ /^https?:$/ 是正则：以 http 或 https 开头、到这里就结束；
//   ⑤ .test(...) —— 用正则去测这个字符串，符合就 true，不符合就 false。
// 所以整句意思是：
//   「开关开着、并且页面是 http/https 打开的」→ 用 location.origin（当前域名）
//     去掉结尾斜杠（.replace(/\/+$/, '') 的意思是「结尾处一个或多个 / 换成空」）再拼 '/sb'；
//   否则（比如直接双击 html 用 file:// 打开）→ 退回上面的原始地址。

window.SUPABASE_ANON_KEY = 'sb_publishable_HfcHWpw7pFyRHu0p1aOZQQ_rG8powjC';
// 【语法】把公开 key 存起来。这个 key 可以公开：它只是个「门牌号」，
// 真正能不能写数据由数据库的 RLS 策略（行级权限）说了算。

// 当前线上地址（Cloudflare Pages）。换自定义域时改这里，仅供文档/分享用，
// 页面内部一律走相对或根路径，不依赖这个常量。
window.SITE_URL = 'https://chengfa-761.pages.dev';

// 所有页面共用的后端 API 地址。
// 已切换为「前端直连 Supabase（方案 A）」：主调用走 window.SBAPI（见 js/sb.js），
// 不再经过任何自定义后端 / Edge Functions。留空即可，新页面请勿使用。
window.API_BASE = '';
// 【语法】'' 是空字符串（一对引号里什么都没有）。留空表示「没有」，
// 再配合代码里的 (window.API_BASE || '默认值') 这种写法就能自动走默认逻辑。

// ============ 媒体独立域名（视频/封面走这里） ============
// 留空 = 跟站点同域（拼成 /xxx，由当前托管直接吐）。github.io 在国内被墙，不能再当媒体源。
// 接 R2：填成 R2 桶绑定的自定义域，例如 'https://media.chengfa.app'（末尾不要带斜杠）。
// 注意：上传返回的是绝对地址（publicUrl），文章正文里存的就是它，改这里不影响已发出的内容。
window.MEDIA_BASE = '';
// 【语法】同上，留空 = 用相对路径。nav.js 里 fixAvatar 会用它拼头像地址。

// ============ 上传签发服务（Cloudflare Worker，见 worker/r2-presign.js）============
// 部署 Worker 后把地址填进来，例如 'https://r2-presign.xxxx.workers.dev'。
// 留空 = 自动走 Supabase Storage 兜底（见下面的 STORAGE_BUCKET），单文件上限 50MB。
// 它只做一件事：校验 Supabase 登录态，然后签发 R2 预签名 PUT 地址（文件不经过 Worker）。
window.UPLOAD_API = '';
// 【语法】upload.js 里 backend() 就是判断这个值：
//   有值 → 'r2'（走 R2 大文件直传）
//   空   → 'storage'（退回 Supabase Storage）

// ============ Supabase Storage 兜底桶 ============
// UPLOAD_API 为空时，上传走这个桶（需在 Supabase 建 public 桶并配好 storage.objects 策略）。
// 免费计划：总容量 1GB、单文件 50MB。R2 批下来后填上 UPLOAD_API 就自动切走，无需改页面。
window.STORAGE_BUCKET = 'media';
// 【术语】桶 bucket = 对象存储里放文件的大文件夹，类似「云盘里的一个目录」。

// ============ 全站背景视频 ============
// 铺满整页、自动循环、静音播放，上面压一层暗幕保证文字清晰。
// 留空 = 只用默认的极光玻璃背景（零流量、最省事）。
// 要换背景视频，三种方式（优先级从高到低）：
//   1) 网址临时预览：?bg=https://xxx.mp4 ，?bg=off 关掉
//   2) 齿轮菜单 →「背景视频」自己导入（存本浏览器）
//   3) 填这里（全站默认，所有人都能看到）—— 推荐
// 注意：Cloudflare Pages 单文件上限 25MB，大视频请放 R2 / Supabase Storage 后用直链。
window.BG_VIDEO = '';
// 【语法】bg.js 启动时会依次检查：网址参数 → 本机存的视频 → 这里 → 都没有就用纯色背景。
// 这里留空 = 没设全站默认视频，所以别人打开你的站默认看不到视频（正合你意）。
