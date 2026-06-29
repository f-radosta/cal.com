import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Liveness probe for Docker/Railway. Intentionally shallow — no DB or tRPC.
 * Deep readiness (tRPC, event types) is checked by Payment Platform /api/health.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  return res.status(200).json({ status: "ok" });
}
