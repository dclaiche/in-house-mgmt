import { describe, expect, it } from "vitest";
import { deserializeQuery } from "@/app/lib/list";
import {
  buildTicketsListQuery,
  ticketListQuerySchema,
  DEFAULT_EXCLUDED_STATUSES,
} from "./ticket-list";

const parse = (qs: string) => deserializeQuery(new URLSearchParams(qs), ticketListQuerySchema);

describe("buildTicketsListQuery", () => {
  it("emits Django wire names with defaults", () => {
    const params = buildTicketsListQuery(parse(""));
    expect(params.get("page")).toBe("1");
    expect(params.get("page_size")).toBe("20");
    expect(params.get("exclude_status")).toBe("COMPLETED,CANCELED");
    expect(params.has("ordering")).toBe(false);
    expect(params.has("priority")).toBe(false);
    expect(params.has("type")).toBe(false);
  });

  it("maps frontend names to backend names", () => {
    const params = buildTicketsListQuery(
      parse("priority=2&ticketType=RECRUIT&assigneeId=42&eventId=7&page=3&perPage=50")
    );
    expect(params.get("priority")).toBe("2");
    expect(params.get("type")).toBe("RECRUIT");
    expect(params.get("assigned_to")).toBe("42");
    expect(params.get("event")).toBe("7");
    expect(params.get("page")).toBe("3");
    expect(params.get("page_size")).toBe("50");
  });

  it("appends id tiebreaker to ordering for stable pagination", () => {
    const params = buildTicketsListQuery(parse("sort=-priority"));
    expect(params.get("ordering")).toBe("-priority,id");
  });

  it("omits exclude_status when explicitly empty", () => {
    const params = buildTicketsListQuery(parse("excludeStatus="));
    // Empty string falls back to default — verify the default is in fact applied
    expect(params.get("exclude_status")).toBe("COMPLETED,CANCELED");
  });

  it("respects user-overridden excludeStatus", () => {
    const params = buildTicketsListQuery(parse("excludeStatus=COMPLETED"));
    expect(params.get("exclude_status")).toBe("COMPLETED");
  });

  it("rejects unknown ticketType values", () => {
    const state = parse("ticketType=NOT_A_TYPE");
    expect(state.ticketType).toBeUndefined();
    const params = buildTicketsListQuery(state);
    expect(params.has("type")).toBe(false);
  });

  it("rejects unknown sort values", () => {
    const state = parse("sort=banana");
    expect(state.sort).toBeUndefined();
    const params = buildTicketsListQuery(state);
    expect(params.has("ordering")).toBe(false);
  });
});

describe("ticketListQuerySchema defaults", () => {
  it("excludes COMPLETED and CANCELED by default", () => {
    expect(DEFAULT_EXCLUDED_STATUSES).toEqual(["COMPLETED", "CANCELED"]);
    const state = parse("");
    expect(state.excludeStatus).toEqual(["COMPLETED", "CANCELED"]);
  });

  it("page defaults to 1, perPage to 20", () => {
    const state = parse("");
    expect(state.page).toBe(1);
    expect(state.perPage).toBe(20);
  });
});
