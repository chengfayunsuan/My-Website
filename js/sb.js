/* ============================================================
   文件：js/sb.js（数据层（SBAPI））
   作用：把 Supabase 的所有读写封装成一组好用的方法（登录、文章、评论、点赞、收藏、留言、举报、用户资料…）。页面只管调 SBAPI.xxx()，不关心底层请求怎么写。
   ============================================================ */

// js/sb.js — Supabase 前端数据层（方案 A：前端直连 + RLS）
// 所有页面通过 window.SBAPI 访问。返回结构尽量对齐旧 server.js，减少页面 DOM 改动。
// 必须在 supabase-js（CDN）和 config.js 之后引入。
//
// ★ 这个文件是「数据层」：页面上所有「读写数据库」的动作都从这里走。
//   好处：页面里只写 SBAPI.getArticles() 这种一句话，不用关心请求怎么发、错误怎么处理。
// ★ 本文件出现的专有名词（0 基础版）：
//   · Supabase —— 现成的后端服务：数据库 + 登录 + 文件存储，不用自己写服务器。
//   · RLS（行级权限）—— 数据库里配的规则，决定「哪个用户能读/写哪几行」。
//   · createClient —— 用地址和 key 建一个客户端对象，之后所有请求都通过它发。
//   · 链式调用 —— 一行接一行 .xxx().yyy()，每一步都返回一个「还能继续调」的对象。
//   · then / await —— 等异步结果。
//   · 解构 —— const { data, error } = ... 一次取出对象里的两个字段。
//   · 时间戳 / ISO 时间 —— 2026-10-23T13:07:00+00:00 这种国际标准写法。
(function () {                                    // 【IIFE】整份代码包在自己的作用域里，只对外暴露 window.SBAPI。
  if (!window.supabase || !window.SUPABASE_URL) {
  // 【if】依赖检查：supabase-js 这个库、以及 config.js 里的地址，必须都存在。
  // ! 是取反；|| 是「或者」：缺一个就进这个分支。
    console.error('[sb] supabase-js 未加载或 config.js 未配置');
    // console.error 会在浏览器 F12 控制台里打红字，方便排查「为什么页面没数据」。
    return;                                     // 【return】直接结束整个 IIFE，后面的代码不执行。
  }
  const SB = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  // 【const】创建客户端。两个参数：
  //   ① 地址（走 /sb 反代后的同域地址，或直连 Supabase）
  //   ② 公开 key（anon key，可公开，权限由 RLS 控制）
  // 之后所有数据库/登录操作都通过这个 SB 对象。
  window.SB = SB;                               // 挂到全局，方便在控制台里手动调试，比如 SB.from('articles')。

  // 用户名登录 → 虚拟 email（Supabase Auth 只认 email+password）
  const DOMAIN = '@chengfa.app';
  // 【const】Supabase 的登录只支持邮箱，所以这里约定：
  // 用户输入「chengfa」，实际拿去登录的是「chengfa@chengfa.app」。
  // 这样界面上是用户名，底层是邮箱，两全其美。

  function errRes(e, extra) {                   // 【function】统一造一个「失败结果」对象。
    return Object.assign({ ok: false, error: (e && e.message) || '请求失败' }, extra || {});
    // Object.assign 把两个对象合并：
    //   ① { ok:false, error: 错误信息 } —— 错误信息优先用后端给的 message
    //   ② extra —— 调用方想额外返回的字段（比如 list: []，失败时也别让页面拿到 undefined）
  }
  // 一对多关系的 count 取数（supabase 嵌入返回 [{count:N}]）
  function cnt(arr) { return (arr && arr[0] && arr[0].count) || 0; }
  // 【function】Supabase 查「点赞数/收藏数」时，返回的是 [{ count: 3 }] 这种数组。
  // 这一行连续用 && 做「短路」保护：任何一层不存在就返回 0，绝不报错。

  // ---------- 媒体地址修正 ----------
  // 数据库里存过 https://xxx.supabase.co/storage/... 的绝对地址，国内直连不通。
  // 走反代后统一改写成 https://当前站点/sb/storage/...，历史数据不用回炉。
  const UPSTREAM = (window.SB_UPSTREAM || '').replace(/\/+$/, '');
  // 【const】Supabase 原始地址，去掉结尾斜杠（/\/+$/ = 结尾一个或多个斜杠）。
  function fixUrl(u) {                          // 【function】把「直连地址」改写成「反代地址」。
    if (!u || typeof u !== 'string' || !UPSTREAM) return u;
    // 【if】空值、不是字符串、没配原始地址 → 原样返回（没什么可改的）。
    if (window.SUPABASE_URL === UPSTREAM) return u;          // 没开反代，原样返回
    if (u.indexOf(UPSTREAM) === 0) {            // 【if】地址确实以上面的原始域开头（indexOf 返回 0 = 在开头）。
      return window.SUPABASE_URL.replace(/\/+$/, '') + u.slice(UPSTREAM.length);
      // 【slice】把开头那段域名字符串切掉，只留后面的路径，再拼上新的域名。
      // 例：https://xxx.supabase.co/storage/v1/a.jpg
      //   → /storage/v1/a.jpg（切掉域名）+ https://chengfa-761.pages.dev/sb → 新地址。
    }
    return u;
  }
  function fixDeep(o) {                         // 【function】递归地把对象/数组里所有字符串都改一遍。
    if (!o) return o;                           // 【if】空值直接返回。
    if (typeof o === 'string') return fixUrl(o);
    // 【if】是字符串 → 直接改（这就是递归的「到底了」的情况）。
    if (Array.isArray(o)) return o.map(fixDeep);
    // 【if】是数组 → 每个元素都递归处理一遍。
    if (typeof o === 'object') {
    // 【if】是对象 → 遍历它的每个字段，是字符串的就改掉。
      for (const k in o) if (typeof o[k] === 'string') o[k] = fixUrl(o[k]);
      // 【for...in】遍历对象的键名；k 是键名，o[k] 是对应的值。
      // 这一行把 for 和 if 写在一起，等价于「对每个字段判断一下再赋值」。
    }
    return o;
  }
  // 富文本正文里的 <img src="https://xxx.supabase.co/...">：加载失败时补一次改写。
  // 资源加载错误不冒泡，但会在捕获阶段经过 window，所以这里用 true。
  window.addEventListener('error', function (ev) {
  // 【addEventListener】在 window 上监听「资源加载错误」（图片、视频加载失败都会触发）。
  // 这类错误不会冒泡，但会在「捕获阶段」经过 window，所以第三个参数必须写 true。
    const el = ev.target;                       // 【const】出错的那个元素（不是事件绑定的元素）。
    if (!el || !el.getAttribute) return;        // 【if】不是元素、或没有 getAttribute 方法 → 跳过。
    const tag = el.tagName;                     // 【const】标签名，比如 'IMG'、'VIDEO'（注意是大写）。
    if (tag !== 'IMG' && tag !== 'VIDEO' && tag !== 'SOURCE') return;
    // 【if】只处理这三种媒体标签。
    const src = el.getAttribute('src') || '';   // 【const】取它当前的地址。
    const fixed = fixUrl(src);                  // 改写成反代地址。
    if (fixed !== src) el.setAttribute('src', fixed);
    // 【if】地址真的变了 → 写回去，浏览器会用新地址重新加载一次。
    // 这样就实现了「历史数据不用改，加载失败自动补救」。
  }, true);                                     // true = 在捕获阶段监听（关键）。

  // ISO 时间 → 「2026-10-23 13:07」
  // 固定按北京时间（Asia/Shanghai）显示：访客在哪个时区都看到中文站该有的时间，
  // 不再出现 T / Z / +00:00，也不会被浏览器时区搞成 UTC 时间。
  function fmtTime(s) {                         // 【function】把数据库里的时间字符串变成好看的样子。
    if (!s) return '';                          // 【if】没有时间 → 空字符串。
    const d = new Date(s);                      // 【new Date】把字符串解析成日期对象。
    if (isNaN(d.getTime())) return String(s);   // 【if】解析失败（getTime 是 NaN）→ 原样返回，别显示 Invalid Date。
    try {                                       // 【try】Intl 格式化在老环境可能报错，包一层。
      const parts = new Intl.DateTimeFormat('en-CA', {
      // 【Intl.DateTimeFormat】国际化时间格式化工具。
      // 'en-CA'（加拿大英语）的格式正好是 2026-10-23，符合我们要的样式。
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
        // 固定时区为上海；hour12:false = 24 小时制。
      }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
      // 【formatToParts】返回 [{type:'year',value:'2026'}, ...] 这样的数组；
      // 【reduce】把它折叠成一个对象：{ year:'2026', month:'10', ... }。
      // 箭头函数里用逗号表达式 (o[x.type] = x.value, o)：先赋值，再把 o 返回，一行搞定。
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
      // 【返回】拼成「2026-10-23 13:07」。
    } catch (e) {                               // 【catch】老浏览器不支持时的兜底写法。
      const p = n => (n < 10 ? '0' + n : '' + n);
      // 【箭头函数】补零：小于 10 就在前面加 0。
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      // 注意 getMonth() 从 0 开始（0 = 一月），所以必须 +1。
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
  }

  /* ============ auth（登录注册）============ */
  /* Supabase 的登录状态存在浏览器里（localStorage 里存 token），
     getSession() 只是「读一下本地有没有登录凭证」，不发网络请求，所以很快。 */
  async function getSession() {                 // 【async function】取当前会话。
    const { data } = await SB.auth.getSession();   // 【解构】只关心 data，error 用不上就丢掉。
    return data.session;                       // 【return】没登录时是 null。
  }
  async function getCurrentUser() {             // 【async function】取当前用户（会向服务器验证 token）。
    const { data } = await SB.auth.getUser();
    return data.user;                          // 【return】没登录时是 null。
  }
  async function signIn(username, password) {   // 【async function】登录。
    return SB.auth.signInWithPassword({ email: username + DOMAIN, password });
    // 用户名拼上虚拟域名当邮箱。返回 { data, error }，error 非空就是失败。
  }
  async function signUp(username, password) {   // 【async function】注册。
    return SB.auth.signUp({
      email: username + DOMAIN,
      password,
      options: { data: { username } }
      // options.data 是「附加信息」，会存进用户资料里，之后能在 profiles 表里看到。
      // { username } 是简写，等于 { username: username }。
    });
  }
  async function signOut() { return SB.auth.signOut(); }   // 【async function】退出登录，清掉本地凭证。
  function onAuthChange(cb) { return SB.auth.onAuthStateChange(cb); }
  // 【function】订阅登录状态变化：登录/退出时自动调用 cb 回调。cb = callback 的缩写。

  // 当前用户资料（兼容旧 /me 结构）
  async function me() {                         // 【async function】拿「我」的资料：编号、用户名、角色、头像。
    // 用 session 里的 user 就够，省掉一次 auth/v1/user 往返（国内这条最慢）
    const s = await getSession();               // 先读本地会话。
    const u = s && s.user;                      // 【&&】有会话才取 user，否则得到 null。
    if (!u) return { ok: false };               // 【if】没登录 → 直接返回失败（不浪费一次请求）。
    const { data, error } = await SB.from('profiles')
    // 【.from('profiles')】选中 profiles 表。
      .select('*')                              // 【.select('*')】要所有字段。
      .eq('id', u.id).single();
      // 【.eq(字段, 值)】筛选条件：id 等于当前用户 id。
      // 【.single()】只取一条（如果查不到会返回 error，而不是空数组）。
    if (error || !data) return { ok: false };   // 【if】查不到就当失败。
    return { ok: true, uid: u.id, uidNo: data.uid_no || null, username: data.username, role: data.role, avatar: data.avatar_url };
    // 【return】整理成页面好用的结构：
    // uid = 内部唯一 id（一串字母数字）；uidNo = 给用户看的数字编号；
    // role = owner/admin/user；avatar = 头像地址。
  }

  /* ============ 文章 ============ */
  /* 下面这个函数是「链式查询」的典型例子，读懂它，全站其他查询都是同一个套路：
       SB.from('表名')            —— 选中哪张表
         .select('要哪些字段')     —— 要什么
         .neq('status','deleted') —— 过滤条件
         .order('created_at')     —— 排序
         .range(0, 19)            —— 分页（第 0 到 19 条）
       最后 await 它才会真正发请求。 */
  async function getArticles({ limit = 20, offset = 0, uid = null, sort = 'new' } = {}) {
  // 【解构 + 默认值】参数是一个对象，里面四个字段各有默认值。
  // 末尾的 = {} 很关键：调用时不传参数（getArticles()）也不会报错。
    let q = SB.from('articles')                 // 【let】开始一次查询，先存进 q（因为后面可能还要继续加条件）。
      .select('*, profiles!articles_uid_fkey(*), article_likes(count), article_favs(count)')
      // 【select】要什么：
      //   * 文章所有字段；
      //   profiles!articles_uid_fkey(*) —— 顺着外键把作者资料也带出来（!后面的名字是外键名）；
      //   article_likes(count) / article_favs(count) —— 只要点赞数、收藏数的「数量」，不要全部明细。
      .neq('status', 'deleted')                 // 【.neq】不等于：排除已删除的文章。
      .order(sort === 'hot' ? 'views' : 'created_at', { descending: true })
      // 【.order】排序。三元：sort 是 'hot' 就按浏览量排，否则按创建时间排。
      // descending:true = 从大到小 / 从新到旧。
      .range(offset, offset + limit - 1);
      // 【.range】分页：从第 offset 条开始，到 offset+limit-1 条结束（下标包含两端）。
      // 例：offset=0、limit=20 → 第 0~19 条，正好 20 条。
    if (uid) q = q.eq('uid', uid);              // 【if】传了 uid 就再加一个条件：只看这个用户的文章。
    const { data, error } = await q;            // 【await】到这里才真正发请求。
    if (error) return errRes(error, { list: [] });
    // 【if】失败返回统一结构；list:[] 保证页面拿到的是数组，不会因为 undefined 报错。
    return { ok: true, list: (data || []).map(a => ({
    // 【.map】把数据库返回的原始结构，转换成页面要的干净结构（这一步叫「数据整形」）。
      id: a.id, title: a.title,
      author: (a.profiles && a.profiles.username) || '匿名',
      // 作者名；关联数据可能为空，所以先判断再用，最后兜底「匿名」。
      views: a.views || 0,
      likes: cnt(a.article_likes), favs: cnt(a.article_favs),
      // 用 cnt() 从 [{count:3}] 里把数字取出来。
      chars: a.chars || 0, created_at: a.created_at
    })) };
  }

  // 文章详情（含正文 + 媒体 + 作者 + 当前用户互动状态）
  async function getArticle(id) {               // 【async function】按 id 取一篇文章的完整信息。
    const u = await getCurrentUser();           // 先拿当前用户（可能没登录，那就是 null）。
    const { data, error } = await SB.from('articles')
      .select('*, profiles!articles_uid_fkey(*), article_media(file, sort)')
      // 比列表多查了 article_media（文章里的图片/视频，按 sort 排序）。
      .eq('id', id).single();                   // 【.single()】只取一条。
    if (error) return errRes(error);            // 出错统一返回失败结构。
    let likedByMe = false, favedByMe = false;   // 【let】准备两个「我有没有点过赞/收过藏」的标记。

    if (u) {
      const { data: lk } = await SB.from('article_likes').select('article_id').eq('article_id', id).eq('uid', u.id).maybeSingle();
      likedByMe = !!lk;
      const { data: fv } = await SB.from('article_favs').select('article_id').eq('article_id', id).eq('uid', u.id).maybeSingle();
      favedByMe = !!fv;
    }
    bumpView('article', data.id);
    return fixDeep({
      ok: true,
      id: data.id, title: data.title, content: data.content_html,
      author: (data.profiles && data.profiles.username) || '匿名',
      uid: data.uid, uidNo: (data.profiles && data.profiles.uid_no) || null,
      views: data.views || 0, chars: data.chars || 0,
      created_at: data.created_at, updated_at: data.updated_at,
      media: (data.article_media || []).sort((x, y) => x.sort - y.sort).map(m => m.file),
      likedByMe, favedByMe, canEdit: !!u && u.id === data.uid
    });
  }

  async function getArticleComments(id) {          // 【async function】取某篇文章的所有评论。
    const u = await getCurrentUser();              // 先拿当前用户（用来判断「我点过赞没」）。
    const { data, error } = await SB.from('comments')
      .select('*, profiles!comments_uid_fkey(*), comment_likes(uid)')
      // 要评论本身 + 评论者资料 + 每个赞是谁点的（只要 uid）。
      .eq('target_type', 'article').eq('target_id', id).eq('deleted', false)
      // 三个筛选条件串起来（相当于 SQL 里 AND）：
      //   类型是文章、目标是这篇、并且没被删除。
      .order('created_at', { ascending: true }).limit(500);
      // 按时间正序（老的在上，符合评论习惯）；最多 500 条（防止一次拉太多把页面卡死）。
    if (error) return { ok: false, list: [] };     // 出错也给空数组，页面不会崩。
    return { ok: true, list: (data || []).map(c => ({
      id: c.id, uid: c.uid, name: (c.profiles && c.profiles.username) || '匿名',
      content: c.content, text: c.content,          // 页面渲染读的是 text
      // 同一个值给两个字段名，是为了兼容新旧页面（老页面读 content，新页面读 text）。
      role: (c.profiles && c.profiles.role) || null,     // 身份（决定铭牌颜色）
      bio: (c.profiles && c.profiles.bio) || '',          // 个性签名
      avatar: (c.profiles && c.profiles.avatar_url) || null,
      uidNo: (c.profiles && c.profiles.uid_no) || null,
      time: fmtTime(c.created_at), parent: c.parent_id || null,   // 格式化时间；parent 是回复的父评论 id
      likes: (c.comment_likes || []).length,
      // 【.length】评论的赞数 = 关联出来的点赞记录有几条。
      likedByMe: !!(u && (c.comment_likes || []).some(l => l.uid === u.id))
      // 【!!】两个感叹号 = 强制转成布尔值（true/false）：
      // 【.some】点赞记录里有没有一条是当前用户点的。
      // 必须写 !! 是因为 some 可能返回 undefined（u 为空时短路），统一转成 true/false 更好判断。
    })) };
  }

  /* ============ 点赞 / 收藏 / 举报 / 增删改 ============ */
  /* 注意这三个「切换」函数的套路完全一样，学会一个就会三个：
       1. 查「我有没有点过」；
       2. 有就删掉，没有就插入；
       3. 重新数一下总数，返回给页面。 */
  async function toggleArticleLike(articleId) {   // 【async function】点赞 / 取消点赞（点一下切换）。
    const u = await getCurrentUser(); if (!u) return errRes(null);
    // 【if】没登录直接返回失败（errRes(null) 会给出默认文案「请求失败」）。
    const { data: ex } = await SB.from('article_likes').select('article_id').eq('article_id', articleId).eq('uid', u.id).maybeSingle();
    // 【解构重命名】data: ex —— 把 data 这个字段取出来但改名叫 ex（existing 的缩写）。
    // 【.maybeSingle()】和 single() 的区别：
    //   single()      查不到会报错；
    //   maybeSingle() 查不到返回 null，不报错。适合「可能没有」的场景。
    if (ex) { await SB.from('article_likes').delete().eq('article_id', articleId).eq('uid', u.id); }
    // 【if】已经赞过 → 删掉那条记录（取消赞）。
    else { const { error } = await SB.from('article_likes').insert({ article_id: articleId, uid: u.id }); if (error) return errRes(error); }
    // 【else】没赞过 → 插入一条新记录。
    // 【.insert(对象)】新增一行，对象的键就是字段名。
    const { count } = await SB.from('article_likes').select('*', { count: 'exact', head: true }).eq('article_id', articleId);
    // 【计数查询】select('*', { count:'exact', head:true })：
    //   head:true 表示「只要数量，不要把数据本身传回来」，省流量；
    //   count:'exact' 表示要精确数量。
    return { ok: true, on: !ex, count: count || 0 };
    // 【!ex】取反：原来有记录（ex 为真）→ 现在取消 → on:false；原来没有 → 现在点上 → on:true。
  }
  async function toggleArticleFav(articleId) {    // 【async function】收藏 / 取消收藏（逻辑同上，表名换成 article_favs）。
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data: ex } = await SB.from('article_favs').select('article_id').eq('article_id', articleId).eq('uid', u.id).maybeSingle();
    if (ex) { await SB.from('article_favs').delete().eq('article_id', articleId).eq('uid', u.id); }
    else { const { error } = await SB.from('article_favs').insert({ article_id: articleId, uid: u.id }); if (error) return errRes(error); }
    const { count } = await SB.from('article_favs').select('*', { count: 'exact', head: true }).eq('article_id', articleId);
    return { ok: true, on: !ex, count: count || 0 };
  }
  async function reportArticle(articleId, reason) {   // 【async function】举报文章。
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { error } = await SB.from('reports').insert({ target_type: 'article', target_id: articleId, reporter_uid: u.id, reason });
    // 【.insert】往举报表写一条：举报的是什么类型、哪个对象、谁举报的、理由。
    if (error) return errRes(error); return { ok: true };
    // 注意这里用了「一行两个语句」的紧凑写法：出错就返回错误，没错就返回成功。
  }
  async function deleteArticle(articleId) {       // 【async function】删除文章。
    const { error } = await SB.from('articles').delete().eq('id', articleId);
    // 【.delete()】删除符合条件的所有行。这里条件精确到一个 id，所以只删一条。
    if (error) return errRes(error); return { ok: true };
  }
  async function createArticle(title, html, chars) {   // 【async function】新建文章。
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data, error } = await SB.from('articles')
      .insert({ uid: u.id, title, content_html: html, chars: chars || 0 })
      // 【对象简写】{ title, } 等于 { title: title }。
      // uid 取当前用户，防止伪造作者。
      .select('id').single();
      // 【关键】insert 之后接 .select('id')：让数据库把新插入那行的 id 返回给我们。
      // 不写这句，插入成功但你拿不到 id，就没法跳转到新文章页。
    if (error) return errRes(error);
    return { ok: true, id: data.id };
  }
  async function updateArticle(id, title, html, chars) {   // 【async function】修改文章。
    const { error } = await SB.from('articles')
      .update({ title, content_html: html, chars: chars || 0, updated_at: new Date().toISOString() })
      // 【.update(对象)】把符合条件的行改掉。
      // new Date().toISOString() = 当前时间的 ISO 字符串，手动更新「修改时间」。
      .eq('id', id);                            // 条件是 id 匹配。
    if (error) return errRes(error);
    return { ok: true, id };
  }

  /* 下面两个函数是「查我赞过 / 收藏过哪些文章」的第一步：先拿到 id 列表。 */
  async function likedByArticles(uid) {           // 【async function】这个用户赞过哪些文章（只返回 id）。
    const { data, error } = await SB.from('article_likes').select('article_id').eq('uid', uid);
    if (error) return { ok: false, ids: [] };
    return { ok: true, ids: (data || []).map(r => r.article_id) };
    // 【.map】把 [{article_id:'a'}, {article_id:'b'}] 变成 ['a','b']。
  }
  async function favedByArticles(uid) {           // 【async function】同上，收藏的 id 列表。
    const { data, error } = await SB.from('article_favs').select('article_id').eq('uid', uid);
    if (error) return { ok: false, ids: [] };
    return { ok: true, ids: (data || []).map(r => r.article_id) };
  }
  async function getLikedArticles(uid) {          // 【async function】拿「赞过的文章」完整信息（给个人主页展示）。
    const { data, error } = await SB.from('article_likes').select('article_id').eq('uid', uid);
    if (error || !data.length) return { ok: true, list: [] };
    // 【if】出错、或者一条都没有 → 回空列表（注意这里 ok 仍然是 true，因为「没有」不是错误）。
    const ids = data.map(r => r.article_id);       // 先取出 id 数组。
    const { data: arts } = await SB.from('articles')
      .select('id, title, uid, views, article_likes(count), profiles!articles_uid_fkey(*)')
      .in('id', ids).neq('status', 'deleted');
      // 【.in(字段, 数组)】相当于 SQL 的 WHERE id IN (...)，一次查出多条。
      // 注意仍然排除了已删除的文章 —— 赞过的文章被删了就不该出现在列表里。
    return { ok: true, list: (arts || []).map(a => ({
      id: a.id, title: a.title, author: (a.profiles && a.profiles.username) || '匿名',
      views: a.views || 0, likes: cnt(a.article_likes)
    })) };
  }
  async function getFavedArticles(uid) {          // 【async function】拿「收藏的文章」，逻辑和上面一模一样。
    const { data, error } = await SB.from('article_favs').select('article_id').eq('uid', uid);
    if (error || !data.length) return { ok: true, list: [] };
    const ids = data.map(r => r.article_id);
    const { data: arts } = await SB.from('articles')
      .select('id, title, uid, views, article_favs(count), profiles!articles_uid_fkey(*)')
      .in('id', ids).neq('status', 'deleted');
    return { ok: true, list: (arts || []).map(a => ({
      id: a.id, title: a.title, author: (a.profiles && a.profiles.username) || '匿名',
      views: a.views || 0, favs: cnt(a.article_favs)
    })) };
  }

  /* ============ 视频 ============ */
  async function getVideos({ limit = 20, offset = 0, uid = null, sort = 'new' } = {}) {
    let q = SB.from('videos')
      .select('*, profiles!videos_uid_fkey(*), video_likes(count), video_favs(count)')
      .neq('status', 'deleted')
      .order(sort === 'hot' ? 'views' : 'created_at', { descending: true })
      .range(offset, offset + limit - 1);
    if (uid) q = q.eq('uid', uid);
    const { data, error } = await q;
    if (error) return errRes(error, { list: [] });
    return { ok: true, list: (data || []).map(v => fixDeep({
      id: v.id, title: v.title,
      author: (v.profiles && v.profiles.username) || '匿名',
      views: v.views || 0, likes: cnt(v.video_likes), favs: cnt(v.video_favs),
      poster: v.poster, video_path: v.video_path, created_at: v.created_at
    })) };
  }

  async function getVideo(id) {
    const u = await getCurrentUser();
    const { data, error } = await SB.from('videos')
      .select('*, profiles!videos_uid_fkey(*), video_likes(count), video_favs(count)')
      .eq('id', id).single();
    if (error) return errRes(error);
    let likedByMe = false, favedByMe = false;
    if (u) {
      const { data: lk } = await SB.from('video_likes').select('video_id').eq('video_id', id).eq('uid', u.id).maybeSingle();
      likedByMe = !!lk;
      const { data: fv } = await SB.from('video_favs').select('video_id').eq('video_id', id).eq('uid', u.id).maybeSingle();
      favedByMe = !!fv;
    }
    bumpView('video', data.id);
    return fixDeep({
      ok: true,
      id: data.id, title: data.title, description: data.description,
      author: (data.profiles && data.profiles.username) || '匿名',
      uid: data.uid, uidNo: (data.profiles && data.profiles.uid_no) || null,
      views: data.views || 0, duration: data.duration,
      poster: data.poster, video_path: data.video_path, created_at: data.created_at,
      likes: cnt(data.video_likes), favs: cnt(data.video_favs),
      likedByMe, favedByMe, canEdit: !!u && u.id === data.uid
    });
  }

  async function getVideoComments(id) {
    const u = await getCurrentUser();
    const { data, error } = await SB.from('comments')
      .select('*, profiles!comments_uid_fkey(*), comment_likes(uid)')
      .eq('target_type', 'video').eq('target_id', id).eq('deleted', false)
      .order('created_at', { ascending: true }).limit(500);
    if (error) return { ok: false, list: [] };
    return { ok: true, list: (data || []).map(c => ({
      id: c.id, uid: c.uid, name: (c.profiles && c.profiles.username) || '匿名',
      content: c.content, text: c.content,
      role: (c.profiles && c.profiles.role) || null,
      bio: (c.profiles && c.profiles.bio) || '',
      avatar: (c.profiles && c.profiles.avatar_url) || null,
      uidNo: (c.profiles && c.profiles.uid_no) || null,
      time: fmtTime(c.created_at), parent: c.parent_id || null,
      likes: (c.comment_likes || []).length,
      likedByMe: !!(u && (c.comment_likes || []).some(l => l.uid === u.id))
    })) };
  }

  /* ---------- 视频：点赞 / 收藏 / 举报 / 增删改 ----------
     下面这一整段，和上面文章的版本是「同一个模子」：
     把 article 换成 video、把 article_likes 换成 video_likes，逻辑一个字都没变。
     这正是「数据层」的价值：页面上的按钮长得一样，底下的代码也就长得一样。 */
  async function toggleVideoLike(videoId) {        // 【async function】视频点赞/取消。
    const u = await getCurrentUser(); if (!u) return errRes(null);   // 【if】没登录直接失败。
    const { data: ex } = await SB.from('video_likes').select('video_id').eq('video_id', videoId).eq('uid', u.id).maybeSingle();
    // 查「我赞过这个视频吗」；maybeSingle 查不到返回 null 不报错。
    if (ex) { await SB.from('video_likes').delete().eq('video_id', videoId).eq('uid', u.id); }   // 赞过 → 删掉
    else { const { error } = await SB.from('video_likes').insert({ video_id: videoId, uid: u.id }); if (error) return errRes(error); }   // 没赞过 → 插入
    const { count } = await SB.from('video_likes').select('*', { count: 'exact', head: true }).eq('video_id', videoId);
    // 只取数量（head:true），不把明细传回来。
    return { ok: true, on: !ex, count: count || 0 };   // 【!ex】原来有 = 现在是取消，on:false。
  }
  async function toggleVideoFav(videoId) {         // 【async function】视频收藏/取消，同上的表换成 video_favs。
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data: ex } = await SB.from('video_favs').select('video_id').eq('video_id', videoId).eq('uid', u.id).maybeSingle();
    if (ex) { await SB.from('video_favs').delete().eq('video_id', videoId).eq('uid', u.id); }
    else { const { error } = await SB.from('video_favs').insert({ video_id: videoId, uid: u.id }); if (error) return errRes(error); }
    const { count } = await SB.from('video_favs').select('*', { count: 'exact', head: true }).eq('video_id', videoId);
    return { ok: true, on: !ex, count: count || 0 };
  }
  async function reportVideo(videoId, reason) {    // 【async function】举报视频，写进 reports 表。
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { error } = await SB.from('reports').insert({ target_type: 'video', target_id: videoId, reporter_uid: u.id, reason });
    if (error) return errRes(error); return { ok: true };
  }
  async function deleteVideo(videoId) {            // 【async function】删除视频记录（数据库里的行，不是 R2 里的文件）。
    const { error } = await SB.from('videos').delete().eq('id', videoId);
    if (error) return errRes(error); return { ok: true };
  }
  async function createVideo(title, description, videoPath, poster, duration) {
  // 【async function】新建视频。参数：标题、简介、视频文件路径、封面图、时长（秒）。
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data, error } = await SB.from('videos')
      .insert({
        uid: u.id, title, description,               // 对象简写：title 就是 title: title
        video_path: videoPath || null,               // 字段名是下划线风格（数据库），变量名是驼峰（JS），要手动对应
        poster: poster || null,                      // 没传封面就存 null（而不是空字符串）
        duration: Number(duration) || 0              // 【Number】强制转数字，转不出来给 0
      })
      .select('id').single();                        // 让数据库把新行 id 返回，页面才能跳转
    if (error) return errRes(error);
    return { ok: true, id: data.id };
  }
  async function updateVideo(id, title, description, poster) {
  // 【async function】改视频信息。注意这里是「部分更新」的思路。
    const patch = { title, description, updated_at: new Date().toISOString() };
    // 【const】patch = 「要改哪些字段」的对象。先把一定会改的放进去。
    if (poster !== undefined) patch.poster = poster || null;
    // 【if】只有传了 poster（哪怕传的是空字符串）才改封面。
    // 为什么用 !== undefined 而不是 if (poster)？因为「传空字符串」表示「我要清空封面」，
    // 如果用 if (poster)，空字符串是假值，就改不掉了 —— 这是很常见的坑。
    const { error } = await SB.from('videos')
      .update(patch)                                 // 【.update】只更新 patch 里带的字段，其他字段保持不变。
      .eq('id', id);
    if (error) return errRes(error);
    return { ok: true, id };
  }
  async function likedByVideos(uid) {              // 【async function】这个用户赞过哪些视频 id。
    const { data, error } = await SB.from('video_likes').select('video_id').eq('uid', uid);
    if (error) return { ok: false, ids: [] };
    return { ok: true, ids: (data || []).map(r => r.video_id) };
  }
  async function favedByVideos(uid) {              // 【async function】收藏过哪些视频 id。
    const { data, error } = await SB.from('video_favs').select('video_id').eq('uid', uid);
    if (error) return { ok: false, ids: [] };
    return { ok: true, ids: (data || []).map(r => r.video_id) };
  }
  async function getLikedVideos(uid) {             // 【async function】赞过的视频完整信息（个人主页展示用）。
    const { data, error } = await SB.from('video_likes').select('video_id').eq('uid', uid);
    if (error || !data.length) return { ok: true, list: [] };
    const ids = data.map(r => r.video_id);         // 先拿 id 集合。
    const { data: vs } = await SB.from('videos')
      .select('id, title, uid, views, video_likes(count), profiles!videos_uid_fkey(*)')
      .in('id', ids).neq('status', 'deleted');     // 【.in】一次查多条，同时排除已删除的。
    return { ok: true, list: (vs || []).map(v => ({
      id: v.id, title: v.title, author: (v.profiles && v.profiles.username) || '匿名',
      views: v.views || 0, likes: cnt(v.video_likes)
    })) };
  }
  async function getFavedVideos(uid) {             // 【async function】收藏的视频完整信息。
    const { data, error } = await SB.from('video_favs').select('video_id').eq('uid', uid);
    if (error || !data.length) return { ok: true, list: [] };
    const ids = data.map(r => r.video_id);
    const { data: vs } = await SB.from('videos')
      .select('id, title, uid, views, video_favs(count), profiles!videos_uid_fkey(*)')
      .in('id', ids).neq('status', 'deleted');
    return { ok: true, list: (vs || []).map(v => ({
      id: v.id, title: v.title, author: (v.profiles && v.profiles.username) || '匿名',
      views: v.views || 0, favs: cnt(v.video_favs)
    })) };
  }

  /* ============ 评论（文章/视频通用） ============ */
  /* 关键设计：评论表用 target_type + target_id 两个字段，
     既能挂文章也能挂视频，不用建两张表。这叫「多态关联」。 */
  async function postComment(targetType, targetId, content, parentId) {
  // 【async function】发一条评论。parentId 有值就表示这是「回复某条评论」。
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data, error } = await SB.from('comments')
      .insert({ target_type: targetType, target_id: targetId, uid: u.id, content, parent_id: parentId || null })
      // 【对象简写】content 就是 content: content。
      // parentId || null：没传父评论就存 null（表示这是顶层评论）。
      .select('*, profiles!comments_uid_fkey(*)').single();
      // 【关键】插入后再 .select()，让数据库把「刚插入的那一行 + 作者资料」返回，
      // 这样页面不用再查一次就能立刻把新评论显示出来。
    if (error) return errRes(error);
    return { ok: true, comment: { id: data.id, uid: data.uid, author: (data.profiles && data.profiles.username) || '匿名', content: data.content, time: data.created_at, likes: 0 } };
    // 返回的字段名（author/time）是页面那套，和数据库字段名不一样 —— 这一层就是做「翻译」的。
    // likes: 0 因为刚发出来肯定没人赞。
  }
  async function deleteComment(commentId) {
    const { error } = await SB.from('comments').delete().eq('id', commentId);
    if (error) return errRes(error); return { ok: true };
  }
  async function likeComment(commentId) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data: ex } = await SB.from('comment_likes').select('comment_id').eq('comment_id', commentId).eq('uid', u.id).maybeSingle();
    if (ex) { await SB.from('comment_likes').delete().eq('comment_id', commentId).eq('uid', u.id); }
    else { const { error } = await SB.from('comment_likes').insert({ comment_id: commentId, uid: u.id }); if (error) return errRes(error); }
    const { count } = await SB.from('comment_likes').select('*', { count: 'exact', head: true }).eq('comment_id', commentId);
    return { ok: true, on: !ex, count: count || 0 };
  }
  async function reportComment(commentId, reason) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { error } = await SB.from('reports').insert({ target_type: 'comment', target_id: commentId, reporter_uid: u.id, reason });
    if (error) return errRes(error); return { ok: true };
  }

  /* ============ 留言板 ============ */
  // 页面（test/board.html）用的是 m.text / m.name / whoOf(m) 这套字段，
  // 这里统一把 content/author 做别名，并带上真实赞数 + 我赞过没 + 作者资料。
  const MSG_SELECT = '*, profiles!messages_uid_fkey(*), message_likes(uid)';

  function mapMessage(m, me, floorMap) {
    const p = m.profiles || {};
    const name = m.author_name || p.username || '匿名';
    const likes = m.message_likes || [];
    const isRoot = m.parent == null;
    return {
      id: m.id, uid: m.uid,
      author: name, name: name,                       // 新字段名 + 旧页面字段名
      content: m.content, text: m.content,
      floor: isRoot ? (floorMap ? floorMap.get(m.id) : m.floor) : null,
      parent: m.parent, pinned: !!m.pinned,
      time: fmtTime(m.created_at), created_at: m.created_at,
      role: p.role || null, bio: p.bio || '', avatar: p.avatar_url || null, uidNo: p.uid_no || null,
      likes: likes.length,
      likedByMe: !!(me && likes.some(l => l.uid === me.id))
    };
  }

  async function getMessages() {
    const u = await getCurrentUser();
    const { data, error } = await SB.from('messages')
      .select(MSG_SELECT).eq('deleted', false)
      .order('created_at', { ascending: true }).limit(500);
    if (error) return { ok: false, list: [] };
    const rows = data || [];
    // schema 里 floor 没有自动编号，新留言补一个：主楼按时间顺序 1..N（已有 floor 的保持原样）
    const floorMap = new Map();
    let n = 0;
    rows.forEach(m => {
      if (m.parent != null) return;
      n += 1;
      floorMap.set(m.id, m.floor != null ? m.floor : n);
    });
    return { ok: true, list: rows.map(m => mapMessage(m, u, floorMap)) };
  }

  async function postMessage(content, parent) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const patch = { uid: u.id, content, parent: parent || null };
    if (!parent) {
      // 主楼排到最后一层
      const { data: last } = await SB.from('messages').select('floor')
        .not('floor', 'is', null).order('floor', { ascending: false }).limit(1);
      patch.floor = ((last && last[0] && Number(last[0].floor)) || 0) + 1;
    }
    const { data, error } = await SB.from('messages')
      .insert(patch).select(MSG_SELECT).single();
    if (error) return errRes(error);
    return { ok: true, msg: mapMessage(data, u) };
  }

  // 点赞是「赞 / 取消赞」切换，返回 {liked, likes}
  async function likeMessage(id) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data: ex } = await SB.from('message_likes').select('message_id')
      .eq('message_id', id).eq('uid', u.id).maybeSingle();
    if (ex) {
      const { error } = await SB.from('message_likes').delete().eq('message_id', id).eq('uid', u.id);
      if (error) return errRes(error);
    } else {
      const { error } = await SB.from('message_likes').insert({ message_id: id, uid: u.id });
      if (error) return errRes(error);
    }
    const { count } = await SB.from('message_likes').select('*', { count: 'exact', head: true }).eq('message_id', id);
    return { ok: true, liked: !ex, likes: count || 0 };
  }

  async function reportMessage(id, reason) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { error } = await SB.from('reports').insert({ target_type: 'message', target_id: id, reporter_uid: u.id, reason });
    if (error) return errRes(error); return { ok: true };
  }

  // 我在留言板上举报过、还没被处理的留言 id（board 里禁用「举报」按钮用）
  async function getMyReports() {
    const u = await getCurrentUser();
    if (!u) return { ok: false, ids: [] };
    const { data, error } = await SB.from('reports')
      .select('target_type, target_id, status').eq('reporter_uid', u.id).eq('target_type', 'message');
    if (error) return { ok: false, ids: [] };
    return {
      ok: true,
      ids: (data || []).filter(r => r.target_id && r.status !== 'done').map(r => r.target_id)
    };
  }

  // 置顶 / 取消置顶（只有 is_staff() 能过 RLS）
  async function pinMessage(id) {
    const { data: cur, error: e1 } = await SB.from('messages').select('pinned').eq('id', id).single();
    if (e1) return errRes(e1);
    const next = !cur.pinned;
    const { error } = await SB.from('messages')
      .update({ pinned: next, pin_time: next ? new Date().toISOString() : null }).eq('id', id);
    if (error) return errRes(error);
    return { ok: true, pinned: next };
  }

  /* ============ 通知 ============ */
  async function getNotifications() {
    const u = await getCurrentUser();
    if (!u) return { ok: false, list: [] };
    const { data, error } = await SB.from('notifications')
      .select('*').eq('uid', u.id).order('created_at', { ascending: false }).limit(200);
    if (error) return errRes(error, { list: [] });
    return { ok: true, list: (data || []).map(n => ({
      id: n.id, type: n.type, fromName: n.from_name, action: n.action,
      text: n.text, time: n.created_at, read: n.read, href: n.href
    })) };
  }
  async function markRead(payload) {
    const u = await getCurrentUser();
    if (!u) return { ok: false };
    let q = SB.from('notifications').update({ read: true }).eq('uid', u.id);
    if (payload && payload.all) { /* 全部已读 */ }
    else if (payload && payload.ids && payload.ids.length) q = q.in('id', payload.ids);
    else return { ok: false };
    const { error } = await q;
    return error ? errRes(error) : { ok: true };
  }

  /* ============ 日志 ============ */
  async function getLogs() {
    const { data, error } = await SB.from('logs')
      .select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return [];
    return (data || []).map(l => ({ date: (l.created_at || '').slice(0, 10), text: l.detail || l.action || '' }));
  }
  async function addLog(text) {
    const u = await getCurrentUser();
    if (!u) return errRes(null);
    const { data, error } = await SB.from('logs')
      .insert({ actor_uid: u.id, action: 'add_log', detail: text }).select().single();
    if (error) return errRes(error);
    return { ok: true, date: (data.created_at || '').slice(0, 10), text: data.detail };
  }

  /* ============ 用户 / 资料 / 关系 ============ */
  async function getProfile(uid) {
    const { data, error } = await SB.from('profiles')
      .select('*').eq('id', uid).single();
    if (error) return errRes(error);
    return { ok: true, profile: data };
  }
  async function getUserByUid(uid) {
    const { data, error } = await SB.from('profiles')
      .select('*').eq('id', uid).single();
    if (error) return { ok: false };
    return {
      ok: true, uid: data.id, uidNo: data.uid_no || null, username: data.username, role: data.role,
      bio: data.bio, avatar: data.avatar_url, createdAt: (data.created_at || '').slice(0, 10)
    };
  }
  // 按「数字 UID」查（/profile/?uid=1 这种），站长是 1
  async function getUserByUidNo(n) {
    const num = Number(n);
    if (!num) return { ok: false };
    const { data, error } = await SB.from('profiles')
      .select('*').eq('uid_no', num).maybeSingle();
    if (error || !data) return { ok: false };
    return {
      ok: true, uid: data.id, uidNo: data.uid_no, username: data.username, role: data.role,
      bio: data.bio, avatar: data.avatar_url, createdAt: (data.created_at || '').slice(0, 10)
    };
  }
  async function getAllUsers() {
    const { data, error } = await SB.from('profiles')
      .select('*')
      .order('uid_no', { ascending: true }).limit(500);
    if (error) return { ok: false, list: [] };
    return { ok: true, list: data || [] };
  }
  async function updateProfile(patch) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { error } = await SB.from('profiles').update(patch).eq('id', u.id);
    if (error) return errRes(error); return { ok: true };
  }
  async function changePassword(newPassword) {
    const { error } = await SB.auth.updateUser({ password: newPassword });
    if (error) return errRes(error); return { ok: true };
  }
  async function getRelations(uid) {
    const u = await getCurrentUser();
    const viewerId = u ? u.id : null;
    const { data: following } = await SB.from('follows').select('following_uid').eq('follower_uid', uid);
    const { data: followers } = await SB.from('follows').select('follower_uid').eq('following_uid', uid);
    const { data: blocked } = await SB.from('blocks').select('blocked_uid').eq('blocker_uid', uid);
    const fIds = (following || []).map(r => r.following_uid);
    const foIds = (followers || []).map(r => r.follower_uid);
    const bIds = (blocked || []).map(r => r.blocked_uid);
    let meFollowing = false, meBlocked = false;
    if (viewerId) {
      meFollowing = foIds.includes(viewerId);
      const { data: myBlocked } = await SB.from('blocks').select('blocked_uid').eq('blocker_uid', viewerId);
      meBlocked = ((myBlocked || []).map(r => r.blocked_uid)).includes(uid);
    }
    return { ok: true, following: fIds, followers: foIds, blocked: bIds, meFollowing, meBlocked };
  }
  // 关注 / 取消关注（切换），返回 {following}
  async function follow(targetUid) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data: ex } = await SB.from('follows').select('following_uid')
      .eq('follower_uid', u.id).eq('following_uid', targetUid).maybeSingle();
    if (ex) {
      const { error } = await SB.from('follows').delete()
        .eq('follower_uid', u.id).eq('following_uid', targetUid);
      if (error) return errRes(error);
      return { ok: true, following: false };
    }
    const { error } = await SB.from('follows').insert({ follower_uid: u.id, following_uid: targetUid });
    if (error) return errRes(error);
    return { ok: true, following: true };
  }
  // 拉黑 / 取消拉黑（切换），返回 {blocked}
  async function block(targetUid) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data: ex } = await SB.from('blocks').select('blocked_uid')
      .eq('blocker_uid', u.id).eq('blocked_uid', targetUid).maybeSingle();
    if (ex) {
      const { error } = await SB.from('blocks').delete()
        .eq('blocker_uid', u.id).eq('blocked_uid', targetUid);
      if (error) return errRes(error);
      return { ok: true, blocked: false };
    }
    const { error } = await SB.from('blocks').insert({ blocker_uid: u.id, blocked_uid: targetUid });
    if (error) return errRes(error);
    return { ok: true, blocked: true };
  }

  // 软删除：自己发的（或 staff 删任何人的）留言，连带它下面的回复一起标删
  async function deleteMessage(messageId) {
    const { error } = await SB.from('messages')
      .update({ deleted: true }).or('id.eq.' + messageId + ',parent.eq.' + messageId);
    if (error) return errRes(error); return { ok: true };
  }

  /* ============ 举报处理（staff） ============ */
  // 四类举报统一进 reports 表（message / comment / article / video），
  // 之前评论举报把 id 塞进 reason 字符串，导致后台永远显示"数据损坏"。
  const REPORT_CFG = {
    message: { table: 'messages', cols: 'id, content, uid, author_name, created_at, deleted, profiles!messages_uid_fkey(*)' },
    comment: { table: 'comments', cols: 'id, content, uid, created_at, deleted, profiles!comments_uid_fkey(*)' },
    article: { table: 'articles', cols: 'id, title, uid, created_at, profiles!articles_uid_fkey(*)' },
    video:   { table: 'videos',   cols: 'id, title, uid, created_at, profiles!videos_uid_fkey(*)' }
  };

  async function getReports() {
    const { data, error } = await SB.from('reports')
      .select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return { ok: false, list: [], error: error.message };
    const rows = data || [];
    if (!rows.length) return { ok: true, list: [] };

    // 按类型分组，每类一次查询，不逐条打接口
    const groups = {};
    rows.forEach(r => {
      const t = REPORT_CFG[r.target_type] ? r.target_type : 'message';
      if (r.target_id == null) return;
      (groups[t] = groups[t] || new Set()).add(r.target_id);
    });
    const maps = {};
    for (const t of Object.keys(groups)) {
      const cfg = REPORT_CFG[t];
      const { data: hit } = await SB.from(cfg.table).select(cfg.cols).in('id', [...groups[t]]);
      const m = {};
      (hit || []).forEach(x => { m[x.id] = x; });
      maps[t] = m;
    }
    // 举报人用户名
    const rIds = [...new Set(rows.map(r => r.reporter_uid).filter(Boolean))];
    let reporterMap = {};
    if (rIds.length) {
      const { data: rs } = await SB.from('profiles').select('id, username').in('id', rIds);
      (rs || []).forEach(p => { reporterMap[p.id] = p.username; });
    }

    return { ok: true, list: rows.map(r => {
      const t = REPORT_CFG[r.target_type] ? r.target_type : 'message';
      const x = (maps[t] || {})[r.target_id];
      const gone = !x || (t !== 'article' && t !== 'video' && !!x.deleted);
      const name = x ? (x.author_name || (x.profiles && x.profiles.username) || '（未知用户）') : '（未知用户）';
      const text = !x ? '' : (x.content != null ? x.content : (x.title || ''));
      return {
        id: r.id,
        targetType: t, targetId: r.target_id,
        messageId: t === 'message' ? r.target_id : null,
        status: r.status, action: r.action, reason: r.reason,
        reporter: reporterMap[r.reporter_uid] || '（未知）',
        msgText: text, msgName: name, alive: !gone,
        targetUid: x ? x.uid : null,
        msgTime: x ? fmtTime(x.created_at) : '',
        reportTime: fmtTime(r.created_at)
      };
    }) };
  }

  // 按举报类型删掉被举报的东西（留言软删、其余硬删，RLS 保证只有 staff 能删别人的）
  async function deleteReported(report) {
    if (!report || report.targetId == null) return { ok: false, error: '这条举报没有目标' };
    switch (report.targetType) {
      case 'comment': return deleteComment(report.targetId);
      case 'article': return deleteArticle(report.targetId);
      case 'video':   return deleteVideo(report.targetId);
      case 'message':
      default:        return deleteMessage(report.targetId);
    }
  }

  async function handleReport(reportId, action) {
    const { error } = await SB.from('reports')
      .update({ status: 'done', action, handled_at: new Date().toISOString() })
      .eq('id', reportId);
    if (error) return errRes(error); return { ok: true };
  }

  /* ============ 浏览量 ============ */
  // 走 RPC（security definer），否则普通访客没有 update 权限，数字永远不动
  async function bumpView(type, id) {
    if (!id) return;
    try { await SB.rpc('bump_view', { p_type: type, p_id: id }); } catch (e) { /* 函数没建就算了，不阻塞页面 */ }
  }

  // ---------- B 站信息（封面/时长） ----------
  // 只能走本站边缘函数 /bili：api.bilibili.com 不返 CORS 头（fetch 读不到），
  // 响应又是 application/json，<script> JSONP 会被浏览器按 MIME 拒绝执行。
  // 结果缓存 7 天，列表页批量补封面不会重复打接口。
  const BILI_KEY = 'biliCache.v2';
  let biliMem = null;
  function biliStore() {
    if (biliMem) return biliMem;
    try { biliMem = JSON.parse(localStorage.getItem(BILI_KEY) || '{}'); }
    catch (e) { biliMem = {}; }
    return biliMem;
  }
  async function fetchBili(bv) {
    const key = String(bv || '').trim().toUpperCase();
    if (!/^BV[0-9A-Za-z]{10}$/.test(key)) return null;

    const store = biliStore();
    const hit = store[key];
    if (hit) {
      if (hit.v && Date.now() - hit.t < 7 * 24 * 3600 * 1000) return hit.v;
      // 失败负缓存 1 小时：/bili 被 B 站风控时别每次翻页都打一轮空请求
      if (!hit.v && Date.now() - hit.t < 3600 * 1000) return null;
    }

    let d = null;
    try {
      const r = await fetch('/bili?bv=' + encodeURIComponent(key));
      if (r.ok) {
        const j = await r.json();
        if (j && j.ok && (j.pic || j.title)) d = j;
      }
    } catch (e) { /* 拿不到就返回 null */ }
    if (!d) {
      store[key] = { t: Date.now(), v: null };
      try { localStorage.setItem(BILI_KEY, JSON.stringify(store)); } catch (e) {}
      return null;
    }

    const v = {
      title: d.title || '',
      pic: String(d.pic || '').replace(/^http:/, 'https:'),
      duration: Number(d.duration) || 0
    };
    store[key] = { t: Date.now(), v };
    try { localStorage.setItem(BILI_KEY, JSON.stringify(store)); } catch (e) { /* 存不下就算了 */ }
    return v;
  }

  window.SBAPI = {
    SB, DOMAIN,
    fetchBili,
    getSession, getCurrentUser, signIn, signUp, signOut, onAuthChange, me, fmtTime,
    getArticles, getArticle, getArticleComments,
    toggleArticleLike, toggleArticleFav, reportArticle, deleteArticle,
    createArticle, updateArticle,
    likedByArticles, favedByArticles, getLikedArticles, getFavedArticles,
    getVideos, getVideo, getVideoComments,
    toggleVideoLike, toggleVideoFav, reportVideo, deleteVideo,
    createVideo, updateVideo,
    likedByVideos, favedByVideos, getLikedVideos, getFavedVideos,
    postComment, deleteComment, likeComment, reportComment,
    getMessages, postMessage, likeMessage, reportMessage, getMyReports, pinMessage,
    getNotifications, markRead,
    getLogs, addLog,
    getProfile, getUserByUid, getUserByUidNo, getAllUsers, updateProfile, changePassword,
    getRelations, follow, block, deleteMessage,
    getReports, handleReport, deleteReported, bumpView
  };
})();
