// build.js — generates per-route HTML files with custom OG tags, RSS, and sitemap.
// Run via `npm run build`. Vercel runs this automatically on deploy.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const SITE_URL = 'https://ai-in-the-park.vercel.app';
const SITE_NAME = 'AI in the Park';
const DEFAULT_DESCRIPTION =
  'How instructional designers can actually use AI. Anecdotes, prompts, and moves that work.';
const OG_IMAGE = `${SITE_URL}/assets/og-default.svg`;

const stages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'))
  .sort((a, b) => a.order - b.order);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8'))
  // Skip hidden cards and external/anchor cards (linkOverride → their own route,
  // e.g. FAST → /fast) — they don't get a generated /cards/<slug> page.
  .filter((c) => !c.hidden && !c.linkOverride);
// All non-hidden cards (incl. coming-soon + linkOverride) — for outline/lookups.
const allCards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8'))
  .filter((c) => !c.hidden);
const cardBySlug = (slug) => allCards.find((c) => c.slug === slug);
const scenarios = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/scenarios.json'), 'utf8'));
// index.html is BOTH the template and the home output, so strip any previously
// pre-rendered #view content when reading it — keeps the build idempotent.
const template = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<main id="view" class="page">[\s\S]*?<\/main>/, '<main id="view" class="page"></main>');

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );

function setMeta(html, { title, description, url, image }) {
  const t = esc(title);
  const d = esc(description);
  const u = esc(url);
  const i = esc(image);
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${d}" />`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${u}" />`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${t}" />`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${d}" />`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${u}" />`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${i}" />`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${t}" />`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${d}" />`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${i}" />`);
}

function writePage(relPath, html) {
  const full = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html, 'utf8');
}

// ---------- Pre-rendering (so crawlers / LLMs can read the content) ----------
// The app renders everything client-side, so the raw HTML shell is empty. We
// inject readable HTML into #view at build time; on load, app.js clears #view
// and renders the interactive version, so users are unaffected.
function injectView(html, contentHTML) {
  return html.replace(
    '<main id="view" class="page"></main>',
    `<main id="view" class="page">${contentHTML}</main>`,
  );
}

function stageOf(card) {
  const slug = Array.isArray(card.stage) ? card.stage[0] : card.stage;
  return stages.find((s) => s.slug === slug);
}

function cardContentHTML(card) {
  const st = stageOf(card);
  let h = '<article class="prerender">';
  h += `<h1>${esc(card.title)}</h1>`;
  if (card.teaser) h += `<p>${esc(card.teaser)}</p>`;
  const meta = [st && st.title, card.type, card.level].filter(Boolean).join(' · ');
  if (meta) h += `<p><em>${esc(meta)}</em></p>`;
  if (card.best_in) h += `<p><strong>Best in:</strong> ${esc(card.best_in)}</p>`;
  if (card.coming_soon) return `${h}<p>Coming soon.</p></article>`;
  if (card.intro) h += `<section>${card.intro}</section>`;
  if (card.why_matters) h += `<section><h2>Why this matters</h2>${card.why_matters}</section>`;
  if (card.how_ai_helps) h += `<section><h2>How AI can help</h2>${card.how_ai_helps}</section>`;
  if (card.ai_wont) h += `<section><h2>What AI won't do</h2>${card.ai_wont}</section>`;
  if (Array.isArray(card.steps) && card.steps.length) {
    h += `<section><h2>How to run it</h2><ol>${card.steps.map((s) => `<li>${s}</li>`).join('')}</ol></section>`;
  }
  if (card.prompt_fast) {
    h += '<section><h2>The prompt (FAST)</h2>';
    ['frame', 'ask', 'shape', 'tune'].forEach((k) => {
      if (card.prompt_fast[k]) h += `<p><strong>${k[0].toUpperCase() + k.slice(1)}:</strong> ${esc(card.prompt_fast[k])}</p>`;
    });
    h += '</section>';
  }
  if (card.pro_tip) h += `<section><h2>Pro tip</h2><p>${card.pro_tip}</p></section>`;
  if (Array.isArray(card.tags) && card.tags.length) h += `<p>Tags: ${card.tags.map(esc).join(', ')}</p>`;
  return `${h}</article>`;
}

