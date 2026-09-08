import { requirePageRole } from '../../../../lib/page-access'
import { readPageNumber, type PageSearchParams } from '../../../../lib/page-query'
import { Pagination } from '../../../../components/pagination'
import { RequestButton } from '../../../../components/request-button'

export default async function MemberEventsPage({
  searchParams,
}: { searchParams?: PageSearchParams } = {}) {
  const { services, actor } = await requirePageRole('member')
  const events = await services.events.list(actor, {
    scope: 'member',
    page: await readPageNumber(searchParams),
    pageSize: 12,
  })
  return (
    <main className="page-content" id="main-content">
      <h1>Member events</h1>
      {events.data.length === 0 && <p>No member events are available yet.</p>}
      {events.data.map((event) => (
        <article key={event.id}>
          <h2>{event.title}</h2>
          <p>{event.description}</p>
          <p>
            <time dateTime={event.startsAt}>
              {new Date(event.startsAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC
            </time>
          </p>
          {event.location && <p>{event.location}</p>}
          <RequestButton
            endpoint={`/api/v1/events/${event.id}/registrations`}
            label="Register for event"
            pendingLabel="Registering…"
            successMessage="You are registered for this event."
          />
        </article>
      ))}
      <Pagination {...events} path="/member/events" />
    </main>
  )
}
