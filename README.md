# Demonfx — Forex Trading Masterclass

A premium, dark-theme landing page and enrolment flow for a Forex education academy.
Built as a dependency-free static site with a small serverless API, so it deploys to
**Vercel** (or Cloudflare Workers) with no build step.

Education only. The site deliberately makes no profit claims, shows no invented
testimonials, student counts or earnings screenshots, and carries risk disclosures on
every page.

---

## What's in the box

| Page | Purpose |
| --- | --- |
| `index.html` | Full 10-section landing page: hero, problem, what you'll learn, curriculum accordion with lesson previews, why-choose, instructor, pricing, testimonials slot, FAQ, final CTA, footer |
| `checkout.html` | Enrolment form → Stripe-hosted checkout (details collected server-side only) |
| `success.html` | Post-payment confirmation / what happens next |
| `failed.html` | Payment cancelled or declined, with retry paths |
| `about.html` | Academy positioning, method, what it does not do |
| `contact.html` | Course enquiry form (posts to `/api/enquiry`) |
| `terms.html`, `privacy.html`, `refund-policy.html`, `risk-disclosure.html` | Legal pages with clearly marked `[PLACEHOLDER]` fields for jurisdiction-specific details |
| `robots.txt`, `sitemap.xml` | SEO plumbing (update the domain in both) |

**Server (serverless functions, no framework):**

| Route | Method | Behaviour |
| --- | --- | --- |
| `/api/checkout` | POST | Creates a Stripe Checkout Session and returns its hosted URL. Returns `501` when credentials are missing, so the UI can say "not connected yet" instead of pretending to charge. |
| `/api/enquiry` | POST | Validates a course enquiry, throttles by IP, emails it to your inbox (`reply_to` = enquirer). `DEV_MODE=1` captures it locally instead. |
| `/api/stripe-webhook` | POST | Verifies the Stripe signature (`t`/`v1`, 5-minute replay window), then emails the student a purchase confirmation/receipt. |
| `/api/health` | GET | Reports `checkoutConfigured` / `emailConfigured` as booleans. Never returns key values. |

Hardening in place: same-origin checks on every POST, JSON size cap (16 KB), input
trimming/length limits, HTML escaping in emails, best-effort per-IP rate limiting,
security headers (`nosniff`, `DENY` framing, referrer policy, permissions policy),
`no-store` on all API responses. No secret ever reaches the browser.

---

## Project layout

```
index.html … risk-disclosure.html   static pages (root, no build)
assets/css/styles.css               design system (~3.4k lines, one file)
assets/js/main.js                   nav, reveals, accordions, lesson previews, enquiry form, consent-gated analytics
assets/js/checkout.js               checkout page behaviour
assets/js/config.js                 public site config (no secrets)
api/_handler.js                     runtime-neutral API logic (Web Request/Response)
api/_node.js                        Vercel Node adapter
api/checkout.js, enquiry.js, stripe-webhook.js, health.js
worker/index.js                     Cloudflare Worker entry (same API, static assets via ASSETS)
server/dev-server.js                zero-dependency local server
wrangler.jsonc                      Cloudflare config (alternative host)
vercel.json                         headers, caching, function limits
```

The API logic exists exactly once (`api/_handler.js`); Vercel and Cloudflare both wrap it,
so behaviour cannot drift between hosts.

---

## Run locally

```bash
npm run dev          # http://127.0.0.1:4173
```

Node 18+ only — there are no dependencies to install.

Copy `.env.example` to `.env` for real credentials, or run with `DEV_MODE=1` (default)
to exercise the enquiry flow without sending email — submissions are logged to
`.local/enquiries.jsonl` and echoed to the console.

`.env` is git-ignored. Never commit real keys.

### Quick verification

```bash
curl -s localhost:4173/api/health
curl -s -X POST localhost:4173/api/checkout -H 'content-type: application/json' -d '{}'   # 501 until configured
```

---

## Deploy to Vercel

### 1. Import the repository

1. Go to <https://vercel.com/new> and import `patilpratik83063-debug/trading_landing_page`.
2. **Framework preset:** *Other*. **Build command:** none. **Output directory:** leave empty.
   Vercel serves the HTML files statically and turns each file in `api/` into a function.
