-- Company verification and canonical status changes (1.4–1.6, 3.2, 4.5, 12.7, 18).
-- Clerk and nullable ABN registration are unchanged. The authenticated application
-- establishes the Maintain actor; these service-role-only RPCs own the transaction.

create or replace function company_verification_checklist(p_company_id uuid)
returns table(doc_type text, qualification_id uuid, label text, is_required boolean, is_verified boolean)
language sql stable security definer set search_path = public
as $$
  with target as (
    select c.id, c.abn from company c where c.id = p_company_id
  ), checklist as (
    select item.doc_type, null::uuid as qualification_id, item.label,
      case when item.doc_type = 'abn_verified' then nullif(trim(c.abn), '') is not null
        else item.is_required end as is_required
    from target c cross join (values
      ('abn_verified', 'ABN verified', true),
      ('public_liability', 'Public liability insurance', true),
      ('workers_comp', 'Workers compensation', true),
      ('trade_licence', 'Trade licence', false),
      ('lh_licence', 'Labour-hire licence', false),
      ('payment_details', 'Payment details provided', true)
    ) item(doc_type, label, is_required)
    union all
    select distinct 'trade_licence', q.id, q.name, true
    from worker_employment we
    join worker w on w.id = we.worker_id
    join trade_role_qualification trq on trq.trade_role_id = w.primary_trade_id
      and trq.level = 'company' and trq.is_mandatory
    join qualification q on q.id = trq.qualification_id
    where we.company_id = p_company_id and we.end_date is null
  )
  select item.doc_type, item.qualification_id, item.label, item.is_required,
    exists (
      select 1 from company_document d join target c on c.id = d.company_id
      where d.doc_type = item.doc_type
        and (item.qualification_id is null or d.qualification_id = item.qualification_id)
        and nullif(trim(d.verified_by), '') is not null and d.verified_at is not null
        and (d.expiry_date is null or d.expiry_date >= (now() at time zone 'Australia/Brisbane')::date)
        and (d.issue_date is null or d.issue_date <= (now() at time zone 'Australia/Brisbane')::date)
        and (item.doc_type in ('abn_verified', 'payment_details') or nullif(trim(d.file_path), '') is not null)
        -- A historical ABN check cannot verify an ABN edited after that check.
        and (item.doc_type <> 'abn_verified' or (c.abn is not null and d.number = c.abn))
    ) as is_verified
  from checklist item;
$$;
revoke all on function company_verification_checklist(uuid) from public, anon, authenticated, service_role;
grant execute on function company_verification_checklist(uuid) to service_role;

