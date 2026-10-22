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
// 默认跟 API 一样（视频继续走隧道）。
// 媒体源：GitHub Pages 站点（chengfayunsuan.github.io）。
// 注意：GitHub Pages 单文件硬上限 100MB、月带宽 100GB，大视频放不上去；
//       若视频走 R2 / 对象存储，这一行要改成对应公开地址。
window.MEDIA_BASE = 'https://chengfayunsuan.github.io';

