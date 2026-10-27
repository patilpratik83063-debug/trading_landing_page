/* ==========================================================================
   DEMONFX — server API
   Runtime-neutral handlers (Web Request/Response) used by both the Cloudflare
   Worker entry and the local Node dev server.

   Secrets are read from the environment only:
     STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, COURSE_PRICE_CENTS,
     COURSE_CURRENCY, COURSE_NAME, PUBLIC_SITE_URL, RESEND_API_KEY,
     EMAIL_FROM, ENQUIRY_TO, ALLOWED_ORIGIN, DEV_MODE
   ========================================================================== */

const MAX_BODY_BYTES = 16 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const WEBHOOK_TOLERANCE_SECONDS = 300;

/* ----------------------------- Utilities -------------------------------- */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function text(value, max = 2000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("payload_too_large");
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new Error("payload_too_large");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new Error("invalid_json");
  }
}

/** Blocks cross-site form posts. Requests without an Origin header (curl,
 *  server-to-server) are allowed; browsers send Origin on POST. */
function isSameOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN.split(",").map((v) => v.trim()) : [];
  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin || allowed.includes(origin);
}

function siteBase(request, env) {
  const configured = text(env.PUBLIC_SITE_URL, 300).replace(/\/$/, "");
  return configured || new URL(request.url).origin;
}

/* --------------------------- Rate limiting ------------------------------- */
// Per-isolate best-effort throttle. Not a substitute for a durable limiter.
const buckets = new Map();

function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  if (buckets.size > 5000) buckets.clear();
  return entry.count > limit;
}

/* ------------------------------ Email ------------------------------------ */
async function sendEmail(env, { to, subject, html, replyTo, label }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return { sent: false, reason: "not_configured" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });
    if (!response.ok) {
      console.error(`[email] ${label} failed`, response.status, await response.text().catch(() => ""));
      return { sent: false, reason: "provider_error" };
    }
    return { sent: true };
  } catch (error) {
    console.error(`[email] ${label} threw`, error && error.message);
    return { sent: false, reason: "network_error" };
  }
}

function emailShell(title, paragraphs) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#15211c;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#05090f;border-radius:18px;padding:26px 26px 22px;color:#eef3f7;">
      <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#35e3a6;">Demonfx</div>
      <h1 style="font-size:22px;line-height:1.3;margin:14px 0 0;font-weight:600;">${escapeHtml(title)}</h1>
    </div>
    <div style="background:#ffffff;border-radius:18px;padding:26px;margin-top:14px;font-size:15px;line-height:1.7;">
      ${paragraphs.map((p) => `<p style="margin:0 0 14px;">${p}</p>`).join("")}
      <p style="margin:22px 0 0;font-size:11px;line-height:1.6;color:#7a8a83;border-top:1px solid #e6ebe8;padding-top:14px;">
        Forex trading involves substantial risk of loss. Demonfx provides educational content only — not investment advice or a guarantee of results.
      </p>
    </div>
  </div>
