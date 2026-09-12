import { readPublicEvents } from '../../../lib/content-reads'
import { readPageNumber, type PageSearchParams } from '../../../lib/page-query'
import { Pagination } from '../../../components/pagination'

export default async function EventsPage({ searchParams }: { searchParams: PageSearchParams }) {
  let events: Awaited<ReturnType<typeof readPublicEvents>>
  try {
    events = await readPublicEvents(await readPageNumber(searchParams))
  } catch {
    return (
      <main className="page-content" id="main-content">
        <header className="page-introduction">
          <p className="section-label">Gather with us</p>
          <h1>Upcoming Events</h1>
        </header>
        <p role="alert">The events calendar is currently unavailable. Please try again later.</p>
      </main>
    )
  }
  return (
    <main className="page-content" id="main-content">
      <header className="page-introduction events-introduction">
        <p className="section-label">Gather with us</p>
        <h1>Upcoming Events</h1>
        <p>Explore upcoming gatherings, prayer watches, and community events.</p>
      </header>
      <div className="events-layout">
        <section aria-label="Events calendar">
          {events.data.length === 0 ? (
            <p>There are no scheduled events yet.</p>
          ) : (
            <div className="event-list">
              {events.data.map((event) => {
                const startsAt = new Date(event.startsAt)
                return (
                  <article className="event-card" key={event.id}>
                    <time className="event-date" dateTime={event.startsAt}>
                      <span>
                        {new Intl.DateTimeFormat('en-GB', {
                          month: 'short',
                          timeZone: 'UTC',
                        }).format(startsAt)}
                      </span>
                      <strong>
                        {new Intl.DateTimeFormat('en-GB', {
                          day: 'numeric',
                          timeZone: 'UTC',
                        }).format(startsAt)}
                      </strong>
                    </time>
                    <div>
                      <h2>{event.title}</h2>
                      <p className="event-time">
                        <time dateTime={event.startsAt}>
                          {new Intl.DateTimeFormat('en-GB', {
                            dateStyle: 'full',
                            timeStyle: 'short',
                            timeZone: 'UTC',
                          }).format(startsAt)}{' '}
                          UTC
                        </time>
                      </p>
                      {event.location && <p>{event.location}</p>}
                      <p className="post-body">{event.description}</p>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
          <Pagination {...events} path="/events" />
        </section>
        <aside className="weekly-watch">
          <p className="section-label">Weekly prayer watch</p>
          <h2>Join the live prayer line</h2>
          <p>Friday at 10:00 PM Eastern Time</p>
          <dl>
            <div>
              <dt>Dial-in number</dt>
              <dd>
                <a href="tel:+12185480820">1-218-548-0820</a>
              </dd>
            </div>
            <div>
              <dt>Pass code</dt>
              <dd>13579#</dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  )
}
