# Supabase setup — Maritime Affairs editorial

Paste these SQL blocks into **Supabase → SQL Editor → New query** and run them once.
Order matters: run §1, then §2, then §3.

---

## §1 — Articles table (skip if you already have it)

```sql
create table if not exists public.articles (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  slug          text unique,
  unit          text,
  author        text,
  image_url     text,
  read_min      int  default 5,
  summary       text,
  content       text,
  published     boolean default false,
  published_at  timestamptz,
  updated_at    timestamptz default now(),
  created_at    timestamptz default now()
);

-- keep updated_at fresh on every change
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_articles_touch on public.articles;
create trigger trg_articles_touch
  before update on public.articles
  for each row execute function public.touch_updated_at();
```

---

## §2 — Row Level Security (the part the editor needs)

```sql
alter table public.articles enable row level security;

-- Public visitors: see ONLY published articles
drop policy if exists "public reads published" on public.articles;
create policy "public reads published"
  on public.articles for select
  to anon
  using (published = true);

-- Editors (anyone signed in) can read EVERYTHING — drafts included
drop policy if exists "auth reads all" on public.articles;
create policy "auth reads all"
  on public.articles for select
  to authenticated
  using (true);

-- Editors can insert / update / delete
drop policy if exists "auth writes" on public.articles;
create policy "auth writes"
  on public.articles for insert
  to authenticated
  with check (true);

drop policy if exists "auth updates" on public.articles;
create policy "auth updates"
  on public.articles for update
  to authenticated
  using (true) with check (true);

drop policy if exists "auth deletes" on public.articles;
create policy "auth deletes"
  on public.articles for delete
  to authenticated
  using (true);
```

> If you want **only specific people** (not every signed-in user) to be able to edit, replace `to authenticated using (true)` with `to authenticated using (auth.jwt() ->> 'email' in ('you@domain.com','colleague@domain.com'))` on the write policies.

---

## §3 — Storage bucket for cover images (optional but recommended)

```sql
-- Create a public bucket for article cover images
insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do nothing;

-- Anyone can read
drop policy if exists "public read article-images" on storage.objects;
create policy "public read article-images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'article-images');

-- Signed-in editors can upload / replace / delete
drop policy if exists "auth write article-images" on storage.objects;
create policy "auth write article-images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'article-images');

drop policy if exists "auth update article-images" on storage.objects;
create policy "auth update article-images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'article-images');

drop policy if exists "auth delete article-images" on storage.objects;
create policy "auth delete article-images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'article-images');
```

---

## §4 — Create your editor user

In the Supabase dashboard:

1. **Authentication → Users → Add user → Create new user**
2. Enter email + password, **tick "Auto Confirm User"** (so you don't need to click an email link)
3. Click **Create user**

You can repeat for every editor. Each one will be able to sign in at `admin/index.html`.

> **Optional — turn off public sign-ups:** Authentication → Providers → Email → toggle **"Enable Sign Ups"** off. Now only users you manually create can log in.

---

## §5 — Verify it works

1. Open `admin/index.html` in the project preview.
2. Sign in with the email + password you just created.
3. You should land on the article list. Click **+ New article** → write something → **Save & publish**.
4. Open `publications.html` — the article appears.
