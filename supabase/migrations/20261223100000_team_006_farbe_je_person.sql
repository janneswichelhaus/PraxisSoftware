-- =============================================================================
-- TEAM-006: Eine Farbe je Person im Teamchat (Auftrag Jannes 2026-10-19,
-- ANN-666)
--
-- Jede Person im Team trägt eine Farbe aus einer festen Reihe von acht. Sie
-- steht hinter den Initialen, solange kein Profilbild da ist, und als Umriss
-- um ein Profilbild (TEAM-007). Sie hilft, Personen im Verlauf auseinanderzu-
-- halten, und sagt sonst nichts - kein Status, keine Rolle, keine Leistung
-- (§20); neben ihr steht immer der Name (DESIGN.md Regel 5).
--
-- Vergeben wird mit dem Mitarbeiterdatensatz: die erste Farbe der Reihe, die
-- keine andere aktive Person der Praxis trägt; sind alle vergeben, die
-- seltenste. Ändern kann sie nur die Person selbst, nur aus der Reihe; doppelt
-- vergeben ist erlaubt. Gelesen wird über list_team_avatars - wer am Teamchat
-- teilnimmt, für die eigene Praxis.
--
--   public.staff_colors           Farbe je Mitarbeiterdatensatz
--   public.list_team_avatars      Farben der Praxis (TEAM-007: + Profilbild)
--   public.set_own_team_color     eigene Farbe wählen
--
-- Kein Tabellenrecht (ADR-004), kein Auditeintrag (ADR-010 Punkte 15 bis 17).
-- Funktionen, die nur intern laufen, tragen kein „team“ im Namen und sind
-- allen Rollen entzogen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Reihe
-- -----------------------------------------------------------------------------
-- Dieselben Schlüssel wie die Tokens `--color-person-*` in src/index.css; die
-- Reihenfolge ist die Vergabe und wird nie umgewälzt.
create function app.staff_color_palette()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['tanne', 'ozean', 'pflaume', 'moos', 'veilchen', 'petrol', 'schiefer', 'nacht']
$$;

revoke all on function app.staff_color_palette() from public, anon, authenticated;

comment on function app.staff_color_palette() is
  'TEAM-006 (ANN-666): die acht Farben für Personen im Teamchat in der Reihenfolge der Vergabe. Die einzige Stelle, an der die Schlüssel stehen; die Werte stehen in src/index.css (--color-person-*).';

-- -----------------------------------------------------------------------------
-- 2. Tabelle
-- -----------------------------------------------------------------------------
create table public.staff_colors (
  staff_member_id uuid primary key references public.staff_members (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  color           text not null check (color = any (app.staff_color_palette()))
);

comment on table public.staff_colors is
  'TEAM-006 (ANN-666): Farbe einer Person im Teamchat - hinter den Initialen oder als Umriss um das Profilbild. Vergeben mit dem Mitarbeiterdatensatz, geändert nur von der Person selbst. Datenklasse beschaeftigtendaten, fällt mit dem Mitarbeiterdatensatz (cascade). Kein Tabellenrecht.';

create index staff_colors_organization_id_idx on public.staff_colors (organization_id);

alter table public.staff_colors enable row level security;
revoke all on public.staff_colors from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Vergabe
-- -----------------------------------------------------------------------------
-- Die erste Farbe der Reihe, die keine andere aktive Person der Praxis trägt;
-- sonst die seltenste, bei Gleichstand die frühere in der Reihe.
create function app.next_staff_color(p_org uuid, p_staff uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select f.farbe
  from unnest(app.staff_color_palette()) with ordinality as f(farbe, reihe)
  order by (
             select count(*)
             from public.staff_colors c
             join public.staff_members sm on sm.id = c.staff_member_id
             where c.organization_id = p_org and c.color = f.farbe
               and sm.employment_status = 'active' and sm.id <> p_staff
           ),
           f.reihe
  limit 1
$$;

revoke all on function app.next_staff_color(uuid, uuid) from public, anon, authenticated;

create function app.staff_colors_assign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.staff_colors (staff_member_id, organization_id, color)
  values (new.id, new.organization_id, app.next_staff_color(new.organization_id, new.id))
  on conflict (staff_member_id) do nothing;
  return null;
end;
$$;

revoke all on function app.staff_colors_assign() from public, anon, authenticated;

create trigger staff_members_color
  after insert on public.staff_members
  for each row execute function app.staff_colors_assign();

-- Bestand: in der Reihenfolge, in der die Personen dazukamen.
do $$
declare
  v_sm record;
begin
  for v_sm in
    select sm.id, sm.organization_id from public.staff_members sm order by sm.created_at, sm.id
  loop
    insert into public.staff_colors (staff_member_id, organization_id, color)
    values (v_sm.id, v_sm.organization_id, app.next_staff_color(v_sm.organization_id, v_sm.id))
    on conflict (staff_member_id) do nothing;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Lesen und wählen
-- -----------------------------------------------------------------------------
-- Alle Mitarbeiterdatensätze der Praxis, auch Ausgeschiedene: Ihre älteren
-- Nachrichten stehen noch im Verlauf. Nur Kennung und Farbe - der Name kommt
-- mit der Nachricht.
create function public.list_team_avatars()
returns table (staff_member_id uuid, color text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();

  return query
  select sm.id, coalesce(c.color, 'schiefer')
  from public.staff_members sm
  left join public.staff_colors c on c.staff_member_id = sm.id
  where sm.organization_id = v_org
  order by sm.id;
end;
$$;

create function public.set_own_team_color(p_color text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if p_color is null or not (p_color = any (app.staff_color_palette())) then
    raise exception 'unknown color' using errcode = '22023';
  end if;

  insert into public.staff_colors (staff_member_id, organization_id, color)
  values (v_staff, v_org, p_color)
  on conflict (staff_member_id) do update set color = excluded.color;
end;
$$;

revoke all on function public.list_team_avatars() from public, anon;
revoke all on function public.set_own_team_color(text) from public, anon;
grant execute on function public.list_team_avatars() to authenticated;
grant execute on function public.set_own_team_color(text) to authenticated;

comment on function public.list_team_avatars() is
  'TEAM-006 (ANN-666): Farbe je Mitarbeiterdatensatz der eigenen Praxis, für alle, die am Teamchat teilnehmen.';
comment on function public.set_own_team_color(text) is
  'TEAM-006 (ANN-666): die eigene Farbe aus der Reihe wählen - nur für sich selbst.';

-- -----------------------------------------------------------------------------
-- 5. Datenklasse (ADR-008)
-- -----------------------------------------------------------------------------
insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('staff_colors', 'beschaeftigtendaten', 'ueber_elterndatensatz',
   'Farbe im Teamchat (TEAM-006): fällt mit dem Mitarbeiterdatensatz (cascade).',
   185);
