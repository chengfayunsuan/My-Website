// functions/bili.js
// GET /bili?bv=BVxxxxxxxxxx
//
// 用途：拿 B 站视频的封面 / 标题 / 时长。
//
// 背景（踩过的坑，别退回）：
//   1) 浏览器端 fetch 不行：api.bilibili.com 不返 CORS 头，读不到内容。
//   2) 浏览器端 JSONP 也不行：接口虽然支持 callback，但响应 Content-Type 是
//      application/json，<script> 加载时浏览器按 MIME 拒绝执行，回调根本不触发。
//   3) 纯裸请求走 Cloudflare 边缘会被判 -412 request was banned —— B 站对
//      数据中心 IP 段的风控，通常是因为缺 buvid3 cookie。
// 所以这里：带一套仿真指纹 + 随机 buvid3 打 API，失败再退回抓视频页 HTML 的
// og:image，两路都失败才认输。

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*'
    }, extra || {})
  });
}

// buvid3 形如 1A2B3C4D-1234-5678-9ABC-DEF012345678infoc
function makeBuvid() {
  const hex = '0123456789ABCDEF';
  const seg = n => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join('');
  return seg(8) + '-' + seg(4) + '-' + seg(4) + '-' + seg(4) + '-' + seg(12) + 'infoc';
}

function headers(withCookie) {
  const h = {
    'User-Agent': UA,
    'Referer': 'https://www.bilibili.com/',
    'Origin': 'https://www.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  };
  if (withCookie) h['Cookie'] = 'buvid3=' + makeBuvid() + '; b_nut=' + Math.floor(Date.now() / 1000);
  return h;
}

function pick(html) {
  const m1 = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (m1) return m1[1];
  const m2 = html.match(/"pic"\s*:\s*"(https?:\\?\/\\?\/[^"]+)"/);
  if (m2) return m2[1].replace(/\\\//g, '/');
  return '';
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const bv = (url.searchParams.get('bv') || '').trim();

  if (!/^BV[0-9A-Za-z]{10}$/.test(bv)) {
    return json({ error: 'bad_bv', message: 'BV 号格式不对' }, 400);
  }

  const api = 'https://api.bilibili.com/x/web-interface/view?bvid=' + bv;
  let lastErr = '';

  // 第一路：API，带 cookie 和裸请求各试一次
  for (const withCookie of [true, false]) {
    try {
      const res = await fetch(api, { headers: headers(withCookie) });
      const text = await res.text();
      let j = null;
      try { j = JSON.parse(text); } catch (e) { /* 不是 JSON，八成被 WAF 挡了 */ }
      if (j && j.code === 0 && j.data) {
        const d = j.data;
        return json({
          ok: true,
          via: withCookie ? 'api+cookie' : 'api',
          bv: d.bvid,
          title: d.title,
          pic: d.pic,
          duration: d.duration,
          owner: d.owner && d.owner.name
        }, 200, { 'cache-control': 'public, max-age=600' });
      }
      lastErr = j ? ('code ' + j.code + ' ' + (j.message || '')) : ('HTTP ' + res.status + ' 非 JSON');
    } catch (e) {
      lastErr = String((e && e.message) || e);
    }
  }

  // 第二路：抓视频页 HTML 里的 og:image
  try {
    const res = await fetch('https://www.bilibili.com/video/' + bv + '/', { headers: headers(true) });
    const html = await res.text();
    const pic = pick(html);
    if (pic) {
      const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      return json({
        ok: true,
        via: 'html',
        bv,
        title: t ? t[1].replace(/_哔哩哔哩.*$/, '').trim() : '',
        pic,
        duration: 0
      }, 200, { 'cache-control': 'public, max-age=600' });
    }
    lastErr += ' | html 也没找到 og:image';
  } catch (e) {
    lastErr += ' | html ' + String((e && e.message) || e);
  }

  return json({ error: 'bili_blocked', message: lastErr || '两路都没拿到' }, 200, {
    'cache-control': 'public, max-age=60'
  });
}