function cardLink(slug) {
  const c = cardBySlug(slug);
  if (!c) return '';
  if (c.coming_soon) return `<li>${esc(c.title)} (coming soon)</li>`;
  const href = c.linkOverride || `/cards/${c.slug}`;
  return `<li><a href="${href}">${esc(c.title)}</a>${c.teaser ? ` — ${esc(c.teaser)}` : ''}</li>`;
}

function homeOutlineHTML() {
  let h = '<div class="prerender">';
  h += '<h1>AI in the Park — a playbook of AI use cases for instructional designers, content developers and learning managers</h1>';
  h += '<p>The playbook, by phase of the learning-design process:</p>';
  scenarios.filter((s) => !s.byStage).forEach((sc) => {
    h += `<h2>${esc(sc.title)}</h2>`;
    if (sc.situation) h += `<p>${esc(sc.situation)}</p>`;
    (sc.moments || []).forEach((m) => {
      const items = (m.cards || []).map((cd) => (typeof cd === 'string' ? cardLink(cd) : '')).filter(Boolean).join('');
      if (items) h += `<h3>${esc(m.label)}</h3><ul>${items}</ul>`;
    });
  });
  h += '<p><a href="/cards">Browse all cards</a></p></div>';
  return h;
}

function cardsIndexHTML() {
  const live = cards.filter((c) => !c.coming_soon);
  let h = '<div class="prerender"><h1>All cards — AI in the Park</h1><ul>';
  live.forEach((c) => { h += `<li><a href="/cards/${c.slug}">${esc(c.title)}</a>${c.teaser ? ` — ${esc(c.teaser)}` : ''}</li>`; });
  h += '</ul></div>';
  return h;
}

function stageContentHTML(stage) {
  const inStage = allCards.filter((c) => (Array.isArray(c.stage) ? c.stage : [c.stage]).includes(stage.slug));
  let h = `<div class="prerender"><h1>${esc(stage.title)}</h1>`;
  if (stage.summary) h += `<p>${esc(stage.summary)}</p>`;
  h += '<ul>' + inStage.map((c) => cardLink(c.slug)).join('') + '</ul></div>';
  return h;
}

