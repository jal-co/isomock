import type { Surface } from "vgpu";

export type ToolcraftVgpuSurfaceOwnership = {
  disposeAll(): unknown[];
  track(surface: Surface): Surface;
};

function aggregateRegistrationFailure(primary: unknown, cleanup: unknown) {
  return new AggregateError(
    [primary, cleanup],
    "VGPU surface ownership registration and cleanup failed.",
  );
}

export function createToolcraftVgpuSurfaceOwnership(): ToolcraftVgpuSurfaceOwnership {
  const surfaces = new Set<Surface>();
  const destroyReleases = new Map<Surface, () => void>();

  return {
    disposeAll() {
      const surfaceSnapshot = [...surfaces];
      const releaseSnapshot = [...destroyReleases.values()];
      const errors: unknown[] = [];
      surfaces.clear();
      destroyReleases.clear();

      for (const surface of surfaceSnapshot) {
        try {
          if (!surface.disposed) {
            surface.dispose();
          }
        } catch (error) {
          errors.push(error);
        }
      }
      for (const release of releaseSnapshot) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      return errors;
    },
    track(surface) {
      surfaces.add(surface);
      try {
        const release = surface.onDestroy(() => {
          surfaces.delete(surface);
          destroyReleases.delete(surface);
        });
        if (surfaces.has(surface)) {
          destroyReleases.set(surface, release);
        } else {
          release();
        }
      } catch (registrationError) {
        surfaces.delete(surface);
        try {
          if (!surface.disposed) {
            surface.dispose();
          }
        } catch (cleanupError) {
          throw aggregateRegistrationFailure(registrationError, cleanupError);
        }
        throw registrationError;
      }
      return surface;
    },
  };
}
