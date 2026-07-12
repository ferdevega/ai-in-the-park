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
  state.cards = (await cardsRes.json()).filter((c) => !c.hidden);
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

  const frag = tpl('tpl-stage-panel');
  $('[data-stage-title]', frag).textContent = stage.title;
  $('[data-stage-summary]', frag).textContent = stage.summary || '';

  // Optional stage illustration — sits above Fer's bubble when present.
  const illustration = $('[data-stage-illustration]', frag);
  if (illustration) {
    if (stage.illustration) {
      illustration.setAttribute('src', stage.illustration);
      illustration.setAttribute('alt', `Illustration for ${stage.title}`);
      illustration.hidden = false;
    } else {
      illustration.remove();
    }
  }

  const tags = Array.from(new Set(cards.flatMap((c) => c.tags || []))).sort();
  const availableTypes = Array.from(new Set(cards.flatMap((c) => c.type)));

  const search = $('[data-search]', frag);
  const sort = $('[data-sort]', frag);
  const filterBar = $('[data-filter-bar]', frag);
  const groupedGrid = $('[data-card-grid-grouped]', frag);
  const countNode = makeCountNode();

  // Card-types reference: hide any type not present in this stage's cards.
  // If nothing is left, hide the whole details element.
  const typesRef = $('[data-card-types-reference]', frag);
  const typesList = $('[data-card-types-list]', frag);
  if (typesRef && typesList) {
    const typesInStage = new Set(availableTypes);
    let visibleCount = 0;
    typesList.querySelectorAll('[data-card-type]').forEach((li) => {
      const t = li.getAttribute('data-card-type');
      if (typesInStage.has(t)) {
        visibleCount++;
      } else {
        li.remove();
      }
    });
    if (visibleCount === 0) typesRef.remove();
  }

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

