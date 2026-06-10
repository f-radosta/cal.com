-- =====================================================================
-- Cal.com Test Seed (SQL)
-- Run with: psql $DATABASE_URL -f seed-test.sql
-- =====================================================================

-- Team: Trenéři Synaptica
INSERT INTO "Team" (id, name, slug, "createdAt", metadata)
VALUES (1, 'Trenéři Synaptica', 'treneri-synaptica', NOW(), '{}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

-- Users (idempotent by id)
INSERT INTO users (id, username, email, name, role, "emailVerified", created, locale, "timeZone", uuid)
VALUES
  (1, 'admin',    'dev+admin@synapticalearning.cz',    'Test Admin',    'ADMIN', NOW(), NOW(), 'en', 'Europe/Prague', gen_random_uuid()),
  (2, 'trainer1', 'dev+trainer1@synapticalearning.cz', 'Test Trainer 1', 'USER',  NOW(), NOW(), 'en', 'Europe/Prague', gen_random_uuid()),
  (3, 'trainer2', 'dev+trainer2@synapticalearning.cz', 'Test Trainer 2', 'USER',  NOW(), NOW(), 'en', 'Europe/Prague', gen_random_uuid()),
  (4, 'user1',    'dev+user1@synapticalearning.cz',    'Test User 1',    'USER',  NOW(), NOW(), 'en', 'Europe/Prague', gen_random_uuid()),
  (5, 'user2',    'dev+user2@synapticalearning.cz',    'Test User 2',    'USER',  NOW(), NOW(), 'en', 'Europe/Prague', gen_random_uuid())
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  role = EXCLUDED.role;

-- UserPassword (dummy hash — these users cannot login with this)
INSERT INTO "UserPassword" ("userId", hash)
VALUES
  (1, '$2a$10$testhashplaceholderforadmin'),
  (2, '$2a$10$testhashplaceholderfortrainer1'),
  (3, '$2a$10$testhashplaceholderfortrainer2'),
  (4, '$2a$10$testhashplaceholderforuser1'),
  (5, '$2a$10$testhashplaceholderforuser2')
ON CONFLICT ("userId") DO NOTHING;

-- Memberships
INSERT INTO "Membership" ("teamId", "userId", role, accepted, "createdAt")
VALUES
  (1, 1, 'OWNER',  true, NOW()),
  (1, 2, 'MEMBER', true, NOW()),
  (1, 3, 'MEMBER', true, NOW()),
  (1, 4, 'MEMBER', true, NOW()),
  (1, 5, 'MEMBER', true, NOW())
ON CONFLICT ("userId", "teamId") DO UPDATE SET role = EXCLUDED.role, accepted = true;

-- _user_eventtype junction (Prisma implicit many-to-many table)
INSERT INTO _user_eventtype ("A", "B")
SELECT DISTINCT et.id, u.id
FROM "EventType" et
JOIN users u ON (
  (et."teamId" = 1 AND u.id IN (1,2,3,4,5)) OR
  (et."userId" = u.id)
)
WHERE et.slug = 'neurofeedback'
ON CONFLICT DO NOTHING;

-- Schedules: delete old then recreate
DELETE FROM "Availability" WHERE "scheduleId" IN (
  SELECT id FROM "Schedule" WHERE "userId" IN (1,2,3)
);
DELETE FROM "Schedule" WHERE "userId" IN (1,2,3);

INSERT INTO "Schedule" ("userId", name, "timeZone")
VALUES
  (1, 'Working hours', 'Europe/Prague'),
  (2, 'Working hours', 'Europe/Prague'),
  (3, 'Working hours', 'Europe/Prague')
RETURNING id;

-- Availabilities: Mon–Fri 09:00–17:00 (stored as TIME without timezone)
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN SELECT id, "userId" FROM "Schedule" WHERE name = 'Working hours' AND "timeZone" = 'Europe/Prague' LOOP
    INSERT INTO "Availability" ("scheduleId", "userId", days, "startTime", "endTime")
    VALUES (s.id, s."userId", ARRAY[1,2,3,4,5], '08:00:00'::time, '16:00:00'::time)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Event types (using dollar-quoted JSON to avoid escaping hell)
DO $$
DECLARE
  parent_id INT;
  locations_json CONSTANT jsonb := '[{"type":"inPerson","address":"Praha, 123","displayLocationPublicly":true}]';
  meta_json CONSTANT jsonb := '{"managedEventConfig":{"unlockedFields":{"locations":true,"scheduleId":true,"destinationCalendar":true}},"cancelNoticeAttendee":60,"cancelNoticeOrganizer":60}';
  bf_json CONSTANT jsonb := '[{"name":"name","type":"name","label":"","sources":[{"id":"default","type":"default","label":"Default"}],"editable":"system","required":true,"placeholder":"","defaultLabel":"your_name","variantsConfig":{"variants":{"fullName":{"fields":[{"name":"fullName","type":"text","label":"","required":true,"placeholder":""}]},"firstAndLastName":{"fields":[{"name":"firstName","type":"text","required":true},{"name":"lastName","type":"text","required":false}]}}},"disableOnPrefill":true},{"name":"email","type":"email","label":"","sources":[{"id":"default","type":"default","label":"Default"}],"editable":"system-but-optional","required":true,"placeholder":"","defaultLabel":"email_address","disableOnPrefill":true},{"name":"attendeePhoneNumber","type":"phone","label":"Telefonní číslo","hidden":false,"sources":[{"id":"default","type":"default","label":"Default"}],"editable":"system-but-optional","required":true,"placeholder":"+420 123 456 789","defaultLabel":"phone_number","disableOnPrefill":false},{"name":"location","type":"radioInput","sources":[{"id":"default","type":"default","label":"Default"}],"editable":"system","required":false,"defaultLabel":"location","getOptionsAt":"locations","optionsInputs":{"phone":{"type":"phone","required":true,"placeholder":""},"somewhereElse":{"type":"text","required":true,"placeholder":""},"attendeeInPerson":{"type":"address","required":true,"placeholder":""}},"hideWhenJustOneOption":true},{"name":"title","type":"text","label":"","hidden":true,"sources":[{"id":"default","type":"default","label":"Default"}],"editable":"system-but-optional","required":false,"placeholder":"","defaultLabel":"what_is_this_meeting_about","disableOnPrefill":false,"defaultPlaceholder":""},{"name":"notes","type":"textarea","label":"Poznámky","sources":[{"id":"default","type":"default","label":"Default"}],"editable":"system-but-optional","required":false,"maxLength":1000,"minLength":0,"placeholder":"Sdělte co máte na srdci","defaultLabel":"additional_notes","disableOnPrefill":true,"defaultPlaceholder":"share_additional_notes"},{"name":"guests","type":"multiemail","hidden":true,"sources":[{"id":"default","type":"default","label":"Default"}],"editable":"system-but-optional","required":false,"defaultLabel":"additional_guests","defaultPlaceholder":"email"},{"name":"rescheduleReason","type":"textarea","label":"Důvod pro změnu termínu","views":[{"id":"reschedule","label":"Reschedule View"}],"hidden":true,"sources":[{"id":"default","type":"default","label":"Default"}],"editable":"system-but-optional","required":false,"maxLength":1000,"minLength":0,"placeholder":"","defaultLabel":"reason_for_reschedule","disableOnPrefill":false,"defaultPlaceholder":"reschedule_placeholder"}]';
BEGIN
  -- Parent team-managed event type
  SELECT id INTO parent_id FROM "EventType" WHERE slug = 'neurofeedback' AND "teamId" = 1 AND "parentId" IS NULL;

  IF parent_id IS NULL THEN
    INSERT INTO "EventType" (
      slug, title, description, length, locations, "requiresConfirmation",
      "minimumBookingNotice", currency, price, "disableGuests", hidden,
      "afterEventBuffer", "beforeEventBuffer", "hideCalendarNotes",
      "lockTimeZoneToggleOnBookingPage", "lockedTimeZone",
      "seatsShowAttendees", "seatsShowAvailabilityCount",
      "assignAllTeamMembers", "successRedirectUrl",
      "schedulingType", "teamId",
      metadata, "bookingFields", "interfaceLanguage"
    ) VALUES (
      'neurofeedback', 'Neurofeedback terapie', 'Popis události.', 60,
      locations_json, true, 2880, 'usd', 0, true, true,
      0, 0, false, true, 'Europe/Prague',
      false, true, true, '', 'managed', 1,
      meta_json, bf_json, 'cs'
    )
    RETURNING id INTO parent_id;
  END IF;

  -- Child event type for trainer1
  PERFORM 1 FROM "EventType" WHERE slug = 'neurofeedback' AND "userId" = 2 AND "parentId" = parent_id;
  IF NOT FOUND THEN
    INSERT INTO "EventType" (
      slug, title, description, length, locations, "requiresConfirmation",
      "minimumBookingNotice", currency, price, "disableGuests", hidden,
      "afterEventBuffer", "beforeEventBuffer", "hideCalendarNotes",
      "lockTimeZoneToggleOnBookingPage", "lockedTimeZone",
      "seatsShowAttendees", "seatsShowAvailabilityCount",
      "assignAllTeamMembers", "successRedirectUrl",
      "userId", "parentId",
      metadata, "bookingFields", "interfaceLanguage"
    ) VALUES (
      'neurofeedback', 'Neurofeedback terapie', 'Popis události.', 60,
      locations_json, true, 2880, 'usd', 0, true, true,
      0, 0, false, true, 'Europe/Prague',
      false, true, true, '', 2, parent_id,
      meta_json, bf_json, 'cs'
    );
  END IF;

  -- Child event type for trainer2
  PERFORM 1 FROM "EventType" WHERE slug = 'neurofeedback' AND "userId" = 3 AND "parentId" = parent_id;
  IF NOT FOUND THEN
    INSERT INTO "EventType" (
      slug, title, description, length, locations, "requiresConfirmation",
      "minimumBookingNotice", currency, price, "disableGuests", hidden,
      "afterEventBuffer", "beforeEventBuffer", "hideCalendarNotes",
      "lockTimeZoneToggleOnBookingPage", "lockedTimeZone",
      "seatsShowAttendees", "seatsShowAvailabilityCount",
      "assignAllTeamMembers", "successRedirectUrl",
      "userId", "parentId",
      metadata, "bookingFields", "interfaceLanguage"
    ) VALUES (
      'neurofeedback', 'Neurofeedback terapie', 'Popis události.', 60,
      locations_json, true, 2880, 'usd', 0, true, true,
      0, 0, false, true, 'Europe/Prague',
      false, true, true, '', 3, parent_id,
      meta_json, bf_json, 'cs'
    );
  END IF;
END $$;

-- Verify
SELECT 'users'          as entity, count(*) as cnt FROM users
UNION ALL SELECT 'teams',        count(*) FROM "Team"
UNION ALL SELECT 'memberships',  count(*) FROM "Membership"
UNION ALL SELECT 'schedules',    count(*) FROM "Schedule"
UNION ALL SELECT 'availabilities', count(*) FROM "Availability"
UNION ALL SELECT 'eventTypes',   count(*) FROM "EventType";
