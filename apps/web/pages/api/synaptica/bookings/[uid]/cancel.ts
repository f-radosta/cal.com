import type { NextApiRequest, NextApiResponse } from "next";

import handleCancelBooking from "@calcom/features/bookings/lib/handleCancelBooking";
import { HttpError } from "@calcom/lib/http-error";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { prisma } from "@calcom/prisma";

import { assertSynapticaSecret } from "@lib/synaptica/auth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  await assertSynapticaSecret(req);

  const uid = typeof req.query.uid === "string" ? req.query.uid : "";
  if (!uid) {
    throw new HttpError({ statusCode: 400, message: "uid is required" });
  }

  const userId = Number(req.body?.userId ?? req.query.userId);
  if (!userId || Number.isNaN(userId)) {
    throw new HttpError({ statusCode: 400, message: "userId is required (number)" });
  }

  const booking = await prisma.booking.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      userId: true,
      status: true,
      user: { select: { email: true } },
    },
  });

  if (!booking || booking.userId !== userId) {
    throw new HttpError({ statusCode: 404, message: "Booking not found" });
  }

  const reason =
    typeof req.body?.cancellationReason === "string" && req.body.cancellationReason.trim()
      ? req.body.cancellationReason.trim()
      : "Zrušeno trenérem přes Synaptica";

  const result = await handleCancelBooking({
    userId,
    actionSource: "API_V1",
    impersonatedByUserUuid: null,
    bookingData: {
      uid: booking.uid,
      cancellationReason: reason,
      cancelledBy: booking.user?.email,
      skipCancellationReasonValidation: true,
    },
  });

  return res.status(200).json({
    message: "Booking cancelled",
    uid: booking.uid,
    result,
  });
}

export default defaultResponder(handler, "/api/synaptica/bookings/[uid]/cancel");
