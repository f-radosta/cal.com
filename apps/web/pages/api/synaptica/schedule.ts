import type { NextApiRequest, NextApiResponse } from "next";

import { HttpError } from "@calcom/lib/http-error";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { prisma } from "@calcom/prisma";
import { updateSchedule } from "@calcom/features/schedules/services/ScheduleService";
import type { Schedule, TimeRange } from "@calcom/types/schedule";

import { assertSynapticaSecret } from "@lib/synaptica/auth";

type AvailabilitySlot = {
  days: number[];
  startTime: string; // HH:mm (UTC wall clock as stored by Cal)
  endTime: string;
};

function parseHm(hm: string): { hours: number; minutes: number } {
  const [h, m] = hm.split(":").map((x) => Number(x));
  if (Number.isNaN(h) || Number.isNaN(m)) {
    throw new HttpError({ statusCode: 400, message: `Invalid time: ${hm}` });
  }
  return { hours: h, minutes: m };
}

function hmFromDate(d: Date): string {
  const hours = d.getUTCHours().toString().padStart(2, "0");
  const minutes = d.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function dateFromHm(hm: string): Date {
  const { hours, minutes } = parseHm(hm);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}

function availabilityToSchedule(slots: AvailabilitySlot[]): Schedule {
  const schedule: Schedule = [[], [], [], [], [], [], []];
  for (const slot of slots) {
    const range: TimeRange = {
      start: dateFromHm(slot.startTime),
      end: dateFromHm(slot.endTime),
    };
    for (const day of slot.days) {
      if (day < 0 || day > 6) continue;
      schedule[day].push(range);
    }
  }
  return schedule;
}

async function readSchedule(userId: number, scheduleIdHint?: number | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, defaultScheduleId: true, timeZone: true },
  });
  if (!user) {
    throw new HttpError({ statusCode: 404, message: "User not found" });
  }

  const scheduleId = scheduleIdHint || user.defaultScheduleId;
  if (!scheduleId) {
    throw new HttpError({ statusCode: 404, message: "No schedule found" });
  }

  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, userId },
    select: {
      id: true,
      name: true,
      timeZone: true,
      availability: {
        select: { days: true, startTime: true, endTime: true, date: true },
      },
    },
  });
  if (!schedule) {
    throw new HttpError({ statusCode: 404, message: "Schedule not found" });
  }

  const availability: AvailabilitySlot[] = schedule.availability
    .filter((a) => !a.date && a.days.length > 0)
    .map((a) => ({
      days: a.days,
      startTime: hmFromDate(a.startTime),
      endTime: hmFromDate(a.endTime),
    }));

  return {
    scheduleId: schedule.id,
    name: schedule.name,
    timeZone: schedule.timeZone || user.timeZone,
    isDefault: user.defaultScheduleId === schedule.id,
    availability,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    await assertSynapticaSecret(req);
    const userId = Number(req.query.userId);
    if (!req.query.userId || Number.isNaN(userId)) {
      throw new HttpError({ statusCode: 400, message: "userId is required (number)" });
    }
    const scheduleId =
      typeof req.query.scheduleId === "string" ? Number(req.query.scheduleId) : null;
    return res.status(200).json(await readSchedule(userId, scheduleId));
  }

  if (req.method === "PUT") {
    await assertSynapticaSecret(req);
    const userId = Number(req.body?.userId ?? req.query.userId);
    if (!userId || Number.isNaN(userId)) {
      throw new HttpError({ statusCode: 400, message: "userId is required (number)" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, defaultScheduleId: true, timeZone: true },
    });
    if (!user) {
      throw new HttpError({ statusCode: 404, message: "User not found" });
    }

    const scheduleId = Number(req.body?.scheduleId ?? user.defaultScheduleId);
    if (!scheduleId || Number.isNaN(scheduleId)) {
      throw new HttpError({ statusCode: 400, message: "scheduleId is required" });
    }

    const owned = await prisma.schedule.findFirst({
      where: { id: scheduleId, userId },
      select: { id: true, name: true },
    });
    if (!owned) {
      throw new HttpError({ statusCode: 404, message: "Schedule not found" });
    }

    const slots = Array.isArray(req.body?.availability)
      ? (req.body.availability as AvailabilitySlot[])
      : null;
    if (!slots) {
      throw new HttpError({ statusCode: 400, message: "availability array is required" });
    }

    const name =
      typeof req.body?.name === "string" && req.body.name.trim()
        ? req.body.name.trim()
        : owned.name || "Pracovní doba";
    const timeZone =
      typeof req.body?.timeZone === "string" && req.body.timeZone.trim()
        ? req.body.timeZone.trim()
        : user.timeZone;

    await updateSchedule({
      input: {
        scheduleId,
        name,
        timeZone,
        isDefault: true,
        schedule: availabilityToSchedule(slots),
      },
      user: {
        id: user.id,
        defaultScheduleId: user.defaultScheduleId,
        timeZone: user.timeZone,
      },
      prisma,
    });

    if (timeZone && timeZone !== user.timeZone) {
      await prisma.user.update({ where: { id: userId }, data: { timeZone } });
    }

    return res.status(200).json(await readSchedule(userId, scheduleId));
  }

  return res.status(405).json({ message: "Method not allowed" });
}

export default defaultResponder(handler, "/api/synaptica/schedule");
