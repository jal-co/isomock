import type {
  ToolcraftModelWorkerRequest,
  ToolcraftModelWorkerResponse,
} from "./model-import-worker-protocol";
import { createDefaultToolcraftModelWorkerRuntime } from "./model-import-worker-runtime";

type ModelImportWorkerScope = Readonly<{
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<ToolcraftModelWorkerRequest>) => void,
  ) => void;
  postMessage: (
    response: ToolcraftModelWorkerResponse,
    transfer?: readonly Transferable[],
  ) => void;
}>;

const workerScope = self as unknown as ModelImportWorkerScope;
const runtime = createDefaultToolcraftModelWorkerRuntime((response, transfer) => {
  workerScope.postMessage(response, transfer);
});

workerScope.addEventListener("message", (event) => {
  void runtime.handleMessage(event.data);
});
