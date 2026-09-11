-- =============================================================================
-- Retention Schedule: Datenklassen und Fristen an genau einer Stelle (LOE-001a)
--
-- ADR-008 verlangt zweierlei: jede fachliche Entitaet ist einer Datenklasse
-- zugeordnet ("Eine neue Datenklasse ohne Fristzuordnung ist ein Mangel, nicht
-- ein Sonderfall"), und die Fristen sind ein gepflegtes, nachvollziehbares
-- Dokument. Bisher standen beide Angaben ausschliesslich als COMMENT an den
-- Tabellen - lesbar fuer Menschen, unbrauchbar fuer eine Loeschfunktion und
-- nicht pruefbar auf Vollstaendigkeit.
--
-- ANN-001 (docs/decisions/ASSUMPTIONS.md) fordert fuer die Umsetzung
-- ausdruecklich: der Retention Schedule MUSS an genau einer Stelle stehen,
-- sodass eine Fristaenderung eine DATENAENDERUNG bleibt und nicht mehrere
-- Funktionen beruehrt. Genau das sind die beiden Tabellen hier.
--
--   retention_classes      Was wird wie lange aufbewahrt, ab wann gerechnet,
--                          auf welcher Grundlage.
--   retention_assignments  Welche Tabelle gehoert zu welcher Klasse und wie
--                          wird sie geloescht.
--
-- Der Loeschlauf (LOE-002a) liest die Frist ausschliesslich ueber
-- app.retention_interval(); kein Intervall steht ein zweites Mal im Code.
--
-- BESCHRIFTUNGEN STEHEN NICHT HIER. Die Tabellen tragen Schluessel, Fristen,
-- Anker und Grundlage - also das Verbindliche. Die deutschen Bezeichnungen und
-- Erlaeuterungen der Oberflaeche liegen in src/features/retention/klassen.ts;
-- ein Test haelt beide Listen deckungsgleich. So bleiben die SQL-Dateien wie
-- alle uebrigen frei von Umlauten, ohne dass die Oberflaeche darunter leidet.
--
-- Datenklasse dieser beiden Tabellen: Konfiguration ohne Personenbezug.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- retention_classes
--
-- anchor sagt, AB WANN die Frist laeuft. Die Werte sind die fachlichen Anker
-- aus ADR-008, nicht beliebige Spaltennamen:
--
--   care_concluded      Abschluss der Versorgung am Patienten (LOE-001b)
--   calendar_year_end   Ende des Kalenderjahres des Ereignisses
--   event_time          Zeitpunkt des Ereignisses selbst
--   case_closed         Abschluss des Vorgangs (angenommen, zurueckgenommen,
--                       abgelaufen)
--   none                keine automatische Loeschung
--
-- retention_interval ist genau dann leer, wenn der Anker 'none' ist. Eine
-- Klasse ohne Frist ist damit kein Versehen, sondern eine begruendete Aussage:
-- die Begruendung steht in note, die offene Entscheidung in assumption_key.
-- -----------------------------------------------------------------------------
create table public.retention_classes (
  key                text primary key check (key ~ '^[a-z_]+$'),
  basis              text not null
                       check (basis in ('gesetzlich', 'gesetzlich_gepraegt', 'intern', 'abgeleitet', 'offen')),
  legal_reference    text check (legal_reference is null or length(btrim(legal_reference)) between 1 and 200),
  anchor             text not null
                       check (anchor in ('care_concluded', 'calendar_year_end', 'event_time', 'case_closed', 'none')),
  retention_interval interval,
  assumption_key     text check (assumption_key is null or assumption_key ~ '^ANN-[0-9]{3}$'),
  note               text not null check (length(btrim(note)) between 1 and 1000),
  sort_order         smallint not null default 100,

  constraint retention_classes_interval_matches_anchor check (
    (anchor = 'none' and retention_interval is null)
    or (anchor <> 'none' and retention_interval is not null)
  )
);

comment on table public.retention_classes is
  'Retention Schedule nach ADR-008: Datenklasse, Frist, Anker und Grundlage. Die einzige Stelle, an der eine Frist steht (ANN-001). Datenklasse: Konfiguration, kein Personenbezug.';
comment on column public.retention_classes.basis is
  'gesetzlich: Frist steht im Gesetz. gesetzlich_gepraegt: folgt einer gesetzlichen Frist an anderer Stelle. intern: Initialentscheidung aus ADR-008, validierungsbeduerftig (ANN-001). abgeleitet: folgt einer anderen Klasse. offen: Frist noch nicht entschieden, deshalb keine automatische Loeschung.';
comment on column public.retention_classes.retention_interval is
  'Aufbewahrungsdauer ab dem Anker. Leer bedeutet: keine automatische Loeschung; die Begruendung steht in note.';
comment on column public.retention_classes.assumption_key is
  'Eintrag in docs/decisions/ASSUMPTIONS.md, der diese Frist traegt. Leer nur bei gesetzlich bestimmten Fristen.';

-- -----------------------------------------------------------------------------
-- retention_assignments
--
-- Eine Zeile je Tabelle und Klasse. Mehrere Zeilen fuer dieselbe Tabelle sind
-- vorgesehen und kein Modellfehler: ein durchgefuehrter Termin gehoert zum
-- Behandlungsnachweis, ein abgesagter ohne Dokumentation nicht (ADR-008).
--
-- deletion_mode:
--   automatisch            eigene Regel im Loeschlauf (LOE-002a)
--   ueber_elterndatensatz  wird mit dem uebergeordneten Datensatz geloescht -
--                          per FK-Kaskade oder in fester Reihenfolge im Lauf
--   keine                  keine automatische Loeschung; scope_note begruendet
-- -----------------------------------------------------------------------------
create table public.retention_assignments (
  table_name    text not null check (table_name ~ '^[a-z_]+$'),
  class_key     text not null references public.retention_classes (key) on delete restrict,
  deletion_mode text not null
                  check (deletion_mode in ('automatisch', 'ueber_elterndatensatz', 'keine')),
  scope_note    text not null check (length(btrim(scope_note)) between 1 and 1000),
  sort_order    smallint not null default 100,

  primary key (table_name, class_key)
);

comment on table public.retention_assignments is
  'Zuordnung Tabelle zu Datenklasse samt Loeschweg (ADR-008, ADR-014). Vollstaendigkeit gegen pg_tables prueft supabase/tests/retention.test.ts. Datenklasse: Konfiguration, kein Personenbezug.';

create index retention_assignments_class_idx on public.retention_assignments (class_key);

-- -----------------------------------------------------------------------------
-- Die Klassen aus ADR-008, Abschnitt "Initialer Retention Schedule"
--
-- Uebernommen sind nur die Klassen, fuer die es heute Daten gibt. Routing-
-- Rohdaten, KI-Entwuerfe, Terminanfragen, Teamchat und Rechnungen haben noch
-- keine Tabelle; ihre Zeile entsteht mit dem Feature, das sie anlegt
-- (Definition of Done in docs/development/ROADMAP.md).
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order) values

  ('patientenakte', 'gesetzlich', 'Par. 630f Abs. 3 BGB', 'care_concluded', interval '10 years', null,
   'Zehn Jahre nach Abschluss der Behandlung. Der Anker ist patients.care_concluded_on (LOE-001b); ohne Abschluss laeuft keine Frist und es wird nichts geloescht.', 10),

  ('termin_ohne_nachweis', 'intern', null, 'calendar_year_end', interval '3 years', 'ANN-001',
   'Abgesagte Termine und No-shows ohne Rechnung: drei Jahre ab Ende des Kalenderjahres (ADR-008). Greift nur, solange kein Behandlungsnachweis daran haengt - gesetzliche Aufbewahrung hat Vorrang (ADR-008 Punkt 2).', 20),

  ('auditlog', 'intern', 'Art. 5 Abs. 2 DSGVO', 'event_time', interval '3 years', 'ANN-001',
   'Patientenakten-Auditlog, initial drei Jahre ab dem Ereignis. Laeuft nach eigener Frist und nicht mit der Akte, auf die es sich bezieht (ANN-029).', 30),

  ('zugangseinladung', 'intern', null, 'case_closed', interval '12 months', 'ANN-026',
   'Einladung eines Zugangs: zwoelf Monate nach Abschluss des Vorgangs - angenommen, zurueckgenommen oder abgelaufen (STAFF-002b).', 40),

  ('personenstammdaten', 'abgeleitet', null, 'none', null, null,
   'Identifizierende Stammdaten einer natuerlichen Person. Folgen der laengsten Frist der verknuepften Rolle: die Zeile faellt, wenn weder Patient noch Mitarbeiter noch Konto darauf verweisen (ADR-008 Punkt 9, ADR-014).', 50),

  ('beschaeftigtendaten', 'offen', null, 'none', null, 'ANN-030',
   'Beschaeftigtenstammdaten, Privatangaben und Arbeitszeiten. ADR-008 fuehrt fuer sie keine Frist; bis zur Entscheidung keine automatische Loeschung (ANN-030, PROJECT_PRINCIPLES.md 20).', 60),

  ('accountdaten', 'gesetzlich_gepraegt', null, 'none', null, null,
   'Konto und Rollenzuweisung. Getrennt vom aufbewahrungspflichtigen Fachdatensatz (ADR-008 Punkt 9): der Lebenszyklus laeuft ueber die Zugangsverwaltung (STAFF-003), nicht ueber eine Frist.', 70),

  ('verordnerkartei', 'offen', null, 'none', null, 'ANN-013',
   'Berufliche Kontaktdaten verordnender Aerzt:innen. Aufbewahrt, solange eine Verordnung darauf verweist; die Frist danach ist offen (ANN-013), deshalb keine automatische Loeschung.', 80),

  ('betriebsdaten', 'intern', null, 'none', null, 'ANN-020',
   'Betriebsdaten der Praxis ohne Patientenbezug, etwa Textbausteine. Keine Gesundheitsdaten, keine Frist: sie enden, wenn die Praxis sie loescht oder der zugehoerige Mitarbeiterdatensatz faellt (ANN-020).', 90),

  ('stammdaten_praxis', 'intern', null, 'none', null, null,
   'Organisation und Standorte. Bestandsdaten der Praxis ohne Personenbezug und ohne gesetzliche Frist; sie enden mit dem Betrieb.', 100),

  ('loeschjournal', 'intern', null, 'none', null, 'ANN-031',
   'Nachweis wirksam gewordener Loeschungen (LOE-002a). Enthaelt nach der Loeschung keine Personendaten mehr, sondern Tabelle, Kennung und Zeitpunkt; er muss den Restore ueberleben (ADR-008 Punkt 8), deshalb keine eigene Frist (ANN-031).', 110),

  ('konfiguration', 'abgeleitet', null, 'none', null, null,
   'Referenz- und Konfigurationsdaten ohne Personenbezug: Rollenkatalog, Retention Schedule.', 120);

