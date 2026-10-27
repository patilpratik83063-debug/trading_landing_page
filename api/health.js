/* GET /api/health — reports which integration credentials are present.
   Returns booleans only; never exposes key values. */
import { vercelRoute } from "./_node.js";

export default vercelRoute("/api/health");
