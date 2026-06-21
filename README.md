# AI in the Park 🐕‍🦺

A field notebook of how-to cards for designing training with AI in the loop —
mindsets, tools, accelerators, lessons learned, and prompts.

Maintained by [Fernando Vega](https://www.linkedin.com/in/ferdevega/).

## Run locally

Plain static site — no build step, no dependencies.

```bash
python -m http.server 3006 --directory .
```

Then open http://127.0.0.1:3006

## Author a card

Cards live in [`data/cards.json`](data/cards.json). Add an entry like:

```json
{
  "slug": "your-card-slug",
  "title": "Card title here",
  "stage": "analysis",
  "type": ["mindset", "prompt"],
  "tags": ["discovery"],
  "added": "2026-06-21",
  "teaser": "One-line preview shown in the grid.",
  "body": "<p>HTML body of the card.</p>",
  "prompt_body": "Optional. Plain text. If type includes 'prompt', a Copy button appears."
}
```

- `stage` can be a single slug or an array (`["analysis", "execution"]`) for cards that span multiple stages.
- `type` is an array — a card can be both a Mindset and a Best Practice.
- `related` (optional) — array of card slugs to surface as Related cards.

Stages live in [`data/stages.json`](data/stages.json). Empty stages render as "coming soon" in the spine.

## Project layout

```
ai-playbook/
├─ index.html          # shell + view templates
├─ styles.css          # handcrafted, no framework
├─ app.js              # path router, filters, search, modal
├─ build.js            # pre-renders per-route HTML + RSS + sitemap
├─ assets/
│  ├─ avatar.jpg       # author photo
│  ├─ stages/          # optional stage illustrations
│  └─ cards/           # optional card illustrations
└─ data/
   ├─ stages.json      # the 10 stages
   └─ cards.json       # the how-to cards
```

## Illustrations

Each stage and each card can have an optional illustration that renders in
the stage header (right column) or at the top of the card modal.

- Stage: drop a PNG at `assets/stages/<slug>.png` and add
  `"illustration": "/assets/stages/<slug>.png"` to the stage entry in
  `data/stages.json`.
- Card: same idea, at `assets/cards/<slug>.png` with the field on the card.

Recommended dimensions: 1600×900 PNG, monochrome line art, transparent or
white background. See the FAST page and the prompting model for tone.

## Deploy

Auto-deploys to Vercel on every push to `main`.

## License

The playbook content (cards, stage primers) is © Fernando Vega.
The site code is released under the MIT License.
