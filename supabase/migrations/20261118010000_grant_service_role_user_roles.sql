-- The manually applied role foundation did not grant table privileges to service_role.
-- service_role bypasses row level security, but PostgreSQL still requires this grant
-- before the provisioning script can assign roles. This statement is idempotent.
-- Do not reapply 20261118000000_auth_role_foundation.sql.

grant select, insert, update, delete on table public.user_roles to service_role;
