"use client";

import * as React from "react";

import type {
  ToolcraftPresentationResourceHandle,
  ToolcraftSourceAssetPresentationResources,
} from "../../source-assets/source-asset-presentation-resources";
import type { ToolcraftMediaAsset } from "../../state/types";

const ToolcraftMediaPresentationResourcesContext =
  React.createContext<ToolcraftSourceAssetPresentationResources | null>(null);
const ToolcraftMediaBootstrapUrlsContext = React.createContext<
  ReadonlyMap<string, string>
>(new Map());

export function ToolcraftMediaPresentationProvider({
  bootstrapUrls,
  children,
  resources,
}: {
  bootstrapUrls: ReadonlyMap<string, string>;
  children: React.ReactNode;
  resources: ToolcraftSourceAssetPresentationResources | null;
}): React.JSX.Element {
  return (
    <ToolcraftMediaBootstrapUrlsContext.Provider value={bootstrapUrls}>
      <ToolcraftMediaPresentationResourcesContext.Provider value={resources}>
        {children}
      </ToolcraftMediaPresentationResourcesContext.Provider>
    </ToolcraftMediaBootstrapUrlsContext.Provider>
  );
}

type BinaryPresentationAsset = {
  id: string;
  mimeType: string;
  resourceRef: string;
};

type RetainedPresentationAsset = BinaryPresentationAsset & {
  active: boolean;
  handle?: ToolcraftPresentationResourceHandle;
  resources: ToolcraftSourceAssetPresentationResources;
};

function getBinaryPresentationAssets(
  mediaAssets: readonly ToolcraftMediaAsset[],
): BinaryPresentationAsset[] {
  return mediaAssets.flatMap((asset) =>
    asset.assetKind === "model" || asset.lifecycle === "unavailable"
      ? []
      : [{
          id: asset.id,
          mimeType: asset.mimeType,
          resourceRef: asset.resourceRef,
        }],
  );
}

export function useToolcraftMediaPresentationUrls(
  mediaAssets: readonly ToolcraftMediaAsset[],
): ReadonlyMap<string, string> {
  const resources = React.useContext(ToolcraftMediaPresentationResourcesContext);
  const bootstrapUrls = React.useContext(ToolcraftMediaBootstrapUrlsContext);
  const [urls, setUrls] = React.useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const retainedAssetsRef = React.useRef(
    new Map<string, RetainedPresentationAsset>(),
  );
  const binaryAssets = React.useMemo(
    () => getBinaryPresentationAssets(mediaAssets),
    [mediaAssets],
  );

  React.useEffect(() => {
    const retainedAssets = retainedAssetsRef.current;
    const desiredAssets = new Map(
      binaryAssets.map((asset) => [asset.id, asset]),
    );

    for (const [assetId, retained] of retainedAssets) {
      const desired = desiredAssets.get(assetId);
      if (
        resources &&
        retained.resources === resources &&
        desired?.mimeType === retained.mimeType &&
        desired.resourceRef === retained.resourceRef
      ) {
        continue;
      }

      retained.active = false;
      retained.handle?.release();
      retainedAssets.delete(assetId);
    }

    setUrls((currentUrls) => {
      const nextUrls = new Map(currentUrls);
      let changed = false;
      for (const assetId of currentUrls.keys()) {
        if (!retainedAssets.has(assetId)) {
          nextUrls.delete(assetId);
          changed = true;
        }
      }
      return changed ? nextUrls : currentUrls;
    });

    if (!resources) {
      return;
    }

    for (const asset of binaryAssets) {
      if (retainedAssets.has(asset.id)) {
        continue;
      }

      const retained: RetainedPresentationAsset = {
        ...asset,
        active: true,
        resources,
      };
      retainedAssets.set(asset.id, retained);
      void resources.retain(asset.resourceRef, asset.mimeType).then(
        (handle) => {
          if (
            !retained.active ||
            retainedAssetsRef.current.get(asset.id) !== retained
          ) {
            handle.release();
            return;
          }

          retained.handle = handle;
          setUrls((currentUrls) => {
            if (currentUrls.get(asset.id) === handle.url) {
              return currentUrls;
            }
            const nextUrls = new Map(currentUrls);
            nextUrls.set(asset.id, handle.url);
            return nextUrls;
          });
        },
        () => {
          if (retainedAssetsRef.current.get(asset.id) !== retained) {
            return;
          }

          retained.active = false;
          retainedAssetsRef.current.delete(asset.id);
          setUrls((currentUrls) => {
            if (!currentUrls.has(asset.id)) {
              return currentUrls;
            }
            const nextUrls = new Map(currentUrls);
            nextUrls.delete(asset.id);
            return nextUrls;
          });
        },
      );
    }
  }, [binaryAssets, resources]);

  React.useEffect(
    () => () => {
      for (const retained of retainedAssetsRef.current.values()) {
        retained.active = false;
        retained.handle?.release();
      }
      retainedAssetsRef.current.clear();
    },
    [],
  );

  return React.useMemo(() => {
    const presentedUrls = new Map<string, string>();

    for (const asset of binaryAssets) {
      const url = urls.get(asset.id) ?? bootstrapUrls.get(asset.resourceRef);

      if (url) {
        presentedUrls.set(asset.id, url);
      }
    }

    return presentedUrls;
  }, [binaryAssets, bootstrapUrls, urls]);
}
