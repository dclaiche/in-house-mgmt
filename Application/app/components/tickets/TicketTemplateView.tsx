"use client";

import {
  Container,
  Title,
  Grid,
  Paper,
  Group,
  Badge,
  Select,
  Stack,
  Text,
  Button,
  ActionIcon,
} from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { apiClient } from "@/app/lib/apiClient";
import TicketTable from "@/app/components/tickets/TicketTable";
import { useUser } from "@/app/components/provider/UserContext";
import { SearchSelect, type SearchSelectOption } from "@/app/components/SearchSelect";
import { type Ticket } from "@/app/components/tickets/ticket-utils";
import { makePaginatedResponse, useListQuery } from "@/app/lib/list";
import {
  fetchTicketsList,
  presentTicket,
  ticketListQuerySchema,
  type TicketSort,
  type TicketListState,
} from "@/app/components/tickets/ticket-list";

interface UserResult {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
}

interface EventResult {
  id: number;
  name: string;
}

const openStatusValues = ["OPEN", "TODO", "IN_PROGRESS", "BLOCKED"];
const closedStatusValues = ["COMPLETED", "CANCELED"];

const statusBadges = [
  { value: "OPEN", label: "Open" },
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "BLOCKED", label: "Blocked" },
];

interface TicketTemplateViewProps {
  title?: string;
  ticketTypes: { value: string; label: string }[];
}

