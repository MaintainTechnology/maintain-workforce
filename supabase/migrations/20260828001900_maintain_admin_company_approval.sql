-- Maintain approval is an explicit staff decision. Missing company details or
-- unverified documents remain visible and are recorded with the decision; they
-- do not prevent a Maintain admin from activating a newly registered company.
-- Keep the standard, checklist-enforcing status transition unchanged.

begin;

create or replace function approve_company_as_maintain_atomic(
  p_company_id uuid,
  p_expected_status company_status,
  p_actor_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company company%rowtype;
  v_outstanding_requirements jsonb;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'a Maintain actor is required' using errcode = '42501';
  end if;
  if p_expected_status is null or p_expected_status <> 'Pending'::company_status then
    raise exception 'Maintain approval requires a Pending company' using errcode = '23514';
  end if;

  -- Serialize the decision against other lifecycle, profile and document writers.
  select * into v_company from company where id = p_company_id for no key update;
  if not found then
    raise exception 'company does not exist' using errcode = '23503';
  end if;
  if v_company.status <> p_expected_status then
    raise exception 'company status changed; refresh before retrying' using errcode = '40001';
  end if;

  perform 1 from company_document where company_id = p_company_id order by id for share;
  select coalesce(jsonb_agg(to_jsonb(requirement) order by requirement.doc_type, requirement.qualification_id), '[]'::jsonb)
    into v_outstanding_requirements
    from company_verification_checklist(p_company_id) requirement
   where requirement.is_required and not requirement.is_verified;

  update company set status = 'Active'::company_status
   where id = p_company_id and status = p_expected_status;
  if not found then
    raise exception 'company status changed; refresh before retrying' using errcode = '40001';
  end if;

  insert into audit_event(
    actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data
  ) values (
    trim(p_actor_user_id), false, 'company.status_changed', 'company', p_company_id,
    jsonb_build_object('status', v_company.status),
    jsonb_build_object(
      'status', 'Active',
      'decision', 'approved',
      'approval_mode', 'maintain_admin',
      'outstanding_requirements', v_outstanding_requirements,
      'withdrawn_match_count', 0
    )
  );

  return jsonb_build_object(
    'company_id', p_company_id,
    'status_before', v_company.status,
    'status_after', 'Active',
    'contact_email', v_company.contact_email,
    'withdrawn_matches', '[]'::jsonb
  );
end;
$$;

revoke all on function approve_company_as_maintain_atomic(uuid, company_status, text)
  from public, anon, authenticated, service_role;
grant execute on function approve_company_as_maintain_atomic(uuid, company_status, text)
  to service_role;

commit;
