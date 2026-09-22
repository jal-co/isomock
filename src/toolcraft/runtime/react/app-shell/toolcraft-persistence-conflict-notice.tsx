import { Alert, AlertDescription, AlertTitle } from "@/toolcraft/ui/components/composites";
import { Button } from "@/toolcraft/ui/components/primitives";

import { useToolcraftPersistenceStatus } from "./use-toolcraft-persistence";

export function ToolcraftPersistenceConflictNotice() {
  const status = useToolcraftPersistenceStatus();
  if (status.status !== "failed" || status.reason !== "stale-snapshot") {
    return null;
  }

  return (
    <Alert aria-label="Workspace saving paused" className="absolute bottom-16 left-3 z-50 max-w-96">
      <AlertTitle>Saving paused</AlertTitle>
      <AlertDescription>
        Another tab changed this workspace. Your changes remain in this tab. Reloading opens the
        saved workspace and discards this tab's unsaved changes.
      </AlertDescription>
      <Button onClick={() => window.location.reload()}>Reload saved workspace</Button>
    </Alert>
  );
}
