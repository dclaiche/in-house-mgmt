"use client";

import { ActionIcon, Badge, Button, Group, Modal, Paper, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/app/lib/apiClient";
import ContactTable, {
  type Contact,
  type ContactRowData,
  type Tag,
} from "@/app/components/ContactTable";
import ContactsFilterBar, { type ContactsFilterValues } from "@/app/components/ContactsFilterBar";
import { type EventCategory } from "@/app/components/event-utils";
import { type TicketTemplate } from "@/app/components/tickets/ticket-utils";

const MAX_TAG_COUNT = 99999;
const CONTACT_FILTER_DEBOUNCE_MS = 300;
const RANGE_LIMITS: [number, number] = [0, 20];

const DEFAULT_FILTERS: ContactsFilterValues = {
  searchQuery: "",
  startDate: null,
  endDate: null,
  tagMode: "any",
  selectedTagIds: [],
  selectedCategoryId: null,
  eventRange: RANGE_LIMITS,
  ticketRange: RANGE_LIMITS,
};

interface UseTemplateModalProps {
  opened: boolean;
  template: TicketTemplate | null;
  onClose: () => void;
  onContinue: (contactIds: number[]) => void;
}

export default function UseTemplateModal({
  opened,
  template,
  onClose,
  onContinue,
}: UseTemplateModalProps) {
  const [filters, setFilters] = useState<ContactsFilterValues>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<ContactRowData[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [previousUrl, setPreviousUrl] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const handleFilterChange = (changes: Partial<ContactsFilterValues>) =>
    setFilters((prev) => ({ ...prev, ...changes }));

  const handleReset = () => setFilters(DEFAULT_FILTERS);

  useEffect(() => {
    if (!opened) return;
    const loadAux = async () => {
      try {
        const tagsData = await apiClient.get<Tag[] | { results: Tag[] }>(
          `/tags/?page_size=${MAX_TAG_COUNT}`
        );
        setTags(Array.isArray(tagsData) ? tagsData : tagsData.results || []);
      } catch {
        setTags([]);
      }
      try {
        const { results } = await apiClient.get<{ results: EventCategory[] }>("/event-categories/");
        setCategories(results || []);
      } catch {
        setCategories([]);
      }
    };
    loadAux();
  }, [opened]);

  const [debouncedFilters] = useDebouncedValue(filters, CONTACT_FILTER_DEBOUNCE_MS);

  const fetchContacts = useCallback(
    async (url?: string) => {
      if (!opened) return;
      try {
        setLoading(true);
        let fetchUrl = url;
        if (!fetchUrl) {
          const params = new URLSearchParams();
          if (debouncedFilters.searchQuery)
            params.set("search", debouncedFilters.searchQuery.trim());
          if (debouncedFilters.eventRange[0] > RANGE_LIMITS[0])
            params.set("min_events", String(debouncedFilters.eventRange[0]));
          if (debouncedFilters.eventRange[1] < RANGE_LIMITS[1])
            params.set("max_events", String(debouncedFilters.eventRange[1]));
          if (debouncedFilters.ticketRange[0] > RANGE_LIMITS[0])
            params.set("min_tickets", String(debouncedFilters.ticketRange[0]));
          if (debouncedFilters.ticketRange[1] < RANGE_LIMITS[1])
            params.set("max_tickets", String(debouncedFilters.ticketRange[1]));
          if (debouncedFilters.startDate) params.set("start_date", debouncedFilters.startDate);
          if (debouncedFilters.endDate) params.set("end_date", debouncedFilters.endDate);
          if (debouncedFilters.selectedCategoryId)
            params.set("event_category_id", debouncedFilters.selectedCategoryId);
          if (debouncedFilters.selectedTagIds.length > 0) {
            params.set("tag_ids", debouncedFilters.selectedTagIds.join(","));
            params.set("tag_mode", debouncedFilters.tagMode);
          }
          fetchUrl = params.size > 0 ? `/contacts/?${params}` : "/contacts/";
        }
        const data = await apiClient.get<{
          results: Contact[];
          count: number;
          next: string | null;
          previous: string | null;
        }>(fetchUrl);
        setRows(data.results);
        setTotalCount(data.count);
        setNextUrl(data.next);
        setPreviousUrl(data.previous);
      } catch (err) {
        notifications.show({
          color: "red",
          title: "Failed to load contacts",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setLoading(false);
      }
    },
    [opened, debouncedFilters]
  );

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    if (!opened) {
      setSelectedIds(new Set());
      setFilters(DEFAULT_FILTERS);
    }
  }, [opened]);

  const toggleRowSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContinue = () => {
    if (selectedIds.size === 0) return;
    onContinue(Array.from(selectedIds));
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Text fw={600}>Use template</Text>
          {template && (
            <>
              <Text>{template.name}</Text>
              {template.is_global ? (
                <Badge color="blue" size="sm">
                  Shared
                </Badge>
              ) : (
                <Badge color="teal" size="sm">
                  Mine
                </Badge>
              )}
            </>
          )}
        </Group>
      }
      size="90%"
      centered
      styles={{
        body: {
          display: "flex",
          flexDirection: "column",
          gap: "var(--mantine-spacing-md)",
          maxHeight: "calc(100vh - 140px)",
        },
      }}
    >
      <Text size="sm" c="dimmed">
        Step 1 of 2 — select contacts. Step 2 opens the bulk-create modal with this template loaded.
      </Text>

      <ContactsFilterBar
        values={filters}
        onChange={handleFilterChange}
        tags={tags}
        categories={categories}
        onReset={handleReset}
      />

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <ContactTable
          contacts={rows}
          loading={loading}
          showTitle={false}
          isSelectable
          selectedIds={selectedIds}
          toggleSelect={toggleRowSelection}
        />
      </div>

      <Paper p="sm" withBorder>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {totalCount} {totalCount === 1 ? "contact" : "contacts"} matching
          </Text>
          <Group gap="xs">
            <ActionIcon
              variant="filled"
              disabled={!previousUrl}
              onClick={() => previousUrl && fetchContacts(previousUrl)}
              aria-label="Previous page"
            >
              <IconChevronLeft size={18} />
            </ActionIcon>
            <ActionIcon
              variant="filled"
              disabled={!nextUrl}
              onClick={() => nextUrl && fetchContacts(nextUrl)}
              aria-label="Next page"
            >
              <IconChevronRight size={18} />
            </ActionIcon>
          </Group>
        </Group>
      </Paper>

      <Paper p="md" withBorder>
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            {selectedIds.size === 0
              ? "Select contacts to continue"
              : `${selectedIds.size} selected — ${selectedIds.size} ticket${selectedIds.size === 1 ? "" : "s"} will be created`}
          </Text>
          <Group gap="sm">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleContinue} disabled={selectedIds.size === 0}>
              Continue →
            </Button>
          </Group>
        </Group>
      </Paper>
    </Modal>
  );
}
