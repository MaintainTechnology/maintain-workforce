-- Supabase Auth registration and audit identifiers — specs 1.1, 2.1 and 18.1.

-- Audit subjects are not uniformly UUIDs (auth users are UUIDs, while configuration
-- keys and other audited identifiers are text). Preserve existing UUID values as text.
alter table audit_event
  alter column entity_id type text using entity_id::text;

alter table company_user
  add column invited_email text,
  add column invited_at timestamptz,
  add column accepted_at timestamptz;

-- The public registration action first creates a Supabase Auth user, then invokes
-- this service-role-only function. Company, regions, membership and the registration
-- audit event commit together or roll back together.
create or replace function register_company_with_first_admin(
  p_actor_user_id uuid,
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
  v_auth_email text;
begin
  select lower(email)
    into v_auth_email
    from auth.users
   where id = p_actor_user_id;

  if v_auth_email is null or v_auth_email <> lower(trim(p_administrator_email)) then
    raise exception 'verified auth identity does not match registration email'
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
    p_abn,
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
  values (p_actor_user_id::text, v_company_id, lower(trim(p_administrator_email)), now());

  insert into audit_event (
    actor_user_id,
    actor_is_system,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    p_actor_user_id::text,
    false,
    'company.registered',
    'company',
    v_company_id::text,
    jsonb_build_object(
      'legal_name', trim(p_legal_name),
      'abn', p_abn,
      'status', 'Pending'
    )
  );

  return v_company_id;
end;
$$;

revoke all on function register_company_with_first_admin(
  uuid, text, text, text, text, uuid, text, text, text, uuid, uuid[]
) from public, anon, authenticated;

grant execute on function register_company_with_first_admin(
  uuid, text, text, text, text, uuid, text, text, text, uuid, uuid[]
) to service_role;