// ---------- llms.txt / llms-full.txt (single-URL content for LLM tools) ----------
function stripHtml(s) {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function cardMarkdown(card) {
  const st = stageOf(card);
  let m = `## ${card.title}\n`;
  if (card.teaser) m += `_${stripHtml(card.teaser)}_\n`;
  m += `Link: ${card.linkOverride ? SITE_URL + card.linkOverride : `${SITE_URL}/cards/${card.slug}`}\n`;
  const meta = [st && st.title, card.type, card.level].filter(Boolean).join(' · ');
  if (meta) m += `(${meta})\n`;
  if (card.best_in) m += `Best in: ${card.best_in}\n`;
  m += '\n';
  if (card.coming_soon) return `${m}_Coming soon._\n\n`;
  if (card.intro) m += `${stripHtml(card.intro)}\n\n`;
  if (card.why_matters) m += `**Why this matters:** ${stripHtml(card.why_matters)}\n\n`;
  if (card.how_ai_helps) m += `**How AI can help:** ${stripHtml(card.how_ai_helps)}\n\n`;
  if (card.ai_wont) m += `**What AI won't do:** ${stripHtml(card.ai_wont)}\n\n`;
  if (Array.isArray(card.steps) && card.steps.length) {
    m += '**How to run it:**\n';
    card.steps.forEach((s, i) => { m += `${i + 1}. ${stripHtml(s)}\n`; });
    m += '\n';
  }
  if (card.prompt_fast) {
    m += '**The prompt (FAST):**\n';
    ['frame', 'ask', 'shape', 'tune'].forEach((k) => {
      if (card.prompt_fast[k]) m += `- ${k[0].toUpperCase() + k.slice(1)}: ${card.prompt_fast[k]}\n`;
    });
    m += '\n';
  }
  if (card.pro_tip) m += `**Pro tip:** ${stripHtml(card.pro_tip)}\n\n`;
  return m;
}

function llmsTxt() {
  let out = `# AI in the Park\n\n> ${DEFAULT_DESCRIPTION}\n\n`;
  out += `A playbook of AI use cases for instructional designers, content developers and learning managers, organized by phase of the learning-design process. Full content: ${SITE_URL}/llms-full.txt\n\n## Cards\n`;
  scenarios.filter((s) => !s.byStage).forEach((sc) => {
    out += `\n### ${sc.title}\n`;
    (sc.moments || []).forEach((m) => (m.cards || []).forEach((cd) => {
      const c = typeof cd === 'string' && cardBySlug(cd);
      if (!c || c.coming_soon) return;
      const url = c.linkOverride ? SITE_URL + c.linkOverride : `${SITE_URL}/cards/${c.slug}`;
      out += `- [${c.title}](${url}): ${stripHtml(c.teaser || '')}\n`;
    }));
  });
  return out;
}

function llmsFullTxt() {
  let out = `# AI in the Park — full playbook content\n\n${DEFAULT_DESCRIPTION}\n\nSite: ${SITE_URL}\n\n`;
  scenarios.filter((s) => !s.byStage).forEach((sc) => {
    out += `\n# ${sc.title}\n${sc.situation || ''}\n\n`;
    const seen = new Set();
    (sc.moments || []).forEach((m) => (m.cards || []).forEach((cd) => {
      const c = typeof cd === 'string' && cardBySlug(cd);
      if (!c || seen.has(c.slug)) return;
      seen.add(c.slug);
      out += cardMarkdown(c);
    }));
  });
  return out;
}

// ---------- Static routes ----------
const routes = [
  {
    out: 'index.html',
    title: `${SITE_NAME} — Playbook for Learning Designers`,
    description: DEFAULT_DESCRIPTION,
    url: `${SITE_URL}/`,
  },
  {
    out: 'about/index.html',
    title: `About — ${SITE_NAME}`,
    description: 'About Fernando Vega and the AI in the Park playbook.',
    url: `${SITE_URL}/about`,
  },
  {
    out: 'cards/index.html',
    title: `All cards — ${SITE_NAME}`,
    description:
      'Browse every card in the playbook — mindsets, tools, accelerators, best practices, and prompts.',
    url: `${SITE_URL}/cards`,
  },
  {
    out: 'recent/index.html',
    title: `Recently added — ${SITE_NAME}`,
    description: 'The latest cards added to the playbook.',
    url: `${SITE_URL}/recent`,
  },
  {
    out: 'fast/index.html',
    title: `FAST — a prompting model for designing training with AI`,
    description:
      'A quick reference for the four-move prompting model used across the AI in the Park playbook: Frame, Ask, Shape, Tune.',
    url: `${SITE_URL}/fast`,
  },
  {
    out: 'library/index.html',
    title: `Library — ${SITE_NAME}`,
    description: 'Browse the whole playbook by stage — every card, grouped by where it fits in the process.',
    url: `${SITE_URL}/library`,
  },
  {
    out: 'navigator/index.html',
    title: `Navigator — ${SITE_NAME}`,
    description:
      'New to AI in the loop? Pick the situation you’re in and the navigator lays out the exact path of cards to follow.',
    url: `${SITE_URL}/navigator`,
  },
  {
    out: 'map/index.html',
    title: `The map — ${SITE_NAME}`,
    description:
      'The whole playbook as a constellation: every card as a star, grouped by stage. New here? Start from what’s on your plate.',
    url: `${SITE_URL}/map`,
  },
  {
    out: 'agent-builder/index.html',
    title: `Build an agent — ${SITE_NAME}`,
    description:
      'A quick builder that turns five answers into paste-ready agent instructions for Claude, a Custom GPT, or Microsoft Copilot.',
    url: `${SITE_URL}/agent-builder`,
  },
  {
    out: 'preview/index.html',
    title: `Preview — ${SITE_NAME}`,
    description: 'Alternate home layout preview.',
    url: `${SITE_URL}/preview`,
  },
  {
    out: 'preview2/index.html',
    title: `Preview 2 — ${SITE_NAME}`,
    description: 'Interactive filter home layout preview.',
    url: `${SITE_URL}/preview2`,
  },
  {
    out: 'preview3/index.html',
    title: `Preview 3 — ${SITE_NAME}`,
    description: 'Netflix-style shelves layout preview.',
    url: `${SITE_URL}/preview3`,
  },
  {
    out: 'preview4/index.html',
    title: `Preview 4 — ${SITE_NAME}`,
    description: 'Collapsible folders layout preview.',
    url: `${SITE_URL}/preview4`,
  },
  {
    out: 'classic/index.html',
    title: `Classic layout — ${SITE_NAME}`,
    description: 'Original homepage kept for reference.',
    url: `${SITE_URL}/classic`,
  },
  {
    out: 'downloads/fast/index.html',
    title: `FAST — a prompting model for designing training with AI`,
    description: 'A short guide to the FAST model — Frame, Ask, Shape, Tune.',
    url: `${SITE_URL}/downloads/fast`,
  },
  {
    out: 'design-test/a/index.html',
    title: `Design A · Callouts — ${SITE_NAME}`,
    description: 'Card page design test — Notion-style callouts.',
    url: `${SITE_URL}/design-test/a`,
  },
  {
    out: 'design-test/b/index.html',
    title: `Design B · Journal — ${SITE_NAME}`,
    description: 'Card page design test — field-notes journal.',
    url: `${SITE_URL}/design-test/b`,
  },
  {
    out: 'design-test/c/index.html',
    title: `Design C · Docs — ${SITE_NAME}`,
    description: 'Card page design test — docs-site layout.',
    url: `${SITE_URL}/design-test/c`,
  },
];

for (const r of routes) {
  let html = setMeta(template, { ...r, image: OG_IMAGE });
  // Pre-render crawlable content for the home and the all-cards index.
  if (r.out === 'index.html') html = injectView(html, homeOutlineHTML());
  else if (r.out === 'cards/index.html') html = injectView(html, cardsIndexHTML());
  writePage(r.out, html);
}

// ---------- Per-stage pages ----------
for (const s of stages) {
  const html = setMeta(template, {
    title: `${s.title} — ${SITE_NAME}`,
    description: s.summary || DEFAULT_DESCRIPTION,
    url: `${SITE_URL}/stages/${s.slug}`,
    image: OG_IMAGE,
  });
  writePage(`stages/${s.slug}/index.html`, injectView(html, stageContentHTML(s)));
}

// ---------- Per-card pages ----------
for (const c of cards) {
  const html = setMeta(template, {
    title: `${c.title} — ${SITE_NAME}`,
    description: c.teaser || DEFAULT_DESCRIPTION,
    url: `${SITE_URL}/cards/${c.slug}`,
    image: OG_IMAGE,
  });
  writePage(`cards/${c.slug}/index.html`, injectView(html, cardContentHTML(c)));
}

// ---------- RSS feed ----------
const sortedCards = cards
  .slice()
  .sort((a, b) => (b.added || '').localeCompare(a.added || ''));

const rssItems = sortedCards
  .map(
    (c) => `
  <item>
    <title>${esc(c.title)}</title>
    <link>${SITE_URL}/cards/${c.slug}</link>
    <guid isPermaLink="true">${SITE_URL}/cards/${c.slug}</guid>
    ${c.added ? `<pubDate>${new Date(c.added).toUTCString()}</pubDate>` : ''}
    <description>${esc(c.teaser || '')}</description>
  </item>`,
  )
  .join('');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(SITE_NAME)}</title>
  <link>${SITE_URL}/</link>
  <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
  <description>${esc(DEFAULT_DESCRIPTION)}</description>
  <language>en</language>${rssItems}
</channel>
</rss>
`;
fs.writeFileSync(path.join(ROOT, 'feed.xml'), rss, 'utf8');

// ---------- Sitemap ----------
const sitemapUrls = [
  '/',
  '/cards',
  '/recent',
  '/about',
  '/fast',
  '/library',
  '/navigator',
  '/map',
  '/agent-builder',
  ...stages.map((s) => `/stages/${s.slug}`),
  ...cards.map((c) => `/cards/${c.slug}`),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');

// ---------- llms.txt + llms-full.txt ----------
fs.writeFileSync(path.join(ROOT, 'llms.txt'), llmsTxt(), 'utf8');
fs.writeFileSync(path.join(ROOT, 'llms-full.txt'), llmsFullTxt(), 'utf8');

console.log(
  `Built: ${routes.length} static routes + ${stages.length} stages + ${cards.length} cards. RSS + sitemap + llms.txt written.`,
);
