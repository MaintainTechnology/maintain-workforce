-- Maintain Workforce MVP — core schema
-- Spec: specs/maintain-workforce-mvp.md v0.7
-- Money is integer cents (20.1). Availability/engagement windows are DATE (20.5).

create extension if not exists btree_gist;

-- ---------------------------------------------------------------- module 4: catalogue
create table industry (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,          -- 4.3 never hard-deleted once referenced
  created_at timestamptz not null default now()
);

create table region (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table proficiency (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  rank int not null,                                -- 4.5 drives the 11.1 higher-proficiency toggle
  is_active boolean not null default true
);

create table trade_role (
  id uuid primary key default gen_random_uuid(),
  industry_id uuid not null references industry(id),
  name text not null,
  is_active boolean not null default true,
  unique (industry_id, name)
);

create table skill (
  id uuid primary key default gen_random_uuid(),
  trade_role_id uuid not null references trade_role(id),
  name text not null,
  is_active boolean not null default true,
  unique (trade_role_id, name)
);

create table qualification (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true
);

-- 4.2 valid proficiencies vary per trade
create table trade_role_proficiency (
  trade_role_id uuid not null references trade_role(id),
  proficiency_id uuid not null references proficiency(id),
  primary key (trade_role_id, proficiency_id)
);

-- 4.5 mandatory credentials are data, not code
create type credential_level as enum ('worker', 'company');

create table trade_role_qualification (
  trade_role_id uuid not null references trade_role(id),
  qualification_id uuid not null references qualification(id),
  is_mandatory boolean not null default false,
  level credential_level not null,
  primary key (trade_role_id, qualification_id, level)
);

-- 8.3 business-day arithmetic source (seeded data, no library dependency)
create table public_holiday (
  holiday_date date primary key,
  name text not null,
  region_id uuid references region(id)
);

-- ---------------------------------------------------------------- module 5: rate bands + config
create table rate_band (
  id uuid primary key default gen_random_uuid(),
  trade_role_id uuid not null references trade_role(id),
  proficiency_id uuid not null references proficiency(id),
  region_id uuid not null references region(id),
  band_low_cents bigint not null check (band_low_cents > 0),
  band_high_cents bigint not null check (band_high_cents >= band_low_cents),
  effective_from date not null,                     -- 5.1 history retained; no destructive edits
  created_at timestamptz not null default now(),
  unique (trade_role_id, proficiency_id, region_id, effective_from)
);

create table platform_config (
  key text primary key,
  value_int bigint,
  value_text text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------------------------------------------------------------- modules 1 + 3: companies
create type company_status as enum ('Pending', 'Active', 'Suspended', 'Closed');

create table company (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trading_name text,
  abn text not null unique,                         -- 1.2 unique across companies
  industry_id uuid references industry(id),
  contact_name text,
  contact_email text not null,
  contact_phone text,
  primary_region_id uuid references region(id),
  status company_status not null default 'Pending',
  created_at timestamptz not null default now()
);

create table company_operating_region (
  company_id uuid not null references company(id) on delete cascade,
  region_id uuid not null references region(id),
  primary key (company_id, region_id)
);

-- 2.2 a company_admin is bound to exactly one company
create table company_user (
  user_id text primary key,
  company_id uuid not null references company(id) on delete cascade,
  created_at timestamptz not null default now()
);

create type document_status as enum ('Current', 'Expiring Soon', 'Expired');

create table company_document (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  qualification_id uuid references qualification(id),
  doc_type text not null,                           -- includes lh_licence (22.1 statutory carve-out)
  number text,
  issuer text,
  issue_date date,
  expiry_date date,
  file_path text,                                   -- 1.7 private bucket; signed URLs only
  status document_status not null default 'Current',
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- module 0: leads
create type lead_status as enum ('New', 'Contacted', 'Qualified', 'Disqualified');
create type lead_intent as enum ('sell', 'buy', 'both');

create table lead (
  id uuid primary key default gen_random_uuid(),
  source text,
  intent lead_intent not null,
  contact_name text,
  business_name text,
  abn text,                                         -- 0.2 optional at capture; required to qualify
  phone text,
  email text,
  trade_interest text,
  notes text,
  funnel_score text,
  status lead_status not null default 'New',
  company_id uuid references company(id),           -- 0.3 linked on qualification
  disqualified_reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- modules 6 + 7: workers
create type worker_status as enum ('Active', 'Inactive', 'Suspended');

create table worker (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  mobile text not null unique,                      -- 6.2 unique platform-wide
  email text not null unique,
  base_region_id uuid references region(id),
  primary_trade_id uuid not null references trade_role(id),
  primary_proficiency_id uuid not null references proficiency(id),
  status worker_status not null default 'Active',   -- 6.5 account-level only; marketplace state derived
  proficiency_assigned_by text,                     -- 6.6 provenance
  proficiency_overridden_by_maintain boolean not null default false,
  proficiency_changed_at timestamptz,
  consent_confirmed_by text,                        -- 6.3 consent recorded with user + timestamp
  consent_confirmed_at timestamptz not null,
  user_id text,                                     -- 6.7 reserved for future worker login
  created_at timestamptz not null default now()
);

create table worker_travel_region (
  worker_id uuid not null references worker(id) on delete cascade,
  region_id uuid not null references region(id),
  primary key (worker_id, region_id)
);

create table worker_skill (
  worker_id uuid not null references worker(id) on delete cascade,
  skill_id uuid not null references skill(id),
  proficiency_id uuid references proficiency(id),   -- 6.7 nullable; unused by MVP UI
  primary key (worker_id, skill_id)
);

create table worker_qualification (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references worker(id) on delete cascade,
  qualification_id uuid not null references qualification(id),
  number text,
  issue_date date,
  expiry_date date,
  file_path text,                                   -- 7.1 worker-scoped; never re-parented on transfer
  status document_status not null default 'Current',
  created_at timestamptz not null default now()
);

create table worker_employment (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references worker(id) on delete cascade,
  company_id uuid not null references company(id),
  start_date date not null,
  end_date date,                                    -- 6.4 null end date = current employer
  end_reason text,
  created_at timestamptz not null default now()
);

-- 6.4 at most one open employment row per worker (DB-enforced)
create unique index worker_employment_one_open
  on worker_employment (worker_id) where end_date is null;

create type transfer_status as enum (
  'Requested', 'Awaiting Current Employer', 'Approved',
  'Declined', 'Withdrawn', 'Admin Review', 'Completed'
);

create table worker_transfer (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references worker(id),
  from_company_id uuid references company(id),      -- null when the worker has no employer (8.3)
  to_company_id uuid not null references company(id),
  status transfer_status not null default 'Requested',
  requested_by text,
  decided_by text,
  decided_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- module 9: sell capacity
create type capacity_line_status as enum (
  'Open', 'Partially Committed', 'Fully Committed', 'Withdrawn', 'Expired'
);

create table capacity_listing (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  created_by text,
  admin_entered boolean not null default false,     -- 16.1 concierge flag
  evidence_note text,
  created_at timestamptz not null default now()
);

create table capacity_line (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references capacity_listing(id) on delete cascade,
  company_id uuid not null references company(id),
  trade_role_id uuid not null references trade_role(id),
  proficiency_id uuid not null references proficiency(id),
  available_from date not null,
  available_until date not null,
  available_days text,                              -- 9.1 informational in MVP
  hours_per_week numeric(5,2) not null check (hours_per_week > 0),
  location_region_id uuid not null references region(id),
  supplier_rate_cents bigint not null check (supplier_rate_cents > 0),
  rate_entered_by text,                             -- 9.7 rate provenance
  rate_entered_by_admin boolean not null default false,
  rate_ratified_at timestamptz,                     -- 9.7 ratified by supplier match acceptance
  status capacity_line_status not null default 'Open',
  created_at timestamptz not null default now(),
  check (available_until >= available_from)
);

create table capacity_line_travel_region (
  capacity_line_id uuid not null references capacity_line(id) on delete cascade,
  region_id uuid not null references region(id),
  primary key (capacity_line_id, region_id)
);

create table capacity_line_worker (
  capacity_line_id uuid not null references capacity_line(id) on delete cascade,
  worker_id uuid not null references worker(id),
  primary key (capacity_line_id, worker_id)
);

-- ---------------------------------------------------------------- module 10: buy capacity
create type demand_line_status as enum (
  'Open', 'Partially Filled', 'Filled', 'Withdrawn', 'Expired'
);

create table demand_request (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  name text not null,
  industry_id uuid references industry(id),
  work_region_id uuid not null references region(id),
  description text,
  created_by text,
  admin_entered boolean not null default false,
  evidence_note text,
  created_at timestamptz not null default now()
);

create table demand_line (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references demand_request(id) on delete cascade,
  company_id uuid not null references company(id),
  trade_role_id uuid not null references trade_role(id),
  proficiency_id uuid not null references proficiency(id),
  quantity int not null check (quantity > 0),
  start_date date not null,
  end_date date not null,
  hours_per_week numeric(5,2) not null check (hours_per_week > 0),  -- 10.1 canonical
  notes text,
  status demand_line_status not null default 'Open',
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table demand_line_skill (
  demand_line_id uuid not null references demand_line(id) on delete cascade,
  skill_id uuid not null references skill(id),
  primary key (demand_line_id, skill_id)
);

create table demand_line_qualification (
  demand_line_id uuid not null references demand_line(id) on delete cascade,
  qualification_id uuid not null references qualification(id),
  primary key (demand_line_id, qualification_id)
);

-- ---------------------------------------------------------------- modules 11 + 12: matching
create type match_status as enum (
  'Awaiting Supplier', 'Awaiting Buyer', 'Accepted', 'Declined', 'Withdrawn', 'Expired'
);

create table match (
  id uuid primary key default gen_random_uuid(),
  demand_line_id uuid not null references demand_line(id),
  supplier_company_id uuid not null references company(id),
  buyer_company_id uuid not null references company(id),
  capacity_line_id uuid not null references capacity_line(id),   -- 11.3 exactly one capacity line
  requested_quantity int not null check (requested_quantity > 0),
  -- 11.3 proposal-time snapshot; 13.1 copies these and never re-reads.
  -- Trade, proficiency and work region are snapshotted too: 13.1 names them among
  -- the commercial identity fields, so a later catalogue or demand-line edit must
  -- never change what the parties agreed to.
  trade_role_id uuid not null references trade_role(id),
  proficiency_id uuid not null references proficiency(id),
  work_region_id uuid not null references region(id),
  engagement_start date not null,
  engagement_end date not null,
  hours_per_week numeric(5,2) not null,
  supplier_rate_cents bigint not null,
  fee_bp int not null,
  buyer_rate_cents bigint not null,
  status match_status not null default 'Awaiting Supplier',
  qualification_override_by text,                   -- 7.3 audited override carried on the match
  qualification_override_at timestamptz,
  proposed_at timestamptz not null default now(),
  supplier_decided_at timestamptz,
  buyer_decided_at timestamptz,
  declined_by text,
  decline_reason text,
  admin_entered boolean not null default false,     -- 16.1 recorded phoned-in decision
  evidence_note text,
  check (engagement_end >= engagement_start)
);

create table match_worker (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references match(id) on delete cascade,
  worker_id uuid not null references worker(id),
  knocked_out boolean not null default false,       -- 12.7 nomination knockout
  knocked_out_reason text,
  knocked_out_at timestamptz,
  unique (match_id, worker_id)
);

-- ---------------------------------------------------------------- module 13: engagements
create type engagement_status as enum (
  'Awaiting Commercial', 'Confirmed', 'Active', 'Completed', 'Cancelled', 'Disputed'
);
create type payment_status as enum ('none', 'pre-authorised', 'released', 'disputed');

create table engagement (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references match(id),
  demand_line_id uuid not null references demand_line(id),
  capacity_line_id uuid not null references capacity_line(id),
  buyer_company_id uuid not null references company(id),
  supplier_company_id uuid not null references company(id),
  trade_role_id uuid not null references trade_role(id),
  proficiency_id uuid not null references proficiency(id),
  work_region_id uuid not null references region(id),
  start_date date not null,
  end_date date not null,
  hours_per_week numeric(5,2) not null,
  -- 13.1 copied from the match's proposal-time snapshot
  supplier_rate_cents bigint not null,
  fee_bp int not null,
  fee_cents_per_hour bigint not null,
  buyer_rate_cents bigint not null,
  -- 13.1 computed once at engagement creation per 20.3, then frozen
  expected_hours numeric(10,2) not null,
  estimated_supplier_value_cents bigint not null,
  estimated_maintain_revenue_cents bigint not null,
  estimated_buyer_value_cents bigint not null,
  status engagement_status not null default 'Awaiting Commercial',
  payment_status payment_status not null default 'none',  -- 13.4 recorded, never processed
  external_payment_ref text,
  -- 13.3 outcome fields
  actual_hours numeric(10,2),
  actual_value_cents bigint,
  completed_at timestamptz,
  dispute_notes text,
  cancelled_by text,
  cancel_reason text,
  within_notice_window boolean,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- 13.6 double-booking impossible by construction.
-- Exclusion constraints are single-table, so the engagement's status and window are
-- denormalised here and kept in sync inside the same transaction as any change.
create table engagement_worker (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagement(id) on delete cascade,
  worker_id uuid not null references worker(id),
  status engagement_status not null,
  committed_window daterange not null,
  unique (engagement_id, worker_id),
  constraint engagement_worker_no_double_booking
    exclude using gist (worker_id with =, committed_window with &&)
    where (status in ('Awaiting Commercial', 'Confirmed', 'Active'))
);

-- ---------------------------------------------------------------- modules 15 + 18
create table notification (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,                            -- 15.2 exhaustive catalogue key
  recipient_email text not null,
  recipient_company_id uuid references company(id),
  entity_type text,
  entity_id uuid,
  sent_at timestamptz,
  failed_at timestamptz,                            -- 15.1 failures visible and re-sendable
  failure_reason text,
  created_at timestamptz not null default now()
);

create table audit_event (
  id bigserial primary key,
  actor_user_id text,                               -- 18.1 null only for the reserved system actor
  actor_is_system boolean not null default false,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexes for the 11.1 candidate query
create index capacity_line_window_idx
  on capacity_line using gist (daterange(available_from, available_until, '[]'));
create index capacity_line_status_idx on capacity_line (status, trade_role_id, proficiency_id);
create index demand_line_status_idx on demand_line (status, trade_role_id, proficiency_id);
create index engagement_worker_worker_idx on engagement_worker (worker_id);
create index match_status_idx on match (status, demand_line_id);
create index worker_employment_company_idx
  on worker_employment (company_id) where end_date is null;
create index audit_event_entity_idx on audit_event (entity_type, entity_id);
create index notification_trigger_idx on notification (trigger, created_at);
