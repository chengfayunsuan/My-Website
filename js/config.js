// ============ 全局配置 ============
// 所有页面共用的后端 API 地址。
// 以后换域名/换主机，只需要改这一行，所有页面自动生效。
// 用法：每个页面在上一步加载本文件（<script src="/js/config.js"></script>），
//       然后在其它脚本里读 window.API_BASE。
window.API_BASE = 'https://api.chengfa.dpdns.org';

// ============ 媒体独立域名（视频/封面走这里） ============
// 默认跟 API 一样（视频继续走隧道）。
// 以后把视频放到 VPS / 对象存储，只需把这一行改成 VPS 地址，例如：
//   window.MEDIA_BASE = 'https://media.chengfa.example.com';
// 前提：该地址能按相同路径提供 /video/media/<id>/<file> 这样的文件。
window.MEDIA_BASE = window.API_BASE;

/* 隧道（Cloudflare Tunnel）挂掉时的兜底：
   用本地预览打开网站（localhost / 127.0.0.1）时，直接连本机后端 3000 端口，
   不走隧道。这样开 VPN、断网、隧道抽风的时候照样能登录能读写。
   线上站点（https 域名）不受影响，还是走隧道。 */
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  window.API_BASE = 'http://127.0.0.1:3000';
  window.MEDIA_BASE = 'http://127.0.0.1:3000';
}
