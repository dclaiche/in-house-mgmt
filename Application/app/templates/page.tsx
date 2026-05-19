"use client";

import { Badge, Button, Container, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconLock, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiClient, ApiError } from "@/app/lib/apiClient";
import TemplatesTable from "@/app/components/templates/TemplatesTable";
import UseTemplateModal from "@/app/components/templates/UseTemplateModal";
import { TicketBulkCreateModal } from "@/app/components/tickets/TicketBulkCreateModal";
import { useUser } from "@/app/components/provider/UserContext";
import { type TicketTemplate } from "@/app/components/tickets/ticket-utils";

export default function TemplatesPage() {
  const { isAdmin } = useUser();

  const [templates, setTemplates] = useState<TicketTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTemplate, setActiveTemplate] = useState<TicketTemplate | null>(null);
  const [bulkContactIds, setBulkContactIds] = useState<number[] | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<{ results: TicketTemplate[] }>("/ticket-templates/");
      setTemplates(data.results || []);
    } catch (e) {
      notifications.show({
        title: "Failed to load templates",
        message: e instanceof Error ? e.message : "Unknown error",
        color: "red",
      });
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const { shared, mine } = useMemo(() => {
    return {
      shared: templates.filter((t) => t.is_global),
      mine: templates.filter((t) => !t.is_global),
    };
  }, [templates]);

  const handleUse = (template: TicketTemplate) => {
    setActiveTemplate(template);
  };

  const handleContinueToBulk = (contactIds: number[]) => {
    setBulkContactIds(contactIds);
  };

  const closeUseFlow = () => {
    setActiveTemplate(null);
    setBulkContactIds(null);
  };

  const pickerOpen = activeTemplate !== null && bulkContactIds === null;
  const bulkOpen = activeTemplate !== null && bulkContactIds !== null;

  const handleDelete = async (template: TicketTemplate) => {
    const message = template.is_global
      ? `Delete "${template.name}"? This template is shared with the whole org and deleting affects every organizer using it.`
      : `Delete "${template.name}"? This cannot be undone.`;
    if (!confirm(message)) return;

    try {
      await apiClient.delete(`/ticket-templates/${template.id}/`);
      notifications.show({
        title: "Deleted",
        message: `"${template.name}" was deleted.`,
        color: "green",
      });
      loadTemplates();
    } catch (e) {
      notifications.show({
        title: "Delete failed",
        message: e instanceof ApiError ? e.message : "Unknown error",
        color: "red",
      });
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={2}>Ticket Templates</Title>
          <Text c="dimmed" mt={4}>
            {isAdmin
              ? "Edits to shared templates affect every organizer using them."
              : "Shared templates are read-only. Use them as-is or save your own personal copy from the bulk-create flow."}
          </Text>
        </div>

        <Paper p="lg" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <Badge color="blue">Shared</Badge>
                <Title order={4}>Org-wide templates</Title>
              </Group>
              {isAdmin ? (
                <Button
                  leftSection={<IconPlus size={16} />}
                  component={Link}
                  href="/templates/new?scope=global"
                  size="xs"
                >
                  New global template
                </Button>
              ) : (
                <Group gap={4}>
                  <IconLock size={14} />
                  <Text size="xs" c="dimmed">
                    Read-only — managed by admins
                  </Text>
                </Group>
              )}
            </Group>

            {loading ? (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            ) : (
              <TemplatesTable
                templates={shared}
                variant="shared"
                onUse={handleUse}
                onDelete={handleDelete}
              />
            )}
          </Stack>
        </Paper>

        <Paper p="lg" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <Badge color="teal">Mine</Badge>
                <Title order={4}>My personal templates</Title>
              </Group>
              <Button
                leftSection={<IconPlus size={16} />}
                component={Link}
                href="/templates/new?scope=personal"
                size="xs"
              >
                New personal template
              </Button>
            </Group>

            {loading ? (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            ) : (
              <TemplatesTable
                templates={mine}
                variant="mine"
                onUse={handleUse}
                onDelete={handleDelete}
              />
            )}
          </Stack>
        </Paper>
      </Stack>

      <UseTemplateModal
        opened={pickerOpen}
        template={activeTemplate}
        onClose={closeUseFlow}
        onContinue={handleContinueToBulk}
      />

      <TicketBulkCreateModal
        opened={bulkOpen}
        onClose={closeUseFlow}
        contactIds={bulkContactIds ?? []}
        initialTemplate={activeTemplate}
        onSuccess={() => {
          closeUseFlow();
          loadTemplates();
        }}
      />
    </Container>
  );
}
