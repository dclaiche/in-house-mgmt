import { apiClient } from "@/app/lib/apiClient";
import {
  toBackendPageParams,
  makePaginatedResponse,
  type PaginationParams,
  type PaginatedResponse,
} from "./pagination";
import type { QuerySchema, TypedFromSchema } from "./deserializeQuery";

/**
 * Per-field rule for translating typed list state into the wire URLSearchParams a backend expects.
 *
 * - string: rename — emit value under this wire key when defined.
 * - function: full control — callee decides whether and how to write to `params`. Use for
 *   array fields, composite values, or wire keys that need a derived suffix (e.g. a sort
 *   tiebreaker).
 *
 * Schema keys with no rule are emitted under their schema name when defined.
 */
type WireRule<S extends QuerySchema, K extends keyof S> =
  | string
  | ((params: URLSearchParams, value: TypedFromSchema<S>[K], state: TypedFromSchema<S>) => void);

export type WireMap<S extends QuerySchema> = { [K in keyof S]?: WireRule<S, K> };

interface DrfPaginated<T> {
  results: T[];
  count: number;
}

export interface ResourceConfig<S extends QuerySchema, TRow, TOut = TRow> {
  /** Backend path, e.g. "/tickets". */
  endpoint: string;
  /** URL state schema. Pass the same value used by `useListQuery`. */
  schema: S;
  /** Per-field wire rules. Unmapped fields are sent under their schema name when defined. */
  wire?: WireMap<S>;
  /** Per-row transform applied between the data layer and the UI. Defaults to identity. */
  present?: (row: TRow) => TOut;
  /** Encode pagination. Defaults to DRF's `{page, page_size}`. */
  pageParams?: (p: PaginationParams) => Record<string, string>;
}

export interface ListResource<S extends QuerySchema, TOut> {
  schema: S;
  fetcher: (state: TypedFromSchema<S>) => Promise<PaginatedResponse<TOut>>;
}

type PaginationFields = {
  page: { type: "integer"; defaultValue: number; min?: number; max?: number };
  perPage: { type: "integer"; defaultValue: number; min?: number; max?: number };
};

/**
 * Translate typed list state into the wire `URLSearchParams` per `cfg.schema` + `cfg.wire`.
 * Pure — no I/O. Exported so consumers can build URLs for non-fetch contexts (download links,
 * deep-link buttons) and so tests can exercise the mapping logic directly.
 */
export function buildListQuery<S extends QuerySchema & PaginationFields>(
  state: TypedFromSchema<S>,
  cfg: {
    schema: S;
    wire?: WireMap<S>;
    pageParams?: (p: PaginationParams) => Record<string, string>;
  }
): URLSearchParams {
  const pageParams = cfg.pageParams ?? toBackendPageParams;
  const wireMap = (cfg.wire ?? {}) as Record<string, WireRule<S, keyof S> | undefined>;
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(pageParams({ page: state.page, perPage: state.perPage }))) {
    params.set(k, v);
  }

  for (const key of Object.keys(cfg.schema)) {
    if (key === "page" || key === "perPage") continue;
    const value = (state as Record<string, unknown>)[key];
    const rule = wireMap[key];
    if (typeof rule === "function") {
      (rule as (p: URLSearchParams, v: unknown, s: TypedFromSchema<S>) => void)(
        params,
        value,
        state
      );
    } else if (value !== undefined) {
      params.set(rule ?? key, String(value));
    }
  }

  return params;
}

/**
 * Build a `{schema, fetcher}` pair ready for `useListQuery` from a declarative description of a
 * paginated list endpoint. Replaces the hand-written `buildXListQuery + fetchXList` pair for the
 * common case of "DRF endpoint + simple UI→wire renaming + occasional custom serialization".
 *
 * The function form of a wire rule is the escape hatch for cases the rename-only path can't
 * express: comma-joined arrays, conditional emission, derived suffixes, etc.
 *
 * Type constraint on `S`: schemas must include `page` and `perPage` integer fields with defaults
 * (i.e. spread `deserializeQueryPaginationOptions`). Non-paginated lists aren't supported here —
 * use `useListQuery` directly with a custom fetcher.
 */
export function defineListResource<S extends QuerySchema & PaginationFields, TRow, TOut = TRow>(
  cfg: ResourceConfig<S, TRow, TOut>
): ListResource<S, TOut> {
  const present = cfg.present ?? ((row: TRow) => row as unknown as TOut);

  return {
    schema: cfg.schema,
    fetcher: async (state) => {
      const params = buildListQuery(state, cfg);
      const qs = params.toString();
      const url = qs ? `${cfg.endpoint}?${qs}` : cfg.endpoint;
      const data = await apiClient.get<DrfPaginated<TRow>>(url);
      const service = { items: data.results ?? [], numItems: data.count ?? 0 };
      return makePaginatedResponse(service, {
        page: state.page,
        perPage: state.perPage,
        present,
      });
    },
  };
}
