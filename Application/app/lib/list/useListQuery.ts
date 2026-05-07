"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  deserializeQuery,
  serializeQuery,
  type QuerySchema,
  type TypedFromSchema,
} from "./deserializeQuery";
import type { PaginatedResponse } from "./pagination";

export interface UseListQueryResult<S extends QuerySchema, TOut> {
  state: TypedFromSchema<S>;
  setParam: <K extends keyof S>(key: K, value: TypedFromSchema<S>[K] | undefined) => void;
  setMany: (partial: Partial<TypedFromSchema<S>>) => void;
  reset: () => void;
  data: PaginatedResponse<TOut> | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  /** The serialized query string currently in the URL (without leading "?"). Useful for deep links. */
  queryString: string;
}

export interface UseListQueryOptions<S extends QuerySchema, TOut> {
  schema: S;
  fetcher: (state: TypedFromSchema<S>) => Promise<PaginatedResponse<TOut>>;
}

/**
 * Reads list state (filters/sort/pagination) from URL search params, drives a fetcher off it,
 * and writes back to the URL when the consumer calls setParam/setMany/reset.
 *
 * Why route updates use replace(): each filter change shouldn't pollute browser history.
 * Back-navigation from a detail page still restores filters because the URL at click-time
 * is captured in history naturally.
 */
export function useListQuery<S extends QuerySchema, TOut>({
  schema,
  fetcher,
}: UseListQueryOptions<S, TOut>): UseListQueryResult<S, TOut> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const queryString = searchParams.toString();
  // React Compiler memoizes this. Re-running deserializeQuery on each render is cheap
  // (a small handful of string parses) and keeps the linter happy about manual memos.
  const state = deserializeQuery(searchParams, schema);

  const writeState = useCallback(
    (next: Partial<TypedFromSchema<S>>) => {
      const merged = { ...state, ...next } as TypedFromSchema<S>;
      const serialized = serializeQuery(schema, merged).toString();
      const nextUrl = serialized ? `${pathname}?${serialized}` : pathname;
      router.replace(nextUrl, { scroll: false });
    },
    [state, pathname, router, schema]
  );

  const setParam = useCallback(
    <K extends keyof S>(key: K, value: TypedFromSchema<S>[K] | undefined) => {
      writeState({ [key]: value } as Partial<TypedFromSchema<S>>);
    },
    [writeState]
  );

  const setMany = useCallback(
    (partial: Partial<TypedFromSchema<S>>) => {
      writeState(partial);
    },
    [writeState]
  );

  const reset = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  const [data, setData] = useState<PaginatedResponse<TOut>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const refetch = useCallback(() => setRefreshToken((n) => n + 1), []);

  // Re-run only when the URL string actually changes — `state` is a new object every render.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetcherRef.current(state);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [queryString, refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state,
    setParam,
    setMany,
    reset,
    data,
    loading,
    error,
    refetch,
    queryString,
  };
}
