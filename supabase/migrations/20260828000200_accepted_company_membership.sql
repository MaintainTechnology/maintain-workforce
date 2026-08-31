-- Pending Supabase invitations are persisted so they remain visible and reissuable,
-- but they are not company authority until the invitee completes the password flow.

-- Rows that pre-date invitations represent administrators who already had access.
update company_user
   set accepted_at = created_at
 where accepted_at is null
   and invited_at is null;

create or replace function current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
    from company_user
   where user_id = auth.jwt() ->> 'sub'
     and accepted_at is not null;
$$;
