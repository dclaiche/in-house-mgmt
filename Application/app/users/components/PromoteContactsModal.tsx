"use client";

import { ActionIcon, Button, Group, Modal, Paper, Select, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/app/lib/apiClient";
import ContactTable, {
  type Contact,
  type ContactRowData,
  type Tag,
} from "@/app/components/ContactTable";
import ContactsFilterBar, { type ContactsFilterValues } from "@/app/components/ContactsFilterBar";
import { type EventCategory } from "@/app/components/event-utils";
import { useUser } from "@/app/components/provider/UserContext";
import { MANAGEABLE_ROLES, type ManageableRole } from "../types";

const MAX_TAG_COUNT = 99999;
const CONTACT_FILTER_DEBOUNCE_MS = 300;
const RANGE_LIMITS: [number, number] = [0, 20];

interface PromoteResponse {
  created: Array<{ contact_id: number; user: { username: string } }>;
  skipped: Array<{ contact_id: number; reason: string }>;
  errors: Array<unknown>;
}

interface PromoteContactsModalProps {
  opened: boolean;
  onClose: () => void;
  onPromoted: () => void;
}

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

function toRowData(contact: Contact): ContactRowData {
  if (contact.is_user) return { ...contact, disabledReason: "Already a user" };
  if (contact.is_promotable === false) return { ...contact, disabledReason: "Discord ID required" };
  return contact;
}

export default function PromoteContactsModal({
  opened,
  onClose,
  onPromoted,
}: PromoteContactsModalProps) {
  const { user } = useUser();
  const viewerIsAdmin = Boolean(user?.groups.includes("ADMIN"));
  const assignableRoles = useMemo(
    () => MANAGEABLE_ROLES.filter((r) => viewerIsAdmin || r !== "ORGANIZER"),
    [viewerIsAdmin]
  );

  const [filters, setFilters] = useState<ContactsFilterValues>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<ContactRowData[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [previousUrl, setPreviousUrl] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [role, setRole] = useState<ManageableRole>("HELPER");
  const [submitting, setSubmitting] = useState(false);

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
        setRows(data.results.map(toRowData));
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

  const submit = async () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      const body = Array.from(selectedIds).map((contact_id) => ({ contact_id, role }));
      const result = await apiClient.post<PromoteResponse>("/users/", body);
      const parts = [
        result.created.length && `${result.created.length} created`,
        result.skipped.length && `${result.skipped.length} skipped`,
        result.errors.length && `${result.errors.length} failed`,
      ].filter(Boolean);
      notifications.show({
        color: result.errors.length ? "yellow" : "green",
        title: "Promotion complete",
        message: parts.join(", ") || "No changes",
      });
      onPromoted();
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Promotion failed",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Promote contacts to users"
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
        <Group justify="space-between" align="flex-end">
          <Group gap="md" align="flex-end">
            <Select
              label="Role"
              data={assignableRoles.map((r) => ({ value: r, label: r }))}
              value={role}
              onChange={(v) => v && setRole(v as ManageableRole)}
              allowDeselect={false}
              w={150}
            />
            <Text size="sm" c="dimmed">
              {selectedIds.size === 0
                ? "Select contacts to promote"
                : `${selectedIds.size} selected`}
            </Text>
          </Group>
          <Group gap="sm">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={selectedIds.size === 0} loading={submitting}>
              Promote {selectedIds.size || ""} {selectedIds.size === 1 ? "contact" : "contacts"}
            </Button>
          </Group>
        </Group>
      </Paper>
    </Modal>
  );
}
