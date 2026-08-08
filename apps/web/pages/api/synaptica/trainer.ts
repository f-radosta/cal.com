import type { NextApiRequest, NextApiResponse } from "next";

import { HttpError } from "@calcom/lib/http-error";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { prisma } from "@calcom/prisma";

import { assertSynapticaSecret } from "@lib/synaptica/auth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  await assertSynapticaSecret(req);

  const rawUserId = req.query.userId;
  const userId = Number(rawUserId);
  if (!rawUserId || Number.isNaN(userId)) {
    throw new HttpError({ statusCode: 400, message: "userId is required (number)" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      completedOnboarding: true,
      defaultScheduleId: true,
      timeZone: true,
    },
  });

  if (!user) {
    throw new HttpError({ statusCode: 404, message: "User not found" });
  }

  const [googleCredential, scheduleCount, eventType] = await Promise.all([
    prisma.credential.findFirst({
      where: { userId, type: "google_calendar" },
      select: { id: true },
    }),
    prisma.schedule.count({ where: { userId } }),
    prisma.eventType.findFirst({
      where: { userId, slug: "neurofeedback" },
      select: { id: true, hidden: true },
    }),
  ]);

  return res.status(200).json({
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    completedOnboarding: user.completedOnboarding,
    hasGoogleCalendar: Boolean(googleCredential),
    hasSchedule: scheduleCount > 0 && Boolean(user.defaultScheduleId),
    defaultScheduleId: user.defaultScheduleId,
    timeZone: user.timeZone,
    eventTypeId: eventType?.id ?? null,
  });
}

export default defaultResponder(handler, "/api/synaptica/trainer");
