-- Nutzung sichtbar (ANN-825, ADR-005 Konsequenzen, ADR-010 Punkt 15): Der Eintrag weist selbst
-- nach, dass ein Diktatvorschlag übernommen wurde. Das Merkmal bleibt stehen, sobald es einmal
-- gesetzt ist, und kommt nur mit einem Schreibvorgang am Text; kein neuer Auditeintrag.

alter table public.treatment_notes
  add column dictated boolean not null default false;

comment on column public.treatment_notes.dictated is
  'Mindestens einmal wurde ein Vorschlag aus einer Aufnahme (Diktat ueber das AI Gateway) in diesen Eintrag uebernommen (ANN-825, PROJECT_PRINCIPLES 6.3). Bleibt gesetzt; gesetzt nur von den Schreibfunktionen am Text, nie allein. Kein Inhalt. Datenklasse und Frist wie der Eintrag (klinische Patientenakte, ADR-008).';

-- Die Sperre nach der Freigabe zur Abrechnung (ADR-016 Punkt 11) gilt auch für das Merkmal.
drop trigger treatment_notes_basis_lock on public.treatment_notes;
create trigger treatment_notes_basis_lock
  before insert or update of content, status, visit_without_treatment, dictated
  on public.treatment_notes
  for each row execute function app.treatment_notes_basis_lock();

-- -----------------------------------------------------------------------------
-- Entwurf anlegen
-- -----------------------------------------------------------------------------
drop function public.create_treatment_note(uuid, text);

create function public.create_treatment_note(
  p_appointment_id uuid,
  p_content text,
  p_dictated boolean default false
) returns uuid
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_inhalt text;
  v_termin record;
  v_note   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.status, a.kind
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- Kein Durchgriff über den gemeinsamen Kalender (ADR-022 Punkt 11).
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Ein Ereignis des Praxisbetriebs hat keine Patient:in, also kein Gegenüber.
  if v_termin.kind = 'internal' then
    raise exception 'event cannot be documented' using errcode = '22023';
  end if;

  -- Abgesagt und nicht angetroffen heißen: keine Behandlung, also kein Nachweis.
  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be documented' using errcode = '22023';
  end if;

  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be documented' using errcode = '22023';
  end if;

  begin
    insert into public.treatment_notes (
      organization_id, appointment_id, status, content, created_by, updated_by, dictated
    )
    values (
      v_org, p_appointment_id, 'draft', v_inhalt, v_actor, v_actor, coalesce(p_dictated, false)
    )
    returning id into v_note;
  exception
    when unique_violation then
      raise exception 'treatment note already exists' using errcode = '23505';
  end;

  return v_note;
end;
$$;

comment on function public.create_treatment_note(uuid, text, boolean) is
  'Legt die Behandlungsdokumentation eines Termins als Entwurf an; p_dictated setzt das Merkmal „mit Diktat“ (ANN-825). Kein Auditeintrag: Der Eintrag weist sich selbst nach (ADR-010 Punkt 15).';

