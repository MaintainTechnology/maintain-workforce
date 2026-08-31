-- Maintain Workforce MVP — row level security + per-party projections
-- Spec module 17. RLS is the security boundary; app filtering is a convenience only.
-- Maintain admin screens run server-side with the service-role key (17.3), which
-- bypasses RLS by design; every policy below therefore describes company_admin access.

-- ---------------------------------------------------------------- helpers
-- The company the calling user administers (2.2: bound to exactly one company).
create or replace function current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Supabase Auth places its verified user UUID in the JWT subject. company_user
  -- keeps that identifier as text so the membership lookup is a direct comparison.
  select company_id from company_user where user_id = auth.jwt() ->> 'sub';
$$;

-- 13.0 committing statuses, used by capacity computations and the transfer block.
create or replace function is_committing(s engagement_status)
returns boolean
language sql
immutable
as $$
  select s in ('Awaiting Commercial', 'Confirmed', 'Active');
$$;

-- Worker tenancy runs through the open employment row (17.1), never a column on worker.
create or replace function current_company_employs(w uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from worker_employment
    where worker_id = w
      and company_id = current_company_id()
      and end_date is null
  );
$$;

-- ---------------------------------------------------------------- deny by default
-- Every table gets RLS on from the first migration; absence of a policy denies.
alter table industry                     enable row level security;
alter table region                       enable row level security;
alter table proficiency                  enable row level security;
alter table trade_role                   enable row level security;
alter table skill                        enable row level security;
alter table qualification                enable row level security;
alter table trade_role_proficiency       enable row level security;
alter table trade_role_qualification     enable row level security;
alter table public_holiday               enable row level security;
alter table rate_band                    enable row level security;
alter table platform_config              enable row level security;
alter table company                      enable row level security;
alter table company_operating_region     enable row level security;
alter table company_user                 enable row level security;
alter table company_document             enable row level security;
alter table lead                         enable row level security;
alter table worker                       enable row level security;
alter table worker_travel_region         enable row level security;
alter table worker_skill                 enable row level security;
alter table worker_qualification         enable row level security;
alter table worker_employment            enable row level security;
alter table worker_transfer              enable row level security;
alter table capacity_listing             enable row level security;
alter table capacity_line                enable row level security;
alter table capacity_line_travel_region  enable row level security;
alter table capacity_line_worker         enable row level security;
alter table demand_request               enable row level security;
alter table demand_line                  enable row level security;
alter table demand_line_skill            enable row level security;
alter table demand_line_qualification    enable row level security;
alter table match                        enable row level security;
alter table match_worker                 enable row level security;
alter table engagement                   enable row level security;
alter table engagement_worker            enable row level security;
alter table notification                 enable row level security;
alter table audit_event                  enable row level security;

-- ---------------------------------------------------------------- global catalogue
-- 17.1: companies read, Maintain writes. Read-only for authenticated users.
create policy catalogue_read_industry   on industry               for select to authenticated using (true);
create policy catalogue_read_region     on region                 for select to authenticated using (true);
create policy catalogue_read_prof       on proficiency            for select to authenticated using (true);
create policy catalogue_read_trade      on trade_role             for select to authenticated using (true);
create policy catalogue_read_skill      on skill                  for select to authenticated using (true);
create policy catalogue_read_qual       on qualification          for select to authenticated using (true);
create policy catalogue_read_trprof     on trade_role_proficiency for select to authenticated using (true);
create policy catalogue_read_trqual     on trade_role_qualification for select to authenticated using (true);
create policy catalogue_read_holiday    on public_holiday         for select to authenticated using (true);

-- ---------------------------------------------------------------- rate bands (17.1)
-- No company ever reads the base table; suppliers read through a scoped projection
-- and buyers only ever receive fee-marked-up ranges computed server-side (5.5).
revoke all on rate_band from authenticated;

-- ---------------------------------------------------------------- company scope
create policy company_own_read on company
  for select to authenticated using (id = current_company_id());
create policy company_own_update on company
  for update to authenticated using (id = current_company_id());

create policy company_region_read on company_operating_region
  for select to authenticated using (company_id = current_company_id());
create policy company_region_write on company_operating_region
  for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

create policy company_user_read on company_user
  for select to authenticated using (company_id = current_company_id());

create policy company_document_read on company_document
  for select to authenticated using (company_id = current_company_id());
create policy company_document_write on company_document
  for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- ---------------------------------------------------------------- worker scope (via open employment)
-- 17.1: after a transfer the previous employer keeps its historical employment rows
-- and past engagements only — no live profile access.
create policy worker_read on worker
  for select to authenticated using (current_company_employs(id));
create policy worker_write on worker
  for all to authenticated
  using (current_company_employs(id))
  with check (current_company_employs(id));

create policy worker_travel_read on worker_travel_region
  for all to authenticated
  using (current_company_employs(worker_id))
  with check (current_company_employs(worker_id));

create policy worker_skill_rw on worker_skill
  for all to authenticated
  using (current_company_employs(worker_id))
  with check (current_company_employs(worker_id));

-- 7.1 qualification documents follow the worker, not the uploader.
create policy worker_qual_rw on worker_qualification
  for all to authenticated
  using (current_company_employs(worker_id))
  with check (current_company_employs(worker_id));

create policy worker_employment_read on worker_employment
  for select to authenticated using (company_id = current_company_id());

-- ---------------------------------------------------------------- supply scope
create policy capacity_listing_rw on capacity_listing
  for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

create policy capacity_line_rw on capacity_line
  for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

create policy capacity_line_travel_rw on capacity_line_travel_region
  for all to authenticated
  using (exists (select 1 from capacity_line l
                 where l.id = capacity_line_id and l.company_id = current_company_id()))
  with check (exists (select 1 from capacity_line l
                      where l.id = capacity_line_id and l.company_id = current_company_id()));

