# Synaptica Cal.com Fork — Change Log

This file tracks all customizations made in the [f-radosta/cal.com](https://github.com/f-radosta/cal.com) fork relative to upstream [calcom/cal.com](https://github.com/calcom/cal.com).

---

## 1. Gate booking API endpoints with shared secret

**Files changed:**
- `apps/web/pages/api/book/event.ts`
- `apps/web/pages/api/book/recurring-event.ts`
- `apps/web/pages/api/book/instant-event.ts`

**What:** Each booking endpoint checks for a `x-synaptica-secret` header. If the `SYNAPTICA_API_SECRET` env var is set and the header doesn't match, the request is rejected with 401.

**Why:** Prevents unauthorized direct calls to the booking API. Only our n8n workflows (which know the secret) can create bookings.

**Env var:** `SYNAPTICA_API_SECRET` — set in Railway. Any random string works; it's compared as a plain equality check, not a hash.

---

## 2. Return 404 for hidden event types on public booking pages

**Files changed:**
- `apps/web/app/(booking-page-wrapper)/[user]/[type]/page.tsx`
- `apps/web/app/(booking-page-wrapper)/team/[slug]/[type]/page.tsx`
- `apps/web/app/(booking-page-wrapper)/org/[orgSlug]/[user]/[type]/page.tsx`

**What:** If `eventData.hidden` is `true`, the page calls `notFound()` from `next/navigation`, returning a proper 404 instead of rendering the booking page.

**Why:** Hidden event types should not be publicly accessible. Upstream Cal.com still renders them.

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

## 5. Synaptica trainer service APIs (no Cal.com UI)

**Files added:**
- `apps/web/lib/synaptica/auth.ts`
- `apps/web/pages/api/synaptica/provision-trainer.ts`
- `apps/web/pages/api/synaptica/invite-trainer.ts` (compat alias → provision, no Cal email)
- `apps/web/pages/api/synaptica/trainer.ts`
- `apps/web/pages/api/synaptica/google-connect.ts`
- `apps/web/pages/api/synaptica/google-callback.ts`
- `apps/web/pages/api/synaptica/schedule.ts`
- `apps/web/pages/api/synaptica/bookings/index.ts`
- `apps/web/pages/api/synaptica/bookings/[uid]/cancel.ts`

**What:** Secret-gated (`x-synaptica-secret`) service routes so Synaptica platform can provision trainers, connect Google Calendar, edit schedules, and list/cancel host bookings **without trainers logging into Cal.com**.

| Endpoint | Purpose |
|----------|---------|
| `POST /api/synaptica/provision-trainer` | Create-or-link Cal user by email (no invite email); Prague/cs prefs; team membership; default schedule; hidden `neurofeedback` event type |
| `GET /api/synaptica/trainer?userId=` | Status: username, `hasGoogleCalendar`, `hasSchedule`, `defaultScheduleId`, `eventTypeId` |
| `GET /api/synaptica/google-connect?userId=&returnTo=` | Google OAuth URL; state HMAC-binds Cal `userId`; callback redirects to Synaptica platform |
| `GET /api/synaptica/google-callback` | OAuth callback (no Cal session); writes Credential + SelectedCalendar |
| `GET/PUT /api/synaptica/schedule?userId=` | Read/update default weekly availability (`availability: [{days, startTime, endTime}]`) |
| `GET /api/synaptica/bookings?userId=&status=` | Host upcoming/past bookings |
| `POST /api/synaptica/bookings/:uid/cancel` | Host cancel via `handleCancelBooking` |

**Env vars:**
- `SYNAPTICA_API_SECRET` — shared secret (raw or SHA-256 hash)
- `SYNAPTICA_PLATFORM_URL` — allowed redirect origin for Google OAuth return (e.g. `https://app.synaptica.cz`)

**Ops:** Add `${WEBAPP_URL}/api/synaptica/google-callback` as an authorized redirect URI on the Google OAuth client used by Cal.

**Why:** Course graduates are promoted to sessions trainers on the platform; they must never receive Cal magic-link emails or use Cal settings UI.
