// src/types/index.ts — Shared types for the KBI Platform

export type UserStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type RoleScope  = 'platform' | 'directorate' | 'team';
export type ApprovalSource = 'auto' | 'manual' | 'google_sync';

export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  KV: KVNamespace;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  JWT_SECRET?: string;
  PLATFORM_DOMAIN?: string;
}

export interface User {
  id: number;
  email: string;
  google_subject?: string;
  display_name?: string;
  avatar_url?: string;
  status: UserStatus;
  is_god_admin: number;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PeopleProfile {
  id: number;
  user_id: number;
  preferred_name?: string;
  kbi_title?: string;
  department?: string;
  location?: string;
  bio?: string;
  phone?: string;
  linkedin_url?: string;
  timezone?: string;
  start_date?: string;
  manager_user_id?: number;
  education?: string;
  experience?: string;
  skills?: string;
  pronouns?: string;
  is_profile_public: number;
  profile_photo_key?: string;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: number;
  name: string;
  label: string;
  description?: string;
  scope: RoleScope;
}

export interface Directorate {
  id: number;
  code: string;
  name: string;
  description?: string;
  color?: string;
  is_active: number;
}

export interface Team {
  id: number;
  name: string;
  directorate_id?: number;
  lead_user_id?: number;
  description?: string;
  is_active: number;
}

export interface Event {
  id: number;
  title: string;
  description?: string;
  location?: string;
  start_at: string;
  end_at?: string;
  all_day: number;
  event_type: string;
  directorate_id?: number;
  created_by?: number;
  is_published: number;
}

export interface Announcement {
  id: number;
  title: string;
  body?: string;
  author_id?: number;
  directorate_id?: number;
  is_pinned: number;
  is_published: number;
  published_at?: string;
  expires_at?: string;
}

export interface KnowledgeArticle {
  id: number;
  title: string;
  slug: string;
  content?: string;
  category: string;
  author_id?: number;
  directorate_id?: number;
  tags?: string;
  is_published: number;
  view_count: number;
}

export interface BrandResource {
  id: number;
  name: string;
  description?: string;
  category: string;
  file_key?: string;
  file_url?: string;
  file_size?: number;
  mime_type?: string;
  version?: string;
  uploaded_by?: number;
  is_active: number;
}

export interface AuditLog {
  id: number;
  actor_id?: number;
  action: string;
  target_type?: string;
  target_id?: number;
  metadata?: string;
  ip_address?: string;
  created_at: string;
}

export interface SessionData {
  userId: number;
  email: string;
  isGodAdmin: boolean;
  roles: string[];
  directorateIds: number[];
}
