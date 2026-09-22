"use client";
import * as React from "react";
import { Button, FieldDescription, FieldError, PanelActions } from "@/toolcraft/ui";
import { createToolcraftAppDefaults } from "../../../schema/app-defaults";
import type { ToolcraftState } from "../../../state/types";
import { useToolcraftDefaultsAuthoring } from "../../app-shell/toolcraft-defaults-authoring";
import { ToolcraftSourceAssetCoordinatorContext } from "../../app-shell/toolcraft-source-asset-context";
import { ToolcraftThemeContext } from "../../app-shell/theme-runtime";
import { useSettingsTransferActivity } from "../../app-shell/settings-transfer-activity";

export function SaveAppDefaults({
  getState,
  disabled = false,
}: {
  getState: () => ToolcraftState;
  disabled?: boolean;
}) {
  const authoring = useToolcraftDefaultsAuthoring();
  const coordinator = React.useContext(ToolcraftSourceAssetCoordinatorContext);
  const theme = React.useContext(ToolcraftThemeContext);
  const { activity, operation } = useSettingsTransferActivity(getState);
  const [status, setStatus] = React.useState<"idle" | "saved">("idle");
  const [error, setError] = React.useState<string | null>(null);
  if (!authoring) return null;
  const save = async () => {
    if (disabled) return;
    const releaseOperation = activity.begin("save");
    if (!releaseOperation) return;
    setStatus("idle");
    setError(null);
    try {
      if (authoring.kind === "source") {
        await authoring.save();
      } else {
        const state = getState();
        if (state.mediaAssets.length && !coordinator?.captureDefaultResources) {
          throw new Error("Media defaults require the source asset owner.");
        }
        const uploads = coordinator?.captureDefaultResources
          ? await coordinator.captureDefaultResources(state.mediaAssets)
          : [];
        await authoring.save(
          createToolcraftAppDefaults(
            state,
            uploads.map((upload) => upload.resource),
            theme?.themePreference,
          ),
          uploads,
        );
      }
      setStatus("saved");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save defaults. Please retry.");
      setStatus("idle");
    } finally {
      releaseOperation();
    }
  };
  return (
    <>
      <PanelActions columns={1}>
        <Button
          type="button"
          variant="outline"
          loading={operation === "save"}
          disabled={disabled || operation !== null}
          aria-label={operation === "save" ? "Saving Defaults…" : undefined}
          onClick={() => {
            void save();
          }}
        >
          Save State as Default
        </Button>
      </PanelActions>
      {authoring.kind === "source" && authoring.description ? <FieldDescription>{authoring.description}</FieldDescription> : null}
      {error ? <FieldError role="alert">{error}</FieldError> : null}
      {status === "saved" ? (
        <FieldDescription role="status">{authoring.kind === "source" ? authoring.savedMessage ?? "State saved." : "App defaults saved."}</FieldDescription>
      ) : null}
    </>
  );
}
