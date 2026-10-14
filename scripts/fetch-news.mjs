// Fetches RSS feeds and writes public/news.json. No dependencies, no API keys.
import { readFile, writeFile } from "node:fs/promises";

const cfg = JSON.parse(await readFile(new URL("../sources.json", import.meta.url)));

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

async function readFeed(feed) {
  const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0 NewsDigest" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    const link = strip(tag(b, "link")) || (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    const date = new Date(strip(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated")));
    return {
      title: strip(tag(b, "title")),
      url: link,
      summary: short(strip(tag(b, "description") || tag(b, "summary"))),
      source: feed.name,
      published: isNaN(date) ? null : date.toISOString(),
    };
  }).filter((i) => i.title && i.url);
}

const out = { generatedAt: new Date().toISOString(), categories: [] };
for (const cat of cfg.categories) {
  const perFeed = [];
  for (const feed of cat.feeds) {
    try { perFeed.push((await readFeed(feed)).sort((a, b) => (b.published || "").localeCompare(a.published || ""))); }
    catch (e) { console.error(`! ${feed.name}: ${e.message}`); perFeed.push([]); }
  }
  // Round-robin across sources so one outlet can't take every slot.
  const picked = [], seen = new Set();
  for (let i = 0; picked.length < cfg.perCategory && perFeed.some((f) => i < f.length); i++) {
    for (const f of perFeed) {
      const it = f[i];
      if (it && !seen.has(it.url) && picked.length < cfg.perCategory) { seen.add(it.url); picked.push(it); }
    }
  }
  out.categories.push({ id: cat.id, title: cat.title, items: picked });
  console.log(`${cat.title}: ${picked.length} stories`);
}
await writeFile(new URL("../docs/news.json", import.meta.url), JSON.stringify(out, null, 2));
