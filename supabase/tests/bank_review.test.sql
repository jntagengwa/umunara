begin;
select no_plan();

insert into auth.users(id, email) values
  ('81000000-0000-4000-8000-000000000001', 'review-admin@example.test'),
  ('81000000-0000-4000-8000-000000000002', 'review-member@example.test');
update public.profiles set role = 'admin', approved_at = now() where id = '81000000-0000-4000-8000-000000000001';
update public.profiles set role = 'member', approved_at = now() where id = '81000000-0000-4000-8000-000000000002';
insert into public.bank_connections(id, institution_name, authorized_by) values
  ('82000000-0000-4000-8000-000000000001', 'Review bank', '81000000-0000-4000-8000-000000000001');
insert into public.bank_accounts(id, connection_id, provider_account_id, name, mask, subtype, currency) values
  ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'review-account', 'Checking', '1234', 'checking', 'USD');
insert into public.bank_transactions(id, connection_id, account_id, provider_transaction_id, amount_minor, currency, booked_on, description, pending) values
  ('84000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'review-credit', 9700, 'USD', '2026-09-07', 'Stripe settlement', false),
  ('84000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'review-debit', -100, 'USD', '2026-09-07', 'Bank charge', false),
  ('84000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'review-pending', 100, 'USD', '2026-09-06', 'Pending credit', true);
insert into public.donations(id, provider, provider_reference, gross_amount_minor, fee_amount_minor, refunded_amount_minor, currency, status, cadence, received_at, last_event_at) values
  ('85000000-0000-4000-8000-000000000001', 'stripe', 'review-gift', 10000, 300, 0, 'USD', 'succeeded', 'one_time', now(), now());

create schema if not exists tests;
grant usage on schema tests to service_role;
create function tests.review_query() returns jsonb language sql immutable set search_path = '' as $$
  select '{"from":"2026-09-01","to":"2026-09-30","page":1,"pageSize":1,"accountId":"83000000-0000-4000-8000-000000000001"}'::jsonb;
$$;
create function tests.review_classify(category text default 'processor_payout') returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('actorId', '81000000-0000-4000-8000-000000000001', 'transactionId', '84000000-0000-4000-8000-000000000001', 'classification', category);
$$;
grant execute on function tests.review_query(), tests.review_classify(text) to service_role;

select ok(not has_function_privilege(browser_role, function_name, 'EXECUTE'), browser_role || ' cannot execute ' || function_name)
from (values ('anon'), ('authenticated')) roles(browser_role)
cross join (values ('public.list_bank_transactions(uuid,jsonb)'), ('private.list_bank_transactions(uuid,jsonb)'),
  ('public.classify_bank_transaction(jsonb)'), ('private.classify_bank_transaction(jsonb)')) functions(function_name);
select ok(not prosecdef, 'public review wrapper is invoker') from pg_proc where oid in (
  'public.list_bank_transactions(uuid,jsonb)'::regprocedure, 'public.classify_bank_transaction(jsonb)'::regprocedure);
select ok(not has_table_privilege('authenticated', 'public.bank_transactions', 'SELECT'), 'admin browser still cannot read bank rows');
select ok(not has_table_privilege('service_role', 'public.bank_transactions', 'UPDATE'), 'classification cannot bypass audited RPC');

set local role service_role;
select throws_ok($$select public.list_bank_transactions('81000000-0000-4000-8000-000000000002', tests.review_query())$$, '42501', 'Administrator required.', 'member cannot review');
select throws_ok($$select public.classify_bank_transaction(tests.review_classify() || '{"actorId":"81000000-0000-4000-8000-000000000002"}')$$, '42501', 'Administrator required.', 'member cannot classify');
select is(jsonb_array_length(public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query())->'items'), 1, 'read returns one bounded row');
select is(public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query())->>'hasMore', 'true', 'lookahead detects another page');
select is(public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query() || '{"page":2}')->'items'->0->>'id', '84000000-0000-4000-8000-000000000002', 'equal-date rows have stable UUID ordering');
select is(public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query() || '{"maxAmountMinor":-1}')->'items'->0->>'amountMinor', '-100', 'signed amount filters run on server');
select is(jsonb_array_length(public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query() || '{"currency":"EUR"}')->'items'), 0, 'currency filter excludes mismatches');
select is(jsonb_array_length(public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query() || '{"accountId":"83000000-0000-4000-8000-000000000002"}')->'items'), 0, 'account filter is scoped');
select ok(not (public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query())->'items'->0 ?| array['providerTransactionId', 'connectionId', 'provider_account_id', 'accessToken']), 'safe read DTO omits provider identities');
select throws_ok($$select public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query() || '{"pageSize":101}')$$, '22023', 'Invalid bank filter range.', 'oversized pages rejected');
select throws_ok($$select public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query() || '{"minAmountMinor":1.5}')$$, '22023', 'Invalid bank filters.', 'fractional minor units rejected');
select throws_ok($$select public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query() || '{"page":null}')$$, '22023', 'Invalid bank filters.', 'null pagination cannot remove bounds');
select throws_ok($$select public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query() || '{"from":"2025-01-01"}')$$, '22023', 'Invalid bank filter range.', 'unbounded dates rejected');
select throws_ok($$select public.classify_bank_transaction(tests.review_classify('donation') || '{"transactionId":"84000000-0000-4000-8000-000000000002"}')$$, '22023', 'Incompatible classification.', 'debits cannot be gifts');
select throws_ok($$select public.classify_bank_transaction(tests.review_classify() || '{"transactionId":"84000000-0000-4000-8000-000000000003"}')$$, '22023', 'Incompatible classification.', 'pending rows cannot be classified');
select is(public.classify_bank_transaction(tests.review_classify('donation'))->>'outcome', 'applied', 'offline gift label is explicit');
select is((select count(*) from public.donations where provider_reference = 'review-gift'), 1::bigint, 'classification preserves original gift');
select is((select count(*) from public.donations where provider = 'bank'), 0::bigint, 'classification invents no offline ledger gift');
select is(public.classify_bank_transaction(tests.review_classify())->>'outcome', 'applied', 'classify payout atomically');
select is(public.classify_bank_transaction(tests.review_classify())->>'outcome', 'duplicate', 'same classification is idempotent');
select is((select count(*) from public.audit_log where entity_id = '84000000-0000-4000-8000-000000000001' and action = 'bank.transaction.classified'), 2::bigint, 'each changed classification has one audit');
select is(public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query() || '{"classification":"processor_payout"}')->'items'->0->>'classification', 'processor_payout', 'classification filter reflects writes');
select is(public.link_bank_reconciliation('{"actorId":"81000000-0000-4000-8000-000000000001","transactionId":"84000000-0000-4000-8000-000000000001","kind":"processor_payout","donationIds":["85000000-0000-4000-8000-000000000001"]}')->>'outcome', 'applied', 'existing Task 1 link RPC reconciles classified payout');
select is(public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query())->'items'->0->>'linkCount', '1', 'read includes active match count');
select throws_ok($$select public.classify_bank_transaction(tests.review_classify('donation'))$$, '22023', 'Incompatible classification.', 'active payout links cannot become donations');
select throws_ok($$select public.classify_bank_transaction(tests.review_classify('unreviewed'))$$, '22023', 'Incompatible classification.', 'classification cannot bypass link constraints');
select is((select net_amount_minor::bigint from public.donations where id = '85000000-0000-4000-8000-000000000001'), 9700::bigint, 'payout match leaves giving unchanged');
select is((select count(*) from public.audit_log where entity_id = '84000000-0000-4000-8000-000000000001' and action = 'bank.transaction.classified'), 2::bigint, 'failed linked reclassifications write no audit');
reset role;
update public.bank_transactions set removed_at = now() where id = '84000000-0000-4000-8000-000000000002';
set local role service_role;
select throws_ok($$select public.classify_bank_transaction(tests.review_classify('non_donation') || '{"transactionId":"84000000-0000-4000-8000-000000000002"}')$$, '22023', 'Incompatible classification.', 'removed transactions cannot be reclassified');
select is(jsonb_array_length(public.list_bank_transactions('81000000-0000-4000-8000-000000000001', tests.review_query() || '{"maxAmountMinor":-1}')->'items'), 0, 'removed rows stay out of review pages');
reset role;
select * from finish();
rollback;
