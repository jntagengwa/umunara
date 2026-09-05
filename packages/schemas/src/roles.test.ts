import { describe, expect, it } from 'vitest'

import { pageQuerySchema, requireRole, roleSchema } from './index'

describe('shared contracts', () => {
  it('accepts a bounded table query and rejects an unknown role', () => {
    expect(pageQuerySchema.parse({ page: '2', pageSize: '25' })).toEqual({
      page: 2,
      pageSize: 25,
    })
    expect(() => roleSchema.parse('owner')).toThrow()
  })

  it('requires the configured role or a higher role', () => {
    expect(() => requireRole('member', 'editor')).toThrow('editor role is required')
    expect(() => requireRole('admin', 'editor')).not.toThrow()
  })
})
