-- Guya platform — v2 changes (agreed in the clickable demo v2, Nov 2026)
-- Run after 0001_init.sql.
--   • Ethiopian-calendar billing months (period_month = Gregorian date of the 1st of an Ethiopian month)
--   • several services per child, per-session / per-hour pricing, first-month fee
--   • upfront (multi-month) payments with discount, payment screenshots
--   • username logins (partners create staff logins; passwords fixed)
--   • leads interested in several services

-- ───────── Settings ─────────
alter table public.settings
  add column if not exists upfront jsonb not null default '[{"months":3,"pct":5},{"months":6,"pct":10}]',
  add column if not exists calendar text not null default 'eth' check (calendar in ('eth', 'greg'));

-- ───────── Profiles: username logins ─────────
-- Logins use Supabase Auth with a synthetic email: <username>@guya.local (never shown to users).
alter table public.profiles add column if not exists username text;
update public.profiles set username = lower(split_part(coalesce(email, id::text), '@', 1)) where username is null;
alter table public.profiles alter column username set not null;
create unique index if not exists profiles_username on public.profiles (lower(username));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
  v_active boolean := true;
begin
  if not exists (select 1 from public.profiles where role = 'partner') then
    v_role := 'partner';                       -- the very first account is a partner
  elsif v_role is null or v_role not in ('partner', 'staff') then
    v_role := 'staff'; v_active := false;      -- self-signups are never active
  end if;
  insert into public.profiles (id, full_name, email, username, role, active)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
          new.email,
          lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1))),
          v_role, v_active)
  on conflict (id) do nothing;
  return new;
end $$;

-- ───────── Services: per session / per hour ─────────
alter table public.services drop constraint if exists services_billing_check;
alter table public.services add constraint services_billing_check
  check (billing in ('monthly', 'per_session', 'per_hour', 'one_time'));

-- ───────── Leads: several services ─────────
alter table public.leads add column if not exists service_ids uuid[] not null default '{}';
update public.leads set service_ids = array[service_id] where service_id is not null and service_ids = '{}';

-- ───────── Children: several services, quantities, first month ─────────
alter table public.children
  add column if not exists service_ids uuid[] not null default '{}',
  add column if not exists service_qty jsonb not null default '{}',      -- { "<service id>": sessions or hours per month }
  add column if not exists first_month_fee numeric(12, 2) check (first_month_fee is null or first_month_fee >= 0);
update public.children set service_ids = array[service_id] where service_id is not null and service_ids = '{}';

-- first_month_fee is money too: only partners may change it after registration
create or replace function public.children_fee_guard() returns trigger language plpgsql as $$
begin
  if (new.monthly_fee is distinct from old.monthly_fee or new.first_month_fee is distinct from old.first_month_fee)
     and not public.is_partner() then
    raise exception 'only partners can change fees';
  end if;
  return new;
end $$;

-- ───────── Payments: Ethiopian months, upfront bundles, screenshots ─────────
-- Ethiopian months start mid Gregorian month, so the "day = 1" rule no longer applies.
alter table public.payments drop constraint if exists payments_period_month_check;
-- One upfront payment = one row per month covered, all sharing the same code and bundle_id.
alter table public.payments drop constraint if exists payments_code_key;
alter table public.payments
  add column if not exists discount numeric(12, 2) not null default 0 check (discount >= 0),
  add column if not exists bundle_id uuid,
  add column if not exists bundle_months int check (bundle_months is null or bundle_months between 1 and 12),
  add column if not exists screenshot_path text;                         -- path in the "payment-screenshots" bucket
create unique index if not exists payments_code_month on public.payments (code, coalesce(period_month, '1900-01-01'::date));
create index if not exists payments_bundle on public.payments (bundle_id);

-- Next receipt number for an upfront bundle (all its rows share it)
create or replace function public.next_payment_code() returns text language sql security definer set search_path = public as $$
  select 'P-' || lpad(nextval('public.payment_code_seq')::text, 4, '0');
$$;
grant execute on function public.next_payment_code() to authenticated;

-- Payments stay void-only. Discount, bundle and screenshot are fixed once saved.
create or replace function public.payments_guard() returns trigger language plpgsql as $$
begin
  if new.voided = old.voided
     and (new.child_id, new.service_id, new.payer_name, new.amount, new.discount, new.period_month, new.method, new.reference, new.note, new.paid_on, new.bundle_id, new.screenshot_path)
         is not distinct from (old.child_id, old.service_id, old.payer_name, old.amount, old.discount, old.period_month, old.method, old.reference, old.note, old.paid_on, old.bundle_id, old.screenshot_path)
     and (new.received_by is null or new.received_by is not distinct from old.received_by)
     and (new.voided_by is null or new.voided_by is not distinct from old.voided_by) then
    return new;
  end if;
  if old.voided then raise exception 'payment already voided'; end if;
  if new.voided is distinct from true then raise exception 'payments can only be voided'; end if;
  if coalesce(trim(new.void_reason), '') = '' then raise exception 'a reason is required to void a payment'; end if;
  if (new.child_id, new.service_id, new.payer_name, new.amount, new.discount, new.period_month, new.method, new.reference, new.note, new.paid_on, new.bundle_id, new.screenshot_path)
     is distinct from (old.child_id, old.service_id, old.payer_name, old.amount, old.discount, old.period_month, old.method, old.reference, old.note, old.paid_on, old.bundle_id, old.screenshot_path) then
    raise exception 'payment details cannot be changed';
  end if;
  new.voided_by := auth.uid();
  new.voided_at := now();
  return new;
end $$;

-- Billing is now worked out in the app (Ethiopian months, first-month fee, discounts):
-- see app/src/store.tsx → expectedFor() and balances(). The old Gregorian view is removed.
drop view if exists public.child_balances;

-- ───────── Storage: payment screenshots (private) ─────────
insert into storage.buckets (id, name, public) values ('payment-screenshots', 'payment-screenshots', false)
on conflict (id) do nothing;
create policy screenshots_read on storage.objects for select to authenticated
  using (bucket_id = 'payment-screenshots' and public.is_member());
create policy screenshots_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-screenshots' and public.is_member());
-- no update/delete policy: screenshots can't be replaced or removed from the app

-- ───────── Keep-alive (free plan pauses after 7 idle days) ─────────
create table if not exists public.heartbeat (id int primary key default 1 check (id = 1), at timestamptz not null default now());
insert into public.heartbeat (id) values (1) on conflict do nothing;
alter table public.heartbeat enable row level security;

-- ───────── Activity log: translatable summaries ─────────
-- The app stores an English template ("Payment · {name} · {amount}") plus values, and shows it in English or Amharic.
alter table public.activity_log add column if not exists vars jsonb;
