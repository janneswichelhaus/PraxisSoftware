-- =============================================================================
-- LEI-001: Das Trainingsverhaeltnis steht neben dem Behandlungsverhaeltnis
--
-- ADR-021 Punkt 2: `patients` IST das Behandlungsverhaeltnis und wird nicht
-- aufgeteilt. Daneben entsteht eine zweite Verhaeltnistabelle fuer das
-- Training, analog gebaut: Verweis auf `persons`, Status, Beginn - und der
-- Anker, ab dem die eigene Frist laeuft.
--
-- WARUM ZWEI TABELLEN UND NICHT EIN KENNZEICHEN. Training ist keine
-- Heilbehandlung. Daran haengen vier Dinge, die sich an einer gemeinsamen
-- Zeile nicht mehr trennen liessen (ADR-021, Kontext): Rechtsgrundlage
-- (Art. 6 Abs. 1 lit. b und Art. 9 Abs. 2 lit. a statt Art. 9 Abs. 2 lit. h),
-- Dokumentationspflicht (Par. 630f BGB gilt nicht), Aufbewahrungsfrist und
-- Steuerkennzeichen. Eine Person kann beide Verhaeltnisse gleichzeitig haben;
-- getrennt wird deshalb nach Rechtsverhaeltnis, nicht nach Person (Punkt 1).
--
-- DREI FESTLEGUNGEN, DIE ADR-021 AUSDRUECKLICH DEM SPEC UEBERLAESST:
--
--   1. **Bezeichner**: `training_relationships`. Im Code und im Datenmodell
--      heissen die beiden Bereiche `therapy` und `training` (Punkt 2); der
--      Tabellenname nennt, was die Zeile ist - ein Verhaeltnis, kein Kunde.
--   2. **Anker des Vertragsendes**: `contract_ended_on`, gebaut wie
--      `care_concluded_on` (LOE-001b) - ein Datum, das ein ausdruecklicher
--      Vorgang setzt und wieder raeumen kann. Ein abgeleiteter Anker (etwa
--      "letzter Termin plus x") liesse eine Frist unbemerkt anlaufen, und ein
--      unwiderruflicher Anker macht aus einem Irrtum eine Loeschung. Wer nach
--      einer Pause weitertrainiert, bekommt kein zweites Verhaeltnis.
--   3. **Legal Hold**: Der Hold haengt am Verhaeltnis, nicht an der Person
--      (offene Folgefrage in ADR-021). Eine Sperre in der Behandlung haelt
--      damit die Akte - und ueber sie mittelbar die gemeinsame `persons`-Zeile,
--      weil die erst faellt, wenn kein Verhaeltnis mehr auf sie zeigt. Das
--      Trainingsverhaeltnis beruehrt sie nicht. Die Sperre FUER ein
--      Trainingsverhaeltnis kommt mit LEI-002, zusammen mit dem Loeschlauf.
--
-- KEINE FREMDSCHLUESSEL ZU `patients` (Punkt 3). Die einzige Verbindung
-- zwischen beiden Verhaeltnissen ist `person_id`. Auch spaetere Fachdaten des
-- Trainings zeigen nie auf Behandlungsdaten; eine Uebernahme ist eine
-- dokumentierte Kopie mit Einwilligung, nie eine Referenz (Punkt 7).
--
-- KEINE KLINISCHEN UND KEINE SCREENING-FELDER. Wie `patients` traegt diese
-- Tabelle das Verhaeltnis und sonst nichts. Screening- und
-- Gesundheitsangaben des Trainings brauchen eine ausdrueckliche Einwilligung
-- (Art. 9 Abs. 2 lit. a) und eine eigene, kuerzere Frist; beides ist mit
-- Anfrage B2 offen und gehoert in den Loop, der diese Daten anlegt.
--
-- RLS AB DER ERSTEN MIGRATION (ADR-004, ADR-021 Konsequenzen): Die Tabelle
-- ist hier deny-by-default und bleibt es, bis LEI-003 die Trainingsbetreuung
-- als Rolle einfuehrt - vorher gibt es niemanden, der sie lesen duerfte.
-- =============================================================================

