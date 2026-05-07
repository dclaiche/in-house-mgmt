"use client";

import { Table, Badge, Stack, Title, LoadingOverlay, Paper, Tooltip, Text } from "@mantine/core";
import { IconChevronUp, IconChevronDown, IconSelector } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useUser } from "@/app/components/provider/UserContext";
import { Ticket } from "./ticket-utils";
import { type TicketSort } from "./ticket-list";
import { RelativeTime } from "@/app/components/datetime";

type SortableField = "id" | "title" | "assigned_to_id" | "created_at";

interface TicketTableProps {
  tickets: Ticket[];
  loading?: boolean;
  showTitle?: boolean;
  sort?: TicketSort;
  onSortChange?: (sort: TicketSort | undefined) => void;
  onStatusToggle?: () => void;
  filterParams?: string;
}

export const getPriorityColor = (priority: number) => {
  if (priority < 1) return "red";
  if (priority < 3) return "orange";
  if (priority == 3) return "yellow";
  if (priority <= 5) return "gray";
  return "gray";
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case "OPEN":
      return "gray";
    case "TODO":
      return "gray";
    case "IN_PROGRESS":
      return "blue";
    case "BLOCKED":
      return "red";
    case "COMPLETED":
      return "DimGray";
    case "CANCELED":
      return "red";
    default:
      return "DimGray";
  }
};

function decodeSort(sort: TicketSort | undefined): {
  field: SortableField | null;
  direction: "asc" | "desc" | null;
} {
  if (!sort) return { field: null, direction: null };
  const desc = sort.startsWith("-");
  const field = (desc ? sort.slice(1) : sort) as SortableField;
  return { field, direction: desc ? "desc" : "asc" };
}

function nextSort(current: TicketSort | undefined, field: SortableField): TicketSort | undefined {
  const { field: curField, direction } = decodeSort(current);
  if (curField !== field) return field as TicketSort; // new field → asc
  if (direction === "asc") return `-${field}` as TicketSort; // asc → desc
  return undefined; // desc → off
}

export default function TicketTable({
  tickets,
  loading = false,
  showTitle = true,
  sort,
  onSortChange,
  onStatusToggle,
  filterParams,
}: TicketTableProps) {
  const router = useRouter();
  const { user } = useUser();

  const { field: sortField, direction: sortDirection } = decodeSort(sort);

  const handleSort = (field: SortableField) => {
    if (!onSortChange) return;
    onSortChange(nextSort(sort, field));
  };

  const getSortIcon = (field: SortableField) => {
    if (sortField !== field) {
      return <IconSelector size={14} style={{ opacity: 0.5 }} />;
    }
    if (sortDirection === "asc") {
      return <IconChevronUp size={14} />;
    }
    if (sortDirection === "desc") {
      return <IconChevronDown size={14} />;
    }
    return <IconSelector size={14} style={{ opacity: 0.5 }} />;
  };

  const sortableHeaderStyle = {
    cursor: "pointer",
    userSelect: "none" as const,
  };

  return (
    <Paper
      p="md"
      withBorder
      style={{ position: "relative", minHeight: "400px", overflowX: "auto" }}
    >
      <LoadingOverlay visible={loading} />
      <Stack gap="md">
        {showTitle && <Title order={4}>Available Tickets</Title>}
        <Table highlightOnHover horizontalSpacing="md" style={{ minWidth: 800 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={sortableHeaderStyle} onClick={() => handleSort("id")}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  ID {getSortIcon("id")}
                </span>
              </Table.Th>
              <Table.Th style={sortableHeaderStyle} onClick={() => handleSort("title")}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  Title {getSortIcon("title")}
                </span>
              </Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Priority</Table.Th>
              <Table.Th>
                <Tooltip
                  label="Click to toggle: Open → Closed → All"
                  position="top"
                  withArrow
                  transitionProps={{ transition: "pop", duration: 200 }}
                >
                  <span
                    style={{
                      cursor: onStatusToggle ? "pointer" : "default",
                      transition: "color 0.15s ease",
                    }}
                    onClick={onStatusToggle}
                  >
                    Status
                  </span>
                </Tooltip>
              </Table.Th>
              <Table.Th style={sortableHeaderStyle} onClick={() => handleSort("assigned_to_id")}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  Assigned {getSortIcon("assigned_to_id")}
                </span>
              </Table.Th>
              <Table.Th style={sortableHeaderStyle} onClick={() => handleSort("created_at")}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  Created {getSortIcon("created_at")}
                </span>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tickets.map((ticket) => (
              <Table.Tr
                key={ticket.id}
                onClick={() =>
                  router.push(`/tickets/${ticket.id}${filterParams ? `?${filterParams}` : ""}`)
                }
                style={{ cursor: "pointer" }}
              >
                <Table.Td>{ticket.id}</Table.Td>
                <Table.Td>{ticket.title}</Table.Td>
                <Table.Td>
                  <Badge variant="light">{ticket.type_display}</Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={getPriorityColor(ticket.priority)}>P{ticket.priority}</Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={getStatusColor(ticket.ticket_status)}>
                    {ticket.status_display}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text
                    size="sm"
                    mt={4}
                    fw={ticket.assigned_to === user?.id ? 600 : undefined}
                    c={!ticket.assigned_to ? "dimmed" : undefined}
                  >
                    {ticket.assigned_to_username ?? ticket.assigned_to ?? "None"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <RelativeTime
                    value={ticket.created_at}
                    size="sm"
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Paper>
  );
}
