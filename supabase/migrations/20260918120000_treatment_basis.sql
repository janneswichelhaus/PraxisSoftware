-- =============================================================================
-- Die Behandlungsgrundlage: Verordnung und Selbstzahler unter einer Klammer
-- (GRD-001, ADR-020)
--
-- Ein Termin hing bisher an genau einer Klammer, der VERORDNUNG. Wer selbst
-- zahlt, hatte keine: seine Termine standen ohne Ueberschrift, ohne vereinbarte
-- Anzahl und ohne Deckung, und die Serienplanung aus dem Kontingent (CAL-007)
-- stand ihm nicht zur Verfuegung. E16 hat das am 2026-09-16 entschieden, ADR-020
-- ausgearbeitet: Ein Termin haengt an einer BEHANDLUNGSGRUNDLAGE; die
-- Verordnung ist eine Bauart davon, der Selbstzahler die zweite.
--
-- Umgesetzt wird das durch ERWEITERN der vorhandenen Tabelle, nicht durch eine
-- zweite (ADR-020 Punkt 2). Eine zweite Tabelle waere eine zweite
-- Planungsmechanik fuer dieselbe Sache - jede Regel (Deckung, Uebertragung,
-- Serie) muesste zweimal gebaut und zweimal geprueft werden.
--
-- DREI AENDERUNGEN AM MODELL:
--
--   * DIE BENENNUNG. `prescriptions` heisst `treatment_bases`,
--     `prescription_items` heisst `treatment_base_items`, und die Verweise
--     darauf heissen `treatment_basis_id` - in den Positionen, an `appointments`
--     und an `patient_files`. ADR-020 liess den genauen Bezeichner dem SPEC von
--     GRD-001 offen; gewaehlt ist der Vorschlag des ADR, weil er neutral,
--     englisch und zu `treatment_notes` konsistent ist. Aus `prescription_kind`
--     wird `treatment_basis_kind`: Eine Spalte, die den Wert `self_pay` traegt,
--     darf nicht `prescription_kind` heissen. `prescribed_quantity` BLEIBT
--     (ADR-020 Punkt 5: die Menge heisst fuer beide Bauarten gleich), ebenso
--     `prescribers` und `prescriber_id` - eine Verordner:in bleibt eine
--     Verordner:in.
--   * DIE ZWEITE BAUART. `treatment_basis_kind` bekommt neben `first` und
--     `follow_up` den Wert `self_pay`. Bestandszeilen behalten ihre Art; es
--     werden keine Inhalte migriert.
--   * WAS EINE VERORDNUNG BRAUCHT, VERLANGT DIE DATENBANK WEITER - ABER NUR VON
--     IHR (ADR-020 Punkt 3). `prescriber_id` wird nullable, mit einer Constraint,
--     die sie fuer `first` und `follow_up` erzwingt und fuer `self_pay`
--     ausschliesst. `issued_on` bleibt Pflicht und bedeutet beim Selbstzahler den
--     Tag der Vereinbarung.
--
-- WAS SICH NICHT AENDERT:
--
--   * Die DATENKLASSE der Tabelle (klinische Patientenakte, zehn Jahre nach
--     Abschluss der Behandlung, ADR-008, ANN-011). Eine leere Diagnose macht
--     eine Zeile nicht organisatorisch. Kein Tabellenrecht, keine Policy: der
--     einzige Weg bleiben die rollenabhaengigen Projektionen (ADR-004).
--   * Der ROLLENSCHNITT aus ADR-004 Fassung 2 und E15 - nur die Funktionen
--     heissen anders.
--   * Die Constraint `used_quantity <= prescribed_quantity` gilt fuer BEIDE
--     Bauarten (ADR-020 Punkt 5): Sie schuetzt die Abrechnung, nicht die
--     Planung. Ueber das Kontingent hinaus GEPLANT werden darf weiterhin nicht
--     - das kommt mit CAL-022.
--   * Die HISTORIE. Auditzeilen werden niemals umgeschrieben (ADR-010), deshalb
--     treten die Werte `treatment_basis.*` NEBEN `prescription.*`, und
--     `subject_type` bekommt `treatment_basis` neben `prescription`. Geschrieben
--     werden ab hier nur noch die neuen; die alten bleiben lesbar.
--
-- BEWUSST NICHT HIER: Preise, Pakete, Vorauszahlung (B11 - eine Anzahl
-- moeglicher Termine ist eine Planungsgroesse, kein verkauftes Paket). Keine
-- Aenderung an Abrechnung, Leistungen oder Rechnungszustaenden (ADR-009). Keine
-- dritte Bauart auf Vorrat (ADR-014, ADR-020 Punkt 1). Und keine Constraint,
-- die einem Selbstzahler die klinischen Felder verbietet: ADR-020 Punkt 4 sagt,
-- dass sie bei ihm leer BLEIBEN - das ist eine Aussage ueber die Oberflaeche,
-- die sie nicht anbietet, keine Regel der Datenbank. Eine solche Constraint
-- wuerde beim Wechsel der Bauart Inhalte verwerfen, die niemand verworfen hat.
--
-- DER PREIS IST DIE UMBENENNUNG: 29 Funktionen tragen die alten Bezeichner und
-- werden hier neu erstellt. Ihre Rumpfe sind unveraendert bis auf die Namen -
-- was fachlich neu ist, steht in `app.assert_treatment_basis_input`. Sie sind
-- aus der laufenden Datenbank (`pg_get_functiondef`) uebernommen, nicht aus den
-- Migrationsdateien zusammengesucht; damit ist ausgeschlossen, dass eine
-- spaetere Fassung versehentlich auf eine fruehere zurueckfaellt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabellen, Spalten, Constraints und Indizes
--
-- PostgreSQL benennt beim Umbenennen einer Tabelle weder ihre Constraints noch
-- ihre Indizes mit. Beides steht deshalb ausdruecklich hier - ein Index namens
-- `prescriptions_patient_idx` an einer Tabelle `treatment_bases` waere genau die
-- Halbheit, die diese Migration vermeiden soll.
-- -----------------------------------------------------------------------------
alter table public.prescriptions      rename to treatment_bases;
alter table public.prescription_items rename to treatment_base_items;

alter table public.treatment_bases      rename column prescription_kind to treatment_basis_kind;
alter table public.treatment_base_items rename column prescription_id   to treatment_basis_id;
alter table public.appointments         rename column prescription_id   to treatment_basis_id;
alter table public.patient_files        rename column prescription_id   to treatment_basis_id;

alter table public.treatment_bases rename constraint prescriptions_pkey                             to treatment_bases_pkey;
alter table public.treatment_bases rename constraint prescriptions_organization_id_fkey             to treatment_bases_organization_id_fkey;
alter table public.treatment_bases rename constraint prescriptions_patient_id_fkey                  to treatment_bases_patient_id_fkey;
alter table public.treatment_bases rename constraint prescriptions_prescriber_id_fkey               to treatment_bases_prescriber_id_fkey;
alter table public.treatment_bases rename constraint prescriptions_frequency_note_check             to treatment_bases_frequency_note_check;
alter table public.treatment_bases rename constraint prescriptions_note_check                       to treatment_bases_note_check;
alter table public.treatment_bases rename constraint prescriptions_diagnosis_check                  to treatment_bases_diagnosis_check;
alter table public.treatment_bases rename constraint prescriptions_therapy_goal_check               to treatment_bases_therapy_goal_check;
alter table public.treatment_bases rename constraint prescriptions_prescriber_note_check            to treatment_bases_prescriber_note_check;
alter table public.treatment_bases rename constraint prescriptions_follow_up_recommendation_check   to treatment_bases_follow_up_recommendation_check;

alter table public.treatment_base_items rename constraint prescription_items_pkey                        to treatment_base_items_pkey;
alter table public.treatment_base_items rename constraint prescription_items_organization_id_fkey        to treatment_base_items_organization_id_fkey;
alter table public.treatment_base_items rename constraint prescription_items_prescription_id_fkey        to treatment_base_items_treatment_basis_id_fkey;
alter table public.treatment_base_items rename constraint prescription_items_prescription_sort_order_key to treatment_base_items_basis_sort_order_key;
alter table public.treatment_base_items rename constraint prescription_items_sort_order_check            to treatment_base_items_sort_order_check;
alter table public.treatment_base_items rename constraint prescription_items_remedy_check                to treatment_base_items_remedy_check;
alter table public.treatment_base_items rename constraint prescription_items_prescribed_quantity_check   to treatment_base_items_prescribed_quantity_check;
alter table public.treatment_base_items rename constraint prescription_items_used_quantity_check         to treatment_base_items_used_quantity_check;
alter table public.treatment_base_items rename constraint prescription_items_used_within_prescribed      to treatment_base_items_used_within_prescribed;

alter table public.appointments  rename constraint appointments_prescription_id_fkey          to appointments_treatment_basis_id_fkey;
alter table public.patient_files rename constraint patient_files_prescription_id_fkey         to patient_files_treatment_basis_id_fkey;
alter table public.patient_files rename constraint patient_files_scan_belongs_to_prescription to patient_files_scan_belongs_to_treatment_basis;

alter index public.prescriptions_patient_idx            rename to treatment_bases_patient_idx;
alter index public.prescriptions_prescriber_idx         rename to treatment_bases_prescriber_idx;
alter index public.prescription_items_prescription_idx  rename to treatment_base_items_basis_idx;
alter index public.appointments_prescription_idx        rename to appointments_treatment_basis_idx;
alter index public.patient_files_prescription_idx       rename to patient_files_treatment_basis_idx;