create or replace function verify_company_document_atomic(
  p_company_id uuid, p_document_id uuid, p_doc_type text,
  p_expected_status company_status, p_actor_user_id text, p_qualification_id uuid default null,
  p_expected_abn text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_company company%rowtype;
  v_document company_document%rowtype;
  v_before jsonb;
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'a Maintain actor is required' using errcode = '42501';
  end if;
  if p_expected_status is null or p_expected_status = 'Closed' or p_doc_type is null
     or p_doc_type not in ('abn_verified','payment_details','public_liability','workers_comp','trade_licence','lh_licence') then
    raise exception 'invalid company verification request' using errcode = '23514';
  end if;
  select * into v_company from company where id = p_company_id for no key update;
  if not found then raise exception 'company does not exist' using errcode = '23503'; end if;
  if v_company.status <> p_expected_status then
    raise exception 'company status changed; refresh before retrying' using errcode = '40001';
  end if;
  -- Bind this attestation to the ABN displayed to the acting admin. A same-status
  -- profile edit must not cause a stale form to verify an unseen replacement value.
  if p_doc_type = 'abn_verified' and p_expected_abn is distinct from v_company.abn then
    raise exception 'company ABN changed; refresh before verifying' using errcode = '40001';
  end if;

  if p_document_id is null then
    if p_doc_type not in ('abn_verified', 'payment_details') then
      raise exception 'an uploaded document ID is required' using errcode = '23514';
    end if;
    -- The company lock serialises reference-flag creation and repeated submissions.
    select * into v_document from company_document
      where company_id = p_company_id and doc_type = p_doc_type
      order by created_at desc, id limit 1 for update;
  else
    select * into v_document from company_document
      where id = p_document_id and company_id = p_company_id for update;
    if not found then raise exception 'company document does not exist' using errcode = '23503'; end if;
    if v_document.doc_type <> p_doc_type then
      raise exception 'document type does not match the stored document' using errcode = '23514';
    end if;
  end if;
  if p_qualification_id is not null and (
    p_doc_type <> 'trade_licence' or not exists (
      select 1 from company_verification_checklist(p_company_id) c
      where c.doc_type = 'trade_licence' and c.qualification_id = p_qualification_id and c.is_required
    )
  ) then
    raise exception 'the licence is not a required company catalogue qualification' using errcode = '23514';
  end if;
  if p_doc_type = 'abn_verified' and nullif(trim(v_company.abn), '') is null then
    raise exception 'an omitted ABN does not need a verification flag' using errcode = '23514';
  end if;
  if p_doc_type not in ('abn_verified','payment_details') and (
    nullif(trim(v_document.file_path), '') is null
    or v_document.expiry_date < v_today or v_document.issue_date > v_today
  ) then
    raise exception 'a current uploaded document is required' using errcode = '23514';
  end if;
  if v_document.verified_at is not null and v_document.verified_by is not null
     and (p_doc_type <> 'abn_verified' or v_document.number is not distinct from v_company.abn)
     and (p_qualification_id is null or v_document.qualification_id is not distinct from p_qualification_id) then
    raise exception 'document was already verified; refresh before retrying' using errcode = '40001';
  end if;

  v_before := case when v_document.id is null then null else to_jsonb(v_document) end;
  if v_document.id is null then
    insert into company_document(company_id, doc_type, number, verified_by, verified_at)
    values(p_company_id, p_doc_type, case when p_doc_type = 'abn_verified' then v_company.abn end, p_actor_user_id, now())
    returning * into v_document;
  else
    update company_document set verified_by = p_actor_user_id, verified_at = now(),
      number = case when p_doc_type = 'abn_verified' then v_company.abn else number end,
      qualification_id = coalesce(p_qualification_id, qualification_id),
      status = case when expiry_date < v_today then 'Expired'::document_status
        when expiry_date <= v_today + 30 then 'Expiring Soon'::document_status else 'Current'::document_status end
    where id = v_document.id and company_id = p_company_id returning * into v_document;
    if not found then raise exception 'document changed; refresh before retrying' using errcode = '40001'; end if;
  end if;
  insert into audit_event(actor_user_id,actor_is_system,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_user_id,false,'company_document.verified','company_document',v_document.id,v_before,
    jsonb_build_object('company_id',p_company_id,'doc_type',v_document.doc_type,
      'qualification_id',v_document.qualification_id,'verified_by',p_actor_user_id,'verified_at',v_document.verified_at,
      'number',v_document.number));
  return jsonb_build_object('company_id',p_company_id,'document_id',v_document.id);
end;
$$;
revoke all on function verify_company_document_atomic(uuid,uuid,text,company_status,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function verify_company_document_atomic(uuid,uuid,text,company_status,text,uuid,text) to service_role;

create or replace function transition_company_status_atomic(
  p_company_id uuid, p_expected_status company_status, p_next_status company_status, p_actor_user_id text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_company company%rowtype;
  v_match record;
  v_company_ids uuid[];
  v_lock_company_id uuid;
  v_worker_ids uuid[];
  v_closed jsonb;
  v_withdrawn jsonb := '[]'::jsonb;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'a Maintain actor is required' using errcode = '42501';
  end if;
  if p_expected_status is null or p_next_status is null then
    raise exception 'both company statuses are required' using errcode = '23514';
  end if;
  -- Match mutations share-lock both companies BEFORE workers. NO KEY UPDATE is
  -- compatible with ordinary FK key-share checks, but fences new marketplace work,
  -- aggregate intake and incoming transfers while this transition/cascade runs.
  select array_agg(ids.company_id order by ids.company_id) into v_company_ids from (
    select p_company_id as company_id where p_company_id is not null
    union
    select unnest(array[m.supplier_company_id,m.buyer_company_id]) from match m
      where m.status in ('Awaiting Supplier','Awaiting Buyer')
        and p_company_id in (m.supplier_company_id,m.buyer_company_id)
  ) ids;
  foreach v_lock_company_id in array coalesce(v_company_ids,'{}'::uuid[]) loop
    if v_lock_company_id = p_company_id then
      perform 1 from company where id = v_lock_company_id for no key update;
    else
      perform 1 from company where id = v_lock_company_id for share;
    end if;
  end loop;
  select * into v_company from company where id = p_company_id;
  if not found then raise exception 'company does not exist' using errcode = '23503'; end if;
  if v_company.status <> p_expected_status then
    raise exception 'company status changed; refresh before retrying' using errcode = '40001';
  end if;
  -- A proposal may have committed while the sorted company locks were acquired.
  -- Retry instead of taking a newly discovered counterparty lock out of order.
  if exists(select 1 from match m where m.status in ('Awaiting Supplier','Awaiting Buyer')
    and p_company_id in (m.supplier_company_id,m.buyer_company_id)
    and (not (m.supplier_company_id = any(v_company_ids)) or not (m.buyer_company_id = any(v_company_ids)))) then
    raise exception 'company matches changed; refresh before retrying' using errcode = '40001';
  end if;
  if not (
    (v_company.status = 'Pending' and p_next_status = 'Active')
    or (v_company.status = 'Active' and p_next_status = 'Suspended')
    or (v_company.status = 'Suspended' and p_next_status = 'Active')
    or (v_company.status <> 'Closed' and p_next_status = 'Closed')
  ) then raise exception 'invalid company status transition; Closed is terminal' using errcode = '23514'; end if;

  -- Current employment stabilises the catalogue-derived licence requirements.
  -- Include both nominated and shortlisted workers so status cascades share the
  -- global company -> workers -> demand -> capacity -> match ordering.
  select array_agg(ids.worker_id order by ids.worker_id) into v_worker_ids from (
    select we.worker_id from worker_employment we where we.company_id = p_company_id and we.end_date is null
    union
    select mw.worker_id from match_worker mw join match m on m.id = mw.match_id
      where m.status in ('Awaiting Supplier','Awaiting Buyer')
        and p_company_id in (m.supplier_company_id,m.buyer_company_id)
    union
    select sw.worker_id from match_shortlist_worker sw join match m on m.id = sw.match_id
      where m.status in ('Awaiting Supplier','Awaiting Buyer')
        and p_company_id in (m.supplier_company_id,m.buyer_company_id)
  ) ids;
  perform lock_match_workers(v_worker_ids);

  if v_company.status = 'Pending' and p_next_status = 'Active' then
    perform 1 from company_document where company_id = p_company_id order by id for share;
    if exists(select 1 from company_verification_checklist(p_company_id) where is_required and not is_verified) then
      raise exception 'company checklist is incomplete or expired' using errcode = '23514';
    end if;
  end if;

  if p_next_status in ('Suspended','Closed') then
    perform 1 from demand_line dl where dl.company_id = p_company_id or exists (
      select 1 from match m where m.demand_line_id = dl.id
        and m.status in ('Awaiting Supplier','Awaiting Buyer')
        and p_company_id in (m.supplier_company_id,m.buyer_company_id)
    ) order by dl.id for update;
    perform 1 from capacity_line cl where cl.company_id = p_company_id order by cl.id for update;
    for v_match in
      select m.*, s.contact_email as supplier_email, b.contact_email as buyer_email
      from match m join company s on s.id = m.supplier_company_id join company b on b.id = m.buyer_company_id
      where m.status in ('Awaiting Supplier','Awaiting Buyer')
        and p_company_id in (m.supplier_company_id,m.buyer_company_id)
      order by m.demand_line_id,m.id
    loop
      v_closed := close_match_atomic(v_match.id,v_match.status,'Withdrawn',
        'company ' || p_next_status::text,p_actor_user_id,false,null,null,false,null);
      v_withdrawn := v_withdrawn || jsonb_build_array(v_closed || jsonb_build_object(
        'supplier_email',v_match.supplier_email,'buyer_email',v_match.buyer_email));
    end loop;
  end if;

  update company set status = p_next_status where id = p_company_id and status = p_expected_status;
  if not found then raise exception 'company status changed; refresh before retrying' using errcode = '40001'; end if;
  insert into audit_event(actor_user_id,actor_is_system,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_user_id,false,'company.status_changed','company',p_company_id,
    jsonb_build_object('status',v_company.status),
    jsonb_build_object('status',p_next_status,'decision',case when v_company.status = 'Pending' and p_next_status = 'Active' then 'approved' end,
      'withdrawn_match_count',jsonb_array_length(v_withdrawn)));
  -- Existing engagements are deliberately untouched. Their review flag is derived
  -- from company/compliance state; suspension/closure never cancels booked work.
  return jsonb_build_object('company_id',p_company_id,'status_before',v_company.status,
    'status_after',p_next_status,'contact_email',v_company.contact_email,'withdrawn_matches',v_withdrawn);
end;
$$;
revoke all on function transition_company_status_atomic(uuid,company_status,company_status,text) from public, anon, authenticated, service_role;
grant execute on function transition_company_status_atomic(uuid,company_status,company_status,text) to service_role;

create or replace function reject_company_verification_atomic(
  p_company_id uuid, p_expected_status company_status, p_reason text, p_actor_user_id text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_company company%rowtype;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'a Maintain actor is required' using errcode = '42501';
  end if;
  if p_expected_status is distinct from 'Pending'::company_status
     or length(trim(coalesce(p_reason,''))) < 4 or length(p_reason) > 2000 then
    raise exception 'a Pending verification and rejection reason are required' using errcode = '23514';
  end if;
  select * into v_company from company where id = p_company_id for no key update;
  if not found then raise exception 'company does not exist' using errcode = '23503'; end if;
  if v_company.status <> p_expected_status then
    raise exception 'company status changed; refresh before retrying' using errcode = '40001';
  end if;
  insert into audit_event(actor_user_id,actor_is_system,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_user_id,false,'company.verification_rejected','company',p_company_id,
    jsonb_build_object('status',v_company.status),
    jsonb_build_object('status',v_company.status,'decision','rejected','reason',trim(p_reason)));
  return jsonb_build_object('company_id',p_company_id,'contact_email',v_company.contact_email);
end;
$$;
revoke all on function reject_company_verification_atomic(uuid,company_status,text,text) from public, anon, authenticated, service_role;
grant execute on function reject_company_verification_atomic(uuid,company_status,text,text) to service_role;
