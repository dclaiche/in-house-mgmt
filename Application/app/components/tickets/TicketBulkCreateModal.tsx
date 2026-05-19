import {
  Modal,
  Select,
  TextInput,
  Textarea,
  Button,
  Checkbox,
  Group,
  Stack,
  Text,
  Tabs,
  Code,
  Badge,
} from "@mantine/core";
import { useState, useEffect, useMemo } from "react";
import { notifications } from "@mantine/notifications";
import { apiClient } from "@/app/lib/apiClient";
import {
  getPriorityLabel,
  PRIORITY_OPTIONS,
  TICKET_TYPE_LABELS,
  type TicketTemplate,
} from "@/app/components/tickets/ticket-utils";
import { SearchSelect, SearchSelectOption } from "@/app/components/SearchSelect";

interface Event {
  id: number;
  name: string;
  description: string;
  location_name: string;
  location_address: string;
  location_display: string;
  starts_at: string;
  ends_at: string;
  event_status: string;
}

interface Contact {
  id: number;
  full_name: string;
  discord_id: string;
  email: string;
  phone: string;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  contactIds: number[];
  initialTemplate?: TicketTemplate | null;
  onSuccess?: () => void;
}

function renderTemplate(
  templateStr: string,
  context: Record<string, Record<string, string>>
): string {
  if (!templateStr) return "";
  let result = templateStr;
  for (const [key, values] of Object.entries(context)) {
    for (const [field, value] of Object.entries(values)) {
      const regex = new RegExp(`{{\\s*${key}\\.${field}\\s*}}`, "g");
      result = result.replace(regex, value);
    }
  }
  return result;
}

async function fetchContact(id: number): Promise<Contact | null> {
  try {
    return await apiClient.get(`/contacts/${id}/`);
  } catch {
    return null;
  }
}

async function fetchEvent(id: number): Promise<Event | null> {
  try {
    return await apiClient.get(`/events/${id}/`);
  } catch {
    return null;
  }
}

