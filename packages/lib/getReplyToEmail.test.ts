import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { customerReplyToEmail, getReplyToEmail } from "./getReplyToEmail";

describe("getReplyToEmail", () => {
  it("returns the customReplyToEmail if it is set", () => {
    const calEvent = {
      customReplyToEmail: "customReplyToEmail@example.com",
      organizer: {
        name: "Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: {
          locale: "en",
          translate: ((key: string) => key) as TFunction,
        },
      },
    };
    expect(getReplyToEmail(calEvent)).toBe("customReplyToEmail@example.com");
  });
  it("replies to the shared mailbox when no custom address is set", () => {
    const calEvent = {
      customReplyToEmail: null,
      organizer: {
        name: "Organizer",
        email: "organizer@example.com",
        timeZone: "UTC",
        language: {
          locale: "en",
          translate: ((key: string) => key) as TFunction,
        },
      },
    };
    expect(getReplyToEmail(calEvent)).toBe("info@synaptica.cz"); // pragma: allowlist secret
  });

  it("uses EMAIL_REPLY_TO when set and still prefers a custom address", () => {
    const previous = process.env.EMAIL_REPLY_TO;
    process.env.EMAIL_REPLY_TO = "ops@synaptica.cz";
    expect(customerReplyToEmail(null)).toBe("ops@synaptica.cz");
    expect(customerReplyToEmail("custom@example.com")).toBe("custom@example.com");
    if (previous === undefined) delete process.env.EMAIL_REPLY_TO;
    else process.env.EMAIL_REPLY_TO = previous;
  });
});
