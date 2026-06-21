// build.js — generates per-route HTML files with custom OG tags, RSS, and sitemap.
// Run via `npm run build`. Vercel runs this automatically on deploy.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const SITE_URL = 'https://ai-in-the-park.vercel.app';
const SITE_NAME = 'AI in the Park 🐕‍🦺';
const DEFAULT_DESCRIPTION =
  'A field notebook of how-to cards for designing training with AI in the loop — mindsets, tools, accelerators, lessons learned, and prompts.';
const OG_IMAGE = `${SITE_URL}/assets/og-default.svg`;

const stages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'))
  .sort((a, b) => a.order - b.order);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8'));
const template = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

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
];

for (const r of routes) {
  writePage(r.out, setMeta(template, { ...r, image: OG_IMAGE }));
}

// ---------- Per-stage pages ----------
for (const s of stages) {
  writePage(
    `stages/${s.slug}/index.html`,
    setMeta(template, {
      title: `${s.title} — ${SITE_NAME}`,
      description: s.summary || DEFAULT_DESCRIPTION,
      url: `${SITE_URL}/stages/${s.slug}`,
      image: OG_IMAGE,
    }),
  );
}

// ---------- Per-card pages ----------
for (const c of cards) {
  writePage(
    `cards/${c.slug}/index.html`,
    setMeta(template, {
      title: `${c.title} — ${SITE_NAME}`,
      description: c.teaser || DEFAULT_DESCRIPTION,
      url: `${SITE_URL}/cards/${c.slug}`,
      image: OG_IMAGE,
    }),
  );
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
  ...stages.map((s) => `/stages/${s.slug}`),
  ...cards.map((c) => `/cards/${c.slug}`),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');

console.log(
  `Built: ${routes.length} static routes + ${stages.length} stages + ${cards.length} cards. RSS + sitemap written.`,
);
