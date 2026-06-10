# Synaptica Cal.com Fork — Change Log

This file tracks all customizations made in the [f-radosta/cal.com](https://github.com/f-radosta/cal.com) fork relative to upstream [calcom/cal.com](https://github.com/calcom/cal.com).

---

## 1. Gate booking API endpoints with shared secret

**Files changed:**
- `apps/web/pages/api/book/event.ts`
- `apps/web/pages/api/book/recurring-event.ts`
- `apps/web/pages/api/book/instant-event.ts`

**What:** Each booking endpoint checks for a `x-synaptica-secret` header. If the `SYNAPTICA_API_SECRET` env var is set and the header doesn't match, the request is rejected with 401. When `SYNAPTICA_API_SECRET` is not set, the check is bypassed (dev mode).

**Exception (2026-05-17):** The secret check is skipped when `req.body.rescheduleUid` is present — reschedule requests from the Cal.com booking page are allowed through. The backend validates the reschedule UID belongs to a real booking, so an attacker with a fake UID gets an error, and an attacker with a valid UID can only reschedule their own booking.

**Why:** Prevents unauthorized direct calls to the booking API. Only our n8n workflows (which know the secret) can create new bookings. The Cal.com upstream has no auth on these endpoints by design.

**Env var:** `SYNAPTICA_API_SECRET` — set in Railway. Any random string works; it's compared as a plain equality check, not a hash. n8n workflows must send the matching value in the `x-synaptica-secret` HTTP header.

**Fallback (2026-06-10):** Because Railway intermittently fails to inject `SYNAPTICA_API_SECRET` into the Docker runtime (confirmed by runtime inspection showing the env var missing while `DATABASE_URL` is present), the endpoints also read `synapticaApiSecretHash` from the `Deployment` table (single-row config table). If the env var is absent, the SHA-256 hash of the incoming `x-synaptica-secret` header is compared against the DB value. If neither the env var nor the DB hash is set, the check is bypassed (dev/PR mode).

---

## 2. Return 404 for hidden event types on public booking pages

**Files changed:**
- `apps/web/app/(booking-page-wrapper)/[user]/[type]/page.tsx`
- `apps/web/app/(booking-page-wrapper)/team/[slug]/[type]/page.tsx`
- `apps/web/app/(booking-page-wrapper)/org/[orgSlug]/[user]/[type]/page.tsx`

**What:** If `eventData.hidden` is `true` and `props.booking` is not set (no reschedule or seated booking in progress), the page calls `notFound()` from `next/navigation`, returning a proper 404 instead of rendering the booking page.

**Exception (2026-05-17):** When `props.booking` is populated (reschedule UID was provided and a booking was found), the hidden check is skipped. This allows users to access the booking page to complete a reschedule even for hidden event types.

**Why:** Hidden event types should not be publicly accessible for new bookings. Upstream Cal.com still renders them. However, users with a valid reschedule link need access to the booking page to pick a new time slot.

---

## 3. Fix Google Calendar being disabled on every deploy

**Files changed:**
- `scripts/seed-app-store.ts`

**What:** The `createApp` function now preserves `enabled: true` for apps that already exist in the database, instead of recalculating the enabled state via `shouldEnableApp` on every run. **Updated 2026-06-09:** Also preserves `enabled=false` for existing apps (previously only `enabled=true` was preserved).

**Why:** `seed-app-store.ts` runs on every boot (via `start.sh`). The `shouldEnableApp` function was returning `false` for google-calendar even with valid keys, overwriting the manually-set `enabled: true` in the database. This forced a manual SQL fix after every deploy.

---

## 4. Skip TypeScript type-checking during build

**Files changed:**
- `apps/web/next.config.ts`

**What:** Added `typescript.ignoreBuildErrors = true` to the Next.js config.

**Why:** The full Cal.com codebase exceeds Railway's build-phase memory limit (~4GB) during the separate TypeScript verification pass. The actual compilation succeeds — only the post-build type-check OOMs. This is a resource constraint, not a code issue.

---

## 5. Client-side action disabling respects organizer notice periods + admin bypass

**Files changed:**
- `apps/web/components/booking/actions/bookingActions.ts`

**What (2026-05-17):** The `isActionDisabled` function now:

- **Organizer reschedule notice:** When the logged-in user is the booking organizer, the reschedule button is disabled if the booking is within `eventType.metadata.rescheduleNoticeOrganizer` minutes of start time (previously the button was never disabled for organizers).

- **Admin bypass:** When `!isAttendee && !isUserOrganizer` (i.e. an admin viewing someone else's booking), all notice period restrictions are skipped — Reschedule and Cancel buttons are always enabled (subject only to status/past-booking constraints). The server-side admin bypass in `handleCancelBooking.ts`, `determineReschedulePreventionRedirect.ts`, and `RegularBookingService.ts` already exists via `BookingAccessService.isUserAdminOfBooking()`.

**Why:** Before this change, trainers could click Reschedule in the table view even when within their notice period (getting a silent server redirect). Admins viewing others' bookings through `/bookings/admin` had Cancel/Reschedule buttons incorrectly disabled by attendee notice periods. Both components (`BookingListItem` and `BookingActionsDropdown`) are covered since they both call `isActionDisabled`.

---

## 6. Trainer onboarding endpoint

**Files changed:**
- `apps/web/pages/api/synaptica/invite-trainer.ts` (new)

**What:** `POST /api/synaptica/invite-trainer` with `x-synaptica-secret` header. Body: `{ email, teamId?, role? }`. Calls `inviteMembersWithNoInviterPermissionCheck` internally — creates Cal.com user (if new), creates team membership in "Trenéři Synaptica" team (id=1), sends magic link invite email (Cal.com handles this). Returns `{ userId, message }`. Defaults: `teamId=1`, `role=MEMBER`.

**Why:** Cal.com admin panel user management requires a commercial license. This endpoint enables programmatic trainer onboarding from the payment platform admin panel. One click creates the Cal.com user + team membership.

**Env var:** `SYNAPTICA_API_SECRET` (same as booking endpoints). Must be set in Railway. Falls back to `synapticaApiSecretHash` in the `Deployment` table if the env var is not injected by Railway.

---

## 7. Force all event types hidden

*Updated 2026-05-26: Extended with Prisma middleware*

*Updated 2026-06-09: Fixed `import type` → `import` for `Prisma.defineExtension` (TS1361)*

**Files changed:**
- `apps/web/modules/event-types/components/EventTypeLayout.tsx`
- `apps/web/modules/event-types/views/event-types-listing-view.tsx`
- `packages/features/eventtypes/components/ChildrenEventTypeSelect.tsx`
- `packages/trpc/server/routers/viewer/eventTypes/heavy/create.handler.ts`
- `packages/trpc/server/routers/viewer/eventTypes/heavy/update.handler.ts`
- `packages/prisma/extensions/force-hidden-event-types.ts` (new)
- `packages/prisma/index.ts`

**What — UI:** The hidden toggle has been removed from the UI (event type edit page, event types listing, and managed event type children).

**What — tRPC handlers:** The backend silently sets `hidden: true` on both create and update regardless of what value is sent.

**What — Prisma middleware (`forceHiddenEventTypesExtension`):** A Prisma query-level extension that forces `hidden: true` on **every** `EventType` write operation — `create`, `createMany`, `update`, `updateMany`, `upsert`. Catches internal Cal.com operations that bypass tRPC (e.g., team event type copies via `assignAllTeamMembers` which use direct Prisma calls).

**Fix (2026-06-09):** `packages/prisma/extensions/force-hidden-event-types.ts` originally used `import type { Prisma }` but `Prisma.defineExtension` is a runtime API. Changed to `import { Prisma }` to fix `TS1361: 'Prisma' cannot be used as a value because it was imported using 'import type'`.

**Why:** Synaptica never uses unhidden/public event types. Trainers could accidentally unhide team event types, making booking pages publicly accessible. Cal.com's team-to-host copy mechanism bypasses tRPC, so the handler-level fix alone was insufficient — individual trainer copies of team event types were landing with `hidden=false`.

---

## 8. Trainer info endpoint

**Files changed:**
- `apps/web/pages/api/synaptica/trainer.ts` (new)

**What:** `GET /api/synaptica/trainer?userId=N` with `x-synaptica-secret` header. Returns `{ id, username, name, email, completedOnboarding }` for a Cal.com user.

**Why:** Admin panel needs to check trainer onboarding status (`completedOnboarding`) and fetch their actual name/username at activation time (trainer chooses these during signup, not at invite time).
