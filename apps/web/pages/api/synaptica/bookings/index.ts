import type { NextApiRequest, NextApiResponse } from "next";

import { HttpError } from "@calcom/lib/http-error";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { prisma } from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/enums";

import { assertSynapticaSecret } from "@lib/synaptica/auth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  await assertSynapticaSecret(req);

  const userId = Number(req.query.userId);
  if (!req.query.userId || Number.isNaN(userId)) {
    throw new HttpError({ statusCode: 400, message: "userId is required (number)" });
  }

  const status = typeof req.query.status === "string" ? req.query.status : "upcoming";
  const take = Math.min(Number(req.query.take ?? 50) || 50, 100);
  const now = new Date();

  const where =
    status === "past"
      ? {
          userId,
          OR: [
            { startTime: { lt: now } },
            { status: { in: [BookingStatus.CANCELLED, BookingStatus.REJECTED] } },
          ],
        }
      : {
          userId,
          startTime: { gte: now },
          status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REJECTED] },
        };

  const bookings = await prisma.booking.findMany({
    where,
    select: {
      id: true,
      uid: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      eventTypeId: true,
      attendees: {
        select: { name: true, email: true, timeZone: true },
        orderBy: { id: "asc" },
        take: 5,
      },
    },
    orderBy: { startTime: status === "past" ? "desc" : "asc" },
    take,
  });

  return res.status(200).json({
    bookings: bookings.map((b) => ({
      id: b.id,
      uid: b.uid,
      title: b.title,
      startTime: b.startTime.toISOString(),
      endTime: b.endTime.toISOString(),
      status: b.status,
      eventTypeId: b.eventTypeId,
      attendees: b.attendees,
    })),
  });
}

export default defaultResponder(handler, "/api/synaptica/bookings");
