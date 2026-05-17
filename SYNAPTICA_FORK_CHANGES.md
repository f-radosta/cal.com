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

**What:** The `createApp` function now preserves `enabled: true` for apps that already exist in the database, instead of recalculating the enabled state via `shouldEnableApp` on every run.

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
