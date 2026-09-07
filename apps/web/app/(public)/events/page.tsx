import { readPublicEvents } from '../../../lib/content-reads'
import { readPageNumber, type PageSearchParams } from '../../../lib/page-query'
import { Pagination } from '../../../components/pagination'

export default async function EventsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const events = await readPublicEvents(await readPageNumber(searchParams))
  return (
    <main className="page-content" id="main-content">
      <h1>Umunara Calendar</h1>
      {events.data.length === 0 ? (
        <p>There are no scheduled events yet.</p>
      ) : (
        <div className="post-grid">
          {events.data.map((event) => (
            <article className="content-card" key={event.id}>
              <h2>{event.title}</h2>
              <p>
                <time dateTime={event.startsAt}>
                  {new Intl.DateTimeFormat('en-GB', {
                    dateStyle: 'full',
                    timeStyle: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(event.startsAt))}{' '}
                  UTC
                </time>
              </p>
              {event.location && <p>{event.location}</p>}
              <p className="post-body">{event.description}</p>
            </article>
          ))}
        </div>
      )}
      <Pagination {...events} path="/events" />
    </main>
  )
}
