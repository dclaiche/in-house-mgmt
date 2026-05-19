"use client";

import { ActionIcon, Badge, Button, Group, Table, Text } from "@mantine/core";
import { IconEdit, IconGitFork, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import {
  getPriorityLabel,
  TICKET_TYPE_LABELS,
  type TicketTemplate,
} from "@/app/components/tickets/ticket-utils";

interface TemplatesTableProps {
  templates: TicketTemplate[];
  variant: "shared" | "mine";
  onUse: (template: TicketTemplate) => void;
  onDelete: (template: TicketTemplate) => void;
}

export default function TemplatesTable({
  templates,
  variant,
  onUse,
  onDelete,
}: TemplatesTableProps) {
  if (templates.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {variant === "shared"
          ? "No shared templates yet."
          : "No personal templates yet. Save one from the bulk-create flow or add one above."}
      </Text>
    );
  }

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: "40%" }}>Name</Table.Th>
          <Table.Th>Type</Table.Th>
          <Table.Th>Priority</Table.Th>
          <Table.Th>Requires</Table.Th>
          <Table.Th style={{ textAlign: "right" }}>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {templates.map((t) => (
          <Table.Tr key={t.id}>
            <Table.Td>
              <Link
                href={`/templates/${t.id}`}
                style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}
              >
                {t.name}
              </Link>
              {t.forked_from_id !== null && (
                <Text size="xs" c="dimmed" mt={2} component="div">
                  <Group gap={4} component="span">
                    <IconGitFork size={12} />
                    {t.forked_from_name
                      ? `Forked from ${t.forked_from_name}`
                      : "Forked from a deleted template"}
                  </Group>
                </Text>
              )}
            </Table.Td>
            <Table.Td>
              <Text size="sm">{TICKET_TYPE_LABELS[t.ticket_type] || t.ticket_type}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{getPriorityLabel(t.default_priority)}</Text>
            </Table.Td>
            <Table.Td>
              <Group gap={4}>
                {t.requires_contact && <Badge variant="light">Contact</Badge>}
                {t.requires_event && <Badge variant="light">Event</Badge>}
                {!t.requires_contact && !t.requires_event && (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                )}
              </Group>
            </Table.Td>
            <Table.Td>
              <Group gap="xs" justify="flex-end">
                <Button size="xs" variant="light" onClick={() => onUse(t)}>
                  Use
                </Button>
                {t.can_edit && (
                  <>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      component={Link}
                      href={`/templates/${t.id}`}
                      aria-label="Edit"
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => onDelete(t)}
                      aria-label="Delete"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </>
                )}
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
