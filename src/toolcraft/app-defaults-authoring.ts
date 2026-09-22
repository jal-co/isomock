import * as React from "react";
import type { ToolcraftDefaultsAuthoring } from "@/toolcraft/runtime/react";

const endpoint = "/.toolcraft/app-defaults";
type Capability = { revision: string; token: string };

/** The signed host owns filesystem authoring; product code only declares defaults. */
export function useAppDefaultsAuthoring(): ToolcraftDefaultsAuthoring | null {
  const [capability, setCapability] = React.useState<Capability | null>(null);
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal }).then(async (response) => {
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
      const value: unknown = await response.json();
      if (value && typeof value === "object" && "revision" in value && "token" in value &&
          typeof value.revision === "string" && typeof value.token === "string") {
        setCapability({ revision: value.revision, token: value.token });
      }
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  return React.useMemo<ToolcraftDefaultsAuthoring | null>(() => capability ? {
    kind: "workspace",
    async save(defaults, resources) {
      for (const { resource, bytes } of resources) {
        const upload = await fetch(`${endpoint}/resources/${resource.path.slice("toolcraft-defaults/".length)}`, {
          method: "POST",
          headers: { "content-type": "application/octet-stream", "x-toolcraft-defaults-token": capability.token },
          body: new Blob([new Uint8Array(bytes)]),
        });
        if (!upload.ok) {
          const result = await upload.json().catch(() => null);
          throw new Error(result?.error ?? "Could not save a default file. Please retry.");
        }
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-toolcraft-defaults-token": capability.token },
        body: JSON.stringify({ defaults, revision: capability.revision }),
      });
      if (!response.ok) {
        const message: unknown = await response.json().catch(() => null);
        if (message && typeof message === "object" && "saved" in message && message.saved === true &&
            "revision" in message && typeof message.revision === "string") {
          setCapability({ ...capability, revision: message.revision });
        }
        throw new Error(message && typeof message === "object" && "error" in message && typeof message.error === "string"
          ? message.error : "Could not save defaults. Please retry.");
      }
      // Pagehide flushes the current workspace; new schema defaults also drive Reset.
      window.location.reload();
    },
  } : null, [capability]);
}
