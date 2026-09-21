-- Company admins and Maintain reviewers share one atomic profile writer. Keep the
-- company row, operating regions and audit event in one transaction, and reject a
-- stale screen rather than letting either side overwrite the other's newer edit.

begin;

create or replace function update_company_profile_atomic(
  p_company_id uuid,
  p_expected_status company_status,
  p_expected_profile jsonb,
  p_actor_user_id text,
  p_actor_scope text,
  p_legal_name text,
  p_trading_name text,
  p_abn text,
  p_industry_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_primary_region_id uuid,
  p_operating_region_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company company%rowtype;
  v_abn text := nullif(trim(p_abn), '');
  v_existing_regions uuid[];
  v_regions uuid[];
  v_before jsonb;
  v_after jsonb;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'an authenticated actor is required' using errcode = '42501';
  end if;
  if p_actor_scope is null or p_actor_scope not in ('company', 'maintain') then
    raise exception 'a valid profile actor scope is required' using errcode = '42501';
  end if;
  if p_expected_status is null
    or p_expected_status not in ('Pending'::company_status, 'Active'::company_status)
    or (p_actor_scope = 'maintain' and p_expected_status <> 'Pending'::company_status)
  then
    raise exception 'company profile is not writable in this state' using errcode = '23514';
  end if;
  if p_expected_profile is null or jsonb_typeof(p_expected_profile) <> 'object' then
    raise exception 'the displayed company profile is required' using errcode = '23514';
  end if;
  if length(coalesce(trim(p_legal_name), '')) < 2
    or length(coalesce(trim(p_contact_name), '')) < 2
    or position('@' in coalesce(trim(p_contact_email), '')) < 2
    or length(coalesce(trim(p_contact_phone), '')) < 6
    or p_industry_id is null
    or p_primary_region_id is null
  then
    raise exception 'company profile fields are incomplete' using errcode = '23514';
  end if;

  select * into v_company
    from company
   where id = p_company_id
   for update;
  if not found then
    raise exception 'company does not exist' using errcode = '23503';
  end if;
  if p_actor_scope = 'company' then
    perform 1
      from company_user
     where user_id = trim(p_actor_user_id)
       and company_id = p_company_id
       and accepted_at is not null
     for share;
    if not found then
      raise exception 'company membership changed; sign in again' using errcode = '42501';
    end if;
  end if;
  if v_company.status <> p_expected_status then
    raise exception 'company status changed; refresh before retrying' using errcode = '40001';
  end if;

  select coalesce(array_agg(region_id order by region_id), '{}'::uuid[])
    into v_existing_regions
    from company_operating_region
   where company_id = p_company_id;

  v_before := jsonb_build_object(
    'legal_name', v_company.legal_name,
    'trading_name', v_company.trading_name,
    'abn', v_company.abn,
    'industry_id', v_company.industry_id,
    'contact_name', v_company.contact_name,
    'contact_email', v_company.contact_email,
    'contact_phone', v_company.contact_phone,
    'primary_region_id', v_company.primary_region_id,
    'operating_region_ids', to_jsonb(v_existing_regions)
  );
  if v_before is distinct from p_expected_profile then
    raise exception 'company profile changed; refresh before retrying' using errcode = '40001';
  end if;

  select coalesce(array_agg(region_id order by region_id), '{}'::uuid[])
    into v_regions
    from (
      select distinct unnest(
        array_append(coalesce(p_operating_region_ids, '{}'::uuid[]), p_primary_region_id)
      ) as region_id
    ) selected_regions
   where region_id is not null;

  -- Existing inactive catalogue choices remain reviewable, while new choices must be active.
  if not exists (
    select 1 from industry
     where id = p_industry_id
       and (is_active or id = v_company.industry_id)
  ) then
    raise exception 'industry is unavailable' using errcode = '23514';
  end if;
  if not exists (
    select 1 from region
     where id = p_primary_region_id
       and (is_active or id = v_company.primary_region_id)
  ) then
    raise exception 'primary region is unavailable' using errcode = '23514';
  end if;
  if exists (
    select 1
      from unnest(v_regions) selected(region_id)
      left join region on region.id = selected.region_id
     where region.id is null
        or (not region.is_active and not selected.region_id = any(v_existing_regions))
  ) then
    raise exception 'one or more regions are unavailable' using errcode = '23514';
  end if;

  update company
     set legal_name = trim(p_legal_name),
         trading_name = nullif(trim(p_trading_name), ''),
         abn = v_abn,
         industry_id = p_industry_id,
         contact_name = trim(p_contact_name),
         contact_email = lower(trim(p_contact_email)),
         contact_phone = trim(p_contact_phone),
         primary_region_id = p_primary_region_id
   where id = p_company_id
     and status = p_expected_status;
  if not found then
    raise exception 'company status changed; refresh before retrying' using errcode = '40001';
  end if;

  delete from company_operating_region where company_id = p_company_id;
  insert into company_operating_region(company_id, region_id)
  select p_company_id, unnest(v_regions);

  v_after := jsonb_build_object(
    'legal_name', trim(p_legal_name),
    'trading_name', nullif(trim(p_trading_name), ''),
    'abn', v_abn,
    'industry_id', p_industry_id,
    'contact_name', trim(p_contact_name),
    'contact_email', lower(trim(p_contact_email)),
    'contact_phone', trim(p_contact_phone),
    'primary_region_id', p_primary_region_id,
    'operating_region_ids', to_jsonb(v_regions)
  );

  insert into audit_event(
    actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data
  ) values (
    trim(p_actor_user_id), false,
    case when p_actor_scope = 'maintain'
      then 'company.profile_updated_by_maintain'
      else 'company.profile_updated'
    end,
    'company',
    p_company_id, v_before, v_after
  );

  return v_after || jsonb_build_object('company_id', p_company_id, 'status', v_company.status);
end;
$$;

revoke all on function update_company_profile_atomic(
  uuid, company_status, jsonb, text, text, text, text, text, uuid, text, text, text, uuid, uuid[]
) from public, anon, authenticated, service_role;

grant execute on function update_company_profile_atomic(
  uuid, company_status, jsonb, text, text, text, text, text, uuid, text, text, text, uuid, uuid[]
) to service_role;

commit;
