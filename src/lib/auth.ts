// src/lib/auth.ts — Session management via signed cookies (JWT-lite)
// Uses a simple signed session stored in KV with a random session token.
// For production, wire up Cloudflare Access JWT validation.

import { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SessionData, Env } from '../types';
import { getUserRoles, getUserDirectorates } from './db';

const SESSION_TTL = 60 * 60 * 8; // 8 hours

export async function createSession(
  c: Context<{ Bindings: Env }>,
  userId: number,
  email: string,
  isGodAdmin: boolean
): Promise<string> {
  const token = crypto.randomUUID();

  const roles = await getUserRoles(c.env.DB, userId);
  const directorateIds = await getUserDirectorates(c.env.DB, userId);

  const session: SessionData = { userId, email, isGodAdmin, roles, directorateIds };

  await c.env.KV.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });

  setCookie(c, 'kbi_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: SESSION_TTL,
    path: '/',
  });

  // Update last_login
  await c.env.DB.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`)
    .bind(userId)
    .run();

  return token;
}

export async function getSession(
  c: Context<{ Bindings: Env }>
): Promise<SessionData | null> {
  const token = getCookie(c, 'kbi_session');
  if (!token) return null;

  const raw = await c.env.KV.get(`session:${token}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function destroySession(c: Context<{ Bindings: Env }>): Promise<void> {
  const token = getCookie(c, 'kbi_session');
  if (token) {
    await c.env.KV.delete(`session:${token}`);
    deleteCookie(c, 'kbi_session', { path: '/' });
  }
}

export async function requireAuth(
  c: Context<{ Bindings: Env }>
): Promise<SessionData | Response> {
  const session = await getSession(c);
  if (!session) {
    return c.json({ error: 'Unauthorized', redirect: '/login' }, 401);
  }
  return session;
}

export async function requireGodAdmin(
  c: Context<{ Bindings: Env }>
): Promise<SessionData | Response> {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  if (!session.isGodAdmin && !session.roles.includes('god_admin')) {
    return c.json({ error: 'Forbidden — God Admin access required' }, 403);
  }
  return session;
}

export async function requireRole(
  c: Context<{ Bindings: Env }>,
  role: string
): Promise<SessionData | Response> {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  if (!session.isGodAdmin && !session.roles.includes(role) && !session.roles.includes('god_admin')) {
    return c.json({ error: `Forbidden — ${role} access required` }, 403);
  }
  return session;
}
