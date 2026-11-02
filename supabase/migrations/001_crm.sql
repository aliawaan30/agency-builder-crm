-- Agency Builder CRM: schema, invite only sign up, roles and row level security.
-- Run once in a NEW Supabase project (SQL Editor, paste, Run).

create extension if not exists pgcrypto;

-- ---------- Types ----------
create type public.member_role as enum ('admin', 'manager', 'closer', 'setter');

-- ---------- Tables ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role public.member_role not null default 'setter',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table public.team_invites (
  email text primary key check (email = lower(email)),
  role public.member_role not null default 'setter',
  full_name text not null default '',
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  short_name text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  position int not null default 0,
  kind text not null default 'open' check (kind in ('open', 'won', 'lost'))
);
create index stages_pipeline_idx on public.stages (pipeline_id, position);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 1 and 120),
  company text not null default '',
  email text,
  phone text not null default '',
  city text not null default '',
  timezone text not null default 'America/New_York',
  source text not null default 'Other',
  tags text[] not null default '{}',
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contacts_email_unique on public.contacts (lower(email)) where email is not null and email <> '';

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete restrict,
  stage_id uuid not null references public.stages(id) on delete restrict,
  value numeric(12, 2) not null default 0 check (value >= 0),
  owner_id uuid references public.profiles(id) on delete set null,
  next_step text not null default '',
  next_step_at timestamptz,
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deals_contact_idx on public.deals (contact_id);
create index deals_pipeline_idx on public.deals (pipeline_id, stage_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  type text not null check (type in ('call', 'email', 'note', 'stage', 'created', 'import')),
  body text not null default '',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index activities_contact_idx on public.activities (contact_id, created_at desc);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  pipeline_id uuid references public.pipelines(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  stage text not null default 'Kickoff' check (stage in ('Kickoff', 'Build', 'Test', 'Handover', 'Live')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index project_tasks_project_idx on public.project_tasks (project_id, position);

create table public.ask_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);

-- ---------- Helper functions ----------
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create or replace function public.is_lead() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role in ('admin', 'manager'))
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin')
$$;

create or replace function public.can_edit_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_lead() or exists (select 1 from public.projects where id = pid and owner_id = auth.uid())
$$;

-- Counts one Ask question for the signed in user and returns today's total.
create or replace function public.bump_ask_usage() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_member() then raise exception 'Not a team member'; end if;
  insert into public.ask_usage (user_id, day, count) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = public.ask_usage.count + 1
  returning count into n;
  return n;
end $$;

-- ---------- Invite only sign up ----------
-- Any new login (Google or email code) must match a row in team_invites.
-- Everyone else is rejected before an account is created.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.team_invites%rowtype;
begin
  select * into inv from public.team_invites where email = lower(new.email);
  if not found then
    raise exception 'This email has not been invited to the CRM';
  end if;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(inv.full_name, ''), new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    inv.role
  );
  delete from public.team_invites where email = lower(new.email);
  insert into public.audit_log (actor_id, action, detail) values (new.id, 'joined', lower(new.email) || ' joined as ' || inv.role);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only admins can change roles, email or access. There must always be one active admin.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- SQL editor and service role
  if (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email)
     and not public.is_admin() then
    raise exception 'Only admins can change roles or access';
  end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)
     and (select count(*) from public.profiles where role = 'admin' and active) <= 1 then
    raise exception 'The CRM needs at least one active admin';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();

-- ---------- Deal rules ----------
-- Stage must belong to the deal's pipeline. Closing a deal stamps closed_at.
create or replace function public.deal_before_write() returns trigger
language plpgsql set search_path = public as $$
declare s public.stages%rowtype;
begin
  select * into s from public.stages where id = new.stage_id;
  if not found or s.pipeline_id <> new.pipeline_id then
    raise exception 'Stage does not belong to this pipeline';
  end if;
  if s.kind = 'open' then
    new.closed_at := null;
  elsif tg_op = 'INSERT' or old.stage_id is distinct from new.stage_id then
    new.closed_at := coalesce(new.closed_at, now());
    new.next_step_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger deals_before_write before insert or update on public.deals
  for each row execute function public.deal_before_write();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

-- Logging a call or note counts as contact, so the deal stops going cold.
create or replace function public.activity_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type in ('call', 'email', 'note') then
    update public.deals set last_activity_at = new.created_at
    where contact_id = new.contact_id and (new.deal_id is null or id = new.deal_id);
  end if;
  return new;
end $$;

create trigger activities_after_insert after insert on public.activities
  for each row execute function public.activity_after_insert();

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.team_invites enable row level security;
alter table public.audit_log enable row level security;
alter table public.pipelines enable row level security;
alter table public.stages enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;
alter table public.projects enable row level security;
alter table public.project_tasks enable row level security;
alter table public.ask_usage enable row level security;

