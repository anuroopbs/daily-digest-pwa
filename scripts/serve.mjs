// Tiny static server for local testing: node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../docs/", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const port = Number(process.argv[2]) || 4173;

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "") || "index.html";
  try {
    const file = join(root, path.endsWith("/") ? path + "index.html" : path);
    if (!file.startsWith(root)) throw new Error("outside root");
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch { res.writeHead(404).end("Not found"); }
}).listen(port, () => console.log(`http://localhost:${port}`));
