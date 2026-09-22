"use client";

import * as React from "react";
import { DownloadSimpleIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { Button, ControlList, FieldError, PanelActions } from "@/toolcraft/ui";
import { SaveAppDefaults } from "./controls-panel-save-defaults";
import type { ToolcraftState } from "../../../state/types";
import {
  downloadToolcraftSettings,
  importToolcraftSettings,
} from "../../app-shell/settings-transfer";
import { useSettingsTransferActivity } from "../../app-shell/settings-transfer-activity";
import { ToolcraftSourceAssetCoordinatorContext } from "../../app-shell/toolcraft-source-asset-context";
import { useToolcraftDispatch } from "../../app-shell/use-toolcraft";

export type SettingsTransferControlRenderArgs = {
  getState: () => ToolcraftState;
  id: string;
};

function SettingsTransferControl({
  getState,
}: Pick<SettingsTransferControlRenderArgs, "getState">) {
  const dispatch = useToolcraftDispatch();
  const sourceAssetCoordinator = React.useContext(ToolcraftSourceAssetCoordinatorContext);
  const { operation } = useSettingsTransferActivity(getState);
  const [exportPending, setExportPending] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const exportSettings = async () => {
    setExportPending(true);
    setExportError(null);
    try {
      downloadToolcraftSettings(getState());
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not export settings.");
    } finally {
      setExportPending(false);
    }
  };
  return (
    <ControlList>
      <SaveAppDefaults getState={getState} />
      <PanelActions columns={2}>
        <Button
          type="button"
          variant="outline"
          disabled={operation !== null || exportPending}
          loading={operation === "import"}
          onClick={() => {
            void importToolcraftSettings({
              getState,
              strict: false,
              sourceAssetCoordinator: sourceAssetCoordinator ?? {},
              dispatch(command) {
                dispatch(command);
              },
            });
          }}
        >
          <DownloadSimpleIcon aria-hidden="true" data-icon="inline-start" data-icon-name="download-simple" />
          Import Settings
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={operation !== null || exportPending}
          loading={exportPending}
          onClick={() => { void exportSettings(); }}
        >
          <UploadSimpleIcon aria-hidden="true" data-icon="inline-start" data-icon-name="upload-simple" />
          Export Settings
        </Button>
      </PanelActions>
      {exportError ? <FieldError role="alert">{exportError}</FieldError> : null}
    </ControlList>
  );
}

export function renderSettingsTransferControl({
  getState,
  id,
}: SettingsTransferControlRenderArgs): React.ReactNode {
  return <SettingsTransferControl key={id} getState={getState} />;
}