-- -----------------------------------------------------------------------------
-- Zuordnung jeder heute bestehenden Tabelle
--
-- Reihenfolge der Zeilen entspricht der Loeschreihenfolge innerhalb der Klasse
-- 'patientenakte': Kinder vor Eltern. Der Loeschlauf haelt sich daran, weil die
-- Fremdschluessel auf patients und appointments auf RESTRICT stehen.
-- -----------------------------------------------------------------------------
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values

  -- Klinische Patientenakte
  ('treatment_note_versions', 'patientenakte', 'ueber_elterndatensatz',
   'Festgeschriebene Staende. Fallen mit dem Eintrag (FK on delete cascade).', 10),
  ('treatment_notes', 'patientenakte', 'ueber_elterndatensatz',
   'Behandlungsdokumentation. Faellt mit dem Termin; wird im Lauf vor dem Termin geloescht (FK restrict).', 20),
  ('prescription_items', 'patientenakte', 'ueber_elterndatensatz',
   'Positionen einer Verordnung. Fallen mit der Verordnung (FK on delete cascade).', 30),
  ('prescriptions', 'patientenakte', 'ueber_elterndatensatz',
   'Verordnungen. Fallen mit der Akte; werden im Lauf vor der Patientenzeile geloescht (FK restrict).', 40),
  ('appointments', 'patientenakte', 'ueber_elterndatensatz',
   'Termine mit Behandlungsnachweis. Fallen mit der Akte, nachdem die Dokumentation geloescht ist.', 50),
  ('patient_contact_details', 'patientenakte', 'ueber_elterndatensatz',
   'Kontakt- und Adressdaten im Patientenkontext (FK on delete cascade).', 60),
  ('patient_care_details', 'patientenakte', 'ueber_elterndatensatz',
   'Interne Versorgungsangaben der Praxis (FK on delete cascade).', 70),
  ('patients', 'patientenakte', 'automatisch',
   'Die Akte selbst. Zehn Jahre nach Abschluss der Versorgung, sofern kein Legal Hold besteht.', 80),

  -- Termine ohne Behandlungsnachweis
  ('appointments', 'termin_ohne_nachweis', 'automatisch',
   'Abgesagte Termine ohne Dokumentation: drei Jahre ab Ende des Kalenderjahres der Absage. Haengt Dokumentation daran, gilt die Frist der Akte.', 90),

  -- Auditlog
  ('audit_log', 'auditlog', 'automatisch',
   'Auditeintraege aelter als die Frist der Klasse. Unveraenderbar ueber den Anwendungspfad; der Loeschlauf ist der einzige Weg (ADR-010 Punkt 4).', 100),

  -- Zugaenge und Konten
  ('staff_account_invitations', 'zugangseinladung', 'automatisch',
   'Abgeschlossene Einladungen. Offene Einladungen bleiben, bis sie angenommen, zurueckgenommen oder abgelaufen sind.', 110),
  ('user_profiles', 'accountdaten', 'keine',
   'Zuordnung Konto zu Person. Wird ueber die Zugangsverwaltung gesperrt, nicht ueber eine Frist geloescht.', 120),
  ('user_roles', 'accountdaten', 'ueber_elterndatensatz',
   'Rollenzuweisung. Faellt mit dem Konto (FK on delete cascade).', 130),

  -- Personen und Beschaeftigte
  ('persons', 'personenstammdaten', 'ueber_elterndatensatz',
   'Faellt, wenn keine Rolle mehr darauf verweist - im Lauf unmittelbar nach der Patientenzeile geprueft.', 140),
  ('staff_members', 'beschaeftigtendaten', 'keine',
   'Mitarbeiterdatensatz. Frist offen (ANN-030).', 150),
  ('staff_private_details', 'beschaeftigtendaten', 'ueber_elterndatensatz',
   'Privatangaben. Fallen mit dem Mitarbeiterdatensatz (FK on delete cascade).', 160),
  ('staff_working_hours', 'beschaeftigtendaten', 'keine',
   'Wochenplan. Frist offen (ANN-030).', 170),
  ('staff_working_hour_exceptions', 'beschaeftigtendaten', 'keine',
   'Abweichungen vom Wochenplan. Frist offen (ANN-030).', 180),

  -- Uebriges
  ('prescribers', 'verordnerkartei', 'keine',
   'Verordnerkartei. Frist nach dem Ende der letzten Verordnung offen (ANN-013).', 190),
  ('treatment_text_snippets', 'betriebsdaten', 'keine',
   'Textbausteine. Persoenliche Bausteine fallen mit dem Mitarbeiterdatensatz (FK on delete cascade).', 200),
  ('organizations', 'stammdaten_praxis', 'keine',
   'Die Praxis selbst.', 210),
  ('locations', 'stammdaten_praxis', 'keine',
   'Standorte der Praxis.', 220),
  ('roles', 'konfiguration', 'keine',
   'Rollenkatalog ohne Personenbezug.', 230),
  ('retention_classes', 'konfiguration', 'keine',
   'Der Retention Schedule selbst.', 240),
  ('retention_assignments', 'konfiguration', 'keine',
   'Die Zuordnung selbst.', 250);

