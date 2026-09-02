"use client";

import type React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  segmentedControlItemVariants,
  segmentedControlRootClassName,
} from "@/lib/segmented-control";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: string };

/**
 * 分段切换：图表指标、时间范围这类「少量互斥选项」的统一控件。
 * 视觉走 segmented-control 令牌（灰底容器 + 白色选中块），不再用 outline 按钮组。
 */
export function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onValueChange,
  disabled,
  className,
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onValueChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      disabled={disabled}
      onValueChange={(next) => {
        const first = next[0] as T | undefined;
        if (first !== undefined) onValueChange(first);
      }}
      className={cn(segmentedControlRootClassName, className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className={segmentedControlItemVariants({ size: "sm", state: "pressed" })}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