-- -----------------------------------------------------------------------------
-- 2. Die zweite Bauart
--
-- Zwei Constraints statt einer, weil sie zwei verschiedene Dinge sagen: welche
-- Bauarten es gibt, und was jede von ihnen verlangt. Die zweite ist die
-- Uebersetzung von ADR-020 Punkt 3 in die Datenbank - `app.assert_treatment_
-- basis_input` prueft dasselbe mit einer verstaendlichen Fehlermeldung, aber die
-- Autorisierung und die Regel liegen nie allein im Schreibpfad (ADR-004,
-- Defense-in-Depth).
-- -----------------------------------------------------------------------------
alter table public.treatment_bases
  drop constraint prescriptions_prescription_kind_check;

alter table public.treatment_bases
  add constraint treatment_bases_kind_check
  check (treatment_basis_kind in ('first', 'follow_up', 'self_pay'));

alter table public.treatment_bases
  alter column prescriber_id drop not null;

alter table public.treatment_bases
  add constraint treatment_bases_prescriber_matches_kind
  check (
    case treatment_basis_kind
      when 'self_pay' then prescriber_id is null
      else prescriber_id is not null
    end
  );

-- -----------------------------------------------------------------------------
-- 3. Kommentare
--
-- Die Kommentare sind der einzige Ort, an dem im Schema steht, welches Feld
-- klinisch ist und welches organisatorisch; die Lesefunktionen teilen entlang
-- genau dieser Linie. Sie werden hier vollstaendig neu gesetzt, weil das Wort
-- "Verordnung" jetzt eine Bauart bezeichnet und nicht mehr die Tabelle.
-- -----------------------------------------------------------------------------
comment on table public.treatment_bases is
  'Behandlungsgrundlage: die Klammer, an der ein Termin haengt (GRD-001, ADR-020). Zwei Bauarten - Verordnung (first, follow_up) und Selbstzahler (self_pay). Enthaelt Gesundheitsdaten. Datenklasse: klinische Patientenakte, 10 Jahre nach Abschluss der Behandlung (ADR-008, ANN-011). Kein Tabellenrecht und keine Policy: erreichbar nur ueber die rollenabhaengigen Lesefunktionen (ADR-004).';
comment on column public.treatment_bases.treatment_basis_kind is
  'Die Bauart: first und follow_up sind Verordnungen, self_pay ist der Selbstzahler (ADR-020 Punkt 1). Bewusst nicht der GKV-Rezepttyp: die Praxis rechnet privat ab, das Privatrezept IST die Verordnung (ADR-009, ADR-020).';
comment on column public.treatment_bases.prescriber_id is
  'Verordner:in - Pflicht bei first und follow_up, ausgeschlossen bei self_pay (ADR-020 Punkt 3, Constraint treatment_bases_prescriber_matches_kind).';
comment on column public.treatment_bases.issued_on is
  'Ausstellungsdatum der Verordnung; beim Selbstzahler der Tag der Vereinbarung (ADR-020 Punkt 3). Pflicht fuer beide Bauarten.';
comment on column public.treatment_bases.frequency_note is
  'Verordnete beziehungsweise vereinbarte Frequenz als Freitext, wie sie auf dem Papier steht ("2x pro Woche"). Organisatorisch. Bewusst keine Zahl: "1-2x" liesse sich sonst nicht erfassen.';
comment on column public.treatment_bases.note is
  'Organisatorische Bemerkung zur Grundlage. Fuer alle Praxisrollen sichtbar - klinische Angaben gehoeren in die Felder darunter.';
comment on column public.treatment_bases.diagnosis is
  'Diagnose beziehungsweise Leitsymptomatik der Verordnung. KLINISCH (PROJECT_PRINCIPLES.md 4.3). Beim Selbstzahler leer: die Oberflaeche fragt sie dort nicht ab (ADR-020 Punkt 4).';
comment on column public.treatment_bases.follow_up_recommendation is
  'Empfehlung der Therapeut:in zum Verordnungsende, von ihr selbst erfasst (ANN-014). KLINISCH. Ausdruecklich KEINE Systemempfehlung: die Anwendung erzeugt keine Therapieempfehlung (ADR-006 Punkt 4).';

comment on table public.treatment_base_items is
  'Positionen einer Behandlungsgrundlage: Heilmittel, verordnete beziehungsweise vereinbarte und genutzte Menge (VER-001, ADR-020 Punkt 5). Datenklasse wie die Grundlage. Kein Tabellenrecht und keine Policy.';
comment on column public.treatment_base_items.remedy is
  'Bezeichnung des Heilmittels als Freitext, etwa "Krankengymnastik". Ein versionierter Katalog kommt mit ABR-001; bis dahin waere eine Auswahlliste eine Erfindung ohne Preise.';
comment on column public.treatment_base_items.prescribed_quantity is
  'Die Anzahl moeglicher Termine dieser Position - verordnet beim Rezept, vereinbart beim Selbstzahler (ADR-020 Punkt 5). Der Name bleibt fuer beide Bauarten gleich.';
comment on column public.treatment_base_items.used_quantity is
  'Bereits genutzte Behandlungen dieser Position. ANN-012: bis CAL-007/ABR-002 von Hand gepflegt. used_quantity <= prescribed_quantity schuetzt die Abrechnung (PROJECT_PRINCIPLES.md 13), nicht die Planung.';

comment on constraint treatment_bases_prescriber_matches_kind on public.treatment_bases is
  'ADR-020 Punkt 3: Was eine Verordnung braucht, verlangt die Datenbank weiter - aber nur von ihr. Ein Selbstzahler hat keine Verordner:in.';

-- -----------------------------------------------------------------------------
-- 4. Auditkatalog
--
-- ADR-020 Punkt 8: Die neuen Werte treten NEBEN die alten. Auditzeilen werden
-- niemals umgeschrieben (ADR-010), also muessen `prescription.viewed` und die
-- uebrigen im zulaessigen Wertebereich bleiben, obwohl ab hier niemand mehr
-- welche schreibt. Dasselbe gilt fuer `subject_type`.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member',
    'treatment_note',
    'prescription',
    'treatment_basis',
    'text_snippet',
    'user_account',
    'patient_file',
    'storage_deletion_order'
  ));

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'patient.care_concluded',
    'patient.care_reopened',
    'legal_hold.placed',
    'legal_hold.released',
    'retention.applied',
    'retention.reapplied',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.no_show',
    'appointment.completed',
    'appointment.documented',
    'appointment.reopened',
    'appointment.notified',
    'organization.appointment_grid_changed',
    'organization.documentation_deadline_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'staff_member.created',
    'staff_member.updated',
    'staff_member.status_changed',
    'staff_account.invited',
    'staff_account.invitation_revoked',
    'staff_account.invitation_accepted',
    'staff_account.roles_changed',
    'staff_account.locked',
    'staff_account.unlocked',
    'staff_account.password_reset_requested',
    'account.password_changed',
    'account.sessions_ended',
    'account.mfa_enrolled',
    'account.mfa_removed',
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.auto_finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed',
    -- Bis GRD-001 geschrieben, seitdem nur noch gelesen (ADR-020 Punkt 8).
    'prescription.viewed',
    'prescription.created',
    'prescription.updated',
    'prescription.deleted',
    'treatment_basis.viewed',
    'treatment_basis.created',
    'treatment_basis.updated',
    'treatment_basis.deleted',
    'patient_file.uploaded',
    'patient_file.link_issued',
    'patient_file.deleted',
    'patient_file.type_corrected',
    'storage_deletion.claimed',
    'storage_deletion.receipted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted'
  ));

-- -----------------------------------------------------------------------------
-- 4b. Wo der Tabellenname als Text steht
--
-- Zwei Stellen fuehren Tabellen ueber ihren NAMEN und nicht ueber eine
-- Fremdschluesselbeziehung. Beide muessen mitwandern, sonst zeigen sie ins
-- Leere:
--
--   * `retention_assignments` ordnet jeder Tabelle in `public` ihre Datenklasse
--     zu (ADR-008, LOE-001). Eine Zuordnung auf eine Tabelle, die es nicht mehr
--     gibt, ist genau der Fall, den `pnpm test:db` abweist - zu Recht.
--   * `deletion_journal` haelt fest, welche Zeile welcher Tabelle geloescht
--     wurde, damit sich eine Loeschung nach einer Wiederherstellung ERNEUT
--     anwenden laesst (ADR-008 Punkt 9, LOE-002). Eine Zeile mit dem alten
--     Namen waere nach der Umbenennung nicht mehr anwendbar - der Journaleintrag
--     verloere seinen Zweck. Das ist kein Umschreiben von Historie im Sinne von
--     ADR-010: WAS geloescht wurde, bleibt unveraendert; nur der Ort traegt
--     seinen neuen Namen. Der Auditeintrag daneben bleibt unberuehrt.
-- -----------------------------------------------------------------------------
update public.retention_assignments
   set table_name = 'treatment_bases',
       scope_note = 'Behandlungsgrundlagen. Fallen mit der Akte; werden im Lauf vor der Patientenzeile geloescht (FK restrict).'
 where table_name = 'prescriptions';

update public.retention_assignments
   set table_name = 'treatment_base_items',
       scope_note = 'Positionen einer Behandlungsgrundlage. Fallen mit der Grundlage (FK on delete cascade).'
 where table_name = 'prescription_items';

update public.deletion_journal
   set target_table = 'treatment_bases'
 where target_table = 'prescriptions';

update public.deletion_journal
   set target_table = 'treatment_base_items'
 where target_table = 'prescription_items';

