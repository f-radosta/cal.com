/**
 * Cal.com Test Seed Script
 *
 * Creates the minimal canonical test state for E2E:
 * - Team "Trenéři Synaptica"
 * - 5 test users (admin, 2 trainers, 2 regular users)
 * - Team-managed event type "neurofeedback" (60 min, in-person, Praha)
 * - Child event types per trainer
 * - Default schedules Mon–Fri 09:00–17:00 Europe/Prague
 *
 * Run with: DATABASE_URL=<calcom-db> npx tsx scripts/seed-test.ts
 */

import { PrismaClient, SchedulingType, UserPermissionRole, MembershipRole } from "@prisma/client";

const prisma = new PrismaClient();

/* ------------------------------------------------------------------ */
// Config
/* ------------------------------------------------------------------ */

const TEAM_CONFIG = {
  name: "Trenéři Synaptica",
  slug: "treneri-synaptica",
  metadata: {},
};

const USERS: Array<{
  username: string;
  email: string;
  name: string;
  role: UserPermissionRole;
}> = [
  { username: "admin",    email: "dev+admin@synapticalearning.cz",    name: "Test Admin",    role: UserPermissionRole.ADMIN },
  { username: "trainer1", email: "dev+trainer1@synapticalearning.cz", name: "Test Trainer 1", role: UserPermissionRole.USER },
  { username: "trainer2", email: "dev+trainer2@synapticalearning.cz", name: "Test Trainer 2", role: UserPermissionRole.USER },
  { username: "user1",    email: "dev+user1@synapticalearning.cz",    name: "Test User 1",   role: UserPermissionRole.USER },
  { username: "user2",    email: "dev+user2@synapticalearning.cz",    name: "Test User 2",   role: UserPermissionRole.USER },
];

const DEFAULT_SCHEDULE = {
  name: "Working hours",
  timeZone: "Europe/Prague",
  availability: [
    // Mon–Fri 09:00–17:00 UTC → Prague is +1/+2, but Cal.com stores raw UTC times
    // 08:00 UTC = 09:00 CET / 10:00 CEST
    { days: [1, 2, 3, 4, 5], startTime: new Date("1970-01-01T08:00:00.000Z"), endTime: new Date("1970-01-01T16:00:00.000Z") },
  ],
};

/* ------------------------------------------------------------------ */
// Helpers
/* ------------------------------------------------------------------ */

async function upsertUser(data: (typeof USERS)[number]) {
  const user = await prisma.user.upsert({
    where: { email: data.email },
    update: {
      username: data.username,
      name: data.name,
      role: data.role,
      emailVerified: new Date(),
    },
    create: {
      username: data.username,
      email: data.email,
      name: data.name,
      role: data.role,
      emailVerified: new Date(),
      locale: "en",
    },
  });
  console.log(`👤 ${data.username}: ${user.email} (id=${user.id})`);
  return user;
}

async function getOrCreateTeam() {
  let team = await prisma.team.findFirst({ where: { slug: TEAM_CONFIG.slug } });
  if (!team) {
    team = await prisma.team.create({ data: TEAM_CONFIG });
    console.log(`🏢 Created team: ${team.name} (id=${team.id})`);
  } else {
    console.log(`🏢 Team already exists: ${team.name} (id=${team.id})`);
  }
  return team;
}

async function ensureMembership(teamId: number, userId: number, role: MembershipRole) {
  await prisma.membership.upsert({
    where: { userId_teamId: { userId, teamId } },
    update: { role, accepted: true },
    create: { userId, teamId, role, accepted: true },
  });
}

async function recreateSchedule(userId: number) {
  // Remove old schedules + availabilities for clean slate
  const existing = await prisma.schedule.findMany({ where: { userId } });
  for (const s of existing) {
    await prisma.availability.deleteMany({ where: { scheduleId: s.id } });
    await prisma.schedule.delete({ where: { id: s.id } });
  }

  const schedule = await prisma.schedule.create({
    data: {
      userId,
      name: DEFAULT_SCHEDULE.name,
      timeZone: DEFAULT_SCHEDULE.timeZone,
      availability: {
        createMany: {
          data: DEFAULT_SCHEDULE.availability,
        },
      },
    },
  });
  console.log(`📅 Schedule for user ${userId}: ${schedule.name} (id=${schedule.id})`);
  return schedule;
}

