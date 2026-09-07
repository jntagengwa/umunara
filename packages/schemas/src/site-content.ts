import { z } from 'zod'

export const homeHeroSchema = z
  .object({
    heading: z.string().trim().min(1, 'Enter a heading.').max(300),
    introduction: z.string().trim().min(1, 'Enter an introduction.').max(1000),
  })
  .strict()

export type HomeHero = z.infer<typeof homeHeroSchema>

export const defaultHomeHero: HomeHero = {
  heading: 'Welcome To Umunara, Inc',
  introduction: 'We are glad you took some time out of your busy schedule to check on us.',
}
