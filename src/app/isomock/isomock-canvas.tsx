import * as React from "react";
import {
  useToolcraftEvaluatedValues,
  useToolcraftMediaPresentationUrls,
  useToolcraftModelOrbitInteraction,
  useToolcraftPipeline,
  useToolcraftPipelinePass,
  useToolcraftProductSceneFrame,
  useToolcraftSelector,
  useToolcraftValue,
} from "@/toolcraft/runtime/react";

import { createIsomockCamera, isomockRayHitsImage } from "./camera";
import {
  createIsomockGlRenderer,
  getIsomockDisplayAspect,
  type IsomockGlRenderer,
} from "./gl-renderer";
import { previewRenderPass, sourceDecodePass } from "./pipeline";
import { readIsomockSettings, isomockTargets } from "./settings";
import { decodeIsomockSource, findIsomockSource } from "./source";
import { useIsomockFramingGestures } from "./use-framing-gestures";
import styles from "./isomock-canvas.module.css";

function readRenderScale(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(2, Math.max(1, numeric)) : 2;
}

export function IsomockCanvas(): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef<IsomockGlRenderer | null>(null);
  const [renderCount, setRenderCount] = React.useState(0);
  const sceneFrame = useToolcraftProductSceneFrame();
  const pipeline = useToolcraftPipeline();
  const values = useToolcraftEvaluatedValues();
  const renderScale = readRenderScale(useToolcraftValue("canvas.renderScale"));
  const mediaAssets = useToolcraftSelector((state) => state.mediaAssets);
  const source = findIsomockSource(mediaAssets);
  const sourceAssets = React.useMemo(() => (source ? [source] : []), [source]);
  const presentationUrl = useToolcraftMediaPresentationUrls(sourceAssets).get(source?.id ?? "");
  const settings = React.useMemo(() => readIsomockSettings(values), [values]);

  const decoded = useToolcraftPipelinePass(
    sourceDecodePass,
    {
      "source.presentationUrl": presentationUrl ?? null,
      "source.resourceRef": source?.resourceRef ?? null,
    },
    (context) =>
      source && presentationUrl
        ? decodeIsomockSource(context, source.resourceRef, presentationUrl)
        : null,
  );
  const bitmap = decoded.status === "success" ? decoded.result : null;

  const rect = sceneFrame.kind === "ready" ? sceneFrame.rect : null;
  const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const backingWidth = rect ? Math.ceil(rect.width * devicePixelRatio * renderScale) : 0;
  const backingHeight = rect ? Math.ceil(rect.height * devicePixelRatio * renderScale) : 0;
  const imageAspect = bitmap ? getIsomockDisplayAspect(bitmap, source?.transform) : 1;
  const camera = React.useMemo(
    () => (rect ? createIsomockCamera(settings, imageAspect, rect.width / rect.height) : null),
    [imageAspect, rect, settings],
  );

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    rendererRef.current = createIsomockGlRenderer(canvas, { disposable: false });
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !camera || backingWidth === 0 || backingHeight === 0) return undefined;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const draw = () => {
        if (cancelled) return;
        if (bitmap) {
          renderer.render({
            camera,
            height: backingHeight,
            settings,
            source: bitmap,
            transform: source?.transform,
            width: backingWidth,
          });
        } else {
          renderer.clear(backingWidth, backingHeight);
        }
      };
      const work = pipeline ? pipeline.runPass(previewRenderPass, undefined, draw) : Promise.resolve(draw());
      void work.then(() => {
        if (!cancelled) setRenderCount((count) => count + 1);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [backingHeight, backingWidth, bitmap, camera, pipeline, settings, source?.transform]);

  useIsomockFramingGestures(
    canvasRef,
    React.useMemo(() => ({ offset: settings.offset, zoom: settings.zoom }), [settings.offset, settings.zoom]),
    bitmap ? imageAspect : null,
  );

  const hitTest = React.useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !camera || !bitmap) return false;
      const bounds = canvas.getBoundingClientRect();
      const ndcX = ((clientX - bounds.left) / bounds.width) * 2 - 1;
      const ndcY = 1 - ((clientY - bounds.top) / bounds.height) * 2;
      return isomockRayHitsImage(camera, ndcX, ndcY);
    },
    [bitmap, camera],
  );
  const orbit = useToolcraftModelOrbitInteraction<HTMLCanvasElement>({
    enabled: !!bitmap,
    hitTest,
    target: isomockTargets.pose,
  });

  return (
    <canvas
      {...orbit}
      className={styles.canvas}
      data-isomock-render-count={renderCount}
      data-isomock-source={bitmap ? "ready" : "empty"}
      data-toolcraft-product-output=""
      ref={canvasRef}
    />
  );
}
