#!/usr/bin/env node
// Lokale Vorschau der Seite – ohne Abhängigkeiten.
//
// - Liefert die Seite unter /<Ordnername>/ aus, genau wie GitHub Pages unter
//   einem Projektpfad (https://<name>.github.io/<repo>/). So fallen falsche
//   absolute Pfade schon lokal auf.
// - Unterstützt HTTP-Range-Anfragen. Safari/iOS spielt Videos sonst nicht ab.
// - Lauscht im lokalen Netz, damit man die Seite auch auf dem Handy öffnen kann.
//
//   node tools/serve.mjs              → http://localhost:8080/linda-geschenk/
//   PORT=3000 node tools/serve.mjs
//   BASE= node tools/serve.mjs        → ohne Projektpfad, direkt unter /

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT) || 8080;
const baseName = process.env.BASE ?? path.basename(root);
const base = baseName ? `/${baseName.replace(/^\/+|\/+$/g, "")}/` : "/";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad Request");
  }

  if (base !== "/" && (pathname === "/" || pathname === base.slice(0, -1))) {
    return send(res, 302, "", { Location: base });
  }
  if (!pathname.startsWith(base)) {
    return send(res, 404, `Nicht gefunden. Die Seite liegt unter ${base}`);
  }

  let rel = pathname.slice(base.length);
  if (rel === "" || rel.endsWith("/")) rel += "index.html";

  const file = path.join(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) {
    return send(res, 403, "Forbidden");
  }

  let info;
  try {
    info = await stat(file);
    if (info.isDirectory()) return send(res, 302, "", { Location: pathname + "/" });
  } catch {
    return send(res, 404, "Nicht gefunden");
  }

  const headers = {
    "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Last-Modified": info.mtime.toUTCString(),
  };

  const size = info.size;
  const range = req.headers.range;
  let start = 0;
  let end = size - 1;
  let status = 200;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (match[1] === "" && match[2] === "")) {
      return send(res, 416, "", { "Content-Range": `bytes */${size}` });
    }
    if (match[1] === "") {
      start = Math.max(0, size - Number(match[2]));
    } else {
      start = Number(match[1]);
      if (match[2] !== "") end = Math.min(Number(match[2]), size - 1);
    }
    if (start > end || start >= size) {
      return send(res, 416, "", { "Content-Range": `bytes */${size}` });
    }
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }

  headers["Content-Length"] = String(size === 0 ? 0 : end - start + 1);
  res.writeHead(status, headers);

  if (req.method === "HEAD" || size === 0) return res.end();
  createReadStream(file, { start, end })
    .on("error", () => res.destroy())
    .pipe(res);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} ist belegt. Anderen Port wählen: PORT=8081 node tools/serve.mjs`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(port, "0.0.0.0", () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i.address}:${port}${base}`);

  console.log("\nLokale Vorschau läuft:\n");
  console.log(`  Dieser Computer:  http://localhost:${port}${base}`);
  for (const url of lan) console.log(`  Handy (gleiches WLAN): ${url}`);
  console.log("\nBeenden mit Ctrl+C.\n");
});
