export class RepositoryError extends Error {
  constructor(public readonly code: string) {
    super('Database operation failed.')
    this.name = 'RepositoryError'
  }
}

export function databaseResult<T>(result: { data: T | null; error: { code: string } | null }): T {
  if (result.error) throw new RepositoryError(result.error.code)
  if (!result.data) throw new RepositoryError('PGRST116')
  return result.data
}
