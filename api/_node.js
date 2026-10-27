/* ==========================================================================
   DEMONFX — Vercel (Node) adapter
   Bridges Vercel's Node request/response objects to the Web Request/Response
   handlers in _handler.js, so the exact same API logic runs on Vercel and on
   the Cloudflare Worker.

   Files in /api that start with "_" are not published as routes.
   ========================================================================== */
import { handleApi } from "./_handler.js";

/** Reads the raw request body. Required for webhook signature verification. */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === "string") return resolve(Buffer.from(req.body, "utf8"));
    if (req.body && typeof req.body === "object") {
      return resolve(Buffer.from(JSON.stringify(req.body), "utf8"));
    }
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function toWebRequest(req, body, route) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const url = new URL(route, `${proto}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, String(item)));
    else headers.set(key, String(value));
  }

  const method = (req.method || "GET").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD" && body && body.length > 0;

  return new Request(url, {
    method,
    headers,
    body: hasBody ? body : undefined
  });
}

async function send(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

/**
 * Wraps one route of the shared API as a Vercel function.
 * @param {string} route e.g. "/api/checkout"
 */
export function vercelRoute(route) {
  return async function handler(req, res) {
    try {
      const body = await readRawBody(req);
      const request = toWebRequest(req, body, route);
      const response = await handleApi(request, process.env);
      await send(res, response);
    } catch (error) {
      console.error(`[api] ${route} failed`, error && error.message);
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify({ ok: false, message: "Unexpected server error." }));
    }
  };
}
