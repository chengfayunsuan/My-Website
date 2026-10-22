# My-Website

个人站「乘法」的前端。纯静态，无构建步骤，推 main 自动部署。

## 线上

| 项 | 值 |
|---|---|
| 托管 | Cloudflare Pages（GitHub 集成，推 `main` 自动发布） |
| 地址 | https://chengfa-761.pages.dev |
| 数据 | Supabase 直连（`js/sb.js`，所有权限靠 RLS，没有自建后端） |
| 媒体 | 待接 Cloudflare R2（`js/config.js` 的 `MEDIA_BASE`，留空=同域） |

旧域 `chengfa.dpdns.org` 已废（Cloudflare 因 Tunnel 传视频判 TOS 违规，zone 级封禁，不再使用）。

## 结构

```
index.html              首页（文章/视频列表 + 动态）
pages/                  文章、视频列表与详情，发布页
profile/                个人主页
manage/dashboard.html   管理面板（举报处理）
test/                   留言板、用户名单、实时动态等
js/config.js            Supabase 地址、publishable key、MEDIA_BASE
js/sb.js                数据层，导出 window.SBAPI
js/nav.js               导航栏、登录弹窗、信箱
_redirects              Cloudflare Pages 的旧路径 301（GitHub Pages 不认）
```

## Cloudflare Pages 构建配置

- Framework preset：`None`
- Build command：留空
- Build output directory：`/`

## 必须同步的后台设置

- Supabase → Authentication → URL Configuration → **Site URL** 填 `https://chengfa-761.pages.dev`
- Supabase → Authentication → Providers → Email → **Confirm email 关闭**（登录用 `用户名@chengfa.app` 的虚拟邮箱，收不到确认信）
- 站长账号注册后执行：`update profiles set role='owner' where username='chengfayunsuan';`
