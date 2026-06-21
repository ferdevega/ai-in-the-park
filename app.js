// AI in the Park — vanilla JS app, path-based routing.
//
// URLs:
//   /                          → home landing
//   /stages/:slug              → that stage's section
//   /cards                     → all-cards index
//   /recent                    → recently added
//   /about                     → about page
//   /cards/:slug               → opens the card modal on top of the home view
//
// Each URL above also exists as a pre-built /…/index.html file (see build.js)
// so social shares (LinkedIn, Twitter) get rich previews. Once the SPA loads,
// navigation between URLs uses history.pushState — no full page reload.

const CARD_TYPES = ['mindset', 'tool', 'accelerator', 'best-practice', 'prompt'];

const state = {
  stages: [],
  cards: [],
  filters: { types: new Set(), tags: new Set(), query: '', sort: 'default' },
  view: null,        // 'home' | 'stage:<slug>' | 'cards' | 'recent' | 'about' | 'notfound'
  modalSlug: null,
  lastBgPath: '/',
};

// ---------- Data ----------
async function loadData() {
  const [stagesRes, cardsRes] = await Promise.all([
    fetch('/data/stages.json'),
    fetch('/data/cards.json'),
  ]);
  state.stages = await stagesRes.json();
  state.cards = await cardsRes.json();
  state.stages.sort((a, b) => a.order - b.order);
}

// ---------- DOM helpers ----------
const $   = (sel, root = document) => root.querySelector(sel);
const tpl = (id) => document.getElementById(id).content.cloneNode(true);

const stageBySlug = (slug) => state.stages.find((s) => s.slug === slug);
const cardBySlug  = (slug) => state.cards.find((c) => c.slug === slug);

function cardStages(card) {
  const arr = Array.isArray(card.stage) ? card.stage : [card.stage];
  return arr.map(stageBySlug).filter(Boolean);
}
function cardsForStage(slug) {
  return state.cards.filter((c) => {
    const refs = Array.isArray(c.stage) ? c.stage : [c.stage];
    return refs.includes(slug);
  });
}

