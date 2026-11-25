/* ============================================================
   kardapolovstanislav.ru — публичный фронт
   Чистый vanilla JS, без библиотек.
   ============================================================ */
'use strict';

(function () {

  var TABS = ['home', 'about', 'business', 'blog', 'gallery', 'contacts'];
  var PAGE_SIZE = 9;

  var state = {
    content: { settings: {}, blocks: {} },
    blog: { inited: false, rubric: '', posts: [], total: 0, rubrics: [], loading: false },
    postCache: {},          // slug -> пост целиком
    gallery: { inited: false, items: [] },
    lightbox: { photos: [], index: 0 },
    currentTab: ''
  };

  function $(sel) { return document.querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return d.toLocaleDateString();
    }
  }

  function fetchJSON(url, opts) {
    return fetch(url, opts).then(function (r) {
      if (!r.ok) { var err = new Error('HTTP ' + r.status); err.status = r.status; throw err; }
      return r.json();
    });
  }

  /* ---------- счётчик посещений (fire-and-forget) ---------- */

  function trackVisit(path) { return;
    try {
      fetch('/api/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path })
      }).catch(function () {});
    } catch (e) { /* молчим */ }
  }

  /* ---------- появление при прокрутке ---------- */

  var revealObserver = ('IntersectionObserver' in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add('visible');
            revealObserver.unobserve(en.target);
          }
        });
      }, { rootMargin: '0px 0px -40px 0px', threshold: 0.08 })
    : null;

  function observeReveals(root) {
    $$('.reveal:not(.visible)', root || document).forEach(function (el) {
      if (revealObserver) revealObserver.observe(el);
      else el.classList.add('visible');
    });
  }

  /* ---------- распознавание embed-видео ---------- */

  function embedSrc(url) {
    var u = String(url || ''), m;
    // YouTube: watch / youtu.be / shorts / embed / live
    m = u.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1];
    // VK Видео: готовая embed-ссылка
    m = u.match(/(?:vk\.com|vkvideo\.ru)\/video_ext\.php\?([^#]+)/);
    if (m) return 'https://vk.com/video_ext.php?' + m[1];
    // VK Видео: vk.com/video-123_456, vkvideo.ru/video123_456, клипы
    m = u.match(/(?:vk\.com|vkvideo\.ru)\/(?:video|clip)(-?\d+)_(\d+)/);
    if (m) return 'https://vk.com/video_ext.php?oid=' + m[1] + '&id=' + m[2] + '&hd=2';
    // Rutube: rutube.ru/video/<hash> | /play/embed/<hash> | /shorts/<hash>
    m = u.match(/rutube\.ru\/(?:video|play\/embed|shorts)\/([0-9a-fA-F]{32})/);
    if (m) return 'https://rutube.ru/play/embed/' + m[1] + '/';
    return null;
  }

  function embedHTML(src) {
    return '<div class="embed"><iframe src="' + esc(src) + '" loading="lazy" ' +
      'allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" ' +
      'allowfullscreen></iframe></div>';
  }

  function isVideoFile(u) {
    return /\.(mp4|webm|mov|m4v)([?#]|$)/i.test(u);
  }

  // Универсальный рендер видео-источника: файл / embed / ссылка
  function videoHTML(url) {
    var u = String(url || '').trim();
    if (!u) return '';
    var em = embedSrc(u);
    if (em) return embedHTML(em);
    if (isVideoFile(u) || u.charAt(0) === '/') {
      return '<video class="video" controls preload="metadata" src="' + esc(u) + '"></video>';
    }
    return '<p><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + '</a></p>';
  }

  /* ---------- рендер из /api/content ---------- */

  function loadContent() {
    return fetchJSON('./content.json')
      .catch(function () { return fetchJSON('./content.json'); })
      .then(function (data) {
        state.content = data && typeof data === 'object' ? data : {};
        state.content.settings = state.content.settings || {};
        state.content.blocks = state.content.blocks || {};
      })
      .catch(function () {
        state.content = { settings: {}, blocks: {} };
      });
  }

  function setText(sel, value, fallback) {
    var el = $(sel);
    if (!el) return;
    var v = (value != null && String(value).trim() !== '') ? String(value) : (fallback || '');
    el.textContent = v;
    if (!v) el.setAttribute('hidden', '');
    else el.removeAttribute('hidden');
  }

  // тексты, которые должны оставаться видимыми даже при пустом значении в админке
  function setTextKeep(sel, value, fallback) {
    var el = $(sel);
    if (!el) return;
    var v = (value != null && String(value).trim() !== '') ? String(value) : (fallback || '');
    if (v) el.textContent = v;
  }

  function renderSettings() {
    var s = state.content.settings || {};
    var siteName = s.site_name || 'Станислав Кардаполов';

    if (s.browser_title && String(s.browser_title).trim()) {
      document.title = String(s.browser_title).trim();
    }

    setText('#logo-name', siteName);
    setText('#hero-title', s.hero_title || siteName);
    setText('#hero-subtitle', s.hero_subtitle || '');
    setText('#hero-overline', s.hero_overline || '');

    // пункты меню (и они же — подписи вкладок)
    setTextKeep('.nav a[data-tab="home"]', s.nav_home, 'Главная');
    setTextKeep('.nav a[data-tab="about"]', s.nav_about, 'Обо мне');
    setTextKeep('.nav a[data-tab="business"]', s.nav_business, 'Бизнес');
    setTextKeep('.nav a[data-tab="blog"]', s.nav_blog, 'Блог');
    setTextKeep('.nav a[data-tab="gallery"]', s.nav_gallery, 'Галерея');
    setTextKeep('.nav a[data-tab="contacts"]', s.nav_contacts, 'Контакты');

    // кнопки первого экрана
    setTextKeep('#hero-btn-about', s.hero_btn_about, 'Обо мне');
    setTextKeep('#hero-btn-contacts', s.hero_btn_contacts, 'Связаться');

    // карточки на главной
    setTextKeep('#home-card-about-title', s.home_card_about_title, 'Обо мне');
    setTextKeep('#home-card-business-title', s.home_card_business_title, 'Бизнес');
    setTextKeep('#home-card-blog-title', s.home_card_blog_title, 'Блог');
    setTextKeep('#home-card-about-link', s.home_card_about_link, 'Подробнее');
    setTextKeep('#home-card-business-link', s.home_card_business_link, 'Подробнее');
    setTextKeep('#home-card-blog-link', s.home_card_blog_link, 'Читать');

    // надписи и заголовки разделов
    setTextKeep('#about-overline', s.about_overline, 'Личное');
    setTextKeep('#about-heading', s.about_heading, 'Обо мне');
    setTextKeep('#business-overline', s.business_overline, 'Дело');
    setTextKeep('#business-heading', s.business_heading, 'Бизнес');
    setTextKeep('#blog-overline', s.blog_overline, 'Записи');
    setTextKeep('#blog-heading', s.blog_heading, 'Блог');
    setTextKeep('#gallery-overline', s.gallery_overline, 'Моменты');
    setTextKeep('#gallery-heading', s.gallery_heading, 'Галерея');
    setTextKeep('#contacts-overline', s.contacts_overline, 'Связь');
    setTextKeep('#contacts-heading', s.contacts_heading, 'Контакты');

    // служебные надписи блога и галереи
    setTextKeep('#blog-back-label', s.blog_back_label, 'Все записи');
    setTextKeep('#blog-more', s.blog_more_label, 'Показать ещё');
    setTextKeep('#blog-empty', s.blog_empty_text, '');
    setTextKeep('#gallery-empty', s.gallery_empty_text, '');
    setTextKeep('#footer-top-label', s.footer_top_label, 'Наверх');

    var quote = (s.hero_quote || '').trim();
    var quoteEl = $('#hero-quote');
    if (quoteEl) {
      if (quote) {
        $('#hero-quote-text').textContent = quote;
        quoteEl.removeAttribute('hidden');
      } else {
        quoteEl.setAttribute('hidden', '');
      }
    }

    var photo = $('#hero-photo');
    if (photo && s.hero_photo) photo.src = s.hero_photo;

    setText('#about-intro', s.about_intro || '');
    setText('#business-intro', s.business_intro || '');
    setText('#blog-intro', s.blog_intro || '');
    setText('#gallery-intro', s.gallery_intro || '');
    setText('#contacts-intro', s.contacts_intro || '');

    setText('#home-card-about', s.about_intro || 'Путь, ценности и то, что стоит за делом.');
    setText('#home-card-business', s.business_intro || 'Грузоперевозки и предпринимательство с 2014 года.');
    setText('#home-card-blog', s.blog_intro || 'Заметки о бизнесе, мыслях и жизни.');

    setText('#footer-text', s.footer_text || ('© ' + new Date().getFullYear() + ' ' + siteName));
  }

  function blockHTML(block, index) {
    var title = block.title ? '<h3 class="block-title">' + esc(block.title) + '</h3>' : '';
    var body = block.body ? '<div class="rich">' + block.body + '</div>' : '';
    var media = String(block.media_url || '').trim();

    switch (block.type) {
      case 'image':
        return '<figure class="block block-image reveal">' +
          (media ? '<img src="' + esc(media) + '" alt="' + esc(block.title || '') + '" loading="lazy">' : '') +
          (block.title ? '<figcaption>' + esc(block.title) + '</figcaption>' : '') +
          body +
          '</figure>';

      case 'video':
        return '<div class="block block-video reveal">' + title + videoHTML(media) + body + '</div>';

      case 'text_image':
        return '<div class="block block-text-image reveal' + (index % 2 === 1 ? ' flip' : '') + '">' +
          '<div class="bti-media">' +
            (media ? '<img src="' + esc(media) + '" alt="' + esc(block.title || '') + '" loading="lazy">' : '') +
          '</div>' +
          '<div class="bti-text">' + title + body + '</div>' +
          '</div>';

      default: // 'text'
        return '<div class="block block-text reveal">' + title + body + '</div>';
    }
  }

  function renderBlocks(section, containerSel) {
    var container = $(containerSel);
    if (!container) return;
    var blocks = (state.content.blocks && state.content.blocks[section]) || [];
    container.innerHTML = blocks.map(blockHTML).join('');
    observeReveals(container);
  }

  function renderContent() {
    renderSettings();
    renderBlocks('about', '#about-blocks');
    renderBlocks('business', '#business-blocks');
    renderBlocks('contacts', '#contacts-blocks');
    observeReveals();
  }

  /* ---------- блог: список ---------- */

  function loadPosts(reset) {
    var b = state.blog;
    if (b.loading) return Promise.resolve();
    b.loading = true;
    if (reset) { b.posts = []; b.total = 0; }

    var loadingEl = $('#blog-loading');
    var moreBtn = $('#blog-more');
    if (loadingEl) loadingEl.removeAttribute('hidden');
    if (moreBtn) moreBtn.setAttribute('hidden', '');

    var params = new URLSearchParams({ offset: String(b.posts.length), limit: String(PAGE_SIZE) });
    if (b.rubric) params.set('rubric', b.rubric);

    return fetchJSON('./posts.json').then(function(data) { var rows=data.posts || []; if(b.rubric) rows=rows.filter(function(p){return p.rubric===b.rubric;}); return {total:rows.length,rubrics:data.rubrics,posts:rows.slice(b.posts.length,b.posts.length+PAGE_SIZE)}; })
      .then(function (data) {
        b.total = data.total || 0;
        b.rubrics = Array.isArray(data.rubrics) ? data.rubrics : b.rubrics;
        b.posts = b.posts.concat(Array.isArray(data.posts) ? data.posts : []);
        renderRubrics();
        renderPostGrid();
      })
      .catch(function () {
        var empty = $('#blog-empty');
        if (empty && b.posts.length === 0) {
          empty.textContent = 'Не удалось загрузить записи. Попробуйте обновить страницу.';
          empty.removeAttribute('hidden');
        }
      })
      .then(function () {
        b.loading = false;
        if (loadingEl) loadingEl.setAttribute('hidden', '');
      });
  }

  function renderRubrics() {
    var wrap = $('#blog-rubrics');
    if (!wrap) return;
    var b = state.blog;
    var html = '<button type="button" class="rubric-btn' + (b.rubric === '' ? ' active' : '') + '" data-rubric="">Все</button>';
    (b.rubrics || []).forEach(function (r) {
      html += '<button type="button" class="rubric-btn' + (b.rubric === r ? ' active' : '') + '" data-rubric="' + esc(r) + '">' + esc(r) + '</button>';
    });
    wrap.innerHTML = html;
  }

  function postCardHTML(p) {
    var cover = p.cover_url
      ? '<img src="' + esc(p.cover_url) + '" alt="' + esc(p.title) + '" loading="lazy">'
      : '<div class="post-cover-placeholder" aria-hidden="true">«»</div>';
    return '<a class="post-card reveal" href="#blog/' + encodeURIComponent(p.slug) + '">' +
      '<div class="post-cover">' + cover + '</div>' +
      '<div class="post-card-body">' +
        '<div class="post-meta">' +
          (p.rubric ? '<span class="rubric-chip">' + esc(p.rubric) + '</span>' : '') +
          '<time datetime="' + esc(p.created_at || '') + '">' + esc(fmtDate(p.created_at)) + '</time>' +
        '</div>' +
        '<h3>' + esc(p.title) + '</h3>' +
        '<p class="post-excerpt">' + esc(p.excerpt || '') + '</p>' +
      '</div>' +
    '</a>';
  }

  function renderPostGrid() {
    var b = state.blog;
    var grid = $('#blog-grid');
    var empty = $('#blog-empty');
    var moreBtn = $('#blog-more');
    if (!grid) return;

    grid.innerHTML = b.posts.map(postCardHTML).join('');
    observeReveals(grid);

    if (empty) {
      if (b.posts.length === 0) {
        var s = state.content.settings || {};
        empty.textContent = s.blog_empty_text || 'Записей пока нет — загляните позже.';
        empty.removeAttribute('hidden');
      } else {
        empty.setAttribute('hidden', '');
      }
    }
    if (moreBtn) {
      if (b.posts.length < b.total) moreBtn.removeAttribute('hidden');
      else moreBtn.setAttribute('hidden', '');
    }
  }

  function initBlog() {
    if (state.blog.inited) return;
    state.blog.inited = true;
    loadPosts(true);
  }

  /* ---------- блог: страница поста ---------- */

  function renderPost(post) {
    var wrap = $('#post-body-wrap');
    if (!wrap) return;
    wrap.innerHTML =
      '<div class="post-full">' +
        '<h1 class="post-full-title">' + esc(post.title) + '</h1>' +
        '<div class="post-full-meta">' +
          (post.rubric ? '<span class="rubric-chip">' + esc(post.rubric) + '</span>' : '') +
          '<time datetime="' + esc(post.created_at || '') + '">' + esc(fmtDate(post.created_at)) + '</time>' +
        '</div>' +
        (post.cover_url ? '<img class="post-full-cover" src="' + esc(post.cover_url) + '" alt="' + esc(post.title) + '">' : '') +
        '<div class="gold-hairline"></div>' +
        '<div class="rich">' + (post.body || '') + '</div>' +
      '</div>';
  }

  function showPost(slug) {
    var listView = $('#blog-list-view');
    var postView = $('#blog-post-view');
    var wrap = $('#post-body-wrap');
    if (listView) listView.setAttribute('hidden', '');
    if (postView) postView.removeAttribute('hidden');

    if (state.postCache[slug]) {
      renderPost(state.postCache[slug]);
      return;
    }
    if (wrap) wrap.innerHTML = '<p class="loading-note">Загрузка…</p>';

    fetchJSON('./posts.json').then(function(data){var p=data.posts.find(function(p){return p.slug===slug;}); if(!p){var e=new Error('Not found');e.status=404;throw e;}return p;})
      .then(function (post) {
        state.postCache[slug] = post;
        renderPost(post);
      })
      .catch(function (err) {
        if (!wrap) return;
        wrap.innerHTML = '<p class="empty-note">' +
          (err && err.status === 404 ? 'Запись не найдена.' : 'Не удалось загрузить запись.') +
          '</p>';
      });
  }

  function showBlogList() {
    var listView = $('#blog-list-view');
    var postView = $('#blog-post-view');
    if (postView) postView.setAttribute('hidden', '');
    if (listView) listView.removeAttribute('hidden');
  }

  /* ---------- галерея ---------- */

  function galleryItemHTML(item, photoIndex) {
    var caption = String(item.caption || '');
    if (item.kind === 'photo') {
      return '<figure class="g-item reveal">' +
        '<div class="g-photo" data-photo-index="' + photoIndex + '" role="button" tabindex="0" ' +
          'aria-label="Открыть фото' + (caption ? ': ' + esc(caption) : '') + '">' +
          '<img src="' + esc(item.url) + '" alt="' + esc(caption) + '" loading="lazy">' +
          (caption ? '<span class="g-overlay">' + esc(caption) + '</span>' : '') +
        '</div>' +
        '</figure>';
    }
    if (item.kind === 'video') {
      return '<figure class="g-item g-wide reveal">' +
        '<video class="video" controls preload="metadata" src="' + esc(item.url) + '"></video>' +
        (caption ? '<figcaption class="g-caption">' + esc(caption) + '</figcaption>' : '') +
        '</figure>';
    }
    // embed
    var em = embedSrc(item.url);
    var inner = em
      ? embedHTML(em)
      : '<p style="padding:18px"><a href="' + esc(item.url) + '" target="_blank" rel="noopener">' + esc(item.url) + '</a></p>';
    return '<figure class="g-item g-wide reveal">' + inner +
      (caption ? '<figcaption class="g-caption">' + esc(caption) + '</figcaption>' : '') +
      '</figure>';
  }

  function renderGallery() {
    var grid = $('#gallery-grid');
    var empty = $('#gallery-empty');
    if (!grid) return;

    var items = state.gallery.items;
    state.lightbox.photos = items.filter(function (it) { return it.kind === 'photo'; });

    var photoIdx = -1;
    grid.innerHTML = items.map(function (it) {
      if (it.kind === 'photo') photoIdx++;
      return galleryItemHTML(it, photoIdx);
    }).join('');
    observeReveals(grid);

    if (empty) {
      if (items.length === 0) empty.removeAttribute('hidden');
      else empty.setAttribute('hidden', '');
    }
  }

  function initGallery() {
    if (state.gallery.inited) return;
    state.gallery.inited = true;

    var loading = $('#gallery-loading');
    if (loading) loading.removeAttribute('hidden');

    fetchJSON('./gallery.json')
      .then(function (items) {
        state.gallery.items = Array.isArray(items) ? items : [];
        renderGallery();
      })
      .catch(function () {
        var empty = $('#gallery-empty');
        if (empty) {
          empty.textContent = 'Не удалось загрузить галерею.';
          empty.removeAttribute('hidden');
        }
      })
      .then(function () {
        if (loading) loading.setAttribute('hidden', '');
      });
  }

  /* ---------- лайтбокс ---------- */

  function openLightbox(index) {
    var photos = state.lightbox.photos;
    if (!photos.length) return;
    state.lightbox.index = ((index % photos.length) + photos.length) % photos.length;

    var item = photos[state.lightbox.index];
    $('#lb-img').src = item.url;
    $('#lb-img').alt = item.caption || '';
    $('#lb-caption').textContent = item.caption || '';

    var single = photos.length < 2;
    $('#lb-prev').style.display = single ? 'none' : '';
    $('#lb-next').style.display = single ? 'none' : '';

    $('#lightbox').removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    $('#lightbox').setAttribute('hidden', '');
    $('#lb-img').src = '';
    document.body.style.overflow = '';
  }

  function stepLightbox(delta) {
    openLightbox(state.lightbox.index + delta);
  }

  function bindLightbox() {
    var lb = $('#lightbox');
    $('#lb-close').addEventListener('click', closeLightbox);
    $('#lb-prev').addEventListener('click', function () { stepLightbox(-1); });
    $('#lb-next').addEventListener('click', function () { stepLightbox(1); });
    lb.addEventListener('click', function (e) {
      if (e.target === lb) closeLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (lb.hasAttribute('hidden')) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
      else if (e.key === 'ArrowRight') stepLightbox(1);
    });

    // делегирование кликов по фото галереи
    $('#gallery-grid').addEventListener('click', function (e) {
      var ph = e.target.closest('.g-photo');
      if (ph) openLightbox(parseInt(ph.getAttribute('data-photo-index'), 10) || 0);
    });
    $('#gallery-grid').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var ph = e.target.closest('.g-photo');
      if (ph) {
        e.preventDefault();
        openLightbox(parseInt(ph.getAttribute('data-photo-index'), 10) || 0);
      }
    });
  }

  /* ---------- роутер по location.hash ---------- */

  function parseHash() {
    var h = location.hash || '#home';
    var m = h.match(/^#blog\/(.+)$/);
    if (m) return { tab: 'blog', slug: decodeURIComponent(m[1]) };
    var t = h.replace(/^#/, '');
    return { tab: TABS.indexOf(t) !== -1 ? t : 'home', slug: null };
  }

  function activateTab(tab, slug) {
    TABS.forEach(function (t) {
      var sec = $('#tab-' + t);
      if (!sec) return;
      if (t === tab) {
        sec.removeAttribute('hidden');
        // перезапуск анимации появления вкладки
        sec.classList.remove('active');
        void sec.offsetWidth;
        sec.classList.add('active');
      } else {
        sec.setAttribute('hidden', '');
        sec.classList.remove('active');
      }
    });

    $$('.nav a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-tab') === tab);
    });

    closeNav();

    if (tab === 'blog') {
      initBlog();
      if (slug) showPost(slug);
      else showBlogList();
    } else if (tab === 'gallery') {
      initGallery();
    }

    if (state.currentTab !== tab || slug) window.scrollTo({ top: 0, behavior: 'auto' });
    state.currentTab = tab;
    observeReveals();
  }

  function route() {
    var r = parseHash();
    activateTab(r.tab, r.slug);
    trackVisit(location.hash || '#home');
  }

  /* ---------- бургер-меню ---------- */

  function closeNav() {
    var nav = $('#nav'), burger = $('#burger');
    nav.classList.remove('open');
    burger.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
  }

  function bindNav() {
    var nav = $('#nav'), burger = $('#burger');
    burger.addEventListener('click', function () {
      var open = !nav.classList.contains('open');
      nav.classList.toggle('open', open);
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeNav();
    });
    document.addEventListener('click', function (e) {
      if (!nav.classList.contains('open')) return;
      if (!e.target.closest('#nav') && !e.target.closest('#burger')) closeNav();
    });
  }

  /* ---------- события блога ---------- */

  function bindBlog() {
    $('#blog-rubrics').addEventListener('click', function (e) {
      var btn = e.target.closest('.rubric-btn');
      if (!btn) return;
      var rubric = btn.getAttribute('data-rubric') || '';
      if (rubric === state.blog.rubric) return;
      state.blog.rubric = rubric;
      renderRubrics();
      loadPosts(true);
    });
    $('#blog-more').addEventListener('click', function () {
      loadPosts(false);
    });
  }

  /* ---------- старт ---------- */

  function bindFooterTop() {
    var link = $('#footer-top');
    if (!link) return;
    link.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function init() {
    bindNav();
    bindBlog();
    bindLightbox();
    bindFooterTop();

    loadContent().then(function () {
      renderContent();
      route();
    });

    window.addEventListener('hashchange', route);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
