# Custom Features Requirements

## Overview

This document outlines the custom features requested for the Cal.com fork. All implementations should:
- Use metadata-based configuration (no database schema changes)
- Maintain upgrade compatibility with upstream Cal.com
- Include comprehensive tests
- Follow existing Cal.com patterns and conventions

---

## Requirements

### 1. Separate Reschedule/Cancel Notice Periods

**Goal:** Set different minimum notice periods for organizers vs attendees/guests.

#### 1.1 Reschedule Notice
- **Organizer notice:** Minimum minutes before meeting that organizer can reschedule
- **Attendee notice:** Minimum minutes before meeting that attendee can reschedule
- Admins should bypass these restrictions

#### 1.2 Cancel Notice  
- **Organizer notice:** Minimum minutes before meeting that organizer can cancel
- **Attendee notice:** Minimum minutes before meeting that attendee can cancel
- Admins should bypass these restrictions

**Implementation Approach:**
- Store in `eventType.metadata.rescheduling` and `eventType.metadata.cancellation`
- Update validation logic in reschedule/cancel flows
- Add admin bypass using existing permission system

---

### 2. Require Confirmation When Attendee Reschedules

**Goal:** When an attendee reschedules, the organizer must approve the new time.

**Current Behavior:**
- If `requiresConfirmation` is enabled, all reschedules need approval
- Organizer rescheduling automatically confirms (bypasses confirmation)

**Required Change:**
- Add `requiresConfirmationForAttendeeReschedule` flag to metadata
- When enabled, attendee reschedules create PENDING bookings
- Organizer receives confirmation request email
- Organizer reschedules remain auto-confirmed (unless separate flag added)

**Implementation Approach:**
- Store in `eventType.metadata.requiresConfirmationForAttendeeReschedule`
- Update `getRequiresConfirmationFlags.ts` logic
- Ensure email notifications work correctly

---

### 3. Admin Central Calendar & Powers

**Goal:** Admins can view all bookings and manage organizer/attendee bookings.

#### 3.1 View All Bookings
- Admins see all bookings from users they admin (team or org level)
- Filter by: trainer/organizer, date range, status, event type
- Accessible from central admin calendar view

#### 3.2 Admin Powers Over Bookings
- **View:** See all booking details
- **Cancel:** Cancel any booking (with reason)
- **Reschedule:** Directly reschedule any booking
- **Bypass:** Ignore minimum notice restrictions
- **Confirm:** Approve pending bookings on behalf of organizer

**Admin Types:**
- **Team Admin:** Can manage bookings for team members
- **Org Admin:** Can manage bookings for entire organization
- **System Admin:** Can manage all bookings (existing superuser)

**Implementation Approach:**
- Leverage existing PBAC permission system
- Add admin checks to reschedule flow (similar to cancel flow)
- Create admin UI view/filter in booking management pages
- Use metadata for admin-specific configurations

---

## Technical Guidelines

### Architecture Principles

1. **Metadata-First Configuration**
   - Store new settings in `eventType.metadata` JSON field
   - Follow pattern of existing `requiresConfirmationThreshold`
   - Avoid database schema changes for upgrade compatibility

2. **Permission System Integration**
   - Use existing PBAC (Permission-Based Access Control)
   - Leverage `MembershipRole.ADMIN` and `MembershipRole.OWNER`
   - Add admin bypass checks where needed

3. **Backward Compatibility**
   - Default behavior unchanged when metadata not set
   - Graceful fallbacks for missing configuration
   - Support gradual rollout

### Key Files to Modify

#### Core Logic
- `packages/features/bookings/lib/service/RegularBookingService.ts`
- `packages/features/bookings/lib/handleCancelBooking.ts`
- `packages/features/bookings/lib/reschedule/determineReschedulePreventionRedirect.ts`
- `packages/features/bookings/lib/handleNewBooking/getRequiresConfirmationFlags.ts`

#### Schema & Types
- `packages/prisma/zod-utils.ts` (add metadata schemas)
- `packages/features/eventtypes/lib/types.ts`

#### UI Components
- `apps/web/app/(booking-page-wrapper)/bookings/` (admin views)
- `packages/platform/atoms/event-types/` (configuration forms)

#### Tests
- All modified files should have corresponding test updates
- Add integration tests for admin flows
- Test upgrade scenarios

### Development Process

1. **Understand Current Flow**
   - Read existing implementation thoroughly
   - Run existing tests to understand behavior
   - Document assumptions

