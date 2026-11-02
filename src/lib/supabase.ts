import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
});

// Turns Supabase errors into sentences a rep can act on.
export function friendlyError(message: string | undefined): string {
  const m = (message || '').toLowerCase();
  if (m.includes('database error saving new user') || m.includes('not been invited')) {
    return 'This email isn’t on the team. Ask your manager for an invite.';
  }
  if (m.includes('token has expired') || m.includes('otp') && m.includes('invalid')) return 'That code is wrong or has expired. Try again or request a new one.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a few minutes and try again.';
  if (m.includes('row-level security') || m.includes('permission denied')) return 'You don’t have permission to change this.';
  if (m.includes('only admins')) return 'Only admins can change roles or access.';
  if (m.includes('at least one active admin')) return 'The CRM needs at least one active admin.';
  if (m.includes('contacts_email_unique') || m.includes('duplicate key')) return 'A contact with this email already exists.';
  if (m.includes('violates foreign key') && m.includes('stage')) return 'Move the deals out of this stage first.';
  return message || 'Something went wrong. Try again.';
}
