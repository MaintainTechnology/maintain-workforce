-- Persist document uploads and repairs with their audit in one transaction. A
-- repair can only attach evidence to an unverified row that has no file; it never
-- overwrites the submitted metadata or performs a verification.

begin;

create or replace function save_company_document_atomic(
  p_company_id uuid,
  p_expected_status company_status,
  p_actor_user_id text,
  p_actor_scope text,
  p_document_id uuid,
  p_doc_type text,
  p_number text,
  p_issuer text,
  p_issue_date date,
  p_expiry_date date,
  p_file_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company company%rowtype;
  v_document company_document%rowtype;
  v_file_path text := nullif(trim(p_file_path), '');
  v_before jsonb;
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'an authenticated actor is required' using errcode = '42501';
  end if;
  if p_actor_scope is null or p_actor_scope not in ('company', 'maintain') then
    raise exception 'a valid document actor scope is required' using errcode = '42501';
  end if;
  if p_expected_status is null or p_expected_status = 'Closed'::company_status
    or (p_actor_scope = 'company' and p_expected_status not in ('Pending'::company_status, 'Active'::company_status))
  then
    raise exception 'company documents are not writable in this state' using errcode = '23514';
  end if;
  if p_doc_type is null or p_doc_type not in ('public_liability', 'workers_comp', 'trade_licence', 'lh_licence') then
    raise exception 'an uploadable company document type is required' using errcode = '23514';
  end if;
  if v_file_path is null or p_company_id is null
    or left(v_file_path, length(p_company_id::text) + 1) <> p_company_id::text || '/'
    or length(v_file_path) <= length(p_company_id::text) + 1
  then
    raise exception 'an uploaded file scoped to this company is required' using errcode = '23514';
  end if;

  -- All company lifecycle/document writers lock the company before its children.
  select * into v_company from company where id = p_company_id for update;
  if not found then
    raise exception 'company does not exist' using errcode = '23503';
  end if;
  if p_actor_scope = 'company' then
    perform 1 from company_user
     where user_id = trim(p_actor_user_id) and company_id = p_company_id and accepted_at is not null
     for share;
    if not found then
      raise exception 'company membership changed; sign in again' using errcode = '42501';
    end if;
  end if;
  if v_company.status <> p_expected_status then
    raise exception 'company status changed; refresh before retrying' using errcode = '40001';
  end if;

  -- The object must have been successfully uploaded to the private bucket first.
  -- This share lock prevents an in-flight deletion until the record is committed.
  perform 1 from storage.objects
   where bucket_id = 'company-documents' and name = v_file_path
   for share;
  if not found then
    raise exception 'the uploaded company document file does not exist' using errcode = '23514';
  end if;

  if p_document_id is null then
    if p_issue_date is not null and p_expiry_date is not null and p_expiry_date < p_issue_date then
      raise exception 'document expiry cannot precede its issue date' using errcode = '23514';
    end if;
    insert into company_document(
      company_id, doc_type, number, issuer, issue_date, expiry_date, file_path, status
    ) values (
      p_company_id, p_doc_type, nullif(trim(p_number), ''), nullif(trim(p_issuer), ''),
      p_issue_date, p_expiry_date, v_file_path,
      case when p_expiry_date < v_today then 'Expired'::document_status
        when p_expiry_date <= v_today + 30 then 'Expiring Soon'::document_status
        else 'Current'::document_status end
    ) returning * into v_document;
  else
    select * into v_document from company_document
     where id = p_document_id and company_id = p_company_id and doc_type = p_doc_type
     for update;
    if not found then
      raise exception 'company document does not exist for this company and type' using errcode = '23503';
    end if;
    if nullif(trim(v_document.file_path), '') is not null
      or v_document.verified_at is not null or v_document.verified_by is not null
    then
      raise exception 'document changed; refresh before attaching a file' using errcode = '40001';
    end if;
    v_before := to_jsonb(v_document);
    update company_document set file_path = v_file_path
     where id = v_document.id
     returning * into v_document;
  end if;

  insert into audit_event(
    actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data
  ) values (
    trim(p_actor_user_id), false,
    case when p_document_id is null then 'company_document.created' else 'company_document.file_attached' end,
    'company_document', v_document.id, v_before,
    to_jsonb(v_document) || jsonb_build_object('admin_entered', p_actor_scope = 'maintain')
  );

  return jsonb_build_object('company_id', p_company_id, 'document_id', v_document.id);
end;
$$;

revoke all on function save_company_document_atomic(
  uuid, company_status, text, text, uuid, text, text, text, date, date, text
) from public, anon, authenticated, service_role;

grant execute on function save_company_document_atomic(
  uuid, company_status, text, text, uuid, text, text, text, date, date, text
) to service_role;

commit;
