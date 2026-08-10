import crypto from "node:crypto";

import type { NextApiRequest } from "next";

import { HttpError } from "@calcom/lib/http-error";
import { prisma } from "@calcom/prisma";

/**
 * Shared helpers for /api/synaptica/* service routes.
 */

export async function assertSynapticaSecret(req: NextApiRequest): Promise<void> {
  const header = String(req.headers["x-synaptica-secret"] || "");
  const headerHash = crypto.createHash("sha256").update(header).digest("hex");

  const envSecret = process.env.SYNAPTICA_API_SECRET;
  if (envSecret) {
    // Env may hold either the raw secret or its SHA-256 hash (Railway quirk).
    if (envSecret === header || envSecret === headerHash) return;
  }

  // Railway sometimes fails to inject SYNAPTICA_API_SECRET into the Docker
  // runtime — fall back to Deployment.synapticaApiSecretHash when present.
  const deployment = await prisma.deployment.findFirst({
    select: { synapticaApiSecretHash: true },
  });
  const dbHash = deployment?.synapticaApiSecretHash;
  if (dbHash) {
    if (dbHash === headerHash) return;
    throw new HttpError({ statusCode: 401, message: "Unauthorized" });
  }

  if (envSecret) {
    throw new HttpError({ statusCode: 401, message: "Unauthorized" });
  }

  // Local/dev without secret configured — allow (matches book gate when unset).
}

export function platformOrigin(): string {
  return (
    process.env.SYNAPTICA_PLATFORM_URL ||
    process.env.NEXT_PUBLIC_SYNAPTICA_PLATFORM_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function isAllowedPlatformRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowed = new URL(platformOrigin());
    if (parsed.origin === allowed.origin) return true;
    if (
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
      (allowed.hostname === "localhost" || allowed.hostname === "127.0.0.1")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function safePlatformRedirect(
  url: string | undefined | null,
  fallbackPath = "/trener/onboarding"
): string {
  if (url && isAllowedPlatformRedirect(url)) return url;
  return `${platformOrigin()}${fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`}`;
}

type GoogleOAuthState = {
  userId: number;
  returnTo: string;
  onErrorReturnTo: string;
  exp: number;
};

function oauthSigningKey(): string {
  return (
    process.env.SYNAPTICA_API_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.CALENDSO_ENCRYPTION_KEY ||
    "synaptica-dev-oauth"
  );
}

export function signGoogleOAuthState(payload: Omit<GoogleOAuthState, "exp"> & { exp?: number }): string {
  const body: GoogleOAuthState = {
    ...payload,
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + 60 * 30,
  };
  const json = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", oauthSigningKey()).update(json).digest("base64url");
  return `${json}.${sig}`;
}

export function verifyGoogleOAuthState(state: string | undefined): GoogleOAuthState | null {
  if (!state || !state.includes(".")) return null;
  const [json, sig] = state.split(".");
  const expected = crypto.createHmac("sha256", oauthSigningKey()).update(json).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as GoogleOAuthState;
    if (!parsed.userId || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}
