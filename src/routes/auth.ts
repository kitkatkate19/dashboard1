// src/routes/auth.ts — Google OAuth + session management

import { Hono } from 'hono';
import { Env } from '../types';
import { createSession, destroySession, getSession } from '../lib/auth';
import { logAudit } from '../lib/db';

const auth = new Hono<{ Bindings: Env }>();

// ── GET /api/auth/me ─────────────────────────────
auth.get('/me', async (c) => {
  const token = c.req.header('cookie')?.match(/kbi_session=([^;]+)/)?.[1];
  if (!token) return c.json({ authenticated: false, user: null });

  const raw = await c.env.KV.get(`session:${token}`);
  if (!raw) return c.json({ authenticated: false, user: null });

  const session = JSON.parse(raw);
  const user = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.avatar_url, u.status, u.is_god_admin,
            p.preferred_name, p.kbi_title, p.location, p.profile_photo_key
     FROM users u
     LEFT JOIN people_profiles p ON p.user_id = u.id
     WHERE u.id = ?`
  ).bind(session.userId).first();

  return c.json({ authenticated: true, user, session });
});

// ── POST /api/auth/google/callback ───────────────
// Called after Cloudflare Access validates Google SSO.
// Receives the verified identity from the CF-Access-JWT-Assertion header.
auth.post('/google/callback', async (c) => {
  const body = await c.req.json<{ email: string; google_subject: string; display_name?: string; avatar_url?: string }>();
  const { email, google_subject, display_name, avatar_url } = body;

  if (!email || !google_subject) {
    return c.json({ error: 'Missing identity fields' }, 400);
  }

  // Only allow @kb.institute emails
  if (!email.endsWith('@kb.institute')) {
    return c.json({ error: 'Access restricted to @kb.institute accounts' }, 403);
  }

  // Upsert user
  let user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE google_subject = ? OR email = ?`
  ).bind(google_subject, email).first<any>();

  if (!user) {
    // New user — create in pending state
    const result = await c.env.DB.prepare(
      `INSERT INTO users (email, google_subject, display_name, avatar_url, status)
       VALUES (?, ?, ?, ?, 'pending')`
    ).bind(email, google_subject, display_name ?? null, avatar_url ?? null).run();

    const newId = result.meta.last_row_id as number;

    // Create blank profile
    await c.env.DB.prepare(
      `INSERT INTO people_profiles (user_id) VALUES (?)`
    ).bind(newId).run();

    // Assign new_joiner role by default
    const newJoinerRole = await c.env.DB.prepare(
      `SELECT id FROM roles WHERE name = 'new_joiner'`
    ).first<{ id: number }>();
    if (newJoinerRole) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`
      ).bind(newId, newJoinerRole.id).run();
    }

    await logAudit(c.env.DB, newId, 'user.registered', 'user', newId, { email });

    user = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(newId).first<any>();
  } else {
    // Update identity fields
    await c.env.DB.prepare(
      `UPDATE users SET google_subject = ?, display_name = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(google_subject, display_name ?? user.display_name, avatar_url ?? user.avatar_url, user.id).run();
  }

  if (user.status === 'suspended' || user.status === 'rejected') {
    return c.json({ error: 'Account suspended or rejected. Contact an administrator.' }, 403);
  }

  await createSession(c, user.id, user.email, !!user.is_god_admin);

  return c.json({
    success: true,
    status: user.status,
    message: user.status === 'pending' ? 'Account pending admin approval.' : 'Login successful.',
  });
});

// ── POST /api/auth/dev-login ─────────────────────
// DEVELOPMENT ONLY — direct login by email
auth.post('/dev-login', async (c) => {
  const body = await c.req.json<{ email: string }>();
  const user = await c.env.DB.prepare(
    `SELECT * FROM users WHERE email = ?`
  ).bind(body.email).first<any>();

  if (!user) return c.json({ error: 'User not found' }, 404);

  await createSession(c, user.id, user.email, !!user.is_god_admin);
  return c.json({ success: true, userId: user.id });
});

// ── POST /api/auth/logout ────────────────────────
auth.post('/logout', async (c) => {
  const session = await getSession(c);
  await destroySession(c);
  if (session) await logAudit(c.env.DB, session.userId, 'user.logout');
  return c.json({ success: true });
});

export default auth;
