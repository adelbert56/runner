-- Personal training data is a separate private surface from the public
-- GitHub Pages content. The browser encrypts the payload before it reaches
-- this table; the database only stores a versioned encrypted envelope.

create table if not exists public.training_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  payload jsonb not null,
  checksum text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.training_snapshots enable row level security;

-- New tables are not automatically exposed by this project's Data API policy.
-- Only authenticated sessions receive table privileges; the policies below then
-- narrow every operation to auth.uid().
grant select, insert, update on table public.training_snapshots to authenticated;

drop policy if exists "Users can read their own training snapshot" on public.training_snapshots;
create policy "Users can read their own training snapshot"
  on public.training_snapshots for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own training snapshot" on public.training_snapshots;
create policy "Users can create their own training snapshot"
  on public.training_snapshots for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own training snapshot" on public.training_snapshots;
create policy "Users can update their own training snapshot"
  on public.training_snapshots for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