function applyFilters(cards) {
  const { types, tags, query, sort } = state.filters;
  const q = query.trim().toLowerCase();
  let out = cards.filter((c) => {
    if (types.size && !c.type.some((t) => types.has(t))) return false;
    if (tags.size && !(c.tags || []).some((t) => tags.has(t))) return false;
    if (q) {
      const hay = [c.title, c.teaser || '', c.body || '', (c.tags || []).join(' ')]
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (sort === 'alpha') out = out.slice().sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === 'newest') out = out.slice().sort((a, b) => (b.added || '').localeCompare(a.added || ''));
  else if (sort === 'oldest') out = out.slice().sort((a, b) => (a.added || '').localeCompare(b.added || ''));
  else if (sort === 'stage') {
    const order = Object.fromEntries(state.stages.map((s) => [s.slug, s.order]));
    const first = (c) => {
      const refs = Array.isArray(c.stage) ? c.stage : [c.stage];
      return Math.min(...refs.map((r) => order[r] ?? 99));
    };
    out = out.slice().sort((a, b) => first(a) - first(b));
  }
  return out;
}

function renderEmpty(target, message) {
  const el = document.createElement('div');
  el.className = 'empty';
  el.innerHTML = message;
  target.appendChild(el);
}

// ---------- Atoms ----------
function makeChip(type) {
  const span = document.createElement('span');
  span.className = `chip ${type}`;
  span.textContent = type.replace('-', ' ');
  return span;
}
function makeCountNode() {
  const n = document.createElement('span');
  n.className = 'result-count';
  return n;
}

function stageColorVar(stage) {
  return `var(--s-${stage.order})`;
}

function bandStyleForTypes(types) {
  const colors = types.map((t) => `var(--t-${t})`);
  if (colors.length === 1) return `background: ${colors[0]};`;
  const stops = [];
  const step = 100 / colors.length;
  colors.forEach((c, i) => {
    const from = (i * step).toFixed(2);
    const to   = ((i + 1) * step).toFixed(2);
    stops.push(`${c} ${from}%`, `${c} ${to}%`);
  });
  return `background: linear-gradient(90deg, ${stops.join(', ')});`;
}

function primaryStageOf(card) {
  const refs = Array.isArray(card.stage) ? card.stage : [card.stage];
  return stageBySlug(refs[0]);
}

const cardHref = (card) => `/cards/${card.slug}`;
const stageHref = (stage) => `/stages/${stage.slug}`;

function renderCardPreview(card, { showStageLabel = false } = {}) {
  const frag = tpl('tpl-card-preview');
  const a = $('a', frag);
  a.setAttribute('href', cardHref(card));

  const band = $('[data-band]', frag);
  band.setAttribute('style', bandStyleForTypes(card.type));

  if (showStageLabel) {
    const stage = primaryStageOf(card);
    if (stage) {
      const label = $('[data-stage-label]', frag);
      label.textContent = stage.title;
      label.style.setProperty('--label-color', stageColorVar(stage));
      label.hidden = false;
    }
  }

  $('[data-title]', frag).textContent = card.title;
  $('[data-teaser]', frag).textContent = card.teaser || '';

  const chips = $('[data-types]', frag);
  card.type.forEach((t) => chips.appendChild(makeChip(t)));

  const levelHost = $('[data-level]', frag);
  if (levelHost) renderLevelDots(levelHost, card.level);

  return frag;
}

function renderCardGrid(target, cards, { countTarget, showStageLabel = false } = {}) {
  target.innerHTML = '';
  if (countTarget) countTarget.textContent = cards.length === 1 ? '1 card' : `${cards.length} cards`;
  if (cards.length === 0) {
    renderEmpty(target, 'no matches — try clearing filters');
    return;
  }
  cards.forEach((c) => target.appendChild(renderCardPreview(c, { showStageLabel })));
}

function renderFilterBar(target, { availableTypes = CARD_TYPES, tags = [], onChange, countNode }) {
  target.innerHTML = '';
  if (availableTypes.length > 0) {
    const typeLabel = document.createElement('span');
    typeLabel.className = 'filter-label';
    typeLabel.textContent = 'type';
    target.appendChild(typeLabel);

    CARD_TYPES.filter((t) => availableTypes.includes(t)).forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip';
      btn.dataset.type = t;
      btn.textContent = t.replace('-', ' ');
      if (state.filters.types.has(t)) btn.classList.add('active');
      btn.addEventListener('click', () => {
        state.filters.types.has(t) ? state.filters.types.delete(t) : state.filters.types.add(t);
        btn.classList.toggle('active');
        onChange();
      });
      target.appendChild(btn);
    });
  }

  if (tags.length) {
    const tagLabel = document.createElement('span');
    tagLabel.className = 'filter-label';
    tagLabel.style.marginLeft = '14px';
    tagLabel.textContent = 'tag';
    target.appendChild(tagLabel);
    tags.forEach((tag) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip';
      btn.textContent = tag;
      if (state.filters.tags.has(tag)) btn.classList.add('active');
      btn.addEventListener('click', () => {
        state.filters.tags.has(tag) ? state.filters.tags.delete(tag) : state.filters.tags.add(tag);
        btn.classList.toggle('active');
        onChange();
      });
      target.appendChild(btn);
    });
  }
  if (countNode) target.appendChild(countNode);
}

// ---------- Spine ----------
function stageHasCards(slug) {
  return state.cards.some((c) => {
    const refs = Array.isArray(c.stage) ? c.stage : [c.stage];
    return refs.includes(slug);
  });
}

function renderSpine(activeSlug = null) {
  const host = $('[data-spine]');
  host.innerHTML = '';
  state.stages.forEach((stage) => {
    const frag = tpl('tpl-spine-tab');
    const a = $('a', frag);
    a.style.setProperty('--tab-color', stageColorVar(stage));
    if (stageHasCards(stage.slug)) {
      a.setAttribute('href', stageHref(stage));
      if (activeSlug === stage.slug) a.classList.add('active');
    } else {
      a.classList.add('disabled');
      a.setAttribute('aria-disabled', 'true');
      $('[data-soon]', frag).hidden = false;
    }
    $('[data-order]', frag).textContent = stage.order;
    $('[data-title]', frag).textContent = stage.title;
    $('[data-abbr]', frag).textContent = stage.abbr || '';
    host.appendChild(frag);
  });
  updateSpineToggle(activeSlug);
}

function updateSpineToggle(activeSlug) {
  const toggle = $('[data-spine-toggle]');
  if (!toggle) return;
  const label = $('[data-toggle-label]', toggle);
  const meta = $('[data-toggle-meta]', toggle);
  const swatch = $('[data-toggle-swatch]', toggle);

  const active = activeSlug ? stageBySlug(activeSlug) : null;
  if (active) {
    label.textContent = active.title;
    meta.textContent = `Stage ${active.order} of ${state.stages.length}`;
    swatch.style.setProperty('--toggle-color', stageColorVar(active));
  } else {
    label.textContent = 'Pick a stage';
    meta.textContent = `${state.stages.length} stages in the playbook`;
    swatch.style.removeProperty('--toggle-color');
  }
}

