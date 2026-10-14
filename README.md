# Daily Digest

Free, zero-dependency news digest PWA. Each day it picks the top 3 stories per category from public RSS feeds (BBC, NPR, Guardian, PSA Squash Tour, World Squash) and shows headline, short excerpt and a link to the original.

- `sources.json` – categories and feeds (edit to add/remove sources)
- `npm run fetch` – refresh `docs/news.json`
- `node scripts/serve.mjs` – preview at http://localhost:4173
- `.github/workflows/daily.yml` – refreshes the data daily on GitHub Actions
- Hosted free on GitHub Pages from the `/docs` folder (Settings → Pages → Deploy from branch → main → /docs)

Headlines and excerpts belong to their publishers; every story links back to its source.