3. Deploy. The site is live immediately; checkout returns `501` until step 2 below.

`vercel.json` sets `"framework": null` and `"buildCommand": null`, so the deployment
ignores any framework preset left over on the project (a Next.js preset would otherwise
run `next build` and fail with `NEXT_NO_VERSION`). If a build still reports Next.js,
open **Settings → Build & Development Settings → Framework Preset** and choose *Other*.

Or from the CLI:

```bash
npx vercel login
npx vercel          # preview deployment
npx vercel --prod   # production deployment
```

`.vercelignore` keeps `server/`, `worker/` and local config out of the deployment.

### 2. Add environment variables

Vercel → **Project → Settings → Environment Variables** (Production *and* Preview):

| Variable | Required | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | for payments | `sk_test_…` while testing, `sk_live_…` when live |
| `COURSE_PRICE_CENTS` | for payments | integer minor units, e.g. `24900` = 249.00 |
| `COURSE_CURRENCY` | no | ISO code, default `usd` |
| `COURSE_NAME` | no | defaults to `Forex Trading Masterclass` |
| `PUBLIC_SITE_URL` | recommended | e.g. `https://demonfx.vercel.app` — used for Stripe success/cancel redirects |
| `STRIPE_WEBHOOK_SECRET` | for receipts | `whsec_…` from the webhook endpoint you create |
| `RESEND_API_KEY` | for email | any Resend-compatible key |
| `EMAIL_FROM` | for email | verified sender, e.g. `Demonfx <courses@yourdomain.com>` |
| `ENQUIRY_TO` | for email | where enquiries and replies go |
| `ALLOWED_ORIGIN` | no | comma-separated extra origins allowed to POST |

Do **not** set `DEV_MODE` on Vercel. Redeploy after changing variables.

### 3. Wire Stripe

1. **Checkout:** no dashboard object needed — the session is created from
   `COURSE_PRICE_CENTS` on each request. Optionally enable Stripe Tax.
2. **Webhook:** Stripe → Developers → Webhooks → *Add endpoint*
   `https://<your-domain>/api/stripe-webhook`, event
   `checkout.session.completed`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. **Success/cancel:** already handled — `/success.html?session_id=…` and `/failed.html`.
4. **Email confirmation:** send a test event from the Stripe dashboard after setting
   `RESEND_API_KEY` + `EMAIL_FROM` and confirm `/api/health` shows
   `"emailConfigured": true`.

### 4. Custom domain

Add the domain in Vercel → Domains, then update:

- `PUBLIC_SITE_URL` (Stripe redirects),
- `<link rel="canonical">` and the `og:` URLs in each page,
- `sitemap.xml` and `robots.txt` (both contain `example.com` today).

---

## Alternative host: Cloudflare Workers

`wrangler.jsonc` binds `./` as the `ASSETS` directory and `worker/index.js` as the entry,
reusing the same API. Put secrets in `npx wrangler secret put NAME`, deploy with
`npx wrangler deploy`. Delete `vercel.json` if you standardise on Cloudflare.

---

## Before you go live — replace every placeholder

- [ ] Final price, access duration, and only genuinely included resources (pricing section)
- [ ] Instructor photo and verified bio/qualifications (`index.html`, instructor section)
- [ ] Real testimonials **or** keep the factual course-outcomes block that is there now
- [ ] Support email in `assets/js/config.js` (`supportEmail`)
- [ ] GA4 measurement ID in `assets/js/config.js` — analytics stays dormant until a real ID
      is set *and* the visitor accepts the consent banner
- [ ] Business name, address, governing law and refund window in the legal pages
- [ ] Domain in `sitemap.xml`, `robots.txt`, canonical/Open Graph tags
- [ ] Terms of Service URL in Stripe → Settings → Business → Public details

## Honest-marketing rules this build follows

No guaranteed-profit language, no fabricated student numbers, no invented credentials,
no simulated earnings screenshots. The FAQ states plainly that profits are not guaranteed,
and the final CTA is "Build your trading knowledge before you risk capital" rather than a
get-rich promise. Keep it that way when you edit copy — depending on your jurisdiction it
is also the legal requirement (FCA/CFTC/ASIC-style financial-promotion rules all ban
profit guarantees for retail trading education).

Content here is educational and is not financial advice.
