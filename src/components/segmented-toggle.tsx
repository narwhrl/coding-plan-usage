"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * 卡头里的分段切换器（指标 / 时间范围）。
 *
 * 两个坑封在这里，别在调用处重写：
 * - variant/size 必须给在 ToggleGroup 上——ToggleGroupContext 的默认值会盖掉子项的同名 prop。
 * - 选中态只有 4%~8% 的底色差，单看背景分不出来；未选中的文字压成 muted 才有第二个线索。
 */
export function SegmentedToggle<T extends string>({
  value,
  options,
  onValueChange,
  label,
  disabled,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onValueChange: (value: T) => void;
  /** 分组的可访问名，读屏时先播它再播选项。 */
  label: string;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      value={[value]}
      disabled={disabled}
      aria-label={label}
      onValueChange={(next) => {
        const picked = next[0];
        if (options.some((option) => option.value === picked)) onValueChange(picked as T);
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="text-muted-foreground data-pressed:text-foreground"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
