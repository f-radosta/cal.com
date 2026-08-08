import { calendar_v3 } from "@googleapis/calendar";
import { OAuth2Client } from "googleapis-common";
import type { NextApiRequest, NextApiResponse } from "next";

import { createGoogleCalendarServiceWithGoogleType } from "@calcom/app-store/googlecalendar/lib/CalendarService";
import { getGoogleAppKeys } from "@calcom/app-store/googlecalendar/lib/getGoogleAppKeys";
import { CredentialRepository } from "@calcom/features/credentials/repositories/CredentialRepository";
import { buildCredentialCreateData } from "@calcom/features/credentials/services/CredentialDataService";
import { renewSelectedCalendarCredentialId } from "@calcom/lib/connectedCalendar";
import {
  GOOGLE_CALENDAR_SCOPES,
  SCOPE_USERINFO_PROFILE,
  WEBAPP_URL_FOR_OAUTH,
} from "@calcom/lib/constants";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { Prisma } from "@calcom/prisma/client";

import { updateProfilePhotoGoogle } from "@calcom/app-store/_utils/oauth/updateProfilePhotoGoogle";
import { safePlatformRedirect, verifyGoogleOAuthState } from "@lib/synaptica/auth";

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const state = verifyGoogleOAuthState(typeof req.query.state === "string" ? req.query.state : undefined);
  if (!state) {
    res.redirect(safePlatformRedirect(null, "/trener/onboarding?calendar=error"));
    return;
  }

  const { code } = req.query;
  if (typeof code !== "string") {
    res.redirect(safePlatformRedirect(state.onErrorReturnTo, "/trener/onboarding?calendar=error"));
    return;
  }

  const { client_id, client_secret } = await getGoogleAppKeys();
  const redirect_uri = `${WEBAPP_URL_FOR_OAUTH}/api/synaptica/google-callback`;
  const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uri);

  try {
    const token = await oAuth2Client.getToken(code);
    const key = token.tokens;
    const grantedScopes = token.tokens.scope?.split(" ") ?? [];
    const hasMissingRequiredScopes = GOOGLE_CALENDAR_SCOPES.some((scope) => !grantedScopes.includes(scope));
    if (hasMissingRequiredScopes) {
      res.redirect(
        `${safePlatformRedirect(state.onErrorReturnTo, "/trener/onboarding?calendar=error")}&error=missing_scopes`
      );
      return;
    }

    oAuth2Client.setCredentials(key);

    const gcalCredentialData = buildCredentialCreateData({
      userId: state.userId,
      key,
      appId: "google-calendar",
      type: "google_calendar",
    });
    const gcalCredential = await CredentialRepository.create(gcalCredentialData);

    const gCalService = createGoogleCalendarServiceWithGoogleType({
      ...gcalCredential,
      user: null,
      delegatedTo: null,
    });

    const calendar = new calendar_v3.Calendar({ auth: oAuth2Client });
    const primaryCal = await gCalService.getPrimaryCalendar(calendar);

    if (grantedScopes.includes(SCOPE_USERINFO_PROFILE)) {
      await updateProfilePhotoGoogle(oAuth2Client, state.userId);
    }

    if (primaryCal?.id) {
      const selectedCalendarWhereUnique = {
        userId: state.userId,
        externalId: primaryCal.id,
        integration: "google_calendar",
      };
      try {
        await gCalService.upsertSelectedCalendar({
          eventTypeId: null,
          externalId: selectedCalendarWhereUnique.externalId,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          if (!(await renewSelectedCalendarCredentialId(selectedCalendarWhereUnique, gcalCredential.id))) {
            await CredentialRepository.deleteById({ id: gcalCredential.id });
            res.redirect(
              `${safePlatformRedirect(state.onErrorReturnTo, "/trener/onboarding?calendar=error")}&error=account_already_linked`
            );
            return;
          }
        } else {
          await CredentialRepository.deleteById({ id: gcalCredential.id });
          res.redirect(
            `${safePlatformRedirect(state.onErrorReturnTo, "/trener/onboarding?calendar=error")}&error=calendar_link_failed`
          );
          return;
        }
      }
    }

    // Also ensure Google Meet credential exists (same as stock callback).
    const existingGoogleMeetCredential = await CredentialRepository.findFirstByUserIdAndType({
      userId: state.userId,
      type: "google_video",
    });
    if (!existingGoogleMeetCredential) {
      await CredentialRepository.create(
        buildCredentialCreateData({
          userId: state.userId,
          type: "google_video",
          key: {},
          appId: "google-meet",
        })
      );
    }

    res.redirect(safePlatformRedirect(state.returnTo, "/trener/onboarding?calendar=connected"));
  } catch {
    res.redirect(
      `${safePlatformRedirect(state.onErrorReturnTo, "/trener/onboarding?calendar=error")}&error=oauth_failed`
    );
  }
}

export default defaultHandler({
  GET: Promise.resolve({ default: defaultResponder(getHandler) }),
});
