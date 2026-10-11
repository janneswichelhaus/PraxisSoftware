-- =============================================================================
-- BEF-144 (Hinweis Zweitreview BEF-132): Zweimal gleichzeitig erledigen
-- ueberschreibt nicht mehr still den ersten Vermerk
--
-- `close_platform_message_by_practice` und `close_platform_message` lasen den
-- Zustand ohne Sperre und schrieben dann. Erledigten Praxis und Person (oder
-- zwei Beschaeftigte) denselben Vorgang zur selben Zeit, gingen beide durch
-- die Pruefung; das zweite Update ueberschrieb `closed_at`, `closed_by` und
-- `closed_by_side` des ersten - am Vorgang stand dann, wer zuletzt kam, nicht
-- wer erledigt hat (ADR-010 Fassung 3 Punkt 15: der Nachweis steht am
-- Datensatz).
--
-- Jetzt sperren beide Funktionen die Zeile vor der Zustandspruefung, wie seit
-- BEF-132 Nachtrag, Antwort und Anhang. Das zweite Erledigen endet mit 22023
-- "message is closed"; der erste Vermerk bleibt.
--
-- Signaturen, Rechte und Kommentare unveraendert; create or replace genuegt.
-- Rumpf sonst unveraendert aus 20261020110000_kom_002_practice_messages.sql
-- und 20261020100000_kom_001_platform_messages.sql.
-- =============================================================================

create or replace function public.close_platform_message_by_practice(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vorgang public.platform_messages%rowtype;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'not allowed to close platform messages' using errcode = '42501';
  end if;
  -- BEF-144: erst die Zeile sperren, dann den Zustand lesen (wie BEF-132).
  perform 1 from public.platform_messages m
  where m.id = p_message_id and m.organization_id = app.current_organization_id()
  for update;
  v_vorgang := app.practice_message(p_message_id, true);
  if v_vorgang.status = 'closed' then
    raise exception 'message is closed' using errcode = '22023';
  end if;

  update public.platform_messages m
     set status = 'closed', due_on = null, closed_at = now(), closed_by = auth.uid(),
         closed_by_side = 'practice'
   where m.id = v_vorgang.id;
end;
$$;

create or replace function public.close_platform_message(p_access_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_vorgang public.platform_messages%rowtype;
begin
  v_zugang := app.assert_platform_message(p_access_id);
  -- BEF-144: erst die Zeile sperren, dann den Zustand lesen (wie BEF-132).
  perform 1 from public.platform_messages m
  where m.id = p_message_id and m.organization_id = v_zugang.organization_id
  for update;
  v_vorgang := app.platform_open_message(p_access_id, p_message_id);

  update public.platform_messages m
     set status = 'closed',
         due_on = null,
         closed_at = now(),
         closed_by = auth.uid(),
         closed_by_side = 'person'
   where m.id = v_vorgang.id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'message')
  );
end;
$$;
