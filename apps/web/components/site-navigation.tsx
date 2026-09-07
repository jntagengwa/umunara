'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

const links = [
  ['/', 'Home'],
  ['/events', 'Calendar'],
  ['/blog', 'Blog'],
  ['/give', 'Donate'],
  ['/about-us', 'About Us'],
  ['/member', 'Members'],
] as const

export function SiteNavigation() {
  const [store] = useState(() => createStore<{ open: boolean }>(() => ({ open: false })))
  const open = useStore(store, (state) => state.open)
  const toggle = useRef<HTMLButtonElement>(null)
  return (
    <nav
      aria-label="Main navigation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          store.setState({ open: false })
          toggle.current?.focus()
        }
      }}
    >
      <button
        ref={toggle}
        className="menu-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => store.setState({ open: !open })}
      >
        Menu
      </button>
      <div id="site-menu" className={`site-menu${open ? ' is-open' : ''}`}>
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            onClick={() => store.setState({ open: false })}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
