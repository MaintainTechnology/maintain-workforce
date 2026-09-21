# maintain-workforce
Maintain Workforce Repository

For worker-save failures and Clerk staff approval setup, see the
[worker and account recovery guide](seed-data/WORKFORCE-RECOVERY-2026-09-21.md).
Run `npm run check:database-readiness` with the intended server environment to
check the required database functions without writing data.

Grant staff approval access using Clerk's backend-controlled public metadata:
`{ "isAdmin": true }`. Existing `role: "maintain_admin"` grants remain compatible
when `isAdmin` is absent. Set `isAdmin: false` to revoke access even if a legacy
admin role remains; strings such as `"true"` do not grant access.
Signed-in staff can open `/admin/verification`; staff who already have MFA enabled
must verify their second factor. Staff without MFA enrollment can use the approval
panel on the current Clerk plan. Company activation still requires the admin's
document review and approval in the application.
