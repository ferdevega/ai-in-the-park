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

const CARD_TYPES = ['creator', 'thought-partner', 'auditor', 'panel', 'tool'];

const state = {
  stages: [],
  cards: [],
  scenarios: [],
  filters: { types: new Set(), tags: new Set(), query: '', sort: 'default' },
  view: null,        // 'home' | 'stage:<slug>' | 'cards' | 'recent' | 'about' | 'notfound'
  modalSlug: null,
  lastBgPath: '/',
};

// ---------- Data ----------
async function loadData() {
  const [stagesRes, cardsRes] = await Promise.all([
    fetch('/data/stages.json', { cache: 'no-store' }),
    fetch('/data/cards.json', { cache: 'no-store' }),
  ]);
  state.stages = await stagesRes.json();
  state.cards = (await cardsRes.json()).filter((c) => !c.hidden);
  state.stages.sort((a, b) => a.order - b.order);

  // Scenarios power the /navigator route; failure here shouldn't break the app.
  try {
    const scRes = await fetch('/data/scenarios.json', { cache: 'no-store' });
    if (scRes.ok) state.scenarios = await scRes.json();
  } catch (e) {
    state.scenarios = [];
  }
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
    if (types.size && !cardTypes(c).some((t) => types.has(t))) return false;
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

// Normalize a card's type — schema is now a single string per card.
// Legacy arrays still work (returns first entry).
function cardTypes(card) {
  if (Array.isArray(card.type)) return card.type;
  if (typeof card.type === 'string') return [card.type];
  return [];
}

// Card preview band is now driven by the card's primary stage (was: by type).
// Gives the all-cards view a visual signal for which stage a card belongs to.
function bandStyleForStage(stage) {
  if (!stage) return 'background: var(--ink-3);';
  return `background: ${stageColorVar(stage)};`;
}

function primaryStageOf(card) {
  const refs = Array.isArray(card.stage) ? card.stage : [card.stage];
  return stageBySlug(refs[0]);
}

const cardHref = (card) => `/cards/${card.slug}`;
const stageHref = (stage) => `/stages/${stage.slug}`;

function renderCardPreview(card, { showStageLabel = false, showLevel = true } = {}) {
  const frag = tpl('tpl-card-preview');
  const a = $('a', frag);

  // "Coming soon" cards preview as dimmed ghost tiles; clicking opens the subscribe dialog.
  if (card.coming_soon) {
    a.setAttribute('href', '#');
    a.classList.add('disabled', 'card-preview-coming-soon');
    a.setAttribute('aria-disabled', 'true');
    a.setAttribute('data-subscribe-open', '');
    a.setAttribute('title', 'Subscribe to get notified when this card drops');
  } else {
    a.setAttribute('href', cardHref(card));
  }

  // Role color becomes the card's primary visual identity — but ghost tiles stay grey.
  const roleColor = card.coming_soon ? null : roleColorVar(card.type);
  if (roleColor) a.style.setProperty('--role-color', roleColor);

  // Band color is driven by the card's role (the AI move). Ghost tiles get a muted stone band.
  const stage = primaryStageOf(card);
  const band = $('[data-band]', frag);
  if (card.coming_soon) {
    band.setAttribute('style', 'background: rgba(160, 155, 148, 0.35);');
  } else {
    band.setAttribute('style', roleColor ? `background: ${roleColor};` : bandStyleForStage(stage));
  }

  if (showStageLabel && stage) {
    const label = $('[data-stage-label]', frag);
    label.textContent = stage.title;
    label.style.setProperty('--label-color', stageColorVar(stage));
    label.hidden = false;
  }

  $('[data-title]', frag).textContent = card.title;
  $('[data-teaser]', frag).textContent = card.teaser || '';

  // Tags — up to 3, as small subtle pills below the teaser.
  const tagsHost = $('[data-tags]', frag);
  if (tagsHost && Array.isArray(card.tags) && card.tags.length) {
    card.tags.slice(0, 3).forEach((tag) => {
      const t = document.createElement('span');
      t.className = 'card-preview-tag';
      t.textContent = tag;
      tagsHost.appendChild(t);
    });
  }

  const levelHost = $('[data-level]', frag);
  if (levelHost) {
    if (showLevel) renderLevelBars(levelHost, card.level);
    else levelHost.remove();
  }

  // Role label — geometric icon + name in the chips footer.
  // For coming-soon cards, replace the role label with a "Coming soon" tag in the same slot.
  const chips = $('.card-chips', frag);
  if (card.coming_soon) {
    if (chips) {
      const tag = document.createElement('span');
      tag.className = 'role-label card-coming-soon-label';
      tag.textContent = 'Coming soon';
      chips.insertBefore(tag, chips.firstChild);
    }
  } else {
    const label = roleLabelHtmlForType(card.type);
    if (label && chips) {
      const tag = document.createElement('span');
      tag.className = 'role-label';
      if (roleColor) tag.style.setProperty('--role-color', roleColor);
      tag.innerHTML = label;
      chips.insertBefore(tag, chips.firstChild);
    }
  }

  return frag;
}

// Geometric SVG icons per role — small (14×14), use currentColor.
const ROLE_ICONS = {
  // Creator — pen-nib lower-right triangle
  creator: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 13 L13 13 L13 3 Z"/></svg>',
  // Thought partner — two arrows (back-and-forth)
  'thought-partner': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5 L13 5 M10 2 L13 5 L10 8"/><path d="M13 11 L3 11 M6 8 L3 11 L6 14"/></svg>',
  // Auditor — magnifying glass
  auditor: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4"/><path d="M10 10 L14 14"/></svg>',
  // Tool — hexagon (configuration)
  tool: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M8 1 L14 5 L14 11 L8 15 L2 11 L2 5 Z"/></svg>',
  // Panel — three stacked lines (panel of voices)
  panel: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 4 L13 4 M3 8 L13 8 M3 12 L13 12"/></svg>',
};

// Map the schema `type` field to label text + icon HTML.
function roleLabelTextForType(type) {
  if (type === 'creator') return 'Creator AI';
  if (type === 'tool') return 'AI tool';
  if (type === 'thought-partner') return 'Thought partner AI';
  if (type === 'auditor') return 'Auditor AI';
  if (type === 'panel') return 'Panel AI';
  return null;
}

function roleLabelHtmlForType(type) {
  const text = roleLabelTextForType(type);
  if (!text) return null;
  const icon = ROLE_ICONS[type] || '';
  return `<span class="role-icon">${icon}</span><span class="role-text">${text}</span>`;
}

// Legacy callers (filter bar, etc.) may still use the text-only version.
function roleLabelForType(type) {
  return roleLabelTextForType(type);
}

// CSS variable string for a role's color, used to tint cards.
function roleColorVar(type) {
  if (type === 'creator') return 'var(--r-creator)';
  if (type === 'tool') return 'var(--r-tool)';
  if (type === 'thought-partner') return 'var(--r-thought-partner)';
  if (type === 'auditor') return 'var(--r-auditor)';
  if (type === 'panel') return 'var(--r-panel)';
  return null;
}

function renderCardGrid(target, cards, { countTarget, showStageLabel = false } = {}) {
  target.innerHTML = '';
  if (countTarget) countTarget.textContent = cards.length === 1 ? '1 card' : `${cards.length} cards`;
  if (cards.length === 0) {
    renderEmpty(target, 'no matches. Try clearing filters.');
    return;
  }
  cards.forEach((c) => target.appendChild(renderCardPreview(c, { showStageLabel })));
}

function renderFilterBar(target, { availableTypes = CARD_TYPES, tags = [], onChange, countNode }) {
  // Filters intentionally hidden for now — the catalog is small enough that
  // they're more clutter than help. Re-enable by removing this early return.
  target.innerHTML = '';
  target.hidden = true;
  if (countNode) target.appendChild(countNode);
  return;
  // eslint-disable-next-line no-unreachable
  target.innerHTML = '';
  if (availableTypes.length > 0) {
    const typeLabel = document.createElement('span');
    typeLabel.className = 'filter-label';
    typeLabel.textContent = 'role';
    target.appendChild(typeLabel);

    CARD_TYPES.filter((t) => availableTypes.includes(t)).forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip';
      btn.dataset.type = t;
      btn.textContent = roleLabelForType(t) || t.replace('-', ' ');
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
      // Empty stages open the subscribe dialog on click instead of navigating.
      a.setAttribute('href', '#');
      a.classList.add('disabled');
      a.setAttribute('aria-disabled', 'true');
      a.setAttribute('data-subscribe-open', '');
      a.setAttribute('title', 'Subscribe to get notified when this stage drops');
      $('[data-soon]', frag).hidden = false;
    }
    $('[data-order]', frag).textContent = stage.order;
    $('[data-title]', frag).textContent = stage.title;
    $('[data-abbr]', frag).textContent = stage.abbr || '';
    host.appendChild(frag);
  });

  // Dashed separator + "All cards" entry below the stage list
  const sep = document.createElement('div');
  sep.className = 'spine-separator';
  sep.setAttribute('aria-hidden', 'true');
  host.appendChild(sep);

  const allFrag = tpl('tpl-spine-tab');
  const allLink = $('a', allFrag);
  allLink.classList.add('spine-tab-all');
  allLink.setAttribute('href', '/cards');
  if (state.view === 'cards') allLink.classList.add('active');
  $('[data-order]', allFrag).textContent = '★';
  $('[data-title]', allFrag).textContent = 'All cards';
  $('[data-abbr]', allFrag).textContent = 'ALL';
  host.appendChild(allFrag);

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
  const frag = tpl('tpl-home');

  // Mobile-only stages list — populated from the same stage data as the spine.
  const stagesList = $('[data-home-stages-list]', frag);
  if (stagesList) {
    state.stages.forEach((stage) => {
      const li = document.createElement('li');
      const hasCards = stageHasCards(stage.slug);
      const a = document.createElement('a');
      a.className = 'home-stage-button' + (hasCards ? '' : ' disabled');
      if (hasCards) a.setAttribute('href', `/stages/${stage.slug}`);
      a.style.setProperty('--btn-color', stageColorVar(stage));

      const num = document.createElement('span');
      num.className = 'home-stage-button-num';
      num.textContent = String(stage.order);

      const name = document.createElement('span');
      name.className = 'home-stage-button-name';
      name.textContent = stage.title;

      a.append(num, name);

      if (hasCards) {
        const arrow = document.createElement('span');
        arrow.className = 'home-stage-button-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        a.appendChild(arrow);
      } else {
        const soon = document.createElement('span');
        soon.className = 'home-stage-button-soon';
        soon.textContent = 'soon';
        a.appendChild(soon);
      }

      li.appendChild(a);
      stagesList.appendChild(li);
    });

    // All cards entry — visually distinct, sits below the stages
    const allLi = document.createElement('li');
    const allBtn = document.createElement('a');
    allBtn.className = 'home-stage-button home-stage-button-all';
    allBtn.setAttribute('href', '/cards');

    const allNum = document.createElement('span');
    allNum.className = 'home-stage-button-num';
    allNum.textContent = '★';

    const allName = document.createElement('span');
    allName.className = 'home-stage-button-name';
    allName.textContent = 'All cards';

    const allArrow = document.createElement('span');
    allArrow.className = 'home-stage-button-arrow';
    allArrow.setAttribute('aria-hidden', 'true');
    allArrow.textContent = '→';

    allBtn.append(allNum, allName, allArrow);
    allLi.appendChild(allBtn);
    stagesList.appendChild(allLi);
  }

  mount(frag);
}

// Helper: render a row of 3 ascending level bars (1, 2, or 3 filled)
function levelBarsCount(level) {
  if (level === 'advanced') return 3;
  if (level === 'intermediate') return 2;
  return 1; // beginner or unspecified
}
function renderLevelBars(host, level) {
  host.innerHTML = '';
  const count = levelBarsCount(level);
  for (let i = 0; i < 3; i++) {
    const bar = document.createElement('span');
    bar.className = 'level-bar' + (i < count ? ' filled' : '');
    host.appendChild(bar);
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
    $('[data-empty-title]', empty).textContent = `${stage.title}: coming soon`;
    $('[data-empty-summary]', empty).textContent = stage.summary || '';
    mount(empty);
    return;
  }

  const frag = tpl('tpl-stage-v4');
  $('[data-stage-title]', frag).textContent = stage.title;
  $('[data-stage-summary]', frag).textContent = stage.summary || '';

  const stageColor = stageColorVar(stage);
  const dot = $('.stage-v4-dot', frag);
  if (dot) dot.style.setProperty('--dot-color', stageColor);

  const groupsHost = $('[data-stage-groups]', frag);
  const order = ['beginner', 'intermediate', 'advanced'];

  let groupIndex = 0;
  const buildGroup = (label, groupCards) => {
    if (groupCards.length === 0) return;
    const section = document.createElement('section');
    section.className = 'stage-v4-group';
    section.setAttribute('data-reveal', '');
    section.style.setProperty('--reveal-delay', `${Math.min(groupIndex, 3) * 80}ms`);
    groupIndex++;

    const header = document.createElement('div');
    header.className = 'stage-v4-group-header';
    const labelEl = document.createElement('span');
    labelEl.className = 'stage-v4-group-label';
    labelEl.textContent = label;
    const countEl = document.createElement('span');
    countEl.className = 'stage-v4-group-count';
    countEl.textContent = `${groupCards.length} ${groupCards.length === 1 ? 'card' : 'cards'}`;
    header.append(labelEl, countEl);
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'stage-v4-grid';
    groupCards.forEach((c) => grid.appendChild(renderV4Card(c, { color: stageColor })));
    section.appendChild(grid);

    groupsHost.appendChild(section);
  };

  order.forEach((level) => {
    const inLevel = cards
      .filter((c) => (c.level || 'beginner') === level)
      // Real cards first, coming-soon tiles sit at the tail of each level
      .sort((a, b) => Number(!!a.coming_soon) - Number(!!b.coming_soon));
    if (inLevel.length > 0) buildGroup(level, inLevel);
  });

  // Give the stage hero a reveal too so it glides in on load
  const heroEl = frag.querySelector('.stage-v4-hero');
  if (heroEl) {
    heroEl.setAttribute('data-reveal', '');
  }

  mount(frag);
  wireRevealAnimation(document.querySelector('.stage-v4'));
}

