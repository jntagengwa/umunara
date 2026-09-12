import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'
import './public-site.css'

export const metadata: Metadata = {
  title: 'Umunara',
  description: 'Umunara community platform',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
