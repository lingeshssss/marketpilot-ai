-- MarketPilot AI — initial schema
-- Auth tables follow Better Auth 1.7 core schema (generated with getMigrations()).

create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
create table "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);
create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
create table "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

-- ---------------- user data ----------------

create table user_preferences (
  user_id text primary key references "user"(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  ticker_motion boolean not null default true,
  default_chart text not null default 'line' check (default_chart in ('line','candle')),
  notify_inapp boolean not null default true,
  notify_email boolean not null default false,
  demo_opt_in boolean not null default false,
  updated_at timestamptz not null default now()
);

create table watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
create index watchlists_user_idx on watchlists(user_id, position);

create table watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references watchlists(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.\-]{0,9}$'),
  instrument_id text,
  note text not null default '' check (length(note) <= 500),
  position integer not null default 0,
  added_at timestamptz not null default now(),
  unique (watchlist_id, symbol)
);
create index watchlist_items_list_idx on watchlist_items(watchlist_id, position);
create index watchlist_items_user_idx on watchlist_items(user_id);

create table portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  kind text not null default 'actual' check (kind in ('actual','simulated')),
  base_currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
create index portfolios_user_idx on portfolios(user_id);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  seq bigserial,
  type text not null check (type in ('buy','sell','dividend','deposit','withdrawal','split','fee')),
  symbol text check (symbol is null or symbol ~ '^[A-Z][A-Z0-9.\-]{0,9}$'),
  trade_date date not null,
  quantity numeric(28,10),
  price numeric(24,10),
  fees numeric(24,10) not null default 0,
  amount numeric(24,10),
  split_from numeric(20,10),
  split_to numeric(20,10),
  note text not null default '' check (length(note) <= 500),
  fingerprint text not null,
  source text not null default 'manual' check (source in ('manual','csv')),
  created_at timestamptz not null default now()
);
create index transactions_portfolio_idx on transactions(portfolio_id, trade_date, seq);
create index transactions_user_idx on transactions(user_id);
create index transactions_fp_idx on transactions(portfolio_id, fingerprint);

create table alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z][A-Z0-9.\-]{0,9}$'),
  timeframe text not null default '1D' check (timeframe in ('1D','live')),
  kind text not null,
  threshold numeric(24,10) not null,
  channels text[] not null default array['inapp'],
  enabled boolean not null default true,
  cooldown_minutes integer not null default 1440,
  state jsonb not null default '{}'::jsonb,
  state_version integer not null default 0,
  last_evaluated_at timestamptz,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index alert_rules_user_idx on alert_rules(user_id);
create index alert_rules_enabled_idx on alert_rules(enabled, symbol) where enabled;

create table alert_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references alert_rules(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  symbol text not null,
  observation_key text not null,
  observed_value numeric(24,10) not null,
  threshold numeric(24,10) not null,
  kind text not null,
  data_as_of timestamptz,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (rule_id, observation_key)
);
create index alert_events_user_idx on alert_events(user_id, created_at desc);

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references alert_events(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  channel text not null check (channel in ('inapp','email')),
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  is_test boolean not null default false,
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index deliveries_event_channel_uq on deliveries(event_id, channel) where event_id is not null;
create index deliveries_pending_idx on deliveries(status, next_attempt_at) where status = 'pending';
create index deliveries_user_idx on deliveries(user_id, created_at desc);

create table saved_screens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  definition jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table analysis_history (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  symbol text not null,
  timeframe text not null,
  analysis_id text not null,
  cache_key text not null,
  model text not null,
  prompt_version text not null,
  status text not null check (status in ('succeeded','failed','rejected')),
  output jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index analysis_history_user_idx on analysis_history(user_id, created_at desc);

create table ai_cache (
  cache_key text primary key,
  output jsonb not null,
  created_at timestamptz not null default now()
);

create table ai_usage (
  scope text not null,          -- user id or '__global__'
  day date not null,
  count integer not null default 0,
  primary key (scope, day)
);

-- ---------------- shared market data ----------------

create table market_cache (
  key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index market_cache_expires_idx on market_cache(expires_at);

create table daily_bars (
  symbol text not null,
  date date not null,
  o numeric(24,10) not null, h numeric(24,10) not null, l numeric(24,10) not null, c numeric(24,10) not null,
  v numeric(24,2) not null,
  source text not null,
  fetched_at timestamptz not null default now(),
  primary key (symbol, date)
);
create index daily_bars_date_idx on daily_bars(date);

create table grouped_days (
  date date primary key,
  source text not null,
  result_count integer not null,
  fetched_at timestamptz not null default now()
);

create table instruments (
  symbol text primary key,
  instrument_id text,
  name text,
  exchange text,
  type text,
  currency text,
  market_cap numeric(28,2),
  sector text,
  payload jsonb,
  updated_at timestamptz not null default now()
);

create table provider_calls (
  provider text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (provider, window_start)
);

create table scan_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of date not null,
  universe_version text not null,
  analysis_version text not null,
  computed_at timestamptz not null default now(),
  coverage jsonb not null,
  rows jsonb not null
);
create index scan_snapshots_recent_idx on scan_snapshots(computed_at desc);

create table job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  trigger text not null default 'cron',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','succeeded','failed','skipped')),
  stats jsonb not null default '{}'::jsonb,
  error text
);
create index job_runs_recent_idx on job_runs(job, started_at desc);

create table api_rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

-- Development/test-only mail sink (EMAIL_TRANSPORT=outbox, refused in production).
create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_address text not null,
  subject text not null,
  body text not null,
  kind text not null,
  created_at timestamptz not null default now()
);
