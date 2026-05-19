"use client";

import { Anchor, Container, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { apiClient, ApiError } from "@/app/lib/apiClient";
import TemplateForm, { type TemplateFormValues } from "@/app/components/templates/TemplateForm";
import { useUser } from "@/app/components/provider/UserContext";
import { type TicketTemplate } from "@/app/components/tickets/ticket-utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TemplateDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { isAdmin } = useUser();

  const [template, setTemplate] = useState<TicketTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiClient.get<TicketTemplate>(`/ticket-templates/${id}/`);
        setTemplate(data);
      } catch (e) {
        notifications.show({
          title: "Failed to load template",
          message: e instanceof ApiError ? e.message : "Unknown error",
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleSubmit = async (values: TemplateFormValues) => {
    setSubmitting(true);
    try {
      await apiClient.patch(`/ticket-templates/${id}/`, values);
      notifications.show({ title: "Saved", message: "Template updated.", color: "green" });
      router.push("/templates");
    } catch (e) {
      notifications.show({
        title: "Save failed",
        message: e instanceof ApiError ? e.message : "Unknown error",
        color: "red",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    const message = template.is_global
      ? `Delete "${template.name}"? This template is shared with the whole org.`
      : `Delete "${template.name}"? This cannot be undone.`;
    if (!confirm(message)) return;

    setDeleting(true);
    try {
      await apiClient.delete(`/ticket-templates/${id}/`);
      notifications.show({
        title: "Deleted",
        message: `"${template.name}" was deleted.`,
        color: "green",
      });
      router.push("/templates");
    } catch (e) {
      notifications.show({
        title: "Delete failed",
        message: e instanceof ApiError ? e.message : "Unknown error",
        color: "red",
      });
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Text c="dimmed">Loading template…</Text>
      </Container>
    );
  }

  if (!template) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="sm">
          <Text>Template not found.</Text>
          <Anchor component={Link} href="/templates">
            ← Back to templates
          </Anchor>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <Anchor component={Link} href="/templates" c="dimmed" size="sm">
          ← Ticket templates
        </Anchor>
        <TemplateForm
          mode="edit"
          template={template}
          initialValues={{
            name: template.name,
            ticket_type: template.ticket_type,
            default_priority: template.default_priority,
            requires_contact: template.requires_contact,
            requires_event: template.requires_event,
            title_template: template.title_template,
            description_template: template.description_template,
          }}
          editable={template.can_edit}
          scope={template.is_global ? "global" : "personal"}
          isAdmin={isAdmin}
          submitting={submitting}
          deleting={deleting}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
          onCancel={() => router.push("/templates")}
        />
      </Stack>
    </Container>
  );
}
