-- ════════════════════════════════════════════════════════════════════
-- Stock Room — inventory database (Supabase / Postgres)
--
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to re-run:
-- it only creates what is missing and replaces functions/policies.
--
-- Design in one paragraph:
--   • Stock is never "edited". Every change is a row in stock_movements
--     (purchase, sale, adjustment, count, return, damage …). On-hand stock
--     is the sum of movements, so the history can always explain the number.
--     Mistakes are fixed by a reversing movement, never by deleting.
--   • Every insert/update/delete on business tables is written to audit_log
--     by a trigger (who, when, old values, new values, which fields changed).
--   • Access is enforced in the database with Row Level Security, using
--     permissions attached to roles. The app UI only hides what the
--     database would refuse anyway.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Roles & permissions ──────────────────────────────────────────────
create table if not exists public.roles (
  key         text primary key,
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.permissions (
  key         text primary key,
  label       text not null,
  sort        int not null default 0
);

create table if not exists public.role_permissions (
  role_key       text not null references public.roles(key) on update cascade on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

-- ── People ───────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text not null,
  phone       text not null,                -- E.164, e.g. +919876543210
  role_key    text references public.roles(key) on update cascade,
  status      text not null default 'pending' check (status in ('pending','active','disabled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists profiles_email_key on public.profiles (lower(email));
create unique index if not exists profiles_phone_key on public.profiles (phone);

-- Admins can pre-approve people: whoever signs up with this email or phone
-- gets the role straight away instead of waiting in "pending".
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text,
  phone       text,
  role_key    text not null references public.roles(key) on update cascade,
  invited_by  uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (email is not null or phone is not null)
);

-- ── Catalogue ────────────────────────────────────────────────────────
create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  gstin       text,
  phone       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists suppliers_name_key on public.suppliers (lower(name));

create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null,                -- supplier code, e.g. EMPP000001
  name            text not null,
  pack            text,                         -- 200ML, 60TAB …
  category        text,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  purchase_price  numeric(12,2),                -- last price paid per unit (GST incl.)
  sell_price      numeric(12,2),                -- your selling price / MRP
  gst_rate        numeric(5,2),
  reorder_level   numeric(12,2) not null default 0,
  barcode         text,
  image_url       text,
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists products_sku_key on public.products (upper(sku));

-- ── Purchases (supplier invoices) ────────────────────────────────────
create table if not exists public.purchases (
  id             uuid primary key default gen_random_uuid(),
  supplier_id    uuid not null references public.suppliers(id),
  invoice_no     text not null,
  invoice_date   date,
  subtotal       numeric(12,2),
  cgst           numeric(12,2),
  sgst           numeric(12,2),
  igst           numeric(12,2),
  other_charges  numeric(12,2) not null default 0,
  grand_total    numeric(12,2),
  notes          text,
  source         text not null default 'manual',  -- pdf | csv | manual
  file_path      text,                            -- original invoice in storage
  status         text not null default 'posted' check (status in ('posted','void')),
  void_reason    text,
  created_by     uuid references public.profiles(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists purchases_invoice_key
  on public.purchases (supplier_id, upper(invoice_no)) where status = 'posted';

create table if not exists public.purchase_items (
  id              uuid primary key default gen_random_uuid(),
  purchase_id     uuid not null references public.purchases(id) on delete cascade,
  product_id      uuid not null references public.products(id),
  line_no         int,
  qty             numeric(12,2) not null check (qty > 0),
  unit_price      numeric(12,2) not null,
  gst_amount      numeric(12,2) not null default 0,
  taxable_amount  numeric(12,2),
  gst_rate        numeric(5,2)
);

-- ── Stock ledger ─────────────────────────────────────────────────────
create table if not exists public.stock_movements (
  id           bigserial primary key,
  product_id   uuid not null references public.products(id),
  qty          numeric(12,2) not null check (qty <> 0),   -- + in, − out
  kind         text not null check (kind in
                 ('opening','purchase','sale','return_in','return_out',
                  'adjustment','count','damage','expired','sample','transfer','reversal')),
  unit_price   numeric(12,2),          -- cost for stock in, selling price for sales
  purchase_id  uuid references public.purchases(id),
  reverses_id  bigint references public.stock_movements(id),
  reference    text,                   -- bill no, customer, etc.
  note         text,
  created_by   uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create unique index if not exists stock_movements_reversed_once on public.stock_movements (reverses_id) where reverses_id is not null;

create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

-- ── Audit log ────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id             bigserial primary key,
  table_name     text not null,
  record_id      text not null,
  action         text not null,           -- INSERT | UPDATE | DELETE
  changed_fields text[],
  old_data       jsonb,
  new_data       jsonb,
  actor          uuid,
  actor_name     text,
  at             timestamptz not null default now()
);
create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id, at desc);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- ════════════════════════════════════════════════════════════════════
-- Helper functions
-- ════════════════════════════════════════════════════════════════════

create or replace function public.has_perm(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles pr
    join role_permissions rp on rp.role_key = pr.role_key
    where pr.id = auth.uid() and pr.status = 'active' and rp.permission_key = p
  );
$$;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.my_permissions()
returns setof text language sql stable security definer set search_path = public as $$
  select rp.permission_key from profiles pr
  join role_permissions rp on rp.role_key = pr.role_key
  where pr.id = auth.uid() and pr.status = 'active';
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- Generic audit trigger
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  fields text[];
  who uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into fields
    from jsonb_object_keys(n) k
    where k <> 'updated_at' and (o -> k) is distinct from (n -> k);
    if fields is null then return new; end if;   -- nothing really changed
  end if;
  insert into audit_log (table_name, record_id, action, changed_fields, old_data, new_data, actor, actor_name)
  values (tg_table_name, coalesce(n ->> 'id', o ->> 'id', n ->> 'key', o ->> 'key'), tg_op, fields, o, n, who,
          (select full_name from profiles where id = who));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','roles','invitations','suppliers',
                           'products','purchases','purchase_items','stock_movements','settings']
  loop
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I
                    for each row execute function public.audit_trigger()', t);
  end loop;
  foreach t in array array['profiles','suppliers','products','purchases']
  loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- role_permissions has no id column; give the audit log a readable record id
create or replace function public.audit_role_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  insert into audit_log (table_name, record_id, action, old_data, new_data, actor, actor_name)
  values ('role_permissions', r.role_key || ':' || r.permission_key, tg_op,
          case when tg_op = 'DELETE' then to_jsonb(old) end,
          case when tg_op = 'INSERT' then to_jsonb(new) end,
          auth.uid(), (select full_name from profiles where id = auth.uid()));
  return r;
end $$;
drop trigger if exists audit on public.role_permissions;
create trigger audit after insert or delete on public.role_permissions
  for each row execute function public.audit_role_permissions();

-- ── Phone normalisation (Indian numbers by default) ──────────────────
create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  select case
    when p is null then null
    when regexp_replace(p, '[^0-9+]', '', 'g') like '+%' then regexp_replace(p, '[^0-9+]', '', 'g')
    when length(regexp_replace(p, '\D', '', 'g')) = 10 then '+91' || regexp_replace(p, '\D', '', 'g')
    when length(regexp_replace(p, '\D', '', 'g')) = 12 and regexp_replace(p, '\D', '', 'g') like '91%'
      then '+' || regexp_replace(p, '\D', '', 'g')
    else regexp_replace(p, '\D', '', 'g')
  end;
$$;

-- ── New sign-ups → profile ───────────────────────────────────────────
-- The very first person to sign up becomes admin. Others are "pending"
-- until an admin approves them, unless an invitation matches.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ph  text := normalize_phone(coalesce(new.raw_user_meta_data ->> 'phone', new.phone));
  inv invitations%rowtype;
  first_user boolean := not exists (select 1 from profiles);
begin
  if ph is null or ph = '' then
    raise exception 'A mobile number is required to sign up';
  end if;
  select * into inv from invitations
   where accepted_by is null
     and ((email is not null and lower(email) = lower(new.email)) or (phone is not null and phone = ph))
   order by created_at desc limit 1;

  insert into profiles (id, full_name, email, phone, role_key, status)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, ph,
          case when first_user then 'admin' when inv.id is not null then inv.role_key end,
          case when first_user or inv.id is not null then 'active' else 'pending' end);

  if inv.id is not null then
    update invitations set accepted_by = new.id where id = inv.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in step when someone changes it through Supabase Auth
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Lets the sign-up form say "this mobile is already registered" before
-- creating the account. Returns only true/false.
create or replace function public.phone_available(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where phone = normalize_phone(p));
$$;

-- Admin-only guard on profile changes: people may edit their own name and
-- phone, but never their own role/status.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;          -- service role / SQL editor
  if not has_perm('users.manage') then
    if new.role_key is distinct from old.role_key or new.status is distinct from old.status
       or new.email is distinct from old.email or new.id <> auth.uid() then
      raise exception 'Not allowed to change role, status or email';
    end if;
  end if;
  if new.id = auth.uid() and (new.status <> 'active' or new.role_key is distinct from old.role_key)
     and old.role_key = 'admin'
     and not exists (select 1 from profiles where role_key = 'admin' and status = 'active' and id <> new.id) then
    raise exception 'You are the last admin — make someone else admin first';
  end if;
  new.phone := normalize_phone(new.phone);
  return new;
end $$;
drop trigger if exists guard on public.profiles;
create trigger guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ════════════════════════════════════════════════════════════════════
-- Views
-- ════════════════════════════════════════════════════════════════════

create or replace view public.product_stock with (security_invoker = true) as
select p.*,
       s.name as supplier_name,
       coalesce(m.on_hand, 0)                                         as on_hand,
       coalesce(m.on_hand, 0) * coalesce(p.purchase_price, 0)         as stock_value,
       m.last_movement_at,
       coalesce(m.on_hand, 0) <= p.reorder_level and p.active         as low_stock
from products p
left join suppliers s on s.id = p.supplier_id
left join (
  select product_id, sum(qty) as on_hand, max(created_at) as last_movement_at
  from stock_movements group by product_id
) m on m.product_id = p.id;

create or replace view public.movement_feed with (security_invoker = true) as
select m.*, p.sku, p.name as product_name, pr.full_name as created_by_name,
       pu.invoice_no
from stock_movements m
join products p on p.id = m.product_id
left join profiles pr on pr.id = m.created_by
left join purchases pu on pu.id = m.purchase_id;

-- ════════════════════════════════════════════════════════════════════
-- Business operations (atomic, permission-checked)
-- ════════════════════════════════════════════════════════════════════

-- Import a supplier invoice: creates the supplier/products if new, the
-- purchase with its lines, and one "purchase" stock movement per line.
-- payload = { supplier:{name,gstin,phone}, invoice_no, invoice_date, subtotal,
--             cgst, sgst, igst, other_charges, grand_total, notes, source,
--             file_path, update_prices:bool,
--             items:[{sku,name,pack,qty,unit_price,gst_amount,taxable_amount,gst_rate,line_no}] }
create or replace function public.import_purchase(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  sup_id uuid;
  pur_id uuid;
  it jsonb;
  prod_id uuid;
  upd boolean := coalesce((payload ->> 'update_prices')::boolean, true);
begin
  if not has_perm('stock.in') then raise exception 'Permission denied: stock.in'; end if;
  if coalesce(trim(payload ->> 'invoice_no'), '') = '' then raise exception 'Invoice number is required'; end if;
  if jsonb_array_length(coalesce(payload -> 'items', '[]')) = 0 then raise exception 'Invoice has no items'; end if;

  select id into sup_id from suppliers where lower(name) = lower(trim(payload #>> '{supplier,name}'));
  if sup_id is null then
    insert into suppliers (name, gstin, phone)
    values (trim(payload #>> '{supplier,name}'), payload #>> '{supplier,gstin}', payload #>> '{supplier,phone}')
    returning id into sup_id;
  end if;

  if exists (select 1 from purchases where supplier_id = sup_id and upper(invoice_no) = upper(trim(payload ->> 'invoice_no')) and status = 'posted') then
    raise exception 'Invoice % from this supplier is already imported', payload ->> 'invoice_no';
  end if;

  insert into purchases (supplier_id, invoice_no, invoice_date, subtotal, cgst, sgst, igst,
                         other_charges, grand_total, notes, source, file_path)
  values (sup_id, trim(payload ->> 'invoice_no'), nullif(payload ->> 'invoice_date', '')::date,
          (payload ->> 'subtotal')::numeric, (payload ->> 'cgst')::numeric, (payload ->> 'sgst')::numeric,
          (payload ->> 'igst')::numeric, coalesce((payload ->> 'other_charges')::numeric, 0),
          (payload ->> 'grand_total')::numeric, payload ->> 'notes', coalesce(payload ->> 'source', 'manual'),
          payload ->> 'file_path')
  returning id into pur_id;

  for it in select * from jsonb_array_elements(payload -> 'items') loop
    if coalesce((it ->> 'qty')::numeric, 0) <= 0 then continue; end if;
    select id into prod_id from products where upper(sku) = upper(trim(it ->> 'sku'));
    if prod_id is null then
      if not has_perm('products.edit') then
        raise exception 'New product % needs products.edit permission', it ->> 'sku';
      end if;
      insert into products (sku, name, pack, supplier_id, purchase_price, gst_rate)
      values (upper(trim(it ->> 'sku')), trim(it ->> 'name'), nullif(it ->> 'pack', ''), sup_id,
              (it ->> 'unit_price')::numeric, (it ->> 'gst_rate')::numeric)
      returning id into prod_id;
    elsif upd then
      update products set purchase_price = (it ->> 'unit_price')::numeric,
                          gst_rate = coalesce((it ->> 'gst_rate')::numeric, gst_rate),
                          supplier_id = coalesce(supplier_id, sup_id)
       where id = prod_id;
    end if;

    insert into purchase_items (purchase_id, product_id, line_no, qty, unit_price, gst_amount, taxable_amount, gst_rate)
    values (pur_id, prod_id, (it ->> 'line_no')::int, (it ->> 'qty')::numeric, (it ->> 'unit_price')::numeric,
            coalesce((it ->> 'gst_amount')::numeric, 0), (it ->> 'taxable_amount')::numeric, (it ->> 'gst_rate')::numeric);

    insert into stock_movements (product_id, qty, kind, unit_price, purchase_id, reference)
    values (prod_id, (it ->> 'qty')::numeric, 'purchase', (it ->> 'unit_price')::numeric, pur_id,
            'Invoice ' || trim(payload ->> 'invoice_no'));
  end loop;
  return pur_id;
end $$;

-- Void a purchase: reverses all its stock and marks it void (kept for history).
create or replace function public.void_purchase(p_id uuid, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare pur purchases%rowtype;
begin
  if not has_perm('stock.adjust') then raise exception 'Permission denied: stock.adjust'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into pur from purchases where id = p_id for update;
  if pur.id is null then raise exception 'Purchase not found'; end if;
  if pur.status = 'void' then raise exception 'Already void'; end if;
  insert into stock_movements (product_id, qty, kind, unit_price, purchase_id, reverses_id, reference, note)
  select m.product_id, -m.qty, 'reversal', m.unit_price, m.purchase_id, m.id,
         'Void invoice ' || pur.invoice_no, reason
  from stock_movements m
  where m.purchase_id = p_id and m.kind = 'purchase'
    and not exists (select 1 from stock_movements r where r.reverses_id = m.id);
  update purchases set status = 'void', void_reason = reason where id = p_id;
end $$;

-- Record several stock movements of one kind (sale, damage, adjustment …).
-- items = [{product_id, qty (positive number), unit_price}]
create or replace function public.record_movements(p_kind text, items jsonb, p_reference text, p_note text)
returns int language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  q numeric;
  sign int;
  need text;
  n int := 0;
  allow_negative boolean := coalesce((select (value)::text::boolean from settings where key = 'allow_negative_stock'), false);
  have numeric;
begin
  sign := case p_kind
            when 'opening' then 1 when 'return_in' then 1
            when 'sale' then -1 when 'return_out' then -1 when 'damage' then -1
            when 'expired' then -1 when 'sample' then -1 when 'transfer' then -1
            when 'adjustment' then 0
            else null end;
  if sign is null then raise exception 'Unknown movement kind %', p_kind; end if;
  need := case when p_kind in ('sale','return_in','sample','transfer') then 'stock.out'
               when p_kind = 'opening' then 'stock.in'
               else 'stock.adjust' end;
  if not has_perm(need) then raise exception 'Permission denied: %', need; end if;
  if p_kind in ('adjustment','damage','expired') and coalesce(trim(p_note), '') = '' then
    raise exception 'Please give a reason for this %', p_kind;
  end if;

  for it in select * from jsonb_array_elements(items) loop
    q := (it ->> 'qty')::numeric;
    if q is null or q = 0 then continue; end if;
    if sign <> 0 then q := abs(q) * sign; end if;     -- adjustments keep their own sign
    if q < 0 and not allow_negative then
      select coalesce(sum(qty), 0) into have from stock_movements where product_id = (it ->> 'product_id')::uuid;
      if have + q < 0 then
        raise exception 'Not enough stock for % (have %, need %)',
          (select name from products where id = (it ->> 'product_id')::uuid), have, -q;
      end if;
    end if;
    insert into stock_movements (product_id, qty, kind, unit_price, reference, note)
    values ((it ->> 'product_id')::uuid, q, p_kind, nullif(it ->> 'unit_price', '')::numeric, p_reference, p_note);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Nothing to record'; end if;
  return n;
end $$;

-- Physical stock count: you enter what is on the shelf, the system books
-- the difference as a "count" movement. items = [{product_id, counted}]
create or replace function public.apply_stock_count(items jsonb, p_note text)
returns int language plpgsql security definer set search_path = public as $$
declare it jsonb; have numeric; diff numeric; n int := 0;
begin
  if not has_perm('stock.adjust') then raise exception 'Permission denied: stock.adjust'; end if;
  for it in select * from jsonb_array_elements(items) loop
    if it ->> 'counted' is null or it ->> 'counted' = '' then continue; end if;
    select coalesce(sum(qty), 0) into have from stock_movements where product_id = (it ->> 'product_id')::uuid;
    diff := (it ->> 'counted')::numeric - have;
    if diff <> 0 then
      insert into stock_movements (product_id, qty, kind, reference, note)
      values ((it ->> 'product_id')::uuid, diff, 'count', 'Stock count', coalesce(p_note, '') ||
              format(' (system %s → counted %s)', have, it ->> 'counted'));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Undo one movement by booking its exact opposite.
create or replace function public.reverse_movement(m_id bigint, reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare m stock_movements%rowtype; new_id bigint;
begin
  if not has_perm('stock.adjust') then raise exception 'Permission denied: stock.adjust'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into m from stock_movements where id = m_id;
  if m.id is null then raise exception 'Movement not found'; end if;
  if m.kind = 'reversal' then raise exception 'A reversal cannot be reversed — record a new movement instead'; end if;
  if m.kind = 'purchase' then raise exception 'Void the whole invoice from Purchases instead'; end if;
  if exists (select 1 from stock_movements where reverses_id = m_id) then raise exception 'Already reversed'; end if;
  insert into stock_movements (product_id, qty, kind, unit_price, reverses_id, reference, note)
  values (m.product_id, -m.qty, 'reversal', m.unit_price, m.id, 'Reversal of #' || m.id, reason)
  returning id into new_id;
  return new_id;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════════
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles         enable row level security;
alter table public.invitations      enable row level security;
alter table public.suppliers        enable row level security;
alter table public.products         enable row level security;
alter table public.purchases        enable row level security;
alter table public.purchase_items   enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.settings         enable row level security;
alter table public.audit_log        enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Reference data every signed-in member can read
create policy read_roles on public.roles for select to authenticated using (true);
create policy read_perms on public.permissions for select to authenticated using (true);
create policy read_role_perms on public.role_permissions for select to authenticated using (true);
create policy manage_roles on public.roles for all to authenticated
  using (has_perm('users.manage')) with check (has_perm('users.manage'));
create policy manage_role_perms on public.role_permissions for all to authenticated
  using (has_perm('users.manage')) with check (has_perm('users.manage'));

-- Profiles: you always see yourself; user managers see everyone
create policy own_profile on public.profiles for select to authenticated
  using (id = auth.uid() or has_perm('users.manage') or (is_active_member() and status = 'active'));
create policy update_profile on public.profiles for update to authenticated
  using (id = auth.uid() or has_perm('users.manage'));

create policy invitations_admin on public.invitations for all to authenticated
  using (has_perm('users.manage')) with check (has_perm('users.manage'));

-- Catalogue & stock
create policy view_suppliers on public.suppliers for select to authenticated using (has_perm('inventory.view'));
create policy edit_suppliers on public.suppliers for insert to authenticated with check (has_perm('products.edit'));
create policy upd_suppliers on public.suppliers for update to authenticated using (has_perm('products.edit'));

create policy view_products on public.products for select to authenticated using (has_perm('inventory.view'));
create policy add_products on public.products for insert to authenticated with check (has_perm('products.edit'));
create policy upd_products on public.products for update to authenticated using (has_perm('products.edit'));

create policy view_purchases on public.purchases for select to authenticated using (has_perm('purchases.view'));
create policy upd_purchases on public.purchases for update to authenticated using (has_perm('stock.in'));
create policy view_purchase_items on public.purchase_items for select to authenticated using (has_perm('purchases.view'));

create policy view_movements on public.stock_movements for select to authenticated using (has_perm('inventory.view'));
-- no insert/update/delete policies: movements are written only by the functions above

create policy read_settings on public.settings for select to authenticated using (is_active_member());
create policy write_settings on public.settings for all to authenticated
  using (has_perm('users.manage')) with check (has_perm('users.manage'));

create policy view_audit on public.audit_log for select to authenticated using (has_perm('audit.view'));

-- Functions callable by signed-in users (each checks permissions itself)
revoke all on function public.import_purchase(jsonb) from public, anon;
revoke all on function public.void_purchase(uuid, text) from public, anon;
revoke all on function public.record_movements(text, jsonb, text, text) from public, anon;
revoke all on function public.apply_stock_count(jsonb, text) from public, anon;
revoke all on function public.reverse_movement(bigint, text) from public, anon;
grant execute on function public.import_purchase(jsonb) to authenticated;
grant execute on function public.void_purchase(uuid, text) to authenticated;
grant execute on function public.record_movements(text, jsonb, text, text) to authenticated;
grant execute on function public.apply_stock_count(jsonb, text) to authenticated;
grant execute on function public.reverse_movement(bigint, text) to authenticated;
grant execute on function public.phone_available(text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Product photos bucket (public read, upload needs products.edit)
-- ════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false)
on conflict (id) do nothing;

drop policy if exists "product images upload" on storage.objects;
create policy "product images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_perm('products.edit'));
drop policy if exists "product images update" on storage.objects;
create policy "product images update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_perm('products.edit'));
drop policy if exists "invoice files upload" on storage.objects;
create policy "invoice files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and public.has_perm('stock.in'));
drop policy if exists "invoice files read" on storage.objects;
create policy "invoice files read" on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and public.has_perm('purchases.view'));

-- ════════════════════════════════════════════════════════════════════
-- Default roles & permissions (edit these later from the Team screen)
-- ════════════════════════════════════════════════════════════════════
insert into public.permissions (key, label, sort) values
  ('inventory.view', 'See products and stock levels', 10),
  ('products.edit',  'Add / edit products, prices, photos', 20),
  ('stock.in',       'Receive stock & import invoices', 30),
  ('stock.out',      'Record sales / stock going out', 40),
  ('stock.adjust',   'Adjust, count, write off, undo entries', 50),
  ('purchases.view', 'See purchase invoices and costs', 60),
  ('reports.view',   'See stock value & reports', 70),
  ('audit.view',     'See full change history', 80),
  ('users.manage',   'Approve people, assign roles, change permissions', 90)
on conflict (key) do update set label = excluded.label, sort = excluded.sort;

insert into public.roles (key, name, description, is_system) values
  ('admin',   'Admin',   'Full control including people and permissions', true),
  ('manager', 'Manager', 'Runs the stock: imports, edits, adjustments, reports', false),
  ('staff',   'Staff',   'Day-to-day: sees stock, records sales, receives goods', false),
  ('viewer',  'Viewer',  'Read-only access to stock levels', false)
on conflict (key) do nothing;

insert into public.role_permissions (role_key, permission_key)
select 'admin', key from public.permissions
on conflict do nothing;
insert into public.role_permissions (role_key, permission_key)
select 'manager', key from public.permissions where key <> 'users.manage'
on conflict do nothing;
insert into public.role_permissions (role_key, permission_key)
select 'staff', key from public.permissions where key in ('inventory.view','stock.out','stock.in')
on conflict do nothing;
insert into public.role_permissions (role_key, permission_key)
values ('viewer', 'inventory.view')
on conflict do nothing;

insert into public.settings (key, value) values ('allow_negative_stock', 'false')
on conflict (key) do nothing;

insert into public.suppliers (name, gstin, phone, address)
values ('EBC EMPIRE BIZCORP PVT LTD', '33AAFCE8079F1ZJ', '7540022800',
        'No.76, Thendral Nagar, Thiruvarur, Tamil Nadu, India, 610001')
on conflict do nothing;
