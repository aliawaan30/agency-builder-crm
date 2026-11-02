export type Role = 'admin' | 'manager' | 'closer' | 'setter';
export type StageKind = 'open' | 'won' | 'lost';
export type ActivityType = 'call' | 'email' | 'note' | 'stage' | 'created' | 'import';
export const PROJECT_STAGES = ['Kickoff', 'Build', 'Test', 'Handover', 'Live'] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
  last_seen_at: string | null;
}
export interface Invite {
  email: string;
  role: Role;
  full_name: string;
  invited_by: string | null;
  created_at: string;
}
export interface Pipeline {
  id: string;
  name: string;
  short_name: string;
  position: number;
}
export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  kind: StageKind;
}
export interface Contact {
  id: string;
  full_name: string;
  company: string;
  email: string | null;
  phone: string;
  city: string;
  timezone: string;
  source: string;
  tags: string[];
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export interface Deal {
  id: string;
  contact_id: string;
  pipeline_id: string;
  stage_id: string;
  value: number;
  owner_id: string | null;
  next_step: string;
  next_step_at: string | null;
  last_activity_at: string;
  closed_at: string | null;
  created_at: string;
}
export interface Activity {
  id: string;
  contact_id: string;
  deal_id: string | null;
  type: ActivityType;
  body: string;
  created_by: string | null;
  created_at: string;
}
export interface Project {
  id: string;
  name: string;
  client_name: string;
  contact_id: string | null;
  deal_id: string | null;
  pipeline_id: string | null;
  owner_id: string | null;
  stage: ProjectStage;
  due_date: string | null;
  created_at: string;
}
export interface Task {
  id: string;
  project_id: string;
  title: string;
  done: boolean;
  position: number;
}
export interface AuditRow {
  id: number;
  actor_id: string | null;
  action: string;
  detail: string;
  created_at: string;
}

export const SOURCES = ['Onboarding', 'Meta ad', 'Skool', 'Referral', 'Outbound', 'Import', 'Other'];
export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', manager: 'Manager', closer: 'Closer', setter: 'Setter' };
