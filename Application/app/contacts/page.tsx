"use client";

import {
  ActionIcon,
  Button,
  Container,
  Group,
  Modal,
  MultiSelect,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDebouncedValue } from "@mantine/hooks";
import { apiClient } from "@/app/lib/apiClient";
import { useForm } from "@mantine/form";
import { TicketBulkCreateModal } from "@/app/components/tickets/TicketBulkCreateModal";
import ContactTable, { type Contact, type Tag } from "@/app/components/ContactTable";
import ContactsFilterBar, { type ContactsFilterValues } from "@/app/components/ContactsFilterBar";
import { type EventCategory } from "@/app/components/event-utils";
import "./page.css";

const MAX_TAG_COUNT = 99999;
const CONTACT_FILTER_DEBOUNCE_MS = 300;
const RANGE_LIMITS: [number, number] = [0, 20];

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [bulkTicketModalOpen, setBulkTicketModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<"any" | "all">("any");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [eventRange, setEventRange] = useState<[number, number]>(RANGE_LIMITS);
  const [ticketRange, setTicketRange] = useState<[number, number]>(RANGE_LIMITS);
  const [tags, setTags] = useState<Tag[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [previousUrl, setPreviousUrl] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      discord_id: "",
      email: "",
      full_name: "",
      phone: "",
      tags: [],
    },
    validate: {
      discord_id: (value: string) => (!value ? "Discord ID is required" : null),
      full_name: (value: string) => (!value ? "Full name is required" : null),
      email: (value: string) => (value && !/^\S+@\S+$/.test(value) ? "Invalid email" : null),
    },
  });

  useEffect(() => {
    const fetchGroupsAndTags = async () => {
      try {
        const tagsData = await apiClient.get<Tag[] | { results: Tag[] }>(
          `/tags/?page_size=${MAX_TAG_COUNT}`
        );
        const tagsArray = Array.isArray(tagsData) ? tagsData : tagsData.results || [];
        setTags(tagsArray);
      } catch (error) {
        console.error("Error fetching groups and tags:", error);
        setTags([]);
      }
      try {
        const { results } = await apiClient.get<{ results: EventCategory[] }>("/event-categories/");
        setCategories(results || []);
      } catch {
        setCategories([]);
      }
    };
    fetchGroupsAndTags();
  }, []);

  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, CONTACT_FILTER_DEBOUNCE_MS);
  const [debouncedEventRange] = useDebouncedValue(eventRange, CONTACT_FILTER_DEBOUNCE_MS);
  const [debouncedTicketRange] = useDebouncedValue(ticketRange, CONTACT_FILTER_DEBOUNCE_MS);
  const [debouncedSelectedTagIds] = useDebouncedValue(selectedTagIds, CONTACT_FILTER_DEBOUNCE_MS);

  const fetchContacts = useCallback(
    async (url?: string) => {
      try {
        setLoading(true);

        let fetchUrl = url;

        if (!fetchUrl) {
          const params = new URLSearchParams();
          if (debouncedSearchQuery !== "") params.append("search", debouncedSearchQuery.trim());
          if (debouncedEventRange[0] > RANGE_LIMITS[0])
            params.append("min_events", debouncedEventRange[0].toString());
          if (debouncedEventRange[1] < RANGE_LIMITS[1])
            params.append("max_events", debouncedEventRange[1].toString());
          if (debouncedTicketRange[0] > RANGE_LIMITS[0])
            params.append("min_tickets", debouncedTicketRange[0].toString());
          if (debouncedTicketRange[1] < RANGE_LIMITS[1])
            params.append("max_tickets", debouncedTicketRange[1].toString());
          if (startDate !== null) params.append("start_date", startDate);
          if (endDate !== null) params.append("end_date", endDate);
          if (selectedCategoryId !== null) params.append("event_category_id", selectedCategoryId);
          if (debouncedSelectedTagIds.length > 0) {
            params.append("tag_ids", debouncedSelectedTagIds.join(","));
            params.append("tag_mode", tagMode);
          }
          fetchUrl = params.size > 0 ? `/contacts/?${params}` : "/contacts/";
        }

        const data = await apiClient.get<{
          results: Contact[];
          count: number;
          next: string | null;
          previous: string | null;
        }>(fetchUrl);

        setContacts(data.results);
        setTotalCount(data.count);
        setNextUrl(data.next);
        setPreviousUrl(data.previous);
      } catch (error) {
        console.error("Error fetching contacts:", error);
      } finally {
        setLoading(false);
      }
    },
    [
      endDate,
      debouncedEventRange,
      debouncedTicketRange,
      debouncedSearchQuery,
      selectedCategoryId,
      debouncedSelectedTagIds,
      tagMode,
      startDate,
    ]
  );

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleReset = () => {
    setSearchQuery("");
    setSelectedTagIds([]);
    setTagMode("any");
    setEventRange(RANGE_LIMITS);
    setTicketRange(RANGE_LIMITS);
    setStartDate(null);
    setEndDate(null);
    setSelectedCategoryId(null);
  };

  const handleRowClick = (contact: Contact) => {
    router.push(`/contacts/${contact.id}`);
  };

  const handleAddContact = () => {
    form.reset();
    setSelectedTags([]);
    setAddModalOpen(true);
  };

  const handleSubmitContact = async (values: typeof form.values) => {
    setSubmitting(true);
    try {
      const contactData = {
        discord_id: values.discord_id,
        full_name: values.full_name,
        email: values.email,
        phone: values.phone,
      };

      const newContact = await apiClient.post<Contact>("/contacts/", contactData);

      if (selectedTags.length > 0) {
        const tagAssignmentPromises = selectedTags.map((tagName) =>
          apiClient.post("/tag-assignments/", {
            contact_id: newContact.id,
            tag_name: tagName,
          })
        );
        await Promise.all(tagAssignmentPromises);
      }

      setAddModalOpen(false);
      form.reset();
      setSelectedTags([]);
      fetchContacts();
    } catch (error) {
      console.error("Error creating contact:", error);
      alert("Failed to create contact. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFilterChange = (changes: Partial<ContactsFilterValues>) => {
    if (changes.searchQuery !== undefined) setSearchQuery(changes.searchQuery);
    if (changes.startDate !== undefined) setStartDate(changes.startDate);
    if (changes.endDate !== undefined) setEndDate(changes.endDate);
    if (changes.tagMode !== undefined) setTagMode(changes.tagMode);
    if (changes.selectedTagIds !== undefined) setSelectedTagIds(changes.selectedTagIds);
    if (changes.selectedCategoryId !== undefined) setSelectedCategoryId(changes.selectedCategoryId);
    if (changes.eventRange !== undefined) setEventRange(changes.eventRange);
    if (changes.ticketRange !== undefined) setTicketRange(changes.ticketRange);
  };

  const toggleRowSelection = (id: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="md">
        {/* Header with title and action buttons */}
        <Group justify="space-between">
          <Title order={2}>Contacts</Title>
          <Button leftSection={<IconPlus size={16} />} onClick={handleAddContact}>
            Add contact
          </Button>
        </Group>

        <ContactsFilterBar
          values={{
            searchQuery,
            startDate,
            endDate,
            tagMode,
            selectedTagIds,
            selectedCategoryId,
            eventRange,
            ticketRange,
          }}
          onChange={handleFilterChange}
          tags={tags}
          categories={categories}
          onReset={handleReset}
        />

        {/* Create Tickets action bar */}
        <Paper p="sm" withBorder>
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              {selectedRows.size > 0
                ? `${selectedRows.size} selected`
                : "Select contacts to create tickets"}
            </Text>
            <Group gap="sm">
              <Button
                variant="light"
                onClick={() => setBulkTicketModalOpen(true)}
                disabled={selectedRows.size === 0}
              >
                Create Tickets
              </Button>
              <Button
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => setSelectedRows(new Set())}
                disabled={selectedRows.size === 0}
              >
                Clear
              </Button>
            </Group>
          </Group>
        </Paper>

        {/* Contacts Table */}
        <ContactTable
          contacts={contacts}
          loading={loading}
          onRowClick={handleRowClick}
          showTitle={false}
          selectedIds={selectedRows}
          toggleSelect={toggleRowSelection}
        />

        {/* Pagination, result and selected count */}
        <Paper p="sm" withBorder>
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <Text>
                {totalCount} {totalCount === 1 ? "contact" : "contacts"} found
              </Text>
            </Group>

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
      </Stack>

      {/* Add Contact Modal */}
      <Modal
        opened={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Contact"
        size="md"
      >
        <form onSubmit={form.onSubmit(handleSubmitContact)}>
          <Stack gap="md">
            <TextInput
              label="Discord ID"
              placeholder="Enter Discord ID"
              required
              {...form.getInputProps("discord_id")}
            />
            <TextInput
              label="Name"
              placeholder="Enter name"
              required
              {...form.getInputProps("full_name")}
            />
            <TextInput
              label="Email"
              placeholder="Enter email (optional)"
              type="email"
              {...form.getInputProps("email")}
            />
            <TextInput
              label="Phone"
              placeholder="Enter phone number (optional)"
              {...form.getInputProps("phone")}
            />

            <MultiSelect
              label="Tags"
              placeholder="Select tags"
              value={selectedTags}
              onChange={(value) => setSelectedTags(value || [])}
              data={tags.map((t) => ({ value: t.name, label: t.name }))}
              searchable
              clearable
            />

            <Group justify="flex-end" mt="md">
              <Button variant="outline" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Add Contact
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <TicketBulkCreateModal
        opened={bulkTicketModalOpen}
        onClose={() => setBulkTicketModalOpen(false)}
        contactIds={Array.from(selectedRows)}
        onSuccess={() => {
          setSelectedRows(new Set());
        }}
      />
    </Container>
  );
}
