-- Provider dispute fees can exceed the gift. Keep integer and derived-net
-- safety constraints, and preserve all existing event/adjustment history.
alter table public.donations
  drop constraint donations_check,
  add constraint donations_refund_limit check (refunded_amount_minor <= gross_amount_minor),
  add constraint donations_net_safe check (net_amount_minor between -9007199254740991 and 9007199254740991);
alter table public.donation_events
  drop constraint donation_events_check,
  add constraint donation_events_refund_limit check (refunded_amount_minor <= gross_amount_minor),
  add constraint donation_events_net_safe check (
    gross_amount_minor - fee_amount_minor - refunded_amount_minor between -9007199254740991 and 9007199254740991),
  add column corrects_event_id uuid,
  add constraint donation_events_correction_gift_fk foreign key (corrects_event_id, donation_id)
    references public.donation_events(id, donation_id) on delete restrict;
create index donation_events_corrects_idx on public.donation_events (corrects_event_id, donation_id)
  where corrects_event_id is not null;

create or replace function private.ingest_donation_event(event_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  gift public.donations;
  previous public.donations;
  recorded public.donation_events;
  corrected public.donation_events;
  snapshot jsonb := event_input -> 'donation';
  event_time timestamptz := (event_input ->> 'occurredAt')::timestamptz;
  is_stale boolean;
  recognized_gross bigint;
  previous_gross bigint;
begin
  if jsonb_typeof(event_input) is distinct from 'object'
    or jsonb_typeof(snapshot) is distinct from 'object'
    or event_input - array['provider', 'providerEventId', 'providerReference', 'occurredAt', 'receivedAt', 'donorProfileId', 'correctsProviderEventId', 'donation'] <> '{}'::jsonb
    or snapshot - array['provider', 'grossAmountMinor', 'feeAmountMinor', 'refundedAmountMinor', 'netAmountMinor', 'currency', 'status', 'cadence'] <> '{}'::jsonb
    or (event_input ->> 'provider') is distinct from (snapshot ->> 'provider') then
    raise exception 'Invalid normalized donation event.' using errcode = '22023';
  end if;
  gift.provider := event_input ->> 'provider';
  gift.provider_reference := event_input ->> 'providerReference';
  gift.gross_amount_minor := (snapshot ->> 'grossAmountMinor')::bigint;
  gift.fee_amount_minor := (snapshot ->> 'feeAmountMinor')::bigint;
  gift.refunded_amount_minor := (snapshot ->> 'refundedAmountMinor')::bigint;
  gift.currency := snapshot ->> 'currency';
  gift.status := snapshot ->> 'status';
  gift.cadence := snapshot ->> 'cadence';
  gift.received_at := (event_input ->> 'receivedAt')::timestamptz;
  gift.donor_profile_id := (event_input ->> 'donorProfileId')::uuid;
  if (snapshot ->> 'netAmountMinor')::bigint is distinct from
    (gift.gross_amount_minor - gift.fee_amount_minor - gift.refunded_amount_minor) then
    raise exception 'Invalid donation net amount.' using errcode = '22023';
  end if;

  -- Covers the first event too, before a donation row exists to lock. Hash
  -- collisions only serialize unrelated gifts and cannot mix their data.
  perform pg_advisory_xact_lock(hashtextextended(gift.provider || ':' || gift.provider_reference, 0));
  select * into previous from public.donations
    where provider = gift.provider and provider_reference = gift.provider_reference for update;
  gift.id := coalesce(previous.id, gen_random_uuid());

  if event_input ->> 'correctsProviderEventId' is not null then
    select e.* into corrected from public.donation_events e
      where e.provider = gift.provider
        and e.provider_event_id = event_input ->> 'correctsProviderEventId'
        and e.donation_id = gift.id
        and exists (select 1 from public.donation_adjustments a where a.event_id = e.id);
    if corrected.id is null or gift.status <> 'succeeded'
      or event_input ->> 'correctsProviderEventId' = event_input ->> 'providerEventId' then
      raise exception 'Invalid donation correction target.' using errcode = '22023';
    end if;
  end if;

  -- Reserve provider idempotency before any financial projection mutation.
  insert into public.donation_events (donation_id, provider, provider_event_id, provider_reference,
    occurred_at, status, gross_amount_minor, fee_amount_minor, refunded_amount_minor, currency, cadence, corrects_event_id)
  values (gift.id, gift.provider, event_input ->> 'providerEventId', gift.provider_reference,
    event_time, gift.status, gift.gross_amount_minor, gift.fee_amount_minor, gift.refunded_amount_minor, gift.currency, gift.cadence, corrected.id)
  on conflict (provider, provider_event_id) do nothing returning * into recorded;
  if recorded.id is null then
    select * into recorded from public.donation_events
      where provider = gift.provider and provider_event_id = event_input ->> 'providerEventId';
    return jsonb_build_object('outcome', 'duplicate', 'donationId', recorded.donation_id, 'eventId', recorded.id);
  end if;

  if previous.id is not null then
    if row(previous.gross_amount_minor, previous.currency, previous.cadence, previous.received_at, previous.donor_profile_id)
      is distinct from row(gift.gross_amount_minor, gift.currency, gift.cadence, gift.received_at, gift.donor_profile_id) then
      raise exception 'Donation identity cannot change.' using errcode = '22023';
    end if;
    if corrected.id is not null then
      -- Explicit reinstatements can lower the reversed/refunded total only
      -- when they supersede the currently applied snapshot. Matching every
      -- state field also handles equal-timestamp provider events safely.
      is_stale := event_time <= previous.last_event_at
        or previous.status not in ('succeeded', 'refunded', 'reversed')
        or gift.refunded_amount_minor >= previous.refunded_amount_minor
        or row(corrected.occurred_at, corrected.status, corrected.fee_amount_minor, corrected.refunded_amount_minor)
          is distinct from row(previous.last_event_at, previous.status, previous.fee_amount_minor, previous.refunded_amount_minor);
    else
      is_stale := event_time < previous.last_event_at
        or gift.refunded_amount_minor < previous.refunded_amount_minor
        or (previous.status in ('succeeded', 'refunded', 'reversed') and gift.status in ('pending', 'failed'))
        or (previous.status in ('refunded', 'reversed') and gift.status = 'succeeded')
        or (previous.status = 'reversed' and gift.status = 'refunded')
        or (previous.status = 'failed' and gift.status = 'pending');
    end if;
    if is_stale then
      return jsonb_build_object('outcome', 'stale', 'donationId', gift.id, 'eventId', recorded.id);
    end if;
    update public.donations set fee_amount_minor = gift.fee_amount_minor,
      refunded_amount_minor = gift.refunded_amount_minor, status = gift.status,
      last_event_at = event_time, updated_at = now() where id = gift.id;
  else
    insert into public.donations (id, provider, provider_reference, donor_profile_id,
      gross_amount_minor, fee_amount_minor, refunded_amount_minor, currency, status, cadence, received_at, last_event_at)
    values (gift.id, gift.provider, gift.provider_reference, gift.donor_profile_id,
      gift.gross_amount_minor, gift.fee_amount_minor, gift.refunded_amount_minor,
      gift.currency, gift.status, gift.cadence, gift.received_at, event_time);
  end if;
  -- Only settled gifts contribute gross giving; pending/failed intents do not.
  recognized_gross := case when gift.status in ('pending', 'failed') then 0 else gift.gross_amount_minor end;
  previous_gross := case when previous.id is null or previous.status in ('pending', 'failed') then 0 else previous.gross_amount_minor end;
  insert into public.donation_adjustments (donation_id, event_id, gross_delta_minor,
    fee_delta_minor, refunded_delta_minor, previous_status, status)
  values (gift.id, recorded.id, recognized_gross - previous_gross,
    gift.fee_amount_minor - coalesce(previous.fee_amount_minor, 0),
    gift.refunded_amount_minor - coalesce(previous.refunded_amount_minor, 0), previous.status, gift.status);
  return jsonb_build_object('outcome', 'applied', 'donationId', gift.id, 'eventId', recorded.id);
end;
$$;
revoke all on function private.ingest_donation_event(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.ingest_donation_event(jsonb) to service_role;
