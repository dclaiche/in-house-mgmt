"use client";

import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { apiClient } from "@/app/lib/apiClient";

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  userId: number;
  field: "discord_id" | "email";
  initialValue: string;
}

const FIELD_META: Record<Props["field"], { title: string; label: string; placeholder: string }> = {
  discord_id: {
    title: "Edit Discord ID",
    label: "Discord ID",
    placeholder: "123456789012345678",
  },
  email: {
    title: "Edit Email Address",
    label: "Email",
    placeholder: "user@example.com",
  },
};

export default function EditUserFieldModal({
  opened,
  onClose,
  onSaved,
  userId,
  field,
  initialValue,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const meta = FIELD_META[field];

  const form = useForm({
    initialValues: { value: initialValue },
    validate: {
      value: (v) => {
        if (field === "email" && v.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          return "Please enter a valid email address";
        }
        return null;
      },
    },
  });

  useEffect(() => {
    if (opened) form.setValues({ value: initialValue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initialValue]);

  const handleSubmit = async ({ value }: { value: string }) => {
    setSubmitting(true);
    try {
      await apiClient.patch(`/management/users/${userId}/`, { [field]: value.trim() });
      notifications.show({
        color: "green",
        title: "Saved",
        message: `${meta.label} updated`,
      });
      onSaved();
      onClose();
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Update failed",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={meta.title} size="sm" centered>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <TextInput
            label={meta.label}
            placeholder={meta.placeholder}
            {...form.getInputProps("value")}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
