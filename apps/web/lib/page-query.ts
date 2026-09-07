export type PageSearchParams = Promise<{ page?: string | string[] }>

export async function readPageNumber(searchParams?: PageSearchParams): Promise<number> {
  const value = (await searchParams)?.page
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page <= 10000 ? page : 1
}
