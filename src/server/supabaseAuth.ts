import { createClient } from '@supabase/supabase-js';
import type { Request, Response } from 'express';
import { authorizeRequest } from './authorizeRequest.ts';
import type { PermissionAction, User } from '../types/domain.ts';

function serverSupabaseEnv(): { url: string; publishableKey: string } {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const publishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();
  return { url, publishableKey };
}

export function isServerSupabaseConfigured(): boolean {
  const { url, publishableKey } = serverSupabaseEnv();
  return Boolean(url && publishableKey);
}

export async function requireApiUser(
  req: Request,
  res: Response,
  permission?: PermissionAction | PermissionAction[]
): Promise<User | null> {
  const { url, publishableKey } = serverSupabaseEnv();
  const requiredAnyOf = Array.isArray(permission) ? permission : undefined;
  const requiredAction = Array.isArray(permission) ? undefined : permission;
  const claimedRoleId = typeof req.body?.roleId === 'string' ? req.body.roleId : undefined;

  const result = await authorizeRequest({
    authConfigured: Boolean(url && publishableKey),
    authorizationHeader: req.header('authorization') ?? undefined,
    requiredAction,
    requiredAnyOf,
    claimedRoleId,
    verifyAccessToken: async (token) => {
      const client = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user?.id) return null;
      return { authUserId: data.user.id };
    },
    loadAssignedRole: async (authUserId, accessToken) => {
      const client = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data, error } = await client
        .from('user_roles')
        .select('role_id')
        .eq('user_id', authUserId)
        .maybeSingle();
      if (error || typeof data?.role_id !== 'string') return null;
      return data.role_id;
    },
  });

  if (!result.ok) {
    res.status(result.status).json({
      ok: false,
      errorCode: result.errorCode,
      userMessage: result.userMessage,
    });
    return null;
  }

  return result.user;
}
