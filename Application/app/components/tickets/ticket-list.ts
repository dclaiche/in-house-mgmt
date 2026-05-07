import { apiClient } from "@/app/lib/apiClient";
import {
  deserializeQueryPaginationOptions,
  toBackendPageParams,
  type PaginatedServiceResponse,
  type TypedFromSchema,
} from "@/app/lib/list";
import type { Ticket } from "./ticket-utils";

export const TICKET_STATUS_VALUES = [
  "OPEN",
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELED",
] as const;

export const TICKET_TYPE_VALUES = [
  "UNKNOWN",
  "INTRODUCTION",
  "RECRUIT",
  "CONFIRM",
  "INTERNAL",
] as const;

export const TICKET_SORT_VALUES = [
  "priority",
  "-priority",
  "created_at",
  "-created_at",
  "title",
  "-title",
  "id",
  "-id",
  "assigned_to_id",
  "-assigned_to_id",
] as const;

export type TicketSort = (typeof TICKET_SORT_VALUES)[number];

export const DEFAULT_EXCLUDED_STATUSES: readonly string[] = ["COMPLETED", "CANCELED"];

export const ticketListQuerySchema = {
  ...deserializeQueryPaginationOptions,
  priority: { type: "integer" as const, min: 0, max: 5 },
  ticketType: { type: "enum" as const, values: TICKET_TYPE_VALUES },
  assigneeId: { type: "integer" as const, min: 1 },
  eventId: { type: "integer" as const, min: 1 },
  excludeStatus: {
    type: "stringArray" as const,
    defaultValue: [...DEFAULT_EXCLUDED_STATUSES],
  },
  sort: { type: "enum" as const, values: TICKET_SORT_VALUES },
};

export type TicketListState = TypedFromSchema<typeof ticketListQuerySchema>;

/**
 * Translate typed list state into the URLSearchParams Django expects.
 * Spirit of getXTableWhere: omit undefined fields, no "any" markers, plus a stable
 * tiebreaker (id ASC) appended to sort so paginated results don't reshuffle across pages.
 */
export function buildTicketsListQuery(state: TicketListState): URLSearchParams {
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(
    toBackendPageParams({ page: state.page, perPage: state.perPage })
  )) {
    params.set(k, v);
  }

  if (state.priority !== undefined) params.set("priority", String(state.priority));
  if (state.ticketType !== undefined) params.set("type", state.ticketType);
  if (state.assigneeId !== undefined) params.set("assigned_to", String(state.assigneeId));
  if (state.eventId !== undefined) params.set("event", String(state.eventId));
  if (state.excludeStatus.length > 0) params.set("exclude_status", state.excludeStatus.join(","));
  if (state.sort !== undefined) params.set("ordering", `${state.sort},id`);

  return params;
}

/**
 * Presenter — runs each row through a normalization step before it leaves the data layer.
 * Today this is near-identity; the seam exists so display fields can be centralized later
 * without leaking raw DB shapes to the UI.
 */
export function presentTicket(row: Ticket): Ticket {
  return row;
}

interface DrfPaginated<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

/**
 * Service-method analog: returns only { items, numItems }. The API/render layer enriches
 * with page, perPage, numPages via makePaginatedResponse.
 */
export async function fetchTicketsList(
  state: TicketListState
): Promise<PaginatedServiceResponse<Ticket>> {
  const qs = buildTicketsListQuery(state).toString();
  const data = await apiClient.get<DrfPaginated<Ticket>>(`/tickets?${qs}`);
  return { items: data.results ?? [], numItems: data.count ?? 0 };
}