</body></html>`;
}

/* ----------------------------- Enquiry ----------------------------------- */
async function handleEnquiry(request, env) {
  if (!isSameOrigin(request, env)) {
    return json({ ok: false, message: "Cross-origin requests are blocked." }, 403);
  }

  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
  if (rateLimited(`enquiry:${ip}`, 5, 10 * 60 * 1000)) {
    return json({ ok: false, message: "Too many enquiries from this connection. Please try again later." }, 429);
  }

  let data;
  try {
    data = await readJson(request);
  } catch (error) {
    return json(
      { ok: false, message: error.message === "payload_too_large" ? "Message is too long." : "Invalid request." },
      error.message === "payload_too_large" ? 413 : 400
    );
  }

  const name = text(data.name, 120).replace(/[\r\n]+/g, " ");
  const email = text(data.email, 200);
  const topic = text(data.topic, 120) || "Course enquiry";
  const message = text(data.message, 4000);
  const source = text(data.source, 200);

  if (!name) return json({ ok: false, message: "Please add your name." }, 422);
  if (!EMAIL_RE.test(email)) return json({ ok: false, message: "Please add a valid email address." }, 422);
  if (message.length < 10) return json({ ok: false, message: "Please add a little more detail." }, 422);

  const record = { name, email, topic, message, source, receivedAt: new Date().toISOString() };
  const html = emailShell(
    `New course enquiry — ${topic}`,
    [
      `<strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;`,
      `<strong>Page:</strong> ${escapeHtml(source || "unknown")}`,
      `<strong>Topic:</strong> ${escapeHtml(topic)}`,
      `<div style="white-space:pre-wrap;background:#f6f8f7;border-radius:12px;padding:14px;margin-top:8px;">${escapeHtml(message)}</div>`
    ]
  );

  if (env.DEV_MODE === "1" && !env.RESEND_API_KEY) {
    console.log("[enquiry] DEV_MODE — captured locally:", JSON.stringify(record));
    return json({ ok: true, delivered: false, mode: "development" });
  }

  const result = await sendEmail(env, {
    to: env.ENQUIRY_TO || env.EMAIL_FROM,
    subject: `Course enquiry — ${topic} — ${name}`,
    html,
    replyTo: email,
    label: "enquiry"
  });

  if (!result.sent) {
    console.error("[enquiry] delivery unavailable", result.reason);
    return json(
      {
        ok: false,
        message: "Enquiry delivery is not configured yet. Please email us directly instead."
      },
      503
    );
  }

  return json({ ok: true, delivered: true });
}

/* ---------------------------- Checkout ----------------------------------- */
async function handleCheckout(request, env) {
  if (!isSameOrigin(request, env)) {
    return json({ ok: false, message: "Cross-origin requests are blocked." }, 403);
  }

  if (!env.STRIPE_SECRET_KEY || !env.COURSE_PRICE_CENTS) {
    return json(
      {
        ok: false,
        code: "checkout_not_configured",
        message: "Checkout is not configured. Add STRIPE_SECRET_KEY and COURSE_PRICE_CENTS on the server."
      },
      501
    );
  }

  const price = Number(env.COURSE_PRICE_CENTS);
  if (!Number.isInteger(price) || price < 100) {
    return json({ ok: false, message: "COURSE_PRICE_CENTS must be an integer of at least 100 (minor units)." }, 500);
  }

  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "local";
  if (rateLimited(`checkout:${ip}`, 12, 10 * 60 * 1000)) {
    return json({ ok: false, message: "Too many checkout attempts. Please try again shortly." }, 429);
  }

  let data = {};
  try {
    data = await readJson(request);
  } catch {
    /* Checkout works without a body; details are collected on Stripe. */
  }

  const email = text(data.email, 200);
  const name = text(data.name, 120).replace(/[\r\n]+/g, " ");
  if (email && !EMAIL_RE.test(email)) {
    return json({ ok: false, message: "Please enter a valid email address." }, 422);
  }

  const base = siteBase(request, env);
  const currency = (text(env.COURSE_CURRENCY, 8) || "usd").toLowerCase();
  const courseName = text(env.COURSE_NAME, 120) || "Forex Trading Masterclass";

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${base}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${base}/failed.html`);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", currency);
  params.set("line_items[0][price_data][unit_amount]", String(price));
  params.set("line_items[0][price_data][product_data][name]", courseName);
  params.set(
    "line_items[0][price_data][product_data][description]",
    "Self-paced Forex education programme. Education only — trading involves substantial risk."
  );
  params.set("metadata[source]", "demonfx-checkout");
  if (name) params.set("metadata[student_name]", name);
  if (email) params.set("customer_email", email);
  params.set("billing_address_collection", "auto");
  params.set("consent_collection[terms_of_service]", "required");

  let stripeResponse;
  try {
    stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: params.toString()
    });
  } catch (error) {
    console.error("[checkout] stripe request failed", error && error.message);
    return json({ ok: false, message: "Payment provider is unreachable. Nothing was charged." }, 502);
  }

  if (!stripeResponse.ok) {
    const detail = await stripeResponse.text().catch(() => "");
    console.error("[checkout] stripe rejected session", stripeResponse.status, detail.slice(0, 500));
    return json({ ok: false, message: "Payment could not be started. Nothing was charged." }, 502);
  }

  const session = await stripeResponse.json();
  if (!session || !session.url) {
    return json({ ok: false, message: "Payment provider returned an unexpected response." }, 502);
  }

  return json({ ok: true, url: session.url, id: session.id });
}