create policy capacity_line_worker_rw on capacity_line_worker
  for all to authenticated
  using (exists (select 1 from capacity_line l
                 where l.id = capacity_line_id and l.company_id = current_company_id()))
  with check (exists (select 1 from capacity_line l
                      where l.id = capacity_line_id and l.company_id = current_company_id()));

-- ---------------------------------------------------------------- demand scope
create policy demand_request_rw on demand_request
  for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

create policy demand_line_rw on demand_line
  for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

create policy demand_line_skill_rw on demand_line_skill
  for all to authenticated
  using (exists (select 1 from demand_line d
                 where d.id = demand_line_id and d.company_id = current_company_id()))
  with check (exists (select 1 from demand_line d
                      where d.id = demand_line_id and d.company_id = current_company_id()));

create policy demand_line_qual_rw on demand_line_qualification
  for all to authenticated
  using (exists (select 1 from demand_line d
                 where d.id = demand_line_id and d.company_id = current_company_id()))
  with check (exists (select 1 from demand_line d
                      where d.id = demand_line_id and d.company_id = current_company_id()));

-- ---------------------------------------------------------------- Maintain-only tables (17.1)
-- lead, platform_config, audit_event, notification carry no authenticated policy:
-- RLS denies by default and only the service role reaches them.
revoke all on lead            from authenticated;
revoke all on platform_config from authenticated;
revoke all on audit_event     from authenticated;
revoke all on notification    from authenticated;

-- ---------------------------------------------------------------- dual-party records (17.1)
-- Companies NEVER read these base tables. RLS is on with no authenticated policy,
-- and SELECT is revoked so the grant, not convention, carries the rule. Each party
-- reads the role-specific projection below instead.
revoke all on match             from authenticated;
revoke all on match_worker      from authenticated;
revoke all on engagement        from authenticated;
revoke all on engagement_worker from authenticated;
revoke all on worker_transfer   from authenticated;

-- The five projections below are DEFINER views (Postgres's default), deliberately:
-- they are owned by the migration role, so reading them bypasses the base tables'
-- deny-by-default RLS — which is exactly the mechanism 17.1 names ("companies never
-- read these base tables directly; each party reads a role-specific view"). Row scope
-- comes from current_company_id() in each WHERE clause, which resolves the CALLER's
-- JWT even inside a definer view. An invoker view would instead re-check the caller's
-- (revoked) base-table rights and return nothing — a review found exactly that bug.

-- Buyer projection: no supplier rate, no fee fields, no worker identities
-- pre-Confirmed, no supplier company name pre-Confirmed.
create view buyer_match_view
as
select
  m.id,
  m.demand_line_id,
  m.status,
  m.requested_quantity,
  m.engagement_start,
  m.engagement_end,
  m.hours_per_week,
  m.buyer_rate_cents,
  m.proposed_at,
  (select count(*) from match_worker mw where mw.match_id = m.id and not mw.knocked_out)
    as nominated_count
from match m
where m.buyer_company_id = current_company_id()
  and m.status <> 'Awaiting Supplier';   -- 12.4 the buyer sees it only after supplier acceptance

-- Supplier projection: no buyer rate, no fee fields, no buyer company name pre-Confirmed.
create view supplier_match_view
as
select
  m.id,
  m.capacity_line_id,
  m.status,
  m.requested_quantity,
  m.engagement_start,
  m.engagement_end,
  m.hours_per_week,
  m.supplier_rate_cents,
  m.proposed_at,
  m.qualification_override_by is not null as has_qualification_override
from match m
where m.supplier_company_id = current_company_id();

create view buyer_engagement_view
as
select
  e.id,
  e.demand_line_id,
  e.status,
  e.start_date,
  e.end_date,
  e.hours_per_week,
  e.buyer_rate_cents,
  e.expected_hours,
  e.estimated_buyer_value_cents,
  e.payment_status,
  -- identities revealed only at Confirmed and beyond (12.5)
  case when e.status <> 'Awaiting Commercial' then e.supplier_company_id end as supplier_company_id,
  e.actual_hours,
  e.completed_at
from engagement e
where e.buyer_company_id = current_company_id();

create view supplier_engagement_view
as
select
  e.id,
  e.capacity_line_id,
  e.status,
  e.start_date,
  e.end_date,
  e.hours_per_week,
  e.supplier_rate_cents,
  e.expected_hours,
  e.estimated_supplier_value_cents,
  e.payment_status,
  case when e.status <> 'Awaiting Commercial' then e.buyer_company_id end as buyer_company_id,
  e.actual_hours,
  e.completed_at
from engagement e
where e.supplier_company_id = current_company_id();

-- Transfers: each side sees its own requests; the collision response never
-- discloses the current employer (6.2), so from_company_id is withheld from
-- the requesting side until the transfer completes (8.2).
create view company_transfer_view
as
select
  t.id,
  t.worker_id,
  t.status,
  t.to_company_id,
  case
    when t.from_company_id = current_company_id() then t.from_company_id
    when t.status = 'Completed' then t.from_company_id
  end as from_company_id,
  t.created_at,
  t.decided_at,
  t.reason
from worker_transfer t
where t.to_company_id = current_company_id()
   or t.from_company_id = current_company_id();

grant select on buyer_match_view, supplier_match_view,
                buyer_engagement_view, supplier_engagement_view,
                company_transfer_view
  to authenticated;

-- Anonymous callers get nothing at all: the projections are for signed-in parties.
revoke all on buyer_match_view, supplier_match_view,
              buyer_engagement_view, supplier_engagement_view,
              company_transfer_view
  from anon;
