-- Fixed-content editing is an editor capability. Retain RLS and approval checks.
drop policy "site settings: admins manage" on public.site_settings;
create policy "site settings: editors manage" on public.site_settings
  for all to authenticated
  using ((select private.has_minimum_role('editor')))
  with check ((select private.has_minimum_role('editor')));
