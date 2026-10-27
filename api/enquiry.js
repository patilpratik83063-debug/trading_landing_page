/* POST /api/enquiry — course enquiry form submissions.
   Sends a notification email when RESEND_API_KEY is configured. */
import { vercelRoute } from "./_node.js";

export default vercelRoute("/api/enquiry");
