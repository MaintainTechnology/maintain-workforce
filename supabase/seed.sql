-- Maintain Workforce — seed. Spec 23.1: idempotent and re-runnable.
--
-- STRUCTURE AND CONFIG ONLY. The catalogue content itself — industries, trades,
-- skills, qualifications and the rate bands — is founder-supplied (Open Questions 2
-- and 3) and loaded from their spreadsheet through the admin screens or a one-off
-- import. Nothing here hardcodes a trade name, because 23.2 requires the schema and
-- the seed to stay trade-agnostic: the beachhead decision must change data, never code.

-- ---------------------------------------------------------------- regions (4.4)
-- MVP ships with one region; the table exists so more are added as data.
insert into region (name) values ('Brisbane / South East Queensland')
on conflict (name) do nothing;

-- ---------------------------------------------------------------- proficiency ladder (4.5)
-- The rank drives the 11.1 "include higher proficiency" toggle. Which trades support
-- Apprentice is a per-trade decision expressed in trade_role_proficiency (4.2), so the
-- ladder is defined once here and mapped per trade when the catalogue is loaded.
insert into proficiency (name, rank) values
  ('Apprentice', 1),
  ('Junior', 2),
  ('Mid', 3),
  ('Senior', 4)
on conflict (name) do nothing;

-- ---------------------------------------------------------------- platform config (5.3, 5.6)
-- Every one of these is a placeholder pending a founder decision, and every one is
-- editable by a Maintain admin without a deployment. Existing engagements hold their
-- own snapshots (13.1), so changing a value here never rewrites history.
insert into platform_config (key, value_int) values
  ('fee_bp', 1500),                 -- 15%, Open Question 1
  ('minimum_hours_per_line', 8),    -- Open Question 5
  ('minimum_crew_size', 1)          -- founders may raise to 2
on conflict (key) do nothing;

-- ---------------------------------------------------------------- Queensland public holidays (8.3)
-- The transfer escalation counts business days as Monday–Friday excluding Queensland
-- public holidays. No date library carries this data, so it is seeded and maintained
-- as rows. Extend each year before January.
insert into public_holiday (holiday_date, name) values
  ('2026-01-01', 'New Year''s Day'),
  ('2026-01-26', 'Australia Day'),
  ('2026-04-03', 'Good Friday'),
  ('2026-04-04', 'Easter Saturday'),
  ('2026-04-05', 'Easter Sunday'),
  ('2026-04-06', 'Easter Monday'),
  ('2026-04-25', 'Anzac Day'),
  ('2026-05-04', 'Labour Day'),
  ('2026-10-05', 'King''s Birthday'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-26', 'Boxing Day'),
  ('2026-12-28', 'Boxing Day (observed)'),
  ('2027-01-01', 'New Year''s Day'),
  ('2027-01-26', 'Australia Day'),
  ('2027-03-26', 'Good Friday'),
  ('2027-03-27', 'Easter Saturday'),
  ('2027-03-28', 'Easter Sunday'),
  ('2027-03-29', 'Easter Monday'),
  ('2027-04-26', 'Anzac Day (observed)'),
  ('2027-05-03', 'Labour Day'),
  ('2027-10-04', 'King''s Birthday'),
  ('2027-12-25', 'Christmas Day'),
  ('2027-12-27', 'Christmas Day (observed)'),
  ('2027-12-28', 'Boxing Day (observed)')
on conflict (holiday_date) do nothing;

-- ----------------------------------------------------------------
-- Launch precondition, not seeded here (23.3): real verified SEQ supply is loaded
-- before any external user sees the platform, through the normal verification flow
-- so every company on the board has passed the same gate.
