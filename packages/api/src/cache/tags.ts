export const cacheTags = {
  profile: (id: string) => `profile:${id}`,
  posts: (scope: 'public' | 'member') => `posts:${scope}`,
  post: (slug: string) => `post:${slug}`,
  events: (scope: 'public' | 'member') => `events:${scope}`,
  siteSettings: (surface: string) => `site-settings:${surface}`,
} as const
