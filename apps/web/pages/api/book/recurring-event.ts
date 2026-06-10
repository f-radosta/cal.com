import type { NextApiRequest } from "next";
import crypto from "node:crypto";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { getRecurringBookingService } from "@calcom/features/bookings/di/RecurringBookingService.container";
import type { BookingResponse } from "@calcom/features/bookings/types";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { HttpError } from "@calcom/lib/http-error";
import getIP from "@calcom/lib/getIP";
import { piiHasher } from "@calcom/lib/server/PiiHasher";
import { checkCfTurnstileToken } from "@calcom/lib/server/checkCfTurnstileToken";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { prisma } from "@calcom/prisma";

// @TODO: Didn't look at the contents of this function in order to not break old booking page.

type PlatformParams = {
  platformClientId?: string;
  platformCancelUrl?: string;
  platformBookingUrl?: string;
  platformRescheduleUrl?: string;
  platformBookingLocation?: string;
};

type RequestMeta = {
  userId?: number;
  hostname?: string;
  forcedSlug?: string;
  noEmail?: boolean;
} & PlatformParams;

async function handler(req: NextApiRequest & RequestMeta) {
  // Only allow bookings from authorized platforms (rezervace.synaptica.cz)
  // Railway intermittently fails to inject SYNAPTICA_API_SECRET into the runtime,
  // so we fall back to the Deployment table where the SHA-256 hash is stored.
  const secretHash =
    process.env.SYNAPTICA_API_SECRET ||
    (
      await prisma.deployment.findFirst({
        select: { synapticaApiSecretHash: true },
      })
    )?.synapticaApiSecretHash;

  if (
    secretHash &&
    !req.body?.rescheduleUid &&
    crypto.createHash("sha256").update(req.headers["x-synaptica-secret"] || "").digest("hex") !==
      secretHash
  ) {
    throw new HttpError({ statusCode: 401, message: "Unauthorized" });
  }

  const userIp = getIP(req);

  if (process.env.NEXT_PUBLIC_CLOUDFLARE_USE_TURNSTILE_IN_BOOKER === "1") {
    await checkCfTurnstileToken({
      token: req.body[0]["cfToken"] as string,
      remoteIp: userIp,
    });
  }

  await checkRateLimitAndThrowError({
    rateLimitingType: "core",
    identifier: `createRecurringBooking:${piiHasher.hash(userIp)}`,
  });
  const session = await getServerSession({ req });
  /* To mimic API behavior and comply with types */

  const recurringBookingService = getRecurringBookingService();
  const createdBookings: BookingResponse[] = await recurringBookingService.createBooking({
    bookingData: req.body,
    bookingMeta: {
      userId: session?.user?.id || -1,
      platformClientId: req.platformClientId,
      platformCancelUrl: req.platformCancelUrl,
      platformBookingUrl: req.platformBookingUrl,
      platformRescheduleUrl: req.platformRescheduleUrl,
      platformBookingLocation: req.platformBookingLocation,
      noEmail: req.noEmail,
    },
    creationSource: "WEBAPP",
  });

  return createdBookings;
}

export const handleRecurringEventBooking = handler;

export default defaultResponder(handler);
