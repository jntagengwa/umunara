-- One bounded aggregate read; browser roles still have no finance table or RPC access.
-- Current projections restate the immutable receipt period after adjustments.
create function public.donation_report(report_from date, report_to date,
  report_currency public.donation_currency)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  previous_from date;
  result jsonb;
begin
  if report_from is null or report_to is null or report_currency is null
    or not isfinite(report_from) or not isfinite(report_to)
    or report_from < date '2000-01-01' or report_to > date '9998-12-31'
    or report_to < report_from or report_to - report_from >= 366 then
    raise exception using errcode = '22023', message = 'Invalid donation report range.';
  end if;
  previous_from := report_from - (report_to - report_from + 1);
  select coalesce(jsonb_agg(to_jsonb(grouped) order by grouped.period, grouped.month,
    grouped.provider, grouped.cadence), '[]'::jsonb) into result
  from (
    select
      case when d.received_at >= (report_from::timestamp at time zone 'UTC')
        then 'current' else 'previous' end as period,
      to_char(d.received_at at time zone 'UTC', 'YYYY-MM') as month,
      d.provider, d.cadence,
      count(*)::text as "giftCount",
      sum(d.gross_amount_minor)::text as "grossAmountMinor",
      sum(d.fee_amount_minor)::text as "feeAmountMinor",
      sum(d.refunded_amount_minor)::text as "refundedAmountMinor",
      sum(d.net_amount_minor)::text as "netAmountMinor"
    from public.donations d
    where d.received_at >= (previous_from::timestamp at time zone 'UTC')
      and d.received_at < ((report_to + 1)::timestamp at time zone 'UTC')
      and d.currency = report_currency
      and d.status in ('succeeded', 'refunded', 'reversed')
    group by 1, 2, 3, 4
  ) grouped;
  return result;
end;
$$;
revoke all on function public.donation_report(date, date, public.donation_currency)
  from public, anon, authenticated;
grant execute on function public.donation_report(date, date, public.donation_currency) to service_role;
comment on function public.donation_report(date, date, public.donation_currency) is
  'Admin application reporting only: settled receipts, cumulative refunds/reversals and retained fees, by original UTC receipt date. No donor identity.';
