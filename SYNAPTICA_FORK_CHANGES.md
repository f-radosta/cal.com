# Synaptica Cal.com Fork — Change Log

This file tracks all customizations made in the [f-radosta/cal.com](https://github.com/f-radosta/cal.com) fork relative to upstream [calcom/cal.com](https://github.com/calcom/cal.com).

---

## 1. Gate booking API endpoints with shared secret

**Files changed:**
- `apps/web/pages/api/book/event.ts`
- `apps/web/pages/api/book/recurring-event.ts`
- `apps/web/pages/api/book/instant-event.ts`

**What:** Each booking endpoint checks for a `x-synaptica-secret` header. If the `SYNAPTICA_API_SECRET` env var is set and the header doesn't match, the request is rejected with 401. When `SYNAPTICA_API_SECRET` is not set, the check is bypassed (dev mode).

**Why:** Prevents unauthorized direct calls to the booking API. Only our n8n workflows (which know the secret) can create bookings. The Cal.com upstream has no auth on these endpoints by design.

**Env var:** `SYNAPTICA_API_SECRET` — set in Railway. Any random string works; it's compared as a plain equality check, not a hash. n8n workflows must send the matching value in the `x-synaptica-secret` HTTP header.

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
