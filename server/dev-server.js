/* ==========================================================================
   DEMONFX — local development server (no dependencies)
   Serves the static site and routes /api/* through the same handlers the
   Worker uses. Enquiries are logged to .local/enquiries.jsonl in dev mode.

     node server/dev-server.js
     PORT=4173 node server/dev-server.js
   ========================================================================== */

import { createServer } from "node:http";
import { readFile, stat, mkdir, appendFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "../api/_handler.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
}

async function logEnquiry(request) {
  try {
    const clone = request.clone();
    const data = await clone.json();
    const line = JSON.stringify({ ...data, receivedAt: new Date().toISOString() });
    await mkdir(join(ROOT, ".local"), { recursive: true });
    await appendFile(join(ROOT, ".local", "enquiries.jsonl"), line + "\n", "utf8");
  } catch {
    /* Logging is best-effort in development. */
  }
}

const server = createServer(async (req, res) => {
  securityHeaders(res);
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);

  if (requestUrl.pathname.startsWith("/api/")) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const apiRequest = new Request(requestUrl, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : body
    });

    const env = { ...process.env, DEV_MODE: process.env.DEV_MODE || "1" };
    if (requestUrl.pathname === "/api/enquiry" && req.method === "POST") await logEnquiry(apiRequest);

    try {
      const response = await handleApi(apiRequest, env);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error("[dev] api error", error);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, message: "Unexpected server error." }));
    }
    return;
  }

  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  const target = resolve(join(ROOT, normalize(pathname)));
  if (!target.startsWith(ROOT + sep) && target !== ROOT) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      res.writeHead(302, { Location: pathname.replace(/\/?$/, "/") });
      res.end();
      return;
    }
    const file = await readFile(target);
    const type = MIME[extname(target).toLowerCase()] || "application/octet-stream";
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "no-cache");
    res.statusCode = 200;
    res.end(req.method === "HEAD" ? undefined : file);
  } catch {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("404 — Not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Demonfx dev server: http://${HOST}:${PORT}`);
  console.log(`Checkout configured: ${Boolean(process.env.STRIPE_SECRET_KEY && process.env.COURSE_PRICE_CENTS)}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