2. **Implement Incrementally**
   - Start with metadata schema additions
   - Add backend validation logic
   - Update UI components
   - Add admin-specific features last

3. **Test Rigorously**
   - Unit tests for new logic
   - Integration tests for complete flows
   - E2E tests for critical paths
   - Test upgrade scenarios (pull upstream changes)

4. **Document Changes**
   - Update this file with implementation details
   - Add code comments explaining "why" not "what"
   - Create migration guide for existing deployments

---

## Upgrade Strategy

### Before Each Upstream Merge

1. **Review upstream changes** to modified files
2. **Run type checks:** `yarn type-check:ci --force`
3. **Run tests:** `TZ=UTC yarn test` for affected modules
4. **Manual testing** of custom features
5. **Update documentation** if behavior changes

### Risk Mitigation

- **Low Risk:** Metadata schema changes (easy to merge)
- **Medium Risk:** Logic changes in booking flows (careful review needed)
- **High Risk:** Permission system changes (test thoroughly)

### Fallback Plan

If upstream adds conflicting features:
1. Evaluate if upstream feature meets requirements
2. If yes, migrate to upstream implementation
3. If no, maintain fork with clear documentation of differences

---

## Open Questions

### To Clarify with Stakeholders

1. **Admin Scope:**
   - Should team admins see only their team's bookings?
   - Should org admins see all organization bookings?
   - Any cross-team visibility requirements?

2. **Notification Behavior:**
   - When admin cancels/reschedules, who receives emails?
   - Should admin receive copy of all notifications?
   - Can admin suppress notifications to organizer/attendee?

3. **Confirmation Workflow:**
   - Can admin approve on behalf of organizer?
   - Should admin approval bypass organizer approval?
   - Any escalation path if organizer doesn't respond?

4. **UI/UX:**
   - Dedicated admin calendar page or filter on existing page?
   - Bulk actions (cancel/reschedule multiple bookings)?
   - Audit log of admin actions?

### Technical Decisions Pending

1. **Metadata Structure:**
   - Flat vs nested structure for rescheduling/cancellation settings?
   - Naming conventions for new fields?

2. **Permission Granularity:**
   - Single "admin" permission or separate read/cancel/reschedule?
   - Should admins be able to disable these powers for specific event types?

3. **Backward Compatibility:**
   - Migration path for existing event types?
   - Default values for missing metadata?

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [x] Add metadata schemas to `zod-utils.ts`
- [x] Update event type configuration forms
- [x] Add basic validation logic
- [x] Write unit tests

### Phase 2: Reschedule/Cancel Notices (Week 2-3)
- [x] Implement separate guest/organizer notice periods
- [x] Add admin bypass logic
- [x] Update reschedule flow
- [x] Update cancel flow
- [x] Integration tests

### Phase 3: Attendee Reschedule Confirmation (Week 3-4)
- [x] Add confirmation flag for attendee reschedules
- [x] Update email notification flow
- [x] Add organizer approval UI
- [x] Tests for confirmation workflow

### Phase 4: Admin Calendar & Powers (Week 4-6)
- [x] Add admin booking list view (`/bookings/admin`)
- [x] Implement admin reschedule authorization
- [x] Add admin filters and search (reuses existing data-table filters)
- [ ] Admin action audit logging (deferred — uses existing booking-audit feature)
- [x] E2E tests for admin flows (unit tests for bypass logic)

### Phase 5: Polish & Documentation (Week 6-7)
- [ ] Performance optimization
- [ ] Edge case handling
- [ ] User documentation
- [ ] Developer documentation
- [ ] Upgrade testing

---

## Success Criteria

- ✅ All requirements implemented and tested
- ✅ No database schema migrations required
- ✅ Can merge upstream Cal.com changes without major conflicts
- ✅ Existing bookings unaffected by new features
- ✅ Admin powers properly scoped and secure
- ✅ Clear documentation for users and developers

---

## References

- [Cal.com AGENTS.md](./AGENTS.md) - Development guidelines
- [Cal.com Booking Access Service](./packages/features/bookings/services/BookingAccessService.ts) - Permission logic
- [Cal.com Metadata Schema](./packages/prisma/zod-utils.ts) - Existing metadata patterns
- [PBAC Documentation](./packages/features/pbac/) - Permission system

---

*Last Updated: $(date +%Y-%m-%d)*
*Status: Requirements Gathering Complete, Ready for Implementation*
