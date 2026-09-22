"use client";

import * as React from "react";

import type {
  ToolcraftRendererPipelinePassCacheInput,
  ToolcraftRendererPipelinePassExecutionContext,
  ToolcraftRendererPipelinePassHandle,
  ToolcraftRendererPipelinePassResult,
} from "../../rendering";
import { useToolcraftPipeline } from "./use-toolcraft-pipeline";

type AnyPassHandle = ToolcraftRendererPipelinePassHandle<
  string,
  any,
  any,
  any
>;

const emptyPipelineInvalidation = Object.freeze({ cleanup: Promise.resolve() });
const fallbackPipelinePassContext = Object.freeze({
  getOrCreateResource: () => {
    throw new Error(
      "rendererPipelineRegistration is required for retained renderer resources",
    );
  },
  invalidatePass: () => emptyPipelineInvalidation,
  invalidateSource: (_sourceKey: unknown) => emptyPipelineInvalidation,
});

export type ToolcraftPipelinePassState<Result> =
  | Readonly<{
      status: "pending";
    }>
  | Readonly<{
      result: Result;
      status: "success";
    }>
  | Readonly<{
      error: unknown;
      status: "error";
    }>;

type PipelinePassRequest<Handle extends AnyPassHandle> = Readonly<{
  cacheInput: ToolcraftRendererPipelinePassCacheInput<Handle>;
  pass: Handle;
}>;

type ResolvedPipelinePass<Handle extends AnyPassHandle> = Readonly<{
  request: PipelinePassRequest<Handle>;
  state: ToolcraftPipelinePassState<
    ToolcraftRendererPipelinePassResult<Handle>
  >;
}>;

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  ) && "then" in value;
}

function sameValueZero(left: unknown, right: unknown): boolean {
  return left === right || (left !== left && right !== right);
}

function hasEqualCacheInput(left: unknown, right: unknown): boolean {
  if (sameValueZero(left, right)) {
    return true;
  }
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false;
  }
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        sameValueZero(
          (left as Record<PropertyKey, unknown>)[key],
          (right as Record<PropertyKey, unknown>)[key],
        ),
    )
  );
}

function useStableCacheInput<Input>(cacheInput: Input): Input {
  const stableInput = React.useRef(cacheInput);
  if (!hasEqualCacheInput(stableInput.current, cacheInput)) {
    stableInput.current = cacheInput;
  }
  return stableInput.current;
}

export function useToolcraftPipelinePass<Handle extends AnyPassHandle>(
  pass: Handle,
  cacheInput: NoInfer<ToolcraftRendererPipelinePassCacheInput<Handle>>,
  compute: (
    context: ToolcraftRendererPipelinePassExecutionContext<Handle>,
  ) =>
    | PromiseLike<NoInfer<ToolcraftRendererPipelinePassResult<Handle>>>
    | NoInfer<ToolcraftRendererPipelinePassResult<Handle>>,
): ToolcraftPipelinePassState<ToolcraftRendererPipelinePassResult<Handle>> {
  const pipeline = useToolcraftPipeline();
  const stableCacheInput = useStableCacheInput(cacheInput);
  const computeRef = React.useRef(compute);
  React.useLayoutEffect(() => {
    computeRef.current = compute;
  }, [compute]);
  const request = React.useMemo<PipelinePassRequest<Handle>>(
    () => ({ cacheInput: stableCacheInput, pass }),
    [pass, stableCacheInput],
  );
  const [resolved, setResolved] = React.useState<
    ResolvedPipelinePass<Handle> | undefined
  >();

  React.useLayoutEffect(() => {
    let active = true;
    let hasSynchronousResult = false;
    let synchronousResult: ToolcraftRendererPipelinePassResult<Handle>;
    const execute = (
      context: ToolcraftRendererPipelinePassExecutionContext<Handle>,
    ) => {
      const result = computeRef.current(context);
      if (!isPromiseLike(result)) {
        hasSynchronousResult = true;
        synchronousResult = result;
      }
      return result;
    };
    let result: Promise<ToolcraftRendererPipelinePassResult<Handle>>;

    try {
      result = pipeline
        ? pipeline.runPass(request.pass, request.cacheInput, execute)
        : Promise.resolve(
            execute(
              fallbackPipelinePassContext as ToolcraftRendererPipelinePassExecutionContext<Handle>,
            ),
          );
    } catch (error) {
      setResolved({
        request,
        state: { error, status: "error" },
      });
      return () => {
        active = false;
      };
    }

    if (hasSynchronousResult) {
      setResolved({
        request,
        state: {
          result: synchronousResult!,
          status: "success",
        },
      });
    }

    void result.then(
      (value) => {
        if (active && !hasSynchronousResult) {
          setResolved({
            request,
            state: {
              result: value,
              status: "success",
            },
          });
        }
      },
      (error: unknown) => {
        if (active) {
          setResolved({
            request,
            state: { error, status: "error" },
          });
        }
      },
    );

    return () => {
      active = false;
    };
  }, [pipeline, request]);

  if (resolved?.request === request) {
    return resolved.state;
  }
  return { status: "pending" };
}
