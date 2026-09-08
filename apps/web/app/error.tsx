'use client'

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page-content" id="main-content">
      <h1>Unable to load this page</h1>
      <p role="alert">Please try again in a moment.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  )
}