create table public.training_relationships (
  id                  uuid primary key default extensions.gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  person_id           uuid not null references public.persons (id) on delete restrict,
  status              text not null default 'active'
                        check (status in ('active', 'inactive')),
  contract_started_on date,
  contract_ended_on   date,
  created_at          timestamptz not null default now(),
  created_by          uuid,

  unique (organization_id, person_id),

  -- Ein Vertrag endet nicht, bevor er beginnt. Beide Daten duerfen fehlen:
  -- ein Verhaeltnis ohne erfassten Beginn ist unvollstaendig, aber kein
  -- Widerspruch - und ein laufendes hat kein Ende.
  constraint training_relationships_end_after_start check (
    contract_ended_on is null
    or contract_started_on is null
    or contract_ended_on >= contract_started_on
  )
);

comment on table public.training_relationships is
  'Trainingsverhaeltnis einer Person (Dienstvertrag ueber Training, Par. 611 BGB). Steht neben public.patients und teilt mit ihm ausschliesslich person_id (ADR-021 Punkt 2 und 3). Enthaelt KEINE klinischen und KEINE Screening-Angaben. Datenklasse: Trainingsverhaeltnis, drei Jahre ab Vertragsende (ADR-021 Punkt 4, ADR-008).';
comment on column public.training_relationships.person_id is
  'Die gemeinsame Identitaet - der einzige geteilte Punkt zwischen Training und Behandlung (ADR-021 Punkt 3). Bewusst kein Verweis auf public.patients.';
comment on column public.training_relationships.contract_started_on is
  'Beginn des Trainingsverhaeltnisses. Gegenstueck zu patients.care_started_on.';
comment on column public.training_relationships.contract_ended_on is
  'Anker der Aufbewahrungsfrist: Ende des Vertrages. Gesetzt und wieder raeumbar wie patients.care_concluded_on (LOE-001b); ohne ihn laeuft keine Frist und es wird nichts geloescht (ADR-008).';
comment on column public.training_relationships.created_by is
  'auth.users.id des handelnden Accounts. Ohne FK wie ueberall im Fundament (ADR-014).';

create index training_relationships_organization_id_idx
  on public.training_relationships (organization_id);
create index training_relationships_person_id_idx
  on public.training_relationships (person_id);

-- Der Loeschlauf sucht faellige Verhaeltnisse ueber den Anker; ohne Ende ist
-- nichts faellig, deshalb ein Teilindex.
create index training_relationships_contract_ended_idx
  on public.training_relationships (organization_id, contract_ended_on)
  where contract_ended_on is not null;

-- Deny-by-default, und zwar wirksam: RLS ist an, und es gibt keine Policy.
-- Ein angemeldetes Konto darf die Tabelle anfassen und bekommt null Zeilen -
-- die Policy kommt mit der Rolle, die sie besetzt (LEI-003). `anon` bekommt
-- wie ueberall gar nichts.
alter table public.training_relationships enable row level security;
revoke all on public.training_relationships from anon, authenticated;
grant select on public.training_relationships to authenticated;

-- -----------------------------------------------------------------------------
-- Eigener Anker im Retention Schedule
--
-- Die vorhandenen Anker beschreiben den Abschluss einer Versorgung, ein
-- Kalenderjahresende, das Ereignis selbst oder den Abschluss eines Vorgangs.
-- Das Ende eines Dienstvertrages ist keines davon: Es ist weder ein
-- abgeschlossener Vorgang im Sinne einer Einladung noch der Abschluss einer
-- Behandlung. Ein eigener Anker haelt beide Verhaeltnisse auch im Schedule
-- auseinander - genau das verlangt ADR-021 Punkt 4.
-- -----------------------------------------------------------------------------
alter table public.retention_classes drop constraint retention_classes_anchor_check;
alter table public.retention_classes add constraint retention_classes_anchor_check
  check (anchor in (
    'care_concluded',
    'contract_ended',
    'calendar_year_end',
    'event_time',
    'case_closed',
    'none'
  ));

