// ============ 全局配置 ============

// ============ Supabase 配置 ============
// Publishable (anon) key：设计上可公开，受 Row Level Security(RLS) 保护，可放心放前端。
// 前端用 supabase-js 初始化；写操作权限靠 RLS 兜底（铭牌/删除/举报等）。
// Service Role key 绝不能放前端，只在 Edge Functions / 服务端脚本里用。
window.SUPABASE_URL = 'https://masgzimdndyewzpagrmd.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_HfcHWpw7pFyRHu0p1aOZQQ_rG8powjC';

// 所有页面共用的后端 API 地址。
// 已切换为「前端直连 Supabase（方案 A）」：主调用走 window.SBAPI（见 js/sb.js），
// 不再经过任何自定义后端 / Edge Functions。此变量保留仅作兼容，新页面请勿使用。
window.API_BASE = 'https://<PROJECT_REF>.functions.supabase.co';

// ============ 媒体独立域名（视频/封面走这里） ============
// 留空 = 跟站点同域（拼成 /xxx，由当前托管直接吐）。github.io 在国内被墙，不能再当媒体源。
// 以后接 R2：填成 R2 的自定义域，例如 'https://media.chengfa.app'（末尾不要带斜杠）。
window.MEDIA_BASE = '';

