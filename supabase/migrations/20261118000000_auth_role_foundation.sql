-- Authentication and role-mapping foundation only.
-- Does not store case figures, uploads, investigations, approvals, or audit events.
-- Apply in the Supabase SQL editor or with the Supabase CLI against the
-- skyjack-financial-intelligence project. This file is not applied automatically.
--
-- Public email sign-up must stay disabled in the Supabase dashboard:
-- Authentication → Sign In / Providers → Email → disable "Allow new users to sign up".
-- Demo accounts are created only by scripts/provision-demo-users.ts.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role_id text not null check (
    role_id in (
      'controller',
      'cost_accountant',
      'trade_coordinator',
      'operational_contributor'
    )
  ),
  display_name text not null,
  job_title text not null,
  department text not null,
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

revoke all on table public.user_roles from anon, authenticated;

grant select on table public.user_roles to authenticated;

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own
  on public.user_roles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No INSERT, UPDATE, or DELETE policy is created for anon or authenticated.
-- Authenticated users cannot assign or change their own role.
-- The service role bypasses RLS and is used only by the provisioning script.
