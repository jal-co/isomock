"use client";

import * as React from "react";

import type { ToolcraftControlSchema } from "../../schema/types";
import type { ToolcraftCommand, ToolcraftState } from "../../state/types";
import { useToolcraftSelector } from "../app-shell/use-toolcraft";
import {
  type ToolcraftCustomControlRenderer,
  type ToolcraftCustomControlSetValue,
} from "./control-renderers";
import { getToolcraftTargetValue } from "./conditions/control-conditions";

type LiveCustomControlProps = {
  control: ToolcraftControlSchema;
  controlId: string;
  dispatch: React.Dispatch<ToolcraftCommand>;
  getKeyframeAction: (value: unknown) => React.ReactNode;
  name: string;
  renderer: ToolcraftCustomControlRenderer;
  setValue: ToolcraftCustomControlSetValue;
};

const selectEffectiveState = (state: ToolcraftState): ToolcraftState => state;

export function LiveCustomControl({
  control,
  controlId,
  dispatch,
  getKeyframeAction,
  name,
  renderer,
  setValue,
}: LiveCustomControlProps): React.JSX.Element {
  const state = useToolcraftSelector(selectEffectiveState);
  const value = getToolcraftTargetValue(state, control.target) ?? control.defaultValue;

  return (
    <>
      {React.createElement(renderer, {
        control,
        controlId,
        dispatch,
        keyframeAction: getKeyframeAction(value),
        name,
        setValue,
        state,
        value,
      })}
    </>
  );
}
