'use client'

import { useState, type FormEvent } from 'react'
import { useStore } from 'zustand'
import { homeHeroSchema, type HomeHero } from '@umunara/schemas'
import { createSiteContentStore } from './site-content-store'

export function SiteContentForm({ initialValue }: { initialValue: HomeHero }) {
  const [store] = useState(createSiteContentStore)
  const status = useStore(store, (state) => state.status)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (store.getState().status === 'saving') return
    const form = new FormData(event.currentTarget)
    const result = homeHeroSchema.safeParse({
      heading: form.get('heading'),
      introduction: form.get('introduction'),
    })
    if (!result.success) {
      setError(result.error.issues[0].message)
      store.getState().setStatus('error')
      return
    }
    store.getState().setStatus('saving')
    setError('')
    try {
      const response = await fetch('/api/v1/site-settings/home-hero', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: result.data }),
      })
      if (!response.ok) throw new Error('Save failed')
      store.getState().setStatus('saved')
    } catch {
      setError('Unable to save home content. Check your access and try again.')
      store.getState().setStatus('error')
    }
  }

  return (
    <form
      className="content-form"
      onSubmit={save}
      aria-label="Home content"
      onChange={() => {
        if (status !== 'saving') store.getState().setStatus('idle')
      }}
    >
      <fieldset disabled={status === 'saving'}>
        <legend>Home hero</legend>
        <label htmlFor="hero-heading">Hero heading</label>
        <input
          id="hero-heading"
          name="heading"
          defaultValue={initialValue.heading}
          required
          maxLength={300}
        />
        <label htmlFor="hero-introduction">Hero introduction</label>
        <textarea
          id="hero-introduction"
          name="introduction"
          defaultValue={initialValue.introduction}
          required
          maxLength={1000}
          rows={4}
        />
        <button type="submit">{status === 'saving' ? 'Saving…' : 'Save home content'}</button>
      </fieldset>
      {status === 'saved' && <p role="status">Home content saved.</p>}
      {status === 'error' && <p role="alert">{error}</p>}
    </form>
  )
}