revoke all on function public.create_treatment_note(uuid, text, boolean) from public, anon;
grant execute on function public.create_treatment_note(uuid, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Entwurf ändern
-- -----------------------------------------------------------------------------
drop function public.update_treatment_note(uuid, timestamp with time zone, text);

create function public.update_treatment_note(
  p_note_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_content text,
  p_dictated boolean default false
) returns uuid
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_inhalt text;
  v_alt    record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select t.id, t.content, t.updated_at, t.status, t.dictated
    into v_alt
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_alt.status <> 'draft' then
    raise exception 'finalized treatment note requires a revision' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  if v_alt.content = v_inhalt then
    -- Gleicher Text, aber erst jetzt als diktiert gemeldet: nur das Merkmal, der Stand bleibt.
    if coalesce(p_dictated, false) and not v_alt.dictated then
      update public.treatment_notes set dictated = true where id = p_note_id;
    end if;
    return p_note_id;
  end if;

  update public.treatment_notes
     set content    = v_inhalt,
         dictated   = dictated or coalesce(p_dictated, false),
         updated_at = now(),
         updated_by = v_actor
   where id = p_note_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  return p_note_id;
end;
$$;

comment on function public.update_treatment_note(uuid, timestamp with time zone, text, boolean) is
  'Aendert den Entwurf einer Behandlungsdokumentation auf Basis eines erwarteten Standes (ADR-001); p_dictated setzt das Merkmal „mit Diktat“, nimmt es nie zurueck (ANN-825). Fuer finalisierte Eintraege gilt revise_treatment_note.';

revoke all on function public.update_treatment_note(uuid, timestamp with time zone, text, boolean)
  from public, anon;
grant execute on function public.update_treatment_note(uuid, timestamp with time zone, text, boolean)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Schreiben und finalisieren in einem Schritt
-- -----------------------------------------------------------------------------
drop function public.complete_treatment(
  uuid, text, timestamp with time zone, timestamp with time zone, boolean
);

create function public.complete_treatment(
  p_appointment_id uuid,
  p_content text,
  p_expected_appointment_updated_at timestamp with time zone,
  p_expected_note_updated_at timestamp with time zone default null,
  p_visit_without_treatment boolean default false,
  p_dictated boolean default false
) returns uuid
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_note_id      uuid;
  v_note_stand   timestamptz;
  v_note_status  text;
  v_org          uuid;
  v_termin       record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  select a.id, a.status, a.appointment_type, a.updated_at
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be completed' using errcode = '22023';
  end if;

  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be documented' using errcode = '22023';
  end if;

  -- Nicht auf einen inzwischen verlegten oder geänderten offenen Termin schreiben; ein
  -- abgehakter nimmt den Eintrag ohne diese Prüfung an (der Haken ändert updated_at).
  if v_termin.status = 'confirmed'
     and v_termin.updated_at is distinct from p_expected_appointment_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  if p_visit_without_treatment is true and v_termin.appointment_type <> 'home_visit' then
    raise exception 'visit without treatment applies to home visits only' using errcode = '22023';
  end if;

  select t.id, t.updated_at, t.status
    into v_note_id, v_note_stand, v_note_status
  from public.treatment_notes t
  where t.appointment_id = p_appointment_id
    and t.addendum_to_note_id is null;

  if v_note_id is null then
    if p_expected_note_updated_at is not null then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    v_note_id := public.create_treatment_note(p_appointment_id, p_content, p_dictated);
  else
    if p_expected_note_updated_at is null
       or v_note_stand is distinct from p_expected_note_updated_at then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    if v_note_status = 'final' then
      raise exception 'treatment note is already final' using errcode = '22023';
    end if;
    perform public.update_treatment_note(v_note_id, v_note_stand, p_content, p_dictated);
  end if;

  -- Der Pflichtvermerk gehört zum Eintrag; ohne updated_at, damit die Finalisierung
  -- darunter auf dem Stand von update_treatment_note beruht.
  update public.treatment_notes
     set visit_without_treatment = coalesce(p_visit_without_treatment, false)
   where id = v_note_id;

  select t.updated_at into v_note_stand
  from public.treatment_notes t
  where t.id = v_note_id;

  perform public.finalize_treatment_note(v_note_id, v_note_stand);

  return v_note_id;
end;
$$;

comment on function public.complete_treatment(
  uuid, text, timestamp with time zone, timestamp with time zone, boolean, boolean
) is
  'Schreibt und finalisiert die Dokumentation eines Termins in einem Schritt, ohne den Termin abzuhaken; traegt auf Wunsch den Pflichtvermerk aus Hausbesuch-Szenario 1 und das Merkmal „mit Diktat“ (ANN-825) ein. Der Termin steht danach auf documented (ADR-018 Punkt 3).';

revoke all on function public.complete_treatment(
  uuid, text, timestamp with time zone, timestamp with time zone, boolean, boolean
) from public, anon;
grant execute on function public.complete_treatment(
  uuid, text, timestamp with time zone, timestamp with time zone, boolean, boolean
) to authenticated;

-- -----------------------------------------------------------------------------
-- Korrektur eines finalisierten Eintrags
-- -----------------------------------------------------------------------------
drop function public.revise_treatment_note(uuid, timestamp with time zone, text, text);

create function public.revise_treatment_note(
  p_note_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_content text,
  p_reason text,
  p_dictated boolean default false
) returns uuid
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_actor     uuid;
  v_org       uuid;
  v_inhalt    text;
  v_grund     text;
  v_alt       record;
  v_version   integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  v_grund := btrim(coalesce(p_reason, ''), E' \t\r\n');

  if v_grund = '' then
    raise exception 'change reason is required' using errcode = '22023';
  end if;

  if length(v_grund) > 500 then
    raise exception 'change reason is too long' using errcode = '22023';
  end if;

  select t.id, t.content, t.status, t.updated_at
    into v_alt
  from public.treatment_notes t
  where t.id = p_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_alt.status <> 'final' then
    raise exception 'treatment note is not final' using errcode = '22023';
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  -- Eine Korrektur ohne Änderung wäre eine Version ohne Aussage im Verlauf (ADR-016).
  if v_alt.content = v_inhalt then
    raise exception 'documentation is unchanged' using errcode = '22023';
  end if;

  select coalesce(max(v.version_no), 0) + 1
    into v_version
  from public.treatment_note_versions v
  where v.note_id = p_note_id;

  insert into public.treatment_note_versions (
    organization_id, note_id, version_no, content, change_reason, author_id
  )
  values (
    v_org, p_note_id, v_version, v_inhalt, v_grund, v_actor
  );

  update public.treatment_notes
     set content    = v_inhalt,
         dictated   = dictated or coalesce(p_dictated, false),
         updated_at = now(),
         updated_by = v_actor
   where id = p_note_id
     and updated_at = p_expected_updated_at;

  if not found then
    raise exception 'treatment note was changed meanwhile' using errcode = '40001';
  end if;

  return p_note_id;
end;
$$;

comment on function public.revise_treatment_note(
  uuid, timestamp with time zone, text, text, boolean
) is
  'Korrigiert eine finalisierte Behandlungsdokumentation als neue Version mit Begruendung (ADR-016 Punkt 5 und 6); p_dictated setzt das Merkmal „mit Diktat“ (ANN-825).';

revoke all on function public.revise_treatment_note(
  uuid, timestamp with time zone, text, text, boolean
) from public, anon;
grant execute on function public.revise_treatment_note(
  uuid, timestamp with time zone, text, text, boolean
) to authenticated;

-- -----------------------------------------------------------------------------
-- Nachtrag
-- -----------------------------------------------------------------------------
drop function public.create_treatment_note_addendum(uuid, text);

create function public.create_treatment_note_addendum(
  p_parent_note_id uuid,
  p_content text,
  p_dictated boolean default false
) returns uuid
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_inhalt   text;
  v_eltern   record;
  v_nachtrag uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');

  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;

  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select t.id, t.appointment_id, t.status, t.addendum_to_note_id
    into v_eltern
  from public.treatment_notes t
  where t.id = p_parent_note_id
    and t.organization_id = v_org
  for update;

  if not found then
    raise exception 'treatment note not found' using errcode = 'P0002';
  end if;

  if v_eltern.addendum_to_note_id is not null then
    raise exception 'addendum cannot be extended' using errcode = '22023';
  end if;

  if v_eltern.status <> 'final' then
    raise exception 'treatment note is not final' using errcode = '22023';
  end if;

  insert into public.treatment_notes (
    organization_id, appointment_id, addendum_to_note_id, status, content, created_by,
    updated_by, dictated
  )
  values (
    v_org, v_eltern.appointment_id, p_parent_note_id, 'draft', v_inhalt, v_actor,
    v_actor, coalesce(p_dictated, false)
  )
  returning id into v_nachtrag;

  return v_nachtrag;
end;
$$;

comment on function public.create_treatment_note_addendum(uuid, text, boolean) is
  'Legt einen Nachtrag zu einem finalisierten Eintrag als eigenen Entwurf an (ADR-016 Punkt 6); p_dictated setzt das Merkmal „mit Diktat“ (ANN-825).';

revoke all on function public.create_treatment_note_addendum(uuid, text, boolean) from public, anon;
grant execute on function public.create_treatment_note_addendum(uuid, text, boolean)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Entwurf ohne Verbindung übertragen
-- -----------------------------------------------------------------------------
drop function public.sync_offline_treatment_note(uuid, uuid, text, timestamp with time zone);

create function public.sync_offline_treatment_note(
  p_offline_id uuid,
  p_appointment_id uuid,
  p_content text,
  p_written_at timestamp with time zone,
  p_dictated boolean default false
) returns jsonb
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_inhalt text;
  v_termin record;
  v_da     record;
  v_note   uuid;
begin
  -- Gesperrt ist nicht entzogen: eigener Code, damit das Gerät nichts verwirft.
  v_actor := auth.uid();
  if v_actor is null or not app.session_open() then
    raise exception 'session locked' using errcode = '28000';
  end if;

  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  if p_offline_id is null or p_appointment_id is null or p_written_at is null then
    raise exception 'invalid offline draft' using errcode = '22023';
  end if;

  v_inhalt := btrim(coalesce(p_content, ''), E' \t\r\n');
  if v_inhalt = '' then
    raise exception 'documentation must not be empty' using errcode = '22023';
  end if;
  if length(v_inhalt) > 20000 then
    raise exception 'documentation is too long' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.status, a.kind
    into v_termin
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    and app.may_write_appointment_context(a.kind)
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  -- Wiedererkennen vor jeder weiteren Prüfung: Ging nur die Antwort verloren, ist das ein
  -- Erfolg, auch an einem inzwischen abgesagten Termin.
  select t.id, t.appointment_id, t.content, t.status
    into v_da
  from public.treatment_notes t
  where t.created_by = v_actor
    and t.offline_id = p_offline_id
    and t.organization_id = v_org;

  if found then
    if v_da.appointment_id <> p_appointment_id then
      raise exception 'invalid offline draft' using errcode = '22023';
    end if;
    -- Dieselbe Kennung mit neuerem Text ist kein Wiedererkennen: Er bleibt als Konflikt
    -- auf dem Gerät, statt still zu fallen.
    if v_da.content <> v_inhalt then
      return jsonb_build_object(
        'status', 'conflict', 'note_id', v_da.id, 'note_status', v_da.status
      );
    end if;
    return jsonb_build_object('status', 'known', 'note_id', v_da.id);
  end if;

  if v_termin.kind = 'internal' then
    raise exception 'event cannot be documented' using errcode = '22023';
  end if;
  if v_termin.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be documented' using errcode = '22023';
  end if;
  if v_termin.status = 'no_show' then
    raise exception 'no-show appointment cannot be documented' using errcode = '22023';
  end if;

  -- Nichts einmischen (ADR-024 Punkt 7).
  select t.id, t.status
    into v_da
  from public.treatment_notes t
  where t.appointment_id = p_appointment_id
    and t.addendum_to_note_id is null;

  if found then
    return jsonb_build_object('status', 'conflict', 'note_id', v_da.id, 'note_status', v_da.status);
  end if;

  begin
    insert into public.treatment_notes (
      organization_id, appointment_id, status, content, created_by, updated_by,
      offline_id, reported_written_at, dictated
    )
    values (
      v_org, p_appointment_id, 'draft', v_inhalt, v_actor, v_actor,
      -- Eine Uhr aus der Zukunft ist falsch; die Angabe bleibt höchstens der Eingang.
      p_offline_id, least(p_written_at, now()), coalesce(p_dictated, false)
    )
    returning id into v_note;
  exception
    when unique_violation then
      -- Gleichzeitig angekommen: derselbe Entwurf zweimal oder ein anderer Eintrag am Termin.
      select t.id, t.content, t.status into v_da
      from public.treatment_notes t
      where t.created_by = v_actor and t.offline_id = p_offline_id;
      if found then
        if v_da.content <> v_inhalt then
          return jsonb_build_object(
            'status', 'conflict', 'note_id', v_da.id, 'note_status', v_da.status
          );
        end if;
        return jsonb_build_object('status', 'known', 'note_id', v_da.id);
      end if;
      select t.id, t.status into v_da
      from public.treatment_notes t
      where t.appointment_id = p_appointment_id and t.addendum_to_note_id is null;
      return jsonb_build_object('status', 'conflict', 'note_id', v_da.id, 'note_status', v_da.status);
  end;

  return jsonb_build_object('status', 'created', 'note_id', v_note);
end;
$$;

comment on function public.sync_offline_treatment_note(
  uuid, uuid, text, timestamp with time zone, boolean
) is
  'Uebertraegt einen ohne Verbindung geschriebenen Entwurf (ADR-024 Punkte 7 und 8, ANN-362) - additiv, wiederholbar, ohne Einmischen in eine vorhandene Dokumentation; p_dictated setzt das Merkmal „mit Diktat“ (ANN-825). Dieselben Pruefungen wie create_treatment_note, 28000 bei gesperrter Sitzung. Kein Auditeintrag.';

revoke all on function public.sync_offline_treatment_note(
  uuid, uuid, text, timestamp with time zone, boolean
) from public, anon;
grant execute on function public.sync_offline_treatment_note(
  uuid, uuid, text, timestamp with time zone, boolean
) to authenticated;

-- -----------------------------------------------------------------------------
-- Lesen: der Eintrag am Termin und die Akte
-- -----------------------------------------------------------------------------
drop function public.get_treatment_note(uuid);

create function public.get_treatment_note(p_appointment_id uuid)
returns table(
  id uuid,
  appointment_id uuid,
  addendum_to_note_id uuid,
  status text,
  content text,
  visit_without_treatment boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  finalized_at timestamp with time zone,
  finalisation_kind text,
  version_count integer,
  author_name text,
  last_editor_name text,
  finalized_by_name text,
  reported_written_at timestamp with time zone,
  dictated boolean
)
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    -- Abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_note.viewed', 'not allowed to read treatment documentation');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  select a.patient_id into v_patient
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org;

  if not found then
    return;
  end if;

  -- Akte geöffnet, höchstens einmal je Tag (ADR-010 Punkt 16).
  if exists (select 1 from public.treatment_notes t where t.appointment_id = p_appointment_id and t.organization_id = v_org) then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', v_patient);
  end if;

  return query
    select t.id,
           t.appointment_id,
           t.addendum_to_note_id,
           t.status,
           t.content,
           t.visit_without_treatment,
           t.created_at,
           t.updated_at,
           t.finalized_at,
           t.finalisation_kind,
           (select count(*) from public.treatment_note_versions v where v.note_id = t.id)::integer,
           verfasser.display_name,
           bearbeiter.display_name,
           finalisierer.display_name,
           t.reported_written_at,
           t.dictated
    from public.treatment_notes t
    left join public.user_profiles verfasser    on verfasser.id    = t.created_by
    left join public.user_profiles bearbeiter   on bearbeiter.id   = t.updated_by
    left join public.user_profiles finalisierer on finalisierer.id = t.finalized_by
    where t.appointment_id = p_appointment_id
      and t.organization_id = v_org
    order by (t.addendum_to_note_id is not null), t.created_at;
end;
$$;

comment on function public.get_treatment_note(uuid) is
  'Liefert Haupteintrag und Nachtraege der Behandlungsdokumentation eines Termins samt Art der Finalisierung, Pflichtvermerk aus Hausbesuch-Szenario 1, Merkmal „mit Diktat“ (ANN-825) und - bei einem ohne Verbindung geschriebenen Entwurf - der Zeit des Geraets; protokolliert Akte geoeffnet hoechstens einmal je Tag (ADR-010).';

revoke all on function public.get_treatment_note(uuid) from public, anon;
grant execute on function public.get_treatment_note(uuid) to authenticated;

create or replace function public.list_patient_treatment_notes(
  p_patient_id uuid,
  p_limit integer default 20,
  p_before_starts_at timestamp with time zone default null,
  p_before_id uuid default null
)
returns table(
  appointment_id uuid,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  appointment_type text,
  appointment_status text,
  staff_given_name text,
  staff_family_name text,
  organization_time_zone text,
  notes jsonb
)
  language plpgsql security definer
  set search_path to ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_seite uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    -- Abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_note.viewed', 'not allowed to read treatment documentation');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  select array_agg(s.appointment_id order by s.starts_at desc, s.appointment_id desc)
    into v_seite
  from app.patient_record_page(
         v_org, p_patient_id, p_limit, p_before_starts_at, p_before_id
       ) s;

  if v_seite is null then
    return;
  end if;

  -- Akte geöffnet, höchstens einmal je Tag (ADR-010 Punkt 16).
  if exists (select 1 from public.treatment_notes t where t.appointment_id = any (v_seite)) then
    perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id);
  end if;

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.status,
      sp.given_name,
      sp.family_name,
      o.time_zone,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id',                  t.id,
                   'appointment_id',      t.appointment_id,
                   'addendum_to_note_id', t.addendum_to_note_id,
                   'status',              t.status,
                   'content',             t.content,
                   'visit_without_treatment', t.visit_without_treatment,
                   'dictated',            t.dictated,
                   'created_at',          t.created_at,
                   'updated_at',          t.updated_at,
                   'finalized_at',        t.finalized_at,
                   'finalisation_kind',   t.finalisation_kind,
                   'version_count',       (select count(*)
                                             from public.treatment_note_versions v
                                            where v.note_id = t.id),
                   'author_name',         verfasser.display_name,
                   'last_editor_name',    bearbeiter.display_name,
                   'finalized_by_name',   finalisierer.display_name
                 )
                 order by (t.addendum_to_note_id is not null), t.created_at
               )
        from public.treatment_notes t
        left join public.user_profiles verfasser    on verfasser.id    = t.created_by
        left join public.user_profiles bearbeiter   on bearbeiter.id   = t.updated_by
        left join public.user_profiles finalisierer on finalisierer.id = t.finalized_by
        where t.appointment_id = a.id
      ), '[]'::jsonb)
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    where a.id = any (v_seite)
    order by a.starts_at desc, a.id desc;
