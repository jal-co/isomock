import { sanitizeComposedHostProps, type SafeComposedHostElementProps } from "../primitives/sanitize-composed-host-props";
import { cn } from "../../lib/utils";
import {
} from "../primitives";

function AspectRatio({
  ratio,
  className,
  ...props
}: SafeComposedHostElementProps<"div"> & { ratio: number }) {
  return (
    <div
      data-slot="aspect-ratio"
      style={
        {
          "--ratio": ratio,
        } as React.CSSProperties
      }
      className={cn("relative aspect-(--ratio)", className)}
      {...sanitizeComposedHostProps(props)}
    />
  );
}

export { AspectRatio };
