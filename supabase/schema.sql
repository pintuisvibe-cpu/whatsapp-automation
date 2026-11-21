-- ============================================================================
-- Sales Reply AI — Full System Database Schema (Supabase / PostgreSQL)
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Project: sales-reply-ai-whatsapp (Singapore / ap-southeast-1)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. AI Settings (one row per user)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  provider text not null default 'gemini',
  model text not null default 'gemini-2.5-flash',
  api_key text not null default '',
  system_prompt text not null default '',
  business_knowledge text not null default '',
  reply_delay_ms integer not null default 1500,
  ignore_groups boolean not null default true,
  max_history integer not null default 10,
  plan_id text not null default 'free_trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Product Catalog (AI knowledge injection)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  price text not null,
  stock_status text not null default 'In Stock',
  description text not null default '',
  image_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_products_user on public.ai_products(user_id);

-- ---------------------------------------------------------------------------
-- 3. WhatsApp Sessions + Baileys Auth Keys (Render free-plan persistence)
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'disconnected',
  phone_number text,
  push_name text,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_auth_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  key_id text not null,
  value_json jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key_id)
);

-- ---------------------------------------------------------------------------
-- 4. Unified Message Log (WhatsApp + Facebook Messenger)
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  remote_jid text not null,          -- WhatsApp JID or fb:<senderId>
  message_id text,
  direction text not null,           -- incoming | outgoing
  message_text text not null default '',
  channel text not null default 'whatsapp', -- whatsapp | facebook
  created_at timestamptz not null default now()
);
create index if not exists idx_wa_messages_user_time
  on public.whatsapp_messages(user_id, created_at desc);
create index if not exists idx_wa_messages_jid
  on public.whatsapp_messages(user_id, remote_jid, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Website Live-Chat Widget
-- ---------------------------------------------------------------------------
create table if not exists public.widget_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  label text not null default 'Default Widget',
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_widget_tokens_user on public.widget_tokens(user_id);

create table if not exists public.widget_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  visitor_id text not null,
  visitor_name text not null default '',
  visitor_phone text not null default '',
  visitor_email text not null default '',
  last_page_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, visitor_id)
);

create table if not exists public.widget_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.widget_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null,           -- incoming (visitor) | outgoing (bot)
  content text not null default '',
  message_type text not null default 'text', -- text | image | audio
  media_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_widget_messages_conv
  on public.widget_messages(conversation_id, created_at asc);

-- ---------------------------------------------------------------------------
-- 6. Facebook Messenger Pages
-- ---------------------------------------------------------------------------
create table if not exists public.facebook_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id text not null unique,
  page_name text not null default '',
  page_access_token text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. Orders (AI takes orders automatically; merchant fulfils them)
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_address text not null default '',
  items jsonb not null default '[]'::jsonb,
  total_amount text not null default '',
  status text not null default 'pending', -- pending | confirmed | shipped | delivered | cancelled
  channel text not null default 'whatsapp',
  courier_tracking_id text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_user_time on public.orders(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. Subscriptions (plan usage + expiry)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id text not null default 'free_trial',
  status text not null default 'active', -- active | expired | cancelled
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 9. Row Level Security — server uses SERVICE_ROLE key (bypasses RLS),
--    but enable RLS + permissive policies so the anon key can never leak data.
-- ---------------------------------------------------------------------------
alter table public.ai_settings enable row level security;
alter table public.ai_products enable row level security;
alter table public.whatsapp_sessions enable row level security;
alter table public.whatsapp_auth_keys enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.widget_tokens enable row level security;
alter table public.widget_conversations enable row level security;
alter table public.widget_messages enable row level security;
alter table public.facebook_pages enable row level security;
alter table public.orders enable row level security;
alter table public.subscriptions enable row level security;

-- No public policies are created on purpose: all access goes through the
-- Express backend with the service-role key + JWT verification (requireAuth).

-- ---------------------------------------------------------------------------
-- 10. Auto-create a free-trial subscription + default AI settings on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, plan_id, status, expires_at)
  values (new.id, 'free_trial', 'active', now() + interval '3 days')
  on conflict (user_id) do nothing;

  insert into public.ai_settings (user_id, plan_id)
  values (new.id, 'free_trial')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
