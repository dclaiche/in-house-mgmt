"use client";

import { RangeSlider, Stack, Text } from "@mantine/core";

type RangeValue = [number, number];

interface RangeSliderInputProps {
  label: string;
  value?: RangeValue;
  defaultValue?: RangeValue;
  onChange: (value: RangeValue) => void;
  min?: number;
  max?: number;
  minRange?: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  width?: number;
  labelFormatter?: (value: number) => string | number;
}

export default function RangeSliderInput({
  label,
  value,
  defaultValue,
  onChange,
  min = 0,
  max = 100,
  minRange = 0,
  size = "sm",
  width = 180,
  labelFormatter,
}: RangeSliderInputProps) {
  // tabIndex=-1 allows tests (but not users) to focus on label text and tab through sliders
  return (
    <Stack gap={2} style={{ width }} pb={10}>
      <Text size="sm" fw={500} tabIndex={-1}>
        {label}
      </Text>
      <RangeSlider
        min={min}
        max={max}
        minRange={minRange}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        size={size}
        label={labelFormatter}
      />
    </Stack>
  );
}