function viewAbout()    { state.view = 'about';    renderSpine(null); mount(tpl('tpl-about')); }
function viewFast()     { state.view = 'fast';     renderSpine(null); mount(tpl('tpl-fast')); }

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
    title: 'FAST — the four moves behind every good prompt',
    teaser: 'Frame · Ask · Shape · Tune. The mental model behind every card in this notebook.',
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

    const scroll = document.createElement('div');
    scroll.className = 'v4-shelf-scroll';

    // Category tile — same size as cards, solid stage color
    const tile = document.createElement('div');
    tile.className = 'v4-cat-tile';
    const color = stage.color || stageColorVar(stage);
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

  // Basics row — FAST as the anchor, linking to /fast (no See-all: only 1 card)
  const fastCard = {
    slug: 'fast-framework',
    title: 'FAST — the four moves behind every good prompt',
    teaser: 'Frame · Ask · Shape · Tune. The mental model behind every card in this notebook.',
    type: 'tool',
    level: 'beginner',
    linkOverride: '/fast',
  };
  shelvesHost.appendChild(
    addShelf(
      {
        slug: 'basics',
        title: 'Basics',
        summary: 'Foundations that apply across every card.',
        color: 'var(--r-thought-partner)',
      },
      [fastCard],
      1,
      null,
    ),
  );

  // Stage rows — top 3 real cards per stage (featured first, then latest), then See-all
  state.stages.forEach((stage) => {
    const inStage = state.cards.filter((c) => {
      const refs = Array.isArray(c.stage) ? c.stage : [c.stage];
      return refs.includes(stage.slug);
    });
    if (inStage.length === 0) return;

    const realCards = inStage.filter((c) => !c.coming_soon);
    if (realCards.length === 0) return;

    // Sort: featured cards first, then most recent
    const sorted = realCards.slice().sort((a, b) => {
      const feat = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      if (feat !== 0) return feat;
      return (b.added || '').localeCompare(a.added || '');
    });
    const topThree = sorted.slice(0, 3);

    shelvesHost.appendChild(
      addShelf(stage, topThree, realCards.length, `/stages/${stage.slug}`),
    );
  });

  wireWizardOpener();
  wireV4ScrollAnimation(shelvesHost);
  mount(frag);
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

  // Add a level text label next to the level bars (beginner / intermediate / advanced)
  const chips = anchor.querySelector('.card-chips');
  if (chips && card.level) {
    const levelText = document.createElement('span');
    levelText.className = 'v4-card-level-text';
    levelText.textContent = card.level;
    chips.insertBefore(levelText, chips.firstChild);
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
      title: 'FAST — the four moves behind every good prompt',
      teaser: 'Frame · Ask · Shape · Tune. The mental model behind every card in this notebook.',
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
  document.body.classList.remove('view-home', 'view-stage', 'view-cards', 'view-recent', 'view-about', 'view-fast', 'view-notfound', 'view-preview', 'view-preview2', 'view-preview3', 'view-preview4');
  document.body.classList.add(cls);
  window.scrollTo({ top: 0 });
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

    // Structured card body — each section has an emoji + name heading, consistent across cards.
    const bodyHost = $('[data-card-body]', frag);

    const renderSection = (emoji, title, contentHTML, options = {}) => {
      if (!contentHTML) return;
      const wrap = document.createElement('div');
      wrap.className = 'card-section' + (options.extraClass ? ` ${options.extraClass}` : '');
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

    // Intro — no heading, just the narrative opener
    if (card.intro) {
      const wrap = document.createElement('div');
      wrap.className = 'card-section card-section-intro prose';
      wrap.innerHTML = card.intro;
      bodyHost.appendChild(wrap);
    } else if (card.body) {
      // Legacy: single body field still supported
      const wrap = document.createElement('div');
      wrap.className = 'card-section prose';
      wrap.innerHTML = card.body;
      bodyHost.appendChild(wrap);
    }

    renderSection('🎯', 'Why this matters', card.why_matters);

    // How AI can help + What AI won't do — rendered as a two-column row of
    // mini-cards so they read as paired tradeoffs rather than stacked prose.
    // Falls back to single full-width section if only one field is populated.
    if (card.how_ai_helps && card.ai_wont) {
      const row = document.createElement('div');
      row.className = 'card-row-2col';
      const mkMini = (emoji, title, content) => {
        const w = document.createElement('div');
        w.className = 'card-section card-mini';
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
      row.appendChild(mkMini('🤖', 'How AI can help', card.how_ai_helps));
      row.appendChild(mkMini('⚠️', "What AI won't do", card.ai_wont));
      bodyHost.appendChild(row);
    } else {
      renderSection('🤖', 'How AI can help', card.how_ai_helps);
      renderSection('⚠️', "What AI won't do", card.ai_wont);
    }

    // How to run it — numbered steps with emerald circle markers
    if (Array.isArray(card.steps) && card.steps.length) {
      const wrap = document.createElement('div');
      wrap.className = 'card-section';
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

    // Prompt: either prompt_fast (preferred, labeled FAST sections) or legacy prompt_body
    if (card.prompt_fast) {
      const host = $('[data-card-prompt]', frag);

      // FAST disclaimer note — small italic above the prompt block
      const disclaimer = document.createElement('p');
      disclaimer.className = 'prompt-fast-disclaimer';
      disclaimer.innerHTML = 'This prompt follows the <a href="/fast">FAST</a> model: Frame · Ask · Shape · Tune.';
      host.appendChild(disclaimer);

      const block = document.createElement('div');
      block.className = 'prompt-block';

      const inner = document.createElement('div');
      inner.className = 'prompt-fast-block';

      // Copy button sits in a header row at the top of the prompt block.
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

      // Copy strips the section labels — pastes a clean, runnable prompt
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
      host.appendChild(block);
    } else if (cardTypes(card).includes('prompt') && card.prompt_body) {
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

    // Pro tip: Fer in a speech bubble at the end of the card
    if (card.pro_tip) {
      const tipHost = $('[data-card-tip]', frag);
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
  } else if (parts[0] === 'fast') {
    bgRenderer = viewFast;
    bgPath = '/fast';
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
