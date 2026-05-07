import { describe, expect, it } from "vitest";
import { buildListQuery } from "./resource";
import { deserializeQueryPaginationOptions, type TypedFromSchema } from "./deserializeQuery";
import type { WireMap } from "./resource";

const baseSchema = {
  ...deserializeQueryPaginationOptions,
  q: { type: "string" as const },
  count: { type: "integer" as const, min: 0 },
  active: { type: "boolean" as const },
  tags: { type: "stringArray" as const, defaultValue: [] as string[] },
};

type BaseState = TypedFromSchema<typeof baseSchema>;

const state = (overrides: Partial<BaseState> = {}): BaseState => ({
  page: 1,
  perPage: 20,
  q: undefined,
  count: undefined,
  active: undefined,
  tags: [],
  ...overrides,
});

describe("buildListQuery", () => {
  it("emits DRF page/page_size by default", () => {
    const p = buildListQuery(state({ page: 3, perPage: 50 }), { schema: baseSchema });
    expect(p.get("page")).toBe("3");
    expect(p.get("page_size")).toBe("50");
  });

  it("omits fields whose value is undefined", () => {
    const p = buildListQuery(state(), { schema: baseSchema });
    expect(p.has("q")).toBe(false);
    expect(p.has("count")).toBe(false);
    expect(p.has("active")).toBe(false);
  });

  it("emits unmapped fields under their schema name when defined", () => {
    const p = buildListQuery(state({ q: "hello", count: 7, active: true }), { schema: baseSchema });
    expect(p.get("q")).toBe("hello");
    expect(p.get("count")).toBe("7");
    expect(p.get("active")).toBe("true");
  });

  it("renames a field via a string wire rule", () => {
    const p = buildListQuery(state({ count: 9 }), {
      schema: baseSchema,
      wire: { count: "total" },
    });
    expect(p.has("count")).toBe(false);
    expect(p.get("total")).toBe("9");
  });

  it("string wire rule still omits when value is undefined", () => {
    const p = buildListQuery(state(), {
      schema: baseSchema,
      wire: { count: "total" },
    });
    expect(p.has("total")).toBe(false);
  });

  it("function wire rule receives params, the field value, and full state", () => {
    let seenValue: unknown;
    let seenState: unknown;
    buildListQuery(state({ q: "abc", count: 5 }), {
      schema: baseSchema,
      wire: {
        q: (params, value, s) => {
          seenValue = value;
          seenState = s;
          if (value !== undefined) params.set("search", `*${value}*`);
        },
      },
    });
    expect(seenValue).toBe("abc");
    expect(seenState).toMatchObject({ q: "abc", count: 5 });
  });

  it("function wire rule can transform array fields into comma-joined values", () => {
    const p = buildListQuery(state({ tags: ["red", "blue"] }), {
      schema: baseSchema,
      wire: {
        tags: (params, value) => {
          if (value.length > 0) params.set("tags", value.join(","));
        },
      },
    });
    expect(p.get("tags")).toBe("red,blue");
  });

  it("function wire rule can skip emission for default values", () => {
    const p = buildListQuery(state({ tags: [] }), {
      schema: baseSchema,
      wire: {
        tags: (params, value) => {
          if (value.length > 0) params.set("tags", value.join(","));
        },
      },
    });
    expect(p.has("tags")).toBe(false);
  });

  it("function wire rule can derive a wire value (e.g. sort tiebreaker)", () => {
    const sortSchema = {
      ...deserializeQueryPaginationOptions,
      sort: { type: "enum" as const, values: ["name", "-name"] as const },
    };
    const p = buildListQuery(
      { page: 1, perPage: 20, sort: "-name" as const },
      {
        schema: sortSchema,
        wire: {
          sort: (params, value) => {
            if (value !== undefined) params.set("ordering", `${value},id`);
          },
        },
      }
    );
    expect(p.get("ordering")).toBe("-name,id");
    expect(p.has("sort")).toBe(false);
  });

  it("honors a custom pageParams encoder (limit/offset style)", () => {
    const p = buildListQuery(state({ page: 3, perPage: 25 }), {
      schema: baseSchema,
      pageParams: ({ page, perPage }) => ({
        limit: String(perPage),
        offset: String((page - 1) * perPage),
      }),
    });
    expect(p.get("limit")).toBe("25");
    expect(p.get("offset")).toBe("50");
    expect(p.has("page")).toBe(false);
    expect(p.has("page_size")).toBe(false);
  });

  it("does not emit page/perPage through the wire loop even with a rule for them", () => {
    const p = buildListQuery(state({ page: 2 }), {
      schema: baseSchema,
      // A rule on page/perPage is ignored — pagination is owned by pageParams.
      wire: { page: "p" } as WireMap<typeof baseSchema>,
    });
    expect(p.has("p")).toBe(false);
    expect(p.get("page")).toBe("2");
  });
});