-- Team
create policy "members read team" on public.profiles for select using (public.is_member());
create policy "edit own profile or admin" on public.profiles for update
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "leads read invites" on public.team_invites for select using (public.is_lead());
create policy "leads invite" on public.team_invites for insert
  with check (public.is_admin() or (public.is_lead() and role in ('closer', 'setter')));
create policy "leads remove invites" on public.team_invites for delete using (public.is_lead());

create policy "leads read audit" on public.audit_log for select using (public.is_lead());
create policy "members write audit" on public.audit_log for insert
  with check (public.is_member() and actor_id = auth.uid());

-- Pipelines and stages: everyone reads, admins and managers change
create policy "members read pipelines" on public.pipelines for select using (public.is_member());
create policy "leads write pipelines" on public.pipelines for insert with check (public.is_lead());
create policy "leads update pipelines" on public.pipelines for update using (public.is_lead()) with check (public.is_lead());
create policy "leads delete pipelines" on public.pipelines for delete using (public.is_lead());

create policy "members read stages" on public.stages for select using (public.is_member());
create policy "leads write stages" on public.stages for insert with check (public.is_lead());
create policy "leads update stages" on public.stages for update using (public.is_lead()) with check (public.is_lead());
create policy "leads delete stages" on public.stages for delete using (public.is_lead());

-- Contacts: everyone reads and adds. Closers and setters edit their own. Admins and managers edit and delete all.
create policy "members read contacts" on public.contacts for select using (public.is_member());
create policy "members add contacts" on public.contacts for insert with check (public.is_member());
create policy "owners or leads update contacts" on public.contacts for update
  using (public.is_lead() or owner_id = auth.uid() or created_by = auth.uid()) with check (public.is_member());
create policy "leads delete contacts" on public.contacts for delete using (public.is_lead());

create policy "members read deals" on public.deals for select using (public.is_member());
create policy "members add deals" on public.deals for insert with check (public.is_member());
create policy "owners or leads update deals" on public.deals for update
  using (public.is_lead() or owner_id = auth.uid()) with check (public.is_member());
create policy "leads delete deals" on public.deals for delete using (public.is_lead());

create policy "members read activity" on public.activities for select using (public.is_member());
create policy "members log activity" on public.activities for insert
  with check (public.is_member() and created_by = auth.uid());
create policy "authors or admins edit activity" on public.activities for update
  using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
create policy "authors or admins delete activity" on public.activities for delete
  using (created_by = auth.uid() or public.is_admin());

create policy "members read projects" on public.projects for select using (public.is_member());
create policy "members add projects" on public.projects for insert with check (public.is_member());
create policy "owners or leads update projects" on public.projects for update
  using (public.is_lead() or owner_id = auth.uid()) with check (public.is_member());
create policy "leads delete projects" on public.projects for delete using (public.is_lead());

create policy "members read tasks" on public.project_tasks for select using (public.is_member());
create policy "editors add tasks" on public.project_tasks for insert with check (public.can_edit_project(project_id));
create policy "editors update tasks" on public.project_tasks for update
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy "editors delete tasks" on public.project_tasks for delete using (public.can_edit_project(project_id));

create policy "read own ask usage" on public.ask_usage for select using (user_id = auth.uid());

-- ---------- Live updates ----------
alter publication supabase_realtime add table
  public.profiles, public.pipelines, public.stages, public.contacts, public.deals, public.projects, public.project_tasks;

-- ---------- Starting pipelines ----------
with p as (
  insert into public.pipelines (name, short_name, position) values ('Business implementation', 'Business', 0) returning id
)
insert into public.stages (pipeline_id, name, position, kind)
select p.id, s.name, s.pos, s.kind from p,
  (values ('New lead', 0, 'open'), ('Audit booked', 1, 'open'), ('Audit done', 2, 'open'), ('Proposal sent', 3, 'open'),
          ('Close call', 4, 'open'), ('Won', 5, 'won'), ('Lost', 6, 'lost')) as s(name, pos, kind);

with p as (
  insert into public.pipelines (name, short_name, position) values ('Agency high ticket', 'Agency', 1) returning id
)
insert into public.stages (pipeline_id, name, position, kind)
select p.id, s.name, s.pos, s.kind from p,
  (values ('New lead', 0, 'open'), ('Call booked', 1, 'open'), ('Showed', 2, 'open'), ('Follow up', 3, 'open'),
          ('Won', 4, 'won'), ('Lost', 5, 'lost')) as s(name, pos, kind);
