// ============ 全局配置 ============

// ============ Supabase 配置 ============
// Publishable (anon) key：设计上可公开，受 Row Level Security(RLS) 保护，可放心放前端。
// 前端用 supabase-js 初始化；写操作权限靠 RLS 兜底（铭牌/删除/举报等）。
// Service Role key 绝不能放前端，只在 Edge Functions / 服务端脚本里用。
// 真实 Supabase 地址（仅作记录；实际反代目标写在 functions/sb/[[path]].js 里，两处要一致）
window.SB_UPSTREAM = 'https://masgzimdndyewzpagrmd.supabase.co';

// 是否走「同域反代」。国内直连 *.supabase.co 会 TLS 握手中断（DNS 正常但连不上），
// 开了这个开关就变成请求 chengfa-761.pages.dev/sb/...，由 Cloudflare 边缘转给 Supabase。
// 反代哪天出问题，把它改成 false 就退回直连（能不能通取决于你的网络）。
window.SB_PROXY = true;

// 页面实际使用的 Supabase 地址。本地 file:// 打开时退回直连，否则用同域 /sb。
window.SUPABASE_URL = (window.SB_PROXY && /^https?:$/.test(location.protocol))
  ? location.origin.replace(/\/+$/, '') + '/sb'
  : window.SB_UPSTREAM;

window.SUPABASE_ANON_KEY = 'sb_publishable_HfcHWpw7pFyRHu0p1aOZQQ_rG8powjC';

// 当前线上地址（Cloudflare Pages）。换自定义域时改这里，仅供文档/分享用，
// 页面内部一律走相对或根路径，不依赖这个常量。
window.SITE_URL = 'https://chengfa-761.pages.dev';

// 所有页面共用的后端 API 地址。
// 已切换为「前端直连 Supabase（方案 A）」：主调用走 window.SBAPI（见 js/sb.js），
// 不再经过任何自定义后端 / Edge Functions。留空即可，新页面请勿使用。
window.API_BASE = '';

// ============ 媒体独立域名（视频/封面走这里） ============
// 留空 = 跟站点同域（拼成 /xxx，由当前托管直接吐）。github.io 在国内被墙，不能再当媒体源。
// 接 R2：填成 R2 桶绑定的自定义域，例如 'https://media.chengfa.app'（末尾不要带斜杠）。
// 注意：上传返回的是绝对地址（publicUrl），文章正文里存的就是它，改这里不影响已发出的内容。
window.MEDIA_BASE = '';

// ============ 上传签发服务（Cloudflare Worker，见 worker/r2-presign.js）============
// 部署 Worker 后把地址填进来，例如 'https://r2-presign.xxxx.workers.dev'。
// 留空 = 自动走 Supabase Storage 兜底（见下面的 STORAGE_BUCKET），单文件上限 50MB。
// 它只做一件事：校验 Supabase 登录态，然后签发 R2 预签名 PUT 地址（文件不经过 Worker）。
window.UPLOAD_API = '';

// ============ Supabase Storage 兜底桶 ============
// UPLOAD_API 为空时，上传走这个桶（需在 Supabase 建 public 桶并配好 storage.objects 策略）。
// 免费计划：总容量 1GB、单文件 50MB。R2 批下来后填上 UPLOAD_API 就自动切走，无需改页面。
window.STORAGE_BUCKET = 'media';

// ============ 全站背景视频 ============
// 铺满整页、自动循环、静音播放，上面压一层暗幕保证文字清晰。
// 留空 = 只用默认的极光玻璃背景（零流量、最省事）。
// 要换背景视频，三种方式（优先级从高到低）：
//   1) 网址临时预览：?bg=https://xxx.mp4 ，?bg=off 关掉
//   2) 齿轮菜单 →「背景视频」自己导入（存本浏览器）
//   3) 填这里（全站默认，所有人都能看到）—— 推荐
// 注意：Cloudflare Pages 单文件上限 25MB，大视频请放 R2 / Supabase Storage 后用直链。
window.BG_VIDEO = '';

