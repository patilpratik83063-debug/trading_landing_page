/* ==========================================================================
   DEMONFX — Cloudflare Worker entry
   /api/*  -> server handlers (secrets live in Worker environment variables)
   others  -> static assets from the bound ASSETS directory
   ========================================================================== */
import { handleApi } from "../api/_handler.js";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(self)"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => headers.set(key, value));

    if ((headers.get("content-type") || "").includes("text/html")) {
      headers.set("cache-control", "public, max-age=0, must-revalidate");
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
