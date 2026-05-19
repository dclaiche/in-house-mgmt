"use client";

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconGitFork, IconLock } from "@tabler/icons-react";
import { useState } from "react";
import {
  getPriorityLabel,
  TICKET_TYPE_LABELS,
  type TicketTemplate,
} from "@/app/components/tickets/ticket-utils";

export interface TemplateFormValues {
  name: string;
  ticket_type: string;
  default_priority: number;
  requires_contact: boolean;
  requires_event: boolean;
  title_template: string;
  description_template: string;
}

const SAMPLE_CONTACTS = [
  { label: "GetMoneyDre", id: "832238143078912014" },
  { label: "Eddie", id: "750118582876110930" },
  { label: "BernieFlanders", id: "386393162710515752" },
  { label: "D.J.", id: "131855843002941441" },
];

function renderPreview(source: string, contact: (typeof SAMPLE_CONTACTS)[number]): string {
  const ctx: Record<string, string> = {
    "contact.id": contact.id,
    "contact.discord_id": contact.id,
    "contact.display_name": contact.label,
    "contact.full_name": contact.label,
    "event.name": "(no event selected)",
    "event.starts_at": "(no date)",
  };
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => ctx[key] ?? match);
}

interface TemplateFormProps {
  mode: "create" | "edit";
  template: TicketTemplate | null;
  initialValues: TemplateFormValues;
  editable: boolean;
  scope: "global" | "personal";
  isAdmin: boolean;
  submitting: boolean;
  deleting?: boolean;
  onSubmit: (values: TemplateFormValues) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export default function TemplateForm({
  mode,
  template,
  initialValues,
  editable,
  scope,
  isAdmin,
  submitting,
  deleting,
  onSubmit,
  onDelete,
  onCancel,
}: TemplateFormProps) {
  const [values, setValues] = useState<TemplateFormValues>(initialValues);
  const [previewContactIdx, setPreviewContactIdx] = useState(0);
  const contact = SAMPLE_CONTACTS[previewContactIdx];

  const handleChange = <K extends keyof TemplateFormValues>(
    key: K,
    value: TemplateFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const headerBadge =
    scope === "global" ? <Badge color="blue">Shared</Badge> : <Badge color="teal">Mine</Badge>;

  const adminWarning = editable && scope === "global" && isAdmin;
  const showForkOrigin =
    template?.forked_from_id !== null && template?.forked_from_id !== undefined;

  return (
    <Stack gap="xl">
      <div>
        <Group gap="sm" align="center">
          <Title order={2} style={{ wordBreak: "break-word" }}>
            {mode === "create"
              ? scope === "global"
                ? "New global template"
                : "New personal template"
              : template?.name || "(unnamed)"}
          </Title>
          {headerBadge}
          {!editable && (
            <Group gap={4}>
              <IconLock size={16} />
              <Text size="sm" c="dimmed">
                Read-only
              </Text>
            </Group>
          )}
        </Group>

        {showForkOrigin && (
          <Text size="xs" c="dimmed" mt={6} component="div">
            <Group gap={4} component="span">
              <IconGitFork size={12} />
              {template?.forked_from_name
                ? `Forked from ${template.forked_from_name}`
                : "Forked from a deleted template"}
            </Group>
          </Text>
        )}

        {!editable && (
          <Text size="sm" c="dimmed" mt={6}>
            This template is managed by your admins.
          </Text>
        )}
      </div>

      {adminWarning && (
        <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
          {mode === "create"
            ? "This template will be available to every organizer."
            : "Editing this template will affect every organizer who uses it."}
        </Alert>
      )}

      <Paper p="lg" withBorder>
        <Stack gap="md">
          <TextInput
            label="Name"
            required
            disabled={!editable}
            value={values.name}
            onChange={(e) => handleChange("name", e.currentTarget.value)}
          />

          <Group grow>
            <Select
              label="Ticket type"
              disabled={!editable}
              data={Object.entries(TICKET_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              value={values.ticket_type}
              onChange={(v) => handleChange("ticket_type", v || "UNKNOWN")}
            />

            <NumberInput
              label="Default priority"
              min={0}
              max={5}
              disabled={!editable}
              value={values.default_priority}
              onChange={(v) => handleChange("default_priority", Number(v) || 3)}
              description={getPriorityLabel(values.default_priority)}
            />
          </Group>

          <Group grow>
            <Checkbox
              label="Requires contact"
              description="Tickets from this template must have a contact"
              disabled={!editable}
              checked={values.requires_contact}
              onChange={(e) => handleChange("requires_contact", e.currentTarget.checked)}
            />
            <Checkbox
              label="Requires event"
              description="Tickets from this template must have an event"
              disabled={!editable}
              checked={values.requires_event}
              onChange={(e) => handleChange("requires_event", e.currentTarget.checked)}
            />
          </Group>

          <TextInput
            label="Title template"
            description="Use {{contact.field}} or {{event.field}} for dynamic values"
            disabled={!editable}
            value={values.title_template}
            onChange={(e) => handleChange("title_template", e.currentTarget.value)}
          />

          <Textarea
            label="Description template"
            description="Use {{contact.field}} or {{event.field}} for dynamic values"
            minRows={8}
            autosize
            disabled={!editable}
            value={values.description_template}
            onChange={(e) => handleChange("description_template", e.currentTarget.value)}
          />
        </Stack>
      </Paper>

      <Paper p="lg" withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={4}>Preview</Title>
          <Select
            label="Sample contact"
            data={SAMPLE_CONTACTS.map((c, i) => ({ value: String(i), label: c.label }))}
            value={String(previewContactIdx)}
            onChange={(v) => setPreviewContactIdx(Number(v) || 0)}
            size="xs"
            style={{ minWidth: 200 }}
          />
        </Group>
        <Stack gap="xs">
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Rendered title
            </Text>
            <Text component="pre" size="sm" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {renderPreview(values.title_template, contact) || "(empty)"}
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Rendered description
            </Text>
            <Text component="pre" size="sm" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {renderPreview(values.description_template, contact) || "(empty)"}
            </Text>
          </div>
        </Stack>
      </Paper>

      <Group justify="space-between">
        <Group>
          {editable && onDelete && mode === "edit" && (
            <Button
              variant="outline"
              color="red"
              onClick={onDelete}
              loading={deleting}
              disabled={submitting}
            >
              Delete
            </Button>
          )}
        </Group>
        <Group>
          <Button variant="default" onClick={onCancel} disabled={submitting || deleting}>
            Cancel
          </Button>
          {editable && (
            <Button onClick={() => onSubmit(values)} loading={submitting} disabled={deleting}>
              {mode === "create" ? "Create template" : "Save changes"}
            </Button>
          )}
        </Group>
      </Group>
    </Stack>
  );
}
