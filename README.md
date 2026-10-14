# Daily Digest

Free, zero-dependency news digest PWA. Each day it builds a pool of recent stories per topic from public RSS feeds (BBC, Guardian, NPR, Al Jazeera, DW, ABC Australia, CBC, The Hindu, PBS, NYT, plus Google News searches for cities, PSA/World Squash, and the Hacker News front page) and shows the top 3 per topic. Visitors choose topics and news channels; choices are saved in their browser.

- `sources.json` – channels, feeds, topics and keyword filters (edit to add/remove)
- `npm run fetch` – refresh `docs/news.json`
- `node scripts/serve.mjs` – preview at http://localhost:4173
- `.github/workflows/daily.yml` – refreshes the data daily on GitHub Actions
- Hosted free on GitHub Pages from the `/docs` folder

Notes: topic filters for AI / stocks / military / India are keyword matches, so they are approximate. "Trending" = stories covered by several channels. "Viral" = top of Hacker News (tech-leaning). Headlines belong to their publishers; every story links to its source.
