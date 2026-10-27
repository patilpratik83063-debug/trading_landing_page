/* POST /api/checkout — creates a Stripe Checkout Session server-side.
   Secrets live in Vercel environment variables, never in the browser. */
import { vercelRoute } from "./_node.js";

export default vercelRoute("/api/checkout");
