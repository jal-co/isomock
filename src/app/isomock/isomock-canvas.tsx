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

import { IsomockAttribution } from "./attribution";
import { IsomockAxisLegend } from "./axis-legend";
import { createIsomockCamera, isomockRayHitsImage } from "./camera";
import {
  createIsomockGlRenderer,
  getIsomockDisplayAspect,
  type IsomockGlRenderer,
} from "./gl-renderer";
import { previewRenderPass, sourceDecodePass } from "./pipeline";
import { finiteOr, readIsomockSettings, isomockTargets } from "./settings";
import {
  decodeIsomockSource,
  findIsomockSource,
  getIsomockSourceTransform,
  getIsomockTextureSource,
} from "./source";
import { useIsomockFitArtboard } from "./use-fit-artboard";
import { useIsomockFramingGestures } from "./use-framing-gestures";
import { useIsomockVideoPlayback } from "./use-video-playback";
import styles from "./isomock-canvas.module.css";

export function IsomockCanvas(): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef<IsomockGlRenderer | null>(null);
  const drawRef = React.useRef<(() => void) | null>(null);
  const drawFrameRef = React.useRef(0);
  const [renderCount, setRenderCount] = React.useState(0);
  const sceneFrame = useToolcraftProductSceneFrame();
  const pipeline = useToolcraftPipeline();
  const values = useToolcraftEvaluatedValues(0);
  const renderScale = Math.min(
    2,
    Math.max(1, finiteOr(Number(useToolcraftValue("canvas.renderScale")), 2)),
  );
  const mediaAssets = useToolcraftSelector((state) => state.mediaAssets);
  const source = findIsomockSource(mediaAssets);
  const transform = getIsomockSourceTransform(source);
  const sourceAssets = React.useMemo(() => (source ? [source] : []), [source]);
  const latestUrl = useToolcraftMediaPresentationUrls(sourceAssets).get(
    source?.id ?? "",
  );
  const [urlOwner, setUrlOwner] = React.useState({
    resourceRef: source?.resourceRef,
    url: latestUrl,
  });
  if (urlOwner.url !== latestUrl) {
    setUrlOwner({ resourceRef: source?.resourceRef, url: latestUrl });
  }
  const presentationUrl =
    urlOwner.url === latestUrl && urlOwner.resourceRef === source?.resourceRef
      ? latestUrl
      : undefined;
  const settings = React.useMemo(() => readIsomockSettings(values), [values]);

  const decoded = useToolcraftPipelinePass(
    sourceDecodePass,
    {
      "source.presentationUrl": presentationUrl ?? null,
      "source.resourceRef": source?.resourceRef ?? null,
    },
    (context) =>
      source && presentationUrl
        ? decodeIsomockSource(context, source, presentationUrl)
        : null,
  );
  const decodedSource = decoded.status === "success" ? decoded.result : null;
  const videoFrame = useIsomockVideoPlayback(decodedSource);
  const textureSource = React.useMemo(
    () => (decodedSource ? getIsomockTextureSource(decodedSource) : null),
    [decodedSource],
  );

  const rect = sceneFrame.kind === "ready" ? sceneFrame.rect : null;
  const devicePixelRatio =
    typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const backingWidth = rect
    ? Math.ceil(rect.width * devicePixelRatio * renderScale)
    : 0;
  const backingHeight = rect
    ? Math.ceil(rect.height * devicePixelRatio * renderScale)
    : 0;
  const imageAspect = textureSource
    ? getIsomockDisplayAspect(textureSource, transform)
    : 1;
  const camera = React.useMemo(
    () =>
      rect
        ? createIsomockCamera(settings, imageAspect, rect.width / rect.height)
        : null,
    [imageAspect, rect, settings],
  );

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    rendererRef.current = createIsomockGlRenderer(canvas);
    return () => {
      cancelAnimationFrame(drawFrameRef.current);
      drawFrameRef.current = 0;
      drawRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !camera || backingWidth === 0 || backingHeight === 0) {
      drawRef.current = null;
      return;
    }
    drawRef.current = () => {
      if (textureSource) {
        renderer.render({
          camera,
          height: backingHeight,
          settings,
          source: textureSource,
          transform,
          width: backingWidth,
        });
      } else {
        renderer.clear(backingWidth, backingHeight);
      }
    };
    if (drawFrameRef.current) return;
    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = 0;
      const draw = () => drawRef.current?.();
      const work = pipeline
        ? pipeline.runPass(previewRenderPass, undefined, draw)
        : Promise.resolve(draw());
      void work.then(() => setRenderCount((count) => count + 1));
    });
  }, [
    backingHeight,
    backingWidth,
    camera,
    pipeline,
    settings,
    textureSource,
    transform,
    videoFrame,
  ]);

  useIsomockFitArtboard(canvasRef);
  useIsomockFramingGestures(
    canvasRef,
    React.useMemo(
      () => ({ offset: settings.offset, zoom: settings.zoom }),
      [settings.offset, settings.zoom],
    ),
    textureSource ? imageAspect : null,
  );

  const hitTest = React.useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !camera || !textureSource) return false;
      const bounds = canvas.getBoundingClientRect();
      const ndcX = ((clientX - bounds.left) / bounds.width) * 2 - 1;
      const ndcY = 1 - ((clientY - bounds.top) / bounds.height) * 2;
      return isomockRayHitsImage(camera, ndcX, ndcY);
    },
    [camera, textureSource],
  );
  const orbit = useToolcraftModelOrbitInteraction<HTMLCanvasElement>({
    enabled: !!textureSource,
    hitTest,
    target: isomockTargets.pose,
  });

  return (
    <>
      <IsomockAttribution />
      <IsomockAxisLegend />
      <canvas
        {...orbit}
        className={styles.canvas}
        data-isomock-render-count={renderCount}
        data-isomock-source={decodedSource ? "ready" : "empty"}
        data-toolcraft-product-output=""
        ref={canvasRef}
      />
    </>
  );
}
