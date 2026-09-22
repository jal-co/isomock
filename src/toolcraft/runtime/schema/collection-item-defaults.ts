import type { ToolcraftCollectionItemControlType } from "./collection-item-controls";
import type { ToolcraftControlSchema } from "./types";

const implicitScalarCollectionItemControl: {
  readonly type: "color";
  readonly defaultValue?: never;
} = { type: "color" };

export function getToolcraftScalarCollectionItemControl<
  Control extends { readonly itemControl?: { readonly type: string } },
>(
  control: Control,
):
  | NonNullable<Control["itemControl"]>
  | typeof implicitScalarCollectionItemControl {
  return control.itemControl ?? implicitScalarCollectionItemControl;
}

function assertNeverCollectionItemControl(value: never): never {
  throw new Error(
    `Unsupported Toolcraft collection item control: ${String(value)}`,
  );
}

function getImplicitScalarCollectionItemDefault(
  control: NonNullable<ToolcraftControlSchema["itemControl"]>,
): unknown {
  const type: ToolcraftCollectionItemControlType = control.type;

  switch (type) {
    case "color":
      return "#C1FF00";
    case "colorOpacity":
      return { hex: "#C1FF00", opacity: 100 };
    case "fontPicker":
      return {
        color: "#FFFFFF",
        fontId: "inter",
        fontSize: 16,
        fontWeight: "400",
        letterSpacing: "normal",
        lineHeight: "normal",
        opacity: 100,
        textCase: "original",
      };
    case "checkbox":
    case "switch":
      return false;
    case "rangeInput":
      return { end: "100%", start: "0%" };
    case "rangeSlider":
      return [control.min ?? 0, control.max ?? 100];
    case "select":
    case "segmented":
      return control.options?.[0]?.value ?? "";
    case "slider":
      return control.min ?? 0;
    case "text":
      return "";
    case "vector":
      return { x: 0, y: 0 };
    default:
      return assertNeverCollectionItemControl(type);
  }
}

export function getToolcraftCollectionItemDefault(
  control: ToolcraftControlSchema,
): unknown {
  if (control.itemControls) {
    return Object.fromEntries(
      Object.entries(control.itemControls).map(([fieldId, field]) => [
        fieldId,
        field.defaultValue,
      ]),
    );
  }

  if (Object.prototype.hasOwnProperty.call(control, "itemDefaultValue")) {
    return control.itemDefaultValue;
  }

  const itemControl = getToolcraftScalarCollectionItemControl(control);
  return itemControl.defaultValue !== undefined
    ? itemControl.defaultValue
    : getImplicitScalarCollectionItemDefault(itemControl);
}
