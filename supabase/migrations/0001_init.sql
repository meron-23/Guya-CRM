-- Guya platform — database schema
-- Run once in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ───────────────────────────── Profiles & roles ─────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  role text not null default 'staff' check (role in ('partner', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_partner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'partner');
$$;

-- New auth user → profile.
--  • The very first account becomes a partner.
--  • Accounts created from Settings carry their role in app_metadata (only the server can set it).
--  • Anyone else (e.g. a public sign-up, if it was left switched on) gets a turned-off staff profile.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
  v_active boolean := true;
begin
  if not exists (select 1 from public.profiles where role = 'partner') then
    v_role := 'partner';
  elsif v_role is null or v_role not in ('partner', 'staff') then
    v_role := 'staff';
    v_active := false;
  end if;
  insert into public.profiles (id, full_name, email, role, active)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)), new.email, v_role, v_active)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- The auth server may write app_metadata just after creating the user, so
-- apply a role given there (by the server) when it first appears or changes.
create or replace function public.handle_user_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role in ('partner', 'staff') and v_role is distinct from (old.raw_app_meta_data ->> 'role') then
    update public.profiles set role = v_role, active = true where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_role_changed after update of raw_app_meta_data on auth.users
for each row execute function public.handle_user_role_change();

-- ───────────────────────────── Settings ─────────────────────────────
create table public.settings (
  id int primary key default 1 check (id = 1),
  branch_name text not null default 'Bethel Branch',
  centre_phone text not null default '',
  fee_due_day int not null default 5 check (fee_due_day between 1 and 28),
  reminder_days_before int not null default 2 check (reminder_days_before between 0 and 14),
  call_cadence int[] not null default '{0,1,3,7,14}',
  default_language text not null default 'en' check (default_language in ('en', 'am')),
  auto_weekly_report boolean not null default true,
  auto_monthly_report boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1);

-- ───────────────────────────── Services & therapists ─────────────────────────────
create table public.services (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('therapy', 'daycare', 'assessment')),
  name text not null,
  description text not null default '',
  billing text not null default 'monthly' check (billing in ('monthly', 'one_time')),
  price numeric(12, 2) not null default 0 check (price >= 0),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.services (category, name, description, billing, price, sort) values
  ('therapy', 'ABA therapy', '5 sessions a week', 'monthly', 0, 1),
  ('therapy', 'Speech therapy', '3 sessions a week', 'monthly', 0, 2),
  ('therapy', 'Occupational therapy', '2 sessions a week', 'monthly', 0, 3),
  ('daycare', 'Day care', 'Monday – Friday', 'monthly', 0, 4),
  ('assessment', 'Initial assessment', 'One-time', 'one_time', 0, 5);

create table public.therapists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text not null default '',
  phone text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── Leads ─────────────────────────────
create sequence public.lead_code_seq;
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('L-' || lpad(nextval('public.lead_code_seq')::text, 3, '0')),
  parent_name text not null,
  relationship text not null default '',
  phone text not null default '',
  has_whatsapp boolean not null default false,
  telegram text not null default '',
  preferred_channel text not null default 'call' check (preferred_channel in ('call', 'whatsapp', 'telegram')),
  child_name text not null default '',
  child_age text not null default '',
  service_id uuid references public.services (id) on delete set null,
  concern text not null default '',
  source text not null default 'other' check (source in ('tiktok', 'facebook', 'instagram', 'referral', 'doctor', 'walk_in', 'phone', 'other')),
  area text not null default '',
  notes text not null default '',
  status text not null default 'open' check (status in ('open', 'assessment_booked', 'registered', 'closed')),
  close_reason text check (close_reason in ('no_response', 'out_of_area', 'not_interested', 'price', 'other')),
  call_attempts int not null default 0,
  next_call_at timestamptz,
  assessment_at timestamptz,
  child_id uuid,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_status_next on public.leads (status, next_call_at);
create index leads_created on public.leads (created_at);

create table public.lead_calls (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  attempt_no int not null,
  outcome text not null check (outcome in ('no_answer', 'answered', 'booked_assessment', 'not_interested', 'out_of_area', 'price', 'other')),
  note text not null default '',
  called_by uuid references public.profiles (id) on delete set null default auth.uid(),
  called_at timestamptz not null default now()
);
create index lead_calls_lead on public.lead_calls (lead_id, called_at);

-- New leads are due for their first call straight away.
create or replace function public.leads_before_insert() returns trigger language plpgsql as $$
begin
  if new.status = 'open' and new.next_call_at is null then
    new.next_call_at := now();
  end if;
  return new;
end $$;
create trigger leads_bi before insert on public.leads for each row execute function public.leads_before_insert();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();

