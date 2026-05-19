export interface TicketType {
  value: string;
  label: string;
}

export const TICKET_TYPE_LABELS: Record<string, string> = {
  UNKNOWN: "Unknown",
  INTRODUCTION: "Introduction",
  RECRUIT: "Recruit for event",
  CONFIRM: "Confirm event participation",
};

export const PRIORITY_OPTIONS = [
  { value: "0", label: "P0 – Emergency" },
  { value: "1", label: "P1 – Very High" },
  { value: "2", label: "P2 – High" },
  { value: "3", label: "P3 – Normal" },
  { value: "4", label: "P4 – Low" },
  { value: "5", label: "P5 – Very Low" },
];

export function getPriorityLabel(priority: number | string): string {
  const value = String(priority);
  return PRIORITY_OPTIONS.find((p) => p.value === value)?.label ?? `P${value}`;
}

export interface TicketTemplate {
  id: number;
  name: string;
  owner_id: number | null;
  is_global: boolean;
  forked_from_id: number | null;
  forked_from_name: string | null;
  can_edit: boolean;
  title_template: string;
  description_template: string;
  ticket_type: string;
  default_priority: number;
  requires_contact: boolean;
  requires_event: boolean;
  created_at: string;
  modified_at: string;
}

export interface Ticket {
  id: number;
  title: string;
  description: string;
  ticket_type: string;
  ticket_status: string;
  status_display?: string;
  contact: number;
  contact_display?: string;
  event: number;
  event_display?: string;
  type_display?: string;
  assigned_to: number;
  assigned_to_username?: string;
  reported_by: number;
  reported_by_username?: string;
  priority: number;
  priority_display?: string;
  created_at: string;
  modified_at: string;
  editable_fields?: string[];
}

export interface TicketAsk {
  id: number;
  status: string;
}

export interface TicketAskStatus {
  value: string;
  label: string;
}
