const toolcraftInteractionCommandTargets = new Set([
  "canvas.center",
  "canvas.setOffset",
  "canvas.setSize",
  "canvas.setViewport",
  "canvas.zoomIn",
  "canvas.zoomOut",
  "controls.setValue",
  "controls.addCollectionItem",
  "controls.removeCollectionItem",
  "controls.selectCollectionItem",
  "controls.setCollectionItemField",
  "history.redo",
  "history.undo",
]);

export function isToolcraftSupportedInteractionTarget(
  target: string,
  controlTargets: ReadonlySet<string>,
): boolean {
  return controlTargets.has(target) || toolcraftInteractionCommandTargets.has(target);
}
