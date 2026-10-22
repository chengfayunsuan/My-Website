// ============ 全局配置 ============

// ============ Supabase 配置 ============
// Publishable (anon) key：设计上可公开，受 Row Level Security(RLS) 保护，可放心放前端。
// 前端用 supabase-js 初始化；写操作权限靠 RLS 兜底（铭牌/删除/举报等）。
// Service Role key 绝不能放前端，只在 Edge Functions / 服务端脚本里用。
window.SUPABASE_URL = 'https://masgzimdndyewzpagrmd.supabase.co';
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
// 留空 = 发布页的上传按钮会直接报“上传服务未配置”。
// 它只做一件事：校验 Supabase 登录态，然后签发 R2 预签名 PUT 地址（文件不经过 Worker）。
window.UPLOAD_API = '';

