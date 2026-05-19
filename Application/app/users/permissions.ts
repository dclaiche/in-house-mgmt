import type { User } from "@/app/components/provider/types";

/** Reads the authoritative flag from /auth/user/, set by the backend's
 * can_manage_users check (is_superuser OR has auth.manage_users perm). */
export function canManageUsers(user: User | null | undefined): boolean {
  return Boolean(user?.can_manage_users);
}
