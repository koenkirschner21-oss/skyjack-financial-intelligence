/**
 * Idempotent admin setup for the three fictional demonstration accounts.
 *
 * Required environment (never commit these values):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DEMO_ACCOUNT_PASSWORD
 *
 * Also apply supabase/migrations/20261118000000_auth_role_foundation.sql and
 * supabase/migrations/20261118010000_grant_service_role_user_roles.sql first,
 * and disable public sign-up in the Supabase dashboard.
 *
 * Run: npx tsx scripts/provision-demo-users.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { DEMO_AUTH_ACCOUNTS } from '../src/domain/demoAuthAccounts.ts';

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const password = process.env.DEMO_ACCOUNT_PASSWORD;

  if (!url || !serviceRoleKey || !password) {
    console.error(
      'Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or DEMO_ACCOUNT_PASSWORD. No accounts were created.'
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function findUserId(email: string): Promise<string | undefined> {
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        console.error(`Could not list users: ${error.message}`);
        process.exit(1);
      }
      const existing = data.users.find((user) => user.email?.toLowerCase() === email);
      if (existing) return existing.id;
      if (data.users.length < 200) return undefined;
    }
    return undefined;
  }

  for (const account of DEMO_AUTH_ACCOUNTS) {
    const existingId = await findUserId(account.email);
    let userId = existingId;

    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: account.displayName,
          job_title: account.jobTitle,
        },
      });
      if (error || !data.user) {
        console.error(`Could not create ${account.email}: ${error?.message ?? 'unknown error'}`);
        process.exit(1);
      }
      userId = data.user.id;
      console.log(`Created ${account.email}`);
    } else {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          display_name: account.displayName,
          job_title: account.jobTitle,
        },
      });
      if (error) {
        console.error(`Could not update ${account.email}: ${error.message}`);
        process.exit(1);
      }
      console.log(`Updated ${account.email}`);
    }

    const { error: roleError } = await admin.from('user_roles').upsert(
      {
        user_id: userId,
        role_id: account.roleId,
        display_name: account.displayName,
        job_title: account.jobTitle,
        department: account.department,
      },
      { onConflict: 'user_id' }
    );
    if (roleError) {
      console.error(`Could not assign role for ${account.email}: ${roleError.message}`);
      process.exit(1);
    }
  }

  console.log('Three demonstration accounts are provisioned. Public sign-up must remain disabled in the Supabase dashboard.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Provisioning failed.');
  process.exit(1);
});
