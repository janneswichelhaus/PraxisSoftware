-- =============================================================================
-- Behandlung abschliessen in einem Schritt (UX-007)
--
-- Am Ende eines Hausbesuchs standen bisher sechs Schritte ueber drei
-- Ansichten: Termin abschliessen, Dokumentation anlegen, Text schreiben,
-- Entwurf speichern, zurueck zum Termin, finalisieren, Rueckfrage bestaetigen.
-- Auf dem Telefon, im Hausflur, mit einer Hand.
--
-- Diese Funktion fasst dieselben drei Vorgaenge in EINER Transaktion zusammen:
-- Entwurf schreiben, finalisieren, Termin abschliessen. Der entscheidende
-- Punkt ist nicht die Bequemlichkeit, sondern die Unteilbarkeit: Drei einzelne
-- Aufrufe koennen zwischendurch scheitern und einen halben Zustand
-- hinterlassen - eine finalisierte Dokumentation an einem Termin, der noch als
-- geplant gefuehrt wird. Genau das schliesst PROJECT_PRINCIPLES.md 13 aus.
--
-- Sie fuehrt bewusst KEINE eigene Fachlogik: sie ruft die bestehenden
-- Funktionen auf. Damit gelten unveraendert deren Berechtigungspruefungen,
-- deren Zustandspruefungen, deren Konflikterkennung und deren Auditeintraege
-- (ADR-010, ADR-016 Punkt 9). Es entsteht kein zweiter Schreibpfad mit
-- eigenen Regeln - der waere der wahrscheinlichste Weg, an einer Pruefung
-- vorbeizukommen (ADR-004 Punkt 6 sinngemaess).
--
-- ADR-016 Punkt 4: Die Finalisierung bleibt ein ausdruecklicher Schritt. Er
-- heisst hier "Behandlung abschliessen" und nennt seine Folge unmittelbar
-- daneben - er verschwindet nicht, er bekommt einen ehrlicheren Namen.
--
-- ANN-005: Der Terminabschluss verlangt keine Dokumentation. Diese Funktion
-- aendert daran nichts; "Termin abschliessen" ohne Dokumentation bleibt
-- unveraendert moeglich. Sie ist der Weg fuer den Regelfall, nicht der einzige.
-- =============================================================================

create or replace function public.complete_treatment(
  p_appointment_id                 uuid,
  p_content                        text,
  p_expected_appointment_updated_at timestamptz,
  -- Der Stand des Entwurfs, auf dem die Eingabe beruht. `null` heisst: es gab
  -- beim Oeffnen keinen. Findet die Funktion dann doch einen, hat in der
  -- Zwischenzeit jemand anderes geschrieben - und das ist ein Konflikt, kein
  -- Anlass zum Ueberschreiben.
  p_expected_note_updated_at       timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
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

  -- Beide Rechte sind noetig; die aufgerufenen Funktionen pruefen sie erneut.
  -- Hier steht die Pruefung, damit die Meldung die Ursache trifft, statt auf
  -- halbem Weg zu scheitern.
  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write treatment documentation' using errcode = '42501';
  end if;

  if not app.can_complete_appointment() then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to complete appointments' using errcode = '42501';
  end if;

  select a.id, a.status
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

  select t.id, t.updated_at, t.status
    into v_note_id, v_note_stand, v_note_status
  from public.treatment_notes t
  where t.appointment_id = p_appointment_id
    and t.addendum_to_note_id is null;

  if v_note_id is null then
    if p_expected_note_updated_at is not null then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    v_note_id := public.create_treatment_note(p_appointment_id, p_content);
  else
    if p_expected_note_updated_at is null
       or v_note_stand is distinct from p_expected_note_updated_at then
      raise exception 'treatment note was changed meanwhile' using errcode = '40001';
    end if;
    if v_note_status = 'final' then
      raise exception 'treatment note is already final' using errcode = '22023';
    end if;
    perform public.update_treatment_note(v_note_id, v_note_stand, p_content);
  end if;

  -- Nach dem Schreiben neu lesen: update_treatment_note laesst den Stand bei
  -- unveraendertem Text bewusst stehen, bei geaendertem setzt es ihn neu.
  select t.updated_at into v_note_stand
  from public.treatment_notes t
  where t.id = v_note_id;

  perform public.finalize_treatment_note(v_note_id, v_note_stand);

  -- Ein bereits abgeschlossener Termin wird nicht noch einmal abgeschlossen.
  -- Der Fall kommt aus der Tagesliste: dort steht ein abgeschlossener Termin
  -- ohne finalisierte Dokumentation weiterhin unter "offen" (UX-001).
  if v_termin.status = 'scheduled' then
    perform public.complete_appointment(p_appointment_id, p_expected_appointment_updated_at);
  end if;

  return v_note_id;
end;
$$;

comment on function public.complete_treatment(uuid, text, timestamptz, timestamptz) is
  'Schliesst eine Behandlung in einem Schritt ab (UX-007): Entwurf schreiben, finalisieren und Termin abschliessen in EINER Transaktion. Ruft ausschliesslich die bestehenden Funktionen auf; deren Rechte-, Zustands- und Auditregeln gelten unveraendert.';

revoke all on function public.complete_treatment(uuid, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.complete_treatment(uuid, text, timestamptz, timestamptz)
  to authenticated;
