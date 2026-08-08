import type { NextApiRequest, NextApiResponse } from "next";

import { DEFAULT_SCHEDULE, getAvailabilityFromSchedule } from "@calcom/lib/availability";
import { HttpError } from "@calcom/lib/http-error";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { slugify } from "@calcom/lib/slugify";
import { prisma } from "@calcom/prisma";
import { CreationSource, MembershipRole } from "@calcom/prisma/enums";

import { assertSynapticaSecret } from "@lib/synaptica/auth";

const DEFAULT_TEAM_ID = 1;
const EVENT_SLUG = "neurofeedback";
const EVENT_TITLE = "Neurofeedback terapie";
const TIME_ZONE = "Europe/Prague";

async function uniqueUsername(base: string): Promise<string> {
  const root = slugify(base).slice(0, 20) || "trainer";
  let candidate = root;
  let n = 0;
  while (await prisma.user.findFirst({ where: { username: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${root}${n}`;
  }
  return candidate;
}

async function ensureMembership(userId: number, teamId: number) {
  const existing = await prisma.membership.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { userId: true, accepted: true },
  });
  if (existing) {
    if (!existing.accepted) {
      await prisma.membership.update({
        where: { userId_teamId: { userId, teamId } },
        data: { accepted: true },
      });
    }
    return;
  }
  await prisma.membership.create({
    data: {
      userId,
      teamId,
      role: MembershipRole.MEMBER,
      accepted: true,
    },
  });
}

async function ensureDefaultSchedule(userId: number): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultScheduleId: true, timeZone: true },
  });
  if (user?.defaultScheduleId) return user.defaultScheduleId;

  const existing = await prisma.schedule.findFirst({
    where: { userId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: userId },
      data: { defaultScheduleId: existing.id },
    });
    return existing.id;
  }

  const availability = getAvailabilityFromSchedule(DEFAULT_SCHEDULE);
  const schedule = await prisma.schedule.create({
    data: {
      name: "Pracovní doba",
      userId,
      timeZone: user?.timeZone || TIME_ZONE,
      availability: {
        createMany: {
          data: availability.map((slot) => ({
            days: slot.days,
            startTime: slot.startTime,
            endTime: slot.endTime,
          })),
        },
      },
    },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { defaultScheduleId: schedule.id },
  });
  return schedule.id;
}

async function ensureEventType(userId: number, scheduleId: number): Promise<number> {
  const existing = await prisma.eventType.findFirst({
    where: { userId, slug: EVENT_SLUG },
    select: { id: true },
  });
  if (existing) {
    await prisma.eventType.update({
      where: { id: existing.id },
      data: {
        hidden: true,
        scheduleId,
        users: { connect: { id: userId } },
      },
    });
    return existing.id;
  }

  const created = await prisma.eventType.create({
    data: {
      title: EVENT_TITLE,
      slug: EVENT_SLUG,
      length: 60,
      hidden: true,
      userId,
      scheduleId,
      owner: { connect: { id: userId } },
      users: { connect: { id: userId } },
    },
  });
  return created.id;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  await assertSynapticaSecret(req);

  const emailRaw = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const usernameHint =
    typeof req.body?.username === "string" ? req.body.username.trim() : name || emailRaw.split("@")[0];
  const teamId = Number(req.body?.teamId ?? DEFAULT_TEAM_ID) || DEFAULT_TEAM_ID;

  if (!emailRaw || !emailRaw.includes("@")) {
    throw new HttpError({ statusCode: 400, message: "email is required" });
  }

  let user = await prisma.user.findUnique({
    where: { email: emailRaw },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      defaultScheduleId: true,
    },
  });

  if (!user) {
    const username = await uniqueUsername(usernameHint);
    const availability = getAvailabilityFromSchedule(DEFAULT_SCHEDULE);
    user = await prisma.user.create({
      data: {
        email: emailRaw,
        username,
        name: name || username,
        verified: true,
        completedOnboarding: true,
        timeZone: TIME_ZONE,
        locale: "cs",
        weekStart: "Monday",
        hideBranding: true,
        creationSource: CreationSource.API_V1,
        invitedTo: teamId,
        teams: {
          create: {
            teamId,
            role: MembershipRole.MEMBER,
            accepted: true,
          },
        },
        schedules: {
          create: {
            name: "Pracovní doba",
            timeZone: TIME_ZONE,
            availability: {
              createMany: {
                data: availability.map((slot) => ({
                  days: slot.days,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                })),
              },
            },
          },
        },
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        defaultScheduleId: true,
      },
    });

    const schedule = await prisma.schedule.findFirst({
      where: { userId: user.id },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    if (schedule) {
      await prisma.user.update({
        where: { id: user.id },
        data: { defaultScheduleId: schedule.id },
      });
      user = { ...user, defaultScheduleId: schedule.id };
    }
  } else {
    const username = user.username || (await uniqueUsername(usernameHint));
    await prisma.user.update({
      where: { id: user.id },
      data: {
        username,
        name: name || user.name || username,
        verified: true,
        completedOnboarding: true,
        timeZone: TIME_ZONE,
        locale: "cs",
        weekStart: "Monday",
        hideBranding: true,
      },
    });
    user = { ...user, username };
    await ensureMembership(user.id, teamId);
  }

  const scheduleId = await ensureDefaultSchedule(user.id);
  const eventTypeId = await ensureEventType(user.id, scheduleId);

  const refreshed = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, username: true, email: true, name: true },
  });

  return res.status(200).json({
    message: "Trainer provisioned",
    userId: refreshed!.id,
    username: refreshed!.username,
    email: refreshed!.email,
    name: refreshed!.name,
    eventTypeId,
    scheduleId,
  });
}

export default defaultResponder(handler, "/api/synaptica/provision-trainer");
