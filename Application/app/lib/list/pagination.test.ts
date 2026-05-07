import { describe, expect, it } from "vitest";
import { handlePagination, makePaginatedResponse, toBackendPageParams } from "./pagination";

describe("handlePagination", () => {
  it("computes skip/take for page 1", () => {
    expect(handlePagination({ page: 1, perPage: 20 })).toEqual({ skip: 0, take: 20 });
  });

  it("computes skip/take for page 3", () => {
    expect(handlePagination({ page: 3, perPage: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it("returns take=0 when perPage is 0", () => {
    expect(handlePagination({ page: 1, perPage: 0 })).toEqual({ skip: 0, take: 0 });
  });
});

describe("toBackendPageParams", () => {
  it("maps to Django page/page_size names", () => {
    expect(toBackendPageParams({ page: 2, perPage: 50 })).toEqual({
      page: "2",
      page_size: "50",
    });
  });
});

describe("makePaginatedResponse", () => {
  const id = <T>(x: T) => x;

  it("computes numPages by ceil(numItems/perPage)", () => {
    const res = makePaginatedResponse(
      { items: [1, 2, 3], numItems: 47 },
      { page: 1, perPage: 20, present: id }
    );
    expect(res.numPages).toBe(3);
    expect(res.numItems).toBe(47);
    expect(res.page).toBe(1);
    expect(res.perPage).toBe(20);
  });

  it("returns numPages=0 when perPage is 0 (no rows)", () => {
    const res = makePaginatedResponse(
      { items: [], numItems: 0 },
      { page: 1, perPage: 0, present: id }
    );
    expect(res.numPages).toBe(0);
  });

  it("returns numPages=1 when zero items but non-zero perPage", () => {
    const res = makePaginatedResponse(
      { items: [], numItems: 0 },
      { page: 1, perPage: 20, present: id }
    );
    expect(res.numPages).toBe(1);
  });

  it("runs each row through the presenter", () => {
    const res = makePaginatedResponse(
      { items: [1, 2, 3], numItems: 3 },
      { page: 1, perPage: 20, present: (n: number) => n * 10 }
    );
    expect(res.items).toEqual([10, 20, 30]);
  });
});
