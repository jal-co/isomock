/** A command scope supplied by a host, independent of the document it edits. */
export type ToolcraftHistoryPort = Readonly<{
  getSnapshot(): Readonly<{
    available: boolean;
    canRedo: boolean;
    canUndo: boolean;
  }>;
  subscribe(changed: () => void): () => void;
  undo(options?: { signal?: AbortSignal }): Promise<void>;
  redo(options?: { signal?: AbortSignal }): Promise<void>;
}>;