-- -----------------------------------------------------------------------------
-- 5. Die Terminsicht
--
-- Beim Umbenennen einer Spalte zieht PostgreSQL die Definition einer Sicht mit,
-- ihren AUSGABENAMEN aber nicht: `appointment_directory` haette weiter eine
-- Spalte `prescription_id` geliefert, die aus `treatment_basis_id` kommt. Die
-- Sicht wird deshalb neu erstellt.
-- -----------------------------------------------------------------------------
drop view public.appointment_directory;

create view public.appointment_directory
with (security_invoker = true) as
select
  a.id,
  a.organization_id,
  a.patient_id,
  a.staff_member_id,
  a.location_id,
  a.treatment_basis_id,
  a.appointment_type,
  a.kind,
  a.title,
  a.event_group_id,
  a.event_series_id,
  a.status,
  a.starts_at,
  a.ends_at,
  a.updated_at,
  a.visit_street,
  a.visit_house_number,
  a.visit_postal_code,
  a.visit_city,
  a.completed_at,
  a.cancellation_reason,
  a.cancellation_received_at,
  a.fee_basis,
  a.no_show_recorded_at,
  a.no_show_protocol_confirmed,
  pp.given_name  as patient_given_name,
  pp.family_name as patient_family_name,
  sp.given_name  as staff_given_name,
  sp.family_name as staff_family_name,
  l.name         as location_name,
  o.time_zone    as organization_time_zone,
  -- Nur die Wege, nicht wer wann vermerkt hat: Akteure stehen im Auditlog
  -- (ADR-010), und die Detailansicht zeigt sie auch sonst nicht.
  coalesce(
    (select array_agg(distinct n.channel order by n.channel)
     from public.appointment_notifications n
     where n.appointment_id = a.id
       and n.notified_at >= a.updated_at),
    array[]::text[]
  ) as notification_channels
from public.appointments a
left join public.patients p  on p.id  = a.patient_id
left join public.persons pp  on pp.id = p.person_id
join public.staff_members sm on sm.id = a.staff_member_id
join public.persons sp       on sp.id = sm.person_id
join public.organizations o  on o.id  = a.organization_id
left join public.locations l on l.id = a.location_id;

comment on view public.appointment_directory is
  'Terminsicht fuer die Anwendung, Behandlungen wie Ereignisse. security_invoker: RLS der Basistabellen gilt unveraendert. Enthaelt nur organisatorische Angaben. Die vermerkende Person bleibt aussen vor - Akteure stehen im Auditlog (ADR-010). Seit CAL-017 mit der Gruppenkennung des Ereignisses, seit CAL-018 mit der Protokollbestaetigung des Nichtantreffens, seit CAL-021 mit der Serienkennung der Dauerfehlzeit, seit GRD-001 mit der Behandlungsgrundlage statt der Verordnung.';

revoke all on public.appointment_directory from anon, authenticated;
grant select on public.appointment_directory to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Die alten Funktionen
--
-- Zuerst weg, dann neu: `create or replace` kann weder einen Namen noch einen
-- Parameternamen aendern. Gedroppt wird nur, was eines von beidem braucht - die
-- uebrigen acht behalten ihre Signatur und damit ihre Rechte.
--
-- Auf keine dieser Funktionen zeigt eine Policy, ein Trigger oder eine
-- Constraint; die einzigen Aufrufer stehen in derselben Liste und werden unten
-- allesamt neu erstellt.
-- -----------------------------------------------------------------------------
drop function app.assert_prescription_input(uuid, uuid, text, date);
drop function app.can_read_prescription_clinical();
drop function app.can_read_prescriptions();
drop function app.can_write_patient_file(text, uuid);
drop function app.can_write_prescriptions();
drop function app.patient_prescription_ids(uuid, uuid);
drop function app.prescription_items_json(uuid);
drop function app.prescription_slot_counts(uuid, uuid);
drop function app.write_prescription_items(uuid, uuid, uuid, jsonb);
drop function public.create_appointment(uuid, uuid, text, date, time without time zone, time without time zone, uuid, boolean, uuid, boolean);
drop function public.create_appointment_series(uuid, uuid, uuid, text, jsonb, uuid, boolean);
drop function public.create_prescription(uuid, uuid, text, date, jsonb, text, text, text, text, text, text);
drop function public.delete_prescription(uuid);
drop function public.get_prescription(uuid);
drop function public.get_prescription_slots(uuid);
drop function public.list_patient_appointments(uuid, boolean, integer, timestamp with time zone, uuid, uuid);
drop function public.list_patient_files(uuid, uuid);
drop function public.list_patient_prescription_slots(uuid);
drop function public.list_patient_prescriptions(uuid);
drop function public.list_patient_prescriptions_clinical(uuid);
drop function public.prepare_patient_file_upload(uuid, uuid, text, text, text, bigint, text);
drop function public.update_prescription(uuid, uuid, text, date, jsonb, text, text, text, text, text, text);

-- -----------------------------------------------------------------------------
-- 7. Die Funktionen
--
-- Reihenfolge nach Abhaengigkeit: Wer aufgerufen wird, steht vor dem Aufrufer.
-- PostgreSQL prueft den Rumpf einer SQL-Funktion beim Anlegen, deshalb muessen
-- die Hilfsfunktionen aus `app` zuerst da sein.
--
-- Die Rumpfe sind unveraendert bis auf die Bezeichner. Die einzige fachliche
-- Aenderung steht in `app.assert_treatment_basis_input`.
-- -----------------------------------------------------------------------------

-- app.can_read_treatment_bases (umbenannt)
create or replace function app.can_read_treatment_bases()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

comment on function app.can_read_treatment_bases() is
  'Rollen mit Zugriff auf die organisatorische Sicht einer Behandlungsgrundlage: Kontingent, Verordner:in, Zeitraum (VER-001, ANN-011, ADR-020).';

revoke all on function app.can_read_treatment_bases() from public, anon;
grant execute on function app.can_read_treatment_bases() to authenticated;


-- app.can_read_treatment_basis_clinical (umbenannt)
create or replace function app.can_read_treatment_basis_clinical()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

comment on function app.can_read_treatment_basis_clinical() is
  'Rollen mit Zugriff auf die klinischen Felder einer Behandlungsgrundlage: alle vier Praxisrollen, deckungsgleich mit app.can_read_treatment_note() (ADR-004 Fassung 2, E15, ROL-002). Schreiben regelt app.can_write_treatment_bases() ohne office (ANN-011).';

revoke all on function app.can_read_treatment_basis_clinical() from public, anon;
grant execute on function app.can_read_treatment_basis_clinical() to authenticated;


-- app.can_write_treatment_bases (umbenannt)
create or replace function app.can_write_treatment_bases()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead')
$$;

comment on function app.can_write_treatment_bases() is
  'Rollen, die Behandlungsgrundlagen anlegen, aendern und loeschen duerfen (ANN-011). Ohne office: Erfassen setzt Lesen der Diagnose voraus.';

revoke all on function app.can_write_treatment_bases() from public, anon;
grant execute on function app.can_write_treatment_bases() to authenticated;


-- app.can_write_patient_file (neuer Parametername)
create or replace function app.can_write_patient_file(p_document_type text, p_treatment_basis_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case
      when app.patient_file_type_is_clinical(p_document_type)
        then app.can_write_clinical_patient_files()
      else app.can_write_organisational_patient_files()
    end,
    false
  )
  and (p_treatment_basis_id is null or app.can_write_treatment_bases())
$$;

comment on function app.can_write_patient_file(text, uuid) is
  'Schreibrecht an einer Datei nach ADR-017 Punkt 13: Dokumentart plus, bei einer Datei an der Behandlungsgrundlage, das Schreibrecht an Behandlungsgrundlagen.';

revoke all on function app.can_write_patient_file(text, uuid) from public, anon;
grant execute on function app.can_write_patient_file(text, uuid) to authenticated;


-- app.may_upload_patient_file_object (nur Rumpf)
create or replace function app.may_upload_patient_file_object(p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_files f
    where f.object_key = p_object_key
      and f.status = 'pending'
      and f.organization_id = app.current_organization_id()
      and app.can_write_patient_file(f.document_type, f.treatment_basis_id)
  )
$$;


-- app.patient_treatment_basis_ids (umbenannt)
create or replace function app.patient_treatment_basis_ids(p_organization_id uuid, p_patient_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_agg(v.id order by v.issued_on desc, v.created_at desc, v.id desc)
  from (
    select p.id, p.issued_on, p.created_at
    from public.treatment_bases p
    where p.organization_id = p_organization_id
      and p.patient_id = p_patient_id
    order by p.issued_on desc, p.created_at desc, p.id desc
    limit 200
  ) v
$$;

comment on function app.patient_treatment_basis_ids(uuid, uuid) is
  'Behandlungsgrundlagen einer Patientin in der Akte, neueste zuerst, hoechstens 200 (VER-002). Gemeinsame Grundlage der organisatorischen und der klinischen Sicht.';

revoke all on function app.patient_treatment_basis_ids(uuid, uuid) from public, anon, authenticated;


-- app.treatment_base_items_json (umbenannt)
create or replace function app.treatment_base_items_json(p_treatment_basis_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',                  i.id,
        'sort_order',          i.sort_order,
        'remedy',              i.remedy,
        'prescribed_quantity', i.prescribed_quantity,
        'used_quantity',       i.used_quantity,
        'remaining_quantity',  i.prescribed_quantity - i.used_quantity
      )
      order by i.sort_order
    ),
    '[]'::jsonb
  )
  from public.treatment_base_items i
  where i.treatment_basis_id = p_treatment_basis_id
$$;

comment on function app.treatment_base_items_json(uuid) is
  'Positionen einer Behandlungsgrundlage als JSON, inklusive der gerechneten Restmenge (VER-002, ANN-012).';

