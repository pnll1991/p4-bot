import { T, useGT } from "gt-react";

import { MOBILE_APP_URL } from "../../branding";
import { Button } from "../ui/button";
import { SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

// P4 Bot publishes no mobile app; the store listings are T3 Code's, so this points at the build.
export function MobileAppSettingsRow() {
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  return (
    <SettingsRow
      {...searchableSetting("mobile-app")}
      description={gt(
        "Connect to your server from your phone or tablet. P4 Bot has no store app yet: build it from source.",
      )}
      control={
        <Button
          size="sm"
          variant="outline"
          render={<a href={MOBILE_APP_URL} target="_blank" rel="noreferrer noopener" />}
        >
          <T>How to build</T>
        </Button>
      }
    />
  );
}
