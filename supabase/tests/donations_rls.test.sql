begin;
select no_plan();

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.donation_input(event_id text, reference text default 'gift_1',
  state text default 'succeeded', event_time text default '2026-09-07T12:00:00Z')
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'provider', 'stripe', 'providerEventId', event_id, 'providerReference', reference,
    'occurredAt', event_time, 'receivedAt', '2026-09-07T12:00:00Z', 'donorProfileId', null,
    'donation', jsonb_build_object('provider', 'stripe', 'grossAmountMinor', 2500,
      'feeAmountMinor', case when state in ('pending', 'failed') then 0 else 100 end,
      'refundedAmountMinor', case when state in ('refunded', 'reversed') then 2500 else 0 end,
      'netAmountMinor', case when state in ('refunded', 'reversed') then -100 when state in ('pending', 'failed') then 2500 else 2400 end,
      'currency', 'USD', 'status', state, 'cadence', 'one_time'));
$$;
grant execute on function tests.donation_input(text, text, text, text) to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'donation-pending@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'donation-member@example.test'),
  ('10000000-0000-4000-8000-000000000003', 'donation-editor@example.test'),
  ('10000000-0000-4000-8000-000000000004', 'donation-admin@example.test');
update public.profiles set role = 'member', approved_at = now() where id = '10000000-0000-4000-8000-000000000002';
update public.profiles set role = 'editor', approved_at = now() where id = '10000000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin', approved_at = now() where id = '10000000-0000-4000-8000-000000000004';

select ok(relrowsecurity, relname || ' enables RLS') from pg_class
where oid in ('public.donations'::regclass, 'public.donation_events'::regclass, 'public.donation_adjustments'::regclass);
select ok(not has_table_privilege(browser_role, table_name, privilege),
  browser_role || ' has no direct ' || privilege || ' on ' || table_name)