end;
$$;

comment on function public.list_patient_treatment_notes(uuid, integer, timestamp with time zone, uuid) is
  'Klinische Sicht der Akte: Termine einer Patient:in mit ihren Eintraegen samt Inhalt, Art der Finalisierung, Pflichtvermerk aus Hausbesuch-Szenario 1 und Merkmal „mit Diktat“ (ANN-825); protokolliert Akte geoeffnet hoechstens einmal je Tag (ADR-010, ADR-016 Punkt 8 und 9). owner, therapist, team_lead und office.';

-- Die Auskunft nach Art. 15 nennt das Merkmal wie den Pflichtvermerk. Ergänzt wird nur dieser
-- Schlüssel in der geltenden Fassung; fehlt die Stelle, bricht die Migration ab.
do $$
declare
  v_alt text := pg_get_functiondef('public.export_patient_record(uuid)'::regprocedure);
  v_neu text;
begin
  v_neu := replace(
    v_alt,
    '''reported_written_at'', d.reported_written_at',
    '''reported_written_at'', d.reported_written_at,' || chr(10) ||
      '        ''dictated'', d.dictated'
  );
  if v_neu = v_alt or position('''dictated'', d.dictated' in v_neu) = 0 then
    raise exception 'export_patient_record: Stelle für das Merkmal nicht gefunden';
  end if;
  execute v_neu;
end;
$$;
