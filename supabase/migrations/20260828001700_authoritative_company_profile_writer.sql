-- All company-profile mutations now pass through update_company_profile_atomic,
-- which owns validation, stale-write protection and the audit event. Remove the
-- older direct authenticated write path while preserving tenant-scoped reads.

begin;

-- A table-level revoke does not remove grants made for individual columns, so
-- revoke both forms explicitly. company_own_read remains the SELECT authority.
revoke update on table company from authenticated;
revoke update (
  legal_name,
  trading_name,
  abn,
  industry_id,
  contact_name,
  contact_email,
  contact_phone,
  primary_region_id
) on table company from authenticated;

drop policy if exists company_own_update on company;

-- The atomic writer replaces the full operating-region set in the same
-- transaction as the company row and audit event. company_region_read remains.
revoke insert, update, delete on table company_operating_region from authenticated;
drop policy if exists company_region_write on company_operating_region;

commit;