/* ----------------------------- Webhook ----------------------------------- */
async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyStripeSignature(payload, header, secret) {
  if (!header) return false;
  const parts = header.split(",").reduce((acc, item) => {
    const [k, v] = item.split("=");
    if (k && v) {
      if (k === "t") acc.timestamp = v;
      if (k === "v1") acc.signatures.push(v);
    }
    return acc;
  }, { timestamp: null, signatures: [] });

  if (!parts.timestamp || !parts.signatures.length) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.timestamp));
  if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = await hmacHex(secret, `${parts.timestamp}.${payload}`);
  return parts.signatures.some((sig) => safeEqual(sig, expected));
}

async function handleWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return json({ ok: false, message: "Webhook secret is not configured." }, 501);
  }
  if (!env.STRIPE_SECRET_KEY) {
    return json({ ok: false, message: "Stripe is not configured." }, 501);
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  let verified = false;
  try {
    verified = await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("[webhook] verification error", error && error.message);
  }
  if (!verified) {
    return json({ ok: false, message: "Invalid signature." }, 400);
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ ok: false, message: "Invalid payload." }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data && event.data.object ? event.data.object : {};
    const email =
      (session.customer_details && session.customer_details.email) || session.customer_email || "";
    const student = (session.metadata && session.metadata.student_name) || "there";
    const amount = typeof session.amount_total === "number" ? session.amount_total : null;
    const currency = (session.currency || "").toUpperCase();
    const priceLabel =
      amount !== null ? `${(amount / 100).toFixed(2)} ${currency}`.trim() : "your purchase";

    if (!EMAIL_RE.test(email)) {
      console.warn("[webhook] completed session without a usable email", session.id);
      return json({ ok: true, emailed: false });
    }

    const html = emailShell(
      "Your enrolment is confirmed",
      [
        `Hi ${escapeHtml(student)},`,
        `Thank you for enrolling in the <strong>Forex Trading Masterclass</strong>. Your payment of <strong>${escapeHtml(priceLabel)}</strong> has been received.`,
        `Keep this email as your receipt. Course access details follow in a separate message from our team, sent to this address.`,
        `If anything does not arrive within one business day, reply to this email or contact <a href="mailto:${escapeHtml(env.ENQUIRY_TO || "hello@demonfx.com")}">${escapeHtml(env.ENQUIRY_TO || "hello@demonfx.com")}</a>.`,
        `<span style="font-size:12px;color:#7a8a83;">Reference: ${escapeHtml(session.id || "n/a")}</span>`
      ]
    );

    const result = await sendEmail(env, {
      to: email,
      subject: "Your Demonfx enrolment is confirmed",
      html,
      replyTo: env.ENQUIRY_TO || env.EMAIL_FROM,
      label: "purchase-confirmation"
    });

    if (!result.sent) {
      // Acknowledge so Stripe does not retry endlessly; alert in logs instead.
      console.error("[webhook] purchase confirmation not delivered", result.reason, session.id);
    }
    return json({ ok: true, emailed: result.sent });
  }

  return json({ ok: true, ignored: event.type || "unknown" });
}

/* ------------------------------ Router ----------------------------------- */
export async function handleApi(request, env = {}) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/\/+$/, "") || "/";

  if (route === "/api/enquiry") {
    if (request.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405);
    return handleEnquiry(request, env);
  }

  if (route === "/api/checkout") {
    if (request.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405);
    return handleCheckout(request, env);
  }

  if (route === "/api/stripe-webhook") {
    if (request.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405);
    return handleWebhook(request, env);
  }

  if (route === "/api/health") {
    return json({
      ok: true,
      checkoutConfigured: Boolean(env.STRIPE_SECRET_KEY && env.COURSE_PRICE_CENTS),
      emailConfigured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
    });
  }

  return json({ ok: false, message: "Not found." }, 404);
}
