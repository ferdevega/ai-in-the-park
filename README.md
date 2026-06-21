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
├─ app.js              # hash router, filters, search, modal
├─ assets/             # avatar + future static assets
└─ data/
   ├─ stages.json      # the 10 stages
   └─ cards.json       # the how-to cards
```

## Deploy

Auto-deploys to Vercel on every push to `main`.

## License

The playbook content (cards, stage primers) is © Fernando Vega.
The site code is released under the MIT License.
