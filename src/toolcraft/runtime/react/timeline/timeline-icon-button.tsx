'use client';

import * as React from 'react';
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@/toolcraft/ui';

export function TimelineIconButton({
  active = false,
  children,
  disabled = false,
  label,
  onClick,
  size = 'icon',
  tooltipSide = 'top',
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  size?: 'icon-sm' | 'icon';
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={active}
            className="data-[icon-active=true]:text-[color:var(--foreground)]"
            data-icon-active={active}
            disabled={disabled}
            onClick={() => {
              if (disabled) {
                return;
              }

              onClick();
            }}
            size={size}
            type="button"
            variant="ghost"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}