-- Log a call and move the lead along the follow-up plan, in one step.
create or replace function public.log_lead_call(
  p_lead uuid,
  p_outcome text,
  p_note text default '',
  p_next_at timestamptz default null,
  p_assessment_at timestamptz default null
) returns public.leads
language plpgsql security invoker set search_path = public as $$
declare
  l public.leads;
  cad int[];
  n int;
  due timestamptz;
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'lead not found'; end if;
  select call_cadence into cad from public.settings where id = 1;
  n := l.call_attempts + 1;

  insert into public.lead_calls (lead_id, attempt_no, outcome, note) values (p_lead, n, p_outcome, coalesce(p_note, ''));

  if p_outcome = 'no_answer' then
    if n >= coalesce(array_length(cad, 1), 5) then
      update public.leads set call_attempts = n, status = 'closed', close_reason = 'no_response', next_call_at = null where id = p_lead returning * into l;
    else
      due := ((date_trunc('day', l.created_at at time zone 'Africa/Addis_Ababa') + make_interval(days => cad[n + 1]) + interval '9 hours') at time zone 'Africa/Addis_Ababa');
      if due < now() then due := now() + interval '1 day'; end if;
      update public.leads set call_attempts = n, next_call_at = due where id = p_lead returning * into l;
    end if;
  elsif p_outcome = 'answered' then
    update public.leads set call_attempts = n, status = 'open',
      next_call_at = coalesce(p_next_at, now() + interval '2 days') where id = p_lead returning * into l;
  elsif p_outcome = 'booked_assessment' then
    if p_assessment_at is null then raise exception 'assessment date required'; end if;
    update public.leads set call_attempts = n, status = 'assessment_booked', assessment_at = p_assessment_at, next_call_at = null
      where id = p_lead returning * into l;
  else
    update public.leads set call_attempts = n, status = 'closed', next_call_at = null,
      close_reason = case p_outcome when 'not_interested' then 'not_interested' when 'out_of_area' then 'out_of_area' when 'price' then 'price' else 'other' end
      where id = p_lead returning * into l;
  end if;
  return l;
end $$;

-- ───────────────────────────── Children ─────────────────────────────
create sequence public.child_code_seq;
create table public.children (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('GU-' || lpad(nextval('public.child_code_seq')::text, 3, '0')),
  name text not null,
  date_of_birth date,
  gender text not null default '' check (gender in ('', 'male', 'female')),
  parent_name text not null,
  relationship text not null default '',
  phone text not null default '',
  has_whatsapp boolean not null default false,
  telegram text not null default '',
  preferred_channel text not null default 'call' check (preferred_channel in ('call', 'whatsapp', 'telegram')),
  second_contact_name text not null default '',
  second_contact_phone text not null default '',
  service_id uuid references public.services (id) on delete set null,
  therapist_id uuid references public.therapists (id) on delete set null,
  schedule text not null default '',
  monthly_fee numeric(12, 2) not null default 0 check (monthly_fee >= 0),
  status text not null default 'active' check (status in ('active', 'waiting', 'left')),
  joined_on date not null default (now() at time zone 'Africa/Addis_Ababa')::date,
  left_on date,
  lead_id uuid references public.leads (id) on delete set null,
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger children_touch before update on public.children for each row execute function public.touch_updated_at();

-- Only partners can change an existing child's monthly fee (discounts).
create or replace function public.children_fee_guard() returns trigger language plpgsql as $$
begin
  if new.monthly_fee is distinct from old.monthly_fee and not public.is_partner() then
    raise exception 'Only partners can change a monthly fee';
  end if;
  return new;
end $$;
create trigger children_fee_guard before update on public.children for each row execute function public.children_fee_guard();
alter table public.leads add constraint leads_child_fk foreign key (child_id) references public.children (id) on delete set null;

-- ───────────────────────────── Payments ─────────────────────────────
create sequence public.payment_code_seq;
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('P-' || lpad(nextval('public.payment_code_seq')::text, 4, '0')),
  child_id uuid not null references public.children (id) on delete restrict,
  service_id uuid references public.services (id) on delete set null,
  payer_name text not null default '',
  amount numeric(12, 2) not null check (amount > 0),
  period_month date check (period_month is null or extract(day from period_month) = 1),
  method text not null default 'cash' check (method in ('telebirr', 'cbe', 'cash', 'bank', 'other')),
  reference text not null default '',
  note text not null default '',
  paid_on date not null default (now() at time zone 'Africa/Addis_Ababa')::date,
  received_by uuid references public.profiles (id) on delete set null default auth.uid(),
  voided boolean not null default false,
  void_reason text,
  voided_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_child on public.payments (child_id, period_month);
create index payments_paid_on on public.payments (paid_on);

-- Payments can only be voided (with a reason), never edited.
create or replace function public.payments_guard() returns trigger language plpgsql as $$
begin
  -- Allow the database itself to clear staff links when a user account is deleted.
  if new.voided = old.voided
     and (new.child_id, new.service_id, new.payer_name, new.amount, new.period_month, new.method, new.reference, new.note, new.paid_on)
         is not distinct from (old.child_id, old.service_id, old.payer_name, old.amount, old.period_month, old.method, old.reference, old.note, old.paid_on)
     and (new.received_by is null or new.received_by is not distinct from old.received_by)
     and (new.voided_by is null or new.voided_by is not distinct from old.voided_by) then
    return new;
  end if;
  if old.voided then raise exception 'payment already voided'; end if;
  if new.voided is distinct from true then raise exception 'payments can only be voided'; end if;
  if coalesce(trim(new.void_reason), '') = '' then raise exception 'a reason is required to void a payment'; end if;
  if (new.child_id, new.service_id, new.payer_name, new.amount, new.period_month, new.method, new.reference, new.note, new.paid_on)
     is distinct from (old.child_id, old.service_id, old.payer_name, old.amount, old.period_month, old.method, old.reference, old.note, old.paid_on) then
    raise exception 'payment details cannot be changed';
  end if;
  new.voided_by := auth.uid();
  new.voided_at := now();
  return new;
end $$;
create trigger payments_bu before update on public.payments for each row execute function public.payments_guard();

-- The person signed in is always recorded as the one who received the money.
create or replace function public.payments_before_insert() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then new.received_by := auth.uid(); end if;
  new.voided := false; new.void_reason := null; new.voided_by := null; new.voided_at := null;
  return new;
end $$;
create trigger payments_bi before insert on public.payments for each row execute function public.payments_before_insert();

-- ───────────────────────────── Expenses ─────────────────────────────
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('rent', 'salaries', 'utilities', 'misc')),
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  spent_on date not null default (now() at time zone 'Africa/Addis_Ababa')::date,
  method text not null default 'cash' check (method in ('telebirr', 'cbe', 'cash', 'bank', 'other')),
  note text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index expenses_spent on public.expenses (spent_on);

