begin;
select no_plan();

select ok(not has_function_privilege(browser_role,
  'public.donation_report(date,date,public.donation_currency)', 'EXECUTE'),
  browser_role || ' cannot invoke financial reporting, including an authenticated admin')
from (values ('anon'), ('authenticated')) as roles(browser_role);
select ok(has_function_privilege('service_role',
  'public.donation_report(date,date,public.donation_currency)', 'EXECUTE'), 'server can aggregate');
select ok(not prosecdef, 'report uses caller permissions, never an exposed definer')
from pg_proc where oid = 'public.donation_report(date,date,public.donation_currency)'::regprocedure;

create schema if not exists tests;
grant usage on schema tests to service_role;
create function tests.report_gift(reference text, state text, amount bigint, fee bigint,
  refund bigint, receipt text, currency text default 'USD') returns jsonb
language sql immutable set search_path = '' as $$
select jsonb_build_object('provider', 'stripe', 'providerEventId', reference || ':' || state,
  'providerReference', reference, 'occurredAt', '2080-03-15T12:00:00Z', 'receivedAt', receipt,
  'donation', jsonb_build_object('provider', 'stripe', 'currency', currency, 'cadence', 'one_time',
    'status', state, 'grossAmountMinor', amount, 'feeAmountMinor', fee,
    'refundedAmountMinor', refund, 'netAmountMinor', amount - fee - refund));
$$;
grant execute on function tests.report_gift(text,text,bigint,bigint,bigint,text,text) to service_role;
set local role service_role;
select public.ingest_donation_event(tests.report_gift('report-good', 'succeeded', 7500, 0, 0, '2080-01-31T23:59:59.999999Z'));
select public.ingest_donation_event(tests.report_gift('report-refund', 'refunded', 2500, 0, 2500, '2080-01-01T00:00:00Z'));
select is((public.donation_report('2080-01-01', '2080-01-31', 'USD')->0->>'netAmountMinor'), '7500', 'full refund does not count in net');
select is((public.donation_report('2080-01-01', '2080-01-31', 'USD')->0->>'refundedAmountMinor'), '2500', 'refund remains visible');

select public.ingest_donation_event(tests.report_gift('report-reversed', 'reversed', 100, 1500, 100, '2080-01-15T00:00:00Z'));
select public.ingest_donation_event(tests.report_gift('report-pending', 'pending', 10000, 0, 0, '2080-01-15T00:00:00Z'));
select public.ingest_donation_event(tests.report_gift('report-failed', 'failed', 10000, 0, 0, '2080-01-15T00:00:00Z'));
select public.ingest_donation_event(tests.report_gift('report-eur', 'succeeded', 999, 0, 0, '2080-01-15T00:00:00Z', 'EUR'));
select public.ingest_donation_event(tests.report_gift('report-after', 'succeeded', 999, 0, 0, '2080-02-01T00:00:00Z'));
select public.ingest_donation_event(tests.report_gift('report-before', 'succeeded', 5000, 0, 0, '2079-12-01T00:00:00Z'));
select public.ingest_donation_event(tests.report_gift('report-too-early', 'succeeded', 999, 0, 0, '2079-11-30T23:59:59.999999Z'));

select is(public.donation_report('2080-01-01', '2080-01-31', 'USD'),
  '[{"period":"current","month":"2080-01","provider":"stripe","cadence":"one_time","giftCount":"3","grossAmountMinor":"10100","feeAmountMinor":"1500","refundedAmountMinor":"2600","netAmountMinor":"6000"},
    {"period":"previous","month":"2079-12","provider":"stripe","cadence":"one_time","giftCount":"1","grossAmountMinor":"5000","feeAmountMinor":"0","refundedAmountMinor":"0","netAmountMinor":"5000"}]'::jsonb,
  'settled-only counts, retained reversal fees, currency separation and exact inclusive UTC boundaries');
select is(public.donation_report('2080-01-15', '2080-01-15', 'USD')->0->>'netAmountMinor', '-1500', 'negative net survives aggregation');
select is(public.donation_report('2080-01-01', '2080-01-31', 'EUR')->0->>'grossAmountMinor', '999', 'other currencies have independent totals');
select is(public.donation_report('2081-01-01', '2081-01-31', 'USD'), '[]'::jsonb, 'empty report has no raw records');
set local timezone = 'Pacific/Honolulu';
select is(public.donation_report('2080-01-01', '2080-01-31', 'USD')->0->>'grossAmountMinor', '10100', 'session timezone never changes UTC attribution');
select public.ingest_donation_event(tests.report_gift('report-good', 'succeeded', 7500, 100, 1500, '2080-01-31T23:59:59.999999Z')
  || '{"providerEventId":"report-partial","occurredAt":"2080-04-01T12:00:00Z"}'::jsonb);
select is(public.donation_report('2080-01-01', '2080-01-31', 'USD')->0->>'netAmountMinor', '4400', 'partial refund and fees restate the receipt month');
select public.ingest_donation_event(tests.report_gift('report-reversed', 'succeeded', 100, 1500, 0, '2080-01-15T00:00:00Z')
  || '{"providerEventId":"report-restored","correctsProviderEventId":"report-reversed:reversed","occurredAt":"2080-04-02T12:00:00Z"}'::jsonb);
select is(public.donation_report('2080-01-01', '2080-01-31', 'USD')->0->>'netAmountMinor', '4500', 'verified reinstatement restores funds without adding gross twice');
select is(public.donation_report('2080-01-01', '2080-01-31', 'USD')->0->>'giftCount', '3', 'adjustments never add gift counts');
select throws_ok($$select public.donation_report('2080-02-01','2080-01-01','USD')$$, '22023', 'Invalid donation report range.', 'reversed range is rejected');
select throws_ok($$select public.donation_report('2080-01-01','2081-01-01','USD')$$, '22023', 'Invalid donation report range.', 'more than 366 days is rejected');
select throws_ok($$select public.donation_report(null,'2080-01-01','USD')$$, '22023', 'Invalid donation report range.', 'null bounds are rejected');
select throws_ok($$select public.donation_report('2000-01-01','infinity','USD')$$, '22023', 'Invalid donation report range.', 'infinite bounds are rejected');
reset role;
select * from finish();
rollback;