revoke all on function app.treatment_base_items_json(uuid) from public, anon, authenticated;


-- app.treatment_basis_slot_counts (umbenannt)
create or replace function app.treatment_basis_slot_counts(
  p_treatment_basis_id uuid,
  p_organization_id uuid,
  OUT prescribed integer,
  OUT used integer,
  OUT planned integer,
  OUT remaining integer
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select coalesce(sum(i.prescribed_quantity), 0), coalesce(sum(i.used_quantity), 0)
    into prescribed, used
  from public.treatment_base_items i
  join public.treatment_bases p on p.id = i.treatment_basis_id
  where i.treatment_basis_id = p_treatment_basis_id
    and p.organization_id = p_organization_id;

  select count(*)
    into planned
  from public.appointments a
  where a.treatment_basis_id = p_treatment_basis_id
    and a.organization_id = p_organization_id
    and a.status <> 'cancelled';

  remaining := greatest(coalesce(prescribed, 0) - greatest(coalesce(used, 0), planned), 0);
end;
$$;

comment on function app.treatment_basis_slot_counts(uuid, uuid) is
  'Kontingent einer Behandlungsgrundlage: verordnet beziehungsweise vereinbart, genutzt, verplant und offen (CAL-007, ANN-038, ADR-020 Punkt 5). Nur fuer die serverseitigen Lese- und Schreibpfade.';

revoke all on function app.treatment_basis_slot_counts(uuid, uuid) from public, anon, authenticated;


-- app.assert_treatment_basis_input (umbenannt)
create or replace function app.assert_treatment_basis_input(
  p_organization_id uuid,
  p_prescriber_id uuid,
  p_treatment_basis_kind text,
  p_issued_on date
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_treatment_basis_kind not in ('first', 'follow_up', 'self_pay') then
    raise exception 'unknown treatment basis kind' using errcode = '22023';
  end if;

  -- Pflicht fuer beide Bauarten: beim Rezept das Ausstellungsdatum, beim
  -- Selbstzahler der Tag der Vereinbarung (ADR-020 Punkt 3).
  if p_issued_on is null then
    raise exception 'issued_on is required' using errcode = '22023';
  end if;

  -- Ein Ausstellungsdatum in der Zukunft ist in der Praxis ein Tippfehler und
  -- keine Grundlage (PROJECT_PRINCIPLES.md 13).
  if p_issued_on > current_date then
    raise exception 'issued_on must not be in the future' using errcode = '22023';
  end if;

  -- ADR-020 Punkt 3: Was eine Verordnung braucht, verlangt die Datenbank weiter
  -- - aber nur von ihr. Ein Selbstzahler hat keine Verordner:in, und eine
  -- mitgeschickte ist keine Nachlaessigkeit, sondern ein Widerspruch: entweder
  -- der Aufrufer meint die falsche Bauart, oder er meint die falsche Person.
  if p_treatment_basis_kind = 'self_pay' then
    if p_prescriber_id is not null then
      raise exception 'self_pay must not carry a prescriber' using errcode = '22023';
    end if;
    return;
  end if;

  if p_prescriber_id is null then
    raise exception 'prescriber is required for a prescription' using errcode = '22023';
  end if;

  -- Verordner:in ausschliesslich in der eigenen Organisation suchen: eine
  -- fremde und eine unbekannte ID sind nicht zu unterscheiden.
  if not exists (
    select 1 from public.prescribers v
    where v.id = p_prescriber_id and v.organization_id = p_organization_id
  ) then
    raise exception 'prescriber not found' using errcode = 'P0002';
  end if;
end;
$$;

comment on function app.assert_treatment_basis_input(uuid, uuid, text, date) is
  'Prueft Bauart, Ausstellungsdatum und Verordner:in einer Behandlungsgrundlage (VER-003, ADR-020 Punkt 3): Verordner:in Pflicht bei first und follow_up, ausgeschlossen bei self_pay.';

revoke all on function app.assert_treatment_basis_input(uuid, uuid, text, date) from public, anon, authenticated;


-- app.write_treatment_base_items (umbenannt)
create or replace function app.write_treatment_base_items(
  p_treatment_basis_id uuid,
  p_organization_id uuid,
  p_actor uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eintrag       jsonb;
  v_position      smallint := 0;
  v_remedy        text;
  v_verordnet_num numeric;
  v_genutzt_num   numeric;
  v_verordnet     integer;
  v_genutzt       integer;
  v_id            uuid;
  v_behalten      uuid[] := array[]::uuid[];
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'at least one treatment basis item is required' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many treatment basis items' using errcode = '22023';
  end if;

  for v_eintrag in select * from jsonb_array_elements(p_items) loop
    v_position := v_position + 1;

    v_remedy := nullif(btrim(v_eintrag ->> 'remedy'), '');
    if v_remedy is null then
      raise exception 'remedy is required' using errcode = '22023';
    end if;

    -- Zahlen ausdruecklich als Zahl lesen: ein Text im Feld soll eine klare
    -- Meldung erzeugen und keine stillschweigende Umdeutung.
    if jsonb_typeof(v_eintrag -> 'prescribed_quantity') <> 'number'
       or jsonb_typeof(coalesce(v_eintrag -> 'used_quantity', '0'::jsonb)) <> 'number' then
      raise exception 'quantities must be numbers' using errcode = '22023';
    end if;

    -- Ueber numeric statt direkt ueber integer lesen: eine Kommazahl
    -- ("6.5") soll dieselbe sprechende Meldung wie ein Text ausloesen, statt
    -- eines rohen "invalid input syntax for type integer"-Fehlers, den der
    -- direkte Cast einer Dezimalzahl auf integer wirft.
    v_verordnet_num := (v_eintrag ->> 'prescribed_quantity')::numeric;
    v_genutzt_num   := coalesce((v_eintrag ->> 'used_quantity')::numeric, 0);

    if v_verordnet_num <> trunc(v_verordnet_num) or v_genutzt_num <> trunc(v_genutzt_num) then
      raise exception 'quantities must be whole numbers' using errcode = '22023';
    end if;

    v_verordnet := v_verordnet_num::integer;
    v_genutzt   := v_genutzt_num::integer;

    if v_verordnet < 1 or v_verordnet > 500 then
      raise exception 'prescribed quantity out of range' using errcode = '22023';
    end if;

    if v_genutzt < 0 or v_genutzt > v_verordnet then
      raise exception 'used quantity out of range' using errcode = '22023';
    end if;

    -- Eine mitgelieferte id zaehlt nur, wenn sie zu dieser Grundlage gehoert.
    select i.id into v_id
    from public.treatment_base_items i
    where i.treatment_basis_id = p_treatment_basis_id
      and i.id = nullif(v_eintrag ->> 'id', '')::uuid;

    if v_id is null then
      insert into public.treatment_base_items (
        organization_id, treatment_basis_id, sort_order, remedy,
        prescribed_quantity, used_quantity, created_by
      )
      values (
        p_organization_id, p_treatment_basis_id, v_position, v_remedy,
        v_verordnet, v_genutzt, p_actor
      )
      returning id into v_id;
    else
      update public.treatment_base_items
         set sort_order          = v_position,
             remedy              = v_remedy,
             prescribed_quantity = v_verordnet,
             used_quantity       = v_genutzt
       where id = v_id;
    end if;

    v_behalten := array_append(v_behalten, v_id);
  end loop;

  -- Was nicht mehr im Feld steht, ist entfernt worden.
  delete from public.treatment_base_items i
  where i.treatment_basis_id = p_treatment_basis_id
    and not (i.id = any (v_behalten));
end;
$$;

comment on function app.write_treatment_base_items(uuid, uuid, uuid, jsonb) is
  'Schreibt die Positionen einer Behandlungsgrundlage aus dem JSON-Feld: prueft Bezeichnung und Mengen, vergibt die Reihenfolge und entfernt weggefallene Positionen (VER-003).';

revoke all on function app.write_treatment_base_items(uuid, uuid, uuid, jsonb) from public, anon, authenticated;


-- app.delete_patient_record (nur Rumpf)
create or replace function app.delete_patient_record(
  p_patient_id uuid,
  p_run_id uuid,
  p_due_at timestamp with time zone
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_person uuid;
  v_count  integer := 0;
  v_n      integer;
begin
  select p.organization_id, p.person_id
    into v_org, v_person
  from public.patients p
  where p.id = p_patient_id;

  if not found then
    return 0;
  end if;

  with geloescht as (
    delete from public.treatment_notes t
     where t.appointment_id in (
       select a.id from public.appointments a where a.patient_id = p_patient_id
     )
    returning t.id, t.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'treatment_notes', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.treatment_bases pr
     where pr.patient_id = p_patient_id
    returning pr.id, pr.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'treatment_bases', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.appointments a
     where a.patient_id = p_patient_id
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'appointments', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.legal_holds h
     where h.subject_type = 'patient'
       and h.subject_id = p_patient_id
    returning h.id, h.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'legal_holds', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.patients p
     where p.id = p_patient_id
    returning p.id, p.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'patients', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.persons pe
     where pe.id = v_person
       and not exists (select 1 from public.patients x      where x.person_id = pe.id)
       and not exists (select 1 from public.staff_members x where x.person_id = pe.id)
       and not exists (select 1 from public.user_profiles x where x.person_id = pe.id)
    returning pe.id, pe.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'persons', g.id, 'personenstammdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

comment on function app.delete_patient_record(uuid, uuid, timestamp with time zone) is
  'Loescht eine Patientenakte vollstaendig in Fremdschluesselreihenfolge und schreibt je eigenstaendig geloeschter Zeile eine Journalzeile (ADR-008, LOE-002a). Prueft KEINEN Legal Hold - das tut der Aufrufer.';


-- public.create_treatment_basis (umbenannt)
create or replace function public.create_treatment_basis(
  p_patient_id uuid,
  p_prescriber_id uuid,
  p_treatment_basis_kind text,
  p_issued_on date,
  p_items jsonb,
  p_frequency_note text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text,
  p_diagnosis text DEFAULT NULL::text,
  p_therapy_goal text DEFAULT NULL::text,
  p_prescriber_note text DEFAULT NULL::text,
  p_follow_up_recommendation text DEFAULT NULL::text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. ANN-011: ohne office.
  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  -- Patient ausschliesslich in der eigenen Organisation suchen.
  if not exists (
    select 1 from public.patients pa
    where pa.id = p_patient_id and pa.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  perform app.assert_treatment_basis_input(v_org, p_prescriber_id, p_treatment_basis_kind, p_issued_on);

  insert into public.treatment_bases (
    organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on,
    frequency_note, note, diagnosis, therapy_goal, prescriber_note,
    follow_up_recommendation, created_by, updated_by
  )
  values (
    v_org, p_patient_id, p_prescriber_id, p_treatment_basis_kind, p_issued_on,
    nullif(btrim(p_frequency_note), ''),
    nullif(btrim(p_note), ''),
    nullif(btrim(p_diagnosis), ''),
    nullif(btrim(p_therapy_goal), ''),
    nullif(btrim(p_prescriber_note), ''),
    nullif(btrim(p_follow_up_recommendation), ''),
    v_actor, v_actor
  )
  returning id into v_id;

  perform app.write_treatment_base_items(v_id, v_org, v_actor, p_items);

  -- Auditeintrag ohne klinische Inhalte: Akteur, Organisation,
  -- Bezug zur Grundlage, Patientenbezug, Zeitpunkt und Ergebnis (ADR-010).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.created', 'treatment_basis', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', p_patient_id)
  );

  return v_id;
end;
$$;

comment on function public.create_treatment_basis(uuid, uuid, text, date, jsonb, text, text, text, text, text, text) is
  'Legt eine Behandlungsgrundlage samt Positionen atomar an und protokolliert treatment_basis.created (VER-003, ADR-010). Nur owner, therapist und team_lead (ANN-011).';

revoke all on function public.create_treatment_basis(uuid, uuid, text, date, jsonb, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_treatment_basis(uuid, uuid, text, date, jsonb, text, text, text, text, text, text) to authenticated;


-- public.update_treatment_basis (umbenannt)
create or replace function public.update_treatment_basis(
  p_treatment_basis_id uuid,
  p_prescriber_id uuid,
  p_treatment_basis_kind text,
  p_issued_on date,
  p_items jsonb,
  p_frequency_note text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text,
  p_diagnosis text DEFAULT NULL::text,
  p_therapy_goal text DEFAULT NULL::text,
  p_prescriber_note text DEFAULT NULL::text,
  p_follow_up_recommendation text DEFAULT NULL::text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  perform app.assert_treatment_basis_input(v_org, p_prescriber_id, p_treatment_basis_kind, p_issued_on);

  update public.treatment_bases
     set prescriber_id            = p_prescriber_id,
         treatment_basis_kind        = p_treatment_basis_kind,
         issued_on                = p_issued_on,
         frequency_note           = nullif(btrim(p_frequency_note), ''),
         note                     = nullif(btrim(p_note), ''),
         diagnosis                = nullif(btrim(p_diagnosis), ''),
         therapy_goal             = nullif(btrim(p_therapy_goal), ''),
         prescriber_note          = nullif(btrim(p_prescriber_note), ''),
         follow_up_recommendation = nullif(btrim(p_follow_up_recommendation), ''),
         updated_at               = now(),
         updated_by               = v_actor
   where id = p_treatment_basis_id;

  perform app.write_treatment_base_items(p_treatment_basis_id, v_org, v_actor, p_items);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.updated', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );

  return p_treatment_basis_id;
end;
$$;

comment on function public.update_treatment_basis(uuid, uuid, text, date, jsonb, text, text, text, text, text, text) is
  'Aendert eine Behandlungsgrundlage samt Positionen atomar und protokolliert treatment_basis.updated (VER-003, ADR-010). Die Patientin bleibt unveraendert.';

revoke all on function public.update_treatment_basis(uuid, uuid, text, date, jsonb, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_treatment_basis(uuid, uuid, text, date, jsonb, text, text, text, text, text, text) to authenticated;


-- public.delete_treatment_basis (umbenannt)
create or replace function public.delete_treatment_basis(p_treatment_basis_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  delete from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org
  returning p.patient_id into v_patient_id;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.deleted', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );
end;
$$;

comment on function public.delete_treatment_basis(uuid) is
  'Loescht eine falsch erfasste Behandlungsgrundlage endgueltig und protokolliert treatment_basis.deleted (VER-003, ADR-008 Punkt 10, Art. 16 DSGVO). Nur owner, therapist und team_lead.';

revoke all on function public.delete_treatment_basis(uuid) from public, anon;
grant execute on function public.delete_treatment_basis(uuid) to authenticated;


-- public.get_treatment_basis (umbenannt)
create or replace function public.get_treatment_basis(p_treatment_basis_id uuid)
returns TABLE(id uuid, patient_id uuid, prescriber_id uuid, prescriber_name text, prescriber_practice_name text, treatment_basis_kind text, issued_on date, frequency_note text, note text, items jsonb, updated_at timestamp with time zone, diagnosis text, therapy_goal text, prescriber_note text, follow_up_recommendation text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_basis_clinical() then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  -- Eine fremde und eine unbekannte ID liefern beide nichts.
  if not found then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.viewed', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );

  return query
    select
      p.id,
      p.patient_id,
      p.prescriber_id,
      -- nullif, damit beim Selbstzahler wirklich NICHTS dasteht: concat_ws
      -- ueberspringt Nullwerte und lieferte sonst den leeren String - eine
      -- Angabe, die es nicht gibt (GRD-001, ADR-020 Punkt 3).
      nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
      v.practice_name,
      p.treatment_basis_kind,
      p.issued_on,
      p.frequency_note,
      p.note,
      app.treatment_base_items_json(p.id),
      p.updated_at,
      p.diagnosis,
      p.therapy_goal,
      p.prescriber_note,
      p.follow_up_recommendation
    from public.treatment_bases p
    -- LEFT JOIN seit GRD-001: Ein Selbstzahler hat keine Verordner:in
    -- (ADR-020 Punkt 3). Ein innerer Verbund liesse ihn aus der Projektion
    -- fallen - die Zeile waere da, die Akte zeigte sie nicht.
    left join public.prescribers v on v.id = p.prescriber_id
    where p.id = p_treatment_basis_id;
end;
$$;

comment on function public.get_treatment_basis(uuid) is
  'Eine Behandlungsgrundlage mit allen Feldern (VER-003, ROL-002, ADR-020). Protokolliert treatment_basis.viewed (ADR-010). Lesen alle vier Praxisrollen; aendern duerfen nur owner, therapist und team_lead (app.can_write_treatment_bases, ANN-011).';

revoke all on function public.get_treatment_basis(uuid) from public, anon;
grant execute on function public.get_treatment_basis(uuid) to authenticated;


-- public.list_patient_treatment_bases (umbenannt)
create or replace function public.list_patient_treatment_bases(p_patient_id uuid)
returns TABLE(id uuid, prescriber_id uuid, prescriber_name text, prescriber_practice_name text, treatment_basis_kind text, issued_on date, frequency_note text, note text, items jsonb, updated_at timestamp with time zone)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_ids  uuid[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_read_treatment_bases() then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  v_ids := app.patient_treatment_basis_ids(v_org, p_patient_id);
  if v_ids is null then
    return;
  end if;

  return query
    select
      p.id,
      p.prescriber_id,
      -- nullif, damit beim Selbstzahler wirklich NICHTS dasteht: concat_ws
      -- ueberspringt Nullwerte und lieferte sonst den leeren String - eine
      -- Angabe, die es nicht gibt (GRD-001, ADR-020 Punkt 3).
      nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
      v.practice_name,
      p.treatment_basis_kind,
      p.issued_on,
      p.frequency_note,
      -- ANN-011: die organisatorische Bemerkung ja, die klinischen Felder
      -- ausdruecklich nicht. Diese Spaltenliste ist die Grenze.
      p.note,
      app.treatment_base_items_json(p.id),
      p.updated_at
    from public.treatment_bases p
    -- LEFT JOIN seit GRD-001: Ein Selbstzahler hat keine Verordner:in
    -- (ADR-020 Punkt 3). Ein innerer Verbund liesse ihn aus der Projektion
    -- fallen - die Zeile waere da, die Akte zeigte sie nicht.
    left join public.prescribers v on v.id = p.prescriber_id
    where p.id = any (v_ids)
    order by p.issued_on desc, p.created_at desc, p.id desc;
end;
$$;

comment on function public.list_patient_treatment_bases(uuid) is
  'Organisatorische Sicht der Behandlungsgrundlagen einer Patientin (VER-002, ANN-011): Verordner:in, Bauart, Datum, Frequenz und Kontingent. Ohne klinische Felder.';

revoke all on function public.list_patient_treatment_bases(uuid) from public, anon;
grant execute on function public.list_patient_treatment_bases(uuid) to authenticated;


-- public.list_patient_treatment_bases_clinical (umbenannt)
create or replace function public.list_patient_treatment_bases_clinical(p_patient_id uuid)
returns TABLE(id uuid, prescriber_id uuid, prescriber_name text, prescriber_practice_name text, treatment_basis_kind text, issued_on date, frequency_note text, note text, items jsonb, updated_at timestamp with time zone, diagnosis text, therapy_goal text, prescriber_note text, follow_up_recommendation text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_ids   uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Dieselbe Rollenmenge wie bei der Behandlungsdokumentation: die Grundlage
  -- oeffnet keinen zweiten Weg zu klinischem Freitext (4.3, 4.6).
  if not app.can_read_treatment_basis_clinical() then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  v_ids := app.patient_treatment_basis_ids(v_org, p_patient_id);
  if v_ids is null then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'treatment_basis.viewed', 'treatment_basis', unnest(v_ids), 'success',
         jsonb_build_object('surface', 'web', 'patient_id', p_patient_id);

  return query
    select
      p.id,
      p.prescriber_id,
      -- nullif, damit beim Selbstzahler wirklich NICHTS dasteht: concat_ws
      -- ueberspringt Nullwerte und lieferte sonst den leeren String - eine
      -- Angabe, die es nicht gibt (GRD-001, ADR-020 Punkt 3).
      nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
      v.practice_name,
      p.treatment_basis_kind,
      p.issued_on,
      p.frequency_note,
      p.note,
      app.treatment_base_items_json(p.id),
      p.updated_at,
      p.diagnosis,
      p.therapy_goal,
      p.prescriber_note,
      -- ANN-014: die Empfehlung der Therapeut:in, von ihr selbst erfasst.
      p.follow_up_recommendation
    from public.treatment_bases p
    -- LEFT JOIN seit GRD-001: Ein Selbstzahler hat keine Verordner:in
    -- (ADR-020 Punkt 3). Ein innerer Verbund liesse ihn aus der Projektion
    -- fallen - die Zeile waere da, die Akte zeigte sie nicht.
    left join public.prescribers v on v.id = p.prescriber_id
    where p.id = any (v_ids)
    order by p.issued_on desc, p.created_at desc, p.id desc;
end;
$$;

comment on function public.list_patient_treatment_bases_clinical(uuid) is
  'Klinische Sicht der Behandlungsgrundlagen einer Patientin (VER-002, ROL-002): zusaetzlich Diagnose, Therapieziel, Hinweise der Verordner:in und Empfehlung zum Verordnungsende. Protokolliert je Grundlage treatment_basis.viewed (ADR-010). owner, therapist, team_lead und office.';

revoke all on function public.list_patient_treatment_bases_clinical(uuid) from public, anon;
grant execute on function public.list_patient_treatment_bases_clinical(uuid) to authenticated;


-- public.get_treatment_basis_slots (umbenannt)
create or replace function public.get_treatment_basis_slots(p_treatment_basis_id uuid)
returns TABLE(patient_id uuid, frequency_note text, prescribed integer, used integer, planned integer, remaining integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_zahlen record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_bases() then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  select p.patient_id, p.frequency_note
    into patient_id, frequency_note
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  select * into v_zahlen from app.treatment_basis_slot_counts(p_treatment_basis_id, v_org);
  prescribed := v_zahlen.prescribed;
  used       := v_zahlen.used;
  planned    := v_zahlen.planned;
  remaining  := v_zahlen.remaining;
  return next;
end;
$$;

comment on function public.get_treatment_basis_slots(uuid) is
  'Kontingent und Frequenz einer Behandlungsgrundlage fuer die Serienplanung (CAL-007). Ohne klinische Felder.';

revoke all on function public.get_treatment_basis_slots(uuid) from public, anon;
grant execute on function public.get_treatment_basis_slots(uuid) to authenticated;


-- public.list_patient_treatment_basis_slots (umbenannt)
create or replace function public.list_patient_treatment_basis_slots(p_patient_id uuid)
returns TABLE(treatment_basis_id uuid, prescribed integer, used integer, planned integer, upcoming integer, remaining integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_bases() then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  return query
    select
      p.id,
      zahlen.prescribed,
      zahlen.used,
      zahlen.planned,
      (
        select count(*)::integer
        from public.appointments a
        where a.treatment_basis_id = p.id
          and a.organization_id = v_org
          and a.status <> 'cancelled'
          and a.starts_at > now()
      ),
      zahlen.remaining
    from public.treatment_bases p
    cross join lateral app.treatment_basis_slot_counts(p.id, v_org) zahlen
    where p.organization_id = v_org
      and p.patient_id = p_patient_id
    order by p.issued_on desc, p.id desc;
end;
$$;

comment on function public.list_patient_treatment_basis_slots(uuid) is
  'Leistungseinheiten und Terminzahlen je Behandlungsgrundlage einer Patient:in (AKTE-002): verordnet, genutzt, verplant, noch bevorstehend und offen. Rein organisatorisch - die klinischen Felder bleiben list_patient_treatment_bases_clinical vorbehalten.';

revoke all on function public.list_patient_treatment_basis_slots(uuid) from public, anon;
grant execute on function public.list_patient_treatment_basis_slots(uuid) to authenticated;


-- public.create_appointment (neuer Parametername)
create or replace function public.create_appointment(
  p_patient_id uuid,
  p_staff_member_id uuid,
  p_appointment_type text,
  p_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_location_id uuid DEFAULT NULL::uuid,
  p_allow_outside_working_hours boolean DEFAULT false,
  p_treatment_basis_id uuid DEFAULT NULL::uuid,
  p_confirmed_past boolean DEFAULT false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor          uuid;
  v_org            uuid;
  v_time_zone      text;
  v_heute          date;
  v_starts_at      timestamptz;
  v_ends_at        timestamptz;
  v_patient_status text;
  v_street         text;
  v_house          text;
  v_postal         text;
  v_city           text;
  v_location_id    uuid;
  v_appointment_id uuid;
  v_grid           smallint;
  v_ausserhalb     boolean;
  v_verordnung     uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  if p_appointment_type is null
     or p_appointment_type not in ('home_visit', 'practice', 'video') then
    raise exception 'unknown appointment type' using errcode = '22023';
  end if;

  if p_date is null or p_start_time is null or p_end_time is null then
    raise exception 'date, start time and end time are required' using errcode = '22023';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;

  select o.time_zone, o.appointment_grid_minutes
    into v_time_zone, v_grid
  from public.organizations o
  where o.id = v_org;

  if v_time_zone is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_heute := (now() at time zone v_time_zone)::date;

  -- FIX-019, ANN-057: Die Vergangenheit ist erlaubt, aber nie unbemerkt.
  -- Ohne Bestaetigung bleibt die Abweisung aus CAL-003 - die Oberflaeche
  -- fragt nach und schickt den Vorgang bestaetigt neu.
  if p_date < v_heute and not coalesce(p_confirmed_past, false) then
    raise exception 'appointment date is in the past' using errcode = '22023';
  end if;

  if not app.is_on_appointment_grid(p_start_time, v_grid) then
    raise exception 'start time is not on the appointment grid' using errcode = '22023';
  end if;

  -- PROJECT_PRINCIPLES.md 0.11 Abschnitt 8.1: Die Laenge ist frei, aber sie
  -- liegt im Raster - mindestens ein Rasterschritt, ein ganzes Vielfaches
  -- davon (CAL-020, ANN-056). Mit dem Beginn im Raster liegt so auch das Ende
  -- auf einem Rasterpunkt.
  if not app.is_valid_treatment_length(p_end_time - p_start_time, v_grid) then
    raise exception 'appointment length is not on the appointment grid' using errcode = '22023';
  end if;

  v_starts_at := (p_date + p_start_time) at time zone v_time_zone;
  v_ends_at   := (p_date + p_end_time)   at time zone v_time_zone;

  select p.status into v_patient_status
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if v_patient_status <> 'active' then
    raise exception 'patient is not in active care' using errcode = '22023';
  end if;

  -- Die Grundlage muss zur Organisation UND zu derselben Patient:in gehoeren.
  -- Eine fremde und eine unbekannte ID erzeugen dieselbe Meldung und taugen
  -- damit nicht als Existenz-Orakel (PROJECT_PRINCIPLES.md 13).
  if p_treatment_basis_id is not null then
    select p.id into v_verordnung
    from public.treatment_bases p
    where p.id = p_treatment_basis_id
      and p.organization_id = v_org
      and p.patient_id = p_patient_id;

    if not found then
      raise exception 'treatment basis not found' using errcode = 'P0002';
    end if;
  end if;

  if not app.is_assignable_therapist(p_staff_member_id, v_org) then
    raise exception 'staff member not assignable' using errcode = 'P0002';
  end if;

  v_ausserhalb := not app.is_within_working_hours(
    p_staff_member_id, v_org, p_date, p_start_time, p_end_time
  );

  if v_ausserhalb and not coalesce(p_allow_outside_working_hours, false) then
    raise exception 'outside_working_hours' using errcode = '22023';
  end if;

  if p_appointment_type = 'practice' then
    if p_location_id is null then
      raise exception 'practice appointment requires a location' using errcode = '22023';
    end if;

    select l.id into v_location_id
    from public.locations l
    where l.id = p_location_id
      and l.organization_id = v_org;

    if not found then
      raise exception 'location not found' using errcode = 'P0002';
    end if;
  else
    v_location_id := null;
  end if;

  if p_appointment_type = 'home_visit' then
    select
      nullif(btrim(c.street), ''),
      nullif(btrim(c.house_number), ''),
      nullif(btrim(c.postal_code), ''),
      nullif(btrim(c.city), '')
      into v_street, v_house, v_postal, v_city
    from public.patient_contact_details c
    where c.patient_id = p_patient_id;

    if v_street is null or v_house is null or v_postal is null or v_city is null then
      raise exception 'home visit requires a complete patient address' using errcode = '22023';
    end if;
  end if;

  begin
    insert into public.appointments (
      organization_id, patient_id, staff_member_id, location_id,
      appointment_type, kind, status, starts_at, ends_at,
      visit_street, visit_house_number, visit_postal_code, visit_city,
      treatment_basis_id, created_by
    )
    values (
      v_org, p_patient_id, p_staff_member_id, v_location_id,
      -- ADR-018 Punkt 2: Ein angelegter Termin ist bestaetigt. 'requested' und
      -- 'tentative' gibt es erst mit einem Portal, das sie erzeugen kann.
      p_appointment_type, 'treatment', 'confirmed', v_starts_at, v_ends_at,
      v_street, v_house, v_postal, v_city,
      v_verordnung, v_actor
    )
    returning id into v_appointment_id;
  exception
    when exclusion_violation then
      raise exception 'appointment overlaps an existing one' using errcode = '23P01';
  end;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.created', 'appointment', v_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', p_patient_id,
      'staff_member_id', p_staff_member_id,
      -- Eine ID, kein Inhalt: die Grundlage selbst traegt die klinischen
      -- Felder, und die gehoeren nicht ins Auditlog (ADR-010 Punkt 3).
      'treatment_basis_id', v_verordnung,
      'outside_working_hours', v_ausserhalb,
      -- FIX-019: Nachgetragen oder zurueckgelegt - das Auditlog sagt es.
      'in_the_past', p_date < v_heute
    )
  );

  return v_appointment_id;
end;
$$;

comment on function public.create_appointment(uuid, uuid, text, date, time without time zone, time without time zone, uuid, boolean, uuid, boolean) is
  'Legt einen Behandlungstermin im Zustand confirmed an. Die Laenge ist frei im Praxisraster (CAL-020); geprueft werden Raster des Beginns, Arbeitszeit und Belegung (CAL-003, CAL-005, CAL-007, ADR-018). Ein Tag in der Vergangenheit verlangt p_confirmed_past und steht im Auditkontext (FIX-019, ANN-057).';

revoke all on function public.create_appointment(uuid, uuid, text, date, time without time zone, time without time zone, uuid, boolean, uuid, boolean) from public, anon;
grant execute on function public.create_appointment(uuid, uuid, text, date, time without time zone, time without time zone, uuid, boolean, uuid, boolean) to authenticated;


-- public.create_appointment_series (neuer Parametername)
create or replace function public.create_appointment_series(
  p_patient_id uuid,
  p_treatment_basis_id uuid,
  p_staff_member_id uuid,
  p_appointment_type text,
  p_slots jsonb,
  p_location_id uuid DEFAULT NULL::uuid,
  p_allow_outside_working_hours boolean DEFAULT false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_dauer  interval;
  v_i      integer;
  v_datum  date;
  v_beginn time;
  v_anzahl integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Die aufgerufene Funktion prueft dasselbe Recht noch einmal. Hier steht es,
  -- damit die Meldung die Ursache trifft, statt auf halbem Weg zu scheitern.
  if not app.can_create_appointment() then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to create appointments' using errcode = '42501';
  end if;

  if p_treatment_basis_id is null then
    raise exception 'treatment basis is required' using errcode = '22023';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array'
     or jsonb_array_length(p_slots) = 0 then
    raise exception 'slots must be a non-empty array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_slots) > app.appointment_series_limit() then
    raise exception 'series is limited to % appointments', app.appointment_series_limit()
      using errcode = '22023';
  end if;

  v_dauer := make_interval(mins => app.appointment_window_minutes());

  for v_i in 0 .. jsonb_array_length(p_slots) - 1 loop
    v_datum  := (p_slots -> v_i ->> 'datum')::date;
    v_beginn := (p_slots -> v_i ->> 'beginn')::time;

    if v_datum is null or v_beginn is null then
      raise exception 'slot % is incomplete', v_i using errcode = '22023';
    end if;

    -- Laeuft das Fenster ueber Mitternacht, wuerde die Zeitarithmetik
    -- stillschweigend umlaufen (23:30 + 60 Minuten = 00:30). Lieber hier
    -- abweisen als am Folgetag anlegen.
    if (v_beginn + v_dauer)::time <= v_beginn then
      raise exception 'slot % crosses midnight', v_i using errcode = '22023';
    end if;

    perform public.create_appointment(
      p_patient_id,
      p_staff_member_id,
      p_appointment_type,
      v_datum,
      v_beginn,
      (v_beginn + v_dauer)::time,
      p_location_id,
      p_allow_outside_working_hours,
      p_treatment_basis_id
    );
    v_anzahl := v_anzahl + 1;
  end loop;

  return v_anzahl;
end;
$$;

comment on function public.create_appointment_series(uuid, uuid, uuid, text, jsonb, uuid, boolean) is
  'Legt die Termine einer Behandlungsgrundlage in einem Vorgang an (CAL-007). Ruft je Zeile create_appointment auf; alles oder nichts.';

revoke all on function public.create_appointment_series(uuid, uuid, uuid, text, jsonb, uuid, boolean) from public, anon;
grant execute on function public.create_appointment_series(uuid, uuid, uuid, text, jsonb, uuid, boolean) to authenticated;


-- public.list_patient_appointments (neuer Parametername)
create or replace function public.list_patient_appointments(
  p_patient_id uuid,
  p_upcoming boolean DEFAULT false,
  p_limit integer DEFAULT 20,
  p_after_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_after_id uuid DEFAULT NULL::uuid,
  p_treatment_basis_id uuid DEFAULT NULL::uuid
)
returns TABLE(id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, appointment_type text, status text, staff_given_name text, staff_family_name text, notification_channels text[], treatment_basis_id uuid, treatment_basis_kind text, treatment_basis_issued_on date, organization_time_zone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_upcoming boolean := coalesce(p_upcoming, false);
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'limit out of range' using errcode = '22023';
  end if;

  -- Der Cursor besteht aus beiden Teilen oder gar nicht.
  if (p_after_starts_at is null) <> (p_after_id is null) then
    raise exception 'cursor is incomplete' using errcode = '22023';
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
      app.appointment_notification_channels(a.id),
      a.treatment_basis_id,
      -- GRD-001: Die Bauart kommt mit, weil die Liste die Grundlage benennen
      -- soll und nicht raten darf, ob sie eine Verordnung ist (ADR-020 Punkt
      -- 7). Sie ist organisatorisch - eine Diagnose steht hier nicht.
      pr.treatment_basis_kind,
      pr.issued_on,
      o.time_zone
    from public.appointments a
    join public.staff_members sm  on sm.id = a.staff_member_id
    join public.persons sp        on sp.id = sm.person_id
    join public.organizations o   on o.id  = a.organization_id
    left join public.treatment_bases pr on pr.id = a.treatment_basis_id
    where a.organization_id = v_org
      and a.patient_id      = p_patient_id
      and (p_treatment_basis_id is null or a.treatment_basis_id = p_treatment_basis_id)
      and (
        case when v_upcoming then a.starts_at > now() else a.starts_at <= now() end
      )
      and (
        p_after_starts_at is null
        or (
          case
            when v_upcoming then (a.starts_at, a.id) > (p_after_starts_at, p_after_id)
            else (a.starts_at, a.id) < (p_after_starts_at, p_after_id)
          end
        )
      )
    -- Die Richtung steckt in der Sortierung: In jedem Lauf sind zwei der vier
    -- Ausdruecke fuer JEDE Zeile null und damit wirkungslos - uebrig bleibt
    -- genau das Paar der gewaehlten Richtung. Das ist billiger als zwei
    -- Rumpfvarianten derselben Abfrage, die getrennt gepflegt werden muessten.
    order by
      case when v_upcoming then a.starts_at end asc,
      case when v_upcoming then a.id end asc,
      case when not v_upcoming then a.starts_at end desc,
      case when not v_upcoming then a.id end desc
    limit p_limit;
end;
$$;

comment on function public.list_patient_appointments(uuid, boolean, integer, timestamp with time zone, uuid, uuid) is
  'Termine einer Patient:in fuer die Akte (AKTE-001): kommend oder vergangen, alle Zustaende, mit Mitteilungsvermerk und Bezug zur Behandlungsgrundlage samt ihrer Bauart, geblaettert ueber einen Keyset-Cursor. Rein organisatorisch, ohne Anschrift und ohne klinische Inhalte.';

revoke all on function public.list_patient_appointments(uuid, boolean, integer, timestamp with time zone, uuid, uuid) from public, anon;
grant execute on function public.list_patient_appointments(uuid, boolean, integer, timestamp with time zone, uuid, uuid) to authenticated;


-- public.prepare_patient_file_upload (neuer Parametername)
create or replace function public.prepare_patient_file_upload(
  p_patient_id uuid,
  p_treatment_basis_id uuid,
  p_document_type text,
  p_display_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_checksum_sha256 text
)
returns TABLE(file_id uuid, bucket_id text, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.patient_file_organization(p_patient_id);
  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patient_file_document_types t where t.key = p_document_type
  ) then
    raise exception 'unknown document type %', p_document_type using errcode = '22023';
  end if;

  -- Die Grundlage muss zu genau dieser Patientin in dieser Organisation
  -- gehoeren. Sonst haenge der Scan an einem fremden Auftrag - und traege
  -- dessen Frist.
  if p_treatment_basis_id is not null and not exists (
    select 1
    from public.treatment_bases pr
    where pr.id = p_treatment_basis_id
      and pr.patient_id = p_patient_id
      and pr.organization_id = v_org
  ) then
    raise exception 'treatment basis not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(p_document_type, p_treatment_basis_id) then
    raise exception 'not allowed to upload this document type' using errcode = '42501';
  end if;

  -- Allowlist und Groesse, erste von zwei Durchsetzungen (Punkt 18). Die
  -- zweite steht am Bucket; die dritte prueft bei der Bestaetigung gegen das,
  -- was tatsaechlich abgelegt wurde.
  if p_mime_type is null or p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'unsupported media type' using errcode = '22023';
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > app.patient_file_max_bytes() then
    raise exception 'file too large or empty' using errcode = '22023';
  end if;

  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid checksum' using errcode = '22023';
  end if;

  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 200 then
    raise exception 'invalid display name' using errcode = '22023';
  end if;

  insert into public.patient_files (
    organization_id, patient_id, treatment_basis_id, document_type,
    display_name, mime_type, byte_size, checksum_sha256, uploaded_by
  )
  values (
    v_org, p_patient_id, p_treatment_basis_id, p_document_type,
    btrim(p_display_name), p_mime_type, p_byte_size, p_checksum_sha256, v_actor
  )
  returning id into v_id;

  return query
    select f.id, app.patient_file_bucket(), f.object_key
    from public.patient_files f
    where f.id = v_id;
end;
$$;

comment on function public.prepare_patient_file_upload(uuid, uuid, text, text, text, bigint, text) is
  'Phase (a) des zweiphasigen Uploads (ADR-017 Punkt 7a): prueft die Berechtigung, bevor Bytes fliessen, und liefert den Objektschluessel.';

revoke all on function public.prepare_patient_file_upload(uuid, uuid, text, text, text, bigint, text) from public, anon;
grant execute on function public.prepare_patient_file_upload(uuid, uuid, text, text, text, bigint, text) to authenticated;


-- public.confirm_patient_file_upload (nur Rumpf)
create or replace function public.confirm_patient_file_upload(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_datei    record;
  v_metadata jsonb;
  v_groesse  bigint;
  v_mime     text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(v_datei.document_type, v_datei.treatment_basis_id) then
    raise exception 'not allowed to confirm this file' using errcode = '42501';
  end if;

  if v_datei.status <> 'pending' then
    raise exception 'file is not pending' using errcode = '22023';
  end if;

  select o.metadata into v_metadata
  from storage.objects o
  where o.bucket_id = app.patient_file_bucket()
    and o.name = v_datei.object_key;

  if not found then
    raise exception 'object was not uploaded' using errcode = '22023';
  end if;

  v_groesse := nullif(v_metadata ->> 'size', '')::bigint;
  v_mime    := nullif(v_metadata ->> 'mimetype', '');

  if v_groesse is distinct from v_datei.byte_size then
    raise exception 'uploaded size does not match the announced size' using errcode = '22023';
  end if;

  if v_mime is distinct from v_datei.mime_type then
    raise exception 'uploaded media type does not match the announced media type'
      using errcode = '22023';
  end if;

  if v_groesse > app.patient_file_max_bytes() then
    raise exception 'file too large' using errcode = '22023';
  end if;

  if v_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'unsupported media type' using errcode = '22023';
  end if;

  update public.patient_files
     set status = 'ready',
         confirmed_at = now()
   where id = p_file_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.uploaded', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type
    )
  );
end;
$$;

comment on function public.confirm_patient_file_upload(uuid) is
  'Phase (c) des zweiphasigen Uploads (ADR-017 Punkt 7c): prueft Groesse und MIME-Typ gegen storage.objects und macht die Datei sichtbar. Auditereignis patient_file.uploaded.';


-- public.discard_patient_file_upload (nur Rumpf)
create or replace function public.discard_patient_file_upload(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_datei record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
    and f.status = 'pending';

  if not found then
    raise exception 'pending upload not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(v_datei.document_type, v_datei.treatment_basis_id) then
    raise exception 'not allowed to discard this upload' using errcode = '42501';
  end if;

  -- Der Trigger schreibt den Loeschauftrag, falls doch schon ein Objekt liegt.
  delete from public.patient_files where id = p_file_id;
end;
$$;

comment on function public.discard_patient_file_upload(uuid) is
  'Verwirft eine nicht bestaetigte Dateizeile nach einem abgebrochenen Upload (ADR-017 Punkt 7).';


-- public.delete_patient_file (nur Rumpf)
create or replace function public.delete_patient_file(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_datei record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  -- Loeschen folgt dem Schreibrecht am Bezugsdatensatz (Punkt 13) - und setzt
  -- voraus, dass die Person die Datei ueberhaupt sehen darf. Ohne die zweite
  -- Pruefung koennte die Verwaltung eine klinische Datei loeschen, die sie
  -- nicht kennt.
  if not app.can_write_patient_file(v_datei.document_type, v_datei.treatment_basis_id)
     or not app.can_see_patient_file_type(v_datei.document_type) then
    raise exception 'not allowed to delete this file' using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.deleted', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type
    )
  );

  delete from public.patient_files where id = p_file_id;
end;
$$;

comment on function public.delete_patient_file(uuid) is
  'Loescht eine Datei der Akte. Die Zeile faellt sofort, das Objekt ueber den Loeschauftrag mit Quittung (ADR-017 Punkt 25).';


-- public.list_patient_files (neuer Parametername)
create or replace function public.list_patient_files(p_patient_id uuid, p_treatment_basis_id uuid DEFAULT NULL::uuid)
returns TABLE(id uuid, treatment_basis_id uuid, document_type text, is_clinical boolean, display_name text, mime_type text, byte_size bigint, uploaded_at timestamp with time zone, uploaded_by_name text, object_missing boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.patient_file_organization(p_patient_id);
  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  if not app.can_read_patient_files() then
    raise exception 'not allowed to read patient files' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.treatment_basis_id,
           f.document_type,
           t.is_clinical,
           f.display_name,
           f.mime_type,
           f.byte_size,
           f.confirmed_at,
           nullif(btrim(coalesce(pe.given_name, '') || ' ' || coalesce(pe.family_name, '')), ''),
           not exists (
             select 1
             from storage.objects o
             where o.bucket_id = app.patient_file_bucket()
               and o.name = f.object_key
           )
    from public.patient_files f
    join public.patient_file_document_types t on t.key = f.document_type
    left join public.user_profiles up on up.id = f.uploaded_by
    left join public.persons pe on pe.id = up.person_id
    where f.patient_id = p_patient_id
      and f.organization_id = v_org
      and f.status = 'ready'
      and (p_treatment_basis_id is null or f.treatment_basis_id = p_treatment_basis_id)
      and app.can_see_patient_file_type(f.document_type)
    order by f.confirmed_at desc, f.id;
end;
$$;

comment on function public.list_patient_files(uuid, uuid) is
  'Dateien einer Akte als rollenabhaengige Projektion (ADR-004, ADR-017 Punkt 12). Ohne Objektschluessel (ANN-052) und ohne die Dateien, die die Rolle nicht sehen darf.';

revoke all on function public.list_patient_files(uuid, uuid) from public, anon;
grant execute on function public.list_patient_files(uuid, uuid) to authenticated;


-- public.set_patient_file_document_type (nur Rumpf)
create or replace function public.set_patient_file_document_type(p_file_id uuid, p_document_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_datei record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
    and f.status = 'ready'
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patient_file_document_types t where t.key = p_document_type
  ) then
    raise exception 'unknown document type %', p_document_type using errcode = '22023';
  end if;

  if not app.can_correct_patient_file_type()
     or not app.can_see_patient_file_type(v_datei.document_type)
     or not app.can_see_patient_file_type(p_document_type) then
    raise exception 'not allowed to correct this document type' using errcode = '42501';
  end if;

  -- Der Verordnungsscan haengt an einer Behandlungsgrundlage (Punkt 10);
  -- umgekehrt darf eine Datei an einer Grundlage nicht zu etwas werden, das dort nichts
  -- verloren hat. Die Check-Constraint faengt nur die eine Richtung.
  if p_document_type = 'verordnungsscan' and v_datei.treatment_basis_id is null then
    raise exception 'a prescription scan needs a treatment basis' using errcode = '22023';
  end if;

  if p_document_type = v_datei.document_type then
    return;
  end if;

  update public.patient_files
     set document_type = p_document_type
   where id = p_file_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.type_corrected', 'patient_file', p_file_id,
    'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type_before', v_datei.document_type,
      'document_type', p_document_type
    )
  );
end;
$$;

comment on function public.set_patient_file_document_type(uuid, text) is
  'Korrigiert die Dokumentart und damit die Sichtbarkeit einer Datei (ADR-017 Punkt 13). Nur therapeutische Rollen, protokolliert, nur zwischen Arten, die die Person selbst sehen darf.';


-- public.reapply_deletion_journal (nur Rumpf)
create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reihenfolge text[] := array[
    'treatment_note_versions',
    'treatment_notes',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    'persons',
    'audit_log',
    'staff_account_invitations'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
  v_org       record;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where id = any($1) returning id) select array_agg(id) from g',
      v_tabelle
    )
    into v_geloescht
    using v_ids;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  if v_gesamt > 0 then
    for v_org in
      select j.organization_id as id, count(*) as anzahl
      from public.deletion_journal j
      where j.reapplied_at = now()
      group by j.organization_id
    loop
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.reapplied', 'organization', v_org.id, 'success',
        jsonb_build_object('surface', 'restore', 'records', v_org.anzahl)
      );
    end loop;
  end if;

  return v_gesamt;
end;
$$;

comment on function public.reapply_deletion_journal() is
  'Wendet alle Loeschungen des Journals erneut an - der zweite Schritt jeder Wiederherstellung (ADR-008 Punkt 8, ADR-012, LOE-002a). Idempotent. Nur fuer den Betrieb ausfuehrbar, nicht fuer Anwendungsrollen.';