export function TicketBulkCreateModal({
  opened,
  onClose,
  contactIds,
  initialTemplate,
  onSuccess,
}: Props) {
  useEffect(() => {
    if (opened) {
      if (initialTemplate) {
        setSelectedTemplate(initialTemplate);
        setTitle(initialTemplate.title_template);
        setDescription(initialTemplate.description_template);
        setTicketType(initialTemplate.ticket_type);
        setPriority(String(initialTemplate.default_priority));
      } else {
        setTitle("");
        setDescription("");
        setSelectedTemplate(null);
        setTicketType(null);
        setPriority(null);
      }
      setEvent(null);
      setAssignedToId(null);
      setSaveTemplateChecked(false);
      setSaveTemplateName("");
      setSaveTemplateNameTouched(false);
    }
  }, [opened, initialTemplate]);

  const [selectedTemplate, setSelectedTemplate] = useState<TicketTemplate | null>(null);
  const [ticketType, setTicketType] = useState<string | null>(null);
  const [ticketTypeOverridden, setTicketTypeOverridden] = useState(false);
  const [priority, setPriority] = useState<string | null>(null);
  const [priorityOverridden, setPriorityOverridden] = useState(false);
  const [event, setEvent] = useState<SearchSelectOption<Event> | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("template");
  const [saveTemplateChecked, setSaveTemplateChecked] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateNameTouched, setSaveTemplateNameTouched] = useState(false);

  useEffect(() => {
    if (!selectedTemplate) return;
    setTitle(selectedTemplate.title_template);
    setDescription(selectedTemplate.description_template);
    if (!priorityOverridden) {
      setPriority(String(selectedTemplate.default_priority));
    }
    if (!ticketTypeOverridden) {
      setTicketType(selectedTemplate.ticket_type);
    }
  }, [selectedTemplate, priorityOverridden, ticketTypeOverridden]);

  const [previewContextData, setPreviewContextData] = useState<
    Record<string, Record<string, string>>
  >({});

  useEffect(() => {
    const fetchContext = async () => {
      const ctx: Record<string, Record<string, string>> = {};
      if (contactIds.length > 0) {
        const contact = await fetchContact(contactIds[0]);
        if (contact) {
          ctx.contact = {
            id: String(contact.id),
            full_name: contact.full_name || "",
            discord_id: contact.discord_id || "",
            email: contact.email || "",
            phone: contact.phone || "",
            display_name: contact.full_name || contact.discord_id || String(contact.id),
          };
        }
      }
      if (event) {
        const ev = await fetchEvent(Number(event.id));
        if (ev) {
          ctx.event = {
            id: String(ev.id),
            name: ev.name || "",
            display_name: ev.name || "",
            description: ev.description || "",
            location_name: ev.location_name || "",
            location_address: ev.location_address || "",
            location_display: ev.location_display || "",
            starts_at: ev.starts_at || "",
            ends_at: ev.ends_at || "",
            status: ev.event_status || "",
          };
        }
      }
      setPreviewContextData(ctx);
    };
    fetchContext();
  }, [contactIds, event]);

  const previewTitle = useMemo(
    () => renderTemplate(title, previewContextData),
    [title, previewContextData]
  );
  const previewDescription = useMemo(
    () => renderTemplate(description, previewContextData),
    [description, previewContextData]
  );

  const isEdited = useMemo(() => {
    if (!selectedTemplate) {
      return title.trim().length > 0 || description.trim().length > 0;
    }
    return (
      title !== selectedTemplate.title_template ||
      description !== selectedTemplate.description_template
    );
  }, [selectedTemplate, title, description]);

  const loadedIsMine = selectedTemplate && !selectedTemplate.is_global;
  const saveMode: "create" | "update" = loadedIsMine ? "update" : "create";

  const defaultSaveName = useMemo(() => {
    if (selectedTemplate?.is_global) return `${selectedTemplate.name} (my copy)`;
    if (loadedIsMine) return selectedTemplate?.name ?? "";
    return title.split("{{")[0].trim();
  }, [selectedTemplate, loadedIsMine, title]);

  useEffect(() => {
    if (!saveTemplateNameTouched) {
      setSaveTemplateName(defaultSaveName);
    }
  }, [defaultSaveName, saveTemplateNameTouched]);

  const handleTemplateChange = (opt: SearchSelectOption<TicketTemplate> | null) => {
    const template = opt?.raw ?? null;
    setSelectedTemplate(template);
    setSaveTemplateChecked(false);
    setSaveTemplateNameTouched(false);
    if (template) {
      setTitle(template.title_template);
      setDescription(template.description_template);
      setPriority(String(template.default_priority));
      setPriorityOverridden(false);
      setTicketType(template.ticket_type);
      setTicketTypeOverridden(false);
    } else {
      setTicketType(null);
      setTicketTypeOverridden(false);
      setPriority(null);
      setPriorityOverridden(false);
    }
  };

  const handleTicketTypeChange = (value: string | null) => {
    setTicketType(value);
    setTicketTypeOverridden(true);
  };

  const handlePriorityChange = (value: string | null) => {
    setPriority(value);
    setPriorityOverridden(true);
  };

  const submit = async () => {
    // Check for missing required links
    const warnings: string[] = [];
    if (selectedTemplate?.requires_contact && contactIds.length === 0) {
      warnings.push("This template requires a contact, but no contacts were selected.");
    }
    if (selectedTemplate?.requires_event && !event) {
      warnings.push("This template requires an event, but none was selected.");
    }

    if (warnings.length > 0) {
      const proceed = confirm(
        warnings.join("\n\n") + "\n\nAre you sure you want to create these tickets?"
      );
      if (!proceed) return;
    }

    setLoading(true);

    const payload: Record<string, unknown> = {
      contact_ids: contactIds.map(Number),
      ticket_status: "OPEN",
      title,
      description,
      ticket_type: ticketType || "UNKNOWN",
    };

    if (selectedTemplate) {
      payload.template_id = selectedTemplate.id;
    }
    if (event) payload.event_id = Number(event.id);
    if (assignedToId) payload.assigned_to_id = Number(assignedToId);
    if (priority !== null) payload.priority = Number(priority);

    if (saveTemplateChecked && isEdited) {
      if (saveMode === "create") {
        payload.save_template = { mode: "create", name: saveTemplateName.trim() };
      } else if (selectedTemplate) {
        payload.save_template = { mode: "update", target_id: selectedTemplate.id };
      }
    }

    try {
      const response = await apiClient.post<{
        created_count: number;
        template?: { id: number; name: string; action: "created" | "updated" };
      }>("/tickets/bulk/", payload);
      const count = response.created_count;
      let message = `Successfully created ${count} ticket${count === 1 ? "" : "s"}!`;
      if (response.template) {
        message +=
          response.template.action === "created"
            ? ` Saved personal template "${response.template.name}".`
            : ` Updated personal template "${response.template.name}".`;
      }
      notifications.show({ title: "Success", message, color: "green" });
      onSuccess?.();
      onClose();
    } catch (err) {
      notifications.show({
        title: "Error",
        message: err instanceof Error ? err.message : "Unknown error",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Bulk Create Tickets" size="xl" centered>
      <Stack gap="md">
        <Group grow align="flex-start">
          {/* Template */}
          <Stack gap={4}>
            <SearchSelect<TicketTemplate>
              endpoint="/api/ticket-templates/"
              label="Template"
              placeholder="Select template"
              limit={10}
              value={
                selectedTemplate
                  ? { id: selectedTemplate.id, label: selectedTemplate.name, raw: selectedTemplate }
                  : null
              }
              onChange={handleTemplateChange}
              clearable
              mapResult={(tpl) => ({
                id: tpl.id,
                label: tpl.name,
                raw: tpl,
              })}
            />
            {selectedTemplate &&
              (selectedTemplate.is_global ? (
                <Badge size="xs" color="blue" variant="light">
                  Shared · read-only template
                </Badge>
              ) : (
                <Badge size="xs" color="teal" variant="light">
                  Mine · personal template
                </Badge>
              ))}
          </Stack>

          {/* Event */}
          <SearchSelect<Event>
            endpoint="/api/events/"
            label="Event"
            placeholder="Search events"
            limit={5}
            value={event}
            onChange={setEvent}
            clearable
            mapResult={(ev) => ({
              id: ev.id,
              label: `${ev.name} (id: ${ev.id})`,
              raw: ev,
            })}
          />
        </Group>

        <Group grow>
          {/* Ticket Type */}
          <Select
            label="Ticket Type"
            placeholder={
              selectedTemplate
                ? `${TICKET_TYPE_LABELS[selectedTemplate.ticket_type] || selectedTemplate.ticket_type} (DEFAULT)`
                : "Select ticket type"
            }
            data={Object.entries(TICKET_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            value={ticketType}
            onChange={handleTicketTypeChange}
            clearable
          />

          {/* Priority */}
          <Select
            label="Priority"
            placeholder={
              selectedTemplate
                ? `${getPriorityLabel(selectedTemplate.default_priority)} (DEFAULT)`
                : "Select priority"
            }
            data={PRIORITY_OPTIONS}
            value={priority}
            onChange={handlePriorityChange}
            clearable
            disabled={!selectedTemplate}
          />
        </Group>

        {/* Template/Preview Tabs */}
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          style={{ flex: 1, display: "flex", flexDirection: "column" }}
        >
          <Tabs.List>
            <Tabs.Tab value="template">Template</Tabs.Tab>
            <Tabs.Tab value="preview">
              Preview
              {contactIds.length > 0 && (
                <Badge size="xs" ml={4}>
                  {contactIds.length}
                </Badge>
              )}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel
            value="template"
            pt="sm"
            style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          >
            <Stack gap="sm" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <TextInput
                label="Title Template"
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                placeholder="{{contact.display_name}} - Intro"
              />
              <Textarea
                label="Description Template"
                minRows={8}
                autosize
                value={description}
                onChange={(e) => setDescription(e.currentTarget.value)}
                placeholder="Hi {{contact.discord_id}}, ..."
                style={{ flex: 1, minHeight: 200 }}
              />
              <Text size="xs" c="dimmed">
                Use <Code ff="monospace">{"{{contact.field}}"}</Code> or{" "}
                <Code ff="monospace">{"{{event.field}}"}</Code> to insert dynamic values.
              </Text>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel
            value="preview"
            pt="sm"
            style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          >
            <Stack gap="sm" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <TextInput label="Rendered Title" value={previewTitle} readOnly variant="filled" />
              <Textarea
                label="Rendered Description"
                minRows={10}
                autosize
                value={previewDescription}
                readOnly
                variant="filled"
                style={{ flex: 1, minHeight: 200 }}
              />
              {contactIds.length > 1 && (
                <Text size="xs" c="dimmed">
                  Preview shows first contact ({contactIds.length} total)
                </Text>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {isEdited && (
          <Stack gap={4} pt="xs" style={{ borderTop: "1px solid var(--mantine-color-gray-3)" }}>
            <Group gap="sm" wrap="nowrap" align="center">
              <Checkbox
                checked={saveTemplateChecked}
                onChange={(e) => setSaveTemplateChecked(e.currentTarget.checked)}
                label={
                  saveMode === "update" ? (
                    <Text size="sm">
                      Update <em>{selectedTemplate?.name}</em> with these edits
                    </Text>
                  ) : (
                    <Text size="sm">Save as a new personal template</Text>
                  )
                }
              />
              {saveMode === "create" && (
                <TextInput
                  placeholder="Name this template"
                  value={saveTemplateName}
                  onChange={(e) => {
                    setSaveTemplateName(e.currentTarget.value);
                    setSaveTemplateNameTouched(true);
                  }}
                  disabled={!saveTemplateChecked}
                  style={{ flex: 1 }}
                />
              )}
            </Group>
          </Stack>
        )}

        {/* Footer */}
        <Group justify="space-between" mt="md">
          <Text size="sm" c="dimmed">
            {contactIds.length === 0
              ? "No tickets will be created"
              : `${contactIds.length} ticket${contactIds.length !== 1 ? "s" : ""} will be created`}
            {saveTemplateChecked &&
              isEdited &&
              ` · 1 personal template will be ${saveMode === "update" ? "updated" : "saved"}`}
          </Text>

          <Group>
            <Button variant="default" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={submit} loading={loading} disabled={contactIds.length === 0}>
              Create Tickets
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
