export {
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
  handlePagination,
  toBackendPageParams,
  makePaginatedResponse,
  type PaginationParams,
  type PaginatedServiceResponse,
  type PaginatedResponse,
} from "./pagination";

export {
  deserializeQuery,
  serializeQuery,
  deserializeQueryPaginationOptions,
  type QueryFieldDef,
  type QuerySchema,
  type TypedFromSchema,
  type SearchParamsLike,
} from "./deserializeQuery";

export { useListQuery, type UseListQueryOptions, type UseListQueryResult } from "./useListQuery";

export {
  defineListResource,
  buildListQuery,
  type ResourceConfig,
  type ListResource,
  type WireMap,
} from "./resource";
