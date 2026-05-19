"use client";

import { Anchor, Container, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { apiClient, ApiError } from "@/app/lib/apiClient";
import TemplateForm, { type TemplateFormValues } from "@/app/components/templates/TemplateForm";
import { useUser } from "@/app/components/provider/UserContext";

const EMPTY_VALUES: TemplateFormValues = {
  name: "",
  ticket_type: "UNKNOWN",
  default_priority: 3,
  requires_contact: false,
  requires_event: false,
  title_template: "",
  description_template: "",
};

function NewTemplateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useUser();

  const requestedScope = searchParams.get("scope");
  const scope: "global" | "personal" =
    requestedScope === "global" && isAdmin ? "global" : "personal";

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: TemplateFormValues) => {
    setSubmitting(true);
    try {
      const payload: TemplateFormValues & { is_global?: boolean } = { ...values };
      if (scope === "global") {
        payload.is_global = true;
      }
      await apiClient.post("/ticket-templates/", payload);
      notifications.show({
        title: "Created",
        message: `"${values.name}" created.`,
        color: "green",
      });
      router.push("/templates");
    } catch (e) {
      notifications.show({
        title: "Create failed",
        message: e instanceof ApiError ? e.message : "Unknown error",
        color: "red",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <Anchor component={Link} href="/templates" c="dimmed" size="sm">
          ← Ticket templates
        </Anchor>
        <TemplateForm
          mode="create"
          template={null}
          initialValues={EMPTY_VALUES}
          editable
          scope={scope}
          isAdmin={isAdmin}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => router.push("/templates")}
        />
      </Stack>
    </Container>
  );
}

export default function NewTemplatePage() {
  return (
    <Suspense fallback={null}>
      <NewTemplateContent />
    </Suspense>
  );
}
