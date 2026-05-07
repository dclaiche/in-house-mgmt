export const DEFAULT_PAGE = 1;
export const DEFAULT_PER_PAGE = 20;

export interface PaginationParams {
  page: number;
  perPage: number;
}

export interface PaginatedServiceResponse<T> {
  items: T[];
  numItems: number;
}

export interface PaginatedResponse<T> extends PaginatedServiceResponse<T> {
  page: number;
  perPage: number;
  numPages: number;
}

export function handlePagination({ page, perPage }: PaginationParams): {
  skip: number;
  take: number;
} {
  return { skip: (page - 1) * perPage, take: perPage };
}

export function toBackendPageParams({ page, perPage }: PaginationParams): Record<string, string> {
  return { page: String(page), page_size: String(perPage) };
}

export function makePaginatedResponse<TRow, TOut>(
  service: PaginatedServiceResponse<TRow>,
  opts: { page: number; perPage: number; present: (row: TRow) => TOut }
): PaginatedResponse<TOut> {
  const { page, perPage, present } = opts;
  // perPage 0 is the explicit "no rows" signal — there are no pages to show.
  // Otherwise round up; clamp to 1 so an empty list still renders page 1.
  const numPages = perPage === 0 ? 0 : Math.max(1, Math.ceil(service.numItems / perPage));
  return {
    items: service.items.map(present),
    numItems: service.numItems,
    page,
    perPage,
    numPages,
  };
}
