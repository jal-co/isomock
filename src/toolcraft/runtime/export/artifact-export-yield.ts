export async function yieldToolcraftArtifactExport(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> };
  }).scheduler;
  if (scheduler?.yield) {
    await scheduler.yield();
  } else {
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  }
}