-- ───────────────────────────── Reminder log & activity ─────────────────────────────
create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('payment', 'call', 'assessment')),
  child_id uuid references public.children (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  channel text not null check (channel in ('call', 'whatsapp', 'telegram', 'sms', 'in_person')),
  message text not null default '',
  result text not null default '',
  sent_by uuid references public.profiles (id) on delete set null default auth.uid(),
  sent_at timestamptz not null default now()
);
create index reminder_log_sent on public.reminder_log (sent_at);

create table public.activity_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  summary text not null default '',
  created_at timestamptz not null default now()
);
create index activity_log_created on public.activity_log (created_at desc);

create or replace function public.log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s text := '';
  rec record;
  v_id uuid;
  verb text;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;
  verb := case tg_op when 'INSERT' then 'Added' when 'UPDATE' then 'Updated' else 'Deleted' end;
  if tg_table_name = 'payments' then
    if tg_op = 'UPDATE' and (old.voided or not new.voided) then return null; end if;
    s := case when tg_op = 'INSERT' then 'Payment ' || new.code || ' · ETB ' || rtrim(rtrim(to_char(new.amount, 'FM999,999,990.00'), '0'), '.')
              else 'Payment ' || new.code || ' voided: ' || coalesce(new.void_reason, '') end;
  elsif tg_table_name = 'children' then
    s := case when tg_op = 'INSERT' then 'Registered ' || new.name || ' (' || new.code || ')'
              else 'Updated ' || new.name || ' (' || new.code || ')' end;
  elsif tg_table_name = 'leads' then
    s := 'New enquiry ' || new.code || ' · ' || new.parent_name;
  elsif tg_table_name = 'expenses' then
    s := verb || ' expense · ' || rec.description || ' · ETB ' || rtrim(rtrim(to_char(rec.amount, 'FM999,999,990.00'), '0'), '.');
  elsif tg_table_name = 'settings' then
    s := 'Settings updated';
  elsif tg_table_name = 'services' then
    s := verb || ' service · ' || rec.name;
  end if;
  if tg_table_name <> 'settings' then v_id := rec.id; end if;
  insert into public.activity_log (actor, action, entity, entity_id, summary)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, s);
  return null;
end $$;

create trigger payments_activity after insert or update on public.payments for each row execute function public.log_activity();
create trigger children_activity after insert on public.children for each row execute function public.log_activity();
create trigger leads_activity after insert on public.leads for each row execute function public.log_activity();
create trigger expenses_activity after insert or update or delete on public.expenses for each row execute function public.log_activity();
create trigger settings_activity after update on public.settings for each row execute function public.log_activity();
create trigger services_activity after insert or update or delete on public.services for each row execute function public.log_activity();