-- -----------------------------------------------------------------------------
-- Datenklasse und Zuordnung (ADR-008, ADR-021 Punkt 4)
--
-- Drei Jahre ab Vertragsende. Die Zahl steht nicht zur Wahl: ADR-021 Punkt 4
-- legt sie fest und begruendet sie mit der Regelverjaehrung aus Par. 195 BGB -
-- laenger aufbewahren hiesse Daten ohne Zweck halten, kuerzer hiesse die
-- eigene Beweislage vor Ablauf der Verjaehrung aufgeben. Deshalb
-- 'gesetzlich_gepraegt' und keine Annahme: die Frist folgt einer gesetzlichen
-- Frist an anderer Stelle.
--
-- Die Heilbehandlungs-Ausnahme aus Art. 9 Abs. 2 lit. h traegt hier NICHT,
-- und damit auch die zehn Jahre aus Par. 630f BGB nicht. Wer beides in eine
-- Klasse legte, bewahrte Trainingsdaten sieben Jahre zu lang auf.
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order) values

  ('trainingsverhaeltnis', 'gesetzlich_gepraegt', 'Par. 195 BGB', 'contract_ended', interval '3 years', null,
   'Trainingsverhaeltnis und seine Vertragsdaten: drei Jahre ab Vertragsende (ADR-021 Punkt 4). Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, nicht die Heilbehandlungs-Ausnahme - die zehn Jahre der Patientenakte gelten hier ausdruecklich nicht. Der Anker ist training_relationships.contract_ended_on; ohne Vertragsende laeuft keine Frist. Screening- und Gesundheitsangaben des Trainings bekommen eine eigene, kuerzere Klasse mit dem Loop, der sie anlegt (Anfrage B2).', 15);

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values

  ('training_relationships', 'trainingsverhaeltnis', 'automatisch',
   'Das Verhaeltnis selbst. Eigene Regel im Loeschlauf mit eigenem Anker (LEI-002); die gemeinsame persons-Zeile faellt erst, wenn kein Verhaeltnis und kein Konto mehr auf sie zeigt (ADR-008 Punkt 9).', 55);

-- -----------------------------------------------------------------------------
-- Die Identitaet bleibt geteilt, die Sicht auf sie nicht
--
-- Mit dieser Tabelle gibt es erstmals Personen, die ausschliesslich im
-- Training stehen. `persons_select_scoped` zeigte bisher jeder Praxisrolle
-- jede Person der Organisation - was richtig war, solange jede Person
-- entweder Patientin oder Mitarbeiterin war.
--
-- Jetzt waere es ein Durchgriff: Wer in der Personenliste einen Namen findet,
-- zu dem es keine Akte gibt, weiss, dass diese Person trainiert.
-- PROJECT_PRINCIPLES.md §4.8 verbietet genau diesen Schluss - "auch nicht
-- mittelbar ueber die gemeinsame Identitaet". Die Identitaet bleibt der eine
-- geteilte Punkt (ADR-021 Punkt 3); geteilt wird sie aber nur dort, wo beide
-- Seiten ein Verhaeltnis zu ihr haben.
--
-- Die vier Behandlungsrollen sehen deshalb die Personen ihres Bereichs:
-- Patient:innen und Mitarbeitende. Jede und jeder sieht immer die eigene
-- Person. Die Trainingsseite bekommt ihren Zweig mit der Rolle, die ihn
-- besetzt (LEI-003) - vorher gibt es niemanden, dem er etwas zeigen wuerde.
--
-- Die Projektionen der Anwendung sind davon unberuehrt: Sie erreichen
-- `persons` ausnahmslos ueber `patients` oder `staff_members`.
-- -----------------------------------------------------------------------------
drop policy persons_select_scoped on public.persons;

create policy persons_select_scoped
  on public.persons for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and (
      id = app.current_person_id()
      or (
        app.is_staff()
        and (
          exists (select 1 from public.patients x      where x.person_id = persons.id)
          or exists (select 1 from public.staff_members x where x.person_id = persons.id)
        )
      )
    )
  );
