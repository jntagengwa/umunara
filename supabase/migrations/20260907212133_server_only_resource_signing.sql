-- Storage SELECT also permits callers to mint signed URLs with arbitrary expiry.
-- Keep resource metadata under RLS, but let only the server service role sign files.
drop policy "resources: approved members download published files" on storage.objects;
