-- Review remains server-owned. Browser roles receive no table or RPC grants.
create function private.list_bank_transactions(actor_id uuid, query_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  date_from date;
  date_to date;
  account uuid;
  category public.bank_classification;
  currency_filter public.donation_currency;
  minimum public.bank_minor_units;
  maximum public.bank_minor_units;
  page_number integer;
  page_size integer;
  rows jsonb;
begin
  perform 1 from public.profiles where id = actor_id and role = 'admin' and approved_at is not null for share;
  if not found then raise exception 'Administrator required.' using errcode = '42501'; end if;
  if jsonb_typeof(query_input) is distinct from 'object'
    or not (query_input ?& array['from', 'to', 'page', 'pageSize'])
    or (query_input - array['from', 'to', 'page', 'pageSize', 'accountId', 'classification', 'currency', 'minAmountMinor', 'maxAmountMinor']) <> '{}'::jsonb
    or exists (select 1 from jsonb_each(query_input) where
      case when key in ('page', 'pageSize', 'minAmountMinor', 'maxAmountMinor')
        then jsonb_typeof(value) <> 'number' or value::text !~ '^-?[0-9]+$'
        else jsonb_typeof(value) <> 'string' end)
    or query_input->>'from' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or query_input->>'to' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid bank filters.' using errcode = '22023';
  end if;
  date_from := (query_input->>'from')::date;
  date_to := (query_input->>'to')::date;
  account := (query_input->>'accountId')::uuid;
  category := query_input->>'classification';
  currency_filter := query_input->>'currency';
  minimum := (query_input->>'minAmountMinor')::bigint;
  maximum := (query_input->>'maxAmountMinor')::bigint;
  page_number := (query_input->>'page')::integer;
  page_size := (query_input->>'pageSize')::integer;
  if date_from < date '2000-01-01' or date_to > date '9998-12-31'
    or date_to - date_from not between 0 and 365
    or page_number not between 1 and 10000 or page_size not between 1 and 100
    or minimum > maximum then
    raise exception 'Invalid bank filter range.' using errcode = '22023';
  end if;
  -- Fetch only a page plus one lookahead. Stable ID tie-break prevents equal-date ambiguity.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'accountId', t.account_id, 'amountMinor', t.amount_minor,
    'currency', t.currency, 'bookedOn', t.booked_on, 'description', t.description,
    'pending', t.pending, 'classification', t.classification, 'removedAt', t.removed_at,
    'accountName', a.name, 'accountMask', a.mask,
    'linkCount', (select count(*) from public.reconciliation_links l where l.bank_transaction_id = t.id and l.revoked_at is null)
  ) order by t.booked_on desc, t.id), '[]'::jsonb) into rows
  from (
    select * from public.bank_transactions b
    where b.removed_at is null and b.booked_on between date_from and date_to
      and (account is null or b.account_id = account)
      and (category is null or b.classification = category)
      and (currency_filter is null or b.currency = currency_filter)
      and (minimum is null or b.amount_minor >= minimum)
      and (maximum is null or b.amount_minor <= maximum)
    order by b.booked_on desc, b.id limit page_size + 1 offset (page_number - 1) * page_size
  ) t join public.bank_accounts a on a.id = t.account_id;
  return jsonb_build_object('hasMore', jsonb_array_length(rows) > page_size,
    'items', case when jsonb_array_length(rows) > page_size then rows - page_size else rows end);
end;
$$;

create function private.classify_bank_transaction(classification_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  category public.bank_classification;
  source public.bank_transactions;
begin
  if jsonb_typeof(classification_input) is distinct from 'object'
    or not (classification_input ?& array['actorId', 'transactionId', 'classification'])
    or (classification_input - array['actorId', 'transactionId', 'classification']) <> '{}'::jsonb
    or exists (select 1 from jsonb_each(classification_input) where jsonb_typeof(value) <> 'string') then
    raise exception 'Invalid classification input.' using errcode = '22023';
  end if;
  actor := (classification_input->>'actorId')::uuid;
  category := classification_input->>'classification';
  perform 1 from public.profiles where id = actor and role = 'admin' and approved_at is not null for share;
  if not found then raise exception 'Administrator required.' using errcode = '42501'; end if;
  -- The same source lock as sync/link serializes all changes to classification and links.
  select * into source from public.bank_transactions where id = (classification_input->>'transactionId')::uuid for update;
  if not found then raise exception 'Transaction unavailable.' using errcode = 'P0002'; end if;
  if source.removed_at is not null or source.pending
    or (category in ('donation', 'processor_payout') and source.amount_minor <= 0)
    or (category <> source.classification and exists (
      select 1 from public.reconciliation_links where bank_transaction_id = source.id and revoked_at is null
    )) then
    raise exception 'Incompatible classification.' using errcode = '22023';
  end if;
  if category = source.classification then return jsonb_build_object('outcome', 'duplicate'); end if;
  update public.bank_transactions set classification = category, updated_at = now() where id = source.id;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
    values (actor, 'bank.transaction.classified', 'bank_transaction', source.id,
      jsonb_build_object('previousClassification', source.classification, 'classification', category));
  -- Classification is a review label only. It never invents a ledger gift.
  return jsonb_build_object('outcome', 'applied');
end;
$$;

create function public.list_bank_transactions(actor_id uuid, query_input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.list_bank_transactions(actor_id, query_input);
$$;
create function public.classify_bank_transaction(classification_input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.classify_bank_transaction(classification_input);
$$;
revoke all on function public.list_bank_transactions(uuid, jsonb), private.list_bank_transactions(uuid, jsonb),
  public.classify_bank_transaction(jsonb), private.classify_bank_transaction(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.list_bank_transactions(uuid, jsonb), private.list_bank_transactions(uuid, jsonb),
  public.classify_bank_transaction(jsonb), private.classify_bank_transaction(jsonb) to service_role;
