import type { Express, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import prisma from '../prisma.js';
import { logger, style } from '../logger.js';
import { getSupabaseUserFromAccessToken } from '../utils/supabaseAdmin.js';
import { getSupabaseUserIdFromRequest } from '../utils/supabase.js';

const log = logger.child('stream.shouts');

const shoutPostLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'rate_limited' },
});

const shoutFeedLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'rate_limited' },
});

const SHOUT_LIFESPAN_SECONDS = 5 * 60;
const MESSAGE_SCHEMA = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length >= 5, { message: 'message_too_short' })
  .refine((value) => value.length <= 280, { message: 'message_too_long' });

const ALIAS_SCHEMA = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length >= 2, { message: 'alias_too_short' })
  .refine((value) => value.length <= 32, { message: 'alias_too_long' });

const SHOUT_INPUT_SCHEMA = z.object({
  message: MESSAGE_SCHEMA,
  alias: ALIAS_SCHEMA.optional(),
});

const FEED_LIMIT_DEFAULT = 20;
const FEED_LIMIT_MAX = 50;

type SupabaseUser = Awaited<ReturnType<typeof getSupabaseUserFromAccessToken>>;

function extractBearerToken(req: Request): string | null {
  const rawAuth = req.headers['authorization'] || req.headers['Authorization'];
  if (!rawAuth) return null;
  const header = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  if (typeof header !== 'string') return null;
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function deriveAlias(
  providedAlias: string | undefined,
  supabaseUser: SupabaseUser | null,
  walletPublicKey: string | null,
): string | null {
  if (providedAlias && providedAlias.trim().length) {
    return providedAlias.trim();
  }

  const displayName = (() => {
    const meta = (supabaseUser?.user_metadata ?? {}) as Record<string, unknown>;
    const candidate = meta?.displayName ?? meta?.display_name ?? meta?.username;
    if (typeof candidate === 'string' && candidate.trim().length >= 2) {
      return candidate.trim().slice(0, 32);
    }
    return null;
  })();
  if (displayName) {
    return displayName;
  }

  if (walletPublicKey && walletPublicKey.length > 8) {
    return `${walletPublicKey.slice(0, 4)}…${walletPublicKey.slice(-4)}`;
  }

  if (supabaseUser?.email) {
    const local = supabaseUser.email.split('@')[0] || '';
    if (local.length >= 2) {
      return `${local.slice(0, 6)}…`;
    }
  }

  return null;
}

async function findPrimaryWalletPublicKey(supabaseUserId: string): Promise<string | null> {
  const record = await prisma.managed_wallets.findFirst({
    where: {
      assigned_supabase_user_id: supabaseUserId,
      status: 'assigned',
    },
    orderBy: { assigned_at: 'asc' },
    select: { public_key: true },
  });

  return record?.public_key ?? null;
}

export function registerStreamShoutRoutes(app: Express) {
  app.post('/stream/shout', shoutPostLimiter, async (req: Request, res: Response) => {
    try {
      const bearerToken = extractBearerToken(req);
      if (!bearerToken) {
        return res.status(401).json({ ok: false, error: 'authentication_required' });
      }

      const supabaseUserId = await getSupabaseUserIdFromRequest(req);
      if (!supabaseUserId) {
        return res.status(401).json({ ok: false, error: 'authentication_required' });
      }

      let supabaseUser: SupabaseUser | null = null;
      try {
        supabaseUser = await getSupabaseUserFromAccessToken(bearerToken);
      } catch (error: any) {
        log.warn(
          `${style.status('auth', 'warn')} ${style.kv('event', 'supabase_lookup_failed')} ${style.kv('reason', error?.message || error)}`,
        );
        return res.status(401).json({ ok: false, error: 'authentication_required' });
      }

      if (!supabaseUser?.id || supabaseUser.id !== supabaseUserId) {
        return res.status(401).json({ ok: false, error: 'authentication_required' });
      }

      const parsed = SHOUT_INPUT_SCHEMA.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_arguments',
          details: parsed.error.issues.map((issue) => issue.message),
        });
      }

      const walletPublicKey = await findPrimaryWalletPublicKey(supabaseUserId);
      const message = parsed.data.message;
      const alias = deriveAlias(parsed.data.alias, supabaseUser, walletPublicKey);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SHOUT_LIFESPAN_SECONDS * 1000);

      const existing = await prisma.$queryRaw<{ id: string; expires_at: Date }[]>(
        Prisma.sql`
          select id, expires_at
          from stream_shouts
          where user_id = ${supabaseUserId}
            and status in ('pending', 'approved')
            and expires_at > now()
          order by expires_at desc
          limit 1
        `,
      );

      if (existing.length) {
        const remainingSeconds = Math.max(
          1,
          Math.ceil((existing[0].expires_at.getTime() - now.getTime()) / 1000),
        );
        return res.status(409).json({
          ok: false,
          error: 'shout_exists',
          retry_after: remainingSeconds,
        });
      }

      const inserted = await prisma.$queryRaw<
        {
          id: string;
          alias: string | null;
          message: string;
          status: string;
          created_at: Date;
          expires_at: Date;
        }[]
      >(
        Prisma.sql`
          insert into stream_shouts (user_id, wallet_pubkey, alias, message, status, expires_at)
          values (${supabaseUserId}, ${walletPublicKey}, ${alias}, ${message}, 'pending', ${expiresAt})
          returning id, alias, message, status, created_at, expires_at
        `,
      );

      const payload = inserted[0];
      log.info(
        `${style.status('shout', 'info')} ${style.kv('event', 'created')} ${style.kv('user', supabaseUserId)} ${style.kv('shout', payload?.id || '∅')}`,
      );

      return res.status(201).json({
        ok: true,
        shout: {
          id: payload.id,
          alias: payload.alias,
          message: payload.message,
          status: payload.status,
          created_at: payload.created_at.toISOString(),
          expires_at: payload.expires_at.toISOString(),
        },
      });
    } catch (error: any) {
      log.error(
        `${style.status('shout', 'error')} ${style.kv('event', 'create_failed')} ${style.kv('error', error?.message || error)}`,
        error,
      );
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.get('/stream/shout-feed', shoutFeedLimiter, async (req: Request, res: Response) => {
    try {
      const limitParam = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
      const limit = Number.isFinite(limitParam)
        ? Math.max(1, Math.min(FEED_LIMIT_MAX, limitParam as number))
        : FEED_LIMIT_DEFAULT;

      const rows = await prisma.$queryRaw<
        {
          id: string;
          alias: string | null;
          message: string;
          status: string;
          created_at: Date;
          expires_at: Date;
        }[]
      >(
        Prisma.sql`
          select id, alias, message, status, created_at, expires_at
          from stream_shouts
          where status in ('pending', 'approved')
            and expires_at > now()
          order by created_at desc
          limit ${limit}
        `,
      );

      const shouts = rows.map((row) => ({
        id: row.id,
        alias: row.alias,
        message: row.message,
        status: row.status,
        created_at: row.created_at.toISOString(),
        expires_at: row.expires_at.toISOString(),
      }));

      return res.json({ ok: true, shouts });
    } catch (error: any) {
      log.error(
        `${style.status('shout', 'error')} ${style.kv('event', 'feed_failed')} ${style.kv('error', error?.message || error)}`,
        error,
      );
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
}