// Renders cards grouped into Beginner / Intermediate / Advanced sections.
function renderGroupedCardGrid(target, cards, { countTarget } = {}) {
  target.innerHTML = '';
  if (countTarget) countTarget.textContent = cards.length === 1 ? '1 card' : `${cards.length} cards`;
  if (cards.length === 0) {
    renderEmpty(target, 'no matches. Try clearing filters.');
    return;
  }

  const order = ['beginner', 'intermediate', 'advanced'];
  const groups = { beginner: [], intermediate: [], advanced: [] };
  cards.forEach((c) => {
    const level = order.includes(c.level) ? c.level : 'beginner';
    groups[level].push(c);
  });
  // Within each level group, coming-soon ghost tiles always sit at the end.
  for (const level of order) {
    groups[level].sort((a, b) => Number(!!a.coming_soon) - Number(!!b.coming_soon));
  }

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
    dots.className = 'level-bars';
    renderLevelBars(dots, level);
    const rule = document.createElement('div');
    rule.className = 'card-group-rule';
    header.append(title, dots, rule);
    wrap.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'card-grid';
    // On stage pages the level is already shown by the group header,
    // so hide the level bar on each card to reduce visual noise.
    groupCards.forEach((c) => grid.appendChild(renderCardPreview(c, { showLevel: false })));
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

  // Default sort on /cards is by stage so the catalog reads in process order.
  state.filters.sort = 'stage';
  sort.value = 'stage';

  // The /cards index shows only real cards, no "coming soon" ghost tiles.
  const realCards = state.cards.filter((c) => !c.coming_soon);
  const tags = Array.from(new Set(realCards.flatMap((c) => c.tags || []))).sort();
  const availableTypes = Array.from(new Set(realCards.flatMap((c) => c.type)));
  const update = () => renderCardGrid(grid, applyFilters(realCards), { countTarget: countNode, showStageLabel: true });
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
  const sorted = state.cards
    .filter((c) => !c.coming_soon)
    .slice()
    .sort((a, b) => (b.added || '').localeCompare(a.added || ''));
  renderCardGrid(grid, sorted, { showStageLabel: true });
  mount(frag);
}

function viewAbout()    { state.view = 'about';    renderSpine(null); mount(tpl('tpl-about')); wireRevealAnimation(document.querySelector('.about-section')); }
function viewFast()     { state.view = 'fast';     renderSpine(null); mount(tpl('tpl-fast'));  wireRevealAnimation(document.querySelector('.fast-page')); }
function viewDownloadFast() {
  state.view = 'download-fast';
  renderSpine(null);
  mount(tpl('tpl-download-fast'));
  // Populate the 5-icon signature strip in the header (static, no shuffle)
  const sig = document.querySelector('[data-doc-signature]');
  if (sig) {
    ['creator', 'thought-partner', 'auditor', 'tool', 'panel'].forEach((k) => {
      const el = document.createElement('span');
      el.className = 'doc-fast-sig-icon';
      el.setAttribute('data-role', k);
      el.innerHTML = ROLE_ICONS[k] || '';
      sig.appendChild(el);
    });
  }
}

// ---------- Agent builder ----------
// Interactive tool: five fields (role/job/workflow/knowledge/guardrails) assemble
// into a paste-ready instructions block, with per-tool setup steps. Extends FAST
// to something that persists — a single prompt is just a one-step agent.
function viewAgentBuilder() {
  state.view = 'agent-builder';
  renderSpine(null);
  mount(tpl('tpl-agent-builder'));
  wireAgentBuilder();
  wireRevealAnimation(document.querySelector('.agent-builder'));
}

function wireAgentBuilder() {
  const root = document.querySelector('[data-agent-builder]');
  if (!root) return;
  const form = root.querySelector('[data-agent-form]');
  const outEl = root.querySelector('[data-agent-output]');
  const copyBtn = root.querySelector('[data-agent-copy]');
  if (!form || !outEl) return;

  // Seed with a worked ID example so the page demonstrates itself on load.
  const defaults = {
    role: "a senior instructional designer who's obsessive about clear, measurable learning objectives",
    job: 'Turn my raw SME interview notes into a module-by-module course outline.',
    workflow: [
      "Ask me for the SME notes and the target audience if I haven't given them.",
      'Draft 4 to 6 modules, each with one outcome written using a Bloom-level verb.',
      'Flag anything in the notes that reads like a wrong or missing objective.',
      'Return the outline as a table, then wait for my edits before expanding it.',
    ].join('\n'),
    knowledge: 'my style guide, the competency framework, and two past course outlines',
    guardrails:
      "Always use Bloom-level verbs. Never invent statistics or cite sources you can't see. Ask before assuming the audience's seniority.",
  };

  const fields = {};
  form.querySelectorAll('[data-field]').forEach((el) => {
    const key = el.getAttribute('data-field');
    fields[key] = el;
    if (defaults[key]) el.value = defaults[key];
  });

  const val = (k) => (fields[k] ? fields[k].value.trim() : '');

  function buildInstructions() {
    const role = val('role') || '[describe the role]';
    const job = val('job') || '[describe the job]';
    const workflowLines = val('workflow')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const guardrails = val('guardrails');
    const knowledge = val('knowledge');

    const lines = [];
    lines.push('# Role');
    lines.push(`You are ${role}.`);
    lines.push('');
    lines.push('# Your job');
    lines.push(job);
    if (workflowLines.length) {
      lines.push('');
      lines.push('# How you work');
      workflowLines.forEach((l, i) => lines.push(`${i + 1}. ${l}`));
    }
    if (guardrails) {
      lines.push('');
      lines.push('# Always / never');
      lines.push(guardrails);
    }
    if (knowledge) {
      lines.push('');
      lines.push('# Source material');
      lines.push(
        `Treat the attached materials as your source of truth (${knowledge}). If an answer isn't in them, say so instead of guessing.`,
      );
    }
    return lines.join('\n');
  }

  let current = '';
  function render() {
    current = buildInstructions();
    outEl.textContent = current;
    const kb = val('knowledge') || 'your source material';
    root.querySelectorAll('[data-kb-echo]').forEach((el) => {
      el.textContent = kb;
    });
  }

  form.addEventListener('input', render);

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(current);
        const orig = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = orig), 1500);
      } catch {}
    });
  }

  render();
}

// ---------- Map (constellation of cards, grouped by stage) ----------
// Standalone /map route: every card is a star, positioned in its primary stage's
// cluster along a snaking trail through the 7 stages. Edges are the real `related`
// links. Situation chips filter the map down to one stage. Illustrative layout;
// real card-to-card sequencing is authored via `related`.
function viewMap() {
  state.view = 'map';
  renderSpine(null);
  mount(tpl('tpl-map'));
  wireMap();
}

// Situation → stage. Plain-language entry points for the disoriented.
const MAP_SITUATIONS = [
  { label: 'A vague request just landed on me', stage: 'analysis' },
  { label: 'I’m staring at a blank doc', stage: 'strategy-curriculum' },
  { label: 'I need to make it stick', stage: 'design' },
  { label: 'I’ve got content, but it’s a mess', stage: 'development' },
];

