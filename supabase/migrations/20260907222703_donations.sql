-- Immutable gift identity and append-only event/adjustment history. Only the
-- private ingestion transaction may update the current donation projection.
create domain public.donation_provider as text check (value in ('stripe', 'paypal', 'manual', 'bank'));
create domain public.donation_status as text check (value in ('pending', 'succeeded', 'failed', 'refunded', 'reversed'));
create domain public.donation_cadence as text check (value in ('one_time', 'monthly', 'yearly'));
create domain public.donation_minor_units as bigint check (value between 0 and 9007199254740991);
-- ISO 4217 current list from SIX, retrieved 2026-09-07; mirrored in schemas.
create domain public.donation_currency as text check (value = any(string_to_array(
  'AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAD XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XTS XUA XXX YER ZAR ZMW ZWG', ' ')));

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  provider public.donation_provider not null,
  provider_reference text not null check (length(btrim(provider_reference)) between 1 and 255),
  donor_profile_id uuid references public.profiles(id) on delete restrict,
  gross_amount_minor public.donation_minor_units not null,
  fee_amount_minor public.donation_minor_units not null,
  refunded_amount_minor public.donation_minor_units not null,
  net_amount_minor bigint generated always as (gross_amount_minor - fee_amount_minor - refunded_amount_minor) stored,
  currency public.donation_currency not null,
  status public.donation_status not null,
  cadence public.donation_cadence not null,
  received_at timestamptz not null check (isfinite(received_at)),
  last_event_at timestamptz not null check (isfinite(last_event_at)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference),
  check (fee_amount_minor <= gross_amount_minor and refunded_amount_minor <= gross_amount_minor),
  check (status not in ('refunded', 'reversed') or refunded_amount_minor = gross_amount_minor),
  check (status not in ('pending', 'failed') or (fee_amount_minor = 0 and refunded_amount_minor = 0))
);

create table public.donation_events (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id) on delete restrict deferrable initially deferred,
  provider public.donation_provider not null,
  provider_event_id text not null check (length(btrim(provider_event_id)) between 1 and 255),
  provider_reference text not null check (length(btrim(provider_reference)) between 1 and 255),
  occurred_at timestamptz not null check (isfinite(occurred_at)),
  received_at timestamptz not null default now(),
  status public.donation_status not null,
  gross_amount_minor public.donation_minor_units not null,
  fee_amount_minor public.donation_minor_units not null,
  refunded_amount_minor public.donation_minor_units not null,
  currency public.donation_currency not null,
  cadence public.donation_cadence not null,
  unique (provider, provider_event_id),
  unique (id, donation_id),
  check (fee_amount_minor <= gross_amount_minor and refunded_amount_minor <= gross_amount_minor),
  check (status not in ('refunded', 'reversed') or refunded_amount_minor = gross_amount_minor),
  check (status not in ('pending', 'failed') or (fee_amount_minor = 0 and refunded_amount_minor = 0))
);

create table public.donation_adjustments (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id) on delete restrict,
  event_id uuid not null unique,
  gross_delta_minor bigint not null check (gross_delta_minor between -9007199254740991 and 9007199254740991),
  fee_delta_minor bigint not null check (fee_delta_minor between -9007199254740991 and 9007199254740991),
  refunded_delta_minor bigint not null check (refunded_delta_minor between -9007199254740991 and 9007199254740991),
  net_delta_minor bigint generated always as (gross_delta_minor - fee_delta_minor - refunded_delta_minor) stored,
  previous_status public.donation_status,
  status public.donation_status not null,
  created_at timestamptz not null default now(),
  foreign key (event_id, donation_id) references public.donation_events(id, donation_id) on delete restrict,
  check (net_delta_minor between -9007199254740991 and 9007199254740991)
);

create index donations_received_at_idx on public.donations (received_at desc, id);
create index donations_provider_status_idx on public.donations (provider, status);
create index donations_month_currency_idx on public.donations ((date_trunc('month', received_at at time zone 'UTC')), currency);
create index donations_donor_idx on public.donations (donor_profile_id) where donor_profile_id is not null;
create index donation_events_donation_idx on public.donation_events (donation_id, occurred_at desc);
create index donation_events_received_at_idx on public.donation_events (received_at desc);
create index donation_adjustments_donation_idx on public.donation_adjustments (donation_id, created_at);

