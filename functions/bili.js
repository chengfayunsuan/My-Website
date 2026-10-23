// functions/bili.js
// GET /bili?bv=BVxxxxxxxxxx
//
// 为什么要有它：写视频页原来靠 allorigins / cors.eu.org / codetabs 这几个
// 公共 CORS 代理去抓 B 站封面，国内访问这些代理大概率被墙，抓不到就存成
// poster=null，列表页自然没有封面。这里改成由本站边缘函数直接抓 B 站 API，
// 同域调用，不依赖任何第三方代理。

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*'
    }, extra || {})
  });
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const bv = (url.searchParams.get('bv') || '').trim();

  if (!/^BV[0-9A-Za-z]{10}$/.test(bv)) {
    return json({ error: 'bad_bv', message: 'BV 号格式不对' }, 400);
  }

  const api = 'https://api.bilibili.com/x/web-interface/view?bvid=' + bv;

  let res;
  try {
    res = await fetch(api, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.bilibili.com/',
        'Accept': 'application/json'
      }
    });
  } catch (e) {
    return json({ error: 'upstream_failed', message: String((e && e.message) || e) }, 502);
  }

  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch (e) {
    return json({ error: 'bad_upstream', message: text.slice(0, 120) }, 502);
  }

  if (j.code !== 0 || !j.data) {
    return json({ error: 'bili_error', code: j.code, message: j.message || 'B 站接口没返回数据' }, 200, {
      'cache-control': 'public, max-age=60'
    });
  }

  const d = j.data;
  return json({
    ok: true,
    bv: d.bvid,
    title: d.title,
    pic: d.pic,                 // 封面，http:// 开头，前端记得转 https
    duration: d.duration,       // 秒
    owner: d.owner && d.owner.name,
    desc: d.desc || ''
  }, 200, {
    // 封面和时长基本不会变，边缘缓存 10 分钟，列表页批量补图也不怕打爆
    'cache-control': 'public, max-age=600'
  });
}
