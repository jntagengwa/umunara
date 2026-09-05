export interface PageQuery {
  page: number
  pageSize: number
}

export interface PaginatedResult<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
}

export function getPageRange({ page, pageSize }: PageQuery): { from: number; to: number } {
  const from = (page - 1) * pageSize

  return { from, to: from + pageSize - 1 }
}

export function toPaginatedResult<T>(
  data: T[] | null,
  total: number | null,
  query: PageQuery,
): PaginatedResult<T> {
  return {
    data: data ?? [],
    page: query.page,
    pageSize: query.pageSize,
    total: total ?? 0,
  }
}
