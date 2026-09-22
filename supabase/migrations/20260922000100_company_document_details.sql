-- Document metadata can be saved before evidence arrives. Drafts remain unverified;
-- uploads attach to the same row through save_company_document_atomic.
begin;

create function save_company_document_details_atomic(
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
  p_expected_document jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company company%rowtype;
  v_document company_document%rowtype;
  v_before jsonb;
  v_snapshot jsonb;
  v_values jsonb := jsonb_build_object(
    'number', nullif(trim(p_number), ''), 'issuer', nullif(trim(p_issuer), ''),
    'issue_date', p_issue_date, 'expiry_date', p_expiry_date
  );
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  if nullif(trim(p_actor_user_id), '') is null
    or p_actor_scope is null or p_actor_scope not in ('company', 'maintain') then
    raise exception 'an authenticated document actor is required' using errcode = '42501';
  end if;
  if p_expected_status is null or p_expected_status = 'Closed'::company_status
    or (p_actor_scope = 'company' and p_expected_status not in ('Pending'::company_status, 'Active'::company_status)) then
    raise exception 'company documents are not writable in this state' using errcode = '23514';
  end if;
  if p_document_id is null or p_doc_type is null
    or p_doc_type not in ('public_liability', 'workers_comp', 'trade_licence', 'lh_licence')
    or length(trim(p_number)) > 120 or length(trim(p_issuer)) > 200
    or (p_issue_date is not null and p_expiry_date is not null and p_expiry_date < p_issue_date) then
    raise exception 'valid document details are required' using errcode = '23514';
  end if;

  select * into v_company from company where id = p_company_id for update;
  if not found then raise exception 'company does not exist' using errcode = '23503'; end if;
  if p_actor_scope = 'company' then
    perform 1 from company_user
     where user_id = trim(p_actor_user_id) and company_id = p_company_id and accepted_at is not null for share;
    if not found then raise exception 'company membership changed; sign in again' using errcode = '42501'; end if;
  end if;
  if v_company.status <> p_expected_status then
    raise exception 'company status changed; refresh before retrying' using errcode = '40001';
  end if;

  select * into v_document from company_document where id = p_document_id for update;
  if found then
    if v_document.company_id <> p_company_id or v_document.doc_type <> p_doc_type then
      raise exception 'company document does not exist for this company and type' using errcode = '23503';
    end if;
    if nullif(trim(v_document.file_path), '') is not null
      or v_document.verified_at is not null or v_document.verified_by is not null then
      raise exception 'document evidence changed; refresh before retrying' using errcode = '40001';
    end if;
    v_snapshot := jsonb_build_object(
      'number', v_document.number, 'issuer', v_document.issuer,
      'issue_date', v_document.issue_date, 'expiry_date', v_document.expiry_date
    );
    -- A stable form id makes double submissions and lost responses retry-safe.
    if v_snapshot = v_values then
      return jsonb_build_object('company_id', p_company_id, 'document_id', v_document.id, 'snapshot', v_snapshot);
    end if;
    if p_expected_document is null or p_expected_document <> v_snapshot then
      raise exception 'document details changed; refresh before retrying' using errcode = '40001';
    end if;
    v_before := to_jsonb(v_document);
    update company_document set
      number = nullif(trim(p_number), ''), issuer = nullif(trim(p_issuer), ''),
      issue_date = p_issue_date, expiry_date = p_expiry_date,
      status = case when p_expiry_date < v_today then 'Expired'::document_status
        when p_expiry_date <= v_today + 30 then 'Expiring Soon'::document_status else 'Current'::document_status end
     where id = v_document.id returning * into v_document;
  else
    if p_expected_document is not null then
      raise exception 'company document does not exist' using errcode = '23503';
    end if;
    insert into company_document(id, company_id, doc_type, number, issuer, issue_date, expiry_date, status)
    values (p_document_id, p_company_id, p_doc_type, nullif(trim(p_number), ''), nullif(trim(p_issuer), ''),
      p_issue_date, p_expiry_date,
      case when p_expiry_date < v_today then 'Expired'::document_status
        when p_expiry_date <= v_today + 30 then 'Expiring Soon'::document_status else 'Current'::document_status end)
    returning * into v_document;
  end if;

  insert into audit_event(actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data)
  values (trim(p_actor_user_id), false,
    case when v_before is null then 'company_document.details_saved' else 'company_document.details_updated' end,
    'company_document', v_document.id, v_before,
    to_jsonb(v_document) || jsonb_build_object('admin_entered', p_actor_scope = 'maintain'));
  return jsonb_build_object('company_id', p_company_id, 'document_id', v_document.id, 'snapshot', v_values);
end;
$$;

revoke all on function save_company_document_details_atomic(
  uuid, company_status, text, text, uuid, text, text, text, date, date, jsonb
) from public, anon, authenticated, service_role;
grant execute on function save_company_document_details_atomic(
  uuid, company_status, text, text, uuid, text, text, text, date, date, jsonb
) to service_role;

-- A draft may be edited while bytes are uploading. Check the exact displayed
-- metadata under the same locks as attachment so the file cannot evidence a
-- different editor's newer details.
create function attach_company_document_with_snapshot_atomic(
  p_company_id uuid, p_expected_status company_status, p_actor_user_id text,
  p_actor_scope text, p_document_id uuid, p_doc_type text, p_number text,
  p_issuer text, p_issue_date date, p_expiry_date date, p_file_path text,
  p_expected_document jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_document company_document%rowtype;
begin
  perform 1 from company where id = p_company_id for update;
  if not found then raise exception 'company does not exist' using errcode = '23503'; end if;
  select * into v_document from company_document
    where id = p_document_id and company_id = p_company_id and doc_type = p_doc_type for update;
  if not found then raise exception 'company document does not exist' using errcode = '23503'; end if;
  if p_expected_document is null or p_expected_document <> jsonb_build_object(
    'number', v_document.number, 'issuer', v_document.issuer,
    'issue_date', v_document.issue_date, 'expiry_date', v_document.expiry_date
  ) then
    raise exception 'document details changed while uploading; refresh before retrying' using errcode = '40001';
  end if;
  return save_company_document_atomic(p_company_id, p_expected_status, p_actor_user_id,
    p_actor_scope, p_document_id, p_doc_type, p_number, p_issuer, p_issue_date, p_expiry_date, p_file_path);
end;
$$;

revoke all on function attach_company_document_with_snapshot_atomic(
  uuid, company_status, text, text, uuid, text, text, text, date, date, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function attach_company_document_with_snapshot_atomic(
  uuid, company_status, text, text, uuid, text, text, text, date, date, text, jsonb
) to service_role;

commit;