/* ------------------------------------------------------------------ */
// Main
/* ------------------------------------------------------------------ */

async function main() {
  console.log("🌱 Seeding Cal.com test data…");

  const team = await getOrCreateTeam();

  const users = await Promise.all(USERS.map((u) => upsertUser(u)));
  const trainers = users.filter((u) => u.username.startsWith("trainer"));
  const adminUser = users.find((u) => u.username === "admin")!;

  // Memberships
  for (const user of users) {
    const role = user.username === "admin" ? MembershipRole.OWNER : MembershipRole.MEMBER;
    await ensureMembership(team.id, user.id, role);
  }

  // Schedules for trainers + admin
  for (const user of [...trainers, adminUser]) {
    await recreateSchedule(user.id);
  }

  // --- Parent (team-managed) event type ---
  let parentEventType = await prisma.eventType.findFirst({
    where: { slug: "neurofeedback", teamId: team.id, parentId: null },
  });

  if (!parentEventType) {
    parentEventType = await prisma.eventType.create({
      data: {
        slug: "neurofeedback",
        title: "Neurofeedback terapie",
        description: "Popis události.",
        length: 60,
        locations: [{ type: "inPerson", address: "Praha, 123", displayLocationPublicly: true }],
        requiresConfirmation: true,
        minimumBookingNotice: 2880,
        currency: "usd",
        price: 0,
        disableGuests: true,
        hidden: true,
        afterEventBuffer: 0,
        beforeEventBuffer: 0,
        hideCalendarNotes: false,
        lockTimeZoneToggleOnBookingPage: true,
        lockedTimeZone: "Europe/Prague",
        seatsShowAttendees: false,
        seatsShowAvailabilityCount: true,
        assignAllTeamMembers: true,
        successRedirectUrl: "",
        schedulingType: SchedulingType.MANAGED,
        teamId: team.id,
        users: { connect: users.map((u) => ({ id: u.id })) },
        metadata: {
          managedEventConfig: {
            unlockedFields: { locations: true, scheduleId: true, destinationCalendar: true },
          },
          cancelNoticeAttendee: 60,
          cancelNoticeOrganizer: 60,
        },
        bookingFields: [
          { name: "name", type: "name", label: "", sources: [{ id: "default", type: "default", label: "Default" }], editable: "system", required: true, placeholder: "", defaultLabel: "your_name", variantsConfig: { variants: { fullName: { fields: [{ name: "fullName", type: "text", label: "", required: true, placeholder: "" }] }, firstAndLastName: { fields: [{ name: "firstName", type: "text", required: true }, { name: "lastName", type: "text", required: false }] } } }, disableOnPrefill: true },
          { name: "email", type: "email", label: "", sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: true, placeholder: "", defaultLabel: "email_address", disableOnPrefill: true },
          { name: "attendeePhoneNumber", type: "phone", label: "Telefonní číslo", hidden: false, sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: true, placeholder: "+420 123 456 789", defaultLabel: "phone_number", disableOnPrefill: false },
          { name: "location", type: "radioInput", sources: [{ id: "default", type: "default", label: "Default" }], editable: "system", required: false, defaultLabel: "location", getOptionsAt: "locations", optionsInputs: { phone: { type: "phone", required: true, placeholder: "" }, somewhereElse: { type: "text", required: true, placeholder: "" }, attendeeInPerson: { type: "address", required: true, placeholder: "" } }, hideWhenJustOneOption: true },
          { name: "title", type: "text", label: "", hidden: true, sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: false, placeholder: "", defaultLabel: "what_is_this_meeting_about", disableOnPrefill: false, defaultPlaceholder: "" },
          { name: "notes", type: "textarea", label: "Poznámky", sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: false, maxLength: 1000, minLength: 0, placeholder: "Sdělte co máte na srdci", defaultLabel: "additional_notes", disableOnPrefill: true, defaultPlaceholder: "share_additional_notes" },
          { name: "guests", type: "multiemail", hidden: true, sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: false, defaultLabel: "additional_guests", defaultPlaceholder: "email" },
          { name: "rescheduleReason", type: "textarea", label: "Důvod pro změnu termínu", views: [{ id: "reschedule", label: "Reschedule View" }], hidden: true, sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: false, maxLength: 1000, minLength: 0, placeholder: "", defaultLabel: "reason_for_reschedule", disableOnPrefill: false, defaultPlaceholder: "reschedule_placeholder" },
        ],
        interfaceLanguage: "cs",
      },
    });
    console.log(`📆 Parent event type: ${parentEventType.slug} (id=${parentEventType.id})`);
  } else {
    console.log(`📆 Parent event type already exists: ${parentEventType.slug} (id=${parentEventType.id})`);
  }

  // --- Child event types per trainer ---
  for (const trainer of trainers) {
    const existingChild = await prisma.eventType.findFirst({
      where: { slug: "neurofeedback", userId: trainer.id, parentId: parentEventType.id },
    });

    if (!existingChild) {
      const child = await prisma.eventType.create({
        data: {
          slug: "neurofeedback",
          title: "Neurofeedback terapie",
          description: "Popis události.",
          length: 60,
          locations: [{ type: "inPerson", address: "Praha, 123", displayLocationPublicly: true }],
          requiresConfirmation: true,
          minimumBookingNotice: 2880,
          currency: "usd",
          price: 0,
          disableGuests: true,
          hidden: true,
          afterEventBuffer: 0,
          beforeEventBuffer: 0,
          hideCalendarNotes: false,
          lockTimeZoneToggleOnBookingPage: true,
          lockedTimeZone: "Europe/Prague",
          seatsShowAttendees: false,
          seatsShowAvailabilityCount: true,
          assignAllTeamMembers: true,
          successRedirectUrl: "",
          userId: trainer.id,
          parentId: parentEventType.id,
          users: { connect: { id: trainer.id } },
          metadata: {
            managedEventConfig: {
              unlockedFields: { locations: true, scheduleId: true, destinationCalendar: true },
            },
            cancelNoticeAttendee: 60,
            cancelNoticeOrganizer: 60,
          },
          bookingFields: [
            { name: "name", type: "name", label: "", sources: [{ id: "default", type: "default", label: "Default" }], editable: "system", required: true, placeholder: "", defaultLabel: "your_name", variantsConfig: { variants: { fullName: { fields: [{ name: "fullName", type: "text", label: "", required: true, placeholder: "" }] }, firstAndLastName: { fields: [{ name: "firstName", type: "text", required: true }, { name: "lastName", type: "text", required: false }] } } }, disableOnPrefill: true },
            { name: "email", type: "email", label: "", sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: true, placeholder: "", defaultLabel: "email_address", disableOnPrefill: true },
            { name: "attendeePhoneNumber", type: "phone", label: "Telefonní číslo", hidden: false, sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: true, placeholder: "+420 123 456 789", defaultLabel: "phone_number", disableOnPrefill: false },
            { name: "location", type: "radioInput", sources: [{ id: "default", type: "default", label: "Default" }], editable: "system", required: false, defaultLabel: "location", getOptionsAt: "locations", optionsInputs: { phone: { type: "phone", required: true, placeholder: "" }, somewhereElse: { type: "text", required: true, placeholder: "" }, attendeeInPerson: { type: "address", required: true, placeholder: "" } }, hideWhenJustOneOption: true },
            { name: "title", type: "text", label: "", hidden: true, sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: false, placeholder: "", defaultLabel: "what_is_this_meeting_about", disableOnPrefill: false, defaultPlaceholder: "" },
            { name: "notes", type: "textarea", label: "Poznámky", sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: false, maxLength: 1000, minLength: 0, placeholder: "Sdělte co máte na srdci", defaultLabel: "additional_notes", disableOnPrefill: true, defaultPlaceholder: "share_additional_notes" },
            { name: "guests", type: "multiemail", hidden: true, sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: false, defaultLabel: "additional_guests", defaultPlaceholder: "email" },
            { name: "rescheduleReason", type: "textarea", label: "Důvod pro změnu termínu", views: [{ id: "reschedule", label: "Reschedule View" }], hidden: true, sources: [{ id: "default", type: "default", label: "Default" }], editable: "system-but-optional", required: false, maxLength: 1000, minLength: 0, placeholder: "", defaultLabel: "reason_for_reschedule", disableOnPrefill: false, defaultPlaceholder: "reschedule_placeholder" },
          ],
          interfaceLanguage: "cs",
        },
      });
      console.log(`\t└─ Child event type for ${trainer.username}: ${child.slug} (id=${child.id})`);
    } else {
      console.log(`\t└─ Child event type for ${trainer.username} already exists (id=${existingChild.id})`);
    }
  }

  console.log("✅ Cal.com seed complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
