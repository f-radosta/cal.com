import { OAuth2Client } from "googleapis-common";
import type { NextApiRequest, NextApiResponse } from "next";

import { GOOGLE_CALENDAR_SCOPES, SCOPE_USERINFO_PROFILE, WEBAPP_URL_FOR_OAUTH } from "@calcom/lib/constants";
import { HttpError } from "@calcom/lib/http-error";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { prisma } from "@calcom/prisma";

import { getGoogleAppKeys } from "@calcom/app-store/googlecalendar/lib/getGoogleAppKeys";

import {
  assertSynapticaSecret,
  platformOrigin,
  safePlatformRedirect,
  signGoogleOAuthState,
} from "@lib/synaptica/auth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  await assertSynapticaSecret(req);

  const userId = Number(req.query.userId);
  if (!req.query.userId || Number.isNaN(userId)) {
    throw new HttpError({ statusCode: 400, message: "userId is required (number)" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new HttpError({ statusCode: 404, message: "User not found" });
  }

  const returnTo = safePlatformRedirect(
    typeof req.query.returnTo === "string" ? req.query.returnTo : null,
    "/trener/onboarding?calendar=connected"
  );
  const onErrorReturnTo = safePlatformRedirect(
    typeof req.query.onErrorReturnTo === "string" ? req.query.onErrorReturnTo : null,
    "/trener/onboarding?calendar=error"
  );

  const { client_id, client_secret } = await getGoogleAppKeys();
  const redirect_uri = `${WEBAPP_URL_FOR_OAUTH}/api/synaptica/google-callback`;
  const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uri);

  const state = signGoogleOAuthState({
    userId,
    returnTo,
    onErrorReturnTo,
  });

  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [SCOPE_USERINFO_PROFILE, ...GOOGLE_CALENDAR_SCOPES],
    prompt: "consent",
    state,
    login_hint: user.email,
  });

  return res.status(200).json({
    url,
    redirectUri: redirect_uri,
    platformOrigin: platformOrigin(),
  });
}

export default defaultResponder(handler, "/api/synaptica/google-connect");
