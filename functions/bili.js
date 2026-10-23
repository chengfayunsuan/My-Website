// functions/bili.js
// GET /bili?bv=BVxxxxxxxxxx
//
// 拿 B 站视频的封面 / 标题 / 时长。
//
// 背景（都是踩过的坑，别退回）：
//   1) 浏览器端 fetch 不行：api.bilibili.com 不返 CORS 头，读不到内容。
//   2) 浏览器端 JSONP 也不行：响应 Content-Type 是 application/json，
//      <script> 加载会被浏览器按 MIME 拒绝执行，回调根本不触发。
//   3) api.bilibili.com 走 Cloudflare 边缘经常 -412 request was banned
//      （B 站对数据中心 IP 的风控），时通时不通，不能当唯一来源。
//   4) www.bilibili.com 的视频页是前端渲染，HTML 里没有 og:image。
//   5) **m.bilibili.com 是服务端渲染的**，HTML 里直接带 og:image / og:title，
//      所以以它为主力；API 作为补充（能拿到时长）。
//
// 优先级：m 站 HTML（封面+标题） → API（+时长） → 失败

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*'
    }, extra || {})
  });
}

function makeBuvid() {
  const hex = '0123456789ABCDEF';
  const seg = n => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join('');
  return seg(8) + '-' + seg(4) + '-' + seg(4) + '-' + seg(4) + '-' + seg(12) + 'infoc';
}

// 从 HTML 的 meta 里取内容，属性顺序不固定，两种写法都匹配
function meta(html, prop) {
  const a = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]+content=["\']([^"\']*)["\']', 'i');
  const b = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + prop + '["\']', 'i');
  const m = html.match(a) || html.match(b);
  return m ? m[1] : '';
}

// 1) m 站 HTML：拿封面和标题
async function fromMobile(bv, dbg) {
  const res = await fetch('https://m.bilibili.com/video/' + bv, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://m.bilibili.com/'
    },
    redirect: 'follow'
  });
  if (!res.ok) return { err: 'm站 HTTP ' + res.status };
  const html = await res.text();

  let pic = meta(html, 'og:image') || meta(html, 'og:image:secure_url');
  if (!pic) {
    const m = html.match(/"(?:pic|cover)"\s*:\s*"(https?:\\?\/\\?\/[^"]+\.(?:jpg|png|webp))"/i);
    if (m) pic = m[1].replace(/\\\//g, '/');
  }
  if (!pic) {
    return {
      err: 'm站无 og:image（len=' + html.length + '）',
      head: dbg ? html.slice(0, 300).replace(/\s+/g, ' ') : undefined
    };
  }

  // 去掉 @1200w_630h 这类裁剪后缀，取原图
  pic = pic.split('@')[0].replace(/^http:/, 'https:');

  let title = meta(html, 'og:title');
  if (title) title = title.replace(/_哔哩哔哩.*$/, '').replace(/哔哩哔哩bilibili.*$/, '').trim();

  return { pic, title };
}

// 2) API：补时长（封面已有就不覆盖）
async function fromApi(bv, withCookie) {
  const headers = {
    'User-Agent': DESKTOP_UA,
    'Referer': 'https://www.bilibili.com/',
    'Origin': 'https://www.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9'
  };
  if (withCookie) headers['Cookie'] = 'buvid3=' + makeBuvid() + '; b_nut=' + Math.floor(Date.now() / 1000);

  const res = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bv, { headers });
  const text = await res.text();
  let j = null;
  try { j = JSON.parse(text); } catch (e) { return null; }
  if (!j || j.code !== 0 || !j.data) return null;
  const d = j.data;
  return {
    pic: String(d.pic || '').replace(/^http:/, 'https:'),
    title: d.title || '',
    duration: Number(d.duration) || 0
  };
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const bv = (url.searchParams.get('bv') || '').trim();

  if (!/^BV[0-9A-Za-z]{10}$/.test(bv)) {
    return json({ error: 'bad_bv', message: 'BV 号格式不对' }, 400);
  }

  let pic = '', title = '', duration = 0, via = [];
  const errs = [];
  const dbg = url.searchParams.get('debug') === '1';

  // 主力：m 站 HTML
  try {
    const m = await fromMobile(bv, dbg);
    if (m && m.pic) { pic = m.pic; title = m.title; via.push('m-html'); }
    else if (m && m.err) { errs.push(m.err + (m.head ? ' :: ' + m.head : '')); }
  } catch (e) { errs.push('m站 ' + String((e && e.message) || e)); }

  // 补时长 / 兜底封面
  if (!duration || !pic) {
    for (const wc of [true, false]) {
      try {
        const a = await fromApi(bv, wc);
        if (a) {
          if (!pic && a.pic) pic = a.pic;
          if (!title && a.title) title = a.title;
          duration = duration || a.duration || 0;
          via.push(wc ? 'api+cookie' : 'api');
          break;
        } else {
          errs.push('api' + (wc ? '+cookie' : '') + ' 无数据');
        }
      } catch (e) { errs.push('api ' + String((e && e.message) || e)); }
    }
  }

  if (!pic && !title) {
    return json({ error: 'bili_blocked', message: errs.join(' | ') || '没拿到数据' }, 200, {
      'cache-control': 'no-store'
    });
  }

  return json({
    ok: true,
    via: via.join('+'),
    bv,
    title,
    pic,
    duration
  }, 200, {
    // 封面和标题基本不会变，边缘缓存一天，列表页批量补图也扛得住
    'cache-control': 'public, max-age=86400'
  });
}
