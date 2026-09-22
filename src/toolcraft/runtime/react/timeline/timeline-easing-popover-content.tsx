'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { ScrollFade } from '@/toolcraft/ui';

import type { ToolcraftTimelineKeyframeEasing } from '../../state/types';
import {
  findTimelineEasingPresetName,
  getEasingInputValue,
  parseToolcraftTimelineKeyframeEasing,
  timelineEasingPresetCategories,
  timelineEasingPresets,
} from './timeline-easing-model';
import { TimelineEasingEditor } from './timeline-easing-editor';
import { TimelineEasingPresetIcon, TimelineEasingStepPresetIcon } from './timeline-easing-icons';
import { useTimelineEasingPopoverWidth } from './timeline-easing-popover-layout';

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

const selectedItemSurfaceClassName = 'bg-[color:color-mix(in_oklab,var(--link)_12%,transparent)]';
const selectedItemBorderClassName =
  'border-[color:color-mix(in_oklab,var(--border)_10%,transparent)]';

const timelineEasingPresetButtonBaseClassName =
  'inline-flex items-center gap-2 rounded-lg border p-1 text-left font-mono text-[11px] leading-[14px] transition-[background-color,border-color,color,transform] duration-150 ease-out hover:bg-[color:color-mix(in_oklab,var(--foreground)_6%,transparent)] hover:border-[color:color-mix(in_oklab,var(--border)_14%,transparent)] active:scale-[0.985]';

function getTimelineEasingPresetButtonClassName(isActive: boolean): string {
  return cn(
    timelineEasingPresetButtonBaseClassName,
    isActive && selectedItemBorderClassName,
    isActive && selectedItemSurfaceClassName,
    isActive
      ? 'text-[color:var(--foreground)]'
      : 'border-[color:color-mix(in_oklab,var(--border)_8%,transparent)] text-[color:var(--muted-foreground)]',
  );
}
export function TimelineEasingPopoverContent({
  easing,
  onChange,
}: {
  easing: ToolcraftTimelineKeyframeEasing;
  onChange: (easing: ToolcraftTimelineKeyframeEasing) => void;
}): React.JSX.Element {
  const [inputValue, setInputValue] = useState(getEasingInputValue(easing));
  const [inputError, setInputError] = useState<string | null>(null);
  const [inputEditing, setInputEditing] = useState(false);
  const activePresetName = findTimelineEasingPresetName(easing);
  const committedInputValue = getEasingInputValue(easing);
  const isStep = easing.type === 'step';
  const popoverWidth = useTimelineEasingPopoverWidth();

  useEffect(() => {
    if (inputEditing) {
      return;
    }

    setInputValue(committedInputValue);
    setInputError(null);
  }, [committedInputValue, inputEditing]);

  const commitInputValue = (
    value = inputValue,
    { revertOnInvalid = false }: { revertOnInvalid?: boolean } = {},
  ): void => {
    const nextEasing = parseToolcraftTimelineKeyframeEasing(value, easing);

    if (!nextEasing) {
      if (revertOnInvalid) {
        setInputValue(committedInputValue);
        setInputError(null);
        return;
      }

      setInputError('Use cubic-bezier(x1, y1, x2, y2) or step.');
      return;
    }

    setInputError(null);
    setInputValue(getEasingInputValue(nextEasing));

    if (getEasingInputValue(nextEasing) === committedInputValue) {
      return;
    }

    onChange(nextEasing);
  };

  return (
    <div className="flex flex-row items-stretch" style={{ width: popoverWidth }}>
      <TimelineEasingEditor easing={easing} onChange={onChange} />
      <span
        aria-hidden="true"
        className="w-px shrink-0 self-stretch bg-[color:color-mix(in_oklab,var(--border)_10%,transparent)]"
        data-slot="timeline-easing-divider"
      />
      <ScrollFade
        className="max-h-[240px] min-w-0 flex-1 py-3 pr-3 pl-3"
        containerClassName="min-w-0 flex-1"
        data-slot="timeline-easing-presets"
        height={36}
        preset="default"
        showOppositeSide
        side="bottom"
        visibilityMode="terminal"
      >
        <div className="flex flex-col gap-4">
          {timelineEasingPresetCategories.map(([category, categoryLabel]) => {
            const presets = timelineEasingPresets.filter(
              (preset) => preset.category === category,
            );
            const showStepPreset = category === 'basic';

            if (presets.length === 0 && !showStepPreset) {
              return null;
            }

            return (
              <div className="flex flex-col gap-1.5" key={category}>
                <span
                  className="text-[11px] leading-4 opacity-60"
                  data-slot="timeline-easing-section-label"
                >
                  {categoryLabel}
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {showStepPreset ? (
                    <button
                      className={getTimelineEasingPresetButtonClassName(isStep)}
                      onClick={() => onChange({ type: 'step' })}
                      type="button"
                    >
                      <TimelineEasingStepPresetIcon />
                      <span>Step Hold</span>
                    </button>
                  ) : null}
                  {presets.map((preset) => {
                    const isActive = activePresetName === preset.name;

                    return (
                      <button
                        className={getTimelineEasingPresetButtonClassName(isActive)}
                        key={preset.name}
                        onClick={() =>
                          onChange({
                            controlPoints: [...preset.controlPoints],
                            type: 'bezier',
                          })
                        }
                        type="button"
                      >
                        <TimelineEasingPresetIcon controlPoints={preset.controlPoints} />
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] leading-4 opacity-60"
                data-slot="timeline-easing-section-label"
              >
                Curve Values
              </span>
            </div>
            <input
              className="h-8 cursor-text rounded-lg border border-[color:color-mix(in_oklab,var(--border)_10%,transparent)] bg-[color:color-mix(in_oklab,var(--background)_20%,transparent)] px-2.5 font-mono text-[12px] text-[color:var(--foreground)] transition-[background-color,border-color] duration-150 ease-out outline-none placeholder:text-[color:var(--muted-foreground)] in-data-[focus-visible-mode=keyboard]:focus-visible:border-[color:color-mix(in_oklab,var(--border)_22%,transparent)] in-data-[focus-visible-mode=keyboard]:focus-visible:bg-[color:color-mix(in_oklab,var(--foreground)_4%,transparent)]"
              onBlur={(event) => {
                commitInputValue(event.currentTarget.value, { revertOnInvalid: true });
                setInputEditing(false);
              }}
              onChange={(event) => {
                setInputValue(event.currentTarget.value);
                if (inputError) {
                  setInputError(null);
                }
              }}
              onFocus={(event) => {
                setInputEditing(true);
                event.currentTarget.select();
              }}
              onKeyDown={(event) => {
                if (
                  event.key === 'Backspace' ||
                  event.key === 'Delete' ||
                  event.key === 'ArrowLeft' ||
                  event.key === 'ArrowRight' ||
                  event.key === 'ArrowUp' ||
                  event.key === 'ArrowDown'
                ) {
                  event.stopPropagation();
                }

                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  commitInputValue(event.currentTarget.value);
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  setInputValue(committedInputValue);
                  setInputError(null);
                  event.currentTarget.blur();
                }
              }}
              placeholder="0.19, 1, 0.22, 1 or step"
              type="text"
              value={inputValue}
            />
            {inputError ? (
              <p className="font-mono text-[10px] leading-3 text-[color:var(--destructive)]">
                {inputError}
              </p>
            ) : null}
          </div>
        </div>
      </ScrollFade>
    </div>
  );
}
