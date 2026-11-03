import type { CalendarEvent } from "@calcom/types/Calendar";

/** Shared mailbox. The From address on this fork does not receive mail. */
export const DEFAULT_CUSTOMER_REPLY_TO = "info@synaptica.cz"; // pragma: allowlist secret

/**
 * Where a customer reply should land. An event-type custom address wins, then
 * EMAIL_REPLY_TO, then the shared mailbox. Organizer inboxes are not the default.
 */
export function customerReplyToEmail(customReplyToEmail?: string | null): string {
  const custom = customReplyToEmail?.trim();
  if (custom) return custom;
  const configured = process.env.EMAIL_REPLY_TO?.trim();
  if (configured) return configured;
  return DEFAULT_CUSTOMER_REPLY_TO;
}

/**
 * Returns the reply-to email address to use.
 * When the message is to the organizer, their address is omitted so the reply
 * still goes to the attendee (passed separately by the caller).
 */
export const getReplyToEmail = (
  calEvent: Pick<CalendarEvent, "customReplyToEmail" | "organizer">,
  excludeOrganizerEmail?: boolean
) => {
  if (calEvent.customReplyToEmail) {
    return calEvent.customReplyToEmail;
  }

  if (excludeOrganizerEmail) {
    return null;
  }

  return customerReplyToEmail(null);
};
