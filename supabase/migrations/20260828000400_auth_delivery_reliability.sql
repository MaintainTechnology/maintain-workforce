-- Auth acceptance and notification delivery reliability.

alter table notification
  add column provider_message_id text;

-- Password creation happens at the Auth boundary immediately before this call. The
-- membership acceptance and its audit then commit atomically. A repeat call after a
-- successful commit returns the same company without writing a duplicate audit row.
create or replace function accept_company_invitation(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_accepted_at timestamptz;
  v_row_count integer;
begin
  select company_id, accepted_at
    into v_company_id, v_accepted_at
    from company_user
   where user_id = p_user_id::text
   for update;

  if not found then
    raise exception 'pending company invitation does not exist'
      using errcode = 'P0002';
  end if;

  if v_accepted_at is not null then
    return v_company_id;
  end if;

  update company_user
     set accepted_at = now()
   where user_id = p_user_id::text
     and company_id = v_company_id
     and accepted_at is null;
  get diagnostics v_row_count = row_count;

  if v_row_count <> 1 then
    raise exception 'company invitation acceptance changed no pending membership'
      using errcode = 'P0002';
  end if;

  insert into audit_event (
    actor_user_id,
    actor_is_system,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    p_user_id::text,
    false,
    'company_user.invitation_accepted',
    'company_user',
    p_user_id::text,
    jsonb_build_object('company_id', v_company_id)
  );

  return v_company_id;
end;
$$;

revoke all on function accept_company_invitation(uuid) from public, anon, authenticated;
grant execute on function accept_company_invitation(uuid) to service_role;
