/* POST /api/stripe-webhook — verifies the Stripe signature and emails the
   purchase confirmation. Needs the raw body, so body parsing is disabled. */
import { vercelRoute } from "./_node.js";

export const config = { api: { bodyParser: false } };

export default vercelRoute("/api/stripe-webhook");