from (values ('anon'), ('authenticated')) as roles(browser_role)
cross join (values ('public.donations'), ('public.donation_events'), ('public.donation_adjustments')) as tables(table_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as privileges(privilege);
select ok(not has_table_privilege('service_role', table_name, privilege),
  'service_role cannot bypass ingestion using ' || privilege || ' on ' || table_name)
from (values ('public.donations'), ('public.donation_events'), ('public.donation_adjustments')) as tables(table_name)
cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as privileges(privilege);
select ok(not has_function_privilege(browser_role, function_name, 'EXECUTE'), browser_role || ' cannot invoke ' || function_name)
from (values ('anon'), ('authenticated')) as roles(browser_role)
cross join (values ('public.ingest_donation_event(jsonb)'), ('private.ingest_donation_event(jsonb)')) as functions(function_name);

set local role service_role;
select is(public.ingest_donation_event(tests.donation_input('evt_1')) ->> 'outcome', 'applied', 'service role ingests an event');
select is(public.ingest_donation_event(tests.donation_input('evt_1')) ->> 'outcome', 'duplicate', 'duplicate event is distinguishable');
select is((select count(*) from public.donations), 1::bigint, 'duplicate does not add a donation');
select is((select count(*) from public.donation_events), 1::bigint, 'duplicate does not add an event');
select is((select count(*) from public.donation_adjustments), 1::bigint, 'duplicate does not apply money again');
select is((select net_amount_minor from public.donations), 2400::bigint, 'net projection uses integer fees');

select throws_ok($$select public.ingest_donation_event(jsonb_set(tests.donation_input('bad_net', 'bad_gift'), '{donation,netAmountMinor}', '1'))$$,
  '22023', 'Invalid donation net amount.', 'invalid net amounts fail');
select throws_ok($$select public.ingest_donation_event(jsonb_set(tests.donation_input('bad_donor', 'bad_gift'), '{donorProfileId}', '"99999999-9999-4999-8999-999999999999"'))$$,
  '23503', null, 'projection failure rolls back a previously inserted event');
select is((select count(*) from public.donation_events where provider_event_id = 'bad_donor'), 0::bigint, 'failed transaction leaves no poisoned idempotency reservation');
select is(public.ingest_donation_event(tests.donation_input('bad_donor', 'recovered_gift')) ->> 'outcome', 'applied', 'failed event can be retried successfully');
select throws_ok($$select public.ingest_donation_event(tests.donation_input('raw_payload', 'bad_gift') || '{"payload":{"card":"sensitive"}}')$$,
  '22023', 'Invalid normalized donation event.', 'raw provider payloads cannot enter the ledger');
select throws_ok($$select public.ingest_donation_event(jsonb_set(tests.donation_input('fraction', 'bad_gift'), '{donation,grossAmountMinor}', '1.5'))$$,
  '22P02', null, 'fractional minor units are rejected');
select throws_ok($$select public.ingest_donation_event(jsonb_set(tests.donation_input('currency', 'bad_gift'), '{donation,currency}', '"ZZZ"'))$$,
  '23514', null, 'unknown currencies are rejected');
select throws_ok($$select public.ingest_donation_event(jsonb_set(tests.donation_input('lowercase', 'bad_gift'), '{donation,currency}', '"usd"'))$$,
  '23514', null, 'database requires uppercase currencies');
select throws_ok($$select public.ingest_donation_event(jsonb_set(tests.donation_input('negative', 'bad_gift'), '{donation,grossAmountMinor}', '-1'))$$,
  '23514', null, 'negative amounts are rejected');
select throws_ok($$select public.ingest_donation_event(jsonb_set(tests.donation_input('unsafe', 'bad_gift'), '{donation,grossAmountMinor}', '9007199254740992'))$$,
  '23514', null, 'unsafe JavaScript integers are rejected');
select throws_ok($$select public.ingest_donation_event(jsonb_set(tests.donation_input('identity'), '{donation,currency}', '"EUR"'))$$,
  '22023', 'Donation identity cannot change.', 'currency cannot change for an existing gift');
select is((select count(*) from public.donation_events where provider_event_id = 'identity'), 0::bigint, 'identity conflict rolls back the event');

select is(public.ingest_donation_event(tests.donation_input('refund', 'gift_1', 'refunded', '2026-09-08T12:00:00Z')) ->> 'outcome', 'applied', 'refund applies atomically');
select is((select net_amount_minor from public.donations where provider_reference = 'gift_1'), -100::bigint, 'refund preserves nonreturned fees');
select is((select sum(net_delta_minor)::bigint from public.donation_adjustments a join public.donations d on d.id = a.donation_id where d.provider_reference = 'gift_1'), -100::bigint, 'adjustments reconcile to settled net');
select is(public.ingest_donation_event(tests.donation_input('late_success')) ->> 'outcome', 'stale', 'late success cannot undo a refund');
select is((select status::text from public.donations where provider_reference = 'gift_1'), 'refunded', 'stale event leaves the projection unchanged');
select is((select count(*) from public.donation_events where provider_event_id = 'late_success'), 1::bigint, 'stale event remains auditable');
select is((select count(*) from public.donation_adjustments a join public.donation_events e on e.id = a.event_id where e.provider_event_id = 'late_success'), 0::bigint, 'stale event adds no financial adjustment');
select is(public.ingest_donation_event(tests.donation_input('pending', 'pending_gift', 'pending')) ->> 'outcome', 'applied', 'pending gift can be recorded');
select is((select gross_delta_minor from public.donation_adjustments a join public.donation_events e on e.id = a.event_id where e.provider_event_id = 'pending'), 0::bigint, 'pending gift does not count as settled giving');
select is(public.ingest_donation_event(tests.donation_input('settled', 'pending_gift', 'succeeded', '2026-09-08T12:00:00Z')) ->> 'outcome', 'applied', 'pending gift settles');
select is(public.ingest_donation_event(tests.donation_input('reversed', 'pending_gift', 'reversed', '2026-09-09T12:00:00Z')) ->> 'outcome', 'applied', 'reversal applies');

select is(public.ingest_donation_event(jsonb_set(tests.donation_input('small_dispute', 'small_gift', 'reversed'), '{donation}',
  '{"provider":"stripe","grossAmountMinor":100,"feeAmountMinor":1500,"refundedAmountMinor":100,"netAmountMinor":-1500,"status":"reversed","currency":"USD","cadence":"one_time"}')) ->> 'outcome',
  'applied', 'dispute fee can exceed the reversed gift');
select is((select net_amount_minor from public.donations where provider_reference = 'small_gift'), -1500::bigint, 'dispute fee remains in the net projection');
select is((select sum(net_delta_minor)::bigint from public.donation_adjustments a join public.donations d on d.id = a.donation_id where d.provider_reference = 'small_gift'), -1500::bigint, 'larger dispute fee is preserved in immutable adjustments');

select is(public.ingest_donation_event(tests.donation_input('unmarked_success', 'pending_gift', 'succeeded', '2026-09-10T12:00:00Z')) ->> 'outcome', 'stale', 'newer ordinary success cannot silently undo a reversal');
select is(public.ingest_donation_event(tests.donation_input('old_correction', 'pending_gift', 'succeeded', '2026-09-09T12:00:00Z') || '{"correctsProviderEventId":"reversed"}') ->> 'outcome', 'stale', 'correction must be strictly newer than the current snapshot');
select is(public.ingest_donation_event(tests.donation_input('won', 'pending_gift', 'succeeded', '2026-09-10T12:00:00Z') || '{"correctsProviderEventId":"reversed"}') ->> 'outcome', 'applied', 'verified reversal reinstatement applies');
select is((select status::text from public.donations where provider_reference = 'pending_gift'), 'succeeded', 'reinstatement restores succeeded projection');
select is((select net_amount_minor from public.donations where provider_reference = 'pending_gift'), 2400::bigint, 'reinstatement restores net giving');
select is((select refunded_delta_minor from public.donation_adjustments a join public.donation_events e on e.id = a.event_id where e.provider_event_id = 'won'), -2500::bigint, 'reinstatement writes a compensating refund adjustment');
select is((select net_delta_minor from public.donation_adjustments a join public.donation_events e on e.id = a.event_id where e.provider_event_id = 'won'), 2500::bigint, 'compensating adjustment reinstates funds without counting a second gross gift');
select is((select status::text from public.donation_events where provider_event_id = 'reversed'), 'reversed', 'reinstatement preserves reversal event history');
select ok((select corrected.provider_event_id = 'reversed' from public.donation_events correction join public.donation_events corrected on corrected.id = correction.corrects_event_id where correction.provider_event_id = 'won'), 'correction retains its immutable event reference');
select is(public.ingest_donation_event(tests.donation_input('won', 'pending_gift', 'succeeded', '2026-09-10T12:00:00Z') || '{"correctsProviderEventId":"reversed"}') ->> 'outcome', 'duplicate', 'reinstatement replay remains idempotent');
select is((select count(*) from public.donation_adjustments a join public.donation_events e on e.id = a.event_id where e.provider_event_id = 'won'), 1::bigint, 'duplicate reinstatement writes no extra adjustment');
select is(public.ingest_donation_event(tests.donation_input('late_reversal', 'pending_gift', 'reversed', '2026-09-09T13:00:00Z')) ->> 'outcome', 'stale', 'delayed reversal cannot undo a newer reinstatement');
select is(public.ingest_donation_event(tests.donation_input('obsolete_correction', 'pending_gift', 'succeeded', '2026-09-11T12:00:00Z') || '{"correctsProviderEventId":"reversed"}') ->> 'outcome', 'stale', 'obsolete correction target cannot be applied twice with different event IDs');
select throws_ok($$select public.ingest_donation_event(tests.donation_input('wrong_gift', 'pending_gift', 'succeeded', '2026-09-11T12:00:00Z') || '{"correctsProviderEventId":"refund"}')$$,
  '22023', 'Invalid donation correction target.', 'correction cannot target another gift');
select throws_ok($$select public.ingest_donation_event(tests.donation_input('missing_target', 'pending_gift', 'succeeded', '2026-09-11T12:00:00Z') || '{"correctsProviderEventId":"unknown"}')$$,
  '22023', 'Invalid donation correction target.', 'correction must target an applied event');

select is(public.ingest_donation_event(jsonb_set(jsonb_set(tests.donation_input('partial_reinstatement', 'gift_1', 'succeeded', '2026-09-10T12:00:00Z'),
  '{donation,refundedAmountMinor}', '500'), '{donation,netAmountMinor}', '1900') || '{"correctsProviderEventId":"refund"}') ->> 'outcome', 'applied', 'full refund can be explicitly corrected to a partial refund');
select is((select refunded_amount_minor::bigint from public.donations where provider_reference = 'gift_1'), 500::bigint, 'partial reinstatement retains the remaining refund');
select is(public.ingest_donation_event(tests.donation_input('partial_refund_correction', 'gift_1', 'succeeded', '2026-09-11T12:00:00Z') || '{"correctsProviderEventId":"partial_reinstatement"}') ->> 'outcome', 'applied', 'partial refund can be explicitly corrected to fully reinstated funds');
select is((select sum(net_delta_minor)::bigint from public.donation_adjustments a join public.donations d on d.id = a.donation_id where d.provider_reference = 'gift_1'), 2400::bigint, 'refund corrections reconcile across the entire immutable history');
select is((select status::text from public.donation_events where provider_event_id = 'refund'), 'refunded', 'refund correction preserves the original refunded event');

reset role;
select throws_ok($$update public.donations set gross_amount_minor = 3000$$, '22023', 'Donation identity cannot change.', 'original gift amounts cannot be rewritten');
select throws_ok($$update public.donation_events set status = 'failed'$$, '42501', 'Donation history is immutable.', 'owner cannot rewrite events through ordinary DML');
select throws_ok($$delete from public.donation_adjustments$$, '42501', 'Donation history is immutable.', 'owner cannot remove adjustments through ordinary DML');
select throws_ok($$delete from public.donations$$, '42501', 'Donation history is immutable.', 'donations cannot be hard deleted');
select throws_ok($$insert into public.donation_events (donation_id, provider, provider_event_id, provider_reference, occurred_at, status, gross_amount_minor, fee_amount_minor, refunded_amount_minor, currency, cadence)
  select donation_id, provider, provider_event_id, provider_reference, occurred_at, status, gross_amount_minor, fee_amount_minor, refunded_amount_minor, currency, cadence from public.donation_events limit 1$$,
  '23505', null, 'database also enforces provider event uniqueness independently of the primary key');

-- Test policy defense separately from production ACLs: only this rolled-back
-- test transaction grants table SELECT so the policy's allow/deny is exercised.
grant select on public.donations, public.donation_events, public.donation_adjustments to authenticated;
set local role anon;
select throws_ok('select * from public.donations', '42501', null, 'anonymous table access fails');
select throws_ok($$select public.ingest_donation_event(tests.donation_input('anon'))$$, '42501', null, 'anonymous RPC access fails');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.donations), 0::bigint, 'pending users cannot read donations');
select is((select count(*) from public.donation_events), 0::bigint, 'pending users cannot read events');
select is((select count(*) from public.donation_adjustments), 0::bigint, 'pending users cannot read adjustments');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.donations), 0::bigint, 'members cannot read donations');
select is((select count(*) from public.donation_events), 0::bigint, 'members cannot read events');
select is((select count(*) from public.donation_adjustments), 0::bigint, 'members cannot read adjustments');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.donations), 0::bigint, 'editors cannot read donations');
select is((select count(*) from public.donation_events), 0::bigint, 'editors cannot read events');
select is((select count(*) from public.donation_adjustments), 0::bigint, 'editors cannot read adjustments');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.donations), 4::bigint, 'admin policy permits reading all gifts');
select ok((select count(*) > 0 from public.donation_events), 'admin policy permits event reads');
select ok((select count(*) > 0 from public.donation_adjustments), 'admin policy permits adjustment reads');
select throws_ok($$select public.ingest_donation_event(tests.donation_input('admin'))$$, '42501', null, 'admins have no ingestion access');
select throws_ok($$update public.donations set status = 'failed'$$, '42501', null, 'admins cannot mutate financial projections');
select throws_ok('delete from public.donations', '42501', null, 'admins cannot delete donations');
reset role;
select * from finish();
rollback;
