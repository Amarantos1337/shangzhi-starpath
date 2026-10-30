(function () {
  'use strict';
  const { data, store } = window.StarPath;
  const main = document.getElementById('main');
  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modal-content');
  const fileInput = document.getElementById('backup-file');
  const filters = { query: '', field: 'all', direction: 'all', favorites: false };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const arrowAnimationStates = new WeakMap();
  const arrowActionSelector = '.header-action,[data-arrow-action]';
  const arrowDirections = {
    arrow: [95, 0, '1.14s'], chevron: [95, 0, '1.14s'], back: [-95, 0, '1.14s'],
    upRight: [85, -85, '1.02s'], down: [0, 95, '1.14s'],
    download: [0, 95, '1.14s'], upload: [0, -95, '1.14s']
  };
  const readingAnimations = new Map();
  const alumniMotionDuration = 440;
  const alumniNavigationSession = Date.now().toString(36) + Math.random().toString(36).slice(2);
  let alumniHistoryEntry = null;
  let pendingAlumniNavigation = null;
  let alumniTransition = null;
  // The hash router owns scrolling, including restoration to a source card.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  let current = { page: 'home' };
  let renderedRoute = null;
  let pageSnapshot = null;
  let pageSnapshotTimer;
  let historyNavigationTimer = null;
  let historyNavigationLink = null;
  let historyScreenFill = null;
  let historyScreenFillTimer = null;
  let historyTransitionPending = false;
  let historyPrepareObserver = null;
  let historyRevealObserver = null;
  let historyTitleTimer = null;
  let historyTitleHeading = null;
  let modalReturnFocus = null;
  let toastTimer;
  let pendingImport = null;
  let importRequestId = 0;
  let aiProfile = null;
  let aiDraft = null;
  let aiRequest = null;
  let aiTimer = null;
  const icons = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    upRight: '<path d="M6 18 18 6M6 6h12v12"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v6m-4 2h8M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4"/>',
    book: '<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1v14"/>',
    briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12l9 3 9-3m-9 1v4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    down: '<path d="m5 9 7 7 7-7"/>',
    back: '<path d="m12 5-7 7 7 7M5 12h14"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 15v5h16v-5"/>',
    edit: '<path d="m14 5 5 5M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14v6Z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>',
    shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>'
  };
  const icon = (name, extra = '') => '<svg class="icon ' + extra + '"' + (arrowDirections[name] ? ' data-arrow-kind="' + name + '"' : '') + ' width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] || icons.spark) + '</svg>';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const personById = id => data.alumni.find(item => item.id === id);
  const routeById = id => data.routes.find(item => item.id === id);
  const tags = values => values.map(value => '<span class="tag">' + esc(value) + '</span>').join('');
  const eyebrow = text => '<div class="eyebrow"><span></span>' + text + '</div>';
  const sectionHead = (kicker, title, subtitle, link = '') => '<div class="section-heading"><div><div class="section-kicker">' + kicker + '</div><h2>' + title + '</h2>' + (subtitle ? '<p>' + subtitle + '</p>' : '') + '</div>' + link + '</div>';
  function shineContent(label) {
    const text = '<span>' + esc(label) + '</span>';
    const arrow = icon('arrow');
    return '<span class="button-shine-content">' + text + arrow + '<span class="button-shine-glow" aria-hidden="true"><span class="button-shine-overlay">' + text + arrow + '</span></span></span>';
  }
  function toast(message) {
    const target = document.getElementById('toast');
    target.textContent = message;
    target.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => target.classList.remove('visible'), 4200);
  }
  function saved(persisted, message) { toast(persisted ? message : message + '（仅本次打开有效，请导出备份）'); }
  function prepareCodeBlocks() {
    main.querySelectorAll('pre').forEach(pre => {
      const text = pre.querySelector('code') || pre;
      text.textContent = text.textContent.trimEnd();
      const wrapper = document.createElement('div');
      wrapper.className = 'copyable-code';
      pre.before(wrapper);
      wrapper.append(pre);
      if (pre.hasAttribute('data-no-copy')) {
        wrapper.classList.add('code-display-only');
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy-button';
      button.dataset.action = 'copy-code';
      button.textContent = '复制';
      button.setAttribute('aria-label', '复制代码或命令');
      wrapper.append(button);
    });
  }
  function copyCodeFallback(text) {
    const focused = document.activeElement;
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.append(input);
    try {
      input.focus({ preventScroll: true });
      input.select();
      return document.execCommand('copy');
    } finally {
      input.remove();
      if (focused && focused.isConnected) focused.focus({ preventScroll: true });
    }
  }
  async function copyCode(button) {
    if (button.dataset.copying) return;
    const pre = button.closest('.copyable-code').querySelector('pre');
    const text = (pre.querySelector('code') || pre).textContent;
    button.dataset.copying = 'true';
    try {
      let copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(text); copied = true; }
        catch (_) { /* 直接打开文件或剪贴板权限受限时尝试本地复制。 */ }
      }
      if (!copied) copied = copyCodeFallback(text);
      if (!copied) throw new Error('未能复制，请选中文本后手动复制。');
      button.textContent = '已复制';
      toast('已复制到剪贴板');
      setTimeout(() => { if (button.isConnected) button.textContent = '复制'; }, 2000);
    } catch (error) {
      toast(error.message || '未能复制，请选中文本后手动复制。');
    } finally {
      delete button.dataset.copying;
    }
  }
  function notice() {
    const target = document.getElementById('storage-notice');
    const status = store.status();
    target.hidden = status === 'persistent';
    if (status === 'damaged') target.innerHTML = '<span>' + icon('info') + '本机旧记录暂时无法读取，原始内容已保留。当前修改仅在本次打开有效，请及时导出备份。</span><button class="text-button" data-action="export-raw">下载原始记录</button>';
    else if (status === 'session') target.textContent = '本页记录暂未保存到本机，浏览器存储可能不可用或已在其他页面变更。离开页面前，请到“我的成长”导出备份；关闭后本次进度可能丢失。';
  }
  function favoriteButton(person) {
    const active = store.get().favorites.includes(person.id);
    return '<button class="icon-button favorite-button ' + (active ? 'is-favorite' : '') + '" data-action="favorite" data-person="' + person.id + '" aria-pressed="' + active + '" aria-label="' + (active ? '取消收藏' : '收藏') + person.name + '" title="' + (active ? '取消收藏' : '收藏校友') + '">' + icon('star') + '</button>';
  }
  function portrait(person, big = false) {
    if (person.photo) {
      const photo = person.photo;
      return '<div class="portrait portrait-photo photo-' + esc(photo.style) + (big ? ' portrait-large' : '') + '"><img src="' + esc(photo.src) + '" alt="' + esc(photo.alt) + '" style="object-position:' + esc(photo.position) + '" decoding="async"' + (big ? '' : ' loading="lazy"') + '><span class="photo-caption" aria-hidden="true">' + (photo.caption ? esc(photo.caption) : photo.style === 'event' ? '讲座现场' : photo.style === 'work' ? '工作中的校友' : '校友肖像') + '<span>人物档案 / ' + person.number + '</span></span></div>';
    }
    return '<div class="portrait portrait-' + person.color + (big ? ' portrait-large' : '') + '" aria-hidden="true"><span class="portrait-top">' + (person.photoNote ? esc(person.photoNote) : 'SHANGZHI ALUMNI') + '</span><span class="portrait-number">' + person.number + '</span><div class="portrait-orbit orbit-one"></div><div class="portrait-orbit orbit-two"></div><span class="portrait-initial">' + person.initial + '</span><span class="portrait-spark">✦</span><span class="portrait-bottom">' + esc(person.field) + '<span>人物档案 / ' + person.number + '</span></span></div>';
  }
  function personThumbnail(person) {
    return '<span class="person-initial-small portrait-' + person.color + '" aria-hidden="true">' + (person.photo ? '<img src="' + esc(person.photo.src) + '" alt="" style="object-position:' + esc(person.photo.position) + '" loading="lazy">' : person.initial) + '</span>';
  }
  function photoCredit(person) {
    if (!person.photo) return '<p class="photo-credit">' + esc(person.photoNote || '姓名图形卡片') + '</p>';
    return '<p class="photo-credit">图片来源：<a href="' + esc(person.photo.source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(person.photo.credit) + icon('upRight') + '</a><span>' + esc(person.photo.source.date) + ' · 原图呈现</span>' + (person.photo.note ? '<span>' + esc(person.photo.note) + '</span>' : '') + '</p>';
  }
  function personCard(person) {
    return '<article class="person-card" data-alumni-id="' + person.id + '"><div class="person-cover"><a href="#/alumni/' + person.id + '" tabindex="-1" aria-hidden="true">' + portrait(person) + '</a>' + favoriteButton(person) + '</div><div class="person-content"><div class="person-name-row"><h3><a href="#/alumni/' + person.id + '">' + person.name + '</a></h3><span class="cohort">' + person.cohort + '</span></div><p class="person-role">' + person.role + '</p><div class="tags">' + tags(person.tags) + '</div><a class="card-link" href="#/alumni/' + person.id + '">阅读成长故事' + icon('upRight') + '</a></div></article>';
  }
  function routeCard(route, number) {
    return '<article class="route-card route-' + route.color + '"><div class="route-card-top"><span class="route-icon">' + icon(route.icon) + '</span><span class="route-index">PATH / 0' + (number + 1) + '</span></div><h3><a href="#/paths/' + route.id + '">' + route.name + '</a></h3><p>' + route.subtitle + '</p><div class="route-meta"><span>' + route.stages.length + ' 个阶段 · ' + taskCount(route) + ' 项任务</span><span>·</span><span>' + route.duration + '</span></div><a href="#/paths/' + route.id + '" class="card-link"><span class="route-link-label">探索这条路线</span>' + icon('arrow') + '</a></article>';
  }
  function pathsRouteCard(route, number) {
    if (route.id !== 'education') return routeCard(route, number);
    const stages = route.stages.map((stage, index) => '<li><div class="education-stage-heading"><span class="education-stage-number">0' + (index + 1) + '</span><span>' + esc(stage.period) + '</span></div><h4>' + esc(stage.title) + '</h4><p>' + esc(stage.tasks[0]) + '</p></li>').join('');
    const outcomes = route.outcome.split(' · ').map(outcome => '<li>' + icon('check') + esc(outcome) + '</li>').join('');
    return '<article class="route-card route-sand education-feature"><div class="education-feature-body"><div class="education-overview"><div class="route-card-top"><span class="route-icon">' + icon(route.icon) + '</span><span class="route-index">PATH / 0' + (number + 1) + '</span></div><h3><a href="#/paths/' + esc(route.id) + '">' + esc(route.name) + '</a></h3><p class="education-subtitle">' + esc(route.subtitle) + '</p><p class="education-description">' + esc(route.description) + '</p><div class="education-meta"><span>' + esc(route.duration) + '</span><span>' + route.stages.length + ' 个阶段 · ' + taskCount(route) + ' 项任务</span></div><p class="education-audience"><strong>适合你，如果</strong>' + esc(route.audience) + '</p></div><section class="education-roadmap" aria-label="升学深造四阶段安排"><div class="education-roadmap-heading"><span class="section-kicker">一步一步，走稳当下</span><span>建议节奏 · 可按需调整</span></div><ol class="education-stages">' + stages + '</ol></section></div><div class="education-feature-footer"><div class="education-results"><strong>这一轮，留下四份积累</strong><ul>' + outcomes + '</ul><p>' + esc(route.effort) + '。平台学习建议。</p></div><div class="education-actions"><a class="button primary" href="#/paths/' + esc(route.id) + '">探索这条路线' + icon('arrow') + '</a><button class="button secondary" data-action="create-plan" data-template="' + esc(route.id) + '">' + icon('plus') + '创建学习计划</button></div></div></article>';
  }
  function historyEntries(entries = data.anniversary.history) {
    return entries.map(event => '<li class="history-entry"><span class="history-year">' + esc(event.year) + '</span><div><h3>' + esc(event.title) + '</h3><p>' + esc(event.text) + '</p>' + sourceLink(event.source) + '</div></li>').join('');
  }
  function tributeSection() {
    return '<section class="section tribute-section" aria-labelledby="tribute-title" hidden><div class="section-heading"><div><div class="eyebrow"><span></span>以成长，致母校</div><h2 id="tribute-title">把一份心意，变成三个行动。</h2><p>从了解母校，到认识榜样，再到完成自己的作品。</p></div></div><ol class="tribute-grid">' + data.anniversary.tribute.tasks.map((task, index) => '<li class="tribute-card"><div class="tribute-card-top">' + icon(task.icon) + '<span>0' + (index + 1) + '</span></div><h3>' + esc(task.stage) + '</h3><p>' + esc(task.description) + '</p><a class="card-link" href="' + esc(task.href) + '">' + esc(task.link) + icon('arrow') + '</a></li>').join('') + '</ol><div class="tribute-bottom"><div><strong>你的下一步，也是商职的新一页。</strong><p>行动为平台建议，完成情况由你自行记录；计划保存在本机。</p></div><a class="button primary" href="index.html#/paths">选择成长计划' + icon('arrow') + '</a></div></section>';
  }
  function home() {
    const anniversary = data.anniversary;
    const educationIndex = data.routes.findIndex(route => route.id === 'education');
    return '<div class="container home-page anniversary-home"><section class="anniversary-hero"><div class="anniversary-copy">' + eyebrow('商职星途 · 九秩校庆专题') + '<div class="anniversary-years">' + esc(anniversary.years) + '<span>薪火相传 · 共赴新程</span></div><h1>' + esc(anniversary.title) + '<br><span>' + esc(anniversary.subtitle) + '</span></h1><p class="anniversary-description">' + esc(anniversary.description) + '</p><div class="hero-actions"><a class="button primary" href="#/history" data-history-entry data-history-fill aria-label="回望校史">' + shineContent('回望校史') + '</a><a class="button secondary" href="index.html#/paths">选择成长计划' + icon('spark') + '</a></div><p class="anniversary-signature"><span></span>回望来路，让每一份成长续写荣光。</p></div><figure class="anniversary-visual"><img src="assets/anniversary-90.svg" width="650" height="580" alt="金色数字90、年轮与向上生长的线条，纪念1936至2026九秩商职"><figcaption>九十载弦歌不辍，一代代向新而行。</figcaption></figure></section><div class="anniversary-index"><span>九秩回响 <small>A SHARED JOURNEY</small></span><a href="#/history" data-history-entry>01 回望校史' + icon('upRight') + '</a><a href="#/alumni">02 走近校友' + icon('upRight') + '</a><a href="#/paths">03 传承成长' + icon('upRight') + '</a></div>' +
      '<section class="section history-preview">' + sectionHead('THE YEARS THAT SHAPED US', '循着年轮，读懂来路', '从商科起点到职业本科，回望九秩发展中的重要坐标。', '<a class="text-link" href="#/history">走进九秩校史' + icon('arrow') + '</a>') + '<ol class="history-grid">' + historyEntries(data.anniversary.history.filter(event => event.featured)) + '</ol></section>' +
      '<section class="section">' + sectionHead('OUR PEOPLE, OUR STORIES', '岁月有光，校友有故事', '走近真实的商职校友，在他们的足迹里看见成长的力量。', '<a class="text-link" href="#/alumni">探索全部校友' + icon('arrow') + '</a>') + '<div class="people-grid">' + data.alumni.map(personCard).join('') + '</div></section>' +
      '<section class="section routes-section">' + sectionHead('CARRY THE SPIRIT FORWARD', '薪火相传，从你的下一步开始', '把榜样带来的启发，变成可以行动的成长路线。', '<a class="text-link" href="#/paths">进入成长传承' + icon('arrow') + '</a>') + '<div class="route-grid route-grid-large">' + pathsRouteCard(data.routes[educationIndex], educationIndex) + '</div><p class="template-note">' + icon('info') + '路线为平台学习建议，可按自己的节奏调整，不代表校友本人经历或承诺。</p></section>' + tributeSection() + '</div>';
  }
  function historyPage() {
    const anniversary = data.anniversary;
    return '<div class="container inner-page history-page"><div class="history-intro"><div class="page-heading">' + eyebrow('九秩校史 · 回望来路') + '<h1>九秩薪火，照亮新的出发。</h1><p>沿着公开资料留下的坐标，认识母校的来路，也找到与自己有关的那一页。</p></div><div class="history-heading-art"><span>' + esc(anniversary.years) + '</span><p>历史有出处，成长有回响。</p></div></div><section class="section"><ol class="history-timeline">' + historyEntries() + '</ol></section><section class="commemoration"><div class="commemoration-year">' + esc(anniversary.theme.year) + '</div><div><h2>' + esc(anniversary.theme.title) + '</h2><p>' + esc(anniversary.theme.text) + '</p></div></section><section class="history-next"><div><span class="section-kicker">从母校的来路，走向自己的星途</span><h2>故事仍在继续，下一页有你。</h2><p>读一段校友经历，完成一份实践作品，让心意落在今天的行动里。</p></div><div class="hero-actions"><a class="button secondary" href="#/alumni" aria-label="走近校友故事">' + shineContent('走近校友故事') + '</a><a class="button primary" href="index.html#/paths">选择成长计划' + icon('spark') + '</a></div><p class="template-note">献礼行动为平台建议，完成情况由用户自行记录。</p></section></div>';
  }
  function alumniPage() {
    const fields = [...new Set(data.alumni.map(person => person.field))];
    return '<div class="container inner-page"><div class="page-heading">' + eyebrow('ALUMNI STORIES / 校友风采') + '<h1>商职走出的身影，照亮新的星途。</h1><p>在九秩校庆的相聚中，读一段真实经历，收藏一份成长启发。</p></div><section class="filter-panel" aria-label="校友搜索与筛选"><div class="search-row"><label class="search-input">' + icon('search') + '<input id="alumni-query" type="search" placeholder="搜索姓名、专业或成长关键词" value="' + esc(filters.query) + '" aria-label="搜索校友" maxlength="100"></label><button class="button ' + (filters.favorites ? 'primary' : 'secondary') + '" data-action="filter-favorites" aria-pressed="' + filters.favorites + '">' + icon('star') + '我的收藏</button></div><div class="filter-row"><label for="field-filter">专业领域</label><select id="field-filter"><option value="all">全部领域</option>' + fields.map(field => '<option value="' + esc(field) + '" ' + (filters.field === field ? 'selected' : '') + '>' + esc(field) + '</option>').join('') + '</select><span class="filter-label">成长方向</span><div class="filter-chips" role="group" aria-label="成长方向">' + ['all', '技能竞赛', '升学深造', '技术就业'].map(direction => '<button class="chip ' + (filters.direction === direction ? 'active' : '') + '" data-action="filter-direction" data-value="' + direction + '" aria-pressed="' + (filters.direction === direction) + '">' + (direction === 'all' ? '全部' : direction) + '</button>').join('') + '</div></div></section><div class="results-heading"><p id="results-count" role="status" aria-live="polite"></p><button class="text-button" data-action="reset-filters">重置筛选</button></div><div id="alumni-results" class="people-grid"></div><div class="source-note">' + icon('shield') + '<div><strong>真实故事，有据可寻</strong><p>收录内容来自学校官方报道，任职信息以报道时间为准。照片保留官方来源，详情页可查看原始报道；石振邦使用返校活动现场配图，非本人独照。</p></div></div></div>';
  }
  function syncAlumniFilters() {
    const query = document.getElementById('alumni-query');
    if (!query) return;
    query.value = filters.query;
    document.getElementById('field-filter').value = filters.field;
    main.querySelectorAll('[data-action="filter-direction"]').forEach(chip => {
      const active = chip.dataset.value === filters.direction;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    const favorites = main.querySelector('[data-action="filter-favorites"]');
    favorites.classList.toggle('primary', filters.favorites);
    favorites.classList.toggle('secondary', !filters.favorites);
    favorites.setAttribute('aria-pressed', String(filters.favorites));
  }
  function updateAlumniResults() {
    const target = document.getElementById('alumni-results');
    if (!target) return;
    const favorites = store.get().favorites;
    const query = filters.query.trim().toLowerCase();
    const results = data.alumni.filter(person => (filters.field === 'all' || person.field === filters.field) && (filters.direction === 'all' || person.tags.includes(filters.direction)) && (!filters.favorites || favorites.includes(person.id)) && [person.name, person.field, person.role, person.cohort, person.biography, ...person.tags].join(' ').toLowerCase().includes(query));
    const resultKey = [filters.field, filters.direction, filters.favorites, results.map(person => person.id).join(',')].join('|');
    // Preserve matching cards and their focus while typing or toggling a saved story.
    if (target.dataset.resultKey === resultKey) return;
    const animateResults = target.hasChildNodes() && !reducedMotion.matches;
    target.dataset.resultKey = resultKey;
    target.innerHTML = results.length ? results.map(personCard).join('') : '<div class="empty-state full-width"><span class="empty-icon">' + icon(filters.favorites ? 'star' : 'search') + '</span><h2>' + (filters.favorites ? '这里还没有匹配的收藏' : '暂时没有找到匹配的校友') + '</h2><p>试试其他关键词，或清除筛选看看全部故事。</p><button class="button secondary" data-action="reset-filters">查看全部校友</button></div>';
    prepareArrowAnimations(target);
    if (animateResults) {
      Array.from(target.children).forEach((card, index) => {
        card.style.setProperty('--result-delay', index * 45 + 'ms');
        card.classList.add('alumni-result-enter');
        const finishEntry = () => {
          card.classList.remove('alumni-result-enter');
          card.style.removeProperty('--result-delay');
        };
        card.addEventListener('animationend', finishEntry, { once: true });
        card.addEventListener('animationcancel', finishEntry, { once: true });
      });
    }
    document.getElementById('results-count').innerHTML = '找到 <strong>' + results.length + '</strong> 位校友 <span> / 共 ' + data.alumni.length + ' 位已收录</span>';
  }
  const taskCount = route => route.stages.reduce((total, stage) => total + stage.tasks.length, 0);
  const projectById = id => data.practiceProjects.find(project => project.id === id);
  const textList = (items, ordered = false) => '<' + (ordered ? 'ol' : 'ul') + ' class="reading-list">' + items.map(item => '<li>' + esc(item) + '</li>').join('') + '</' + (ordered ? 'ol' : 'ul') + '>';
  const exampleBlock = (text, label = '填写示例') => '<div class="example-block"><span class="section-kicker">' + esc(label) + '</span><pre>' + esc(text) + '</pre></div>';
  function resourceCards(ids) {
    return '<div class="resource-grid">' + ids.map(id => {
      const resource = data.resources.find(item => item.id === id);
      return '<article class="resource-card"><a href="' + esc(resource.url) + '" target="_blank" rel="noopener noreferrer">' + esc(resource.title) + icon('upRight') + '</a><p><strong>读这里：</strong>' + esc(resource.section) + '</p><p>' + esc(resource.use) + '</p></article>';
    }).join('') + '</div>';
  }
  function methodSection(ids, title = '遇到困难，先看这些方法') {
    return '<section class="section learning-methods" id="methods">' + sectionHead('LEARN HOW TO LEARN', title, '按需展开：操作步骤、填写示例与检查清单。示例可以按自己的情况修改。') + '<div class="method-grid">' + [...new Set(ids)].map(id => {
      const method = data.methodCards.find(item => item.id === id);
      return '<details class="reading-details method-card" id="method-' + method.id + '"><summary><span><strong>' + esc(method.title) + '</strong><small>' + esc(method.subtitle) + '</small></span></summary><div class="reading-body">' + textList(method.steps, true) + exampleBlock(method.example) + '<h4>检查清单</h4>' + textList(method.checklist) + '</div></details>';
    }).join('') + '</div></section>';
  }
  function finishReadingAnimation(card) {
    const state = readingAnimations.get(card);
    if (!state) return;
    readingAnimations.delete(card);
    card.open = state.expanded;
    card.classList.remove('is-animating', 'is-collapsing');
    card.querySelector('summary').removeAttribute('aria-expanded');
    card.querySelector('.reading-body').inert = false;
    state.animations.forEach(animation => animation.cancel());
  }
  function clearReadingAnimations() {
    [...readingAnimations.keys()].forEach(finishReadingAnimation);
  }
  function setReadingExpanded(card, expanded) {
    const summary = card.querySelector('summary');
    const body = card.querySelector('.reading-body');
    const previous = readingAnimations.get(card);
    if (reducedMotion.matches || typeof card.animate !== 'function') {
      finishReadingAnimation(card);
      card.open = expanded;
      return;
    }
    if (!previous && card.open === expanded) return;
    // Read the current frame before cancelling so rapid clicks reverse smoothly.
    const startHeight = card.getBoundingClientRect().height;
    const startOpacity = card.open ? Number(getComputedStyle(body).opacity) : 0;
    if (previous) previous.animations.forEach(animation => animation.cancel());
    card.open = true;
    card.classList.add('is-animating');
    card.classList.toggle('is-collapsing', !expanded);
    summary.setAttribute('aria-expanded', String(expanded));
    if (!expanded && body.contains(document.activeElement)) summary.focus({ preventScroll: true });
    body.inert = !expanded;
    const styles = getComputedStyle(card);
    const closedHeight = summary.getBoundingClientRect().height + parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
    const openHeight = card.getBoundingClientRect().height;
    const endHeight = expanded ? openHeight : closedHeight;
    const duration = Math.max(100, 320 * Math.min(1, Math.abs(endHeight - startHeight) / Math.max(1, openHeight - closedHeight)));
    const timing = { duration, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' };
    const height = card.animate([{ height: startHeight + 'px' }, { height: endHeight + 'px' }], timing);
    const fade = body.animate([{ opacity: startOpacity }, { opacity: expanded ? 1 : 0 }], timing);
    const state = { expanded, animations: [height, fade] };
    readingAnimations.set(card, state);
    height.onfinish = () => {
      if (readingAnimations.get(card) === state) finishReadingAnimation(card);
    };
  }
  function methodLinks(ids) {
    return '<div class="reading-links">' + ids.map(id => {
      const method = data.methodCards.find(item => item.id === id);
      return '<button class="text-link" data-action="scroll-to" data-value="method-' + id + '">' + esc(method.title) + icon('arrow') + '</button>';
    }).join('') + '</div>';
  }
  function practiceCard(project) {
    return '<article class="practice-card route-' + project.color + '"><div class="practice-card-top"><span class="section-kicker">' + esc(project.category) + '</span>' + icon(project.icon) + '</div><h3><a href="#/practice/' + project.id + '">' + esc(project.name) + '</a></h3><p>' + esc(project.summary) + '</p><div class="practice-output"><span>你会留下</span><strong>' + esc(project.outcome) + '</strong></div><a class="card-link" href="#/practice/' + project.id + '">跟着完成这个案例' + icon('arrow') + '</a></article>';
  }
  function practiceSection(ids = data.practiceProjects.map(project => project.id), title = '从第一份小作品开始') {
    return '<section class="section practice-section" id="practice-library">' + sectionHead('LEARNING BY MAKING', title, '原创教学案例 · 有起始材料、参考成品和明确的完成标准') + '<div class="practice-grid">' + ids.map(id => practiceCard(projectById(id))).join('') + '</div></section>';
  }
  function beginnerSection() {
    return '<section class="beginner-section"><div><span class="section-kicker">START SMALL / 零基础从这里开始</span><h2>第一份作品，<br>从改一行文字开始。</h2><p>不必先弄懂所有术语。打开示例、修改标题、看见变化，再一步步完成自己的校园指南。</p><a class="button primary" href="#/practice/campus-guide">开始网页入门练习' + icon('arrow') + '</a></div><ol class="beginner-steps"><li><span>01</span><div><strong>认识问题</strong><p>为 8 条模拟问答整理分类。</p></div></li><li><span>02</span><div><strong>动手做出结果</strong><p>加入搜索，检查手机阅读效果。</p></div></li><li><span>03</span><div><strong>把过程讲清楚</strong><p>记录测试，完成两分钟演示。</p></div></li></ol></section>';
  }
  function sourceLink(source) {
    return '<a class="inline-source" href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.title) + ' · ' + esc(source.date) + icon('upRight') + '</a>';
  }
  function personPage(person) {
    const learning = person.learning;
    const project = projectById(learning.projectId);
    const fromHome = alumniHistoryEntry?.origin?.route === 'home';
    return '<div class="container inner-page" data-alumni-profile="' + person.id + '"><a class="back-link" href="' + (fromHome ? '#/' : '#/alumni') + '">' + icon('back') + (fromHome ? '返回校庆首页' : '返回校友探索') + '</a><section class="profile-hero"><div class="profile-portrait">' + portrait(person, true) + photoCredit(person) + '</div><div class="profile-intro">' + eyebrow('ALUMNI STORY / ' + person.number) + '<div class="profile-title"><h1>' + esc(person.name) + '</h1>' + favoriteButton(person) + '</div><div class="profile-meta">' + esc(person.cohort) + '<span>·</span>' + esc(person.major) + '</div><h2>' + esc(person.role) + '</h2><p>' + esc(person.summary) + '</p><div class="tags">' + tags(person.tags) + '</div></div></section>' +
      '<div class="profile-columns"><article><section class="story-intro"><div class="section-kicker">DOCUMENTED EXPERIENCE / 公开经历</div><h2>从公开记录认识这段经历</h2><p>' + esc(person.biography) + '</p><div class="reading-links">' + person.sources.map(sourceLink).join('') + '</div></section><section class="timeline-section"><h2>成长的关键坐标</h2><ol class="timeline">' + person.timeline.map((event, index) => '<li><span class="timeline-marker">' + (index === person.timeline.length - 1 ? '✦' : '') + '</span><span class="timeline-time">' + esc(event.time) + '</span><div><h3>' + esc(event.title) + '</h3><p>' + esc(event.text) + '</p>' + sourceLink(event.source) + '</div></li>').join('') + '</ol></section><section class="editor-analysis"><span class="section-kicker">EDITOR’S NOTES / 平台编辑分析</span><h2>' + esc(learning.label) + '</h2><p>' + esc(learning.analysis) + '</p><h3>理解这份资料的边界</h3><p>' + esc(learning.limits) + '</p><p class="editor-note">以下练习由平台设计，不是校友原话或本人建议。</p><h3>新生可以尝试的一步</h3><p>' + esc(learning.next) + '</p><a class="button secondary" href="#/practice/' + project.id + '">开始：' + esc(project.name) + icon('arrow') + '</a></section><div class="source-box"><div>' + icon('shield') + '<strong>来源与核对说明</strong></div><p>' + esc(person.verificationNote) + '</p></div></article><aside class="profile-aside"><div class="takeaway-card"><span class="section-kicker">TAKE A LITTLE INSPIRATION</span><h3>把启发变成一个行动</h3><p>' + esc(person.takeaway) + '</p><span class="editor-note">平台编辑提炼，非校友原话</span></div><div class="related-routes"><h3>选择自己的成长路线</h3>' + person.routes.map(id => { const route = routeById(id); return '<a href="#/paths/' + route.id + '"><span class="related-icon">' + icon(route.icon) + '</span><span>' + esc(route.name) + '<small>' + esc(route.duration) + ' · 可调整</small></span>' + icon('chevron') + '</a>'; }).join('') + '</div></aside></div>' + methodSection(learning.methodIds, '把这份启发用到今天') + '</div>';
  }
  function routeComparisonRow(route) {
    const steps = route.stages.map((stage, index) => '<li><span class="comparison-step-number" aria-hidden="true">0' + (index + 1) + '</span><span>' + esc(stage.title) + '</span></li>').join('');
    const outcomes = route.outcome.split(' · ').map(outcome => '<li>' + icon('check') + '<span>' + esc(outcome) + '</span></li>').join('');
    return '<tr class="comparison-route route-' + esc(route.color) + '" role="row"><th scope="row" role="rowheader"><a class="comparison-route-title" href="#/paths/' + esc(route.id) + '"><span class="route-icon">' + icon(route.icon) + '</span><span>' + esc(route.name) + icon('upRight') + '</span></a><small>' + esc(route.audience) + '</small><span class="comparison-duration">' + icon('calendar') + esc(route.duration) + '</span></th><td role="cell"><span class="comparison-cell-label" aria-hidden="true">行动顺序</span><ol class="comparison-steps" role="list">' + steps + '</ol></td><td role="cell"><span class="comparison-cell-label" aria-hidden="true">最终留下</span><ul class="comparison-outcomes" role="list">' + outcomes + '</ul></td></tr>';
  }
  function pathsPage() {
    return '<div class="container inner-page paths-page"><div class="paths-intro"><div class="paths-intro-copy page-heading">' + eyebrow('PASS IT FORWARD / 成长传承') + '<span class="section-kicker">从商职出发，向自己的光前行</span><h1>每一种成长，都值得被看见。</h1><p>校友故事带来启发，学习与实践留下积累。方向由你选择，每一步都可以从小处开始。</p></div><img class="paths-intro-art" src="assets/starpath.svg" width="650" height="550" alt="商职星途原创插画：从学习、实践走向成长"></div>' + beginnerSection() + '<div class="route-grid route-grid-large">' + data.routes.map(pathsRouteCard).join('') + '</div><section class="section">' + sectionHead('CHOOSE YOUR FIRST STEP', '这三条路线，分别适合什么时候？', '可以从一个目标开始，之后再调整。') + '<div class="comparison-wrap"><table class="route-comparison" role="table"><caption class="sr-only">成长路线的目标、阶段与成果比较</caption><thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader"><span aria-hidden="true">01</span>当前目标</th><th scope="col" role="columnheader"><span aria-hidden="true">02</span>行动顺序</th><th scope="col" role="columnheader"><span aria-hidden="true">03</span>最终留下</th></tr></thead><tbody role="rowgroup">' + data.routes.map(routeComparisonRow).join('') + '</tbody></table></div></section>' + practiceSection() + methodSection(data.methodCards.map(method => method.id)) + '<div class="source-note" hidden>' + icon('info') + '<div><strong>第一轮探索，按自己的节奏来</strong><p>模板为平台建议，不代表校友本人路径，也不承诺获奖、录取或就业。核心内容可离线阅读，打开外部官方资料需要联网；Python 案例需要先准备本地工具。</p></div></div></div>';
  }
  function stageGuide(stage, index) {
    return '<details class="reading-details stage-guide" id="stage-' + index + '"' + (index === 0 ? ' open' : '') + '><summary><span class="stage-guide-number">0' + (index + 1) + '</span><span><small>' + esc(stage.period) + '</small><strong>' + esc(stage.title) + '</strong></span><span class="stage-task-count">' + stage.tasks.length + ' 项任务</span></summary><div class="reading-body"><p class="stage-purpose">' + esc(stage.why) + '</p><h3>开始前，认识这些基础</h3><p>' + esc(stage.preparation) + '</p><h3>这阶段的三个动作</h3>' + textList(stage.tasks, true) + '<h3>一步步怎么做</h3>' + textList(stage.steps, true) + exampleBlock(stage.example, '成果样例 · 平台示例') + '<div class="guide-check-grid"><div><h3>做到什么程度</h3>' + textList(stage.checklist) + '</div><div><h3>遇到困难怎么办</h3>' + textList(stage.pitfalls) + '</div></div><h3>对应资料与方法</h3>' + resourceCards(stage.resourceIds) + methodLinks(stage.methodIds) + '</div></details>';
  }
  function routePage(route) {
    const people = data.alumni.filter(person => person.routes.includes(route.id));
    const methods = [...new Set([...route.methodIds, ...route.stages.flatMap(stage => stage.methodIds)])];
    return '<div class="container inner-page route-page" data-route="' + esc(route.id) + '"><a class="back-link" href="#/paths">' + icon('back') + '返回成长路线</a><section class="path-hero route-' + route.color + '"><div><span class="route-icon">' + icon(route.icon) + '</span><div class="eyebrow">零基础指南 · 平台建议</div><h1>' + esc(route.name) + '</h1><h2>' + esc(route.subtitle) + '</h2><p>' + esc(route.description) + '</p><div class="path-hero-meta"><span>' + icon('calendar') + esc(route.duration) + '</span><span>' + route.stages.length + ' 个阶段 · ' + taskCount(route) + ' 项初始任务</span></div></div><div class="path-create-card"><h3>让这条路线，为你而行</h3><p>' + esc(route.audience) + '</p><button class="button primary" data-action="create-plan" data-template="' + route.id + '">使用这条路线' + icon('arrow') + '</button><span>保存在本机 · 任务与日期均可修改</span></div></section><div class="route-outcome"><div><span class="section-kicker">这一轮，你会留下</span><strong>' + esc(route.outcome) + '</strong></div><p>' + esc(route.effort) + '。建议时长不会自动设置任务日期。</p></div><nav class="reading-toc" aria-label="路线阅读目录">' + route.stages.map((stage, index) => '<button data-action="scroll-to" data-value="stage-' + index + '">0' + (index + 1) + ' ' + esc(stage.title) + '</button>').join('') + '<button data-action="scroll-to" data-value="practice-library">实践案例</button><button data-action="scroll-to" data-value="methods">学习方法</button></nav><section class="section">' + sectionHead('ONE STEP AT A TIME', '走稳每一个阶段', '展开阅读具体步骤，完成后回到个人计划记录进度。') + '<div class="stage-guides">' + route.stages.map(stageGuide).join('') + '</div></section>' + practiceSection(route.projectIds, route.id === 'education' ? '可选体验：用程序整理模拟学习记录' : '与这条路线配套的实践案例') + methodSection(methods) + '<section class="section">' + sectionHead('STORIES TO INSPIRE', '也读读这些公开经历', '成长路线是平台设计，相关校友未必使用过这些方法或案例。') + '<div class="related-people">' + people.map(person => '<a href="#/alumni/' + person.id + '" class="related-person">' + personThumbnail(person) + '<span><strong>' + esc(person.name) + '</strong><small>' + esc(person.role) + '</small></span>' + icon('upRight') + '</a>').join('') + '</div></section></div>';
  }
  function practicePage(project) {
    return '<div class="container inner-page practice-page"><a class="back-link" href="#/paths">' + icon('back') + '返回成长路线</a><section class="practice-hero route-' + project.color + '"><div><span class="section-kicker">' + esc(project.category) + ' · 原创教学示例</span><h1>' + esc(project.name) + '</h1><p>' + esc(project.scenario) + '</p><div class="path-hero-meta"><span>' + esc(project.duration) + '</span></div><div class="practice-actions"><a class="button primary" href="' + esc(project.download) + '" download>' + icon('download') + '下载起始材料与成品</a><a class="button secondary" href="' + esc(project.preview) + '" target="_blank" rel="noopener">查看参考' + icon('upRight') + '</a></div></div><div class="practice-hero-result"><span>跟着做，得到一份自己的成果</span><strong>' + esc(project.outcome) + '</strong><p>先尝试，再对照；记录自己的修改和验证过程。</p></div></section><nav class="reading-toc" aria-label="案例阅读目录"><button data-action="scroll-to" data-value="practice-setup">准备环境</button><button data-action="scroll-to" data-value="practice-steps">分步练习</button><button data-action="scroll-to" data-value="practice-checks">排障与验收</button><button data-action="scroll-to" data-value="practice-resources">延伸资料</button></nav><div class="practice-reading"><section class="section" id="practice-setup">' + sectionHead('BEFORE YOU START', '先准备好，再动手', '首次安装工具需要联网；材料解压后可以保留在本地反复练习。') + '<div class="setup-card"><h3>Windows 操作准备</h3>' + textList(project.setup, true) + '</div><dl class="term-grid">' + project.terms.map(term => '<div><dt>' + esc(term[0]) + '</dt><dd>' + esc(term[1]) + '</dd></div>').join('') + '</dl></section><section class="section" id="practice-steps">' + sectionHead('MAKE SOMETHING REAL', '一步一步，看到结果', '每一步都先保存、运行和观察，再继续。') + project.steps.map((step, index) => '<details class="reading-details practice-step"' + (index === 0 ? ' open' : '') + '><summary><span class="stage-guide-number">0' + (index + 1) + '</span><strong>' + esc(step.title) + '</strong></summary><div class="reading-body"><p>' + esc(step.text) + '</p>' + (step.code ? exampleBlock(step.code, '代码或命令 · 可按教程使用') : '') + '<div class="expected-result"><strong>你应该看到</strong><p>' + esc(step.expected) + '</p></div></div></details>').join('') + '</section><section class="section" id="practice-checks">' + sectionHead('CHECK YOUR WORK', '做完，还要能验证', '逐项实际操作，记录预期和结果。') + '<div class="guide-check-grid"><div class="setup-card"><h3>验收清单</h3>' + textList(project.checks, true) + '</div><div class="setup-card"><h3>常见问题</h3><dl class="error-list">' + project.errors.map(error => '<dt>' + esc(error[0]) + '</dt><dd>' + esc(error[1]) + '</dd>').join('') + '</dl></div></div><div class="extension-card"><h3>完成后，再试一点变化</h3>' + textList(project.extensions) + '</div></section><section class="section" id="practice-resources">' + sectionHead('GO A LITTLE FURTHER', '延伸阅读，按需打开', '核心步骤已保存在本站，以下链接提供更完整的官方说明。') + resourceCards(project.resourceIds) + '</section></div>' + methodSection(project.methodIds) + '<section class="practice-next"><span class="section-kicker">KEEP GOING</span><h2>让这次练习，成为计划中的一步</h2><p>创建整条路线的计划后，可以编辑任务、目标与日期。案例不会自动判定任务完成。</p><div class="practice-actions">' + project.routeIds.map(id => '<button class="button secondary" data-action="create-plan" data-template="' + id + '">创建' + esc(routeById(id).name) + '计划</button>').join('') + '</div></section></div>';
  }
  function growthLearning(plan) {
    const route = plan && routeById(plan.templateId);
    const ids = route ? [...route.methodIds, 'project-readme', 'weekly-review'] : data.methodCards.map(method => method.id);
    return '<section class="growth-learning" hidden><div class="growth-reading-entry"><div><span class="section-kicker">FROM CHECKLIST TO LEARNING</span><h2>完成之后，留下看得见的证据。</h2><p>参考项目说明与复盘模板，把文件、测试和下一步整理清楚。模板中的示例不会自动保存为个人记录。</p></div>' + (route ? '<a class="button secondary" href="#/paths/' + route.id + '">返回' + esc(route.name) + '学习指导' + icon('arrow') + '</a>' : '<a class="button secondary" href="#/practice/campus-guide">从网页案例开始' + icon('arrow') + '</a>') + '</div>' + methodSection(ids, '项目说明与复盘工具箱') + '</section>';
  }
  function localDate() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }
  function taskRow(task, planId) {
    const late = task.dueDate && task.dueDate < localDate() && !task.completed;
    return '<li class="task-row ' + (task.completed ? 'task-complete' : '') + '"><label class="task-check" for="task-' + task.id + '"><input id="task-' + task.id + '" type="checkbox" data-task="' + task.id + '" data-plan="' + planId + '" ' + (task.completed ? 'checked' : '') + '><span class="check-visual">' + icon('check') + '</span><span class="task-text">' + esc(task.title) + '</span></label><div class="task-row-actions">' + (task.dueDate ? '<span class="task-date ' + (late ? 'late' : '') + '">' + icon('calendar') + esc(task.dueDate) + (late ? '<small>待跟进</small>' : '') + '</span>' : '') + '<button class="icon-button" data-action="edit-task" data-plan="' + planId + '" data-task="' + task.id + '" aria-label="编辑任务：' + esc(task.title) + '">' + icon('edit') + '</button></div></li>';
  }
  function growthPage(planId) {
    const state = store.get();
    const plan = planId ? state.plans.find(item => item.id === planId) : state.plans[0];
    if (planId && !plan) return notFound('这份计划已不存在', '可能已被删除，或尚未导入到当前浏览器。', '#/growth', '返回我的成长');
    const allTasks = state.plans.flatMap(item => item.tasks);
    const completed = allTasks.filter(task => task.completed).length;
    const overall = allTasks.length ? Math.round(completed / allTasks.length * 100) : 0;
    const toolbar = '<div class="growth-tools"><button class="button secondary small" data-action="export">' + icon('download') + '导出备份</button><button class="button secondary small" data-action="import">' + icon('upload') + '导入备份</button></div>';
    let html = '<div class="container inner-page growth-page"><div class="page-heading growth-heading"><div>' + eyebrow('MY JOURNEY / 我的成长') + '<h1>每一个小小的完成，都算数。</h1><p>按照自己的节奏，把今天的行动连成明天的星途。</p></div>' + toolbar + '</div><div class="stats-grid"><div><span class="stat-label">我的成长计划</span><strong>' + state.plans.length + '<small>份</small></strong></div><div><span class="stat-label">已完成任务</span><strong>' + completed + '<small>/ ' + allTasks.length + '</small></strong></div><div><span class="stat-label">整体完成度</span><strong>' + overall + '<small>%</small></strong></div><div><span class="stat-label">收藏的校友</span><strong>' + state.favorites.length + '<small>位</small></strong></div></div>';
    if (!plan) {
      html += '<section class="empty-growth"><div class="empty-growth-art" aria-hidden="true"><div class="empty-orbit"></div>✦<span>YOUR NEXT STEP</span></div><div><span class="section-kicker">从一个小目标开始</span><h2>你的成长故事，等你写下第一笔。</h2><p>选择一条路线，或从空白计划开始。目标、任务与节奏，都由你决定。</p><div class="hero-actions"><a class="button primary" href="#/paths" aria-label="选择成长路线">' + shineContent('选择成长路线') + '</a><button class="button secondary" data-action="create-plan" data-template="">创建空白计划</button></div></div></section>';
    } else {
      const progress = store.progress(plan);
      const template = routeById(plan.templateId);
      const stages = [...new Set(plan.tasks.map(task => task.stage))];
      html += '<div class="growth-layout"><aside class="plan-sidebar"><div class="sidebar-heading"><h2>我的计划</h2><span>' + state.plans.length + '</span></div><nav aria-label="成长计划">' + state.plans.map(item => { const p = store.progress(item); return '<a class="plan-tab ' + (item.id === plan.id ? 'selected' : '') + '" href="#/growth/' + item.id + '" ' + (item.id === plan.id ? 'aria-current="page"' : '') + '><strong>' + esc(item.title) + '</strong><span>' + p.complete + ' / ' + p.total + ' 项完成 <b>' + p.percent + '%</b></span><span class="mini-progress"><i style="width:' + p.percent + '%"></i></span></a>'; }).join('') + '</nav><a class="button secondary" href="#/paths">' + icon('plus') + '从路线新建计划</a><button class="text-button" data-action="create-plan" data-template="">创建空白计划</button></aside><section class="plan-detail" aria-labelledby="plan-title"><div class="plan-detail-heading"><div><span class="section-kicker">' + (template ? esc(template.name) + ' · 自定义成长计划' : '我的自定义计划') + '</span><h2 id="plan-title">' + esc(plan.title) + '</h2><p class="plan-goal">' + (plan.goal ? esc(plan.goal) : '写下你的目标，让每一步都有自己的方向。') + '</p></div><button class="icon-button" data-action="edit-plan" data-plan="' + plan.id + '" aria-label="编辑计划目标">' + icon('edit') + '</button></div><div class="plan-progress-summary"><span>' + progress.complete + ' / ' + progress.total + ' 项任务已完成</span><strong>' + progress.percent + '%</strong></div><div class="progress-track" role="progressbar" aria-label="当前计划完成度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress.percent + '"><span style="width:' + progress.percent + '%"></span></div>' + (progress.total && progress.percent === 100 ? '<div class="completion-note">' + icon('spark') + '这份计划已全部完成。记得回顾收获，再决定下一步。</div>' : '') + '<div class="task-groups">' + (stages.length ? stages.map((stage, index) => '<section class="task-group"><div class="task-group-heading"><span>0' + (index + 1) + '</span><h3>' + esc(stage) + '</h3><small>' + plan.tasks.filter(task => task.stage === stage && task.completed).length + ' / ' + plan.tasks.filter(task => task.stage === stage).length + '</small></div><ul>' + plan.tasks.filter(task => task.stage === stage).map(task => taskRow(task, plan.id)).join('') + '</ul></section>').join('') : '<div class="empty-tasks"><span>' + icon('plus') + '</span><h3>从第一项任务开始</h3><p>把目标拆成具体行动，完成一步，就离目标更近一步。</p></div>') + '</div><div class="plan-bottom-actions"><button class="button secondary" data-action="add-task" data-plan="' + plan.id + '">' + icon('plus') + '添加任务</button><button class="text-button danger-text" data-action="delete-plan" data-plan="' + plan.id + '">删除计划</button></div></section></div>';
    }
    if (plan && plan.generation) html += '<section class="ai-saved-evidence"><h2>这份 AI 计划的参考资料</h2>' + aiEvidence(plan.generation) + '</section>';
    html += '<div class="local-note">' + icon('shield') + '<p>进度仅保存在当前浏览器，建议定期导出备份。更换浏览器、移动文件或清理浏览器数据后，可通过导入恢复。</p></div>';
    if (state.favorites.length) html += '<section class="section saved-people">' + sectionHead('KEEP THE INSPIRATION', '收藏的成长故事', '') + '<div class="related-people">' + state.favorites.map(personById).map(person => '<a class="related-person" href="#/alumni/' + person.id + '">' + personThumbnail(person) + '<span><strong>' + person.name + '</strong><small>' + person.role + '</small></span>' + icon('upRight') + '</a>').join('') + '</div></section>';
    html += growthLearning(plan);
    return html + '</div>';
  }
  function aboutPage() {
    const readme = document.getElementById('about-readme').innerHTML;
    return '<div class="container inner-page about-page"><div class="page-heading">' + eyebrow('ABOUT STARPATH') + '<h1>每一个故事，都有真实的出处。</h1><p>商职星途·九秩校庆，是连接校史、校友故事与个人成长的学生创作专题。</p></div><div class="about-sections">' + readme + '<section><h2>你的数据，由你保管</h2><p>无需注册。收藏和已保存的成长计划在当前浏览器管理。使用升学 AI 生成时，填写的个人情况将发送给 DeepSeek，用于联网检索和生成建议。清理浏览器数据、使用隐私模式、更换浏览器或移动网页文件可能影响保存。建议在“我的成长”定期导出 JSON 备份，换环境后可导入恢复。</p><p>网页的指南、练习材料和原始模板在本地；升学 AI 生成需要联网，主动打开学校报道或官方学习资料也会访问外部网站。Python 实践需先安装本地工具，首次安装需要联网。</p><a href="#/growth" class="button secondary">管理我的成长数据' + icon('arrow') + '</a></section></div></div>';
  }
  function notFound(title = '这段星途，暂时还没找到。', text = '链接可能已失效，回到探索页重新出发吧。', href = '#/alumni', label = '返回校友探索') {
    return '<div class="container inner-page"><div class="empty-state not-found"><span class="empty-icon">' + icon('compass') + '</span><h1>' + title + '</h1><p>' + text + '</p><a class="button primary" href="' + href + '">' + label + icon('arrow') + '</a></div></div>';
  }
  function clearPageTransition() {
    clearTimeout(pageSnapshotTimer);
    if (pageSnapshot) pageSnapshot.remove();
    pageSnapshot = null;
  }
  function clearHistoryNavigation() {
    clearTimeout(historyNavigationTimer);
    historyNavigationTimer = null;
    if (historyNavigationLink) historyNavigationLink.classList.remove('history-link-activating');
    historyNavigationLink = null;
  }
  function clearHistoryScreenFill() {
    clearTimeout(historyScreenFillTimer);
    historyScreenFillTimer = null;
    if (historyScreenFill) historyScreenFill.remove();
    historyScreenFill = null;
  }
  function clearHistoryReveal() {
    if (historyPrepareObserver) historyPrepareObserver.disconnect();
    historyPrepareObserver = null;
    if (historyRevealObserver) historyRevealObserver.disconnect();
    historyRevealObserver = null;
  }
  function clearHistoryTitleAnimation(reveal = false) {
    clearTimeout(historyTitleTimer);
    historyTitleTimer = null;
    if (reveal && historyTitleHeading?.isConnected) {
      historyTitleHeading.querySelectorAll('.history-title-character').forEach(character => {
        character.classList.add('is-visible');
        character.classList.remove('is-current');
      });
    }
    historyTitleHeading = null;
  }
  function animateHistoryTitle(delay) {
    const heading = main.querySelector('.history-intro .page-heading h1');
    if (!heading) return;
    const title = heading.textContent;
    const characters = typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(title)].map(part => part.segment)
      : Array.from(title);
    const fragment = document.createDocumentFragment();
    heading.setAttribute('aria-label', title);
    heading.classList.add('history-title-typing');
    characters.forEach(character => {
      const span = document.createElement('span');
      span.className = 'history-title-character';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = character;
      fragment.append(span);
    });
    heading.replaceChildren(fragment);
    historyTitleHeading = heading;
    let index = 0;
    function revealNext() {
      if (index) heading.children[index - 1].classList.remove('is-current');
      heading.children[index].classList.add('is-visible', 'is-current');
      index++;
      if (index < characters.length) historyTitleTimer = setTimeout(revealNext, 160);
      else historyTitleTimer = null;
    }
    historyTitleTimer = setTimeout(revealNext, delay);
  }
  function splitHistoryCharacters(line) {
    if (line.classList.contains('history-line-prepared') || line.classList.contains('history-line-complete')) return;
    line.classList.add('history-line-prepared');
    const original = line.textContent;
    const nodes = [...line.childNodes];
    const accessibleText = document.createElement('span');
    accessibleText.className = 'sr-only';
    accessibleText.textContent = original;
    line.prepend(accessibleText);
    nodes.forEach(node => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const fragment = document.createDocumentFragment();
      const characters = typeof Intl.Segmenter === 'function'
        ? [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(node.textContent)].map(part => part.segment)
        : Array.from(node.textContent);
      characters.forEach(character => {
        if (/^\s$/.test(character)) { fragment.append(character); return; }
        const span = document.createElement('span');
        span.className = 'history-character history-character-pending';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = character;
        fragment.append(span);
      });
      node.replaceWith(fragment);
    });
    line.querySelectorAll('svg').forEach(icon => icon.classList.add('history-character', 'history-character-pending'));
  }
  function finishHistoryLine(line) {
    line.classList.remove('history-line-pending');
    line.classList.add('history-line-complete');
    line.querySelectorAll('.history-character').forEach(character => {
      character.classList.remove('history-character-pending', 'history-character-visible');
      character.style.removeProperty('--history-reveal-delay');
    });
    if (historyPrepareObserver) historyPrepareObserver.unobserve(line);
    if (historyRevealObserver) historyRevealObserver.unobserve(line);
  }
  function observeHistoryTimeline() {
    if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
    const lines = [...main.querySelectorAll('.history-timeline .history-entry h3,.history-timeline .history-entry p,.history-timeline .history-entry .inline-source')];
    if (!lines.length) return;
    lines.forEach(line => line.classList.add('history-line-pending'));
    historyPrepareObserver = new IntersectionObserver((observations, observer) => {
      if (reducedMotion.matches) return;
      observations.filter(item => item.isIntersecting).forEach(item => {
        if (!item.target.isConnected) return;
        splitHistoryCharacters(item.target);
        observer.unobserve(item.target);
      });
    }, { rootMargin: '160px 0px' });
    historyRevealObserver = new IntersectionObserver((observations, observer) => {
      if (reducedMotion.matches) return;
      observations.filter(item => item.isIntersecting).forEach(item => {
        const line = item.target;
        if (!line.isConnected) return;
        if (line.classList.contains('history-line-complete')) { observer.unobserve(line); return; }
        // A fast scroll can reach the reveal observer before the preparation callback.
        splitHistoryCharacters(line);
        if (historyPrepareObserver) historyPrepareObserver.unobserve(line);
        const characters = [...line.querySelectorAll('.history-character-pending')];
        const stagger = Math.min(12, 240 / Math.max(1, characters.length - 1));
        characters.forEach((character, characterIndex) => {
          character.style.setProperty('--history-reveal-delay', Math.round(characterIndex * stagger) + 'ms');
          character.classList.remove('history-character-pending');
          character.classList.add('history-character-visible');
        });
        line.classList.remove('history-line-pending');
        const lastCharacter = characters[characters.length - 1];
        if (lastCharacter) lastCharacter.addEventListener('animationend', () => finishHistoryLine(line), { once: true });
        else finishHistoryLine(line);
        observer.unobserve(line);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    lines.forEach(line => {
      historyPrepareObserver.observe(line);
      historyRevealObserver.observe(line);
    });
  }
  function writeAlumniHistory(entry) {
    alumniHistoryEntry = entry;
    try { history.replaceState({ ...history.state, starPathAlumni: entry }, ''); }
    catch (_) { /* Navigation remains available when history state cannot be saved. */ }
  }
  function alumniCard(id) {
    return main.querySelector('.people-grid [data-alumni-id="' + id + '"]');
  }
  function alumniCardVisible(card) {
    if (!card) return false;
    const bounds = card.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 && bounds.bottom > document.querySelector('.site-header').getBoundingClientRect().bottom && bounds.top < window.innerHeight;
  }
  function cloneAlumniContent(node) {
    const copy = node.cloneNode(true);
    [copy, ...copy.querySelectorAll('*')].forEach(element => {
      element.removeAttribute('id');
      element.classList.remove('page-enter', 'alumni-result-enter', 'alumni-motion-hidden');
      if (element.matches('a,button,input,select,textarea,[tabindex]')) element.setAttribute('tabindex', '-1');
    });
    return copy;
  }
  function alumniLayer(bounds, className) {
    const node = document.createElement('div');
    node.className = 'alumni-motion-layer ' + className;
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('inert', '');
    Object.assign(node.style, { left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px' });
    return { node, bounds };
  }
  function measureAlumniPhoto(portrait, source = null) {
    const image = portrait?.querySelector('img');
    if (!image) return null;
    const naturalWidth = image.naturalWidth || source?.naturalWidth;
    const naturalHeight = image.naturalHeight || source?.naturalHeight;
    const bounds = portrait.getBoundingClientRect();
    if (!naturalWidth || !naturalHeight || !bounds.width || !bounds.height) return null;
    const frameStyle = getComputedStyle(portrait);
    const imageStyle = getComputedStyle(image);
    const fit = imageStyle.objectFit === 'contain' ? Math.min : Math.max;
    const scale = fit(bounds.width / naturalWidth, bounds.height / naturalHeight);
    const position = imageStyle.objectPosition.split(' ');
    const offset = (value, space) => value.endsWith('%') ? parseFloat(value) / 100 * space : parseFloat(value) || 0;
    const x = offset(position[0], bounds.width - naturalWidth * scale);
    const y = offset(position[1] || '50%', bounds.height - naturalHeight * scale);
    return {
      element: portrait, image, bounds, naturalWidth, naturalHeight,
      imageTransform: 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')',
      radius: frameStyle.borderRadius, background: frameStyle.backgroundColor,
      color: frameStyle.color, blend: imageStyle.mixBlendMode
    };
  }
  function captureAlumniPhoto(photo) {
    const layer = alumniLayer(photo.bounds, 'alumni-motion-photo');
    const image = photo.image.cloneNode(true);
    image.removeAttribute('loading');
    image.alt = '';
    Object.assign(image.style, { width: photo.naturalWidth + 'px', height: photo.naturalHeight + 'px', mixBlendMode: photo.blend });
    Object.assign(layer.node.style, { left: '0px', top: '0px', backgroundColor: photo.background, color: photo.color });
    layer.node.appendChild(image);
    const caption = photo.element.querySelector('.photo-caption');
    if (caption) layer.node.appendChild(caption.cloneNode(true));
    return layer;
  }
  function captureAlumniBackdrop() {
    const mainBounds = main.getBoundingClientRect();
    const top = Math.max(0, mainBounds.top, document.querySelector('.site-header').getBoundingClientRect().bottom);
    const bottom = Math.min(window.innerHeight, mainBounds.bottom);
    if (!main.firstElementChild || bottom <= top) return null;
    const layer = alumniLayer({ left: mainBounds.left, top, width: mainBounds.width, height: bottom - top }, 'alumni-motion-backdrop');
    const position = document.createElement('div');
    position.className = 'alumni-motion-position';
    position.style.top = (mainBounds.top - top) + 'px';
    position.appendChild(cloneAlumniContent(main.firstElementChild));
    layer.node.appendChild(position);
    return layer;
  }
  function clearAlumniTransition(restoreFocus = false) {
    const transition = alumniTransition;
    if (!transition) return;
    alumniTransition = null;
    clearTimeout(transition.timer);
    transition.animations.forEach(animation => animation.cancel());
    transition.layers.forEach(layer => layer.node.remove());
    transition.hidden.classList.remove('alumni-motion-hidden');
    transition.anchor?.classList.remove('alumni-motion-anchor');
    if (restoreFocus && transition.focus.isConnected) transition.focus.focus({ preventScroll: true });
  }
  function prepareAlumniNavigation(route, options) {
    const pending = pendingAlumniNavigation;
    pendingAlumniNavigation = null;
    const saved = history.state?.starPathAlumni;
    const entry = pending?.route === route && pending.from === renderedRoute
      ? { session: alumniNavigationSession, route, origin: pending.origin }
      : saved?.session === alumniNavigationSession && saved.route === route ? saved : null;
    const origin = entry?.origin;
    const changing = options.routeChange && renderedRoute !== null && route !== renderedRoute;
    const originRoute = origin?.route || 'alumni';
    const returning = changing && route === originRoute && origin;
    const entering = changing && renderedRoute === originRoute && origin && route === 'alumni/' + origin.personId;
    const navigation = { origin: returning ? origin : null, motion: null };
    if (returning && originRoute === 'alumni') Object.assign(filters, origin.filters);
    if (!reducedMotion.matches && typeof main.animate === 'function' && (entering || (returning && renderedRoute === 'alumni/' + origin.personId && alumniHistoryEntry?.origin))) {
      const selector = entering ? '[data-alumni-id="' + origin.personId + '"] .portrait' : '[data-alumni-profile] .profile-portrait .portrait';
      const portrait = main.querySelector(selector);
      // An offscreen photograph should not suddenly fly in from outside the viewport.
      const photo = alumniCardVisible(portrait) ? measureAlumniPhoto(portrait) : null;
      const backdrop = photo ? captureAlumniBackdrop() : null;
      if (backdrop) {
        backdrop.node.querySelector(selector).style.visibility = 'hidden';
        navigation.motion = { direction: entering ? 'enter' : 'return', photo, backdrop };
      }
    }
    alumniHistoryEntry = entry;
    if (entry) writeAlumniHistory(entry);
    return navigation;
  }
  function restoreAlumniList(origin) {
    window.scrollTo({ left: origin.scrollX, top: origin.scrollY, behavior: 'instant' });
    const card = alumniCard(origin.personId);
    // A different viewport may put the source photograph outside the restored viewport.
    const portrait = card?.querySelector('.portrait');
    const resized = origin.viewport && (origin.viewport.width !== window.innerWidth || origin.viewport.height !== window.innerHeight);
    const anchor = resized ? portrait : card;
    if (anchor && !alumniCardVisible(anchor)) anchor.scrollIntoView({ block: 'center', behavior: 'instant' });
    const selectors = { photo: '.person-cover > a', name: '.person-name-row a', story: '.card-link' };
    return card?.querySelector(selectors[origin.trigger] || selectors.story) || document.getElementById('alumni-query') || main;
  }
  function animateAlumniNavigation(navigation, focus) {
    const motion = navigation.motion;
    if (!motion) return false;
    const entering = motion.direction === 'enter';
    const targetCard = entering ? null : alumniCard(navigation.origin.personId);
    if (!entering && !alumniCardVisible(targetCard)) return false;
    targetCard?.classList.add('alumni-motion-anchor');
    const target = measureAlumniPhoto(entering ? main.querySelector('.profile-portrait .portrait') : targetCard.querySelector('.portrait'), motion.photo);
    if (!target || !alumniCardVisible(target.element)) {
      targetCard?.classList.remove('alumni-motion-anchor');
      return false;
    }
    const photo = captureAlumniPhoto(motion.photo);
    const layers = [motion.backdrop, photo];
    const hidden = target.element;
    const transition = { layers, hidden, anchor: targetCard, focus, animations: [], timer: null, scrollX: window.scrollX, scrollY: window.scrollY };
    alumniTransition = transition;
    hidden.classList.add('alumni-motion-hidden');
    layers.forEach(layer => {
      layer.node.dataset.direction = motion.direction;
      document.body.appendChild(layer.node);
    });
    const animate = (node, frames, easing = 'cubic-bezier(.22,1,.36,1)') => {
      const animation = node.animate(frames, { duration: alumniMotionDuration, easing, fill: 'both' });
      transition.animations.push(animation);
    };
    const frame = photo => ({
      transform: 'translate(' + photo.bounds.left + 'px,' + photo.bounds.top + 'px)',
      width: photo.bounds.width + 'px', height: photo.bounds.height + 'px', borderRadius: photo.radius
    });
    // Animate the crop independently from the bitmap: one opaque, undistorted photo travels
    // between the actual two image frames, including their object-fit/object-position.
    animate(photo.node, [frame(motion.photo), frame(target)]);
    animate(photo.node.firstElementChild, [{ transform: motion.photo.imageTransform }, { transform: target.imageTransform }]);
    animate(motion.backdrop.node, [{ opacity: 1 }, { opacity: 0, offset: .24 }, { opacity: 0 }], 'linear');
    animate(main.firstElementChild, [{ opacity: 0 }, { opacity: 0, offset: .24 }, { opacity: 1, offset: .85 }, { opacity: 1 }], 'linear');
    const finish = () => { if (alumniTransition === transition) clearAlumniTransition(true); };
    Promise.all(transition.animations.map(animation => animation.finished)).then(finish, finish);
    transition.timer = setTimeout(finish, alumniMotionDuration + 150);
    return true;
  }
  function captureOutgoingPage(historyTransition = false) {
    const bounds = main.getBoundingClientRect();
    const headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom;
    const top = Math.max(0, bounds.top, headerBottom);
    const bottom = Math.min(window.innerHeight, bounds.bottom);
    if (!main.firstElementChild || bottom <= top) return;

    // Keep only the visible old content; it never receives input or accessibility focus.
    const snapshot = document.createElement('div');
    snapshot.className = 'page-transition-snapshot' + (historyTransition ? ' history-transition-snapshot' : '');
    snapshot.setAttribute('aria-hidden', 'true');
    snapshot.setAttribute('inert', '');
    snapshot.style.top = top + 'px';
    snapshot.style.left = bounds.left + 'px';
    snapshot.style.width = bounds.width + 'px';
    snapshot.style.height = (bottom - top) + 'px';
    const position = document.createElement('div');
    position.className = 'page-transition-position';
    position.style.top = (bounds.top - top) + 'px';
    const content = main.firstElementChild.cloneNode(true);
    content.classList.remove('page-enter');
    content.removeAttribute('id');
    content.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    content.querySelectorAll('a,button,input,select,textarea,[tabindex]').forEach(node => node.setAttribute('tabindex', '-1'));
    position.appendChild(content);
    snapshot.appendChild(position);
    document.body.appendChild(snapshot);
    pageSnapshot = snapshot;
    snapshot.addEventListener('animationend', event => {
      if (event.target === snapshot && pageSnapshot === snapshot) clearPageTransition();
    });
    // Also clean up if animations are disabled or the browser skips animationend.
    pageSnapshotTimer = setTimeout(clearPageTransition, historyTransition ? 520 : 400);
  }
  function render(options = {}) {
    if (location.hash === '#main') { main.focus(); return; }
    clearReadingAnimations();
    clearAlumniTransition();
    clearHistoryNavigation();
    clearHistoryReveal();
    clearHistoryTitleAnimation();
    clearPageTransition();
    let parts;
    try { parts = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean); }
    catch (_) { parts = ['invalid']; }
    const page = parts[0] || 'home';
    const id = parts[1];
    const route = parts.length ? parts.join('/') : 'home';
    const alumniNavigation = prepareAlumniNavigation(route, options);
    const historyFill = Boolean(historyScreenFill && !historyScreenFill.classList.contains('is-revealing') && page === 'history' && !id && parts.length === 1 && !reducedMotion.matches);
    if (!historyFill) clearHistoryScreenFill();
    const animatePage = options.routeChange && renderedRoute !== null && route !== renderedRoute && !reducedMotion.matches && !historyFill;
    const historyTransition = animatePage && historyTransitionPending && page === 'history' && renderedRoute === 'home';
    const animateTitle = page === 'history' && !id && !reducedMotion.matches && (renderedRoute === null || (options.routeChange && route !== renderedRoute));
    historyTransitionPending = false;
    current = { page, id };
    let content;
    let title = '校庆首页';
    if (parts.length > 2) content = notFound();
    else if (page === 'home' && !id) content = home();
    else if (page === 'history' && !id) { title = '九秩校史'; content = historyPage(); }
    else if (page === 'alumni') { title = '校友风采'; content = id ? (personById(id) ? personPage(personById(id)) : notFound()) : alumniPage(); }
    else if (page === 'paths') { title = '成长传承'; content = id ? (routeById(id) ? routePage(routeById(id)) : notFound('没有找到这条路线', '请从现有路线中选择一个方向。', '#/paths', '查看成长路线')) : pathsPage(); }
    else if (page === 'practice') { title = '入门实践'; content = id && projectById(id) ? practicePage(projectById(id)) : notFound('没有找到这个实践案例', '请从成长路线选择一个案例。', '#/paths', '查看成长路线'); }
    else if (page === 'growth') { title = '我的成长'; content = growthPage(id); }
    else if (page === 'about' && !id) { title = '内容来源与使用说明'; content = aboutPage(); }
    else content = notFound();
    if (modal.open && !options.keepModal) modal.close();
    if (animatePage && !alumniNavigation.motion) captureOutgoingPage(historyTransition);
    main.innerHTML = content;
    prepareArrowAnimations(main);
    prepareCodeBlocks();
    if (historyFill) {
      const fill = historyScreenFill;
      fill.classList.add('is-revealing');
      fill.addEventListener('transitionend', event => {
        if (event.target === fill && event.propertyName === 'opacity' && historyScreenFill === fill) clearHistoryScreenFill();
      });
      historyScreenFillTimer = setTimeout(clearHistoryScreenFill, 440);
    }
    if (page === 'alumni' && !id) updateAlumniResults();
    if (animatePage && !alumniNavigation.motion) main.firstElementChild.classList.add(page === 'history' ? 'history-page-enter' : 'page-enter');
    if (page === 'history' && !id) {
      if (animateTitle) animateHistoryTitle(historyFill ? 440 : 320);
      observeHistoryTimeline();
    }
    renderedRoute = route;
    document.title = title + ' · 商职星途 · 九秩校庆';
    document.querySelectorAll('[data-nav], [data-nav-action]').forEach(link => {
      if ((link.dataset.nav || link.dataset.navAction) === (page === 'practice' ? 'paths' : page)) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    notice();
    let alumniFocus = main;
    if (alumniNavigation.origin) alumniFocus = restoreAlumniList(alumniNavigation.origin);
    else if (!options.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' });
    if (animateAlumniNavigation(alumniNavigation, alumniFocus)) return;
    if (animatePage && alumniNavigation.motion) main.firstElementChild.classList.add('page-enter');
    if (alumniNavigation.origin) alumniFocus.focus({ preventScroll: true });
    else if (options.focusSelector) { const node = main.querySelector(options.focusSelector); if (node) node.focus({ preventScroll: true }); }
    else if (options.focusId) { const node = document.getElementById(options.focusId); if (node) node.focus({ preventScroll: true }); }
    else if (options.routeChange) main.focus({ preventScroll: true });
  }
  function celebrateTask(bounds) {
    if (reducedMotion.matches) return;
    const bursts = document.querySelectorAll('.task-confetti');
    if (bursts.length >= 5) bursts[0].remove();
    const burst = document.createElement('div');
    burst.className = 'task-confetti';
    burst.setAttribute('aria-hidden', 'true');
    burst.setAttribute('inert', '');
    burst.style.left = bounds.left + bounds.width / 2 + 'px';
    burst.style.top = bounds.top + bounds.height / 2 + 'px';
    const colors = ['var(--navy)', 'var(--gold)', '#e9a45e', '#df7785', '#598c82'];
    for (let index = 0; index < 36; index++) {
      const particle = document.createElement('span');
      const angle = Math.PI * 2 * index / 36;
      const distance = 48 + Math.random() * 76;
      particle.className = 'task-confetti-piece';
      particle.style.backgroundColor = colors[index % colors.length];
      particle.style.setProperty('--burst-x', Math.cos(angle) * distance + 'px');
      particle.style.setProperty('--burst-y', Math.sin(angle) * distance - 30 + 'px');
      particle.style.setProperty('--burst-fall', Math.sin(angle) * distance + 70 + 'px');
      particle.style.setProperty('--burst-spin', (Math.random() * 720 - 360) + 'deg');
      particle.style.animationDelay = Math.random() * 90 + 'ms';
      burst.appendChild(particle);
    }
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 1200);
  }
  function cancelImport() {
    importRequestId++;
    pendingImport = null;
  }
  function openModal(title, body, keepImport = false) {
    if (!keepImport) cancelImport();
    if (!modal.open) modalReturnFocus = document.activeElement;
    modal.classList.remove('ai-modal');
    modalContent.innerHTML = '<div class="modal-heading"><h2 id="modal-title">' + title + '</h2><button class="icon-button" data-action="close-modal" aria-label="关闭对话框">' + icon('close') + '</button></div>' + body;
    modal.showModal();
    prepareArrowAnimations(modalContent);
    document.body.classList.add('modal-open');
    const field = modal.querySelector('[autofocus]');
    if (field) field.focus({ preventScroll: true });
    else { const heading = document.getElementById('modal-title'); heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    modal.scrollTop = 0;
  }
  const modalError = '<p id="modal-error" class="form-error" role="alert" hidden></p>';
  const modalActions = (label = '保存', extra = '') => '<div class="modal-actions">' + extra + '<button class="button secondary" type="button" data-action="close-modal">取消</button><button class="button primary" type="submit">' + label + '</button></div>';
  function resetAi() {
    clearInterval(aiTimer);
    aiTimer = null;
    if (aiRequest) aiRequest.abort();
    aiRequest = null;
    aiDraft = null;
    aiProfile = null;
  }
  function aiEvidence(generation) {
    const readable = value => esc(window.StarPath.ai.displayText(value));
    const schools = generation.recommendations || [];
    const constraints = generation.constraints;
    const requirement = constraints ? '筛选要求：' + readable(constraints.location.name) + (constraints.tier ? ' · ' + readable(constraints.tier) + '（按历史招生层次参考）' : '') + '。' : '';
    const notice = generation.recommendationNotice ? '<p class="inline-note">' + readable(generation.recommendationNotice) + '</p>' : '';
    const recommendations = schools.length || notice ? '<section class="ai-school-recommendations"><h3>推荐了解的院校</h3><p class="ai-school-note">' + requirement + '报考资格、招生专业及考试要求以对应年度官方资料为准。</p>' + notice + schools.map(school => {
      const location = school.location ? '<p class="ai-school-note">校区参考：' + readable(school.location.province) + ' · ' + readable(school.location.city) + ' · ' + readable(school.location.campus) + '。硕士培养地点待核实，本科或学校整体校区资料不能单独证明硕士专业培养地点。<a href="' + esc(school.location.sourceUrl) + '" target="_blank" rel="noopener noreferrer">查看所在地依据' + icon('upRight') + '</a></p>' : '';
      const evidence = (school.criteriaEvidence || []).map(item => '<p class="ai-school-note">' + readable(item.criterion) + '匹配依据：' + readable(item.explanation) + ' <a href="' + esc(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer">查看匹配依据' + icon('upRight') + '</a></p>').join('');
      return '<article><h4>' + readable(school.name) + '</h4><p>' + readable(school.reason) + '</p>' + location + evidence + '<a href="' + esc(school.sourceUrl) + '" target="_blank" rel="noopener noreferrer">院校招生参考资料' + icon('upRight') + '</a></article>';
    }).join('') + '</section>' : '';
    return recommendations + '<div class="ai-evidence"><span class="section-kicker">联网检索资料 · AI 摘要</span><p class="ai-research-summary">' + readable(generation.summary) + '</p><p class="ai-source-time">检索与生成时间：' + esc(new Date(generation.generatedAt).toLocaleString('zh-CN', { hour12: false })) + ' · DeepSeek V4.1 Flash' + (generation.durationSeconds !== undefined ? ' · ' + aiDuration(generation.durationSeconds) : '') + '</p><ul class="ai-source-list">' + generation.sources.map(source => '<li><a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(window.StarPath.ai.sourceTitle(source.title)) + icon('upRight') + '</a><small>' + esc(source.url) + '</small></li>').join('') + '</ul><p class="inline-note">摘要由 AI 根据联网结果整理，未经过人工核实。报名条件、科目和时间请以对应年度官方通知为准。</p></div>';
  }
  function aiGradeOptions(level, selected) {
    return '<option value="">请选择年级</option>' + window.StarPath.ai.grades(level).map(grade => '<option' + (grade === selected ? ' selected' : '') + '>' + grade + '</option>').join('');
  }
  function aiDuration(seconds, prefix = '用时') {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes === 0) return prefix + remainingSeconds + '秒';
    return prefix + minutes + '分钟' + (remainingSeconds === 0 ? '' : remainingSeconds + '秒');
  }
  function updateAiProgress(status, progress) {
    const learning = status.querySelector('[data-ai-step="learning"]');
    learning.hidden = !progress.learning;
    if (progress.learning) {
      const state = progress.learning.status;
      learning.classList.toggle('is-active', state === 'generating');
      learning.classList.toggle('is-complete', state === 'complete');
      learning.querySelector('p').textContent = ({ waiting: '等待生成', generating: '正在根据年级和基础设计学习行动…', complete: '学习行动草稿完成，等待资料整合', failed: '学习行动生成失败' })[state];
    }
    if (progress.searchComplete) {
      const search = status.querySelector('[data-ai-step="search"]');
      search.classList.remove('is-active'); search.classList.add('is-complete');
      search.querySelector('p').textContent = '官方资料检索完成';
    }
    status.querySelector('.ai-search-count').textContent = '已完成 ' + progress.searches + ' 次搜索' + (progress.fetchRequests ? ' · 抓取 ' + progress.fetchRequests + ' 次正文' : '') + ' · 找到 ' + progress.sources.length + ' 条官方资料';
    const labels = { waiting: '等待开始', searching: '搜索中', complete: '已完成', failed: '失败' };
    const tasks = status.querySelector('.ai-search-tasks');
    for (const task of progress.tasks) {
      let item = Array.from(tasks.children).find(node => node.dataset.taskId === task.id);
      if (!item) { item = document.createElement('li'); item.dataset.taskId = task.id; tasks.append(item); }
      item.className = 'ai-task-' + task.status;
      item.textContent = task.title + '：' + (labels[task.status] || '等待开始');
    }
    const section = status.querySelector('.ai-live-results');
    section.hidden = !progress.sources.length;
    const list = section.querySelector('.ai-live-source-list');
    for (const source of progress.sources) {
      const url = window.StarPath.ai.safeUrl(source.url);
      if (!url || Array.from(list.children).some(node => node.dataset.sourceUrl === url)) continue;
      const item = document.createElement('li');
      item.dataset.sourceUrl = url;
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = window.StarPath.ai.sourceTitle(source.title);
      const address = document.createElement('small'); address.textContent = url;
      item.append(link, address); list.prepend(item);
    }
    const toggle = section.querySelector('.ai-live-more');
    const showAll = () => { Array.from(list.children).forEach((item, index) => { item.hidden = index >= 5 && !toggle.open; }); };
    toggle.hidden = list.children.length <= 5;
    toggle.ontoggle = showAll;
    showAll();
    const summaries = section.querySelector('.ai-live-summaries');
    const signature = JSON.stringify(progress.summaries);
    if (summaries.dataset.signature !== signature) {
      summaries.dataset.signature = signature;
      summaries.replaceChildren(...progress.summaries.map(value => { const paragraph = document.createElement('p'); paragraph.textContent = window.StarPath.ai.displayText(value); return paragraph; }));
    }
  }
  function updateApiKeyStatus(message = '') {
    const state = window.StarPath.aiCredentials.status();
    const target = modal.querySelector('[data-api-key-status]');
    if (target) target.textContent = message || (state.configured ? '已配置 API Key。' : '尚未配置 API Key。') + (state.memoryOnly ? ' 浏览器存储不可用，仅本次打开有效。' : ' 密钥仅保存在当前浏览器，直到手动清除，不随成长备份导出。');
  }
  function saveApiKey() {
    const field = modal.querySelector('#ai-api-key');
    window.StarPath.aiCredentials.save(field.value);
    field.value = '';
    field.type = 'password';
    modal.querySelector('[data-action="ai-key-toggle"]').textContent = '显示';
    modal.querySelector('[data-action="ai-key-toggle"]').setAttribute('aria-pressed', 'false');
    modal.querySelector('#modal-error').hidden = true;
    updateApiKeyStatus();
  }
  function openAiProfile() {
    const values = aiProfile || { level: '', major: '', grade: '', baseline: '', goal: '', region: '山东', startDate: localDate() };
    const input = (label, name, max, placeholder = '') => '<label class="form-field">' + label + ' *<input name="' + name + '" required maxlength="' + max + '" value="' + esc(values[name]) + '" placeholder="' + esc(placeholder) + '"></label>';
    const textarea = (label, name, placeholder) => '<label class="form-field">' + label + (name === 'goal' ? '' : ' *') + '<textarea name="' + name + '" rows="3" maxlength="1000"' + (name === 'goal' ? '' : ' required') + ' placeholder="' + esc(placeholder) + '">' + esc(values[name]) + '</textarea></label>';
    const status = '<div class="ai-status" hidden><p class="ai-elapsed" role="timer" aria-live="off"></p><ol class="ai-progress"><li data-ai-step="search"><span class="ai-progress-dot" aria-hidden="true"></span><div><strong>AI 搜索资料</strong><p>等待开始</p></div></li><li data-ai-step="learning" hidden><span class="ai-progress-dot" aria-hidden="true"></span><div><strong>AI 设计学习行动</strong><p>等待生成</p></div></li><li data-ai-step="generate"><span class="ai-progress-dot" aria-hidden="true"></span><div><strong>AI 思考并生成计划</strong><p>等待检索完成</p></div></li></ol><p class="ai-search-count" role="status" aria-live="polite"></p><ul class="ai-search-tasks"></ul><section class="ai-live-results" hidden><h3>已找到的官方资料</h3><ul class="ai-source-list ai-live-source-list"></ul><details class="ai-live-more" hidden><summary>展开全部资料</summary></details><h3>AI 根据资料整理</h3><div class="ai-live-summaries"></div><p class="inline-note">摘要随检索更新，院校候选仍需核对；资料和学习行动核验完成后统一预览。</p></section></div>';
    const body = '<form data-form="ai-profile"><div class="ai-step-label"><span class="is-current">01 填写情况</span><span>02 联网生成</span><span>03 预览保存</span></div>' +
      '<p class="modal-description">告诉我们你的目标与基础，AI 会分工检索官方资料；未指定院校时同时设计学习行动，核验完成后生成可以修改的阶段计划。填写内容将发送给 AI。</p>' +
      '<fieldset class="ai-fields"><section class="ai-key-manager" aria-label="DeepSeek API Key 管理"><label class="form-field" for="ai-api-key">DeepSeek API Key<input id="ai-api-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="512" placeholder="输入新密钥；已配置时留空可继续使用" aria-describedby="ai-api-key-status"></label><div class="ai-key-actions"><button type="button" class="button secondary small" data-action="ai-key-toggle" aria-controls="ai-api-key" aria-pressed="false">显示</button><button type="button" class="button secondary small" data-action="ai-key-save">保存/更换</button><button type="button" class="text-button" data-action="ai-key-clear">清除</button></div><p id="ai-api-key-status" class="ai-school-note" data-api-key-status role="status" aria-live="polite"></p></section><div class="form-row"><label class="form-field">当前学历层次 *<select name="level" required autofocus><option value="">请选择</option>' +
      ['专科', '本科'].map(level => '<option' + (values.level === level ? ' selected' : '') + '>' + level + '</option>').join('') +
      '</select></label>' + input('专业', 'major', 120, '例如：计算机网络技术') + '</div><div class="form-row"><label class="form-field">年级 *<select name="grade" required' + (values.level ? '' : ' disabled') + '>' +
      aiGradeOptions(values.level, values.grade) + '</select></label>' + input('目标地区', 'region', 80, '例如：山东') + '</div>' +
      textarea('当前学习基础', 'baseline', '例如：英语基础较弱，数学刚开始复习') + textarea('目标院校与专业', 'goal', '请输入心仪院校和专业') + '<p class="ai-school-note">可以写具体院校，也可以写筛选条件，例如“济南本地一本院校，计算机相关专业”。未指定具体学校时会推荐三所院校；由于需要先筛选并核实多所院校，生成计划可能需要更长时间。一本/二本按批次取消前的历史招生层次参考。目标里的具体地点优先于目标地区，暂时没有目标院校也可以留空。</p>' +
      '<label class="form-field">开始日期 *<input name="startDate" type="date" min="1900-01-01" max="9999-12-31" required value="' + esc(values.startDate) + '"></label>' +
      '<p class="inline-note ai-period-note">本科按开始日期所在学年、四年制推算至大四考研；专科暂按三年专科衔接两年本科推算，路径与资格待核实。对应年度考试日期未公布时，日期仅为考试季暂定安排，公布后请调整。</p></fieldset>' +
      status + modalError + modalActions('检索并生成计划', '<button type="button" class="text-button" data-action="ai-template">使用原始模板</button>') + '</form>';
    openModal('为你规划升学路线', body);
    modal.classList.add('ai-modal');
    updateApiKeyStatus();
  }
  function openAiPreview() {
    if (!aiDraft) throw new Error('没有可保存的 AI 计划，请重新生成。');
    const stages = [...new Set(aiDraft.tasks.map(task => task.stage))];
    const duration = aiDraft.generation.durationSeconds !== undefined ? '<p class="ai-duration">' + aiDuration(aiDraft.generation.durationSeconds) + '</p>' : '';
    const period = aiDraft.generation.period ? '<p class="ai-period-summary">计划安排：' + esc(aiDraft.generation.period.startDate) + ' 至 ' + esc(aiDraft.generation.period.endDate) + (aiDraft.generation.period.dateStatus === 'estimated' ? '（' + aiDraft.generation.period.targetExamYear + '年考试季暂定安排；初试日期未公布，公布后请调整）' : '（考研初试前一天）') + '<br>' + esc(aiDraft.generation.period.planningBasis || '') + '</p>' : '';
    openModal('预览你的升学计划', '<form data-form="ai-save">' + duration + period + '<div class="ai-preview-heading"><span class="section-kicker">AI 学习建议 · ' + aiDraft.tasks.length + ' 项行动</span><h3>' + esc(aiDraft.title) + '</h3><p>' + esc(aiDraft.goal) + '</p></div><p class="inline-note">以下日期是建议学习安排。保存后可修改任务、目标与日期；任务完成情况由你记录。</p><div class="ai-task-preview">' + stages.map((stage, index) => '<section><h3><span>0' + (index + 1) + '</span>' + esc(stage) + '</h3><ol>' + aiDraft.tasks.filter(task => task.stage === stage).map(task => '<li><span>' + esc(task.title) + '</span><time datetime="' + esc(task.dueDate) + '">' + esc(task.dueDate) + '</time></li>').join('') + '</ol></section>').join('') + '</div>' + aiEvidence(aiDraft.generation) + modalError + modalActions('保存到我的成长', '<button type="button" class="text-button" data-action="ai-edit">返回修改</button><button type="button" class="text-button" data-action="ai-regenerate">重新生成</button>') + '</form>');
    modal.classList.add('ai-modal');
  }
  async function startAiGeneration(form) {
    if (aiRequest) return;
    let controller;
    let timer;
    try {
      if (store.get().plans.length >= 20) throw new Error('最多可保存20份计划，请先整理已有计划。');
      const fields = new FormData(form);
      aiProfile = Object.fromEntries(['level', 'major', 'grade', 'baseline', 'goal', 'region', 'startDate'].map(name => [name, fields.get(name)]));
      window.StarPath.ai.validateProfile(aiProfile);
      const keyField = form.querySelector('#ai-api-key');
      if (keyField.value.trim()) saveApiKey();
      const apiKey = window.StarPath.aiCredentials.get();
      if (!apiKey) {
        keyField.focus();
        throw new Error('请先填写 DeepSeek API Key。');
      }
      aiDraft = null;
      controller = new AbortController();
      aiRequest = controller;
      const startedAt = performance.now();
      const error = form.querySelector('#modal-error');
      error.hidden = true;
      form.querySelector('fieldset').disabled = true;
      form.querySelector('fieldset').hidden = true;
      form.querySelector('[type="submit"]').disabled = true;
      form.querySelector('[data-action="ai-template"]').hidden = true;
      form.setAttribute('aria-busy', 'true');
      const status = form.querySelector('.ai-status');
      status.hidden = false;
      status.querySelectorAll('.is-active, .is-complete').forEach(node => node.classList.remove('is-active', 'is-complete'));
      status.querySelector('[data-ai-step="learning"]').hidden = true;
      status.querySelector('.ai-search-tasks').replaceChildren();
      status.querySelector('.ai-live-source-list').replaceChildren();
      status.querySelector('.ai-live-summaries').replaceChildren();
      delete status.querySelector('.ai-live-summaries').dataset.signature;
      status.querySelector('.ai-live-results').hidden = true;
      status.querySelector('.ai-live-more').open = false;
      status.querySelector('.ai-search-count').textContent = '正在分配搜索任务…';
      const steps = form.querySelectorAll('.ai-step-label span');
      steps[0].classList.remove('is-current');
      steps[1].classList.add('is-current');
      const elapsed = () => Math.floor((performance.now() - startedAt) / 1000);
      const updateTime = () => { if (aiRequest === controller && form.isConnected) status.querySelector('.ai-elapsed').textContent = aiDuration(elapsed(), '已用时'); };
      updateTime();
      timer = setInterval(updateTime, 1000);
      aiTimer = timer;
      modal.scrollTop = 0;
      const draft = await window.StarPath.ai.generate(aiProfile, { apiKey, signal: controller.signal, onStage(stage) {
        if (aiRequest !== controller || !modal.open || !form.isConnected) return;
        const searching = stage === 'search';
        const search = status.querySelector('[data-ai-step="search"]');
        const thinking = status.querySelector('[data-ai-step="generate"]');
        search.classList.toggle('is-active', searching);
        search.classList.toggle('is-complete', !searching);
        thinking.classList.toggle('is-active', !searching);
        search.querySelector('p').textContent = searching ? '正在核对官方政策和院校资料，最多八个请求并行处理…' : '官方资料检索完成';
        thinking.querySelector('p').textContent = searching ? '等待资料与学习行动完成' : '正在整合已核验资料，完善考前学习计划…';
      }, onProgress(progress) {
        if (aiRequest !== controller || controller.signal.aborted || !modal.open || !form.isConnected) return;
        updateAiProgress(status, progress);
      } });
      if (aiRequest !== controller || controller.signal.aborted || !modal.open || !form.isConnected) return;
      aiRequest = null;
      draft.generation.durationSeconds = elapsed();
      aiDraft = draft;
      openAiPreview();
    } catch (error) {
      if ((!controller || aiRequest === controller) && modal.open && form.isConnected && error.name !== 'AbortError') {
        errorMessage(error);
        if (controller) {
          const status = form.querySelector('.ai-status');
          status.querySelectorAll('.is-active').forEach(node => node.classList.remove('is-active'));
          status.querySelector('[data-ai-step="search"] p').textContent = '搜索已停止，已找到的资料保留供查看';
          status.querySelectorAll('.ai-task-searching, .ai-task-waiting').forEach(node => {
            node.textContent = node.textContent.replace(/(?:搜索中|等待开始)$/, '已停止');
            node.className = 'ai-task-waiting';
          });
        }
      }
    } finally {
      clearInterval(timer);
      if (aiTimer === timer) aiTimer = null;
      if (controller && aiRequest === controller) {
        aiRequest = null;
        if (form.isConnected) {
          form.querySelector('fieldset').disabled = false;
          form.querySelector('fieldset').hidden = false;
          form.querySelector('[type="submit"]').disabled = false;
          form.querySelector('[data-action="ai-template"]').hidden = false;
          form.removeAttribute('aria-busy');
          form.querySelector('.ai-status').hidden = !form.querySelector('.ai-live-source-list').children.length;
          form.querySelectorAll('.ai-step-label span')[0].classList.add('is-current');
          form.querySelectorAll('.ai-step-label span')[1].classList.remove('is-current');
          form.querySelector('[type="submit"]').focus();
        }
      }
    }
  }
  function openCreate(templateId, tribute = false) {
    const template = routeById(templateId);
    const preset = tribute ? data.anniversary.tribute : null;
    const existing = store.get().plans.filter(plan => plan.templateId === templateId).length;
    const title = preset ? preset.title : template ? '我的' + template.name + '计划' : '我的成长计划';
    const description = preset ? '将创建一份包含三个献礼行动的独立计划。创建后可以修改任务、日期和完成状态；已有计划保持不变。' : template ? '将创建一份包含' + template.stages.length + '个阶段、' + taskCount(template) + '项任务的个人计划。你可以自由编辑目标、任务和日期。' : '从一个明确的小目标开始，随后为它添加具体任务。';
    const preview = preset ? '<ol class="tribute-task-preview">' + preset.tasks.map(task => '<li><strong>' + esc(task.stage) + '</strong><span>' + esc(task.title) + '</span></li>').join('') + '</ol><p class="inline-note">行动为平台建议，由你自行记录完成情况。每次提交都会新建一份计划。</p>' : '';
    openModal(preset ? '开启我的校庆献礼计划' : template ? '开始我的' + template.name + '路线' : '新建成长计划', '<form data-form="create-plan"' + (preset ? ' data-preset="tribute"' : '') + '><input type="hidden" name="templateId" value="' + esc(templateId || '') + '"><p class="modal-description">' + description + '</p>' + preview + (existing && template ? '<p class="inline-note">你已有 ' + existing + ' 份同类路线计划，这次会创建独立的新计划。</p>' : '') + '<label class="form-field">计划名称<input name="title" required maxlength="120" value="' + esc(title) + '" autofocus></label><label class="form-field">我的目标 <span class="field-optional">选填</span><textarea name="goal" rows="3" maxlength="1000" placeholder="例如：完成一个可以给同学演示的小项目">' + esc(preset ? preset.goal : '') + '</textarea></label>' + modalError + modalActions('创建计划') + '</form>');
  }
  function openPlanEdit(planId) {
    const plan = store.get().plans.find(item => item.id === planId);
    if (!plan) throw new Error('这份计划已不存在。');
    openModal('编辑我的成长目标', '<form data-form="edit-plan" data-plan="' + planId + '"><label class="form-field">计划名称<input name="title" required maxlength="120" value="' + esc(plan.title) + '" autofocus></label><label class="form-field">我的目标<textarea name="goal" rows="4" maxlength="1000" placeholder="写下你希望通过这份计划实现什么">' + esc(plan.goal) + '</textarea></label>' + modalError + modalActions() + '</form>');
  }
  function openTaskEdit(planId, taskId) {
    const plan = store.get().plans.find(item => item.id === planId);
    if (!plan) throw new Error('这份计划已不存在。');
    const task = taskId ? plan.tasks.find(item => item.id === taskId) : null;
    if (taskId && !task) throw new Error('这项任务已不存在。');
    if (!task && plan.tasks.length >= 100) throw new Error('每份计划最多支持100项任务，请先整理现有任务。');
    const stages = [...new Set(plan.tasks.map(item => item.stage))];
    openModal(task ? '编辑这一步' : '添加一个小目标', '<form data-form="task" data-plan="' + planId + '" data-task="' + esc(taskId || '') + '"><label class="form-field">任务内容<input name="title" required maxlength="180" value="' + esc(task ? task.title : '') + '" placeholder="一个具体、可以完成的行动" autofocus></label><div class="form-row"><label class="form-field">所属阶段<input name="stage" list="stage-options" maxlength="80" required value="' + esc(task ? task.stage : stages[stages.length - 1] || '我的行动') + '"><datalist id="stage-options">' + stages.map(stage => '<option value="' + esc(stage) + '"></option>').join('') + '</datalist></label><label class="form-field">目标日期 <span class="field-optional">选填</span><input type="date" name="dueDate" min="1900-01-01" max="9999-12-31" value="' + esc(task ? task.dueDate : '') + '"></label></div>' + modalError + modalActions(task ? '保存修改' : '添加任务', task ? '<button type="button" class="text-button danger-text" data-action="delete-task" data-plan="' + planId + '" data-task="' + task.id + '">删除任务</button>' : '') + '</form>');
  }
  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function refreshFavorites() {
    const activePerson = document.activeElement?.dataset.person;
    const favorites = store.get().favorites;
    document.querySelectorAll('[data-action="favorite"]').forEach(button => {
      const person = personById(button.dataset.person);
      const active = favorites.includes(person.id);
      button.classList.toggle('is-favorite', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', (active ? '取消收藏' : '收藏') + person.name);
      button.title = active ? '取消收藏' : '收藏校友';
    });
    if (current.page === 'alumni' && !current.id) {
      updateAlumniResults();
      if (activePerson) {
        const nextFocus = main.querySelector('[data-action="favorite"][data-person="' + activePerson + '"]') || document.getElementById('alumni-query');
        nextFocus?.focus({ preventScroll: true });
      }
    }
  }
  function errorMessage(error) {
    const target = modal.open && document.getElementById('modal-error');
    if (target) { target.hidden = false; target.textContent = error.message || '操作未完成，请重试。'; }
    else toast(error.message || '操作未完成，请重试。');
  }
  function prepareArrowAnimations(root) {
    root.querySelectorAll('select:not([data-arrow-select])').forEach(select => {
      const wrapper = document.createElement('span');
      wrapper.className = 'loop-select';
      wrapper.setAttribute('data-arrow-action', '');
      const marginTop = parseFloat(getComputedStyle(select).marginTop) || 0;
      wrapper.style.setProperty('--select-arrow-shift', marginTop / 2 + 'px');
      select.setAttribute('data-arrow-select', '');
      select.before(wrapper);
      wrapper.append(select);
      wrapper.insertAdjacentHTML('beforeend', icon('down'));
    });
    root.querySelectorAll('.ai-live-more summary:not([data-arrow-action])').forEach(summary => {
      summary.setAttribute('data-arrow-action', '');
      summary.insertAdjacentHTML('afterbegin', icon('chevron', 'loop-disclosure-arrow'));
    });
    root.querySelectorAll('[data-arrow-kind]').forEach(source => {
      const kind = source.getAttribute('data-arrow-kind');
      const direction = arrowDirections[kind];
      if (!direction) return;
      const action = source.closest('a,button,summary,.loop-select') || source.parentElement;
      action.setAttribute('data-arrow-action', '');
      const computed = getComputedStyle(source);
      const wrapper = document.createElement('span');
      wrapper.className = 'icon loop-arrow' + (source.classList.contains('loop-disclosure-arrow') ? ' loop-disclosure-arrow' : '');
      wrapper.setAttribute('aria-hidden', 'true');
      wrapper.style.width = computed.width !== 'auto' ? computed.width : computed.fontSize;
      wrapper.style.height = computed.height !== 'auto' ? computed.height : computed.fontSize;
      wrapper.style.margin = source.style.margin;
      wrapper.style.fontSize = computed.fontSize;
      wrapper.style.setProperty('--loop-arrow-step-x', direction[0] + '%');
      wrapper.style.setProperty('--loop-arrow-step-y', direction[1] + '%');
      wrapper.style.setProperty('--loop-arrow-duration', direction[2]);
      const track = document.createElement('span');
      track.className = 'loop-arrow-track';
      const transfer = kind === 'download' || kind === 'upload';
      [-2, -1, 0, 1].forEach(index => {
        const copy = source.cloneNode(true);
        copy.removeAttribute('data-arrow-kind');
        copy.setAttribute('class', 'loop-arrow-copy');
        copy.style.setProperty('--loop-arrow-copy-x', index * direction[0] + '%');
        copy.style.setProperty('--loop-arrow-copy-y', index * direction[1] + '%');
        if (transfer) {
          copy.setAttribute('viewBox', '0 0 24 16');
          copy.querySelector('path').setAttribute('d', kind === 'download' ? 'M12 3v12m-5-5 5 5 5-5' : 'M12 16V4m-5 5 5-5 5 5');
        }
        track.append(copy);
      });
      if (transfer) {
        const base = source.cloneNode(true);
        base.removeAttribute('data-arrow-kind');
        base.setAttribute('class', 'loop-arrow-base');
        base.querySelector('path').setAttribute('d', 'M4 15v5h16v-5');
        wrapper.append(base);
        const window = document.createElement('span');
        window.className = 'loop-arrow-window';
        window.append(track);
        wrapper.append(window);
      } else wrapper.append(track);
      source.replaceWith(wrapper);
    });
    root.querySelectorAll(arrowActionSelector).forEach(action => {
      if (arrowAnimationStates.has(action)) return;
      const isHeader = action.matches('.header-action');
      const glyph = action.querySelector(isHeader ? '.header-arrow-glyph' : '.loop-arrow-track');
      if (!glyph) return;
      const animationName = isHeader ? 'header-arrow-out' : 'loop-arrow-travel';
      let hovered = false;
      const isActive = () => hovered || action.matches(':focus-visible') || Boolean(action.querySelector(':focus-visible'));
      const stop = () => {
        action.classList.remove('is-arrow-running');
        action.style.removeProperty('--arrow-iterations');
      };
      const update = () => {
        if (reducedMotion.matches || action.matches(':disabled') || action.querySelector('select:disabled')) { stop(); return; }
        if (isActive()) {
          action.style.removeProperty('--arrow-iterations');
          action.classList.add('is-arrow-running');
          return;
        }
        if (!action.classList.contains('is-arrow-running')) return;
        const animation = glyph.getAnimations().find(item => item.animationName === animationName);
        if (!animation) { stop(); return; }
        const duration = animation.effect.getComputedTiming().duration;
        // 保留已播放的轮数，仅让当前轮完成；改变轮数不会重置播放进度。
        const iterations = Math.max(1, Math.ceil(Number(animation.currentTime) / duration));
        action.style.setProperty('--arrow-iterations', String(iterations));
      };
      arrowAnimationStates.set(action, update);
      action.addEventListener('mouseenter', () => { hovered = true; update(); });
      action.addEventListener('mouseleave', () => { hovered = false; update(); });
      action.addEventListener('focusin', update);
      action.addEventListener('focusout', () => queueMicrotask(update));
      glyph.addEventListener('animationend', event => {
        if (event.target === glyph && event.animationName === animationName && !isActive()) stop();
      });
      if (action.matches(':hover')) hovered = true;
      update();
    });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
    const href = link.getAttribute('href');
    const card = link.closest('.people-grid [data-alumni-id]');
    if ((renderedRoute === 'home' || renderedRoute === 'alumni') && card && href === '#/alumni/' + card.dataset.alumniId) {
      const origin = {
        route: renderedRoute,
        personId: card.dataset.alumniId,
        filters: { ...filters },
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        trigger: link.classList.contains('card-link') ? 'story' : link.closest('.person-cover') ? 'photo' : 'name'
      };
      writeAlumniHistory({ session: alumniNavigationSession, route: renderedRoute, origin });
      pendingAlumniNavigation = { from: renderedRoute, route: 'alumni/' + origin.personId, origin };
    } else if (current.page === 'alumni' && current.id && alumniHistoryEntry?.origin) {
      const originRoute = alumniHistoryEntry.origin.route || 'alumni';
      if (href === (originRoute === 'home' ? '#/' : '#/alumni')) {
        pendingAlumniNavigation = { from: renderedRoute, route: originRoute, origin: alumniHistoryEntry.origin };
      }
    }
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-history-entry]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download') || reducedMotion.matches) return;
    event.preventDefault();
    if (historyNavigationTimer) return;
    historyNavigationLink = link;
    link.classList.add('history-link-activating');
    function navigate() {
      if (historyNavigationLink !== link || !link.isConnected) return;
      clearTimeout(historyNavigationTimer);
      historyNavigationTimer = null;
      historyTransitionPending = !link.hasAttribute('data-history-fill');
      location.hash = link.hash;
    }
    if (link.hasAttribute('data-history-fill')) {
      clearHistoryScreenFill();
      const bounds = link.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      const radius = Math.ceil(Math.max(Math.hypot(x, y), Math.hypot(window.innerWidth - x, y), Math.hypot(x, window.innerHeight - y), Math.hypot(window.innerWidth - x, window.innerHeight - y)) + 2);
      const fill = document.createElement('div');
      fill.className = 'history-screen-fill';
      fill.setAttribute('aria-hidden', 'true');
      fill.setAttribute('inert', '');
      const disc = document.createElement('div');
      disc.className = 'history-screen-fill-disc';
      disc.style.left = x - radius + 'px';
      disc.style.top = y - radius + 'px';
      disc.style.width = disc.style.height = radius * 2 + 'px';
      disc.style.backgroundColor = getComputedStyle(link).backgroundColor;
      disc.addEventListener('transitionend', event => {
        if (event.propertyName === 'transform' && historyScreenFill === fill && !fill.classList.contains('is-revealing')) navigate();
      });
      fill.appendChild(disc);
      document.body.appendChild(fill);
      historyScreenFill = fill;
      fill.getBoundingClientRect();
      fill.classList.add('is-filling');
    }
    historyNavigationTimer = setTimeout(navigate, link.hasAttribute('data-history-fill') ? 480 : 160);
  });
  main.addEventListener('click', event => {
    const summary = event.target.closest('.method-card>summary, .stage-guide>summary');
    if (!summary || event.defaultPrevented) return;
    event.preventDefault();
    const card = summary.parentElement;
    const state = readingAnimations.get(card);
    setReadingExpanded(card, !(state ? state.expanded : card.open));
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, person, value, template, plan, task } = button.dataset;
    if (action === 'copy-code') { copyCode(button); return; }
    try {
      if (action === 'scroll-to') {
        const target = document.getElementById(value);
        if (target) {
          if (target.matches('.method-card, .stage-guide')) setReadingExpanded(target, true);
          else if (target.tagName === 'DETAILS') target.open = true;
          const focusTarget = target.tagName === 'DETAILS' ? target.querySelector('summary') : target;
          if (focusTarget === target) target.setAttribute('tabindex', '-1');
          focusTarget.focus({ preventScroll: true });
          target.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
        }
      }
      else if (action === 'favorite') { const persisted = store.toggleFavorite(person); refreshFavorites(); saved(persisted, store.get().favorites.includes(person) ? '已收藏这个成长故事' : '已取消收藏'); }
      else if (action === 'filter-favorites') { filters.favorites = !filters.favorites; syncAlumniFilters(); updateAlumniResults(); }
      else if (action === 'filter-direction') { filters.direction = value; syncAlumniFilters(); updateAlumniResults(); }
      else if (action === 'reset-filters') { Object.assign(filters, { query: '', field: 'all', direction: 'all', favorites: false }); syncAlumniFilters(); updateAlumniResults(); document.getElementById('alumni-query').focus({ preventScroll: true }); }
      else if (action === 'create-plan') { if (template === 'education') { resetAi(); openAiProfile(); } else openCreate(template || null); }
      else if (action === 'ai-template') { resetAi(); openCreate('education'); }
      else if (action === 'ai-key-save') { if (!aiRequest) saveApiKey(); }
      else if (action === 'ai-key-clear') {
        if (aiRequest) return;
        const field = modal.querySelector('#ai-api-key');
        field.value = ''; field.type = 'password';
        const toggle = modal.querySelector('[data-action="ai-key-toggle"]');
        toggle.textContent = '显示'; toggle.setAttribute('aria-pressed', 'false');
        window.StarPath.aiCredentials.clear();
        modal.querySelector('#modal-error').hidden = true;
        updateApiKeyStatus();
      }
      else if (action === 'ai-key-toggle') {
        if (aiRequest) return;
        const field = modal.querySelector('#ai-api-key');
        field.type = field.type === 'password' ? 'text' : 'password';
        button.textContent = field.type === 'password' ? '显示' : '隐藏';
        button.setAttribute('aria-pressed', String(field.type === 'text'));
      }
      else if (action === 'ai-edit') { aiDraft = null; openAiProfile(); }
      else if (action === 'ai-regenerate') { aiDraft = null; openAiProfile(); startAiGeneration(modal.querySelector('form')); }
      else if (action === 'create-tribute') openCreate(null, true);
      else if (action === 'edit-plan') openPlanEdit(plan);
      else if (action === 'add-task') openTaskEdit(plan);
      else if (action === 'edit-task') openTaskEdit(plan, task);
      else if (action === 'close-modal') modal.close();
      else if (action === 'delete-plan') {
        const entry = store.get().plans.find(item => item.id === plan);
        openModal('删除这份成长计划？', '<form data-form="delete-plan" data-plan="' + plan + '"><p class="modal-description">将移除「' + esc(entry.title) + '」及其中的任务。需要保留时，请先导出备份。</p>' + modalError + modalActions('确认删除') + '</form>');
      } else if (action === 'delete-task') {
        const entry = store.get().plans.find(item => item.id === plan).tasks.find(item => item.id === task);
        openModal('删除这项任务？', '<form data-form="delete-task" data-plan="' + plan + '" data-task="' + task + '"><p class="modal-description">' + esc(entry.title) + '</p>' + modalError + modalActions('确认删除') + '</form>');
      } else if (action === 'export') { download(store.exportBackup(), '商职星途-成长备份-' + localDate() + '.json'); toast('已发起备份下载，请检查浏览器下载记录'); }
      else if (action === 'export-raw') { download(store.damagedRaw() || '', '商职星途-原始记录.json'); toast('已发起原始记录下载'); }
      else if (action === 'import') { cancelImport(); fileInput.value = ''; fileInput.click(); }
    } catch (error) { errorMessage(error); }
  });
  main.addEventListener('focusin', event => {
    const line = event.target.closest('.history-timeline .inline-source');
    if (!line) return;
    finishHistoryLine(line);
  });
  main.addEventListener('input', event => { if (event.target.id === 'alumni-query') { filters.query = event.target.value; updateAlumniResults(); } });
  modal.addEventListener('change', event => {
    if (!event.target.matches('[data-form="ai-profile"] [name="level"]')) return;
    const grade = event.target.closest('form').querySelector('[name="grade"]');
    grade.innerHTML = aiGradeOptions(event.target.value, grade.value);
    grade.disabled = !event.target.value;
    arrowAnimationStates.get(grade.parentElement)?.();
  });
  main.addEventListener('change', event => {
    const target = event.target;
    try {
      if (target.id === 'field-filter') { filters.field = target.value; updateAlumniResults(); }
      else if (target.matches('input[type="checkbox"][data-task]')) {
        const bounds = target.nextElementSibling.getBoundingClientRect();
        let justCompleted = false;
        const persisted = store.editPlan(target.dataset.plan, plan => { const task = plan.tasks.find(item => item.id === target.dataset.task); if (!task) throw new Error('这项任务已不存在。'); justCompleted = target.checked && !task.completed; task.completed = target.checked; });
        render({ keepScroll: true, focusId: target.id });
        if (justCompleted) celebrateTask(bounds);
        saved(persisted, target.checked ? '又向前走了一步，任务已完成' : '已将任务恢复为未完成');
      }
    } catch (error) { errorMessage(error); render({ keepScroll: true }); }
  });
  modal.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    const values = new FormData(form);
    const formType = form.dataset.form;
    if (formType === 'ai-profile') { startAiGeneration(form); return; }
    const title = String(values.get('title') || '').trim();
    try {
      if (['create-plan', 'edit-plan', 'task'].includes(formType) && !title) throw new Error('请填写内容，不能只输入空格。');
      let persisted;
      if (formType === 'ai-save') {
        if (!aiDraft) throw new Error('没有可保存的 AI 计划，请重新生成。');
        const result = store.createAiPlan(aiDraft);
        aiDraft = null;
        modal.close();
        location.hash = '/growth/' + result.id;
        saved(result.persisted, '升学计划已保存，按自己的节奏开始行动');
        return;
      }
      if (formType === 'create-plan') {
        const tribute = form.dataset.preset === 'tribute';
        const details = { title, goal: String(values.get('goal') || '').trim() };
        if (tribute) details.initialTasks = data.anniversary.tribute.tasks.map(task => ({ title: task.title, stage: task.stage }));
        const result = store.createPlan(tribute ? null : values.get('templateId') || null, details);
        persisted = result.persisted;
        modal.close();
        location.hash = '/growth/' + result.id;
        saved(persisted, '成长计划已创建，第一步从现在开始');
        return;
      }
      if (formType === 'edit-plan') persisted = store.editPlan(form.dataset.plan, plan => { plan.title = title; plan.goal = String(values.get('goal') || '').trim(); });
      else if (formType === 'task') {
        const stage = String(values.get('stage') || '').trim();
        if (!stage) throw new Error('请填写所属阶段。');
        persisted = store.editPlan(form.dataset.plan, plan => {
          const fields = { title, stage, dueDate: String(values.get('dueDate') || '') };
          if (form.dataset.task) { const task = plan.tasks.find(item => item.id === form.dataset.task); if (!task) throw new Error('这项任务已不存在。'); Object.assign(task, fields); }
          else { if (plan.tasks.length >= 100) throw new Error('每份计划最多支持100项任务。'); plan.tasks.push({ id: store.uid(), ...fields, completed: false }); }
        });
      } else if (formType === 'delete-plan') {
        persisted = store.deletePlan(form.dataset.plan);
        modal.close();
        if (location.hash === '#/growth') render({ keepScroll: true, routeChange: true }); else location.hash = '/growth';
        saved(persisted, '已删除这份计划');
        return;
      } else if (formType === 'delete-task') persisted = store.editPlan(form.dataset.plan, plan => { plan.tasks = plan.tasks.filter(task => task.id !== form.dataset.task); });
      else if (formType === 'import') {
        if (!pendingImport) throw new Error('没有可导入的数据，请重新选择文件。');
        persisted = store.replace(pendingImport);
        pendingImport = null;
        modal.close();
        if (location.hash === '#/growth') render({ routeChange: true }); else location.hash = '/growth';
        saved(persisted, '备份已恢复');
        return;
      } else throw new Error('未识别的操作。');
      modal.close();
      const focusSelector = formType === 'edit-plan' ? '[data-action="edit-plan"]' : formType === 'task' && form.dataset.task ? '[data-action="edit-task"][data-task="' + form.dataset.task + '"]' : '[data-action="add-task"]';
      render({ keepScroll: true, focusSelector });
      saved(persisted, formType === 'delete-task' ? '已删除任务' : '修改已保存');
    } catch (error) { errorMessage(error); }
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    cancelImport();
    const requestId = importRequestId;
    if (!file) return;
    try {
      if (file.size > store.backupMaxBytes) throw new Error('请选择不超过32 MiB的备份文件。');
      const text = await file.text();
      if (requestId !== importRequestId) return;
      const imported = store.parseBackup(text);
      pendingImport = imported;
      const tasks = imported.plans.flatMap(plan => plan.tasks);
      const existing = store.get();
      openModal('确认恢复这份备份？', '<form data-form="import"><p class="modal-description">请先核对内容。导入会替换当前的 ' + existing.plans.length + ' 份计划与 ' + existing.favorites.length + ' 位校友收藏，不会与现有记录合并。</p><div class="import-summary"><div><strong>' + imported.plans.length + '</strong><span>成长计划</span></div><div><strong>' + tasks.length + '</strong><span>任务</span></div><div><strong>' + imported.favorites.length + '</strong><span>校友收藏</span></div></div><ul class="import-plan-list">' + imported.plans.map(plan => '<li>' + esc(plan.title) + '<span>' + store.progress(plan).percent + '%</span></li>').join('') + '</ul><p class="inline-note">建议先导出现有记录，确认后再恢复备份。</p>' + modalError + modalActions('确认替换并恢复', '<button type="button" class="text-button" data-action="export">导出现有记录</button>') + '</form>', true);
    } catch (error) {
      if (requestId !== importRequestId) return;
      pendingImport = null;
      toast(error.message || '无法读取文件，现有记录未作更改。');
    } finally { if (requestId === importRequestId) fileInput.value = ''; }
  });
  modal.addEventListener('close', () => {
    resetAi();
    modal.classList.remove('ai-modal');
    document.body.classList.remove('modal-open');
    cancelImport();
    if (modalReturnFocus && modalReturnFocus.isConnected) modalReturnFocus.focus({ preventScroll: true });
  });
  modal.addEventListener('click', event => { if (event.target === modal) { const rect = modal.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close(); } });
  window.addEventListener('starpath:change', event => {
    notice();
    if (!event.detail.external) return;
    if (current.page === 'growth') {
      const focused = document.activeElement;
      const returnAction = modalReturnFocus?.dataset.action;
      const returnTask = modalReturnFocus?.dataset.task;
      const focusSelector = main.contains(focused) && focused.dataset.task
        ? '[data-task="' + focused.dataset.task + '"]' : null;
      render({ keepScroll: true, keepModal: true, focusSelector });
      if (modal.open && modalReturnFocus && !modalReturnFocus.isConnected) {
        modalReturnFocus = (returnAction && main.querySelector('[data-action="' + returnAction + '"]' + (returnTask ? '[data-task="' + returnTask + '"]' : '')))
          || main.querySelector('[data-action="add-task"]') || main.querySelector('[data-action="create-plan"]') || main;
      }
      const form = modal.open && modal.querySelector('form[data-plan]');
      if (form) {
        const plan = store.get().plans.find(item => item.id === form.dataset.plan);
        if (!plan || (form.dataset.task && !plan.tasks.some(task => task.id === form.dataset.task))) {
          errorMessage(new Error(!plan ? '这份计划已在其他页面删除，当前输入仍保留。' : '这项任务已在其他页面删除，当前输入仍保留。'));
        }
      }
    } else refreshFavorites();
  });
  modal.addEventListener('cancel', () => { cancelImport(); resetAi(); });
  window.addEventListener('hashchange', () => { cancelImport(); resetAi(); render({ routeChange: true }); });
  window.addEventListener('resize', () => { clearAlumniTransition(true); clearReadingAnimations(); });
  window.addEventListener('scroll', () => {
    if (alumniTransition && (Math.abs(window.scrollX - alumniTransition.scrollX) > 1 || Math.abs(window.scrollY - alumniTransition.scrollY) > 1)) clearAlumniTransition(true);
  }, { passive: true });
  reducedMotion.addEventListener('change', () => {
    document.querySelectorAll(arrowActionSelector).forEach(action => arrowAnimationStates.get(action)?.());
    if (!reducedMotion.matches) return;
    clearReadingAnimations();
    clearAlumniTransition(true);
    if (historyNavigationTimer && historyNavigationLink) {
      const hash = historyNavigationLink.hash;
      clearHistoryNavigation();
      historyTransitionPending = false;
      location.hash = hash;
    }
    clearHistoryScreenFill();
    clearPageTransition();
    clearHistoryReveal();
    clearHistoryTitleAnimation(true);
    main.querySelectorAll('.history-line-pending,.history-line-prepared').forEach(finishHistoryLine);
    main.querySelectorAll('.alumni-result-enter').forEach(card => {
      card.classList.remove('alumni-result-enter');
      card.style.removeProperty('--result-delay');
    });
  });
  document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); main.focus(); main.scrollIntoView(); });
  prepareArrowAnimations(document);
  render();
})();
