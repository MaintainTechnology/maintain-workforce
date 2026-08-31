-- Private storage buckets — spec 1.7 and 7.1.
-- Documents are commercially and personally sensitive: insurance certificates,
-- licences, tickets. Buckets are private and every read is a server-issued signed
-- URL, so a leaked path is not a leaked document.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('company-documents', 'company-documents', false, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png']),
  ('worker-qualifications', 'worker-qualifications', false, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- 1.7 — company documents are scoped by company id, readable by the owning company
-- and Maintain. The first path segment is the company id.
create policy company_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[1] = current_company_id()::text
  );

create policy company_documents_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[1] = current_company_id()::text
  );

-- 7.1 — qualification documents follow the WORKER, not the uploader: read access is
-- worker-scoped through the open employment row, and paths are never re-parented on
-- transfer. The first path segment is the worker id, deliberately not a company id.
create policy worker_qualifications_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'worker-qualifications'
    and current_company_employs(((storage.foldername(name))[1])::uuid)
  );

create policy worker_qualifications_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'worker-qualifications'
    and current_company_employs(((storage.foldername(name))[1])::uuid)
  );
