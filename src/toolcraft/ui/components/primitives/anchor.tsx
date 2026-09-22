import * as React from "react";

function Anchor({ ref, ...props }: React.ComponentProps<"a">) {
  return <a {...props} ref={ref} />;
}

export { Anchor };
