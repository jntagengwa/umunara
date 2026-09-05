import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import HomePage from '../app/page'

it('renders the Umunara home page', async () => {
  render(await HomePage())
  expect(screen.getByRole('main')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Welcome To Umunara, Inc' })).toBeInTheDocument()
})
