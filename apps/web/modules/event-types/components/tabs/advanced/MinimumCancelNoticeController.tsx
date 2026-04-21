import useLockedFieldsManager from "@calcom/features/ee/managed-event-types/hooks/useLockedFieldsManager";
import type {
  EventTypeSetup,
  FormValues,
  SettingsToggleClassNames,
} from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Input } from "@calcom/ui/components/form";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

export type MinimumCancelNoticeCustomClassNames = SettingsToggleClassNames;

type MinimumCancelNoticeControllerProps = {
  eventType: EventTypeSetup;
  customClassNames?: MinimumCancelNoticeCustomClassNames;
};

export default function MinimumCancelNoticeController({
  eventType,
  customClassNames,
}: MinimumCancelNoticeControllerProps) {
  const { t } = useLocale();
  const formMethods = useFormContext<FormValues>();

  const { shouldLockDisableProps } = useLockedFieldsManager({ eventType, translate: t, formMethods });
  const lockedProps = shouldLockDisableProps("minimumCancelNotice");

  const currentCancelNoticeOrganizer = formMethods.watch("metadata.cancelNoticeOrganizer");
  const [cancelNoticeOrganizerValue, setCancelNoticeOrganizerValue] = useState<number>(
    currentCancelNoticeOrganizer ?? 0
  );

  const currentCancelNoticeAttendee = formMethods.watch("metadata.cancelNoticeAttendee");
  const [cancelNoticeAttendeeValue, setCancelNoticeAttendeeValue] = useState<number>(
    currentCancelNoticeAttendee ?? 0
  );

  return (
    <div className={classNames("block items-start sm:flex", customClassNames?.container)}>
      <div className="w-full">
        <div className="rounded-lg border border-subtle px-4 py-6 sm:px-6">
          <p className="font-semibold text-default text-sm">
            {t("minimum_cancel_notice")}
            {lockedProps.LockedIcon}
          </p>
          <p className="mb-4 text-default text-sm">{t("minimum_cancel_notice_description")}</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm">{t("organizer_cancel_notice")}</span>
              <Input
                type="number"
                min={0}
                disabled={lockedProps.disabled}
                onChange={(evt) => {
                  const val = Number(evt.target?.value);
                  setCancelNoticeOrganizerValue(val);
                  formMethods.setValue("metadata.cancelNoticeOrganizer", val > 0 ? val : undefined, {
                    shouldDirty: true,
                  });
                }}
                className="m-0! block w-20 border-default text-sm [appearance:textfield] focus:z-10"
                defaultValue={cancelNoticeOrganizerValue || ""}
              />
              <span className="text-sm">{t("minutes")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">{t("attendee_cancel_notice")}</span>
              <Input
                type="number"
                min={0}
                disabled={lockedProps.disabled}
                onChange={(evt) => {
                  const val = Number(evt.target?.value);
                  setCancelNoticeAttendeeValue(val);
                  formMethods.setValue("metadata.cancelNoticeAttendee", val > 0 ? val : undefined, {
                    shouldDirty: true,
                  });
                }}
                className="m-0! block w-20 border-default text-sm [appearance:textfield] focus:z-10"
                defaultValue={cancelNoticeAttendeeValue || ""}
              />
              <span className="text-sm">{t("minutes")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
