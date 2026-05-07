import { describe, expect, it } from "vitest";
import {
  deserializeQuery,
  deserializeQueryPaginationOptions,
  serializeQuery,
} from "./deserializeQuery";

const sp = (s: string) => new URLSearchParams(s);

describe("deserializeQuery", () => {
  it("parses string fields", () => {
    const out = deserializeQuery(sp("name=alice"), {
      name: { type: "string" },
    });
    expect(out.name).toBe("alice");
  });

  it("returns defaultValue when missing", () => {
    const out = deserializeQuery(sp(""), {
      name: { type: "string", defaultValue: "anon" },
    });
    expect(out.name).toBe("anon");
  });

  it("parses integers and clamps to min/max", () => {
    const out = deserializeQuery(sp("page=0&perPage=999"), {
      ...deserializeQueryPaginationOptions,
    });
    expect(out.page).toBe(1); // clamped to min 1
    expect(out.perPage).toBe(999); // no max set
  });

  it("falls back to defaultValue on malformed integer", () => {
    const out = deserializeQuery(sp("page=banana"), {
      ...deserializeQueryPaginationOptions,
    });
    expect(out.page).toBe(1);
  });

  it("parses stringArray (comma-separated, trimmed)", () => {
    const out = deserializeQuery(sp("excludeStatus=COMPLETED, CANCELED"), {
      excludeStatus: { type: "stringArray", defaultValue: [] },
    });
    expect(out.excludeStatus).toEqual(["COMPLETED", "CANCELED"]);
  });

  it("parses booleans", () => {
    const a = deserializeQuery(sp("active=true"), { active: { type: "boolean" } });
    const b = deserializeQuery(sp("active=false"), { active: { type: "boolean" } });
    const c = deserializeQuery(sp("active=banana"), {
      active: { type: "boolean", defaultValue: false },
    });
    expect(a.active).toBe(true);
    expect(b.active).toBe(false);
    expect(c.active).toBe(false);
  });

  it("parses dates and falls back when malformed", () => {
    const fallback = new Date("2026-01-01T00:00:00Z");
    const a = deserializeQuery(sp("when=2026-05-05T00:00:00Z"), {
      when: { type: "date" },
    });
    const b = deserializeQuery(sp("when=not-a-date"), {
      when: { type: "date", defaultValue: fallback },
    });
    expect(a.when?.toISOString()).toBe("2026-05-05T00:00:00.000Z");
    expect(b.when).toBe(fallback);
  });

  it("parses enums and rejects unknown values", () => {
    const a = deserializeQuery(sp("color=red"), {
      color: { type: "enum", values: ["red", "green", "blue"] as const },
    });
    const b = deserializeQuery(sp("color=mauve"), {
      color: { type: "enum", values: ["red", "green", "blue"] as const, defaultValue: "red" },
    });
    expect(a.color).toBe("red");
    expect(b.color).toBe("red");
  });

  it("silently drops unknown URL keys", () => {
    const out = deserializeQuery(sp("page=2&unknownKey=42"), {
      ...deserializeQueryPaginationOptions,
    });
    expect(out).toEqual({ page: 2, perPage: 20 });
    expect("unknownKey" in out).toBe(false);
  });
});

describe("serializeQuery", () => {
  it("omits fields equal to defaultValue", () => {
    const params = serializeQuery(
      { ...deserializeQueryPaginationOptions },
      { page: 1, perPage: 20 }
    );
    expect(params.toString()).toBe("");
  });

  it("emits fields differing from defaults", () => {
    const params = serializeQuery(
      { ...deserializeQueryPaginationOptions },
      { page: 3, perPage: 20 }
    );
    expect(params.get("page")).toBe("3");
    expect(params.has("perPage")).toBe(false);
  });

  it("round-trips stringArray values", () => {
    const schema = {
      excludeStatus: { type: "stringArray" as const, defaultValue: ["A", "B"] },
    };
    const params = serializeQuery(schema, { excludeStatus: ["A", "C"] });
    expect(params.get("excludeStatus")).toBe("A,C");

    // Equal-to-default should be omitted
    const p2 = serializeQuery(schema, { excludeStatus: ["A", "B"] });
    expect(p2.has("excludeStatus")).toBe(false);
  });
});
