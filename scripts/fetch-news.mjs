// Fetches RSS/Atom feeds and writes docs/news.json. No dependencies, no API keys.
// Each topic gets a pool of recent stories (tagged by source) so the app can filter by source in the browser.
import { readFile, writeFile } from "node:fs/promises";

const cfg = JSON.parse(await readFile(new URL("../sources.json", import.meta.url)));
const sourceName = Object.fromEntries(cfg.sources.map((s) => [s.id, s.name]));

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const strip = (s) => decode(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};
const short = (s, n = 200) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, "") + "…");

const STOP = new Set("that this with from have will after about their they been were what when over into says said more than could would while amid also first last year years news live".split(" "));
const keywords = (t) => new Set((t.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((w) => !STOP.has(w)));
const similar = (a, b) => {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n >= 2 && n / Math.min(a.size, b.size) >= 0.5;
};

const cache = new Map();
function fetchText(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url, { headers: { "User-Agent": "Mozilla/5.0 NewsDigest" }, signal: AbortSignal.timeout(20000) })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }));
  }
  return cache.get(url);
}

function parse(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    const link = strip(tag(b, "link")) || (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    const date = new Date(strip(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated")));
    return {
      title: strip(tag(b, "title")),
      url: decode(link),
      summary: short(strip(tag(b, "description") || tag(b, "summary"))),
      sourceText: strip(tag(b, "source")),
      published: isNaN(date) ? null : date.toISOString(),
    };
  }).filter((i) => i.title && /^https?:\/\//.test(i.url));
}

async function loadFeed(url) {
  try { return parse(await fetchText(url)); }
  catch (e) { console.error(`! ${url}: ${e.message}`); return []; }
}

const byDateDesc = (a, b) => (b.published || "").localeCompare(a.published || "");

// "Viral" = Hacker News front page, ranked by HN's own score (official free API; tech-leaning audience).
async function hackerNews() {
  try {
    const ids = await (await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", { signal: AbortSignal.timeout(15000) })).json();
    const items = await Promise.all(ids.slice(0, 30).map((id) =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(15000) }).then((r) => r.json())));
    return items.filter((i) => i && i.title).map((i) => ({
      title: i.title,
      url: i.url || `https://news.ycombinator.com/item?id=${i.id}`,
      summary: `${i.score} points · ${i.descendants ?? 0} comments on Hacker News`,
      published: new Date(i.time * 1000).toISOString(),
      source: "hn", sourceName: "Hacker News",
    }));
  } catch (e) { console.error(`! hacker news: ${e.message}`); return []; }
}

async function buildTopic(topic) {
  let items = [];
  if (topic.kind === "viral") {
    items = await hackerNews();
  } else if (topic.gnews) {
    for (const q of topic.gnews) {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${topic.gnewsLocale}`;
      for (const it of await loadFeed(url)) {
        const src = it.sourceText || "Google News";
        items.push({ ...it, summary: "", title: it.title.replace(new RegExp(`\\s+-\\s+${src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), ""), source: "gnews", sourceName: src });
      }
    }
  } else if (topic.feeds) {
    const re = topic.filter ? new RegExp(cfg.filters[topic.filter], "i") : null;
    for (const f of topic.feeds) {
      for (const it of await loadFeed(cfg.feeds[f.feed])) {
        if (re && !f.nofilter && !re.test(`${it.title} ${it.summary}`)) continue;
        items.push({ ...it, source: f.source, sourceName: f.sourceName || sourceName[f.source] });
      }
    }
  }
  const seen = new Set();
  items = items.filter((i) => !seen.has(i.url) && seen.add(i.url));
  if (topic.kind !== "viral") items.sort(byDateDesc); // viral keeps Reddit's own ranking
  return items.slice(0, cfg.poolSize).map(({ sourceText, ...rest }) => rest);
}

const out = { generatedAt: new Date().toISOString(), sources: cfg.sources, topics: [] };
const pools = {};
for (const t of cfg.topics) {
  if (t.kind === "trending") continue;
  pools[t.id] = await buildTopic(t);
}

// Trending = stories that several different outlets are covering (title-keyword overlap across outlets).
const general = ["world", "business", "tech", "ai", "india", "military", "stocks"]
  .flatMap((id) => pools[id] || [])
  .filter((i) => sourceName[i.source]);
const uniq = [...new Map(general.map((i) => [i.url, i])).values()];
const kw = uniq.map((i) => keywords(i.title));
pools.trending = uniq.map((it, a) => {
  const coveredBy = new Set();
  uniq.forEach((o, b) => { if (b !== a && o.source !== it.source && similar(kw[a], kw[b])) coveredBy.add(o.source); });
  return { ...it, coveredBy: [...coveredBy] };
}).filter((i) => i.coveredBy.length > 0)
  .sort((a, b) => b.coveredBy.length - a.coveredBy.length || byDateDesc(a, b))
  .slice(0, cfg.poolSize);

for (const t of cfg.topics) {
  const items = pools[t.id] || [];
  out.topics.push({ id: t.id, title: t.title, group: t.group, anySource: !!t.anySource, kind: t.kind || "news", items });
  console.log(`${t.title}: pool ${items.length}`);
}
await writeFile(new URL("../docs/news.json", import.meta.url), JSON.stringify(out));
