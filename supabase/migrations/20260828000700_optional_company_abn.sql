-- Companies can complete Clerk onboarding before they have an ABN available.
-- A supplied ABN is still checksum-validated and remains unique.

begin;

alter table company
  alter column abn drop not null;

update company
   set abn = null
 where btrim(abn) = '';

alter table company
  add constraint company_abn_not_blank
  check (abn is null or btrim(abn) <> '');

-- Keep the invariant at the database boundary because authenticated company
-- administrators can update their own profile directly under RLS.
alter table company
  add constraint company_abn_valid
  check (
    case
      when abn is null then true
      when abn !~ '^[0-9]{11}$' then false
      else mod(
        (substring(abn from 1 for 1)::integer - 1) * 10
        + substring(abn from 2 for 1)::integer
        + substring(abn from 3 for 1)::integer * 3
        + substring(abn from 4 for 1)::integer * 5
        + substring(abn from 5 for 1)::integer * 7
        + substring(abn from 6 for 1)::integer * 9
        + substring(abn from 7 for 1)::integer * 11
        + substring(abn from 8 for 1)::integer * 13
        + substring(abn from 9 for 1)::integer * 15
        + substring(abn from 10 for 1)::integer * 17
        + substring(abn from 11 for 1)::integer * 19,
        89
      ) = 0
    end
  );

comment on column company.abn is
  'Optional during onboarding; supplied values are checksum-validated and unique.';

create or replace function register_company_with_first_clerk_admin(
  p_actor_user_id text,
  p_administrator_email text,
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
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_abn text := nullif(trim(p_abn), '');
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'verified Clerk identity is required'
      using errcode = '22023';
  end if;

  if nullif(trim(p_administrator_email), '') is null then
    raise exception 'verified Clerk email is required'
      using errcode = '22023';
  end if;

  insert into company (
    legal_name,
    trading_name,
    abn,
    industry_id,
    contact_name,
    contact_email,
    contact_phone,
    primary_region_id,
    status
  ) values (
    trim(p_legal_name),
    nullif(trim(p_trading_name), ''),
    v_abn,
    p_industry_id,
    trim(p_contact_name),
    lower(trim(p_contact_email)),
    trim(p_contact_phone),
    p_primary_region_id,
    'Pending'
  )
  returning id into v_company_id;

  insert into company_operating_region (company_id, region_id)
  select v_company_id, region_id
    from (
      select distinct unnest(
        array_append(coalesce(p_operating_region_ids, '{}'::uuid[]), p_primary_region_id)
      ) as region_id
    ) selected_regions
   where region_id is not null;

  insert into company_user (user_id, company_id, invited_email, accepted_at)
  values (
    trim(p_actor_user_id),
    v_company_id,
    lower(trim(p_administrator_email)),
    now()
  );

  insert into audit_event (
    actor_user_id,
    actor_is_system,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    trim(p_actor_user_id),
    false,
    'company.registered',
    'company',
    v_company_id::text,
    jsonb_build_object(
      'legal_name', trim(p_legal_name),
      'abn', v_abn,
      'status', 'Pending'
    )
  );

  return v_company_id;
end;
$$;

revoke all on function register_company_with_first_clerk_admin(
  text, text, text, text, text, uuid, text, text, text, uuid, uuid[]
) from public, anon, authenticated;

grant execute on function register_company_with_first_clerk_admin(
  text, text, text, text, text, uuid, text, text, text, uuid, uuid[]
) to service_role;

commit;
