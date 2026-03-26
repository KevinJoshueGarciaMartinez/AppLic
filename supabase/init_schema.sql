-- Base schema for AppLic ERP MVP
-- Run this in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  full_name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  sale_date date not null default current_date,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  payment_method text not null default 'efectivo',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  request_type text not null,
  status text not null default 'abierto',
  priority text not null default 'media',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_status_check check (status in ('abierto', 'en_proceso', 'cerrado')),
  constraint service_priority_check check (priority in ('baja', 'media', 'alta'))
);

create index if not exists idx_customers_owner_id on public.customers(owner_id);
create index if not exists idx_sales_owner_id on public.sales(owner_id);
create index if not exists idx_sales_customer_id on public.sales(customer_id);
create index if not exists idx_service_requests_owner_id on public.service_requests(owner_id);
create index if not exists idx_service_requests_customer_id on public.service_requests(customer_id);

alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.service_requests enable row level security;

drop policy if exists customers_select_own on public.customers;
drop policy if exists customers_insert_own on public.customers;
drop policy if exists customers_update_own on public.customers;
drop policy if exists customers_delete_own on public.customers;

create policy customers_select_own on public.customers
for select using (auth.uid() = owner_id);

create policy customers_insert_own on public.customers
for insert with check (auth.uid() = owner_id);

create policy customers_update_own on public.customers
for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy customers_delete_own on public.customers
for delete using (auth.uid() = owner_id);

drop policy if exists sales_select_own on public.sales;
drop policy if exists sales_insert_own on public.sales;
drop policy if exists sales_update_own on public.sales;
drop policy if exists sales_delete_own on public.sales;

create policy sales_select_own on public.sales
for select using (auth.uid() = owner_id);

create policy sales_insert_own on public.sales
for insert with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.customers c
    where c.id = customer_id and c.owner_id = auth.uid()
  )
);

create policy sales_update_own on public.sales
for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy sales_delete_own on public.sales
for delete using (auth.uid() = owner_id);

drop policy if exists service_requests_select_own on public.service_requests;
drop policy if exists service_requests_insert_own on public.service_requests;
drop policy if exists service_requests_update_own on public.service_requests;
drop policy if exists service_requests_delete_own on public.service_requests;

create policy service_requests_select_own on public.service_requests
for select using (auth.uid() = owner_id);

create policy service_requests_insert_own on public.service_requests
for insert with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.customers c
    where c.id = customer_id and c.owner_id = auth.uid()
  )
);

create policy service_requests_update_own on public.service_requests
for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy service_requests_delete_own on public.service_requests
for delete using (auth.uid() = owner_id);
