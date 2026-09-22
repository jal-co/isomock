import { Toaster as Sonner, type ToasterProps as SonnerToasterProps } from "sonner";
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import { Spinner } from "./spinner";
import { cn } from "../../lib/utils";

export type ToasterProps = SonnerToasterProps & { indicator?: "dot" | "icon" | "none" };

const statusIcons = {
  success: <CheckCircleIcon className="size-4" />,
  info: <InfoIcon className="size-4" />,
  warning: <WarningIcon className="size-4" />,
  error: <XCircleIcon className="size-4" />,
  loading: <Spinner aria-hidden="true" />,
};
const dotColors = {
  success: "bg-green-500",
  info: "bg-[color:var(--link)]",
  warning: "bg-[color:var(--attention)]",
  error: "bg-[color:var(--destructive)]",
  loading: "bg-[color:var(--attention)]",
};

const Toaster = ({ theme = "system", indicator = "dot", icons, className, style, toastOptions, ...props }: ToasterProps) => {
  const statusIndicator = (type: keyof typeof statusIcons) => indicator === "none" ? null
    : indicator === "icon" ? statusIcons[type]
      : <span aria-hidden="true" data-slot="toast-status-dot" data-status={type} className={cn("block size-1.5 rounded-full", dotColors[type])} />;
  return (
    <Sonner
      {...props}
      theme={theme}
      className={cn("toaster group", className)}
      icons={{
        success: statusIndicator("success"),
        info: statusIndicator("info"),
        warning: statusIndicator("warning"),
        error: statusIndicator("error"),
        loading: statusIndicator("loading"),
        ...icons,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "color-mix(in oklab, var(--border) 12%, transparent)",
          "--border-radius": "var(--radius)",
          ...style,
        } as React.CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: cn("cn-toast", toastOptions?.classNames?.toast),
        },
      }}
    />
  );
};

export { Toaster };
export { toast } from "sonner";
