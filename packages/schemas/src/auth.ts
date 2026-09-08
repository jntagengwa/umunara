import { z } from 'zod'

export const signInSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128),
  })
  .strict()

export const signUpSchema = signInSchema
  .extend({
    password: z.string().min(8).max(128),
    fullName: z.string().trim().min(1).max(120),
  })
  .strict()

export type SignInInput = z.infer<typeof signInSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
export const authResultSchema = z.object({
  redirectTo: z.enum(['/account', '/check-email', '/sign-in']),
})
export type AuthResult = z.infer<typeof authResultSchema>
