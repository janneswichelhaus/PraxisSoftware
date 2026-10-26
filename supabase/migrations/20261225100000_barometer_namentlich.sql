-- Das Barometer ist namentlich und gilt ab der ersten beschäftigten Person (Jannes, 2026-10-26;
-- PROJECT_PRINCIPLES.md §20.2 Nr. 1 und 4, ANN-607). Wahl und Praxissumme ab drei Beschäftigten
-- und fünf Antworten bleiben der Rückmeldung an die Praxisleitung (ANN-608).

-- Anonyme Barometer zeigt kein Weg mehr; sie und ihre Blöcke fallen.
delete from public.staff_feedback where kind = 'barometer' and staff_member_id is null;
delete from public.staff_feedback_blocks where kind = 'barometer';

alter table public.staff_feedback
  add constraint staff_feedback_barometer_named
  check (kind <> 'barometer' or staff_member_id is not null);

alter table public.staff_feedback_blocks drop constraint staff_feedback_blocks_kind_check;
alter table public.staff_feedback_blocks
  add constraint staff_feedback_blocks_kind_check check (kind = 'message');

drop function public.submit_staff_barometer(boolean, integer, integer, integer, text, text);

create function public.submit_staff_barometer(
  p_mood integer, p_tours integer, p_team integer, p_easier text, p_more text
)
returns jsonb
language plpgsql security definer
set search_path to ''
as $$
declare
  v_wer    record;
  v_monat  date;
  v_easier text;
  v_more   text;
begin
  select * into v_wer from app.staff_feedback_giver();
  if (p_mood is not null and p_mood not between 1 and 9)
     or (p_tours is not null and p_tours not between 1 and 9)
     or (p_team is not null and p_team not between 1 and 9) then
    raise exception 'scale value out of range' using errcode = '22023';
  end if;
  v_easier := app.staff_feedback_text(p_easier);
  v_more := app.staff_feedback_text(p_more);
  if num_nonnulls(p_mood, p_tours, p_team, v_easier, v_more) = 0 then
    raise exception 'feedback is empty' using errcode = '22023';
  end if;
  v_monat := app.staff_feedback_month(v_wer.o_org);

  -- Einmal je Person und Monat sichert der eindeutige Index: Von zwei gleichzeitigen Abgaben
  -- wartet die zweite auf die erste und schreibt dann nichts.
  insert into public.staff_feedback (
    organization_id, kind, month, staff_member_id, submitted_at,
    mood, tours, team, easier_text, more_text
  )
  values (
    v_wer.o_org, 'barometer', v_monat, v_wer.o_staff, now(),
    p_mood, p_tours, p_team, v_easier, v_more
  )
  on conflict (staff_member_id, month) where kind = 'barometer' and staff_member_id is not null
  do nothing;
  if not found then
    raise exception 'barometer already submitted' using errcode = '23505';
  end if;

  return jsonb_build_object('month', v_monat);
end;
$$;

comment on function public.submit_staff_barometer(integer, integer, integer, text, text) is 'Das Barometer des laufenden Monats abgeben - einmal je Person und Monat, immer mit Namen und Zeitpunkt; nie owner (§20.2 Nr. 1, ANN-607). owner liest jede Antwort einzeln über public.list_staff_feedback_named. Kein Auditeintrag.';

revoke all on function public.submit_staff_barometer(integer, integer, integer, text, text) from public, anon;
grant execute on function public.submit_staff_barometer(integer, integer, integer, text, text) to authenticated;

create or replace function public.get_my_staff_feedback_status()
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $$
declare
  v_org    uuid;
  v_staff  uuid;
  v_monat  date;
  v_kann   boolean;
