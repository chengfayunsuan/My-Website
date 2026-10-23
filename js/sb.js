// js/sb.js — Supabase 前端数据层（方案 A：前端直连 + RLS）
// 所有页面通过 window.SBAPI 访问。返回结构尽量对齐旧 server.js，减少页面 DOM 改动。
// 必须在 supabase-js（CDN）和 config.js 之后引入。
(function () {
  if (!window.supabase || !window.SUPABASE_URL) {
    console.error('[sb] supabase-js 未加载或 config.js 未配置');
    return;
  }
  const SB = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  window.SB = SB;

  // 用户名登录 → 虚拟 email（Supabase Auth 只认 email+password）
  const DOMAIN = '@chengfa.app';

  function errRes(e, extra) {
    return Object.assign({ ok: false, error: (e && e.message) || '请求失败' }, extra || {});
  }
  // 一对多关系的 count 取数（supabase 嵌入返回 [{count:N}]）
  function cnt(arr) { return (arr && arr[0] && arr[0].count) || 0; }

  // ---------- 媒体地址修正 ----------
  // 数据库里存过 https://xxx.supabase.co/storage/... 的绝对地址，国内直连不通。
  // 走反代后统一改写成 https://当前站点/sb/storage/...，历史数据不用回炉。
  const UPSTREAM = (window.SB_UPSTREAM || '').replace(/\/+$/, '');
  function fixUrl(u) {
    if (!u || typeof u !== 'string' || !UPSTREAM) return u;
    if (window.SUPABASE_URL === UPSTREAM) return u;          // 没开反代，原样返回
    if (u.indexOf(UPSTREAM) === 0) {
      return window.SUPABASE_URL.replace(/\/+$/, '') + u.slice(UPSTREAM.length);
    }
    return u;
  }
  function fixDeep(o) {
    if (!o) return o;
    if (typeof o === 'string') return fixUrl(o);
    if (Array.isArray(o)) return o.map(fixDeep);
    if (typeof o === 'object') {
      for (const k in o) if (typeof o[k] === 'string') o[k] = fixUrl(o[k]);
    }
    return o;
  }
  // 富文本正文里的 <img src="https://xxx.supabase.co/...">：加载失败时补一次改写。
  // 资源加载错误不冒泡，但会在捕获阶段经过 window，所以这里用 true。
  window.addEventListener('error', function (ev) {
    const el = ev.target;
    if (!el || !el.getAttribute) return;
    const tag = el.tagName;
    if (tag !== 'IMG' && tag !== 'VIDEO' && tag !== 'SOURCE') return;
    const src = el.getAttribute('src') || '';
    const fixed = fixUrl(src);
    if (fixed !== src) el.setAttribute('src', fixed);
  }, true);

  // ISO 时间 → 「2026-10-23 13:07」
  // 固定按北京时间（Asia/Shanghai）显示：访客在哪个时区都看到中文站该有的时间，
  // 不再出现 T / Z / +00:00，也不会被浏览器时区搞成 UTC 时间。
  function fmtTime(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    } catch (e) {
      const p = n => (n < 10 ? '0' + n : '' + n);
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
  }

  /* ============ auth ============ */
  async function getSession() {
    const { data } = await SB.auth.getSession();
    return data.session;
  }
  async function getCurrentUser() {
    const { data } = await SB.auth.getUser();
    return data.user;
  }
  async function signIn(username, password) {
    return SB.auth.signInWithPassword({ email: username + DOMAIN, password });
  }
  async function signUp(username, password) {
    return SB.auth.signUp({
      email: username + DOMAIN,
      password,
      options: { data: { username } }
    });
  }
  async function signOut() { return SB.auth.signOut(); }
  function onAuthChange(cb) { return SB.auth.onAuthStateChange(cb); }

  // 当前用户资料（兼容旧 /me 结构）
  async function me() {
    // 用 session 里的 user 就够，省掉一次 auth/v1/user 往返（国内这条最慢）
    const s = await getSession();
    const u = s && s.user;
    if (!u) return { ok: false };
    const { data, error } = await SB.from('profiles')
      .select('*')
      .eq('id', u.id).single();
    if (error || !data) return { ok: false };
    return { ok: true, uid: u.id, uidNo: data.uid_no || null, username: data.username, role: data.role, avatar: data.avatar_url };
  }

  /* ============ 文章 ============ */
  async function getArticles({ limit = 20, offset = 0, uid = null, sort = 'new' } = {}) {
    let q = SB.from('articles')
      .select('*, profiles!articles_uid_fkey(*), article_likes(count), article_favs(count)')
      .neq('status', 'deleted')
      .order(sort === 'hot' ? 'views' : 'created_at', { descending: true })
      .range(offset, offset + limit - 1);
    if (uid) q = q.eq('uid', uid);
    const { data, error } = await q;
    if (error) return errRes(error, { list: [] });
    return { ok: true, list: (data || []).map(a => ({
      id: a.id, title: a.title,
      author: (a.profiles && a.profiles.username) || '匿名',
      views: a.views || 0,
      likes: cnt(a.article_likes), favs: cnt(a.article_favs),
      chars: a.chars || 0, created_at: a.created_at
    })) };
  }

  // 文章详情（含正文 + 媒体 + 作者 + 当前用户互动状态）
  async function getArticle(id) {
    const u = await getCurrentUser();
    const { data, error } = await SB.from('articles')
      .select('*, profiles!articles_uid_fkey(*), article_media(file, sort)')
      .eq('id', id).single();
    if (error) return errRes(error);
    let likedByMe = false, favedByMe = false;
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

  async function getArticleComments(id) {
    const u = await getCurrentUser();
    const { data, error } = await SB.from('comments')
      .select('*, profiles!comments_uid_fkey(*), comment_likes(uid)')
      .eq('target_type', 'article').eq('target_id', id).eq('deleted', false)
      .order('created_at', { ascending: true }).limit(500);
    if (error) return { ok: false, list: [] };
    return { ok: true, list: (data || []).map(c => ({
      id: c.id, uid: c.uid, name: (c.profiles && c.profiles.username) || '匿名',
      content: c.content, text: c.content,          // 页面渲染读的是 text
      role: (c.profiles && c.profiles.role) || null,
      bio: (c.profiles && c.profiles.bio) || '',
      avatar: (c.profiles && c.profiles.avatar_url) || null,
      uidNo: (c.profiles && c.profiles.uid_no) || null,
      time: fmtTime(c.created_at), parent: c.parent_id || null,
      likes: (c.comment_likes || []).length,
      likedByMe: !!(u && (c.comment_likes || []).some(l => l.uid === u.id))
    })) };
  }

  async function toggleArticleLike(articleId) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data: ex } = await SB.from('article_likes').select('article_id').eq('article_id', articleId).eq('uid', u.id).maybeSingle();
    if (ex) { await SB.from('article_likes').delete().eq('article_id', articleId).eq('uid', u.id); }
    else { const { error } = await SB.from('article_likes').insert({ article_id: articleId, uid: u.id }); if (error) return errRes(error); }
    const { count } = await SB.from('article_likes').select('*', { count: 'exact', head: true }).eq('article_id', articleId);
    return { ok: true, on: !ex, count: count || 0 };
  }
  async function toggleArticleFav(articleId) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data: ex } = await SB.from('article_favs').select('article_id').eq('article_id', articleId).eq('uid', u.id).maybeSingle();
    if (ex) { await SB.from('article_favs').delete().eq('article_id', articleId).eq('uid', u.id); }
    else { const { error } = await SB.from('article_favs').insert({ article_id: articleId, uid: u.id }); if (error) return errRes(error); }
    const { count } = await SB.from('article_favs').select('*', { count: 'exact', head: true }).eq('article_id', articleId);
    return { ok: true, on: !ex, count: count || 0 };
  }
  async function reportArticle(articleId, reason) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { error } = await SB.from('reports').insert({ target_type: 'article', target_id: articleId, reporter_uid: u.id, reason });
    if (error) return errRes(error); return { ok: true };
  }
  async function deleteArticle(articleId) {
    const { error } = await SB.from('articles').delete().eq('id', articleId);
    if (error) return errRes(error); return { ok: true };
  }
  async function createArticle(title, html, chars) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data, error } = await SB.from('articles')
      .insert({ uid: u.id, title, content_html: html, chars: chars || 0 })
      .select('id').single();
    if (error) return errRes(error);
    return { ok: true, id: data.id };
  }
  async function updateArticle(id, title, html, chars) {
    const { error } = await SB.from('articles')
      .update({ title, content_html: html, chars: chars || 0, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return errRes(error);
    return { ok: true, id };
  }
  async function likedByArticles(uid) {
    const { data, error } = await SB.from('article_likes').select('article_id').eq('uid', uid);
    if (error) return { ok: false, ids: [] };
    return { ok: true, ids: (data || []).map(r => r.article_id) };
  }
  async function favedByArticles(uid) {
    const { data, error } = await SB.from('article_favs').select('article_id').eq('uid', uid);
    if (error) return { ok: false, ids: [] };
    return { ok: true, ids: (data || []).map(r => r.article_id) };
  }
  async function getLikedArticles(uid) {
    const { data, error } = await SB.from('article_likes').select('article_id').eq('uid', uid);
    if (error || !data.length) return { ok: true, list: [] };
    const ids = data.map(r => r.article_id);
    const { data: arts } = await SB.from('articles')
      .select('id, title, uid, views, article_likes(count), profiles!articles_uid_fkey(*)')
      .in('id', ids).neq('status', 'deleted');
    return { ok: true, list: (arts || []).map(a => ({
      id: a.id, title: a.title, author: (a.profiles && a.profiles.username) || '匿名',
      views: a.views || 0, likes: cnt(a.article_likes)
    })) };
  }
  async function getFavedArticles(uid) {
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

  async function toggleVideoLike(videoId) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data: ex } = await SB.from('video_likes').select('video_id').eq('video_id', videoId).eq('uid', u.id).maybeSingle();
    if (ex) { await SB.from('video_likes').delete().eq('video_id', videoId).eq('uid', u.id); }
    else { const { error } = await SB.from('video_likes').insert({ video_id: videoId, uid: u.id }); if (error) return errRes(error); }
    const { count } = await SB.from('video_likes').select('*', { count: 'exact', head: true }).eq('video_id', videoId);
    return { ok: true, on: !ex, count: count || 0 };
  }
  async function toggleVideoFav(videoId) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data: ex } = await SB.from('video_favs').select('video_id').eq('video_id', videoId).eq('uid', u.id).maybeSingle();
    if (ex) { await SB.from('video_favs').delete().eq('video_id', videoId).eq('uid', u.id); }
    else { const { error } = await SB.from('video_favs').insert({ video_id: videoId, uid: u.id }); if (error) return errRes(error); }
    const { count } = await SB.from('video_favs').select('*', { count: 'exact', head: true }).eq('video_id', videoId);
    return { ok: true, on: !ex, count: count || 0 };
  }
  async function reportVideo(videoId, reason) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { error } = await SB.from('reports').insert({ target_type: 'video', target_id: videoId, reporter_uid: u.id, reason });
    if (error) return errRes(error); return { ok: true };
  }
  async function deleteVideo(videoId) {
    const { error } = await SB.from('videos').delete().eq('id', videoId);
    if (error) return errRes(error); return { ok: true };
  }
  async function createVideo(title, description, videoPath, poster, duration) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data, error } = await SB.from('videos')
      .insert({
        uid: u.id, title, description,
        video_path: videoPath || null,
        poster: poster || null,
        duration: Number(duration) || 0
      })
      .select('id').single();
    if (error) return errRes(error);
    return { ok: true, id: data.id };
  }
  async function updateVideo(id, title, description, poster) {
    const patch = { title, description, updated_at: new Date().toISOString() };
    if (poster !== undefined) patch.poster = poster || null;
    const { error } = await SB.from('videos')
      .update(patch)
      .eq('id', id);
    if (error) return errRes(error);
    return { ok: true, id };
  }
  async function likedByVideos(uid) {
    const { data, error } = await SB.from('video_likes').select('video_id').eq('uid', uid);
    if (error) return { ok: false, ids: [] };
    return { ok: true, ids: (data || []).map(r => r.video_id) };
  }
  async function favedByVideos(uid) {
    const { data, error } = await SB.from('video_favs').select('video_id').eq('uid', uid);
    if (error) return { ok: false, ids: [] };
    return { ok: true, ids: (data || []).map(r => r.video_id) };
  }
  async function getLikedVideos(uid) {
    const { data, error } = await SB.from('video_likes').select('video_id').eq('uid', uid);
    if (error || !data.length) return { ok: true, list: [] };
    const ids = data.map(r => r.video_id);
    const { data: vs } = await SB.from('videos')
      .select('id, title, uid, views, video_likes(count), profiles!videos_uid_fkey(*)')
      .in('id', ids).neq('status', 'deleted');
    return { ok: true, list: (vs || []).map(v => ({
      id: v.id, title: v.title, author: (v.profiles && v.profiles.username) || '匿名',
      views: v.views || 0, likes: cnt(v.video_likes)
    })) };
  }
  async function getFavedVideos(uid) {
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
  async function postComment(targetType, targetId, content, parentId) {
    const u = await getCurrentUser(); if (!u) return errRes(null);
    const { data, error } = await SB.from('comments')
      .insert({ target_type: targetType, target_id: targetId, uid: u.id, content, parent_id: parentId || null })
      .select('*, profiles!comments_uid_fkey(*)').single();
    if (error) return errRes(error);
    return { ok: true, comment: { id: data.id, uid: data.uid, author: (data.profiles && data.profiles.username) || '匿名', content: data.content, time: data.created_at, likes: 0 } };
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
