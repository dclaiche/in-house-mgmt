"use client";

import { Button, Group, MultiSelect, Paper, Select, Stack, TextInput } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconCalendar, IconSearch } from "@tabler/icons-react";
import RangeSliderInput from "@/app/components/RangeSliderInput";
import { type Tag } from "@/app/components/ContactTable";
import { type EventCategory } from "@/app/components/event-utils";

export interface ContactsFilterValues {
  searchQuery: string;
  startDate: string | null;
  endDate: string | null;
  tagMode: "any" | "all";
  selectedTagIds: string[];
  selectedCategoryId: string | null;
  eventRange: [number, number];
  ticketRange: [number, number];
}

interface ContactsFilterBarProps {
  values: ContactsFilterValues;
  onChange: (changes: Partial<ContactsFilterValues>) => void;
  tags: Tag[];
  categories: EventCategory[];
  onReset: () => void;
}

export default function ContactsFilterBar({
  values,
  onChange,
  tags,
  categories,
  onReset,
}: ContactsFilterBarProps) {
  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group gap="md" align="flex-end" grow>
          <TextInput
            label="Search"
            placeholder="Search name, Discord ID..."
            value={values.searchQuery}
            onChange={(e) => onChange({ searchQuery: e.target.value })}
            leftSection={<IconSearch size={16} />}
            style={{ flex: 1, minWidth: 200 }}
          />
          <DateInput
            label="Start Date"
            value={values.startDate}
            onChange={(v) => onChange({ startDate: v })}
            clearable
            placeholder="Start Date..."
            leftSection={<IconCalendar size={16} />}
          />
          <DateInput
            label="End Date"
            onChange={(v) => onChange({ endDate: v })}
            clearable
            value={values.endDate}
            placeholder="End Date..."
            leftSection={<IconCalendar size={16} />}
          />
        </Group>
        <Group gap="md" align="flex-end">
          <Group gap={0} align="flex-end" style={{ flex: 1 }}>
            <Select
              label="Tags"
              data={[
                { value: "any", label: "Any of" },
                { value: "all", label: "All of" },
              ]}
              value={values.tagMode}
              onChange={(v) => onChange({ tagMode: (v as "any" | "all") || "any" })}
              allowDeselect={false}
              styles={{
                input: {
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  borderRight: "none",
                  width: 100,
                },
              }}
            />
            <MultiSelect
              aria-label="Tag Ids"
              data={tags.map((t) => ({ value: String(t.id), label: t.name }))}
              value={values.selectedTagIds}
              onChange={(v) => onChange({ selectedTagIds: v })}
              placeholder="Search tags..."
              searchable
              clearable
              style={{ flex: 1 }}
              styles={{
                input: {
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  overflowX: "auto",
                  flexWrap: "nowrap",
                },
              }}
            />
          </Group>

          <Select
            label="Event Category"
            placeholder="All categories"
            data={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            value={values.selectedCategoryId}
            onChange={(v) => onChange({ selectedCategoryId: v })}
            clearable
          />

          <RangeSliderInput
            label="# of Events Attended"
            min={0}
            max={20}
            minRange={0}
            value={values.eventRange}
            onChange={(v) => onChange({ eventRange: v })}
            labelFormatter={(v) => (v === 20 ? "20+" : v)}
          />
          <RangeSliderInput
            label="# of Closed Tickets"
            min={0}
            max={20}
            minRange={0}
            value={values.ticketRange}
            onChange={(v) => onChange({ ticketRange: v })}
            labelFormatter={(v) => (v === 20 ? "20+" : v)}
          />
          <Button variant="outline" onClick={onReset} ml="auto">
            Reset
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
