import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from "./pagination";

export type QueryFieldDef =
  | { type: "string"; defaultValue?: string }
  | { type: "stringArray"; defaultValue?: string[] }
  | { type: "boolean"; defaultValue?: boolean }
  | { type: "date"; defaultValue?: Date }
  | { type: "integer"; defaultValue?: number; min?: number; max?: number }
  | { type: "float"; defaultValue?: number; min?: number; max?: number }
  | { type: "enum"; values: readonly string[]; defaultValue?: string };

export type QuerySchema = Record<string, QueryFieldDef>;

type FieldValue<F extends QueryFieldDef> = F extends { type: "string" }
  ? F extends { defaultValue: string }
    ? string
    : string | undefined
  : F extends { type: "stringArray" }
    ? F extends { defaultValue: string[] }
      ? string[]
      : string[] | undefined
    : F extends { type: "boolean" }
      ? F extends { defaultValue: boolean }
        ? boolean
        : boolean | undefined
      : F extends { type: "date" }
        ? F extends { defaultValue: Date }
          ? Date
          : Date | undefined
        : F extends { type: "integer" | "float" }
          ? F extends { defaultValue: number }
            ? number
            : number | undefined
          : F extends { type: "enum"; values: readonly (infer T)[] }
            ? F extends { defaultValue: string }
              ? T
              : T | undefined
            : never;

export type TypedFromSchema<S extends QuerySchema> = { [K in keyof S]: FieldValue<S[K]> };

export interface SearchParamsLike {
  get(name: string): string | null;
  getAll?(name: string): string[];
  forEach?(cb: (value: string, key: string) => void): void;
}

function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) n = min;
  if (max !== undefined && n > max) n = max;
  return n;
}

function parseField(raw: string | null, field: QueryFieldDef): unknown {
  if (raw === null || raw === "") {
    // Copy arrays so consumers can mutate the result without affecting the schema's default.
    if (field.type === "stringArray" && Array.isArray(field.defaultValue)) {
      return [...field.defaultValue];
    }
    return field.defaultValue;
  }
  switch (field.type) {
    case "string":
      return raw;
    case "stringArray": {
      const parts = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (parts.length > 0) return parts;
      return Array.isArray(field.defaultValue) ? [...field.defaultValue] : field.defaultValue;
    }
    case "boolean":
      if (raw === "true") return true;
      if (raw === "false") return false;
      return field.defaultValue;
    case "date": {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? field.defaultValue : d;
    }
    case "integer": {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n)) return field.defaultValue;
      return clamp(n, field.min, field.max);
    }
    case "float": {
      const n = Number.parseFloat(raw);
      if (!Number.isFinite(n)) return field.defaultValue;
      return clamp(n, field.min, field.max);
    }
    case "enum":
      return field.values.includes(raw) ? raw : field.defaultValue;
  }
}

export function deserializeQuery<S extends QuerySchema>(
  searchParams: SearchParamsLike,
  schema: S
): TypedFromSchema<S> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) {
    out[key] = parseField(searchParams.get(key), schema[key]);
  }
  return out as TypedFromSchema<S>;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  return false;
}

function serializeField(value: unknown, field: QueryFieldDef): string | null {
  if (value === undefined) return null;
  if (valuesEqual(value, field.defaultValue)) return null;
  switch (field.type) {
    case "string":
      return String(value);
    case "stringArray":
      return Array.isArray(value) ? (value as string[]).join(",") : null;
    case "boolean":
      return value ? "true" : "false";
    case "date":
      return value instanceof Date ? value.toISOString() : null;
    case "integer":
    case "float":
      return String(value);
    case "enum":
      return String(value);
  }
}

export function serializeQuery<S extends QuerySchema>(
  schema: S,
  state: Partial<TypedFromSchema<S>>
): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(schema)) {
    const v = serializeField(state[key as keyof typeof state], schema[key]);
    if (v !== null) params.set(key, v);
  }
  return params;
}

export const deserializeQueryPaginationOptions = {
  page: { type: "integer" as const, defaultValue: DEFAULT_PAGE, min: 1 },
  perPage: { type: "integer" as const, defaultValue: DEFAULT_PER_PAGE, min: 0 },
};