export default function TicketTemplateView({
  title = "Ticket Queue Management",
  ticketTypes,
}: TicketTemplateViewProps) {
  const { user } = useUser();
  const fixedType = ticketTypes.length === 1 ? ticketTypes[0].value : null;

  const { state, setParam, setMany, reset, data, loading, queryString } = useListQuery({
    schema: ticketListQuerySchema,
    fetcher: async (s: TicketListState) => {
      const effective: TicketListState = fixedType
        ? { ...s, ticketType: fixedType as TicketListState["ticketType"] }
        : s;
      const service = await fetchTicketsList(effective);
      return makePaginatedResponse(service, {
        page: s.page,
        perPage: s.perPage,
        present: presentTicket,
      });
    },
  });

  const [priorities, setPriorities] = useState<{ value: string; label: string }[]>([]);

  // SearchSelect needs the option's label to display; URL only carries the ID.
  // The hydration effects below resolve the label when state arrives from the URL.
  const [assigneeOption, setAssigneeOption] = useState<SearchSelectOption<UserResult> | null>(null);
  const [eventOption, setEventOption] = useState<SearchSelectOption<EventResult> | null>(null);

  useEffect(() => {
    apiClient
      .get<{ value: number; label: string }[]>("/ticket-priorities")
      .then((d) => setPriorities(d.map((p) => ({ value: String(p.value), label: p.label }))))
      .catch(() => {});
  }, []);

  // Hydrate the assignee SearchSelect's label from `state.assigneeId` (which the URL carries) so
  // a shared / refreshed link shows the persisted user instead of an empty input. The
  // option-in-deps + id-match early-exit keeps this from looping after the effect's own setState.
  useEffect(() => {
    const id = state.assigneeId;
    if (id === undefined) return;
    if (assigneeOption && Number(assigneeOption.id) === id) return;
    let cancelled = false;
    apiClient
      .get<UserResult>(`/users/${id}/`)
      .then((u) => {
        if (cancelled) return;
        setAssigneeOption({
          id: u.id,
          label: u.first_name ? `${u.first_name} ${u.last_name} (${u.username})` : u.username,
          raw: u,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.assigneeId, assigneeOption]);

  // Same idea for the event SearchSelect — uses the standard DRF retrieve endpoint.
  useEffect(() => {
    const id = state.eventId;
    if (id === undefined) return;
    if (eventOption && Number(eventOption.id) === id) return;
    let cancelled = false;
    apiClient
      .get<EventResult>(`/events/${id}/`)
      .then((e) => {
        if (cancelled) return;
        setEventOption({ id: e.id, label: e.name, raw: e });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.eventId, eventOption]);

  // The displayed option is the cached one only when its id matches the URL state.
  // Direct-URL nav lands on `null` for one render until the hydration effect resolves the label.
  const displayedAssignee =
    state.assigneeId !== undefined && Number(assigneeOption?.id) === state.assigneeId
      ? assigneeOption
      : null;
  const displayedEvent =
    state.eventId !== undefined && Number(eventOption?.id) === state.eventId ? eventOption : null;

  const tickets: Ticket[] = data?.items ?? [];
  const totalCount = data?.numItems ?? 0;
  const numPages = data?.numPages ?? 1;
  const page = state.page;
  const hasPrevious = page > 1;
  const hasNext = page < numPages;

  const allOpenShown = !openStatusValues.some((s) => state.excludeStatus.includes(s));
  const assignedToMe = !!user && state.assigneeId === user.id;

  const setNewAssignee = (next: SearchSelectOption<UserResult> | null) => {
    setAssigneeOption(next);
    setParam("assigneeId", next ? Number(next.id) : undefined);
  };

  const toggleAssignedToMe = () => {
    if (assignedToMe) {
      setNewAssignee(null);
    } else if (user) {
      const meOption: SearchSelectOption<UserResult> = {
        id: user.id,
        label: user.first_name
          ? `${user.first_name} ${user.last_name} (${user.username})`
          : user.username,
        raw: {
          id: user.id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
        },
      };
      setNewAssignee(meOption);
    }
  };

  const setNewEvent = (next: SearchSelectOption<EventResult> | null) => {
    setEventOption(next);
    setParam("eventId", next ? Number(next.id) : undefined);
  };

  const toggleStatus = (statusValue: string) => {
    const newExcluded = state.excludeStatus.includes(statusValue)
      ? state.excludeStatus.filter((s) => s !== statusValue)
      : [...state.excludeStatus, statusValue];
    setMany({ excludeStatus: newExcluded, page: 1 });
  };

  const toggleAllOpen = () => {
    const allShown = !openStatusValues.some((s) => state.excludeStatus.includes(s));
    const newExcluded = allShown
      ? [...new Set([...state.excludeStatus, ...openStatusValues])]
      : state.excludeStatus.filter((s) => !openStatusValues.includes(s));
    setMany({ excludeStatus: newExcluded, page: 1 });
  };

  const onStatusToggle = () => {
    const hasExcludedClosed = closedStatusValues.some((s) => state.excludeStatus.includes(s));
    const hasExcludedOpen = openStatusValues.some((s) => state.excludeStatus.includes(s));
    let newExcluded: string[];
    if (!hasExcludedOpen && hasExcludedClosed) newExcluded = [...openStatusValues];
    else if (hasExcludedOpen && !hasExcludedClosed) newExcluded = [];
    else newExcluded = [...closedStatusValues];
    setMany({ excludeStatus: newExcluded, page: 1 });
  };

  const handleReset = () => {
    setAssigneeOption(null);
    setEventOption(null);
    reset();
  };

  return (
    <Container size="xl" py="xl">
      <Grid>
        <Grid.Col span={12}>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={2}>{title}</Title>
            </Group>

            <Paper p="md" withBorder>
              <Stack gap="md">
                <Group gap="xs">
                  <Badge
                    variant={allOpenShown ? "filled" : "outline"}
                    style={{ cursor: "pointer" }}
                    onClick={toggleAllOpen}
                  >
                    All
                  </Badge>
                  {statusBadges.map((s) => (
                    <Badge
                      key={s.value}
                      variant={state.excludeStatus.includes(s.value) ? "outline" : "filled"}
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleStatus(s.value)}
                    >
                      {s.label}
                    </Badge>
                  ))}
                  <Text c="dimmed">|</Text>
                  <Badge
                    color="gray"
                    variant={state.excludeStatus.includes("COMPLETED") ? "outline" : "filled"}
                    style={{ cursor: "pointer" }}
                    onClick={() => toggleStatus("COMPLETED")}
                  >
                    Completed
                  </Badge>
                  <Badge
                    color="red"
                    variant={state.excludeStatus.includes("CANCELED") ? "outline" : "filled"}
                    style={{ cursor: "pointer" }}
                    onClick={() => toggleStatus("CANCELED")}
                  >
                    Canceled
                  </Badge>
                </Group>

                <Group gap="md">
                  <Select
                    label="Priority"
                    value={state.priority !== undefined ? String(state.priority) : null}
                    onChange={(value) =>
                      setMany({
                        priority: value !== null ? Number(value) : undefined,
                        page: 1,
                      })
                    }
                    placeholder="All priorities"
                    clearable
                    data={priorities}
                    style={{ flex: 1 }}
                  />
                  {!fixedType && (
                    <Select
                      label="Type"
                      value={state.ticketType ?? null}
                      onChange={(value) =>
                        setMany({
                          ticketType: (value ?? undefined) as TicketListState["ticketType"],
                          page: 1,
                        })
                      }
                      placeholder="All types"
                      clearable
                      data={ticketTypes}
                      style={{ flex: 1 }}
                    />
                  )}
                  <SearchSelect<UserResult>
                    endpoint="/api/users/"
                    label="Assignee"
                    placeholder="Search users…"
                    value={displayedAssignee}
                    onChange={setNewAssignee}
                    clearable
                    disabled={assignedToMe}
                    mapResult={(u) => ({
                      id: u.id,
                      label: u.first_name
                        ? `${u.first_name} ${u.last_name} (${u.username})`
                        : u.username,
                      raw: u,
                    })}
                  />
                  <SearchSelect<EventResult>
                    endpoint="/events"
                    label="Event"
                    placeholder="Search events…"
                    value={displayedEvent}
                    onChange={setNewEvent}
                    clearable
                    mapResult={(e) => ({ id: e.id, label: e.name, raw: e })}
                  />
                </Group>

                <Group gap="sm">
                  <Button
                    color="green"
                    variant={assignedToMe ? "filled" : "outline"}
                    onClick={toggleAssignedToMe}
                  >
                    Assigned to me
                  </Button>
                  <Button variant="outline" onClick={handleReset}>
                    Reset
                  </Button>
                </Group>
              </Stack>
            </Paper>

            <TicketTable
              tickets={tickets}
              loading={loading}
              sort={state.sort}
              onSortChange={(next: TicketSort | undefined) => setMany({ sort: next, page: 1 })}
              filterParams={queryString}
              onStatusToggle={onStatusToggle}
            />

            <Paper p="sm" withBorder>
              <Group justify="space-between">
                <span>
                  {totalCount} {totalCount === 1 ? "ticket" : "tickets"} found
                  {numPages > 1 ? ` · page ${page} of ${numPages}` : null}
                </span>
                <Group gap="xs">
                  <ActionIcon
                    variant="filled"
                    disabled={!hasPrevious}
                    onClick={() => setParam("page", page - 1)}
                    aria-label="Previous page"
                  >
                    <IconChevronLeft size={18} />
                  </ActionIcon>
                  <ActionIcon
                    variant="filled"
                    disabled={!hasNext}
                    onClick={() => setParam("page", page + 1)}
                    aria-label="Next page"
                  >
                    <IconChevronRight size={18} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