-- -----------------------------------------------------------------------------
-- app.retention_interval
--
-- Der einzige Lesepfad der Fristen fuer Funktionen. Wer eine Frist braucht,
-- ruft diese Funktion - kein Intervall steht ein zweites Mal im Code (ANN-001).
-- Eine unbekannte Klasse ist ein Programmierfehler und keine leere Antwort.
-- -----------------------------------------------------------------------------
create function app.retention_interval(p_class text)
returns interval
language plpgsql
stable
set search_path = ''
as $$
declare
  v_interval interval;
  v_found    boolean;
begin
  select rc.retention_interval, true
    into v_interval, v_found
  from public.retention_classes rc
  where rc.key = p_class;

  if not coalesce(v_found, false) then
    raise exception 'unknown retention class %', p_class using errcode = '22023';
  end if;

  return v_interval;
end;
$$;

comment on function app.retention_interval(text) is
  'Aufbewahrungsdauer einer Datenklasse aus dem Retention Schedule. Leer bedeutet: keine automatische Loeschung (ADR-008, ANN-001).';

-- -----------------------------------------------------------------------------
-- Rechte
--
-- Beide Tabellen sind Konfiguration ohne Personenbezug und fuer Praxisrollen
-- lesbar; geschrieben wird ausschliesslich per Migration. Ein UPDATE-Recht gibt
-- es nicht: eine Fristaenderung ist eine nachvollziehbare Aenderung am
-- Repository, kein Klick in der Oberflaeche (ADR-008, ADR-013).
-- -----------------------------------------------------------------------------
alter table public.retention_classes     enable row level security;
alter table public.retention_assignments enable row level security;

grant select on public.retention_classes     to authenticated;
grant select on public.retention_assignments to authenticated;

create policy retention_classes_select_staff
  on public.retention_classes for select to authenticated
  using (app.is_staff());

create policy retention_assignments_select_staff
  on public.retention_assignments for select to authenticated
  using (app.is_staff());

grant execute on function app.retention_interval(text) to authenticated;
