"use client";

import { QuestionIcon } from "@phosphor-icons/react";
import * as React from "react";

import {
  Button,
  ScrollFade,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useOverflowTitle,
} from "../primitives";

export function ControlSectionTitle({
  children,
  titleText,
}: {
  children: React.ReactNode;
  titleText: string;
}): React.JSX.Element {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const overflowTitle = useOverflowTitle(viewportRef, titleText);

  return (
    <div className="flex min-w-0 items-center gap-1 has-data-[icon-active=true]:[&_[data-slot=panel-title]]:text-[color:var(--link)]">
      <ScrollFade
        className="min-w-0 overflow-x-hidden overflow-y-hidden"
        containerClassName="min-w-0 flex-1"
        data-control-section-title-viewport=""
        preset="compact"
        scrollBoundaryBehavior="chain"
        side="right"
        viewportRef={viewportRef}
        watch={[titleText]}
      >
        <div
          className="min-w-max whitespace-nowrap"
          data-control-section-title-text=""
          title={overflowTitle}
        >
          {children}
        </div>
      </ScrollFade>
    </div>
  );
}

export function ControlSectionHelp({
  description,
  titleText,
}: {
  description?: string;
  titleText: string;
}): React.JSX.Element | null {
  const help = description?.trim();
  return help ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={`${titleText} help`}
            className="size-3.5 p-0 text-[color:color-mix(in_oklab,var(--foreground)_40%,transparent)] hover:text-[color:color-mix(in_oklab,var(--foreground)_60%,transparent)]"
            data-control-section-help=""
            radius="full"
            size="icon-xxs"
            type="button"
            variant="ghost-static"
          />
        }
      >
        <QuestionIcon className="size-3.5" weight="fill" />
      </TooltipTrigger>
      <TooltipContent
        className="max-w-[240px] whitespace-normal text-left"
        side="top"
      >
        {help}
      </TooltipContent>
    </Tooltip>
  ) : null;
}