function wireMap() {
  const svg = document.querySelector('[data-map-svg]');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (t, a) => {
    const e = document.createElementNS(NS, t);
    for (const k in a) e.setAttribute(k, a[k]);
    return e;
  };
  const W = 1200, H = 640;

  // Snake of cluster centers, one per stage in order (fractions of the viewBox).
  const CFRAC = [
    [0.11, 0.30], [0.32, 0.19], [0.52, 0.29], [0.74, 0.33],
    [0.79, 0.72], [0.53, 0.80], [0.25, 0.74],
  ];
  const stages = state.stages.slice().sort((a, b) => a.order - b.order);

  // Group real cards by primary stage (no coming-soon, no duplicates across stages).
  const groups = {};
  state.cards.filter((c) => !c.coming_soon).forEach((c) => {
    const ps = primaryStageOf(c);
    if (!ps) return;
    (groups[ps.slug] = groups[ps.slug] || []).push(c);
  });

  // Assign every node an (x, y): cluster center + a ring of its stage's cards.
  const nodes = {};
  const centers = {};
  stages.forEach((stage, i) => {
    const f = CFRAC[i] || [0.5, 0.5];
    const cx = f[0] * W, cy = f[1] * H;
    centers[stage.slug] = { x: cx, y: cy, stage };
    const cards = groups[stage.slug] || [];
    if (cards.length === 0) {
      nodes['__soon_' + stage.slug] = { x: cx, y: cy, stage, soon: true, title: stage.title };
      return;
    }
    const R = cards.length === 1 ? 0 : Math.min(88, 38 + cards.length * 9);
    const start = -Math.PI / 2;
    cards.forEach((c, j) => {
      const ang = start + j * ((Math.PI * 2) / cards.length);
      nodes[c.slug] = {
        x: cx + R * Math.cos(ang),
        y: cy + R * Math.sin(ang),
        stage, card: c, title: c.title,
      };
    });
  });

  // Defs: the site's signature gradient for edges.
  const defs = mk('defs', {});
  const grad = mk('linearGradient', { id: 'map-grad', x1: '0', y1: '0', x2: '1', y2: '1' });
  [['0%', 'var(--r-auditor)'], ['50%', 'var(--r-creator)'], ['100%', 'var(--r-thought-partner)']]
    .forEach(([o, c]) => {
      const s = mk('stop', { offset: o });
      s.style.stopColor = c;
      grad.appendChild(s);
    });
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Faint trail spine through the stage centers, in process order.
  let d = '';
  stages.forEach((s, i) => {
    const c = centers[s.slug];
    d += (i === 0 ? 'M' : ' L') + c.x + ' ' + c.y;
  });
  svg.appendChild(mk('path', {
    d, fill: 'none', stroke: 'rgba(255,255,255,0.06)', 'stroke-width': 1, 'stroke-dasharray': '3 6',
  }));

  // Stage headers.
  const hdrEls = {};
  stages.forEach((s) => {
    const c = centers[s.slug];
    const t = mk('text', {
      class: 'map-shdr', 'data-stage': s.slug, x: c.x, y: c.y - 70, 'text-anchor': 'middle',
    });
    t.style.fill = stageColorVar(s);
    t.textContent = (s.abbr || s.title).toUpperCase();
    hdrEls[s.slug] = t;
    svg.appendChild(t);
  });

  // Edges from real `related` links (deduped).
  const edgeEls = {};
  const seen = {};
  state.cards.forEach((c) => {
    if (!nodes[c.slug]) return;
    (c.related || []).forEach((r) => {
      if (!nodes[r]) return;
      const key = [c.slug, r].sort().join('>');
      if (seen[key]) return;
      seen[key] = 1;
      const A = nodes[c.slug], B = nodes[r], mx = (A.x + B.x) / 2;
      const p = mk('path', {
        d: `M${A.x} ${A.y} C ${mx} ${A.y} ${mx} ${B.y} ${B.x} ${B.y}`, class: 'map-edge',
      });
      edgeEls[key] = { el: p, a: c.slug, b: r };
      svg.appendChild(p);
    });
  });

  // Nodes.
  const nodeEls = {};
  Object.keys(nodes).forEach((id) => {
    const n = nodes[id];
    const col = n.soon ? '#5a5a5a' : (roleColorVar(n.card.type) || 'var(--text-dim)');
    const g = mk('g', { class: 'map-node' + (n.soon ? ' is-soon' : ''), 'data-id': id });
    const halo = mk('circle', { class: 'map-halo', cx: n.x, cy: n.y, r: 15 });
    halo.style.fill = col;
    g.appendChild(halo);
    g.appendChild(mk('circle', { class: 'map-ping', cx: n.x, cy: n.y, r: 9 }));
    const dot = mk('circle', {
      cx: n.x, cy: n.y, r: n.soon ? 5 : 7,
      'stroke-width': n.soon ? 1 : 0.5, 'stroke-dasharray': n.soon ? '2 2' : '0',
    });
    dot.style.fill = n.soon ? '#0e0e0e' : col;
    dot.style.stroke = col;
    g.appendChild(dot);
    if (!n.soon) {
      const sp = mk('circle', { cx: n.x - 2, cy: n.y - 2, r: 1.5, fill: '#fff', opacity: 0.85 });
      g.appendChild(sp);
    }
    const anchor = n.x > 1050 ? 'end' : (n.x < 150 ? 'start' : 'middle');
    const lbl = mk('text', { class: 'map-lbl', x: n.x, y: n.y + 20, 'text-anchor': anchor });
    lbl.textContent = (n.soon ? 'soon · ' : '') + n.title;
    g.appendChild(lbl);
    nodeEls[id] = g;
    svg.appendChild(g);
  });

  // Legend.
  const legend = document.querySelector('[data-map-legend]');
  if (legend) {
    [['creator', 'Creator'], ['thought-partner', 'Thought-partner'], ['auditor', 'Auditor'],
     ['panel', 'Panel'], ['tool', 'Tool']].forEach(([k, name]) => {
      const item = document.createElement('span');
      item.className = 'map-legend-item';
      const dot = document.createElement('span');
      dot.className = 'map-legend-dot';
      dot.style.background = roleColorVar(k);
      item.append(dot, document.createTextNode(name));
      legend.appendChild(item);
    });
  }

  const readEl = document.querySelector('[data-map-read]');
  const setRead = (html) => { if (readEl) readEl.innerHTML = html; };

  function clearAll() {
    svg.classList.remove('is-filter');
    Object.values(nodeEls).forEach((g) => g.classList.remove('on', 'pin'));
    Object.values(edgeEls).forEach((e) => e.el.classList.remove('on'));
    Object.values(hdrEls).forEach((t) => t.classList.remove('on'));
  }
  function filterToStage(slug) {
    clearAll();
    svg.classList.add('is-filter');
    const stage = stageBySlug(slug);
    if (hdrEls[slug]) hdrEls[slug].classList.add('on');
    const ids = Object.keys(nodes).filter((id) => nodes[id].stage && nodes[id].stage.slug === slug);
    ids.forEach((id) => nodeEls[id].classList.add('on'));
    // Light edges that live entirely within the lit stage.
    Object.values(edgeEls).forEach((e) => {
      if (ids.includes(e.a) && ids.includes(e.b)) e.el.classList.add('on');
    });
    const realIds = ids.filter((id) => !nodes[id].soon);
    if (realIds.length) nodeEls[realIds[0]].classList.add('pin');
    else if (ids.length) nodeEls[ids[0]].classList.add('pin');
    const n = realIds.length;
    setRead(`<span class="map-read-em">Start in ${stage ? stage.title : slug}</span> · ${n} ${n === 1 ? 'card' : 'cards'} here. Tap a star to open it.`);
  }

  // Chips.
  const chips = document.querySelector('[data-map-chips]');
  if (chips) {
    MAP_SITUATIONS.forEach((s) => {
      if (!stageBySlug(s.stage)) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'map-chip';
      b.textContent = s.label;
      b.dataset.stage = s.stage;
      chips.appendChild(b);
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'map-chip map-chip-reset';
    reset.textContent = '↺ Whole map';
    reset.dataset.reset = '1';
    chips.appendChild(reset);

    chips.addEventListener('click', (e) => {
      const b = e.target.closest('.map-chip');
      if (!b) return;
      Array.from(chips.children).forEach((c) => c.classList.toggle('on', c === b && !b.dataset.reset));
      if (b.dataset.reset) {
        clearAll();
        setRead('The whole playbook. Star color = the AI’s role · the trail runs Analysis → Project management.');
      } else {
        filterToStage(b.dataset.stage);
      }
    });
  }

  // Node clicks → open the card (or a readout for coming-soon).
  svg.addEventListener('click', (e) => {
    const g = e.target.closest('.map-node');
    if (!g) return;
    const n = nodes[g.dataset.id];
    if (!n || n.soon) {
      if (n) setRead(`<span class="map-read-em">${n.title}</span> · coming soon`);
      return;
    }
    navigate(cardHref(n.card));
  });
}

// Ambient star-field on a fixed, viewport-sized <canvas>. Reused by the
// navigator and the card pages so the whole experience shares one universe.
// Self-cleans (stops the loop + resize listener) when the canvas leaves the DOM.
function initStarfield(cv) {
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  function measure() {
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  measure();
  const onResize = () => measure();
  window.addEventListener('resize', onResize);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Stars are tinted with the stage palette, so the sky is coloured by the phases.
  const starCols = ['248,113,113', '251,146,60', '52,211,153', '34,211,238', '96,165,250', '167,139,250', '252,211,77'];
  const layers = [{ n: 70, s: [.4, .9], a: [.14, .38] }, { n: 42, s: [.7, 1.4], a: [.28, .58] }, { n: 16, s: [1.4, 2.4], a: [.5, .95] }];
  const stars = [];
  layers.forEach((L) => { for (let i = 0; i < L.n; i++) { const ang = Math.random() * 6.28, spd = 0.00006 + Math.random() * 0.0003; stars.push({ x: Math.random(), y: Math.random(), r: L.s[0] + Math.random() * (L.s[1] - L.s[0]), a: L.a[0] + Math.random() * (L.a[1] - L.a[0]), tw: Math.random() * 6.28, sp: .2 + Math.random() * .5, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, col: starCols[Math.floor(Math.random() * starCols.length)] }); } });
  const neb = [{ x: .28, y: .3, c: '139,92,246' }, { x: .72, y: .34, c: '6,182,212' }, { x: .5, y: .82, c: '255,111,216' }];
  let t = 0;
  function frame() {
    if (!cv.isConnected) { window.removeEventListener('resize', onResize); return; }
    t++;
    ctx.clearRect(0, 0, W, H);
    neb.forEach((nb, i) => {
      const ox = Math.sin(t * .002 + i) * 26, oy = Math.cos(t * .0016 + i) * 20;
      const g = ctx.createRadialGradient(nb.x * W + ox, nb.y * H + oy, 0, nb.x * W + ox, nb.y * H + oy, W * .42);
      g.addColorStop(0, `rgba(${nb.c},.10)`); g.addColorStop(1, `rgba(${nb.c},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });
    ctx.globalCompositeOperation = 'lighter';
    stars.forEach((s) => {
      if (!reduce) { s.x += s.vx; s.y += s.vy; if (s.x < -.06) s.x = 1.06; if (s.x > 1.06) s.x = -.06; if (s.y < -.06) s.y = 1.06; if (s.y > 1.06) s.y = -.06; }
      const px = s.x * W + Math.sin(t * .0008 * s.sp + s.tw) * 4, py = s.y * H + Math.cos(t * .0007 * s.sp + s.tw) * 4;
      const a = s.a * (reduce ? .85 : .6 + .4 * Math.sin(t * .03 * s.sp + s.tw));
      if (s.r > 1.2) { const gg = ctx.createRadialGradient(px, py, 0, px, py, s.r * 5); gg.addColorStop(0, `rgba(${s.col},${a})`); gg.addColorStop(1, `rgba(${s.col},0)`); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(px, py, s.r * 5, 0, 6.28); ctx.fill(); }
      ctx.fillStyle = `rgba(${s.col},${a})`; ctx.beginPath(); ctx.arc(px, py, s.r, 0, 6.28); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------- Navigator (home: shows over a star-field) ----------
// The homepage. An ambient star-field with the "shows" (scenarios) as big
// boxes; pick one and it opens to its episodes (cards) grouped by moment, with
// an enabler prelude and an "up next" strip. Data: data/scenarios.json.
function viewNavigator() {
  state.view = 'navigator';
  renderSpine(null);
  mount(tpl('tpl-navigator'));
  wireNavigator();
}

function wireNavigator() {
  const field = document.querySelector('[data-nav-field]');
  if (!field) return;
  const cv = field.querySelector('[data-nav-bg]');
  const chooserEl = field.querySelector('[data-nav-chooser]');
  const scenariosEl = field.querySelector('[data-nav-scenarios]');
  const sceneEl = field.querySelector('[data-nav-scene]');
  const sceneBodyEl = field.querySelector('[data-nav-scene-body]');
  const prevArrowEl = field.querySelector('[data-nav-prev]');
  const nextArrowEl = field.querySelector('[data-nav-next]');
  const RNAME = { creator: 'Creator', 'thought-partner': 'Thought-partner', auditor: 'Auditor', panel: 'Panel', tool: 'Tool' };
  const scenarios = state.scenarios || [];
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ----- ambient star-field canvas -----
  initStarfield(cv);

  // ----- helpers -----
  // Episodes in a show — for the by-stage "everything" show, that's every card
  // across the stages (its moments are built at render time, so count the same).
  const scenarioCards = (sc) => (sc.byStage
    ? state.stages.filter((s) => stageHasCards(s.slug)).reduce((acc, s) => acc.concat(cardsForStage(s.slug).map((c) => c.slug)), [])
    : (sc.moments || []).reduce((acc, m) => acc.concat(m.cards || []), []));
  function tileColor(entry) {
    const type = typeof entry === 'string' ? (cardBySlug(entry) || {}).type : entry.type;
    return roleColorVar(type) || 'var(--text-dim)';
  }
  // Episodes render as the real library card (renderV4Card) so the show page
  // speaks the same visual language as the home/library. Synthetic entries
  // (e.g. FAST → /fast) become a card-shaped object with a linkOverride.
  function episodeCard(entry) {
    if (typeof entry === 'string') return cardBySlug(entry) || null;
    return { slug: entry.slug || entry.link, title: entry.title, teaser: entry.teaser || '', type: entry.type || 'tool', level: entry.level || 'beginner', linkOverride: entry.link };
  }
  // Episodes render as the full library card (renderV4Card).
  function renderEpisode(entry) {
    const card = episodeCard(entry);
    if (!card) return null;
    return renderV4Card(card, {});
  }
  // Enablers render as a compact chip (not a full card) so they don't add height.
  function enablerChip(entry) {
    const c = typeof entry === 'string' ? cardBySlug(entry) : null;
    const title = c ? c.title : entry.title;
    const type = c ? c.type : (entry.type || 'tool');
    const href = c ? cardHref(c) : (entry.link || '#');
    const a = document.createElement('a');
    a.className = 'nav-enabler-chip';
    a.href = href;
    a.style.setProperty('--rc', roleColorVar(type) || 'var(--text-dim)');
    a.innerHTML = `<span class="nav-enabler-ic">${ROLE_ICONS[type] || ''}</span><span>${title}</span>`;
    return a;
  }

  // ----- home: the phase shows as a grid, "everything" as a full-width bar -----
  scenarios.filter((s) => !s.byStage).forEach((sc) => scenariosEl.appendChild(showCardBox(sc, 'nav-sc-box')));
  const everythingSc = scenarios.find((s) => s.byStage);
  const everythingEl = field.querySelector('[data-nav-everything]');
  if (everythingSc && everythingEl) {
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'nav-everything-bar';
    bar.dataset.sc = everythingSc.slug;
    bar.innerHTML = `<span class="nav-everything-text"><span class="nav-everything-title">${everythingSc.title}</span><span class="nav-everything-sub">${everythingSc.situation || ''}</span></span><span class="nav-everything-arrow" aria-hidden="true">→</span>`;
    bar.addEventListener('click', () => openShow(everythingSc));
    everythingEl.appendChild(bar);
  }
  scenariosEl.addEventListener('click', (e) => {
    const b = e.target.closest('.nav-sc-box'); if (!b) return;
    const sc = scenarios.find((s) => s.slug === b.dataset.sc);
    if (sc) openShow(sc);
  });

  // A show box (used on the home and for "Up next"), so related shows read as
  // other series rather than plain text boxes.
  function showCardBox(sc, cls) {
    // Count + icons reflect the *available* cards only — coming-soon (roadmap)
    // cards don't count toward the number or add their type icon.
    const isLive = (c) => (typeof c === 'string' ? !(cardBySlug(c) || {}).coming_soon : true);
    const cards = scenarioCards(sc).filter(isLive);
    const typeOf = (c) => (typeof c === 'string' ? (cardBySlug(c) || {}).type : c.type);
    const order = ['creator', 'thought-partner', 'auditor', 'tool', 'panel'];
    const types = order.filter((t) => cards.some((c) => typeOf(c) === t));
    const icons = types.map((t) => `<span class="nav-sc-ic" style="color:${roleColorVar(t)}">${ROLE_ICONS[t] || ''}</span>`).join('');
    // A show with no available cards yet reads as "Coming soon", not "0 cards".
    const countText = cards.length === 0 ? 'Coming soon' : `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`;
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.dataset.sc = sc.slug;
    b.innerHTML = `<div class="nav-sc-title">${sc.title}</div><div class="nav-sc-blurb">${sc.situation || ''}</div><div class="nav-sc-foot"><span class="nav-sc-icons">${icons}</span><span class="nav-sc-count">${countText}</span></div>`;
    return b;
  }

  // ----- a show: episodes grouped into buckets -----
  const toTop = () => window.scrollTo({ top: 0, behavior: 'auto' });

  function openShow(sc) {
    const switching = field.classList.contains('showing-scene');
    if (switching) {
      // scene → scene (via arrows): quick body crossfade, no chooser involved.
      sceneBodyEl.style.opacity = '0';
      setTimeout(() => { buildScene(sc); sceneBodyEl.style.opacity = '1'; toTop(); }, 200);
    } else {
      // chooser → scene: fade the chooser out to reveal the star-field, then let
      // the cards surface from the universe (buildScene animates them in).
      chooserEl.style.opacity = '0';
      setTimeout(() => {
        field.classList.add('showing-scene');
        buildScene(sc);
        sceneBodyEl.style.opacity = '1';
        toTop();
      }, 300);
    }
    state.navShow = sc.slug;
  }

  function buildScene(sc) {
    const body = sceneBodyEl;
    body.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'nav-scene-head';
    head.innerHTML = `<h1 class="nav-scene-title">${sc.title}</h1><p class="nav-scene-sit">${sc.situation || ''}</p>`;
    body.appendChild(head);

    // Reference cards — shared prerequisites that live in their home show and
    // appear here as light chips (not repeated full cards).
    if (sc.assumes && sc.assumes.length) {
      const pre = document.createElement('div');
      pre.className = 'nav-assumes';
      pre.innerHTML = '<span class="nav-assumes-label">Cards you may find useful before you start</span>';
      const row = document.createElement('div');
      row.className = 'nav-enabler-chips';
      sc.assumes.forEach((e) => { const tl = enablerChip(e); if (tl) row.appendChild(tl); });
      pre.appendChild(row);
      body.appendChild(pre);
    }

    // Buckets. "byStage" (Show me everything) lists only the *available* cards by
    // stage — coming-soon roadmap cards are left out here, and stages with no
    // available cards are dropped.
    const moments = sc.byStage
      ? state.stages.map((s) => ({
          label: s.title,
          cards: cardsForStage(s.slug).filter((c) => !c.coming_soon).map((c) => c.slug),
        })).filter((m) => m.cards.length)
      : (sc.moments || []);

    // Centered content that mirrors the homepage: steps stack down the middle,
    // each a labelled column of cards.
    const cols = document.createElement('div');
    cols.className = 'nav-moments';
    moments.forEach((m, i) => {
      const col = document.createElement('div');
      col.className = 'nav-moment';
      const lbl = document.createElement('div');
      lbl.className = 'nav-moment-label';
      lbl.innerHTML = `<span class="nav-moment-num">${i + 1}</span>${m.label}`;
      col.appendChild(lbl);
      const cards = document.createElement('div');
      cards.className = 'nav-moment-cards';
      // Available cards first, coming-soon (roadmap) cards always at the bottom.
      const isSoon = (c) => typeof c === 'string' && !!(cardBySlug(c) || {}).coming_soon;
      const ordered = (m.cards || []).slice().sort((a, b) => (isSoon(a) ? 1 : 0) - (isSoon(b) ? 1 : 0));
      ordered.forEach((c) => { const tl = renderEpisode(c); if (tl) cards.appendChild(tl); });
      col.appendChild(cards);
      cols.appendChild(col);
    });
    body.appendChild(cols);

    // Cards surface from the star-field to the forefront, staggered in reading order.
    cols.querySelectorAll('.nav-moment-cards .card-preview').forEach((el, i) => {
      el.style.setProperty('--nav-in-delay', `${i * 45}ms`);
    });

    // Season arc: the "Previously" (left) and "Up next" (right) arrows follow the
    // show order on the home screen — the neighbouring series, skipping the
    // by-stage "everything" catch-all.
    const series = scenarios.filter((s) => !s.byStage);
    const idx = series.findIndex((s) => s.slug === sc.slug);
    setArrow(prevArrowEl, idx > 0 ? series[idx - 1] : null);
    setArrow(nextArrowEl, idx >= 0 && idx < series.length - 1 ? series[idx + 1] : null);
  }

  function setArrow(el, show) {
    if (!el) return;
    if (!show) { el.hidden = true; el.dataset.sc = ''; return; }
    el.hidden = false;
    el.dataset.sc = show.slug;
    const name = el.querySelector('.nav-arrow-name');
    if (name) name.textContent = show.title;
  }

  function showChooser() {
    field.classList.remove('showing-scene');
    // Fade the chooser back in (it was faded out when the scene opened).
    chooserEl.style.opacity = '0';
    setTimeout(() => { chooserEl.style.opacity = ''; }, 20);
    toTop();
    state.navShow = null;
  }
  // Let the top-bar Home link reset the navigator to the chooser.
  state.navResetToChooser = showChooser;

  sceneEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-nav-exit]')) { showChooser(); return; }
    // Season arc: prev/next arrows jump to the neighbouring show.
    const arrow = e.target.closest('[data-nav-prev], [data-nav-next]');
    if (arrow && arrow.dataset.sc) { const sc = scenarios.find((s) => s.slug === arrow.dataset.sc); if (sc) openShow(sc); return; }
    // Opening an episode: remember which show it came from so the card's back
    // link returns to the show, not the stage library.
    if (e.target.closest('.nav-moment-cards .v4-card') || e.target.closest('.nav-assumes .nav-enabler-chip')) state.fromShow = state.navShow;
  });

  // The 5 role icons as a small "signature" — a recurring welcome motif shared
  // by the popup and the chooser.
  function fillSignature(sig, cls) {
    if (!sig || sig.childElementCount) return;
    ['auditor', 'creator', 'thought-partner', 'tool', 'panel'].forEach((t) => {
      const s = document.createElement('span');
      s.className = cls;
      s.style.color = roleColorVar(t);
      s.innerHTML = ROLE_ICONS[t] || '';
      sig.appendChild(s);
    });
  }
  const chooserSig = field.querySelector('[data-nav-chooser-sig]');
  fillSignature(chooserSig, 'nav-chooser-sig-ic');

  // Legend — what the 5 role icons mean (revealed on scroll below the chooser).
  const legendGrid = field.querySelector('[data-nav-legend-grid]');
  if (legendGrid && !legendGrid.childElementCount) {
    const roles = [
      ['creator', 'Creator', 'Drafts assets — copy, outlines, media.'],
      ['thought-partner', 'Thought partner', 'Thinks with you; pushes back, weighs options.'],
      ['auditor', 'Auditor', 'Checks your work against a standard.'],
      ['tool', 'Tool', 'A reusable set-up you configure once.'],
      ['panel', 'Panel', 'Role-plays your audience to test on.'],
    ];
    roles.forEach(([type, name, desc]) => {
      const item = document.createElement('div');
      item.className = 'nav-legend-item';
      item.style.setProperty('--rc', roleColorVar(type));
      item.innerHTML = `<span class="nav-legend-ic">${ROLE_ICONS[type] || ''}</span><div class="nav-legend-text"><span class="nav-legend-name">${name}</span><span class="nav-legend-desc">${desc}</span></div>`;
      legendGrid.appendChild(item);
    });
  }
  const legendLevels = field.querySelector('[data-nav-legend-levels]');
  if (legendLevels && !legendLevels.childElementCount) {
    const levels = [
      ['beginner', 'Beginner', 'Start here — no AI set-up assumed.'],
      ['intermediate', 'Intermediate', 'Builds on the basics you’ve got.'],
      ['advanced', 'Advanced', 'For when you want to push further.'],
    ];
    levels.forEach(([level, name, desc]) => {
      const item = document.createElement('div');
      item.className = 'nav-legend-item is-level';
      const bars = document.createElement('span');
      bars.className = 'level-bars nav-legend-bars';
      renderLevelBars(bars, level);
      const text = document.createElement('div');
      text.className = 'nav-legend-text';
      text.innerHTML = `<span class="nav-legend-name">${name}</span><span class="nav-legend-desc">${desc}</span>`;
      item.appendChild(bars);
      item.appendChild(text);
      legendLevels.appendChild(item);
    });
  }
  // Scroll cues (chooser → legend → about) each jump to their data-scroll-to.
  field.querySelectorAll('[data-nav-scroll-cue]').forEach((cue) => {
    cue.addEventListener('click', () => {
      const target = field.querySelector(cue.getAttribute('data-scroll-to'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  // Let the top-bar About link scroll to the About section (see the link handler).
  state.navScrollTo = (sel) => {
    field.classList.remove('showing-scene');
    state.navShow = null;
    const target = field.querySelector(sel);
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  // Shuffle the signature icons' positions every ~2.8s (FLIP), like the old
  // library hero. Only while the chooser is on screen.
  if (chooserSig) {
    const sigTimer = setInterval(() => {
      if (!chooserSig.isConnected) { clearInterval(sigTimer); return; }
      if (field.classList.contains('showing-scene')) return;
      const items = Array.from(chooserSig.children);
      if (items.length < 2) return;
      const before = new Map(items.map((el) => [el, el.getBoundingClientRect().left]));
      const shuffled = items.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      shuffled.forEach((el) => chooserSig.appendChild(el));
      items.forEach((el) => {
        const delta = before.get(el) - el.getBoundingClientRect().left;
        el.style.transition = 'none';
        el.style.transform = `translateX(${delta}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform .9s cubic-bezier(0.2, 0.9, 0.3, 1)';
          el.style.transform = 'translateX(0)';
        });
      });
    }, 2800);
  }

  // Deep-return / Library: open the requested show immediately — synchronously,
  // before the chooser can paint, so there's no home-screen flash first.
  if (state.pendingShow) {
    const sc = scenarios.find((s) => s.slug === state.pendingShow);
    state.pendingShow = null;
    if (sc) {
      field.classList.add('showing-scene');
      buildScene(sc);
      sceneBodyEl.style.opacity = '1';
      state.navShow = sc.slug;
    }
  }

  // Arrived from a top-bar link that targets a section on the home (e.g. About).
  if (state.pendingScroll) {
    const sel = state.pendingScroll;
    state.pendingScroll = null;
    const target = field.querySelector(sel);
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  }
}

// Preview 4: Collapsible folder layout. Each stage is a folder with a header
// that expands/collapses to reveal a grid of cards. Vertical-only scroll.
function viewHomeV5() {
  state.view = 'preview4';
  renderSpine(null);
  const frag = tpl('tpl-home-v5');
  const foldersHost = $('[data-v5-folders]', frag);

  const addFolder = (stage, cards, cardCount) => {
    const folder = document.createElement('section');
    folder.className = 'v5-folder is-open';
    folder.setAttribute('data-v5-folder', '');
    const color = stage.color || stageColorVar(stage);
    folder.style.setProperty('--folder-color', color);

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'v5-folder-header';
    header.setAttribute('aria-expanded', 'true');
    header.innerHTML = `
      <span class="v5-folder-dot"></span>
      <span class="v5-folder-title">${stage.title}</span>
      <span class="v5-folder-count">${cardCount} ${cardCount === 1 ? 'card' : 'cards'}</span>
      <span class="v5-folder-chevron" aria-hidden="true">▾</span>
    `;
    folder.appendChild(header);

    const content = document.createElement('div');
    content.className = 'v5-folder-content';

    const editorial = document.createElement('p');
    editorial.className = 'v5-folder-editorial';
    editorial.textContent = `[PLACEHOLDER — Fer's 1-line editorial framing for ${stage.title}.]`;
    content.appendChild(editorial);

    const grid = document.createElement('div');
    grid.className = 'v5-folder-grid';
    cards.forEach((c) => grid.appendChild(renderV4Card(c)));
    content.appendChild(grid);

    folder.appendChild(content);
    return folder;
  };

  // Frameworks — FAST as first card
  const fastCard = {
    slug: 'fast-framework',
    title: 'The “perfect prompt” doesn’t exist.',
    teaser: 'A framework you can use while prompting.',
    type: 'tool',
    level: 'beginner',
    linkOverride: '/fast',
  };
  foldersHost.appendChild(
    addFolder(
      {
        slug: 'frameworks',
        title: 'Frameworks',
        summary: 'Meta-tools that apply across every card.',
        color: 'var(--r-thought-partner)',
      },
      [fastCard],
      1,
    ),
  );

  // Stage folders
  state.stages.forEach((stage) => {
    const inStage = state.cards.filter((c) => {
      const refs = Array.isArray(c.stage) ? c.stage : [c.stage];
      return refs.includes(stage.slug);
    });
    if (inStage.length === 0) return;
    inStage.sort((a, b) => Number(!!a.coming_soon) - Number(!!b.coming_soon));
    const realCount = inStage.filter((c) => !c.coming_soon).length;
    foldersHost.appendChild(addFolder(stage, inStage, realCount));
  });

  // Toggle handler — click folder header to expand/collapse
  foldersHost.addEventListener('click', (e) => {
    const header = e.target.closest('.v5-folder-header');
    if (!header) return;
    const folder = header.closest('.v5-folder');
    const wasOpen = folder.classList.contains('is-open');
    folder.classList.toggle('is-open', !wasOpen);
    header.setAttribute('aria-expanded', wasOpen ? 'false' : 'true');
  });

  wireWizardOpener();
  mount(frag);
}

// Preview 3: Netflix-style layout. Category tile as first item in each shelf,
// horizontal-scroll rows of big cards, sticky category tile on desktop.
function viewHomeV4() {
  state.view = 'preview3';
  renderSpine(null);
  const frag = tpl('tpl-home-v4');
  const shelvesHost = $('[data-v4-shelves]', frag);

  const addShelf = (stage, cards, cardCount, seeAllHref) => {
    const section = document.createElement('section');
    section.className = 'v4-shelf';
    section.setAttribute('data-v4-shelf', '');

    const color = stage.color || stageColorVar(stage);
    section.style.setProperty('--shelf-color', color);

    // Mobile-only header (hidden on desktop). Title + count + See all link.
    const mHeader = document.createElement('div');
    mHeader.className = 'v4-shelf-mheader';
    const mTitle = document.createElement('h2');
    mTitle.className = 'v4-shelf-mheader-title';
    mTitle.textContent = stage.title;
    mHeader.appendChild(mTitle);
    const mMeta = document.createElement('div');
    mMeta.className = 'v4-shelf-mheader-meta';
    const countText = cardCount === 0
      ? 'Coming soon'
      : `${cardCount} ${cardCount === 1 ? 'card' : 'cards'}`;
    const countEl = document.createElement('span');
    countEl.textContent = countText;
    mMeta.appendChild(countEl);
    if (seeAllHref) {
      const seeAll = document.createElement('a');
      seeAll.className = 'v4-shelf-mheader-seeall';
      seeAll.href = seeAllHref;
      seeAll.innerHTML = 'See all <span aria-hidden="true">→</span>';
      mMeta.appendChild(seeAll);
    }
    mHeader.appendChild(mMeta);
    section.appendChild(mHeader);

    const scroll = document.createElement('div');
    scroll.className = 'v4-shelf-scroll';

    // Category tile — same size as cards, solid stage color
    const tile = document.createElement('div');
    tile.className = 'v4-cat-tile';
    tile.style.setProperty('--cat-color', color);
    tile.innerHTML = `
      <h2 class="v4-cat-title">${stage.title}</h2>
      <p class="v4-cat-desc">${stage.summary || ''}</p>
      <div class="v4-cat-count">${cardCount} ${cardCount === 1 ? 'card' : 'cards'}</div>
    `;
    scroll.appendChild(tile);

    // Cards — bigger v4 treatment, tinted with the stage color for a cohesive row
    cards.forEach((c) => scroll.appendChild(renderV4Card(c, { color })));

    // See-all tile — link to the full stage page (skipped when there's nothing more)
    if (seeAllHref) {
      const seeAll = document.createElement('a');
      seeAll.className = 'v4-see-all';
      seeAll.href = seeAllHref;
      seeAll.innerHTML = `
        <span class="v4-see-all-arrow" aria-hidden="true">→</span>
        <span class="v4-see-all-label">See all</span>
      `;
      scroll.appendChild(seeAll);
    }

    section.appendChild(scroll);
    return section;
  };

  // Basics row — FAST as the anchor, then the Agent Builder tool. Both link out
  // to their own pages (linkOverride) rather than opening a card detail.
  const fastCard = {
    slug: 'fast-framework',
    title: 'The “perfect prompt” doesn’t exist.',
    teaser: 'A framework you can use while prompting.',
    type: 'tool',
    level: 'beginner',
    linkOverride: '/fast',
  };
  const agentBuilderCard = {
    slug: 'agent-builder',
    title: 'Build an agent, not just a prompt.',
    teaser: 'Five answers become a paste-ready setup for Claude, a Custom GPT, or Copilot.',
    type: 'tool',
    level: 'beginner',
    linkOverride: '/agent-builder',
  };
  const basicsCards = [fastCard, agentBuilderCard];
  shelvesHost.appendChild(
    addShelf(
      {
        slug: 'basics',
        title: 'Basics',
        summary: 'Foundations that apply across every card.',
        color: 'var(--r-thought-partner)',
      },
      basicsCards,
      basicsCards.length,
      null,
    ),
  );

  // Stage rows — every stage gets a shelf; empty stages show a coming-soon placeholder
  const levelOrder = { beginner: 0, intermediate: 1, advanced: 2 };
  state.stages.forEach((stage) => {
    const inStage = state.cards.filter((c) => {
      const refs = Array.isArray(c.stage) ? c.stage : [c.stage];
      return refs.includes(stage.slug);
    });
    const realCards = inStage.filter((c) => !c.coming_soon);

    if (realCards.length > 0) {
      // Sort by level: beginner → intermediate → advanced
      const sorted = realCards.slice().sort((a, b) => {
        return (levelOrder[a.level] ?? 3) - (levelOrder[b.level] ?? 3);
      });
      const topThree = sorted.slice(0, 3);
      shelvesHost.appendChild(
        addShelf(stage, topThree, realCards.length, `/stages/${stage.slug}`),
      );
    } else {
      // Empty stage — one coming-soon placeholder tile so the shelf still shows
      const placeholder = {
        slug: `coming-soon-${stage.slug}`,
        title: 'Coming soon',
        teaser: '',
        coming_soon: true,
        stage: stage.slug,
        level: 'beginner',
      };
      shelvesHost.appendChild(addShelf(stage, [placeholder], 0, null));
    }
  });

  wireWizardOpener();
  wireV4ScrollAnimation(shelvesHost);
  mount(frag);
  wireHeroSignature();
}

// Populates the top-right signature strip with the 5 role icons and
// shuffles their positions every ~2.8s using a FLIP animation.
function wireHeroSignature() {
  const host = document.querySelector('[data-hero-signature]');
  if (!host) return;
  host.innerHTML = '';
  const keys = ['creator', 'thought-partner', 'auditor', 'tool', 'panel'];
  keys.forEach((k) => {
    const el = document.createElement('span');
    el.className = 'v4-hero-signature-item';
    el.setAttribute('data-role', k);
    el.innerHTML = ROLE_ICONS[k] || '';
    host.appendChild(el);
  });

  const id = setInterval(() => {
    if (!host.isConnected) {
      clearInterval(id);
      return;
    }
    const items = Array.from(host.children);
    if (items.length < 2) return;
    // Record current positions before reordering
    const positions = new Map(items.map((el) => [el, el.getBoundingClientRect().left]));
    // Shuffle DOM order — Fisher-Yates
    const shuffled = items.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((el) => host.appendChild(el));
    // FLIP: apply inverse transform, then transition to zero
    items.forEach((el) => {
      const newLeft = el.getBoundingClientRect().left;
      const delta = positions.get(el) - newLeft;
      el.style.transition = 'none';
      el.style.transform = `translateX(${delta}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.9s cubic-bezier(0.2, 0.9, 0.3, 1)';
        el.style.transform = 'translateX(0)';
      });
    });
  }, 2800);
}

// Bigger card design for /preview3 — big role icon + type at top, level at bottom.
// Card accent color comes from the stage it belongs to (not the role), so a row of
// cards reads as a cohesive stage rather than a rainbow of roles.
function renderV4Card(card, opts = {}) {
  const frag = renderCardPreview(card, { showLevel: true });
  const anchor = frag.querySelector('a');
  if (!anchor) return frag;
  anchor.classList.add('v4-card');
  if (card.linkOverride) anchor.setAttribute('href', card.linkOverride);

  // Override the accent to stage color for a cohesive row appearance
  if (opts.color) anchor.style.setProperty('--role-color', opts.color);

  // Remove the bottom role-label (icon + name) — we're relocating it to the top
  const existingRoleLabel = anchor.querySelector('.card-chips .role-label');
  if (existingRoleLabel) existingRoleLabel.remove();

  // Add a level text label next to the level bars (beginner / intermediate / advanced),
  // or a "Coming soon" badge if this is a placeholder tile
  const chips = anchor.querySelector('.card-chips');
  if (chips) {
    if (card.coming_soon) {
      chips.innerHTML = '';
      const badge = document.createElement('span');
      badge.className = 'v4-card-coming-soon';
      badge.textContent = 'Coming soon';
      chips.appendChild(badge);
    } else if (card.level) {
      const levelText = document.createElement('span');
      levelText.className = 'v4-card-level-text';
      levelText.textContent = card.level;
      chips.insertBefore(levelText, chips.firstChild);
    }
  }

  // Inject a header row: big role icon + type text
  const body = anchor.querySelector('.card-body');
  if (body) {
    const header = document.createElement('div');
    header.className = 'v4-card-header';

    if (card.type && ROLE_ICONS[card.type]) {
      const iconWrap = document.createElement('div');
      iconWrap.className = 'v4-card-role-icon';
      iconWrap.innerHTML = ROLE_ICONS[card.type];
      header.appendChild(iconWrap);
    }

    if (card.type) {
      const typeLabel = document.createElement('span');
      typeLabel.className = 'v4-card-type';
      typeLabel.textContent = card.type.replace('-', ' ');
      header.appendChild(typeLabel);
    }

    body.insertBefore(header, body.firstChild);
  }

  return frag;
}

function wireV4ScrollAnimation(root) {
  if (!('IntersectionObserver' in window)) return;
  const shelves = root.querySelectorAll('[data-v4-shelf]');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-in-view');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });
  shelves.forEach((s) => io.observe(s));
}

// Preview 2: library-as-home. Cards visible immediately, editorial section
// headers per stage, one featured card up top, opt-in "Ask me" wizard modal.
// No spine, no filter chips — the library IS the interface.

function viewHomeV3() {
  state.view = 'preview2';
  renderSpine(null);
  const frag = tpl('tpl-home-v3');

  // Library: cards grouped by stage, editorial header per group.
  // FAST is rendered as the first card in a "Frameworks" section — a card about prompting.
  const libraryHost = $('[data-v3-library]', frag);
  if (libraryHost) {
    // "Frameworks" section — currently just FAST, but the section signals room to grow.
    const frameworksSection = document.createElement('section');
    frameworksSection.className = 'v3-lib-section v3-lib-section-frameworks';
    frameworksSection.style.setProperty('--stage-color', 'var(--r-thought-partner)');

    const fwHeader = document.createElement('header');
    fwHeader.className = 'v3-lib-header';
    fwHeader.innerHTML = `
      <div class="v3-lib-header-top">
        <span class="v3-lib-dot"></span>
        <h2 class="v3-lib-title">Frameworks</h2>
        <span class="v3-lib-count">1 card</span>
      </div>
      <p class="v3-lib-editorial">[PLACEHOLDER — Fer's 1-line editorial framing for Frameworks.]</p>
    `;
    frameworksSection.appendChild(fwHeader);

    const fwGrid = document.createElement('div');
    fwGrid.className = 'card-grid v3-lib-grid';

    // FAST rendered as a card, but click goes to /fast (not a modal).
    const fastCard = {
      slug: 'fast-framework',
      title: 'The “perfect prompt” doesn’t exist.',
      teaser: 'A framework you can use while prompting.',
      type: 'tool',
      level: 'beginner',
      stage: 'frameworks',
    };
    const fastFrag = renderCardPreview(fastCard, { showLevel: false });
    const fastAnchor = fastFrag.querySelector('a');
    if (fastAnchor) fastAnchor.setAttribute('href', '/fast');
    fwGrid.appendChild(fastFrag);
    frameworksSection.appendChild(fwGrid);
    libraryHost.appendChild(frameworksSection);

    state.stages.forEach((stage) => {
      const inStage = state.cards.filter((c) => {
        const refs = Array.isArray(c.stage) ? c.stage : [c.stage];
        return refs.includes(stage.slug);
      });
      if (inStage.length === 0) return;
      inStage.sort((a, b) => Number(!!a.coming_soon) - Number(!!b.coming_soon));

      const realCount = inStage.filter((c) => !c.coming_soon).length;

      const section = document.createElement('section');
      section.className = 'v3-lib-section';
      section.style.setProperty('--stage-color', stageColorVar(stage));

      const header = document.createElement('header');
      header.className = 'v3-lib-header';
      header.innerHTML = `
        <div class="v3-lib-header-top">
          <span class="v3-lib-dot"></span>
          <h2 class="v3-lib-title">${stage.title}</h2>
          <span class="v3-lib-count">${realCount} ${realCount === 1 ? 'card' : 'cards'}</span>
        </div>
        <p class="v3-lib-editorial">[PLACEHOLDER — Fer's 1-line editorial framing for ${stage.title}.]</p>
      `;
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'card-grid v3-lib-grid';
      inStage.forEach((c) => grid.appendChild(renderCardPreview(c, { showLevel: false })));
      section.appendChild(grid);

      libraryHost.appendChild(section);
    });
  }

  // Wizard: opt-in "Ask me" chat modal. Content is placeholder — the branching
  // tree lives in wizardTree below. Fer edits later.
  wireWizardOpener();

  mount(frag);
}

// ---------- Ask-me wizard ----------
// Placeholder branching tree. Real content authored later.
const wizardTree = {
  start: {
    prompt: '[PLACEHOLDER — Opening question. e.g. "Where are you today?"]',
    options: [
      { label: '[Option A — e.g. Starting a project]', next: 'starting' },
      { label: '[Option B — e.g. In the middle of design]', next: 'designing' },
      { label: '[Option C — e.g. Building content]', next: 'building' },
      { label: '[Option D — Just poking around]', next: 'poking' },
    ],
  },
  starting: {
    prompt: '[PLACEHOLDER — Follow-up on the starting branch.]',
    options: [
      { label: '[Sub-option A — Talking to stakeholders]', next: 'ep_stakeholders' },
      { label: '[Sub-option B — Just got a request]', next: 'ep_request' },
    ],
  },
  designing: {
    prompt: '[PLACEHOLDER — Placeholder response for the design branch.]',
    cards: ['build-a-learner-persona', 'choose-the-right-modality'],
  },
  building: {
    prompt: '[PLACEHOLDER — Placeholder response for the build branch.]',
    cards: ['topic-to-module-outline', 'build-knowledge-checks-at-the-right-cognitive-level'],
  },
  poking: {
    prompt: '[PLACEHOLDER — Placeholder for the browser. Probably send them to FAST.]',
    cards: ['audit-module-against-style-guide'],
    ctaLink: { href: '/fast', label: 'Read the FAST primer →' },
  },
  ep_stakeholders: {
    prompt: '[PLACEHOLDER — Response for stakeholders sub-branch.]',
    cards: ['prep-for-a-needs-assessment-call', 'build-your-stakeholder-map'],
  },
  ep_request: {
    prompt: '[PLACEHOLDER — Response for received-a-request sub-branch.]',
    cards: ['diagnose-what-the-last-course-got-wrong'],
  },
};

function wireWizardOpener() {
  const dialog = document.getElementById('wizard-dialog');
  if (!dialog || dialog.dataset.wired === '1') return;
  dialog.dataset.wired = '1';

  const thread = dialog.querySelector('[data-wizard-thread]');

  function typingBubble() {
    const el = document.createElement('div');
    el.className = 'wizard-msg wizard-msg-fer wizard-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    return el;
  }

  function ferBubble(text) {
    const el = document.createElement('div');
    el.className = 'wizard-msg wizard-msg-fer';
    el.textContent = text;
    return el;
  }

  function userBubble(text) {
    const el = document.createElement('div');
    el.className = 'wizard-msg wizard-msg-user';
    el.textContent = text;
    return el;
  }

  function optionsBlock(options, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'wizard-options';
    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wizard-option';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => onPick(opt));
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function cardsBlock(cardSlugs) {
    const wrap = document.createElement('div');
    wrap.className = 'wizard-cards';
    cardSlugs.forEach((slug) => {
      const card = cardBySlug(slug);
      if (!card) return;
      wrap.appendChild(renderCardPreview(card));
    });
    return wrap;
  }

  function endpointActions(node) {
    const wrap = document.createElement('div');
    wrap.className = 'wizard-endpoint-actions';
    const restart = document.createElement('button');
    restart.type = 'button';
    restart.className = 'wizard-option wizard-option-quiet';
    restart.textContent = 'Ask something else';
    restart.addEventListener('click', () => restartFlow());
    wrap.appendChild(restart);

    if (node.ctaLink) {
      const link = document.createElement('a');
      link.href = node.ctaLink.href;
      link.className = 'wizard-option wizard-option-cta';
      link.textContent = node.ctaLink.label;
      link.addEventListener('click', () => dialog.close());
      wrap.appendChild(link);
    }
    return wrap;
  }

  function scrollToBottom() {
    dialog.scrollTop = dialog.scrollHeight;
    thread.scrollTop = thread.scrollHeight;
  }

  function renderNode(nodeId) {
    const node = wizardTree[nodeId];
    if (!node) return;

    const typing = typingBubble();
    thread.appendChild(typing);
    scrollToBottom();

    setTimeout(() => {
      typing.remove();
      thread.appendChild(ferBubble(node.prompt));
      scrollToBottom();

      setTimeout(() => {
        if (node.options) {
          thread.appendChild(optionsBlock(node.options, (opt) => {
            thread.appendChild(userBubble(opt.label));
            renderNode(opt.next);
          }));
        } else if (node.cards) {
          thread.appendChild(cardsBlock(node.cards));
          thread.appendChild(endpointActions(node));
        }
        scrollToBottom();
      }, 220);
    }, 620);
  }

  function restartFlow() {
    thread.innerHTML = '';
    renderNode('start');
  }

  // Open/close wiring
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-wizard-open]')) {
      e.preventDefault();
      restartFlow();
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (e.target.closest('[data-wizard-close]')) {
      e.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

// Preview: alternate "notebook" home layout — Netflix-style shelves.
// Lives at /preview so we can compare against the current home before committing.
function viewHomeV2() {
  state.view = 'preview';
  renderSpine(null);
  const frag = tpl('tpl-home-v2');

  // Recent additions — most recent 6, excluding coming-soon
  const recentHost = $('[data-v2-recent]', frag);
  if (recentHost) {
    const recent = state.cards
      .filter((c) => !c.coming_soon)
      .slice()
      .sort((a, b) => (b.added || '').localeCompare(a.added || ''))
      .slice(0, 6);
    recent.forEach((c) => recentHost.appendChild(renderCardPreview(c)));
  }

  // Per-stage shelves — real cards first, coming-soon at the end
  frag.querySelectorAll('[data-v2-stage]').forEach((host) => {
    const slug = host.getAttribute('data-v2-stage');
    const inStage = state.cards.filter((c) => {
      const refs = Array.isArray(c.stage) ? c.stage : [c.stage];
      return refs.includes(slug);
    });
    inStage.sort((a, b) => Number(!!a.coming_soon) - Number(!!b.coming_soon));
    inStage.forEach((c) => host.appendChild(renderCardPreview(c)));
  });

  mount(frag);
}

function viewNotFound() { state.view = 'notfound'; renderSpine(null); mount(tpl('tpl-not-found')); }

function mount(frag) {
  const view = $('#view');
  view.innerHTML = '';
  view.appendChild(frag);
  // Sync body class for view-specific layout rules (e.g. hide mobile picker on home).
  const v = state.view || '';
  const cls = v.startsWith('stage:') ? 'view-stage' : `view-${v || 'home'}`;
  document.body.classList.remove('view-home', 'view-stage', 'view-cards', 'view-recent', 'view-about', 'view-fast', 'view-agent-builder', 'view-map', 'view-navigator', 'view-notfound', 'view-preview', 'view-preview2', 'view-preview3', 'view-preview4', 'view-card-v4', 'view-design-a', 'view-design-b', 'view-design-c', 'view-download-fast');
  document.body.classList.add(cls);
  window.scrollTo({ top: 0 });
}

// ---------- Design test pages (three variants of the same card) ----------
function viewDesignTest(slug, designKey) {
  const card = cardBySlug(slug);
  if (!card) return viewNotFound();
  state.view = `design-${designKey}`;

  const frag = tpl('tpl-design-test');
  const article = frag.querySelector('.design-page');
  const stages = cardStages(card);
  const primaryStage = stages[0];
  const stageColor = primaryStage ? stageColorVar(primaryStage) : 'var(--r-creator)';
  if (article) {
    article.classList.add(`design-${designKey}`);
    article.style.setProperty('--stage-color', stageColor);
  }

  // Design switcher chip
  const switcher = frag.querySelector('[data-design-switcher]');
  if (switcher) {
    ['a', 'b', 'c'].forEach((k) => {
      const link = switcher.querySelector(`[data-key="${k}"]`);
      if (link && k === designKey) link.classList.add('is-active');
    });
  }
  const type = cardTypes(card)[0];
  const iconSVG = ROLE_ICONS[type] || '';
  const typeText = roleLabelTextForType(type) || '';

  // Back link
  const backLink = frag.querySelector('[data-back-link]');
  if (backLink && primaryStage) {
    backLink.setAttribute('href', `/stages/${primaryStage.slug}`);
    backLink.innerHTML = `<span aria-hidden="true">←</span> Back to ${primaryStage.title}`;
  }

  // Hero: eyebrow (icon + stage · role), title, meta, teaser
  const eyebrow = frag.querySelector('[data-eyebrow]');
  if (eyebrow) {
    if (iconSVG) {
      const inlineIcon = document.createElement('span');
      inlineIcon.className = 'design-page-eyebrow-icon';
      inlineIcon.innerHTML = iconSVG;
      eyebrow.appendChild(inlineIcon);
    }
    const label = document.createElement('span');
    const parts = [];
    if (primaryStage) parts.push(primaryStage.title);
    if (typeText) parts.push(typeText);
    label.textContent = parts.join(' · ');
    eyebrow.appendChild(label);
  }
  const titleEl = frag.querySelector('[data-title]');
  if (titleEl) titleEl.textContent = card.title;
  const metaEl = frag.querySelector('[data-meta]');
  if (metaEl) {
    const levelWrap = document.createElement('span');
    levelWrap.className = 'design-page-level';
    const bars = document.createElement('span');
    bars.className = 'level-bars';
    renderLevelBars(bars, card.level);
    const levelTextEl = document.createElement('span');
    levelTextEl.textContent = levelLabel(card.level);
    levelWrap.append(bars, levelTextEl);
    metaEl.appendChild(levelWrap);
  }
  const teaserEl = frag.querySelector('[data-teaser]');
  if (teaserEl) {
    if (card.teaser) teaserEl.textContent = card.teaser;
    else teaserEl.remove();
  }

  // Sections
  const bodyHost = frag.querySelector('[data-card-body]');
  const promptHost = frag.querySelector('[data-card-prompt]');
  const tipHost = frag.querySelector('[data-card-tip]');
  appendCardSections(card, { bodyHost, promptHost, tipHost });

  // Show prompt section only if there's a prompt
  const promptSection = frag.querySelector('[data-prompt-section]');
  if (promptSection && promptHost && promptHost.childElementCount > 0) {
    promptSection.hidden = false;
  }

  // Related cards
  const related = (card.related || []).map(cardBySlug).filter(Boolean);
  if (related.length) {
    const relatedWrap = frag.querySelector('[data-related]');
    const relatedGrid = frag.querySelector('[data-related-grid]');
    if (relatedWrap && relatedGrid) {
      relatedWrap.hidden = false;
      related.forEach((c) => {
        const cs = cardStages(c);
        const col = cs[0] ? stageColorVar(cs[0]) : stageColor;
        relatedGrid.appendChild(renderV4Card(c, { color: col }));
      });
    }
  }

  // Design C: build sticky right-side TOC and wire scroll-spy
  if (designKey === 'c') {
    const flow = frag.querySelector('.design-page-flow');
    const toc = frag.querySelector('[data-design-c-toc]');
    if (toc && flow) {
      const items = [
        { key: 'intro', label: 'Intro' },
        { key: 'why', label: 'Why it matters' },
        { key: 'how', label: 'How AI helps' },
        { key: 'wont', label: "AI won't" },
        { key: 'steps', label: 'How to run it' },
        { key: 'prompt', label: 'The prompt' },
        { key: 'tip', label: 'Pro tip' },
      ];
      items.forEach((it) => {
        const dot = document.createElement('a');
        dot.className = 'design-c-toc-item';
        dot.setAttribute('data-target', it.key);
        dot.innerHTML = `<span class="design-c-toc-dot"></span><span class="design-c-toc-label">${it.label}</span>`;
        toc.appendChild(dot);
      });
    }
  }

  // Reveals
  const reveals = [
    frag.querySelector('.design-page-hero'),
    ...frag.querySelectorAll('.design-page-flow > *'),
  ].filter(Boolean);
  reveals.forEach((el, i) => {
    el.setAttribute('data-reveal', '');
    el.style.setProperty('--reveal-delay', `${Math.min(i, 4) * 60}ms`);
  });

  mount(frag);
  wireRevealAnimation(document.querySelector('.design-page'));

  if (designKey === 'c') {
    wireDesignCScrollSpy();
  }

  if (!state.savedTitle) state.savedTitle = document.title;
  document.title = `${card.title} · Design ${designKey.toUpperCase()} · AI in the Park`;
}

function wireDesignCScrollSpy() {
  const items = document.querySelectorAll('.design-c-toc-item');
  const flow = document.querySelector('.design-c .design-page-flow');
  if (!items.length || !flow) return;

  const map = new Map();
  items.forEach((it) => {
    const key = it.getAttribute('data-target');
    // Match direct data-section, plus prompt-section and card-pro-tip
    let target = null;
    if (key === 'prompt') target = flow.querySelector('[data-prompt-section]');
    else if (key === 'tip') target = flow.querySelector('.card-pro-tip');
    else target = flow.querySelector(`[data-section="${key}"]`);
    if (target) map.set(target, it);

    it.addEventListener('click', (e) => {
      e.preventDefault();
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const dot = map.get(e.target);
      if (!dot) return;
      if (e.isIntersecting) {
        items.forEach((i) => i.classList.remove('is-active'));
        dot.classList.add('is-active');
      }
    });
  }, { rootMargin: '-40% 0px -40% 0px' });

  map.forEach((_, el) => io.observe(el));
}

// ---------- Full-page card view (v4 prototype) ----------
function viewCardV4(slug) {
  const card = cardBySlug(slug);
  if (!card) return viewNotFound();
  state.view = 'card-v4';

  const frag = tpl('tpl-card-v4-page');
  const stages = cardStages(card);
  const primaryStage = stages[0];
  const stageColor = primaryStage ? stageColorVar(primaryStage) : 'var(--r-creator)';
  const type = cardTypes(card)[0];
  const iconSVG = ROLE_ICONS[type] || '';
  const typeText = roleLabelTextForType(type) || '';

  // The card page is accented by its TYPE (auditor → pink, creator → purple…),
  // not the stage, so the colour matches the card's role.
  const accent = roleColorVar(type) || stageColor;
  const article = frag.querySelector('.card-v4-page');
  const frame = frag.querySelector('.card-detail-frame');
  if (article) article.style.setProperty('--stage-color', accent);
  if (frame) frame.style.setProperty('--stage-color', accent);

  // Back link — return to the show we came from (if any), else the primary
  // stage, else home. Arriving from a navigator show sets state.fromShow.
  const backLink = frag.querySelector('[data-back-link]');
  if (backLink) {
    const fromShow = state.fromShow;
    const showObj = fromShow && (state.scenarios || []).find((s) => s.slug === fromShow);
    if (showObj) {
      state.pendingShow = fromShow; // so returning to "/" re-opens the show
      backLink.setAttribute('href', '/');
      backLink.innerHTML = `<span aria-hidden="true">←</span> Back to ${showObj.title}`;
    } else if (primaryStage) {
      backLink.setAttribute('href', `/stages/${primaryStage.slug}`);
      backLink.innerHTML = `<span aria-hidden="true">←</span> Back to ${primaryStage.title}`;
    } else {
      backLink.setAttribute('href', '/');
    }
    state.fromShow = null;
  }

  // Card header — role icon + role-type text (same DNA as home shelf card)
  const iconBox = frag.querySelector('[data-hero-icon]');
  if (iconBox) iconBox.innerHTML = iconSVG;
  const roleTypeEl = frag.querySelector('[data-role-type]');
  if (roleTypeEl) roleTypeEl.textContent = typeText;

  // Hero: stage tag, title, teaser
  const stageTagEl = frag.querySelector('[data-stage-tag]');
  if (stageTagEl && primaryStage) stageTagEl.textContent = primaryStage.title;

  const titleEl = frag.querySelector('[data-title]');
  if (titleEl) titleEl.textContent = card.title;

  const teaserEl = frag.querySelector('[data-teaser]');
  if (teaserEl) {
    if (card.teaser) teaserEl.textContent = card.teaser;
    else teaserEl.remove();
  }

  // Footer level bars + text (mirrors home shelf card footer)
  const levelBarsEl = frag.querySelector('[data-level-bars]');
  if (levelBarsEl) renderLevelBars(levelBarsEl, card.level);
  const levelTextEl2 = frag.querySelector('[data-level-text]');
  if (levelTextEl2) levelTextEl2.textContent = levelLabel(card.level);

  // Single-column flow — body, then prompt section (if any), then pro tip
  const bodyHost = frag.querySelector('[data-card-body]');
  const promptHost = frag.querySelector('[data-card-prompt]');
  const tipHost = frag.querySelector('[data-card-tip]');
  appendCardSections(card, { bodyHost, promptHost, tipHost });

  // Newspaper wrap only makes sense on desktop — on mobile the gif is a full-width
  // block and belongs in its natural position (between the paragraphs), not before
  // the first paragraph where it now floats above everything.
  const intro = bodyHost && bodyHost.querySelector('[data-section="intro"]');
  const isDesktop = typeof window !== 'undefined' &&
    window.matchMedia && window.matchMedia('(min-width: 721px)').matches;
  if (intro && isDesktop) {
    intro.querySelectorAll('figure, .inline-gif-wrap').forEach((fig) => {
      intro.insertBefore(fig, intro.firstChild);
    });
  }

  // Show the prompt section wrapper only if the card actually has a prompt
  const promptSection = frag.querySelector('[data-prompt-section]');
  if (promptSection && promptHost && promptHost.childElementCount > 0) {
    promptSection.hidden = false;
  } else {
    // No prompt: drop the whole aside and let the main column fill the width
    const aside = frag.querySelector('.card-detail-aside');
    if (aside) aside.remove();
    const cols = frag.querySelector('.card-detail-body-columns');
    if (cols) cols.classList.add('is-single-column');
  }

  // Related — as a compact list of lines (not cards), inside the frame
  const related = (card.related || []).map(cardBySlug).filter(Boolean);
  if (related.length) {
    const relatedWrap = frag.querySelector('[data-related]');
    const relatedList = frag.querySelector('[data-related-list]');
    if (relatedWrap && relatedList) {
      relatedWrap.hidden = false;
      related.forEach((c) => {
        const cs = cardStages(c);
        const col = cs[0] ? stageColorVar(cs[0]) : stageColor;
        const relType = cardTypes(c)[0];
        const relIcon = ROLE_ICONS[relType] || '';
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = cardHref(c);
        a.className = 'card-detail-related-line';
        a.style.setProperty('--role-color', col);
        a.innerHTML = `
          <span class="card-detail-related-icon">${relIcon}</span>
          <span class="card-detail-related-title"></span>
          <span class="card-detail-related-meta"></span>
          <span class="card-detail-related-arrow" aria-hidden="true">→</span>
        `;
        a.querySelector('.card-detail-related-title').textContent = c.title;
        const meta = [];
        if (cs[0]) meta.push(cs[0].title);
        if (c.level) meta.push(levelLabel(c.level));
        a.querySelector('.card-detail-related-meta').textContent = meta.join(' · ');
        li.appendChild(a);
        relatedList.appendChild(li);
      });
    }
  }

  // Reveal the card frame, then the related section
  const reveals = [
    frag.querySelector('.card-detail-frame'),
    frag.querySelector('.card-v4-page-related'),
  ].filter(Boolean);
  reveals.forEach((el, i) => {
    el.setAttribute('data-reveal', '');
    el.style.setProperty('--reveal-delay', `${i * 120}ms`);
  });

  mount(frag);
  wireRevealAnimation(document.querySelector('.card-v4-page'));
  // Same universe as the navigator, so opening a card feels like the same page.
  initStarfield(document.querySelector('[data-card-bg]'));

  // Tab title
  if (!state.savedTitle) state.savedTitle = document.title;
  document.title = `${card.title} · AI in the Park`;
}

function wireRevealAnimation(root) {
  if (!root || !('IntersectionObserver' in window)) return;
  const targets = Array.from(root.querySelectorAll('[data-reveal]'));
  // Include root itself if it carries data-reveal (querySelectorAll skips the root)
  if (root.hasAttribute && root.hasAttribute('data-reveal')) targets.push(root);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-in-view');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });
  targets.forEach((t) => io.observe(t));
}

// ---------- Card sections (shared between modal + full-page card view) ----------
// Renders intro / why / how-AI-helps / AI-wont / steps into bodyHost,
// prompt block into promptHost, and pro tip into tipHost.
function appendCardSections(card, { bodyHost, promptHost, tipHost }) {
  const renderSection = (emoji, title, contentHTML, options = {}) => {
    if (!contentHTML || !bodyHost) return;
    const wrap = document.createElement('div');
    wrap.className = 'card-section' + (options.extraClass ? ` ${options.extraClass}` : '');
    if (options.sectionKey) wrap.setAttribute('data-section', options.sectionKey);
    if (title) {
      const h = document.createElement('h3');
      h.className = 'card-section-heading';
      if (emoji) {
        const e = document.createElement('span');
        e.className = 'card-section-heading-emoji';
        e.setAttribute('aria-hidden', 'true');
        e.textContent = emoji;
        h.appendChild(e);
      }
      h.appendChild(document.createTextNode(title));
      wrap.appendChild(h);
    }
    const body = document.createElement('div');
    body.className = 'prose';
    body.innerHTML = contentHTML;
    wrap.appendChild(body);
    bodyHost.appendChild(wrap);
  };

  if (bodyHost) {
    if (card.intro) {
      const wrap = document.createElement('div');
      wrap.className = 'card-section card-section-intro prose';
      wrap.setAttribute('data-section', 'intro');
      wrap.innerHTML = card.intro;
      bodyHost.appendChild(wrap);
    } else if (card.body) {
      const wrap = document.createElement('div');
      wrap.className = 'card-section prose';
      wrap.setAttribute('data-section', 'intro');
      wrap.innerHTML = card.body;
      bodyHost.appendChild(wrap);
    }

    renderSection('🎯', 'Why this matters', card.why_matters, { sectionKey: 'why' });

    if (card.how_ai_helps && card.ai_wont) {
      const row = document.createElement('div');
      row.className = 'card-row-2col';
      const mkMini = (emoji, title, content, sectionKey) => {
        const w = document.createElement('div');
        w.className = 'card-section card-mini';
        w.setAttribute('data-section', sectionKey);
        const h = document.createElement('h3');
        h.className = 'card-section-heading';
        const e = document.createElement('span');
        e.className = 'card-section-heading-emoji';
        e.setAttribute('aria-hidden', 'true');
        e.textContent = emoji;
        h.appendChild(e);
        h.appendChild(document.createTextNode(title));
        const body = document.createElement('div');
        body.className = 'prose';
        body.innerHTML = content;
        w.append(h, body);
        return w;
      };
      row.appendChild(mkMini('🤖', 'How AI can help', card.how_ai_helps, 'how'));
      row.appendChild(mkMini('⚠️', "What AI won't do", card.ai_wont, 'wont'));
      bodyHost.appendChild(row);
    } else {
      renderSection('🤖', 'How AI can help', card.how_ai_helps, { sectionKey: 'how' });
      renderSection('⚠️', "What AI won't do", card.ai_wont, { sectionKey: 'wont' });
    }

    if (Array.isArray(card.steps) && card.steps.length) {
      const wrap = document.createElement('div');
      wrap.className = 'card-section';
      wrap.setAttribute('data-section', 'steps');
      const h = document.createElement('h3');
      h.className = 'card-section-heading';
      const e = document.createElement('span');
      e.className = 'card-section-heading-emoji';
      e.setAttribute('aria-hidden', 'true');
      e.textContent = '⚙️';
      h.appendChild(e);
      h.appendChild(document.createTextNode('How to run it'));
      wrap.appendChild(h);
      const ol = document.createElement('ol');
      ol.className = 'card-section-steps';
      card.steps.forEach((step) => {
        const li = document.createElement('li');
        li.innerHTML = step;
        ol.appendChild(li);
      });
      wrap.appendChild(ol);
      bodyHost.appendChild(wrap);
    }
  }

  if (promptHost) {
    if (card.prompt_fast) {
      const disclaimer = document.createElement('p');
      disclaimer.className = 'prompt-fast-disclaimer';
      disclaimer.innerHTML = 'This prompt follows the <a href="/fast">FAST</a> model: Frame · Ask · Shape · Tune.';
      promptHost.appendChild(disclaimer);

      const block = document.createElement('div');
      block.className = 'prompt-block';
      const inner = document.createElement('div');
      inner.className = 'prompt-fast-block';

      const header = document.createElement('div');
      header.className = 'prompt-fast-header';

      const order = ['frame', 'ask', 'shape', 'tune'];
      const cleanParts = [];
      order.forEach((key) => {
        const content = card.prompt_fast[key];
        if (!content) return;
        const section = document.createElement('div');
        section.className = `prompt-fast-section fast-${key}`;
        const label = document.createElement('span');
        label.className = 'prompt-fast-label';
        label.textContent = key;
        const body = document.createElement('div');
        body.className = 'prompt-fast-content';
        body.textContent = content;
        section.append(label, body);
        inner.appendChild(section);
        cleanParts.push(content);
      });

      const cleanPrompt = cleanParts.join('\n\n');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Copy prompt';
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(cleanPrompt);
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => (btn.textContent = orig), 1500);
        } catch {}
      });
      header.appendChild(btn);
      inner.insertBefore(header, inner.firstChild);
      block.appendChild(inner);
      promptHost.appendChild(block);
    } else if (cardTypes(card).includes('prompt') && card.prompt_body) {
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
      promptHost.appendChild(block);
    }
  }

  if (tipHost && card.pro_tip) {
    const wrap = document.createElement('aside');
    wrap.className = 'card-pro-tip';
    const photo = document.createElement('img');
    photo.className = 'card-pro-tip-photo';
    photo.src = '/assets/avatar.jpg';
    photo.alt = 'Fernando De Vega';
    const bubble = document.createElement('div');
    bubble.className = 'card-pro-tip-bubble';
    const label = document.createElement('span');
    label.className = 'card-pro-tip-label';
    label.textContent = card.tip_label || 'Pro tip';
    bubble.appendChild(label);
    const body = document.createElement('div');
    body.innerHTML = `<p>${card.pro_tip}</p>`;
    bubble.appendChild(body);
    wrap.append(photo, bubble);
    tipHost.appendChild(wrap);
  }
}

// ---------- Modal ----------
function openModal(slug) {
  const card = cardBySlug(slug);
  const modal = $('#modal');
  const body = $('#modal-body');
  body.innerHTML = '';

  if (!card || card.coming_soon) {
    body.innerHTML = '<h1>Not found</h1><p>That card does not exist yet.</p>';
  } else {
    const frag = tpl('tpl-card');

    // Optional illustration OR emoji hero — sits in the right column of the header
    // on desktop, stacks on mobile. Illustration wins if both are set.
    const illustration = $('[data-card-illustration]', frag);
    const header = $('[data-card-header]', frag);
    if (card.illustration) {
      illustration.setAttribute('src', card.illustration);
      illustration.setAttribute('alt', `Illustration for ${card.title}`);
      illustration.setAttribute('loading', 'lazy');
      illustration.hidden = false;
      header.classList.add('has-illustration');
    } else if (card.emoji) {
      const emojiBox = document.createElement('div');
      emojiBox.className = 'card-emoji-hero';
      emojiBox.setAttribute('aria-hidden', 'true');
      emojiBox.textContent = card.emoji;
      illustration.replaceWith(emojiBox);
      header.classList.add('has-illustration');
    } else {
      illustration.remove();
    }

    // Type chips removed (Option A: drop the chip noise; stage color band carries
    // visual identity, tags carry topical variety). Only the level badge remains
    // in the metadata row at the top of the modal.
    const metaRow = $('[data-card-types]', frag);
    const levelBadge = document.createElement('span');
    levelBadge.className = 'level-badge';
    const levelDots = document.createElement('span');
    levelDots.className = 'level-bars';
    renderLevelBars(levelDots, card.level);
    levelBadge.append(levelDots, document.createTextNode(levelLabel(card.level)));
    metaRow.appendChild(levelBadge);

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

    const bodyHost = $('[data-card-body]', frag);
    const promptHost = $('[data-card-prompt]', frag);
    const tipHost = $('[data-card-tip]', frag);
    appendCardSections(card, { bodyHost, promptHost, tipHost });

    // Share + Copy link buttons — always shown on cards
    // Share row (Copy link + Share on LinkedIn) intentionally hidden for V1.
    // Kept the helper for future re-enable.

    const related = (card.related || []).map(cardBySlug).filter(Boolean);
    if (related.length) {
      const wrap = $('[data-related]', frag);
      wrap.hidden = false;
      renderCardGrid($('[data-related-grid]', wrap), related);
    }
    body.appendChild(frag);
  }

  // ---- v4 modal prototype (one card only for now) ----
  const modalCardEl = modal.querySelector('.modal-card');
  if (modalCardEl) modalCardEl.classList.remove('modal-card--v4');
  if (card && !card.coming_soon && slug === 'build-your-curriculum' && modalCardEl) {
    modalCardEl.classList.add('modal-card--v4');

    const stages = cardStages(card);
    const primaryStage = stages[0];
    const stageColor = primaryStage ? stageColorVar(primaryStage) : 'var(--r-creator)';
    const type = cardTypes(card)[0];
    const iconSVG = ROLE_ICONS[type] || '';
    const typeText = roleLabelTextForType(type) || '';

    const hero = document.createElement('div');
    hero.className = 'card-v4-modal-hero';
    hero.style.setProperty('--stage-color', stageColor);

    const iconBox = document.createElement('div');
    iconBox.className = 'card-v4-modal-hero-icon';
    iconBox.innerHTML = iconSVG;

    const textCol = document.createElement('div');
    textCol.className = 'card-v4-modal-hero-text';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'card-v4-modal-eyebrow';
    const parts = [];
    if (primaryStage) parts.push(primaryStage.title);
    if (typeText) parts.push(typeText);
    eyebrow.textContent = parts.join(' · ');

    const heroTitle = document.createElement('h1');
    heroTitle.className = 'card-v4-modal-title';
    heroTitle.textContent = card.title;

    const metaRow = document.createElement('div');
    metaRow.className = 'card-v4-modal-meta';
    const levelWrap = document.createElement('span');
    levelWrap.className = 'card-v4-modal-level';
    const bars = document.createElement('span');
    bars.className = 'level-bars';
    renderLevelBars(bars, card.level);
    const levelTextEl = document.createElement('span');
    levelTextEl.textContent = levelLabel(card.level);
    levelWrap.append(bars, levelTextEl);
    metaRow.appendChild(levelWrap);

    textCol.append(eyebrow, heroTitle, metaRow);
    hero.append(iconBox, textCol);

    // Hide the default header — the v4 hero replaces it
    const oldHeader = body.querySelector('.card-header');
    if (oldHeader) oldHeader.hidden = true;

    body.insertBefore(hero, body.firstChild);

    // Swap related grid to v4 cards so they match the modal chrome
    const relatedGridEl = body.querySelector('[data-related-grid]');
    if (relatedGridEl) {
      const rel = (card.related || []).map(cardBySlug).filter(Boolean);
      if (rel.length) {
        relatedGridEl.innerHTML = '';
        relatedGridEl.classList.add('card-v4-modal-related-grid');
        rel.forEach((c) => {
          const cs = cardStages(c);
          const col = cs[0] ? stageColorVar(cs[0]) : stageColor;
          relatedGridEl.appendChild(renderV4Card(c, { color: col }));
        });
      }
    }
  }

  modal.hidden = false;
  document.body.classList.add('modal-open');
  state.modalSlug = slug;

  // Always reset scroll so the second card opens at the top, not mid-page.
  const modalCard = modal.querySelector('.modal-card');
  if (modalCard) modalCard.scrollTop = 0;
  modal.scrollTop = 0;

  // Re-trigger the zoom-in animation on every open by toggling the class.
  if (modalCard) {
    modalCard.classList.remove('modal-opening');
    // Force a reflow so removing + re-adding the class actually restarts the animation.
    void modalCard.offsetWidth;
    modalCard.classList.add('modal-opening');
  }

  // Sync browser tab title to the open card so the original card's title
  // doesn't stick around in the tab when a second card is opened.
  if (!state.savedTitle) state.savedTitle = document.title;
  document.title = `${card.title} · AI in the Park`;
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

  // Restore the browser tab title to whatever it was before the modal opened.
  if (state.savedTitle) {
    document.title = state.savedTitle;
    state.savedTitle = null;
  }
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
  // Reset the tab title each route so a card's title doesn't stick after you
  // navigate away; card/detail views set their own title below.
  document.title = 'AI in the Park — Playbook for Learning Designers';
  const parts = parsePath(window.location.pathname);

  let bgRenderer = viewHome;
  let modalSlug = null;
  let bgPath = '/';

  if (parts.length === 0) {
    // Homepage is now the navigator (shows over a star-field).
    bgRenderer = viewNavigator;
    bgPath = '/';
  } else if (parts[0] === 'library') {
    // Library → the navigator's "show me everything" scene (whole playbook by stage).
    bgRenderer = viewNavigator;
    bgPath = '/library';
    state.pendingShow = 'everything';
  } else if (parts[0] === 'classic') {
    // Backup/legacy home preserved for reference
    bgRenderer = viewHome;
    bgPath = '/classic';
  } else if (parts[0] === 'about') {
    bgRenderer = viewAbout;
    bgPath = '/about';
  } else if (parts[0] === 'fast') {
    bgRenderer = viewFast;
    bgPath = '/fast';
  } else if (parts[0] === 'agent-builder') {
    bgRenderer = viewAgentBuilder;
    bgPath = '/agent-builder';
  } else if (parts[0] === 'map') {
    bgRenderer = viewMap;
    bgPath = '/map';
  } else if (parts[0] === 'navigator') {
    bgRenderer = viewNavigator;
    bgPath = '/navigator';
  } else if (parts[0] === 'downloads' && parts[1] === 'fast') {
    bgRenderer = viewDownloadFast;
    bgPath = '/downloads/fast';
  } else if (parts[0] === 'preview') {
    bgRenderer = viewHomeV2;
    bgPath = '/preview';
  } else if (parts[0] === 'preview2') {
    bgRenderer = viewHomeV3;
    bgPath = '/preview2';
  } else if (parts[0] === 'preview3') {
    bgRenderer = viewHomeV4;
    bgPath = '/preview3';
  } else if (parts[0] === 'preview4') {
    bgRenderer = viewHomeV5;
    bgPath = '/preview4';
  } else if (parts[0] === 'recent') {
    bgRenderer = viewRecent;
    bgPath = '/recent';
  } else if (parts[0] === 'cards' && parts.length === 1) {
    bgRenderer = viewCardsIndex;
    bgPath = '/cards';
  } else if (parts[0] === 'cards' && parts[1]) {
    // Full-page card view — v4 detail page for every card
    bgRenderer = () => viewCardV4(parts[1]);
    bgPath = `/cards/${parts[1]}`;
  } else if (parts[0] === 'design-test' && ['a','b','c'].includes(parts[1])) {
    bgRenderer = () => viewDesignTest('build-your-curriculum', parts[1]);
    bgPath = `/design-test/${parts[1]}`;
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
  // Mobile: hamburger toggle for the topbar links dropdown
  if (e.target.closest('[data-topbar-toggle]')) {
    e.preventDefault();
    const menu = document.querySelector('[data-topbar-menu]');
    const toggle = document.querySelector('[data-topbar-toggle]');
    if (menu) {
      const opening = !menu.classList.contains('open');
      menu.classList.toggle('open', opening);
      if (toggle) toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    }
    return;
  }
  // Close the topbar menu when clicking a link inside it or anywhere outside
  const openMenu = document.querySelector('[data-topbar-menu].open');
  if (openMenu) {
    const insideMenu = e.target.closest('[data-topbar-menu]');
    const onToggle = e.target.closest('[data-topbar-toggle]');
    if (!onToggle && (!insideMenu || e.target.closest('[data-topbar-menu] a'))) {
      openMenu.classList.remove('open');
      const toggle = document.querySelector('[data-topbar-toggle]');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
  }
  if (e.target.closest('[data-spine-toggle]')) {
    const open = document.querySelector('.spine').classList.contains('open');
    setSpineOpen(!open);
    return;
  }

  // Tool-tabs (Claude / GPT / Gemini etc.) — delegated click handler.
  const tabBtn = e.target.closest('.tool-tab-btn');
  if (tabBtn) {
    const wrap = tabBtn.closest('[data-tool-tabs]');
    if (wrap) {
      const tab = tabBtn.dataset.tab;
      wrap.querySelectorAll('.tool-tab-btn').forEach((b) => b.classList.toggle('active', b === tabBtn));
      wrap.querySelectorAll('.tool-tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab));
    }
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
  // Home: on the navigator the URL never changes when a show opens, so a plain
  // href="/" won't re-navigate. Reset the navigator to the chooser instead.
  if (link.hasAttribute('data-home-link') && state.view === 'navigator' && window.location.pathname === '/') {
    if (state.navResetToChooser) state.navResetToChooser();
    setSpineOpen(false);
    return;
  }
  // Top-bar About: scroll to the About section on the home instead of the
  // separate /about page. (In-content "Read more" links keep going to /about.)
  if (link.matches('.topbar-links a[href="/about"]')) {
    if (state.view === 'navigator' && state.navScrollTo) {
      state.navScrollTo('[data-nav-about]');
    } else {
      state.pendingScroll = '[data-nav-about]';
      navigate('/');
    }
    setSpineOpen(false);
    return;
  }
  if (href !== window.location.pathname) navigate(href);
  // If user clicked a tab while spine dropdown is open, close it
  setSpineOpen(false);
});

// ---------- Mouse-tracked glow ----------
// Updates --glow-x and --glow-y on :root so the body::before radial gradient
// follows the cursor. Also updates --mx/--my inside cards on hover for the
// per-card glow. Throttled with requestAnimationFrame for smoothness.
function initMouseGlow() {
  let pending = false;
  let lastX = 50, lastY = 30;
  window.addEventListener('pointermove', (e) => {
    lastX = (e.clientX / window.innerWidth) * 100;
    lastY = (e.clientY / window.innerHeight) * 100;
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--glow-x', lastX + '%');
        document.documentElement.style.setProperty('--glow-y', lastY + '%');
        pending = false;
      });
    }
  }, { passive: true });

  // Per-card glow tracking via event delegation.
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.card-preview');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
    card.style.setProperty('--my', (e.clientY - rect.top) + 'px');
  }, { passive: true });
}

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
  initMouseGlow();
  initSubscribeForm();
  route();
})();

// ---------- Subscribe form (home page + topbar dialog) ----------
// Delegated so it works after the SPA mounts the home template.
function initSubscribeForm() {
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-subscribe-form]');
    if (!form) return;
    e.preventDefault();

    const input = form.querySelector('input[name="email"]');
    const button = form.querySelector('button[type="submit"]');
    const msg = form.parentElement.querySelector('[data-subscribe-msg]');
    const email = (input.value || '').trim();

    if (!msg || !input || !button) return;

    // Basic client-side format check to avoid a wasted round-trip.
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!looksLikeEmail) {
      msg.textContent = 'Enter a valid email.';
      msg.className = 'home-subscribe-msg is-error';
      input.focus();
      return;
    }

    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Sending…';
    msg.textContent = '';
    msg.className = 'home-subscribe-msg';

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      msg.textContent = "Got it. I'll email you when new cards drop.";
      msg.className = 'home-subscribe-msg is-success';
      input.value = '';

      // If this form is inside the dialog, auto-close after a beat.
      const dialog = form.closest('dialog.subscribe-dialog');
      if (dialog) {
        setTimeout(() => { try { dialog.close(); } catch {} }, 1400);
      }
    } catch (err) {
      msg.textContent = err.message || 'Something went wrong. Try again in a bit.';
      msg.className = 'home-subscribe-msg is-error';
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  // Open/close for the subscribe dialog opened from the topbar button.
  const dialog = document.getElementById('subscribe-dialog');
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-subscribe-open]')) {
      e.preventDefault();
      if (!dialog) return;
      // Reset any stale success/error message from a previous open.
      const msg = dialog.querySelector('[data-subscribe-msg]');
      if (msg) { msg.textContent = ''; msg.className = 'home-subscribe-msg'; }
      dialog.showModal();
      const input = dialog.querySelector('input[name="email"]');
      if (input) setTimeout(() => input.focus(), 10);
    } else if (e.target.closest('[data-subscribe-close]')) {
      e.preventDefault();
      if (dialog) dialog.close();
    }
  });
  // Close when clicking the backdrop outside the dialog content.
  if (dialog) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }
}
