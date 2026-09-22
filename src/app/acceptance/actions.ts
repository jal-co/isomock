import type {
  ToolcraftActionSchema,
  ToolcraftControlSchema,
} from "@/toolcraft/runtime";

export function getActionValue(action: ToolcraftActionSchema | string): string {
  return typeof action === "string" ? action : action.value;
}

export function getActionLabelText(action: ToolcraftActionSchema | string): string {
  return typeof action === "string" ? action : (action.label ?? action.value);
}

export function getActionSearchText(action: ToolcraftActionSchema | string): string {
  return typeof action === "string" ? action : `${action.label} ${action.value} ${action.command ?? ""}`;
}

export function isResetPanelAction(action: ToolcraftActionSchema | string): boolean {
  return /\breset\b/i.test(getActionSearchText(action));
}

export function getControlActions(
  control: ToolcraftControlSchema,
): readonly (ToolcraftActionSchema | string)[] {
  if (control.type === "actions" || control.type === "panelActions") {
    return control.actions ?? [];
  }

  return [];
}
