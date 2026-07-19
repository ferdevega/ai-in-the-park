# AI in the Park 🐕‍🦺

A field notebook of how-to cards for instructional designers using AI in the loop — anecdotes, prompts, and moves that actually work. Maintained by [Fernando De Vega](https://www.linkedin.com/in/ferdevega/).

Live at **[ai-in-the-park.vercel.app](https://ai-in-the-park.vercel.app)** — until we buy a domain.

---

## Table of contents

- [What this is](#what-this-is)
- [How the site is put together](#how-the-site-is-put-together)
- [Data model](#data-model)
- [Routes & views](#routes--views)
- [The card detail page](#the-card-detail-page)
- [Voice & content guidelines](#voice--content-guidelines)
- [Design system](#design-system)
- [The FAST download](#the-fast-download)
- [Subscribe backend](#subscribe-backend)
- [Local development](#local-development)
- [How to add a new card](#how-to-add-a-new-card)
- [Deploy](#deploy)
- [Roadmap & open items](#roadmap--open-items)
- [License](#license)

---

## What this is

A personal playbook website for instructional designers (and content developers, and learning managers) using AI in their design process. The site is a **notebook**, not a methodology — cards get added as the author learns them, not in a pre-planned sweep.

**Core positioning:** anti-slop. Every card is written from lived experience, in a specific voice, with a specific opinion. If a card could have been written by anyone, it doesn't belong here.

**Audience:** working IDs and adjacent roles. Assumes literacy in the craft (they know what Bloom's is, what a persona is). Not for beginners to the field.

**Not for sale.** No affiliates, no course upsell, no lead-magnet SaaS pitch. The subscribe form exists so people who like the work can get notified when new cards drop.

---

## How the site is put together

**Stack:** vanilla HTML + vanilla JavaScript SPA + a Node build script. No React, no framework. All routing is client-side via History API, with per-route static HTML pre-rendered at build time so every URL is deep-linkable and SEO'd.

**Deploy:** static site on [Vercel](https://vercel.com/), auto-deployed on every push to `main`. One serverless function at `api/subscribe.js` handles subscribe form posts into [Upstash Redis](https://upstash.com/).

**No package manager for runtime.** Node dependencies exist only for the build step and the subscribe endpoint. There's no client-side bundler — `app.js` and `styles.css` load directly.

**File layout:**

```
ai-playbook/
├─ index.html            # single-page shell + every view template
├─ styles.css            # handcrafted, ~4000 lines, no framework
├─ app.js                # router, view functions, IntersectionObserver reveals
├─ build.js              # pre-renders per-route HTML + RSS + sitemap
├─ vercel.json           # cleanUrls: true, trailingSlash: false
├─ package.json          # build script + subscribe deps
├─ api/
│  └─ subscribe.js       # POST → Upstash Redis
├─ data/
│  ├─ stages.json        # 7 stages, ordered
│  └─ cards.json         # all cards
├─ assets/
│  ├─ Fer.jpeg           # author photo (full-size)
│  ├─ Fer-small.jpeg     # 300x400 optimized for the FAST PDF
│  ├─ Fer-circle.png     # circular mask for signoff blocks
│  ├─ avatar.jpg         # smaller avatar for the pro-tip speech bubble
│  └─ gifs/              # inline card gifs
├─ downloads/
│  └─ fast.pdf           # rendered from /downloads/fast, committed
├─ scripts/
│  └─ build-fast-pdf.sh  # Chrome-headless print-to-PDF pipeline
└─ [about/, fast/, cards/, stages/, downloads/, recent/, classic/]
                         # per-route index.html files (gitignored, rebuilt by build.js)
```

**Routing model.** In `app.js`, `route()` reads `window.location.pathname`, matches it to a view function, calls `mount(fragment)` which swaps content into `#view`. Body classes (`view-home`, `view-card-v4`, `view-stage`, `view-about`, `view-fast`, `view-download-fast`) toggle per-view CSS scoping.

---

## Data model

### `data/stages.json`

Seven stages, in order:

| order | slug | title | color var |
|---|---|---|---|
| 1 | `analysis` | Analysis & Discovery | `--s-1` (red) |
| 2 | `strategy-curriculum` | Strategy & Curriculum | `--s-2` (orange) |
| 3 | `design` | Design | `--s-3` |
| 4 | `development` | Development | `--s-4` |
| 5 | `plan-execution` | Plan & Execution | `--s-5` |
| 6 | `measurement-improvement` | Measurement & Improvement | `--s-6` |
| 7 | `project-management` | Project Management | `--s-7` |

Colors are defined in `styles.css` (`--s-1` through `--s-7`). Stage color is resolved via `stageColorVar(stage)` = `var(--s-${order})`.

**Fields:** `slug`, `title`, `abbr`, `order`, `summary`, optional `illustration`.

### `data/cards.json`

Each card entry:

```jsonc
{
  "slug": "build-your-curriculum",             // URL slug; also the filename convention
  "title": "Build your curriculum",             // shown as H1 on detail page
  "stage": "strategy-curriculum",               // string or array of stage slugs
  "type": "creator",                            // single string; see role types below
  "level": "beginner",                          // beginner | intermediate | advanced
  "tags": ["curriculum", "documentation"],      // free-form
  "added": "2026-06-24",                        // ISO date
  "teaser": "The doc that turns...",            // shown under the title & on shelf cards
  "intro": "<p>HTML paragraph...</p><figure class=\"inline-gif-wrap\">...</figure>",
                                                // anecdote-first opener; may embed <figure> for a gif
  "why_matters": "<p>...</p>",                  // the section under 🎯 heading
  "how_ai_helps": "<p>...</p>",                 // AI's positive role in the task
  "ai_wont": "<p>...</p>",                      // AI's limitations for the task
  "steps": ["<p>Step 1 HTML.</p>", "..."],      // numbered how-to-run-it steps
  "prompt_fast": {                              // optional FAST-labeled prompt
    "frame": "You are a senior instructional designer...",
    "ask": "Draft a module-by-module outline...",
    "shape": "4 to 6 modules...",
    "tune": "State your assumptions..."
  },
  "pro_tip": "One-line practical tip.",         // renders as Fer-in-a-speech-bubble
  "tip_label": "Pro tip",                       // optional override for the bubble label
  "related": ["other-card-slug"],               // array of card slugs
  "coming_soon": false,                         // if true, card renders as ghost tile, not clickable
  "hidden": false,                              // if true, excluded from indices entirely
  "linkOverride": "/fast"                       // rare: use for synthetic cards that link elsewhere
}
```

**Type field (`type`)** — the AI's role in this card, as a single string:

| type | icon | when to use |
|---|---|---|
| `creator` | triangle | AI drafts something concrete for you (outline, persona, knowledge checks) |
| `thought-partner` | two arrows | AI asks you questions and pushes back before you commit |
| `auditor` | magnifier | AI reviews existing work for issues (style, cognitive-level, gaps) |
| `panel` | three lines | AI role-plays multiple personas as a virtual focus group |
| `tool` | hexagon | The card teaches a specific AI product or feature |

Icons defined in `app.js` in the `ROLE_ICONS` constant. Colors defined in CSS (`--r-creator`, `--r-thought-partner`, `--r-auditor`, `--r-panel`, `--r-tool`).

**Level field** — beginner / intermediate / advanced. Per the author's rubric:

- **Beginner** = a direct AI move you can execute today. Low ceremony.
- **Intermediate** = AI as thought-partner or indirect assist; requires you to bring more judgment.
- **Advanced** = sophisticated or situational; requires context and taste to run well.

---

## Routes & views

| URL | View function | Purpose |
|---|---|---|
| `/` | `viewHomeV4` | Home — Netflix-style shelves, one per stage + Basics |
| `/stages/[slug]` | `viewStage` | All cards in one stage, grouped by level |
| `/cards/[slug]` | `viewCardV4` | Full card detail as one big card (frame, sections, prompt aside, related-as-lines) |
| `/cards` | `viewCardsIndex` | All cards, searchable/filterable |
| `/recent` | `viewRecent` | Most recently added cards |
| `/about` | `viewAbout` | Author bio, why this exists |
| `/fast` | `viewFast` | Live FAST framework page (also drives the PDF) |
| `/downloads/fast` | `viewDownloadFast` | Printable one-pager of the FAST guide (source of the PDF) |
| `/classic` | `viewHome` | Original homepage layout, preserved for reference |
| `/preview` / `/preview2` / `/preview3` / `/preview4` | earlier layout experiments (kept for compare) |

All routes have pre-built `index.html` shells emitted by `build.js`, so a cold hit lands on server-rendered HTML with correct meta tags, then `app.js` hydrates the SPA. Vercel's `cleanUrls: true` strips trailing `.html`.

---

## The card detail page

`/cards/[slug]` renders `tpl-card-v4-page` — the whole content wrapped in **one big card frame** that mirrors the home shelf card DNA. This was the direction that finally clicked after several iterations:

**Frame:** 1200px max-width, cream border, stage-color 24% border tint, radial glow bleeding from top edge in stage color, rounded 20px.

**Header row (split):** two-column grid with stage/title/teaser on the LEFT (fills available space, top-aligned), and two stage-colored pills on the RIGHT (top-aligned):
- Pill 1: role icon + role type text (e.g. "△ CREATOR AI")
- Pill 2: level bars + level text (e.g. "▮▮▮ BEGINNER")

**Body columns:** two-column grid inside the frame — `minmax(0, 1fr) 560px`.
- **Left (main):** intro (with any gif floated newspaper-style on desktop only), why-matters, how-AI-helps/won't (paired), steps, pro tip, related-as-lines list.
- **Right (aside):** sticky FAST prompt panel with copy button.

If a card has no prompt (`prompt_fast` and no `prompt_body`), JS collapses the aside and lets the main column fill full width.

**Related cards** are rendered as an inline list *inside* the frame, under the pro tip. Each line = role icon + title + stage · level meta + arrow. Not v4-cards.

**Reveal animation:** `wireRevealAnimation` uses IntersectionObserver to fade+slide the frame and the related section on scroll-in.

**Newspaper gif behavior:** if the intro contains a `<figure class="inline-gif-wrap">`, JS moves it to the top of the intro section **only on viewports ≥721px**. On mobile it stays in its natural DOM position between paragraphs (as a full-width block).

---

## Voice & content guidelines

These are project-defining. Violating them makes the site read like every other AI blog.

### The anti-slop principle
Output must never feel AI-generated. Every card must survive the "would I actually say this out loud to a colleague" test.

### Playbook voice rules
- **Anecdote-first intros.** Start with something specific that happened.
- **Chaotic-neutral humor.** Not slapstick, not corporate. Real observations, dry delivery.
- **Recipe-page brevity.** Under ~250 words of prose per card. Steps and prompts are extra.
- **WIIFM-focused.** Every card answers "why should I read this in the next 30 seconds."

### The forbidden zone
- **No borrowed-domain metaphors** ("prompting is like gardening" — no).
- **No aphoristic conditionals** ("if you can't measure it, you can't improve it" — dead on arrival).
- **No X-is-Y punch sentences** ("shape is where you show your taste" — cut it or ground it).
- **No fiction-writer prose** — this isn't a novel.
- **No emojis in body prose** — emojis go on section headings only, as visual anchors.

### Card cross-references
When body prose refers to another card, don't drop an inline link. Say "listed below" — the site auto-renders the Related Cards section at the bottom of every card.

### Cross-link discipline
Only cross-link cards that are direct input/output dependencies. Default to fewer `related` entries per card, not more.

### The gradient-text highlight
Every card body should have one word or short phrase wrapped in `<span class="gradient-text">`. The CSS renders it in caps with a rainbow-out-of-space gradient. It's the site's typographic signature. Pick the phrase that's the emotional core of the card.

### Steps content
No paste-only step. "Paste the prompt and run" is filler — either fold that into the previous step or skip it. Steps are for judgment moves, not mechanical ones.

---

## Design system

### Colors

**Site palette (dark theme):**
- Surface: `#0e0f14` (very dark)
- Text: cream tones (`#f2eee6`, `#c8c4bb`)
- Role colors: purple (creator), blue (thought-partner), emerald (auditor), teal (tool), pink (panel)
- Stage colors: red → orange → yellow → green → teal → blue → purple across the 7 stages

**Paper palette (used by the FAST download PDF):**
- Paper: `#faf6ec` (cream)
- Ink: `#1a1a1a`
- Muted: `#5c5a54`
- Move accents (deeper versions of role colors for readability on cream): purple `#7c3aed`, blue `#1d4ed8`, red `#b91c1c`, emerald `#047857`.

### Typography

- **Headings:** `Fraunces` (Google Fonts, serif, italic support). Also used for big display text.
- **Body:** `Inter` (Google Fonts, sans-serif).
- **Monospace:** `JetBrains Mono` (used in prompt blocks).
- **Fallbacks:** Georgia / Segoe UI / Menlo — everything degrades gracefully.

### The 5-icon signature

The site's signature visual is a row of the 5 role icons (Creator △, Thought-partner ⇄, Auditor 🔍, Tool ⬢, Panel ≡) in their brand colors. It appears:
- Below the home hero H1, shuffling positions every 2.8s (FLIP animation) — the "secret code."
- Top-right of the FAST download header, static.

### Animations

**Scroll reveal:** any element with `[data-reveal]` starts at `opacity: 0; translateY(28px)` and animates to visible when an IntersectionObserver catches it entering the viewport. Used on home shelves, stage groups, card frame, and content-card pages. Respects `prefers-reduced-motion`.

**Home signature shuffle:** on the home, the 5 role icons periodically shuffle DOM order and animate to new positions via FLIP (measure → reorder → transform-inverse → animate to zero).

---

## The FAST download

The `/downloads/fast` route renders a printable one-page infographic version of the FAST framework. This is the site's first lead-magnet — planned to be delivered to subscribers on signup.

**Anatomy of the doc:**
- **Dark header band** at the top with big `FAST` gradient word-mark, italic tagline, full intro paragraph, byline, permalink to the site, 5-icon signature (colored)
- **2×2 quadrant grid** — each move (Frame/Ask/Shape/Tune) in a cell with a colored top rail, big colored first-letter as the initial of the word, tagline, two bulleted examples, a `⚠ COMMON MISTAKE` callout
- **10-second check** as a compact 4-column strip below (rubric to grade a prompt before hitting send)
- **Signoff** at the bottom: circular photo of Fer + bio + big italic "See you in the park." + site attribution

**Source of truth:** the HTML at `tpl-download-fast` in `index.html` + the CSS scoped under `.doc-fast-*` in `styles.css`. Edit those; regenerate the PDF from that source.

**Regenerate the PDF:**

```bash
./scripts/build-fast-pdf.sh
```

Under the hood this runs Chrome headless against the deployed URL and prints to `downloads/fast.pdf`. The script:
- Uses the deployed URL (`https://ai-in-the-park.vercel.app/downloads/fast`), so **push your changes first and wait for Vercel to redeploy** before running.
- Writes to an absolute path (Chrome resolves relative paths against its own CWD, which was breaking earlier runs).
- Exits non-zero if the PDF doesn't materialize.

**Where the PDF lives:** `downloads/fast.pdf` — checked into the repo. Vercel serves it as-is at `/downloads/fast.pdf` because `vercel.json` sets `outputDirectory: "."` (repo root).

**Image optimization:** the signoff photo uses `assets/Fer-small.jpeg` (300×400, 46 KB) — a downsized version of `assets/Fer.jpeg` (2.8 MB). The optimized version keeps the PDF around 550 KB. To regenerate the small version if the source changes:

```bash
py -c "from PIL import Image; im=Image.open('assets/Fer.jpeg'); im.thumbnail((400,400)); im.save('assets/Fer-small.jpeg', 'JPEG', quality=82, optimize=True)"
```

**PPTX/DOCX drafts:** for iterating layout in Word or PowerPoint, there are two Python scripts in `scratchpad/` (gitignored) that generate `downloads/fast.pptx` and `downloads/fast-content.docx`. Both output files are also gitignored — they're local drafts, not source of truth. The web page is the source; PPTX/DOCX exist only as design sandboxes.

---

## Subscribe backend

`api/subscribe.js` is a Vercel serverless function. On POST with `{ email }`:
1. Validates the email shape.
2. Stores it in Upstash Redis via `@upstash/redis` (using `SADD` to a set keyed by day).
3. Returns `{ ok: true }` on success.

**Env vars** (set in Vercel dashboard, not committed):
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

For local dev of the endpoint, drop those into a `.env` at the repo root and run via `vercel dev`. For most work you won't touch this file.

**Planned next step:** on successful subscribe, respond with the FAST PDF download URL and have the modal show a "Get the FAST guide →" button. See [Roadmap](#roadmap--open-items).

---

## Local development

The site is static — no bundler, no HMR.

```bash
# From the repo root:
python -m http.server 3006 --directory .
# Then open http://127.0.0.1:3006
```

Or `npx serve .` if you prefer Node.

**For the build step** (pre-renders per-route HTML files):

```bash
npm install
npm run build   # runs build.js
```

`build.js` emits `about/index.html`, `fast/index.html`, `recent/index.html`, `cards/index.html`, `cards/<slug>/index.html`, `stages/<slug>/index.html`, `downloads/fast/index.html`, plus `feed.xml` and `sitemap.xml`. Vercel runs this on every deploy.

Generated files are in `.gitignore` — they're rebuilt on deploy, not source-controlled.

---

## How to add a new card

1. **Draft the copy in a chat / doc first**, in the playbook voice (see [Voice & content guidelines](#voice--content-guidelines)). Wait until it feels right before touching files.
2. **Add an entry to `data/cards.json`.** Follow the schema in [Data model](#data-model). Pay attention to:
   - `slug` — kebab-case, matches the file convention
   - `stage` — the primary stage this belongs to (or array if it truly spans)
   - `type` — one of creator / thought-partner / auditor / panel / tool
   - `level` — beginner / intermediate / advanced (see rubric above)
   - `added` — today's ISO date
   - `intro` — anecdote-first HTML with a `<span class="gradient-text">` somewhere
   - `prompt_fast` — if this card ends in a prompt, use the FAST structure
3. **Optionally add a gif** at `assets/gifs/<name>.gif` and reference it inside the intro:
   ```html
   <figure class="inline-gif-wrap">
     <img src="/assets/gifs/name.gif" alt="…" class="inline-gif" />
     <figcaption>Short caption.</figcaption>
   </figure>
   ```
4. **Consider cross-links.** Add card slugs to `related` only if they're direct input/output dependencies.
5. **Commit and push.** Vercel deploys within ~60s. Card is now live at `/cards/<slug>`.

## How to add a new stage

Edit `data/stages.json`, add an entry with a new `order` value. Ensure a matching `--s-N` color exists in `styles.css`. Update `build.js` if you want static per-stage HTML.

## How to swap the photo

Replace `assets/Fer.jpeg` with a new source photo. Regenerate `Fer-small.jpeg` (see [The FAST download](#the-fast-download) for the one-liner). Optionally regenerate `Fer-circle.png` for the signoff blocks.

---

## Deploy

Auto-deploys to Vercel on every push to `main`. Typical deploy time: 30–90 seconds.

**Deploy checks after pushing:**
- Home renders and the Analysis shelf peeks below the fold on first load
- Any changed card renders at `/cards/<slug>`
- If you changed FAST content: `/downloads/fast` reflects it, then run `./scripts/build-fast-pdf.sh` to regenerate the PDF and push again.

---

## Roadmap & open items

Tracked here so a fresh session (or a fresh laptop) can catch up.

**Pre-launch:**
- [ ] Second Basics card. Concept locked in as "Accelerate, don't replace" — a mindset card about when to use vs. not use AI. Draft exists in chat history; needs a `mindset` type added to `type` enum, an icon in `ROLE_ICONS`, and the Basics shelf wired to pull from `data/cards.json` (currently synthesized inline in `viewHomeV4`).
- [ ] Deliver FAST PDF on subscribe. Extend `api/subscribe.js` success response with `{ ok: true, download: "/downloads/fast.pdf" }`; update the subscribe modal to render a "Get the FAST guide →" button on success.

**Post-launch:**
- [ ] More Design-stage cards (currently only 2; feels thin).
- [ ] Play with view-transitions animation for card-open (currently the modal is retired; card page routes push new history).
- [ ] Consider a custom domain (see the chat archive for the audience-side reasoning).

**Deferred:**
- [ ] Cross-linking pass. Once ~15 cards exist, audit `related` fields for connective tissue.
- [ ] Second lead magnet (probably a "prompt starters library" or a "recipe card" set) — a bigger download than FAST.
- [ ] Emailed delivery via Resend (currently subscribe just stores the address; no follow-up).

---

## License

Playbook content (cards, stage primers, the FAST guide, essays) is © Fernando De Vega, all rights reserved. Ask before republishing.

Site code is MIT-licensed — use, fork, learn from it. Attribution appreciated but not required.
