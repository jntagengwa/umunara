import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import HomePage from '../app/page'

const unavailableRoutePaths = ['/calendar', '/blog', '/donate', '/about-us']

it('renders the Umunara home page', async () => {
  render(await HomePage())
  expect(screen.getByRole('main')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Welcome To Umunara, Inc' })).toBeInTheDocument()
})

it('does not render links to unavailable routes', async () => {
  const { container } = render(await HomePage())

  unavailableRoutePaths.forEach((path) => {
    expect(container.querySelector(`a[href="${path}"]`)).not.toBeInTheDocument()
  })
})
