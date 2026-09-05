import { z } from 'zod'
import { pageQuerySchema } from './pagination'

export const idSchema = z.string().uuid()
export const contentQuerySchema = pageQuerySchema
  .extend({
    scope: z.enum(['public', 'member', 'all']).default('public'),
  })
  .strict()
export type ContentQuery = z.infer<typeof contentQuerySchema>

const postFields = z
  .object({
    title: z.string().trim().min(1).max(300),
    slug: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    excerpt: z.string().max(1000).nullable(),
    content: z.string().max(200000),
    categoryId: idSchema.nullable(),
    status: z.enum(['draft', 'published']),
    visibility: z.enum(['public', 'member']),
  })
  .strict()

export const postCreateSchema = postFields.extend({
  excerpt: postFields.shape.excerpt.default(null),
  content: postFields.shape.content.default(''),
  categoryId: postFields.shape.categoryId.default(null),
  status: postFields.shape.status.default('draft'),
  visibility: postFields.shape.visibility.default('public'),
})
export const postUpdateSchema = postFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.')
export type PostUpdateInput = z.infer<typeof postUpdateSchema>

export const eventCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(200000).default(''),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).nullable().default(null),
    location: z.string().max(500).nullable().default(null),
    onlineUrl: z
      .string()
      .url()
      .refine((value) => /^https?:\/\//.test(value), 'Use an HTTP or HTTPS URL.')
      .nullable()
      .default(null),
    capacity: z.number().int().min(0).nullable().default(null),
    status: z.enum(['draft', 'published']).default('draft'),
    visibility: z.enum(['public', 'member']).default('public'),
  })
  .strict()
  .refine((value) => !value.endsAt || Date.parse(value.endsAt) >= Date.parse(value.startsAt), {
    message: 'End time must not precede start time.',
    path: ['endsAt'],
  })

export const settingKeySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/)
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(jsonValue),
  ]),
)
export const siteSettingUpdateSchema = z.object({ value: jsonValue }).strict()