function setSpineOpen(open) {
  const spine = document.querySelector('.spine');
  const toggle = $('[data-spine-toggle]');
  let backdrop = $('.spine-backdrop');
  if (open && !backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'spine-backdrop';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', () => setSpineOpen(false));
  }
  spine.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (backdrop) backdrop.classList.toggle('open', open);
}

// ---------- Views ----------
function viewHome() {
  state.view = 'home';
  renderSpine(null);
  mount(tpl('tpl-home'));
}

// Helper: render a row of 3 level dots (1, 2, or 3 filled)
function levelDotsCount(level) {
  if (level === 'advanced') return 3;
  if (level === 'intermediate') return 2;
  return 1; // beginner or unspecified
}
function renderLevelDots(host, level) {
  host.innerHTML = '';
  const count = levelDotsCount(level);
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dot.className = 'level-dot' + (i < count ? ' filled' : '');
    host.appendChild(dot);
  }
  host.setAttribute('aria-label', `Difficulty: ${level || 'beginner'}`);
}

function levelLabel(level) {
  if (level === 'advanced') return 'advanced';
  if (level === 'intermediate') return 'intermediate';
  return 'beginner';
}

function viewStage(slug) {
  const stage = stageBySlug(slug);
  if (!stage) return viewNotFound();
  state.view = `stage:${slug}`;
  renderSpine(slug);

  const cards = cardsForStage(slug);
  if (cards.length === 0) {
    const empty = tpl('tpl-stage-empty');
    $('[data-empty-title]', empty).textContent = `${stage.title} — coming soon`;
    $('[data-empty-summary]', empty).textContent = stage.summary || '';
    mount(empty);
    return;
  }

  const frag = tpl('tpl-stage-panel');
  $('[data-stage-title]', frag).textContent = stage.title;
  $('[data-stage-summary]', frag).textContent = stage.summary || '';

  // Stage primer (collapsible). If no primer text, remove the wrapper.
  const primerWrap = $('[data-stage-primer-wrap]', frag);
  const primerBody = $('[data-stage-primer]', frag);
  if (stage.primer && primerBody) {
    primerBody.innerHTML = stage.primer;
  } else if (primerWrap) {
    primerWrap.remove();
  }

  const tags = Array.from(new Set(cards.flatMap((c) => c.tags || []))).sort();
  const availableTypes = Array.from(new Set(cards.flatMap((c) => c.type)));

  const search = $('[data-search]', frag);
  const sort = $('[data-sort]', frag);
  const filterBar = $('[data-filter-bar]', frag);
  const groupedGrid = $('[data-card-grid-grouped]', frag);
  const countNode = makeCountNode();

  const update = () => renderGroupedCardGrid(groupedGrid, applyFilters(cards), { countTarget: countNode });
  search.addEventListener('input', () => { state.filters.query = search.value; update(); });
  sort.addEventListener('change', () => { state.filters.sort = sort.value; update(); });
  renderFilterBar(filterBar, { availableTypes, tags, onChange: update, countNode });
  update();

  mount(frag);
}

// Renders cards grouped into Beginner / Intermediate / Advanced sections.
function renderGroupedCardGrid(target, cards, { countTarget } = {}) {
  target.innerHTML = '';
  if (countTarget) countTarget.textContent = cards.length === 1 ? '1 card' : `${cards.length} cards`;
  if (cards.length === 0) {
    renderEmpty(target, 'no matches — try clearing filters');
    return;
  }

  const order = ['beginner', 'intermediate', 'advanced'];
  const groups = { beginner: [], intermediate: [], advanced: [] };
  cards.forEach((c) => {
    const level = order.includes(c.level) ? c.level : 'beginner';
    groups[level].push(c);
  });

  order.forEach((level) => {
    const groupCards = groups[level];
    if (groupCards.length === 0) return;

    const wrap = document.createElement('section');
    wrap.className = 'card-group';
    wrap.dataset.level = level;

    const header = document.createElement('div');
    header.className = 'card-group-header';
    const title = document.createElement('div');
    title.className = 'card-group-title';
    title.textContent = level;
    const dots = document.createElement('span');
    dots.className = 'level-dots';
    renderLevelDots(dots, level);
    const rule = document.createElement('div');
    rule.className = 'card-group-rule';
    header.append(title, dots, rule);
    wrap.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'card-grid';
    groupCards.forEach((c) => grid.appendChild(renderCardPreview(c)));
    wrap.appendChild(grid);

    target.appendChild(wrap);
  });
}