revoke all on public.donations, public.donation_events, public.donation_adjustments from public, anon, authenticated, service_role;
grant select on public.donations, public.donation_events, public.donation_adjustments to service_role;
alter table public.donations enable row level security;
alter table public.donation_events enable row level security;
alter table public.donation_adjustments enable row level security;
-- Direct browser table grants stay revoked. These policies also protect future
-- grants; admin reporting must use an authorized server service/repository.
create policy "donations: admins read" on public.donations for select to authenticated
  using ((select private.has_minimum_role('admin')));
create policy "donation events: admins read" on public.donation_events for select to authenticated
  using ((select private.has_minimum_role('admin')));
create policy "donation adjustments: admins read" on public.donation_adjustments for select to authenticated
  using ((select private.has_minimum_role('admin')));

create function private.reject_donation_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Donation history is immutable.' using errcode = '42501';
end;
$$;
revoke all on function private.reject_donation_history_mutation() from public, anon, authenticated, service_role;
create trigger donations_no_delete before delete on public.donations
  for each row execute function private.reject_donation_history_mutation();
create trigger donation_events_immutable before update or delete on public.donation_events
  for each row execute function private.reject_donation_history_mutation();
create trigger donation_adjustments_immutable before update or delete on public.donation_adjustments
  for each row execute function private.reject_donation_history_mutation();

create function private.preserve_donation_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.id, new.provider, new.provider_reference, new.donor_profile_id,
    new.gross_amount_minor, new.currency, new.cadence, new.received_at, new.created_at)
    is distinct from row(old.id, old.provider, old.provider_reference, old.donor_profile_id,
    old.gross_amount_minor, old.currency, old.cadence, old.received_at, old.created_at) then
    raise exception 'Donation identity cannot change.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.preserve_donation_identity() from public, anon, authenticated, service_role;
create trigger donations_preserve_identity before update on public.donations
  for each row execute function private.preserve_donation_identity();

create function private.ingest_donation_event(event_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  gift public.donations;
  previous public.donations;
  recorded public.donation_events;
  snapshot jsonb := event_input -> 'donation';
  event_time timestamptz := (event_input ->> 'occurredAt')::timestamptz;
  is_stale boolean;
  recognized_gross bigint;
  previous_gross bigint;
begin
  if jsonb_typeof(event_input) is distinct from 'object'
    or jsonb_typeof(snapshot) is distinct from 'object'
    or event_input - array['provider', 'providerEventId', 'providerReference', 'occurredAt', 'receivedAt', 'donorProfileId', 'donation'] <> '{}'::jsonb
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

  -- Reserve provider idempotency before any financial projection mutation.
  insert into public.donation_events (donation_id, provider, provider_event_id, provider_reference,
    occurred_at, status, gross_amount_minor, fee_amount_minor, refunded_amount_minor, currency, cadence)
  values (gift.id, gift.provider, event_input ->> 'providerEventId', gift.provider_reference,
    event_time, gift.status, gift.gross_amount_minor, gift.fee_amount_minor, gift.refunded_amount_minor, gift.currency, gift.cadence)
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
    is_stale := event_time < previous.last_event_at
      or gift.refunded_amount_minor < previous.refunded_amount_minor
      or (previous.status in ('succeeded', 'refunded', 'reversed') and gift.status in ('pending', 'failed'))
      or (previous.status in ('refunded', 'reversed') and gift.status = 'succeeded')
      or (previous.status = 'reversed' and gift.status = 'refunded')
      or (previous.status = 'failed' and gift.status = 'pending');
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
grant usage on schema private to service_role;
grant execute on function private.ingest_donation_event(jsonb) to service_role;

-- Only an invoker wrapper is exposed to PostgREST. No browser role can execute
-- either function, and even service_role cannot bypass it with direct writes.
create function public.ingest_donation_event(event_input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.ingest_donation_event(event_input);
$$;
revoke all on function public.ingest_donation_event(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.ingest_donation_event(jsonb) to service_role;
