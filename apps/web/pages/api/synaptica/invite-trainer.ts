import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Deprecated: use POST /api/synaptica/provision-trainer.
 * Kept so older callers (payment_platform) keep working — now silent (no Cal email).
 */
export { default } from "./provision-trainer";

// Re-export keeps the route path; Next.js needs a default export from this file.
void 0 as unknown as NextApiRequest;
void 0 as unknown as NextApiResponse;
