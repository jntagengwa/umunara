import Link from 'next/link'

export function Pagination({
  page,
  pageSize,
  total,
  path,
}: {
  page: number
  pageSize: number
  total: number
  path: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1 && page === 1) return null
  return (
    <nav className="pagination" aria-label="Pagination">
      {page > 1 && <Link href={`${path}?page=${Math.min(page - 1, pages)}`}>Previous page</Link>}
      <span>{page > pages ? 'This page is no longer available.' : `Page ${page} of ${pages}`}</span>
      {page < pages && <Link href={`${path}?page=${page + 1}`}>Next page</Link>}
    </nav>
  )
}
