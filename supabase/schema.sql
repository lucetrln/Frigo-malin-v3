-- À exécuter une seule fois dans Supabase : SQL Editor > New query > coller > Run.
-- Une ligne par utilisateur, contenant son frigo, ses préférences et son menu.

create table if not exists public.frigo_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  fridge jsonb not null default '{}'::jsonb,
  prefs jsonb not null default '{}'::jsonb,
  selected jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Chaque utilisateur ne peut lire et modifier que sa propre ligne.
alter table public.frigo_data enable row level security;

create policy "Lecture de ses propres données"
  on public.frigo_data for select
  using (auth.uid() = user_id);

create policy "Création de ses propres données"
  on public.frigo_data for insert
  with check (auth.uid() = user_id);

create policy "Modification de ses propres données"
  on public.frigo_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
