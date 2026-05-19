export const MANAGEABLE_ROLES = ["ORGANIZER", "HELPER", "TRAINEE"] as const;
export type ManageableRole = (typeof MANAGEABLE_ROLES)[number];

export interface SubOrgUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  groups: string[];
  primary_email: string;
  discord_ids: { id: number; discord_id: string; active: boolean }[];
  is_superuser?: boolean;
  is_active: boolean;
  last_login: string | null;
}

export function primaryRole(user: { groups?: string[] }): ManageableRole | null {
  const groups = user.groups ?? [];
  for (const role of MANAGEABLE_ROLES) {
    if (groups.includes(role)) return role;
  }
  return null;
}
