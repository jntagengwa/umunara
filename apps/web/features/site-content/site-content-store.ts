'use client'

import { createStore } from 'zustand/vanilla'

type SubmitStatus = 'idle' | 'saving' | 'saved' | 'error'

export function createSiteContentStore() {
  return createStore<{
    status: SubmitStatus
    setStatus: (status: SubmitStatus) => void
  }>((set) => ({ status: 'idle', setStatus: (status) => set({ status }) }))
}
