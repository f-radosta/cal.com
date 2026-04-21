import useLockedFieldsManager from "@calcom/features/ee/managed-event-types/hooks/useLockedFieldsManager";
import type {
  EventTypeSetup,
  FormValues,
  SettingsToggleClassNames,
} from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Input, SettingsToggle } from "@calcom/ui/components/form";
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

export type CancelNoticeCustomClassNames = SettingsToggleClassNames;

type CancelNoticeControllerProps = {
  eventType: EventTypeSetup;
  customClassNames?: CancelNoticeCustomClassNames;
};

export default function CancelNoticeController({
  eventType,
  customClassNames,
}: CancelNoticeControllerProps) {
  const { t } = useLocale();
  const formMethods = useFormContext<FormValues>();

  const { shouldLockDisableProps } = useLockedFieldsManager({ eventType, translate: t, formMethods });
  const disableCancellingLocked = shouldLockDisableProps("disableCancelling");

  const currentCancelNoticeOrganizer = formMethods.watch("metadata.cancelNoticeOrganizer");
  const [_cancelNoticeOrganizerValue, setCancelNoticeOrganizerValue] = useState<number>(
    currentCancelNoticeOrganizer && currentCancelNoticeOrganizer > 0 ? currentCancelNoticeOrganizer : 60
  );

  const currentCancelNoticeAttendee = formMethods.watch("metadata.cancelNoticeAttendee");
  const [_cancelNoticeAttendeeValue, setCancelNoticeAttendeeValue] = useState<number>(
    currentCancelNoticeAttendee && currentCancelNoticeAttendee > 0 ? currentCancelNoticeAttendee : 60
  );

  return (
    <div className="block items-start sm:flex">
      <div className="w-full">
        <Controller
          name="disabledCancelling"
          control={formMethods.control}
          render={({ field: { onChange, value } }) => (
            <SettingsToggle
              labelClassName={classNames("text-sm", customClassNames?.label)}
              toggleSwitchAtTheEnd={true}
              switchContainerClassName={classNames(
                "border-subtle rounded-lg border py-6 px-4 sm:px-6",
                !value && "rounded-b-none",
                customClassNames?.container
              )}
              childrenClassName={classNames("lg:ml-0", customClassNames?.children)}
              descriptionClassName={customClassNames?.description}
              title={t("disable_cancelling")}
              data-testid="disable-cancelling-toggle"
              {...disableCancellingLocked}
              checked={value}
              onCheckedChange={(val) => {
                onChange(val);
                if (val) {
                  formMethods.setValue("metadata.cancelNoticeOrganizer", undefined, { shouldDirty: true });
                  formMethods.setValue("metadata.cancelNoticeAttendee", undefined, { shouldDirty: true });
                }
              }}>
              {!value && (
                <div className="rounded-b-lg border border-subtle border-t-0 p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{t("organizer_cancel_notice")}</span>
                      <Input
                        type="number"
                        min={0}
                        disabled={disableCancellingLocked.disabled}
                        onChange={(evt) => {
                          const val = Number(evt.target?.value);
                          setCancelNoticeOrganizerValue(val);
                          formMethods.setValue("metadata.cancelNoticeOrganizer", val, {
                            shouldDirty: true,
                          });
                        }}
                        className="m-0! block w-20 border-default text-sm [appearance:textfield] focus:z-10"
                        defaultValue={
                          currentCancelNoticeOrganizer && currentCancelNoticeOrganizer > 0
                            ? currentCancelNoticeOrganizer
                            : 60
                        }
                      />
                      <span className="text-sm">{t("minutes")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{t("attendee_cancel_notice")}</span>
                      <Input
                        type="number"
                        min={0}
                        disabled={disableCancellingLocked.disabled}
                        onChange={(evt) => {
                          const val = Number(evt.target?.value);
                          setCancelNoticeAttendeeValue(val);
                          formMethods.setValue("metadata.cancelNoticeAttendee", val, {
                            shouldDirty: true,
                          });
                        }}
                        className="m-0! block w-20 border-default text-sm [appearance:textfield] focus:z-10"
                        defaultValue={
                          currentCancelNoticeAttendee && currentCancelNoticeAttendee > 0
                            ? currentCancelNoticeAttendee
                            : 60
                        }
                      />
                      <span className="text-sm">{t("minutes")}</span>
                    </div>
                  </div>
                </div>
              )}
            </SettingsToggle>
          )}
        />
      </div>
    </div>
  );
}