begin
  v_org := app.staff_request_org(
    app.has_any_role('owner', 'team_lead', 'office', 'therapist', 'trainer'),
    'not allowed to read staff feedback status');
  v_monat := app.staff_feedback_month(v_org);
  v_kann := app.can_give_staff_feedback();
  if v_kann then
    select sm.id into v_staff
    from public.staff_members sm
    where sm.id = app.own_staff_member(v_org) and sm.employment_status = 'active';
    v_kann := v_staff is not null;
  end if;
  return jsonb_build_object(
    'can_take_part', v_kann,
    'can_read', app.can_read_staff_feedback(),
    'month', v_monat,
    'barometer_submitted', v_kann and exists (
      select 1 from public.staff_feedback f
      where f.staff_member_id = v_staff and f.kind = 'barometer' and f.month = v_monat)
  );
end;
$$;

comment on function public.get_my_staff_feedback_status() is 'Der eigene Stand - nimmt die Person teil, liest sie, und hat sie das Barometer dieses Monats abgegeben (ANN-607). Nur über sich selbst.';

create or replace function public.get_staff_feedback_summary()
returns jsonb
language plpgsql security definer
set search_path to ''
as $$
declare
  v_org     uuid;
  v_von     date;
  v_bis     date;
  v_soll    integer;
  v_nachr   jsonb := jsonb_build_object('status', 'too_few');
begin
  v_org := app.staff_request_org(app.can_read_staff_feedback(), 'not allowed to read staff feedback');
  if app.staff_feedback_eligible_count(v_org) < (app.staff_feedback_threshold()).o_eligible then
    return jsonb_build_object('messages', v_nachr);
  end if;

  select o_von, o_bis, o_antworten into v_von, v_bis, v_soll
  from app.staff_feedback_window(v_org, 'message');
  if v_von is not null then
    select jsonb_build_object(
             'status', 'ready',
             'from_month', v_von,
             'to_month', v_bis,
             'answers', count(*),
             'texts', jsonb_agg(f.message_text order by f.message_text)
           )
      into v_nachr
    from public.staff_feedback f
    where f.organization_id = v_org and f.kind = 'message' and f.staff_member_id is null
      and f.month between v_von and v_bis;
    -- Liegt ein Teil des Blocks schon hinter der Frist, fehlen Antworten:
    -- dann nichts - die Differenz verriete den gelöschten Monat.
    if (v_nachr ->> 'answers')::integer <> v_soll then
      v_nachr := jsonb_build_object('status', 'too_few');
    end if;
  end if;

  return jsonb_build_object('messages', v_nachr);
end;
$$;

comment on function public.get_staff_feedback_summary() is 'Praxissumme der anonymen Rückmeldungen an die Praxisleitung - nur owner; Texte gemischt; nur mit drei Beschäftigten, die teilnehmen können, und fünf anonymen Rückmeldungen im jüngsten geschlossenen Block (abgeschlossene Monate, feste nicht überlappende Blöcke, höchstens zwölf Monate), sonst status too_few (§20.2 Nr. 4, ANN-608). Das Barometer ist namentlich und hat keine Summe.';

drop function app.staff_feedback_scale(smallint[]);