-- ───────────────────────────── Balances ─────────────────────────────
-- What each child owes: one monthly fee per month from the month they joined
-- up to this month (or the month they left), minus monthly payments.
create or replace view public.child_balances with (security_invoker = on) as
with today as (
  select (now() at time zone 'Africa/Addis_Ababa')::date as d
), base as (
  select c.id as child_id, c.monthly_fee,
    date_trunc('month', c.joined_on)::date as first_month,
    date_trunc('month', case when c.status = 'left' and c.left_on is not null then least(c.left_on, t.d) else t.d end)::date as last_month,
    date_trunc('month', t.d)::date as this_month
  from public.children c
  cross join today t
  join public.services s on s.id = c.service_id and s.billing = 'monthly'
  where c.status in ('active', 'left') and c.monthly_fee > 0
), calc as (
  select b.*,
    (b.last_month = b.this_month) as billed_this_month,
    greatest(((extract(year from b.last_month) - extract(year from b.first_month)) * 12
      + extract(month from b.last_month) - extract(month from b.first_month) + 1)::int, 0) as months_billed
  from base b
), paid as (
  select p.child_id,
    coalesce(sum(p.amount) filter (where p.period_month is not null and p.period_month < date_trunc('month', (now() at time zone 'Africa/Addis_Ababa')::date)::date), 0) as paid_past,
    coalesce(sum(p.amount) filter (where p.period_month = date_trunc('month', (now() at time zone 'Africa/Addis_Ababa')::date)::date), 0) as paid_this_month
  from public.payments p
  where not p.voided
  group by p.child_id
)
select c.child_id,
  c.monthly_fee,
  c.months_billed,
  c.billed_this_month,
  coalesce(p.paid_this_month, 0) as paid_this_month,
  greatest((c.months_billed - case when c.billed_this_month then 1 else 0 end) * c.monthly_fee - coalesce(p.paid_past, 0), 0) as arrears,
  case when c.billed_this_month then greatest(c.monthly_fee - coalesce(p.paid_this_month, 0), 0) else 0 end as due_this_month,
  greatest((c.months_billed - case when c.billed_this_month then 1 else 0 end) * c.monthly_fee - coalesce(p.paid_past, 0), 0)
    + case when c.billed_this_month then greatest(c.monthly_fee - coalesce(p.paid_this_month, 0), 0) else 0 end as owes
from calc c
left join paid p on p.child_id = c.child_id;

-- ───────────────────────────── Row level security ─────────────────────────────
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.services enable row level security;
alter table public.therapists enable row level security;
alter table public.leads enable row level security;
alter table public.lead_calls enable row level security;
alter table public.children enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.reminder_log enable row level security;
alter table public.activity_log enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (public.is_member() or id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (public.is_partner()) with check (public.is_partner());

create policy settings_select on public.settings for select to authenticated using (public.is_member());
create policy settings_update on public.settings for update to authenticated using (public.is_partner()) with check (public.is_partner());

create policy services_select on public.services for select to authenticated using (public.is_member());
create policy services_write on public.services for all to authenticated using (public.is_partner()) with check (public.is_partner());

create policy therapists_select on public.therapists for select to authenticated using (public.is_member());
create policy therapists_write on public.therapists for all to authenticated using (public.is_partner()) with check (public.is_partner());

create policy leads_select on public.leads for select to authenticated using (public.is_member());
create policy leads_insert on public.leads for insert to authenticated with check (public.is_member());
create policy leads_update on public.leads for update to authenticated using (public.is_member()) with check (public.is_member());
create policy leads_delete on public.leads for delete to authenticated using (public.is_partner());

create policy lead_calls_select on public.lead_calls for select to authenticated using (public.is_member());
create policy lead_calls_insert on public.lead_calls for insert to authenticated with check (public.is_member());

create policy children_select on public.children for select to authenticated using (public.is_member());
create policy children_insert on public.children for insert to authenticated with check (public.is_member());
create policy children_update on public.children for update to authenticated using (public.is_member()) with check (public.is_member());

create policy payments_select on public.payments for select to authenticated using (public.is_member());
create policy payments_insert on public.payments for insert to authenticated with check (public.is_member() and voided = false);
create policy payments_void on public.payments for update to authenticated using (public.is_partner()) with check (public.is_partner());

create policy expenses_all on public.expenses for all to authenticated using (public.is_partner()) with check (public.is_partner());

create policy reminder_log_select on public.reminder_log for select to authenticated using (public.is_member());
create policy reminder_log_insert on public.reminder_log for insert to authenticated with check (public.is_member());

create policy activity_select on public.activity_log for select to authenticated using (public.is_partner());

-- Signed-in users reach tables only through the policies above.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Lock everything down for anonymous visitors.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_partner() to authenticated;
grant execute on function public.log_lead_call(uuid, text, text, timestamptz, timestamptz) to authenticated;
