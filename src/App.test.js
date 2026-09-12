import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import History from './components/history';

jest.mock('./components/events', () => ({
  getEvents: (callback) => callback([]),
}));

test('renders public navigation and footer contact details', () => {
  const { getByRole, getByText } = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );

  expect(getByRole('link', { name: /home/i })).toBeInTheDocument();
  expect(getByText('postmaster@umunara.org')).toBeInTheDocument();
});

test('keeps live Home prayer watch details', () => {
  const { getAllByText, getByRole } = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );

  expect(
    getByRole('heading', { name: 'Welcome To Umunara, Inc' })
  ).toBeInTheDocument();
  expect(getAllByText(/1-218-548-0820/).length).toBeGreaterThan(0);
  expect(getAllByText(/13579#/).length).toBeGreaterThan(0);
});

test('renders upcoming events and Calendar prayer watch details', () => {
  const { getByRole, getByText } = render(
    <MemoryRouter initialEntries={['/calendar']}>
      <App />
    </MemoryRouter>
  );

  expect(
    getByRole('heading', { name: 'Upcoming Events' })
  ).toBeInTheDocument();
  expect(
    getByText('Friday at 10:00 PM Eastern Time')
  ).toBeInTheDocument();
  expect(getByText('HOLD IN LANDSCAPE MODE')).toBeInTheDocument();
});

test('renders original founding dates', () => {
  const { getByRole, getByText } = render(<History />);

  expect(getByRole('heading', { name: 'History' })).toBeInTheDocument();
  expect(getByText(/September 23, 2007/)).toBeInTheDocument();
  expect(getByText(/October 02, 2008/)).toBeInTheDocument();
});

test('moves focus into and out of the mobile navigation drawer', () => {
  const { getByRole } = render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );
  const toggle = getByRole('button', { name: 'Open navigation menu' });

  expect(toggle).toHaveAttribute('aria-controls', 'mobile-navigation');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');

  fireEvent.click(toggle);

  const closeButton = getByRole('button', { name: 'Close navigation menu' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(closeButton).toHaveFocus();

  fireEvent.click(closeButton);

  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveFocus();
});