create or replace function app.delete_due_staff_feedback(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql security definer
set search_path to ''
as $$
declare
  v_anzahl integer := 0;
begin
  -- Rückmeldungen: zwölf Monate ab Ende des Monats der Abgabe, endgültig.
  with faellig as (
    select f.id, f.organization_id,
           app.retention_due_at(
             (f.month + interval '1 month' - interval '1 day')::date,
             app.retention_interval('rueckmeldung'),
             p_time_zone
           ) as due_at
    from public.staff_feedback f
    where f.organization_id = p_org
  ),
  geloescht as (
    delete from public.staff_feedback f
    using faellig x
    where f.id = x.id and x.due_at <= now()
    returning f.id, f.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_feedback', g.id, 'rueckmeldung', x.due_at
  from geloescht g join faellig x on x.id = g.id;
  get diagnostics v_anzahl = row_count;

  -- Anonyme Rückmeldungen abgeschlossener Monate neu schreiben: zufällige Reihenfolge, neue
  -- Kennung, eine Transaktion. Danach tragen `xmin` und `ctid` keine Spur ihres Zeitpunkts mehr,
  -- im laufenden Monat nur an den Rechten der Anwendung vorbei (ANN-608). Zählt nicht als Löschung.
  with alt as (
    delete from public.staff_feedback f
    where f.organization_id = p_org and f.staff_member_id is null
      and f.month < app.staff_feedback_month(p_org)
    returning f.organization_id, f.kind, f.month, f.mood, f.tours, f.team,
              f.easier_text, f.more_text, f.message_text
  )
  insert into public.staff_feedback
    (organization_id, kind, month, mood, tours, team, easier_text, more_text, message_text)
  select a.organization_id, a.kind, a.month, a.mood, a.tours, a.team,
         a.easier_text, a.more_text, a.message_text
  from alt a
  order by random();

  -- Blöcke, die ganz vor der Frist liegen, fallen mit (kein Personenbezug).
  delete from public.staff_feedback_blocks b
  where b.organization_id = p_org
    and app.retention_due_at(
          (b.to_month + interval '1 month' - interval '1 day')::date,
          app.retention_interval('rueckmeldung'),
          p_time_zone
        ) <= now();

  return v_anzahl;
end;
$$;

comment on function app.delete_due_staff_feedback(p_org uuid, p_time_zone text, p_run uuid) is 'Löscht Rückmeldungen von Beschäftigten zwölf Monate ab Ende ihres Monats endgültig, mit Eintrag im Löschjournal, und schreibt anonyme Rückmeldungen abgeschlossener Monate neu (ANN-607, ANN-608). Aufgerufen aus public.apply_retention(); ohne Eintrag in dessen Auditzusammenfassung.';

-- Die Teilnahme zeigt jetzt die namentliche Antwort selbst; die eigene Marke trennte nur anonyme
-- Antworten von der Person.
delete from public.retention_assignments where table_name = 'staff_feedback_participations';
delete from public.retention_classes where key = 'rueckmeldung_teilnahme';
drop table public.staff_feedback_participations;

update public.retention_classes
   set note = 'Rückmeldungen von Beschäftigten (§20.2): Barometer mit Namen und Rückmeldung an die Praxisleitung, mit oder ohne Namen. Zwölf Monate ab Ende des Monats der Abgabe, dann endgültig gelöscht - kein Soft-Delete (ADR-008 Fassung 4).'
 where key = 'rueckmeldung';

update public.retention_assignments
   set scope_note = 'Geschlossene Zeiträume der Praxissumme anonymer Rückmeldungen an die Praxisleitung: ohne Personenbezug; fallen mit dem Ablauf ihres letzten Monats, ohne Journal (ANN-608).'
 where table_name = 'staff_feedback_blocks';

comment on table public.staff_feedback is 'Rückmeldungen von Beschäftigten (§20.2, ANN-607, ANN-608) - Barometer (drei Skalen 1-9, zwei Freitexte), immer mit Namen, und Rückmeldung an die Praxisleitung, mit oder ohne Namen. Mit Namen: Person und Zeitpunkt; ohne Namen: nur Organisation und Monat, keine Person, kein Konto, keine Uhrzeit, zufällige Kennung. Liest allein owner über public.list_staff_feedback_named und public.get_staff_feedback_summary (Schwelle 3/5 nur für anonyme Rückmeldungen). Datenklasse rueckmeldung: zwölf Monate ab Ende des Monats der Abgabe, endgültig gelöscht (ADR-008 Fassung 4). Kein Tabellenrecht, kein Auditeintrag.';

comment on table public.staff_feedback_blocks is 'Geschlossene, nicht überlappende Zeiträume der Praxissumme anonymer Rückmeldungen an die Praxisleitung (§20.2 Nr. 4, ANN-608) - ein Block hat mindestens fünf anonyme Rückmeldungen und ändert sich nie. Keine Person, keine Antwort. Wird mit den Rückmeldungen nach zwölf Monaten gelöscht. Kein Tabellenrecht.';
