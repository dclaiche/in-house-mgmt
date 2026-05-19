"use client";

import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  LoadingOverlay,
  Menu,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBan,
  IconBrandDiscord,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDotsVertical,
  IconMail,
  IconPlus,
  IconSearch,
  IconUserPlus,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/app/lib/apiClient";
import { useUser } from "@/app/components/provider/UserContext";
import AddUserModal, { type Group as ManagedGroup } from "@/app/components/management/AddUserModal";
import { canManageUsers } from "./permissions";
import { MANAGEABLE_ROLES, type ManageableRole, primaryRole, type SubOrgUser } from "./types";
import PromoteContactsModal from "./components/PromoteContactsModal";
import EditUserFieldModal from "./components/EditUserFieldModal";

type EditTarget = { user: SubOrgUser; field: "discord_id" | "email" };

function RowActionsMenu({
  isActive,
  canToggleActive,
  viewerIsAdmin,
  onToggleActive,
  onEditDiscordId,
  onEditEmail,
}: {
  isActive: boolean;
  canToggleActive: boolean;
  viewerIsAdmin: boolean;
  onToggleActive: () => void;
  onEditDiscordId: () => void;
  onEditEmail: () => void;
}) {
  if (!canToggleActive && !viewerIsAdmin) return null;
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" aria-label="Row actions">
          <IconDotsVertical size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {viewerIsAdmin && (
          <>
            <Menu.Item leftSection={<IconBrandDiscord size={14} />} onClick={onEditDiscordId}>
              Edit Discord ID
            </Menu.Item>
            <Menu.Item leftSection={<IconMail size={14} />} onClick={onEditEmail}>
              Edit Email Address
            </Menu.Item>
          </>
        )}
        {viewerIsAdmin && canToggleActive && <Menu.Divider />}
        {canToggleActive && (
          <Menu.Item
            leftSection={isActive ? <IconBan size={14} /> : <IconCheck size={14} />}
            color={isActive ? "red" : "green"}
            onClick={onToggleActive}
          >
            {isActive ? "Deactivate" : "Activate"}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

const SUB_ORG_GROUPS_PARAM = MANAGEABLE_ROLES.join(",");

interface PaginatedSubOrgUsers {
  count: number;
  next: string | null;
  previous: string | null;
  results: SubOrgUser[];
}

export default function UsersPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [users, setUsers] = useState<SubOrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [previousUrl, setPreviousUrl] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [availableGroups, setAvailableGroups] = useState<ManagedGroup[]>([]);

  const allowed = canManageUsers(user);
  const viewerIsAdmin = Boolean(user?.groups.includes("ADMIN"));
  const roleOptions = useMemo(
    () =>
      MANAGEABLE_ROLES.filter((r) => viewerIsAdmin || r !== "ORGANIZER").map((r) => ({
        value: r,
        label: r,
      })),
    [viewerIsAdmin]
  );

  useEffect(() => {
    if (userLoading) return;
    if (!allowed) router.replace("/home");
  }, [allowed, userLoading, router]);

  const fetchUsers = useCallback(
    async (url?: string) => {
      try {
        setLoading(true);
        let fetchUrl = url;
        if (!fetchUrl) {
          const params = new URLSearchParams();
          params.set("groups", SUB_ORG_GROUPS_PARAM);
          params.set("include_admins", "true");
          if (searchQuery) params.set("search", searchQuery);
          fetchUrl = `/users/?${params}`;
        }
        const data = await apiClient.get<PaginatedSubOrgUsers>(fetchUrl);
        setUsers(data.results);
        setTotalCount(data.count);
        setNextUrl(data.next);
        setPreviousUrl(data.previous);
      } catch (err) {
        notifications.show({
          color: "red",
          title: "Failed to load users",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setLoading(false);
      }
    },
    [searchQuery]
  );

  useEffect(() => {
    if (allowed) fetchUsers();
  }, [allowed, fetchUsers]);

  useEffect(() => {
    if (!viewerIsAdmin) return;
    apiClient
      .get<ManagedGroup[]>("/management/groups/")
      .then(setAvailableGroups)
      .catch(() => setAvailableGroups([]));
  }, [viewerIsAdmin]);

  const updateUser = async (
    id: number,
    body: Partial<{ role: ManageableRole; is_active: boolean }>
  ) => {
    try {
      await apiClient.patch<SubOrgUser>(`/users/${id}/`, body);
      fetchUsers();
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Update failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (userLoading || !allowed) {
    return (
      <Container size="xl" py="xl">
        <LoadingOverlay visible />
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Users</Title>
          <Group gap="sm">
            <Button leftSection={<IconUserPlus size={16} />} onClick={() => setPromoteOpen(true)}>
              Promote contacts → users
            </Button>
            {viewerIsAdmin && (
              <Button
                variant="outline"
                leftSection={<IconPlus size={16} />}
                onClick={() => setAddOpen(true)}
              >
                Add User
              </Button>
            )}
          </Group>
        </Group>

        <Paper p="md" withBorder>
          <TextInput
            placeholder="Search by name or username..."
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </Paper>

        <Paper p="md" withBorder style={{ position: "relative", minHeight: 400 }}>
          <LoadingOverlay visible={loading} />
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Discord ID</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Last login</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7} style={{ textAlign: "center" }}>
                    <Text c="dimmed" py="xl">
                      No users yet. Promote a contact to get started.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                users.map((u) => {
                  const role = primaryRole(u);
                  const fullName =
                    [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username;
                  const discordId = u.discord_ids?.[0]?.discord_id ?? "";
                  const rowIsAdmin = Boolean(u.is_superuser);
                  return (
                    <Table.Tr key={u.id}>
                      <Table.Td>{fullName}</Table.Td>
                      <Table.Td>
                        <Text size="sm">{u.primary_email || "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {discordId || "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {rowIsAdmin ? (
                          <Badge color="red" variant="filled">
                            ADMIN
                          </Badge>
                        ) : !viewerIsAdmin && role === "ORGANIZER" ? (
                          <Badge color="blue" variant="filled">
                            ORGANIZER
                          </Badge>
                        ) : (
                          <Select
                            data={roleOptions}
                            value={role}
                            onChange={(v) =>
                              v && v !== role && updateUser(u.id, { role: v as ManageableRole })
                            }
                            allowDeselect={false}
                            size="xs"
                            w={130}
                          />
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Badge color={u.is_active ? "green" : "gray"} variant="light">
                          {u.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <RowActionsMenu
                          isActive={u.is_active}
                          canToggleActive={!rowIsAdmin && (viewerIsAdmin || role !== "ORGANIZER")}
                          viewerIsAdmin={viewerIsAdmin}
                          onToggleActive={() => updateUser(u.id, { is_active: !u.is_active })}
                          onEditDiscordId={() => setEditTarget({ user: u, field: "discord_id" })}
                          onEditEmail={() => setEditTarget({ user: u, field: "email" })}
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </Paper>

        <Paper p="sm" withBorder>
          <Group justify="space-between">
            <Text>
              {totalCount} {totalCount === 1 ? "user" : "users"}
            </Text>
            <Group gap="xs">
              <ActionIcon
                variant="filled"
                disabled={!previousUrl}
                onClick={() => previousUrl && fetchUsers(previousUrl)}
                aria-label="Previous page"
              >
                <IconChevronLeft size={18} />
              </ActionIcon>
              <ActionIcon
                variant="filled"
                disabled={!nextUrl}
                onClick={() => nextUrl && fetchUsers(nextUrl)}
                aria-label="Next page"
              >
                <IconChevronRight size={18} />
              </ActionIcon>
            </Group>
          </Group>
        </Paper>
      </Stack>

      <PromoteContactsModal
        opened={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        onPromoted={() => {
          setPromoteOpen(false);
          fetchUsers();
        }}
      />

      {viewerIsAdmin && (
        <AddUserModal
          opened={addOpen}
          onClose={() => setAddOpen(false)}
          onSuccess={fetchUsers}
          availableGroups={availableGroups}
        />
      )}

      {editTarget && (
        <EditUserFieldModal
          opened={true}
          onClose={() => setEditTarget(null)}
          onSaved={fetchUsers}
          userId={editTarget.user.id}
          field={editTarget.field}
          initialValue={
            editTarget.field === "discord_id"
              ? (editTarget.user.discord_ids?.[0]?.discord_id ?? "")
              : (editTarget.user.primary_email ?? "")
          }
        />
      )}
    </Container>
  );
}