function viewCardsIndex() {
  state.view = 'cards';
  renderSpine(null);
  const frag = tpl('tpl-cards-index');
  const search = $('[data-search]', frag);
  const sort = $('[data-sort]', frag);
  const filterBar = $('[data-filter-bar]', frag);
  const grid = $('[data-card-grid]', frag);
  const countNode = makeCountNode();

  const tags = Array.from(new Set(state.cards.flatMap((c) => c.tags || []))).sort();
  const availableTypes = Array.from(new Set(state.cards.flatMap((c) => c.type)));
  const update = () => renderCardGrid(grid, applyFilters(state.cards), { countTarget: countNode, showStageLabel: true });
  search.addEventListener('input', () => { state.filters.query = search.value; update(); });
  sort.addEventListener('change', () => { state.filters.sort = sort.value; update(); });
  renderFilterBar(filterBar, { availableTypes, tags, onChange: update, countNode });
  update();
  mount(frag);
}

function viewRecent() {
  state.view = 'recent';
  renderSpine(null);
  const frag = tpl('tpl-recent');
  const grid = $('[data-card-grid]', frag);
  const sorted = state.cards.slice().sort((a, b) => (b.added || '').localeCompare(a.added || ''));
  renderCardGrid(grid, sorted, { showStageLabel: true });
  mount(frag);
}

function viewAbout()    { state.view = 'about';    renderSpine(null); mount(tpl('tpl-about')); }
function viewNotFound() { state.view = 'notfound'; renderSpine(null); mount(tpl('tpl-not-found')); }

function mount(frag) {
  const view = $('#view');
  view.innerHTML = '';
  view.appendChild(frag);
  window.scrollTo({ top: 0 });
}

// ---------- Modal ----------
function openModal(slug) {
  const card = cardBySlug(slug);
  const modal = $('#modal');
  const body = $('#modal-body');
  body.innerHTML = '';

  if (!card) {
    body.innerHTML = '<h1>Not found</h1><p>That card slug does not exist.</p>';
  } else {
    const frag = tpl('tpl-card');
    const types = $('[data-card-types]', frag);
    card.type.forEach((t) => types.appendChild(makeChip(t)));

    // Append a level badge alongside the type chips
    const levelBadge = document.createElement('span');
    levelBadge.className = 'level-badge';
    const levelDots = document.createElement('span');
    levelDots.className = 'level-dots';
    renderLevelDots(levelDots, card.level);
    levelBadge.append(levelDots, document.createTextNode(levelLabel(card.level)));
    types.appendChild(levelBadge);

    $('[data-card-title]', frag).textContent = card.title;

    const stages = cardStages(card);
    $('[data-card-stages-plural]', frag).textContent = stages.length > 1 ? 's' : '';
    const stagesEl = $('[data-card-stages]', frag);
    stages.forEach((s, i) => {
      const link = document.createElement('a');
      link.href = stageHref(s);
      link.textContent = s.title;
      stagesEl.appendChild(link);
      if (i < stages.length - 1) stagesEl.appendChild(document.createTextNode(', '));
    });

    $('[data-card-body]', frag).innerHTML = card.body || '';

    // Steps (how-to-use it) — optional, renders as a numbered list
    if (Array.isArray(card.steps) && card.steps.length) {
      const stepsHost = $('[data-card-steps]', frag);
      const wrap = document.createElement('div');
      wrap.className = 'card-steps';
      const label = document.createElement('div');
      label.className = 'card-steps-label';
      label.textContent = 'how to use it';
      wrap.appendChild(label);
      const ol = document.createElement('ol');
      card.steps.forEach((step) => {
        const li = document.createElement('li');
        li.textContent = step;
        ol.appendChild(li);
      });
      wrap.appendChild(ol);
      stepsHost.appendChild(wrap);
    }

    if (card.type.includes('prompt') && card.prompt_body) {
      const host = $('[data-card-prompt]', frag);
      const block = document.createElement('div');
      block.className = 'prompt-block';
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = card.prompt_body;
      pre.appendChild(code);
      block.appendChild(pre);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Copy prompt';
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(card.prompt_body);
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => (btn.textContent = orig), 1500);
        } catch {}
      });
      block.appendChild(btn);
      host.appendChild(block);
    }

    // Share + Copy link buttons — always shown on cards
    const shareHost = $('[data-card-share]', frag);
    if (shareHost) shareHost.appendChild(buildShareRow(card));

    const related = (card.related || []).map(cardBySlug).filter(Boolean);
    if (related.length) {
      const wrap = $('[data-related]', frag);
      wrap.hidden = false;
      renderCardGrid($('[data-related-grid]', wrap), related);
    }
    body.appendChild(frag);
  }

  modal.hidden = false;
  document.body.classList.add('modal-open');
  state.modalSlug = slug;
}

