// src/lib/db.ts — Database helper utilities

import { Env, SessionData } from '../types';

export async function logAudit(
  db: D1Database,
  actorId: number | undefined,
  action: string,
  targetType?: string,
  targetId?: number,
  metadata?: object,
  ip?: string
) {
  await db
    .prepare(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      actorId ?? null,
      action,
      targetType ?? null,
      targetId ?? null,
      metadata ? JSON.stringify(metadata) : null,
      ip ?? null
    )
    .run();
}

export async function getUserRoles(db: D1Database, userId: number): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT r.name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?`
    )
    .bind(userId)
    .all<{ name: string }>();
  return rows.results.map((r) => r.name);
}

export async function getUserDirectorates(db: D1Database, userId: number): Promise<number[]> {
  const rows = await db
    .prepare(
      `SELECT directorate_id FROM user_directorates WHERE user_id = ?`
    )
    .bind(userId)
    .all<{ directorate_id: number }>();
  return rows.results.map((r) => r.directorate_id);
}

export async function getUserById(db: D1Database, userId: number) {
  return db
    .prepare(`SELECT * FROM users WHERE id = ?`)
    .bind(userId)
    .first();
}

export async function canUserAccess(
  session: SessionData,
  requiredRole?: string,
  directorateId?: number
): Promise<boolean> {
  if (session.isGodAdmin) return true;
  if (requiredRole && session.roles.includes(requiredRole)) return true;
  if (directorateId && session.directorateIds.includes(directorateId)) return true;
  return false;
}
