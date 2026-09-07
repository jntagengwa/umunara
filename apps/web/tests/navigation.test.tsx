import '@testing-library/jest-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SiteNavigation } from '../components/site-navigation'
afterEach(cleanup)

it('opens navigation with a labelled button and closes on Escape and route selection', () => {
  render(<SiteNavigation />)
  const button = screen.getByRole('button', { name: 'Menu' })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(button)
  expect(button).toHaveAttribute('aria-expanded', 'true')
  fireEvent.keyDown(screen.getByRole('navigation'), { key: 'Escape' })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  expect(button).toHaveFocus()
  fireEvent.click(button)
  fireEvent.click(screen.getByRole('link', { name: 'Blog' }))
  expect(button).toHaveAttribute('aria-expanded', 'false')
})