function buildShareRow(card) {
  const row = document.createElement('div');
  row.className = 'share-row';

  const url = new URL(cardHref(card), window.location.origin).href;

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'share-btn';
  copy.innerHTML = '<span>Copy link</span>';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      const orig = copy.innerHTML;
      copy.innerHTML = '<span>Link copied!</span>';
      setTimeout(() => (copy.innerHTML = orig), 1500);
    } catch {}
  });

  const share = document.createElement('a');
  share.className = 'share-btn share-btn-linkedin';
  share.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  share.target = '_blank';
  share.rel = 'noopener';
  share.innerHTML = '<span>Share on LinkedIn ↗</span>';

  row.appendChild(copy);
  row.appendChild(share);
  return row;
}

function closeModal({ updateHistory = true } = {}) {
  const modal = $('#modal');
  modal.hidden = true;
  $('#modal-body').innerHTML = '';
  document.body.classList.remove('modal-open');
  state.modalSlug = null;
  if (updateHistory) {
    // If the user opened this card directly (no background view yet), send them home.
    if (history.state && history.state.bg) {
      history.back();
    } else {
      navigate(state.lastBgPath || '/', { replace: true });
    }
  }
}

// ---------- Router ----------
function parsePath(pathname) {
  return pathname.replace(/\/+$/, '').split('/').filter(Boolean);
}

function route() {
  state.filters = { types: new Set(), tags: new Set(), query: '', sort: 'default' };
  const parts = parsePath(window.location.pathname);

  let bgRenderer = viewHome;
  let modalSlug = null;
  let bgPath = '/';

  if (parts.length === 0) {
    bgRenderer = viewHome;
    bgPath = '/';
  } else if (parts[0] === 'about') {
    bgRenderer = viewAbout;
    bgPath = '/about';
  } else if (parts[0] === 'recent') {
    bgRenderer = viewRecent;
    bgPath = '/recent';
  } else if (parts[0] === 'cards' && parts.length === 1) {
    bgRenderer = viewCardsIndex;
    bgPath = '/cards';
  } else if (parts[0] === 'cards' && parts[1]) {
    bgRenderer = viewHome;
    bgPath = state.lastBgPath || '/';
    modalSlug = parts[1];
  } else if (parts[0] === 'stages' && parts[1]) {
    bgRenderer = () => viewStage(parts[1]);
    bgPath = `/stages/${parts[1]}`;
  } else {
    bgRenderer = viewNotFound;
  }

  bgRenderer();

  if (modalSlug) openModal(modalSlug);
  else if (state.modalSlug) closeModal({ updateHistory: false });

  if (!modalSlug) state.lastBgPath = bgPath;
}

function navigate(pathname, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', pathname);
  else history.pushState({}, '', pathname);
  route();
}

// ---------- Wiring ----------
window.addEventListener('popstate', () => {
  setSpineOpen(false);
  route();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.modalSlug) closeModal();
    else if (document.querySelector('.spine')?.classList.contains('open')) setSpineOpen(false);
  }
});

document.addEventListener('click', (e) => {
  if (e.target.matches('[data-modal-close]')) {
    if (state.modalSlug) closeModal();
    return;
  }
  if (e.target.closest('[data-spine-toggle]')) {
    const open = document.querySelector('.spine').classList.contains('open');
    setSpineOpen(!open);
    return;
  }

  // Intercept internal <a href> clicks for SPA navigation
  const link = e.target.closest('a[href]');
  if (!link) return;
  if (link.classList.contains('disabled')) {
    // Disabled spine tabs — prevent navigation
    e.preventDefault();
    return;
  }
  const href = link.getAttribute('href');
  if (!href || !href.startsWith('/') || link.target === '_blank' || link.hasAttribute('download')) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  if (href !== window.location.pathname) navigate(href);
  // If user clicked a tab while spine dropdown is open, close it
  setSpineOpen(false);
});

(async function init() {
  // Legacy hash bookmarks: convert /#/cards/foo to /cards/foo on first load.
  if (window.location.hash && window.location.hash.length > 1 && window.location.pathname === '/') {
    const legacy = window.location.hash.replace(/^#/, '');
    if (legacy.startsWith('/')) {
      history.replaceState({}, '', legacy);
    }
  }

  try {
    await loadData();
  } catch (e) {
    document.getElementById('view').innerHTML =
      '<div class="empty">Could not load data files. Make sure you are running this via a local server.</div>';
    return;
  }
  route();
})();
