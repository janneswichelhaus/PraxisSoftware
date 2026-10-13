-- =============================================================================
-- Synthetische Seed-Daten
--
-- PROJECT_PRINCIPLES.md 3.1: In Entwicklung, Test und Demonstration werden
-- AUSSCHLIESSLICH synthetische Daten verwendet. Keine Zeile in dieser Datei
-- stammt aus einem realen Patientenfall oder aus bestehenden Praxisdaten.
--
-- Alle Namen sind erkennbar erfunden, alle E-Mail-Domains liegen unter der
-- reservierten TLD .invalid (RFC 2606) und koennen nicht zugestellt werden.
--
-- Das Kennwort unten ist ein reines Entwicklungskennwort fuer eine lokale
-- Wegwerf-Datenbank. Es ist KEIN Secret im Sinne von PROJECT_PRINCIPLES.md 3.3
-- und darf niemals in einer Umgebung mit realen Daten verwendet werden.
--
-- Feste UUIDs, damit der Stand aus Migrationen + Seed reproduzierbar ist.
-- =============================================================================

-- Idempotenz: Seed kann wiederholt eingespielt werden.
delete from public.audit_log;
delete from public.invoice_items;
delete from public.invoices;
delete from public.invoice_recipients;
delete from public.invoice_number_series;
delete from public.practice_billing_profiles;
delete from public.billable_services;
delete from public.treatment_text_snippets;
-- KOM-001: Rueckfragen von der Plattform; ihre Eintraege fallen mit ihnen.
delete from public.platform_messages;
-- Zugewiesene Plaene sind unveraenderlich und werden nie einzeln geloescht
-- (UEB-004, ANN-300); wie bei der Preisliste hebt nur der Seed die Sperre auf.
-- Sie muessen vor der Bibliothek fallen: Positionen zeigen auf Varianten.
alter table public.exercise_plan_items disable trigger exercise_plan_items_guard;
alter table public.exercise_plans      disable trigger exercise_plans_guard;
delete from public.exercise_plans;
alter table public.exercise_plans      enable trigger exercise_plans_guard;
alter table public.exercise_plan_items enable trigger exercise_plan_items_guard;
delete from public.exercise_variant_links;
delete from public.exercise_variants;
delete from public.exercises;
delete from public.staff_working_hour_exceptions;
delete from public.staff_working_hours;
delete from public.appointment_notifications;
delete from public.training_protocols;
delete from public.appointments;
delete from public.storage_deletion_orders;
delete from public.patient_files;
-- Eine veroeffentlichte Preisliste ist unveraenderlich (ABR-001), und die
-- Sperre sitzt am Trigger, damit sie fuer JEDEN Weg in die Tabelle gilt. Der
-- Seed ist genau der Weg, den es in keiner Umgebung mit echten Daten gibt: eine
-- Wegwerf-Datenbank neu aufsetzen. Er hebt die Sperre deshalb ausdruecklich und
-- eng begrenzt auf, statt sie im Trigger aufzuweichen.
alter table public.service_catalog_items    disable trigger service_catalog_items_frozen;
alter table public.service_catalog_versions disable trigger service_catalog_versions_frozen;
delete from public.service_catalog_items;
delete from public.service_catalog_versions;
alter table public.service_catalog_items    enable trigger service_catalog_items_frozen;
alter table public.service_catalog_versions enable trigger service_catalog_versions_frozen;
delete from public.treatment_base_items;
delete from public.treatment_bases;
delete from public.prescribers;
delete from public.patient_care_details;
delete from public.patient_contact_details;
delete from public.staff_private_details;
delete from public.user_roles;
delete from public.user_profiles;
delete from public.platform_accesses;
delete from public.patients;
delete from public.training_bases;
delete from public.training_relationships;
delete from public.staff_members;
delete from public.persons;
delete from public.locations;
delete from public.organizations;
delete from auth.users where email like '%@praxis.invalid' or email like '%@patient.invalid';

-- -----------------------------------------------------------------------------
-- Accounts (Supabase Auth)
-- -----------------------------------------------------------------------------
-- Die Token-Spalten (confirmation_token usw.) werden bewusst auf einen
-- leeren String statt NULL gesetzt: aktuelle GoTrue-Versionen scannen diese
-- Spalten beim Login strikt als string und brechen bei NULL mit
-- "converting NULL to string is unsupported" ab.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000001', 'authenticated', 'authenticated', 'jannes.test@praxis.invalid',      extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000002', 'authenticated', 'authenticated', 'anna.beispiel@praxis.invalid',    extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000003', 'authenticated', 'authenticated', 'olivia.office@praxis.invalid',    extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000004', 'authenticated', 'authenticated', 'tim.teamleitung@praxis.invalid',  extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000005', 'authenticated', 'authenticated', 'max.mustermann@patient.invalid',  extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000006', 'authenticated', 'authenticated', 'erika.beispiel@patient.invalid',  extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000007', 'authenticated', 'authenticated', 'tom.training@praxis.invalid',     extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  -- Plattformkonten (POR-EPIC-001): ohne Profil und ohne Rolle, Zugriff nur
  -- ueber ihre Zugaenge unten (ADR-023 Punkte 2 und 3).
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000008', 'authenticated', 'authenticated', 'tina.plattform@patient.invalid',  extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000009', 'authenticated', 'authenticated', 'erika.plattform@patient.invalid', extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  -- POR-EPIC-001b: Paula begleitet ihren Vater Max (ADR-023 Punkt 13). Eigenes
  -- Konto, eigene Person; Max selbst hat keinen Zugang.
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000010', 'authenticated', 'authenticated', 'paula.begleitung@patient.invalid', extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '');

-- -----------------------------------------------------------------------------
-- Organisation und Standort
-- -----------------------------------------------------------------------------
-- time_zone ist verpflichtend und hat bewusst keinen Datenbank-Default:
-- jede Organisation legt ihre Zeitzone ausdruecklich fest (CAL-001).
-- KOM-012 (ANN-371): Fotos und Videos an Rueckfragen nur in dieser
-- synthetischen Testpraxis; jede neue Organisation hat den Schalter aus.
insert into public.organizations (id, name, time_zone, external_attachments_enabled) values
  ('22222222-2222-4222-8222-000000000001', 'Test Praxis Tuebingen', 'Europe/Berlin', true);

-- Startort der Tagesroute (MAP-006a): synthetische Anschrift und erfundene
-- Koordinate im Stadtgebiet von Tuebingen, keine echte Adresse.
insert into public.locations (id, organization_id, name, street, house_number, postal_code, city, lat, lon, geocode_precision) values
  ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-000000000001', 'Hauptstandort Tuebingen', 'Praxisplatz', '1', '72072', 'Tuebingen', 48.5216, 9.0576, 'address');

-- -----------------------------------------------------------------------------
-- Personen
-- -----------------------------------------------------------------------------
insert into public.persons (id, organization_id, given_name, family_name) values
  ('44444444-4444-4444-8444-000000000001', '22222222-2222-4222-8222-000000000001', 'Jannes', 'Test'),
  ('44444444-4444-4444-8444-000000000002', '22222222-2222-4222-8222-000000000001', 'Anna',   'Beispiel'),
  ('44444444-4444-4444-8444-000000000003', '22222222-2222-4222-8222-000000000001', 'Olivia', 'Office'),
  ('44444444-4444-4444-8444-000000000004', '22222222-2222-4222-8222-000000000001', 'Tim',    'Teamleitung'),
  ('44444444-4444-4444-8444-000000000005', '22222222-2222-4222-8222-000000000001', 'Max',    'Mustermann'),
  ('44444444-4444-4444-8444-000000000006', '22222222-2222-4222-8222-000000000001', 'Erika',  'Beispiel'),
  -- Person ohne Account, um zu pruefen, dass die Kartei nicht am Account haengt.
  ('44444444-4444-4444-8444-000000000007', '22222222-2222-4222-8222-000000000001', 'Petra',  'Platzhalter'),
  -- Mitarbeiterin ohne Zugang - Ausgangslage fuer die Einladung (STAFF-002b).
  ('44444444-4444-4444-8444-000000000008', '22222222-2222-4222-8222-000000000001', 'Nina',   'Neu'),
  -- Nur Training, keine Behandlung (LEI-001). Sie belegt den Regelfall des
  -- zweiten Leistungsbereichs: eine Person ohne Patientenakte.
  ('44444444-4444-4444-8444-000000000009', '22222222-2222-4222-8222-000000000001', 'Tina',   'Trainingskundin'),
  -- Trainingsbetreuung (PROJECT_PRINCIPLES.md 4.9, LEI-003). Sie besetzt
  -- die andere Seite der Grenze aus ADR-021 Punkt 6.
  ('44444444-4444-4444-8444-000000000010', '22222222-2222-4222-8222-000000000001', 'Tom',    'Trainingsbetreuung');

-- -----------------------------------------------------------------------------
-- Mitarbeiter
-- -----------------------------------------------------------------------------
insert into public.staff_members (id, organization_id, person_id, primary_location_id, work_email, work_phone) values
  ('55555555-5555-4555-8555-000000000001', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000001', '33333333-3333-4333-8333-000000000001', 'jannes.test@praxis.invalid',     '+49 7071 0000101'),
  ('55555555-5555-4555-8555-000000000002', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000002', '33333333-3333-4333-8333-000000000001', 'anna.beispiel@praxis.invalid',   '+49 7071 0000102'),
  ('55555555-5555-4555-8555-000000000003', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000003', '33333333-3333-4333-8333-000000000001', 'olivia.office@praxis.invalid',   '+49 7071 0000103'),
  ('55555555-5555-4555-8555-000000000004', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000004', '33333333-3333-4333-8333-000000000001', 'tim.teamleitung@praxis.invalid', '+49 7071 0000104'),
  -- Ohne Zugang und damit ohne Rollen: die Ausgangslage, in der die Abnahme
  -- eine Einladung aussprechen kann (STAFF-002b). Sie ist aus demselben Grund
  -- nicht fuer Termine zuordenbar (E11).
  ('55555555-5555-4555-8555-000000000005', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000008', '33333333-3333-4333-8333-000000000001', 'nina.neu@praxis.invalid',       '+49 7071 0000105'),
  ('55555555-5555-4555-8555-000000000006', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000010', '33333333-3333-4333-8333-000000000001', 'tom.training@praxis.invalid',   '+49 7071 0000106');

-- Privatdaten der Mitarbeitenden. Bewusst getrennt: nur owner und die
-- betroffene Person selbst duerfen sie lesen.
insert into public.staff_private_details (staff_member_id, organization_id, date_of_birth, private_email, private_phone, street, postal_code, city) values
  ('55555555-5555-4555-8555-000000000001', '22222222-2222-4222-8222-000000000001', '1990-01-15', 'jannes.privat@beispiel.invalid', '+49 7071 0000001', 'Teststrasse 1',  '72070', 'Tuebingen'),
  ('55555555-5555-4555-8555-000000000002', '22222222-2222-4222-8222-000000000001', '1992-06-02', 'anna.privat@beispiel.invalid',   '+49 7071 0000002', 'Beispielweg 2',  '72072', 'Tuebingen'),
  ('55555555-5555-4555-8555-000000000003', '22222222-2222-4222-8222-000000000001', '1988-11-23', 'olivia.privat@beispiel.invalid', '+49 7071 0000003', 'Musterallee 3',  '72074', 'Tuebingen'),
  ('55555555-5555-4555-8555-000000000004', '22222222-2222-4222-8222-000000000001', '1985-03-09', 'tim.privat@beispiel.invalid',    '+49 7071 0000004', 'Probestrasse 4', '72076', 'Tuebingen');

-- -----------------------------------------------------------------------------
-- Patienten (rein synthetisch, keine klinischen Inhalte)
-- -----------------------------------------------------------------------------
insert into public.patients (id, organization_id, person_id, status, care_started_on) values
  ('66666666-6666-4666-8666-000000000001', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000005', 'active',   '2026-02-10'),
  ('66666666-6666-4666-8666-000000000002', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000006', 'active',   '2026-05-21'),
  ('66666666-6666-4666-8666-000000000003', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000007', 'inactive', '2025-11-03');

-- -----------------------------------------------------------------------------
-- Trainingsverhaeltnisse (LEI-001)
--
-- Zwei Zeilen, und beide sagen etwas: Tina hat ausschliesslich ein
-- Trainingsverhaeltnis - fuer sie gibt es keine Akte und darf es keine geben.
-- Erika hat beides zugleich; genau daran scheitert die Trennung nach Person,
-- und genau deshalb trennt ADR-021 nach Rechtsverhaeltnis (Punkt 1).
--
-- Keine Screening- oder Gesundheitsangaben: die Tabelle traegt das
-- Verhaeltnis und sonst nichts.
-- -----------------------------------------------------------------------------
insert into public.training_relationships
  (id, organization_id, person_id, status, contract_started_on, contract_ended_on) values
  ('eeeeeeee-eeee-4eee-8eee-000000000001', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000009', 'active', '2026-03-02', null),
  ('eeeeeeee-eeee-4eee-8eee-000000000002', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000006', 'active', '2026-06-15', null);

-- Strasse und Hausnummer getrennt: ein Hausbesuch uebernimmt beide Felder
-- einzeln in den Adress-Snapshot des Termins (CAL-001).
-- Koordinaten (MAP-006a, ANN-016): erfunden, im Stadtgebiet von Tuebingen,
-- ohne Bezug zu einem echten Ort. Die Hausbesuche unten uebernehmen sie per
-- Trigger in ihren Snapshot.
insert into public.patient_contact_details (patient_id, organization_id, date_of_birth, email, phone, street, house_number, postal_code, city, phone_work, phone_mobile, institution, lat, lon, geocode_precision) values
  ('66666666-6666-4666-8666-000000000001', '22222222-2222-4222-8222-000000000001', '1957-04-30', 'max.mustermann@patient.invalid', '+49 7071 0000005', 'Beispielstrasse', '12', '72070', 'Tuebingen', '+49 7071 0000205', '+49 160 0000005',               null,                      48.5305, 9.0490, 'address'),
  ('66666666-6666-4666-8666-000000000002', '22222222-2222-4222-8222-000000000001', '1963-09-17', 'erika.beispiel@patient.invalid', '+49 7071 0000006', 'Testweg',         '7',  '72072', 'Tuebingen', null,               '+49 160 0000006',               null,                      48.5164, 9.0349, 'address'),
  ('66666666-6666-4666-8666-000000000003', '22222222-2222-4222-8222-000000000001', '1971-12-05', null,                             '+49 7071 0000007', 'Fiktivgasse',     '9',  '72074', 'Tuebingen', null,               null, 'Seniorenresidenz Fiktiv', 48.5387, 9.0668, 'street');

-- Interne Versorgungsangaben (PAT-005). Sichtbar nur fuer die Rollen der
-- Patientenkartei, nicht fuer das Patientenkonto (ANN-010). Rein synthetisch
-- und ausdruecklich ohne klinische Inhalte.
-- Seit UX-003a traegt Max Mustermann das Merkmal Behandlungsliege: Annas Tag
-- beginnt mit seinem Hausbesuch, und die Uebersicht zeigt "Liege heute: ja".
insert into public.patient_care_details (patient_id, organization_id, primary_therapist_staff_member_id, home_visit_access_note, special_note, remark, treatment_table_required) values
  ('66666666-6666-4666-8666-000000000001', '22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000002', '2. OG links, Klingel "Mustermann". Aufzug vorhanden. Rad im Hinterhof abstellen.', 'Hund im Flur, wird vor dem Termin weggesperrt.', 'Bevorzugt Termine am Vormittag.', true),
  ('66666666-6666-4666-8666-000000000002', '22222222-2222-4222-8222-000000000001', null,                                    'Erdgeschoss, Klingel "Beispiel". Schluessel bei Nachbarin Frau Fiktiv im 1. OG.', null,                                            null, false),
  ('66666666-6666-4666-8666-000000000003', '22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000004', 'Anmeldung an der Pforte, Zimmer 214.', null, null, false);

-- -----------------------------------------------------------------------------
-- Verordner:innen (VER-001)
-- -----------------------------------------------------------------------------
-- Rein synthetisch. Berufliche Kontaktdaten Dritter, kein Patientenbezug
-- (ANN-013).
insert into public.prescribers (id, organization_id, title, given_name, family_name, practice_name, speciality, street, house_number, postal_code, city, phone, fax, email) values
  ('77777777-7777-4777-8777-000000000001', '22222222-2222-4222-8222-000000000001', 'Dr. med.', 'Petra',  'Probst',    'Orthopaedische Gemeinschaftspraxis Fiktiv', 'Orthopaedie',      'Aerztegasse', '3', '72070', 'Tuebingen', '+49 7071 0000401', '+49 7071 0000402', 'praxis.probst@aerzte.invalid'),
  ('77777777-7777-4777-8777-000000000002', '22222222-2222-4222-8222-000000000001', null,       'Hendrik', 'Hausarzt', 'Hausarztpraxis Testdorf',                  'Allgemeinmedizin', 'Dorfstrasse', '18', '72074', 'Tuebingen', '+49 7071 0000403', null,               null);

-- -----------------------------------------------------------------------------
-- Behandlungsgrundlagen (VER-001, VER-002, GRD-001)
-- -----------------------------------------------------------------------------
-- Rein synthetisch. Die Diagnosen sind erfunden und stammen aus keinem realen
-- Fall (PROJECT_PRINCIPLES.md 3.1). Zwei Jahre, damit die Gruppierung nach Jahr
-- in der Akte sichtbar wird, eine ausgeschoepfte Verordnung als Gegenprobe und
-- seit GRD-001 ein Selbstzahler als zweite Bauart (ADR-020).
-- `appointment_count` ist seit VER-EPIC-002 die Anzahl moeglicher Termine und
-- ausdruecklich nicht die Summe der Positionen (ANN-064). Grundlage 3 zeigt den
-- Bestandsfall: zwei Positionen mit **verschiedenen** Leistungsmengen, aber
-- sechs Terminen.
insert into public.treatment_bases (id, organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on, appointment_count, frequency_note, note, diagnosis, therapy_goal, prescriber_note, follow_up_recommendation) values
  ('88888888-8888-4888-8888-000000000001', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000001', '77777777-7777-4777-8777-000000000001', 'first',     '2026-02-05', 10, '2x pro Woche', null,                          'Synthetisch: Bewegungseinschraenkung der rechten Schulter nach Sturz.', 'Schmerzfreie Beweglichkeit im Alltag.', 'Belastung langsam steigern.', null),
  ('88888888-8888-4888-8888-000000000002', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000001', '77777777-7777-4777-8777-000000000001', 'follow_up', '2026-06-18', 10, '2x pro Woche', 'Rezept liegt im Ordner.',     'Synthetisch: Fortbestehende Bewegungseinschraenkung rechte Schulter.',  'Rueckkehr zur Gartenarbeit.',          'Bitte Schulter nicht ueberlasten.', 'Synthetisch: Eine weitere Folgeverordnung waere aus meiner Sicht sinnvoll.'),
  ('88888888-8888-4888-8888-000000000003', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000002', '77777777-7777-4777-8777-000000000002', 'first',     '2025-11-12',  6, '1x pro Woche', null,                          'Synthetisch: Verspannung der Nackenmuskulatur.',                        null,                                   null,                          null),
  -- Frische Verordnung ohne genutzte Behandlung: die Vorlage fuer die
  -- Terminserie (CAL-007). Ohne sie waere in der Abnahme keine Verordnung mit
  -- vollem Kontingent da, und eine Serie ueber zehn Termine liesse sich nur
  -- ueber das Kontingent hinaus planen.
  ('88888888-8888-4888-8888-000000000004', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000002', '77777777-7777-4777-8777-000000000001', 'follow_up', '2026-09-08', 10, '2x pro Woche', null,                          'Synthetisch: Anschlussbehandlung der Nackenmuskulatur.',                'Beschwerdefreie Kopfdrehung im Alltag.', null,                        null),
  -- Der Selbstzahler (ADR-020): keine Verordner:in, keine klinischen Felder,
  -- aber dieselbe Klammer - mit vereinbarter Anzahl, Deckung und Serienplanung.
  -- issued_on ist hier der Tag der Vereinbarung.
  ('88888888-8888-4888-8888-000000000005', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000002', null,                                  'self_pay',  '2026-09-03',  8, '1x pro Woche', 'Zahlt selbst, Rechnung je Monat.', null,                                                                   null,                                   null,                          null);

insert into public.treatment_base_items (id, organization_id, treatment_basis_id, sort_order, remedy, prescribed_quantity, used_quantity) values
  ('99999999-9999-4999-8999-000000000001', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000001', 1, 'Krankengymnastik',        10, 10),
  ('99999999-9999-4999-8999-000000000002', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000001', 2, 'Waermetherapie',          10, 10),
  ('99999999-9999-4999-8999-000000000003', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000002', 1, 'Krankengymnastik',        10,  7),
  ('99999999-9999-4999-8999-000000000004', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000003', 1, 'Manuelle Therapie',        6,  2),
  -- Zweite Position mit abweichender Leistungsmenge: der Bestandsfall aus
  -- VER-EPIC-002, Abnahmefall 4. Die Grundlage bietet trotzdem sechs Termine.
  ('99999999-9999-4999-8999-000000000007', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000003', 2, 'Waermetherapie',           3,  1),
  ('99999999-9999-4999-8999-000000000005', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000004', 1, 'Krankengymnastik',        10,  0),
  ('99999999-9999-4999-8999-000000000006', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000005', 1, 'Krankengymnastik',         8,  1);

-- -----------------------------------------------------------------------------
-- Leistungskatalog (ABR-001)
--
-- ERFUNDENE PREISE. Sie sind eine Rechengroesse fuer die Abnahme und keine
-- Preisempfehlung: Die echte Preisliste pflegt Jannes selbst, ihre steuerliche
-- Einordnung kommt aus der Steuerberatung (G13, B4).
--
-- Zwei Versionen, damit beide Zustaende sichtbar sind: eine veroeffentlichte
-- und damit unveraenderliche Preisliste ab dem 01.01.2026 und ein Entwurf fuer
-- das kommende Jahr. Veroeffentlicht wird erst nach den Positionen - eine
-- Version, die schon in Kraft ist, nimmt keine mehr an.
-- -----------------------------------------------------------------------------
-- Seit ABR-030 traegt jede Preisliste den Tarif des Terminhonorars
-- (ADR-009 Punkt 22, ANN-231): synthetisch 140 Euro je Behandlungstermin.
-- Die Preise der Heilmittel darunter sind seitdem die Gewichte, nach denen
-- das Honorar auf der Rechnung aufgeteilt wird (ANN-233).
insert into public.service_catalog_versions (id, organization_id, label, valid_from, session_fee_cents) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', '22222222-2222-4222-8222-000000000001', 'Preisliste 2026', '2026-01-01', 14000),
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000002', '22222222-2222-4222-8222-000000000001', 'Preisliste 2027 (Entwurf)', '2027-01-01', 14500);

-- Seit ABR-008 traegt jede Position ihren Leistungsbereich (ADR-009 Punkt 16,
-- ADR-021 Punkt 2). Der Bestand ist durchweg Behandlung; die eine
-- steuerpflichtige Position steht ebenfalls im Behandlungsverhaeltnis - eine
-- Leistung ohne Heilbehandlungszweck an eine Patientin ist keine
-- Trainingsleistung, sondern eine Selbstzahlerleistung derselben Klammer.
insert into public.service_catalog_items (id, organization_id, catalog_version_id, sort_order, code, label, item_kind, remedy, unit_price_cents, tax_treatment, tax_rate_permille, service_area) values
  ('cccccccc-cccc-4ccc-8ccc-000000000001', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 1, 'KG',    'Krankengymnastik',                    'treatment',   'Krankengymnastik',                        4500, 'exempt_healthcare',   0, 'therapy'),
  ('cccccccc-cccc-4ccc-8ccc-000000000002', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 2, 'KG-D',  'Krankengymnastik als Doppelbehandlung', 'treatment', 'Krankengymnastik als Doppelbehandlung',   8500, 'exempt_healthcare',   0, 'therapy'),
  ('cccccccc-cccc-4ccc-8ccc-000000000003', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 3, 'MT',    'Manuelle Therapie',                   'treatment',   'Manuelle Therapie',                       5500, 'exempt_healthcare',   0, 'therapy'),
  ('cccccccc-cccc-4ccc-8ccc-000000000004', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 4, 'MT-D',  'Manuelle Therapie als Doppelbehandlung', 'treatment', 'Manuelle Therapie als Doppelbehandlung', 10000, 'exempt_healthcare',   0, 'therapy'),
  -- Die Hausbesuchspauschale ist die Position zum Heilmittel "Hausbesuch" und
  -- braucht keinen eigenen Wert in item_kind.
  ('cccccccc-cccc-4ccc-8ccc-000000000005', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 5, 'HB',    'Hausbesuchspauschale',                'treatment',   'Hausbesuch',                              1800, 'exempt_healthcare',   0, 'therapy'),
  -- Bestandsheilmittel aus den Seed-Grundlagen: ohne Position bliebe die
  -- Vorbelegung dort leer.
  ('cccccccc-cccc-4ccc-8ccc-000000000006', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 6, 'WT',    'Waermetherapie',                      'treatment',   'Waermetherapie',                          1200, 'exempt_healthcare',   0, 'therapy'),
  -- Steuerpflichtig, weil keine Heilbehandlung: der Fall, den ADR-009 Punkt 6
  -- ausdruecklich neben der Heilbehandlung vorsieht - und der einzige Posten
  -- im Seed, an dem sich ein Steuerausweis ueberhaupt zeigt.
  ('cccccccc-cccc-4ccc-8ccc-000000000007', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 7, 'SZL',   'Selbstzahlerleistung ohne Heilbehandlungszweck', 'treatment', null,                           6000, 'taxable',           190, 'therapy'),
  -- Ausfallhonorar: kein Leistungsaustausch, deshalb nicht steuerbar.
  ('cccccccc-cccc-4ccc-8ccc-000000000008', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 8, 'AUS',   'Ausfallhonorar',                      'absence_fee', null,                                      4500, 'not_taxable',         0, 'therapy'),
  -- Die einzige Position im Trainingsbereich (ABR-009). Sie laesst sich
  -- anlegen und an keinem Termin erfassen: Ein Trainingstermin hat keine
  -- Patientin, und `billable_services` ist patientengebunden - der
  -- Schreibweg des Trainings kommt mit E18 Schritt 7. Genau das haelt ein
  -- Test fest, statt es zu behaupten.
  ('cccccccc-cccc-4ccc-8ccc-000000000009', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 9, 'PT',    'Personal Training (Einzelstunde)',    'treatment',   null,                                      7500, 'taxable',           190, 'training'),
  -- ANG-002: der Abo-Monat des Nachsorge-Abos (ADR-009 Punkt 21), steuer-
  -- pflichtig bis zur Antwort der Steuerberatung (ANN-269). Der Preis ist
  -- synthetisch, bis Jannes ihn festlegt (Blocker vor Block 5).
  ('cccccccc-cccc-4ccc-8ccc-000000000010', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 10, 'NSA',  'Nachsorge-Abo (Monat)',               'aftercare_month', null,                                  3900, 'taxable',           190, 'therapy'),
  ('cccccccc-cccc-4ccc-8ccc-000000000011', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', 1, 'KG',    'Krankengymnastik',                    'treatment',   'Krankengymnastik',                        4800, 'exempt_healthcare',   0, 'therapy'),
  ('cccccccc-cccc-4ccc-8ccc-000000000012', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', 2, 'AUS',   'Ausfallhonorar',                      'absence_fee', null,                                      4800, 'not_taxable',         0, 'therapy'),
  ('cccccccc-cccc-4ccc-8ccc-000000000013', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', 3, 'NSA',   'Nachsorge-Abo (Monat)',               'aftercare_month', null,                                  4200, 'taxable',           190, 'therapy');

-- ANG-005: zwei Trainingspakete je Preisliste (ADR-009 Punkt 21), steuer-
-- pflichtig zum Regelsatz bis zur Antwort der Steuerberatung (ANN-275). Der
-- Umfang steht in der Bezeichnung. Preise synthetisch, bis Jannes Preis,
-- Umfang und Zahlungsweise festlegt (BEF-114, Blocker vor Block 5).
insert into public.service_catalog_items (id, organization_id, catalog_version_id, sort_order, code, label, item_kind, remedy, unit_price_cents, tax_treatment, tax_rate_permille, service_area, package_months) values
  ('cccccccc-cccc-4ccc-8ccc-000000000014', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 11, 'TP3', 'Trainingspaket 3 Monate (eine Einheit je Woche, Plattform inklusive)', 'training_package', null, 39000, 'taxable', 190, 'training', 3),
  ('cccccccc-cccc-4ccc-8ccc-000000000015', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 12, 'TP6', 'Trainingspaket 6 Monate (eine Einheit je Woche, Plattform inklusive)', 'training_package', null, 72000, 'taxable', 190, 'training', 6),
  ('cccccccc-cccc-4ccc-8ccc-000000000016', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', 4, 'TP3', 'Trainingspaket 3 Monate (eine Einheit je Woche, Plattform inklusive)', 'training_package', null, 41000, 'taxable', 190, 'training', 3),
  ('cccccccc-cccc-4ccc-8ccc-000000000017', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', 5, 'TP6', 'Trainingspaket 6 Monate (eine Einheit je Woche, Plattform inklusive)', 'training_package', null, 76000, 'taxable', 190, 'training', 6);

update public.service_catalog_versions
   set published_at = timestamptz '2025-12-20 09:00:00+01',
       published_by = '11111111-1111-4111-8111-000000000001'
 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';

-- -----------------------------------------------------------------------------
-- Praxis-Stammdaten fuer Rechnungen (ABR-000)
--
-- Vollstaendig erfunden: Anschrift, Steuernummer und Bankverbindung existieren
-- nicht. Die IBAN ist eine seit Jahren veroeffentlichte Test-IBAN und gehoert
-- zu keinem Konto. Die echten Angaben traegt die Praxis in ihrer eigenen
-- Umgebung ein - im Repository haben sie nichts verloren
-- (PROJECT_PRINCIPLES.md 3.1 und 3.3).
--
-- `small_business = false` ist eine Setzung fuer die Demonstration, keine
-- Aussage ueber die Praxis: Nur unter der Regelbesteuerung ist die
-- Steueraufteilung auf der Rechnung ueberhaupt zu sehen. Welcher Status
-- tatsaechlich gilt, beantwortet G13 mit der Steuerberatung (ANN-074).
-- -----------------------------------------------------------------------------
insert into public.practice_billing_profiles (
  organization_id, legal_name, street, house_number, postal_code, city,
  phone, email, tax_number, vat_id, small_business,
  bank_name, account_holder, iban, bic, invoice_number_prefix, payment_term_days
) values (
  '22222222-2222-4222-8222-000000000001',
  'Test Praxis Tuebingen', 'Musterallee', '1', '72070', 'Tuebingen',
  '+49 7071 0000000', 'rechnung@praxis.invalid',
  '86123/45678', null, false,
  'Testbank Tuebingen', 'Test Praxis Tuebingen',
  'DE02120300000000202051', 'TESTDEFFXXX', 'RG', 14
);


-- -----------------------------------------------------------------------------
-- Rechnungsempfaenger (ABR-003a)
--
-- Ein Fall, den ADR-009 Punkt 2 ausdruecklich nennt: Die Rechnung von Frau
-- Fiktiv geht an ihre Betreuung, nicht an sie selbst. Ohne eine solche Zeile
-- waere im Seed nie zu sehen, dass Patientin und Empfaenger zwei Dinge sind.
-- -----------------------------------------------------------------------------
insert into public.invoice_recipients (
  id, organization_id, patient_id, recipient_kind, name,
  street, house_number, postal_code, city, reference, is_default
) values (
  'dddddddd-dddd-4ddd-8ddd-000000000001', '22222222-2222-4222-8222-000000000001',
  '66666666-6666-4666-8666-000000000003', 'guardian', 'Betreuungsbuero Fiktiv GmbH',
  'Verwaltungsweg', '3', '72074', 'Tuebingen', 'BT-2026-0042', true
);

-- -----------------------------------------------------------------------------
-- Accountzuordnung
-- -----------------------------------------------------------------------------
insert into public.user_profiles (id, organization_id, person_id, display_name) values
  ('11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000001', 'Jannes Test'),
  ('11111111-1111-4111-8111-000000000002', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000002', 'Anna Beispiel'),
  ('11111111-1111-4111-8111-000000000003', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000003', 'Olivia Office'),
  ('11111111-1111-4111-8111-000000000004', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000004', 'Tim Teamleitung'),
  ('11111111-1111-4111-8111-000000000005', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000005', 'Max Mustermann'),
  ('11111111-1111-4111-8111-000000000006', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000006', 'Erika Beispiel'),
  ('11111111-1111-4111-8111-000000000007', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000010', 'Tom Trainingsbetreuung');

-- -----------------------------------------------------------------------------
-- Rollen. Jannes hat bewusst zwei Rollen (ADR-004: Mehrfachrollen).
-- -----------------------------------------------------------------------------
insert into public.user_roles (user_id, organization_id, role_key) values
  ('11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000001', 'owner'),
  ('11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000001', 'therapist'),
  ('11111111-1111-4111-8111-000000000002', '22222222-2222-4222-8222-000000000001', 'therapist'),
  ('11111111-1111-4111-8111-000000000003', '22222222-2222-4222-8222-000000000001', 'office'),
  ('11111111-1111-4111-8111-000000000004', '22222222-2222-4222-8222-000000000001', 'therapist'),
  ('11111111-1111-4111-8111-000000000004', '22222222-2222-4222-8222-000000000001', 'team_lead'),
  -- Max und Erika (…005, …006) tragen seit POR-001 keine Rolle mehr: Die
  -- Rolle `patient` wird nie vergeben (ADR-023 Punkt 3). Ihre Profile bleiben
  -- als Konto ohne Praxisrolle stehen, an dem die Abweisungstests hängen.
  -- Ausschliesslich Trainingsbetreuung: nur so laesst sich pruefen, dass
  -- aus dieser Rolle kein Zugriff auf die Behandlungsseite folgt (ADR-021
  -- Punkt 6, PROJECT_PRINCIPLES.md 4.8).
  ('11111111-1111-4111-8111-000000000007', '22222222-2222-4222-8222-000000000001', 'trainer');

-- -----------------------------------------------------------------------------
-- Ein Hausbesuchstag fuer heute (UX-001)
--
-- Rein synthetisch. Bewusst relativ zu current_date statt mit festem Datum:
-- ein fester Tag waere nach kurzer Zeit Vergangenheit, und die Tagesliste
-- haette bei jeder Abnahme nichts zu zeigen.
--
-- Der Tag gehoert Anna Beispiel (therapist) - dem Konto, mit dem die Abnahme
-- die Tagesliste ansieht. Drei Zustaende, damit "offen" und "erledigt"
-- unterscheidbar sind: ein ausstehender Hausbesuch, ein abgeschlossener ohne
-- Dokumentation und ein abgesagter. Der Adress-Snapshot ist die Kopie der
-- Stammdatenadresse zum Zeitpunkt der Anlage (ANN-003).
-- -----------------------------------------------------------------------------
insert into public.appointments (
  id, organization_id, patient_id, staff_member_id, location_id,
  appointment_type, status, starts_at, ends_at,
  visit_street, visit_house_number, visit_postal_code, visit_city,
  completed_at, completed_by, cancelled_at, cancelled_by
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000001', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000001', '55555555-5555-4555-8555-000000000002', null,
   'home_visit', 'confirmed', (current_date + time '09:00') at time zone 'Europe/Berlin', (current_date + time '10:00') at time zone 'Europe/Berlin',
   'Beispielstrasse', '12', '72070', 'Tuebingen', null, null, null, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000002', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000002', '55555555-5555-4555-8555-000000000002', null,
   'home_visit', 'completed', (current_date + time '10:30') at time zone 'Europe/Berlin', (current_date + time '11:30') at time zone 'Europe/Berlin',
   'Testweg', '7', '72072', 'Tuebingen', (current_date + time '11:30') at time zone 'Europe/Berlin', '11111111-1111-4111-8111-000000000002', null, null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000003', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000003', '55555555-5555-4555-8555-000000000002', null,
   'home_visit', 'cancelled', (current_date + time '14:00') at time zone 'Europe/Berlin', (current_date + time '15:00') at time zone 'Europe/Berlin',
   'Fiktivgasse', '9', '72074', 'Tuebingen', null, null, (current_date + time '08:00') at time zone 'Europe/Berlin', '11111111-1111-4111-8111-000000000003'),
  -- Ein Praxistermin bei Jannes, damit der Tagesplan des Teams mehr als eine
  -- Person zeigt und die Zweckbindung sichtbar wird: hier gibt es weder
  -- Adresse noch Zugangshinweis.
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000004', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000001', '55555555-5555-4555-8555-000000000001', '33333333-3333-4333-8333-000000000001',
   'practice', 'confirmed', (current_date + time '16:00') at time zone 'Europe/Berlin', (current_date + time '17:00') at time zone 'Europe/Berlin',
   null, null, null, null, null, null, null, null);

-- -----------------------------------------------------------------------------
-- Durchgefuehrte Termine der Vergangenheit (ABN-001, ANN-210)
--
-- Genutzt zaehlt seit ABN-001 Behandlungstermine, nicht die Leistungsmenge der
-- Positionen. Damit die Grundlagen oben weiter das sagen, was ihre Mengen
-- sagen - Max' Erstverordnung ausgeschoepft (10 von 10), die Folgeverordnung
-- bei 7 von 10, Erikas alte Verordnung bei 2 von 6, der Selbstzahler bei 1 von
-- 8 -, stehen hier die Hausbesuche, die dazu stattgefunden haben: woechentlich,
-- lange vor heute, von Anna durchgefuehrt und abgeschlossen, ohne Dokumentation
-- (ein `completed` ohne finalisierte Dokumentation zaehlt als genutzt).
-- Ueber 30 Tage zurueck, damit keine Tages-, Wochen- oder Kennzahlensicht sie
-- aufnimmt. Feste Kennungen mit dem Praefix der Seed-Termine (aaaaaaaa-...),
-- damit die Test-Umgebung sie von den Terminen ihrer Praxiswoche unterscheidet
-- (scripts/testumgebung.mjs, supabase/tests/testumgebung.test.ts).
-- -----------------------------------------------------------------------------
insert into public.appointments (
  id, organization_id, patient_id, staff_member_id, treatment_basis_id,
  appointment_type, status, starts_at, ends_at,
  visit_street, visit_house_number, visit_postal_code, visit_city,
  completed_at, completed_by
)
select
  ('aaaaaaaa-aaaa-4aaa-8aaa-' || lpad((100 + row_number() over (order by g.patient, g.tage desc))::text, 12, '0'))::uuid,
  '22222222-2222-4222-8222-000000000001', g.patient, '55555555-5555-4555-8555-000000000002', g.grundlage,
  'home_visit', 'completed',
  (current_date - g.tage + time '09:00') at time zone 'Europe/Berlin',
  (current_date - g.tage + time '10:00') at time zone 'Europe/Berlin',
  g.strasse, g.hausnummer, g.plz, 'Tuebingen',
  (current_date - g.tage + time '10:00') at time zone 'Europe/Berlin', '11111111-1111-4111-8111-000000000002'
from (
  -- Max, Erstverordnung: zehn Termine, Tag -210 bis -147.
  select '66666666-6666-4666-8666-000000000001'::uuid as patient, '88888888-8888-4888-8888-000000000001'::uuid as grundlage,
         210 - 7 * n as tage, 'Beispielstrasse' as strasse, '12' as hausnummer, '72070' as plz
  from generate_series(0, 9) n
  union all
  -- Max, Folgeverordnung: sieben Termine, Tag -126 bis -84.
  select '66666666-6666-4666-8666-000000000001', '88888888-8888-4888-8888-000000000002',
         126 - 7 * n, 'Beispielstrasse', '12', '72070'
  from generate_series(0, 6) n
  union all
  -- Erika, alte Verordnung: zwei Termine, Tag -70 und -63.
  select '66666666-6666-4666-8666-000000000002', '88888888-8888-4888-8888-000000000003',
         70 - 7 * n, 'Testweg', '7', '72072'
  from generate_series(0, 1) n
  union all
  -- Erika, Selbstzahler: ein Termin, Tag -42.
  select '66666666-6666-4666-8666-000000000002', '88888888-8888-4888-8888-000000000005',
         42, 'Testweg', '7', '72072'
) g;

-- -----------------------------------------------------------------------------
-- Ein Ereignis des Praxisbetriebs (CAL-015b)
--
-- Eine Besprechung in zwei Kalendern, damit in der Abnahme sichtbar ist, was
-- ein Termin ohne Patient:in ist: Titel statt Name, keine Verordnung, keine
-- Dokumentation - und in beiden Spalten belegte Zeit. 25 Minuten: eine Laenge,
-- die ein Behandlungstermin nicht haben duerfte.
--
-- Beide Zeilen tragen dieselbe `event_group_id`: Es ist EIN Vorgang, und
-- Verschieben, Umbenennen und Absagen treffen seit CAL-017 beide zugleich.
-- -----------------------------------------------------------------------------
insert into public.appointments (
  id, organization_id, patient_id, staff_member_id, location_id,
  appointment_type, kind, title, event_group_id, status, starts_at, ends_at
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000005', '22222222-2222-4222-8222-000000000001', null, '55555555-5555-4555-8555-000000000001', '33333333-3333-4333-8333-000000000001',
   'practice', 'internal', 'Teambesprechung', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'confirmed',
   (current_date + time '08:00') at time zone 'Europe/Berlin', (current_date + time '08:25') at time zone 'Europe/Berlin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000006', '22222222-2222-4222-8222-000000000001', null, '55555555-5555-4555-8555-000000000003', '33333333-3333-4333-8333-000000000001',
   'practice', 'internal', 'Teambesprechung', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'confirmed',
   (current_date + time '08:00') at time zone 'Europe/Berlin', (current_date + time '08:25') at time zone 'Europe/Berlin');

-- -----------------------------------------------------------------------------
-- Mitteilungsvermerk (CAL-012)
--
-- Ein einziger Vermerk, damit in der Abnahme beide Faelle nebeneinander stehen:
-- ein Termin MIT Zeichen und drei ohne. Der Vermerk gilt, weil er in derselben
-- Transaktion entsteht wie der Termin - notified_at ist damit nicht aelter als
-- dessen updated_at.
--
-- Die Anwendung verschickt nichts; der Vermerk beschreibt einen Anruf, den die
-- Praxis selbst gefuehrt hat (B15, ANN-040).
-- -----------------------------------------------------------------------------
insert into public.appointment_notifications (organization_id, appointment_id, channel, notified_by) values
  ('22222222-2222-4222-8222-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'phone', '11111111-1111-4111-8111-000000000003');

-- -----------------------------------------------------------------------------
-- Textbausteine (UX-008)
--
-- Rein synthetisch und ausdruecklich ohne Patientenbezug: ein Baustein ist
-- eine Formulierung, kein Befund. Zwei praxisweite (staff_member_id null) und
-- einer, der nur Anna Beispiel gehoert - damit die beiden Geltungsbereiche in
-- der Abnahme unterscheidbar sind.
-- -----------------------------------------------------------------------------
insert into public.treatment_text_snippets (organization_id, staff_member_id, title, body, created_by, updated_by) values
  ('22222222-2222-4222-8222-000000000001', null, 'Hausbesuch durchgefuehrt',
   'Hausbesuch wie vereinbart durchgefuehrt. Patient:in war zur vereinbarten Zeit anwesend.',
   '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('22222222-2222-4222-8222-000000000001', null, 'Eigenuebungen besprochen',
   'Eigenuebungsprogramm gemeinsam durchgegangen, Ausfuehrung korrigiert und Wiederholungszahl angepasst.',
   '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000002', 'Manuelle Therapie',
   'Manuelle Techniken angewendet, Reaktion im Verlauf der Behandlung beobachtet.',
   '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000002');

-- -----------------------------------------------------------------------------
-- Uebungsbibliothek (UEB-EPIC-001)
--
-- Erfundene, allgemeine Uebungen ohne Bezug auf eine Diagnose - Katalog, keine
-- Empfehlung (ADR-006 Punkt 10). Ketten von leichter nach schwerer entlang je
-- einer Achse (ANN-294), eine ueber zwei Uebungen hinweg (Kniebeuge ->
-- Ausfallschritt) und eine archivierte Uebung (ANN-296). Umlaute bewusst
-- umschrieben wie im Rest dieser Datei.
-- -----------------------------------------------------------------------------
insert into public.exercises
  (id, organization_id, name, lay_name, body_region, archived_at, archived_by, created_by, updated_by) values
  ('abababab-abab-4bab-8bab-000000000001', '22222222-2222-4222-8222-000000000001', 'Kniebeuge', 'In die Hocke gehen', 'knie', null, null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('abababab-abab-4bab-8bab-000000000002', '22222222-2222-4222-8222-000000000001', 'Bruecke', 'Becken heben', 'lws', null, null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('abababab-abab-4bab-8bab-000000000003', '22222222-2222-4222-8222-000000000001', 'Wadenheben', 'Auf die Zehen stellen', 'fuss', null, null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('abababab-abab-4bab-8bab-000000000004', '22222222-2222-4222-8222-000000000001', 'Rudern mit Band', 'Arme zum Koerper ziehen', 'bws', null, null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('abababab-abab-4bab-8bab-000000000005', '22222222-2222-4222-8222-000000000001', 'Ausfallschritt', 'Grosser Schritt nach vorn', 'knie', null, null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('abababab-abab-4bab-8bab-000000000006', '22222222-2222-4222-8222-000000000001', 'Aussenrotation mit Band', 'Arm nach aussen drehen', 'schulter', null, null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('abababab-abab-4bab-8bab-000000000007', '22222222-2222-4222-8222-000000000001', 'Vierfuesslerstand mit Strecken', 'Im Vierfuessler Arm und Bein strecken', 'rumpf', null, null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('abababab-abab-4bab-8bab-000000000008', '22222222-2222-4222-8222-000000000001', 'Kinn-Nicken', 'Kinn sanft Richtung Brust', 'hws', null, null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('abababab-abab-4bab-8bab-000000000009', '22222222-2222-4222-8222-000000000001', 'Beinpresse', 'Beine gegen die Platte druecken', 'knie', now(), '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001');

insert into public.exercise_variants
  (id, organization_id, exercise_id, name, lay_name, instruction, equipment, common_faults, practice_notes, created_by, updated_by) values
  ('acacacac-acac-4cac-8cac-000000000001', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000001', 'Kniebeuge am Gelaender, halbe Tiefe', 'Am Gelaender halb in die Hocke',
   'Mit beiden Haenden am Gelaender festhalten. Langsam halb in die Hocke gehen, kurz halten, wieder aufrichten.',
   array['Gelaender']::text[], 'Knie fallen nach innen; Fersen heben ab.', 'Hoehe des Griffs vor Ort zeigen.', '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000002', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000001', 'Kniebeuge freistehend, halbe Tiefe', 'Frei halb in die Hocke',
   'Fuesse hueftbreit. Arme nach vorn, langsam halb in die Hocke, wieder aufrichten.',
   '{}'::text[], 'Oberkoerper kippt weit nach vorn.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000003', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000001', 'Kniebeuge freistehend, volle Tiefe', 'Frei tief in die Hocke',
   'Fuesse hueftbreit. So tief in die Hocke, wie es ruhig geht, dann wieder aufrichten.',
   '{}'::text[], 'Ruecken rundet sich in der Tiefe.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000004', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000001', 'Kniebeuge einbeinig an der Wand', 'Auf einem Bein in die Hocke, Ruecken an der Wand',
   'Mit dem Ruecken an die Wand lehnen, ein Bein anheben und langsam etwas in die Knie gehen.',
   array['Wand']::text[], 'Becken kippt zur Seite.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000005', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000002', 'Bruecke beidbeinig', 'Becken anheben, beide Fuesse am Boden',
   'Auf dem Ruecken liegen, Fuesse aufstellen. Becken heben, bis Oberkoerper und Oberschenkel eine Linie bilden. Langsam ablegen.',
   array['Matte']::text[], 'Hohlkreuz statt Gesaess anspannen.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000006', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000002', 'Bruecke einbeinig', 'Becken anheben, ein Bein gestreckt',
   'Wie die beidbeinige Bruecke, ein Bein bleibt gestreckt in der Luft.',
   array['Matte']::text[], 'Becken sinkt auf einer Seite ab.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000007', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000003', 'Wadenheben beidbeinig am Stuhl', 'Am Stuhl auf die Zehen',
   'Hinter einem Stuhl stehen, Lehne halten. Auf die Zehen hoch und langsam wieder ab.',
   array['Stuhl']::text[], 'Gewicht auf den Aussenkanten der Fuesse.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000008', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000003', 'Wadenheben einbeinig am Stuhl', 'Am Stuhl auf einem Bein auf die Zehen',
   'Wie beidbeinig, aber nur auf einem Bein. Langsam wieder absenken.',
   array['Stuhl']::text[], null, null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000009', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000004', 'Rudern im Sitzen, Theraband gelb', 'Im Sitzen das gelbe Band heranziehen',
   'Band um die Fuesse legen, Enden greifen. Ellenbogen nah am Koerper nach hinten ziehen, Schulterblaetter zusammen.',
   array['Theraband gelb']::text[], 'Schultern ziehen zu den Ohren.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000010', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000004', 'Rudern im Sitzen, Theraband rot', 'Im Sitzen das rote Band heranziehen',
   'Wie mit dem gelben Band, das rote ist fester.',
   array['Theraband rot']::text[], 'Schultern ziehen zu den Ohren.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000011', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000005', 'Ausfallschritt am Stuhl', 'Grosser Schritt nach vorn, Hand am Stuhl',
   'Eine Hand an der Stuhllehne. Grossen Schritt nach vorn, hinteres Knie Richtung Boden, zurueck in den Stand.',
   array['Stuhl']::text[], 'Vorderes Knie schiebt weit ueber die Zehen.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000012', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000006', 'Aussenrotation im Stehen, Theraband gelb', 'Im Stehen den Arm mit dem gelben Band nach aussen drehen',
   'Ellenbogen am Koerper, Unterarm nach vorn. Band nach aussen ziehen, langsam zurueck.',
   array['Theraband gelb']::text[], 'Ellenbogen loest sich vom Koerper.', 'Handtuchrolle zwischen Ellenbogen und Koerper zeigen.', '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000013', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000007', 'Vierfuesslerstand, Arm strecken', 'Im Vierfuessler einen Arm nach vorn strecken',
   'Auf Haenden und Knien. Einen Arm nach vorn strecken, Ruecken bleibt ruhig, wieder absetzen.',
   array['Matte']::text[], 'Becken dreht mit.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000014', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000007', 'Vierfuesslerstand, Arm und Bein gegengleich', 'Im Vierfuessler Arm und gegenueberliegendes Bein strecken',
   'Wie mit dem Arm, dazu das gegenueberliegende Bein nach hinten strecken.',
   array['Matte']::text[], 'Hohlkreuz beim Strecken des Beins.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000015', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000008', 'Kinn-Nicken im Liegen', 'Im Liegen das Kinn sanft nicken',
   'Auf dem Ruecken liegen, Kopf auf einem flachen Kissen. Kinn sanft Richtung Brust nicken, kurz halten.',
   array['Kissen']::text[], 'Kopf hebt vom Kissen ab.', null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('acacacac-acac-4cac-8cac-000000000016', '22222222-2222-4222-8222-000000000001', 'abababab-abab-4bab-8bab-000000000009', 'Beinpresse am Geraet', 'An der Beinpresse druecken',
   'Fuesse hueftbreit auf die Platte, Platte wegdruecken, langsam zurueck.',
   array['Beinpresse']::text[], null, null, '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001');

insert into public.exercise_variant_links
  (id, organization_id, easier_variant_id, harder_variant_id, axis, created_by) values
  ('adadadad-adad-4dad-8dad-000000000001', '22222222-2222-4222-8222-000000000001', 'acacacac-acac-4cac-8cac-000000000001', 'acacacac-acac-4cac-8cac-000000000002', 'unterstuetzung', '11111111-1111-4111-8111-000000000001'),
  ('adadadad-adad-4dad-8dad-000000000002', '22222222-2222-4222-8222-000000000001', 'acacacac-acac-4cac-8cac-000000000002', 'acacacac-acac-4cac-8cac-000000000003', 'bewegungsausmass', '11111111-1111-4111-8111-000000000001'),
  ('adadadad-adad-4dad-8dad-000000000003', '22222222-2222-4222-8222-000000000001', 'acacacac-acac-4cac-8cac-000000000003', 'acacacac-acac-4cac-8cac-000000000004', 'unterstuetzungsflaeche', '11111111-1111-4111-8111-000000000001'),
  ('adadadad-adad-4dad-8dad-000000000004', '22222222-2222-4222-8222-000000000001', 'acacacac-acac-4cac-8cac-000000000005', 'acacacac-acac-4cac-8cac-000000000006', 'unterstuetzungsflaeche', '11111111-1111-4111-8111-000000000001'),
  ('adadadad-adad-4dad-8dad-000000000005', '22222222-2222-4222-8222-000000000001', 'acacacac-acac-4cac-8cac-000000000007', 'acacacac-acac-4cac-8cac-000000000008', 'unterstuetzungsflaeche', '11111111-1111-4111-8111-000000000001'),
  ('adadadad-adad-4dad-8dad-000000000006', '22222222-2222-4222-8222-000000000001', 'acacacac-acac-4cac-8cac-000000000009', 'acacacac-acac-4cac-8cac-000000000010', 'last', '11111111-1111-4111-8111-000000000001'),
  ('adadadad-adad-4dad-8dad-000000000007', '22222222-2222-4222-8222-000000000001', 'acacacac-acac-4cac-8cac-000000000013', 'acacacac-acac-4cac-8cac-000000000014', 'komplexitaet', '11111111-1111-4111-8111-000000000001'),
  ('adadadad-adad-4dad-8dad-000000000008', '22222222-2222-4222-8222-000000000001', 'acacacac-acac-4cac-8cac-000000000003', 'acacacac-acac-4cac-8cac-000000000011', 'komplexitaet', '11111111-1111-4111-8111-000000000001');

-- katalog:anfang - erzeugt von scripts/katalog-sql.mjs (pnpm katalog:sql --schreiben), nicht von Hand aendern.
-- Der mitgelieferte Uebungskatalog (UEB-012, ANN-382), uebernommen wie per Knopf, mit
-- festen Kennungen. Ein Namenskonflikt mit den Uebungen oben bricht den Seed ab.
do $seed$
declare
  v_ergebnis jsonb;
begin
  v_ergebnis := app.import_exercise_catalog_for(
    '22222222-2222-4222-8222-000000000001',
    '11111111-1111-4111-8111-000000000001',
    $katalog$[
{"schluessel":"HW-01","version":"1.0.0","name":"Kraniozervikale Flexion (Kinn-Nicken)","alltagsname":"Kinn sanft nicken","region":"hws","ziel":"stabilitaet","ausgangsstellung":"rueckenlage","hilfsmittel":["handtuch"],"niveau":1,"dosierung":{"wiederholungen":10,"halten_s":10,"taeglich":2},"anleitung":["Legen Sie sich auf den Rücken, stellen Sie die Beine an und legen Sie ein flach gefaltetes Handtuch unter den Kopf.","Nicken Sie ganz sanft mit dem Kinn Richtung Brust, als wollten Sie leise „ja“ sagen.","Der Hinterkopf bleibt dabei auf dem Handtuch liegen, der Nacken wird etwas länger.","Halten Sie die Stellung so lange wie im Plan angegeben, atmen Sie ruhig weiter und lassen Sie dann locker."],"fehler":["Der Kopf hebt vom Handtuch ab, statt nur zu nicken.","Die Halsmuskeln vorn spannen sich sichtbar an.","Das Nicken ist zu kräftig; gemeint ist eine kleine, sanfte Bewegung."]},
{"schluessel":"HW-02","version":"1.0.0","name":"HWS-Retraktion im Sitz","alltagsname":"Kinn nach hinten schieben","region":"hws","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":[],"niveau":1,"dosierung":{"wiederholungen":10,"taeglich":3},"anleitung":["Setzen Sie sich aufrecht hin, die Schultern sind locker und der Blick geht geradeaus.","Schieben Sie den Kopf langsam waagerecht nach hinten, sodass ein kleines Doppelkinn entsteht.","Der Blick bleibt dabei geradeaus, der Kopf neigt sich weder nach oben noch nach unten.","Halten Sie kurz und lassen Sie den Kopf wieder locker nach vorn gleiten."],"fehler":["Der Kopf neigt sich nach hinten, der Blick geht zur Decke.","Das Kinn wird zur Brust gezogen, statt den Kopf nach hinten zu schieben.","Die Schultern ziehen mit nach oben."],"bild":{"v":1,"basis":"sitz","start":{"rumpf":0,"kopf":24},"ende":{"rumpf":0,"kopf":2},"bewegung":["kopf"]}},
{"schluessel":"HW-03","version":"1.0.0","name":"HWS-Rotation, aktiv","alltagsname":"Kopf zur Seite drehen","region":"hws","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":[],"niveau":1,"dosierung":{"wiederholungen":10,"je_seite":true,"taeglich":2},"anleitung":["Setzen Sie sich aufrecht hin, die Schultern sind locker.","Drehen Sie den Kopf langsam zu einer Seite, als wollten Sie über die Schulter schauen.","Gehen Sie nur so weit, wie es angenehm ist, und drehen Sie dann ruhig zurück zur Mitte.","Drehen Sie abwechselnd zu beiden Seiten."],"fehler":["Der Oberkörper dreht mit.","Der Kopf neigt sich beim Drehen zur Seite oder nach vorn.","Die Bewegung geht mit Schwung ans Ende."]},
{"schluessel":"HW-04","version":"1.0.0","name":"HWS-Lateralflexion, aktiv","alltagsname":"Ohr Richtung Schulter neigen","region":"hws","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":[],"niveau":1,"dosierung":{"wiederholungen":10,"je_seite":true,"taeglich":2},"anleitung":["Setzen Sie sich aufrecht hin, die Arme hängen locker.","Neigen Sie den Kopf langsam zur Seite, das Ohr wandert Richtung Schulter.","Die Nase zeigt dabei weiter nach vorn, und die Schulter bleibt unten.","Kommen Sie ruhig zurück zur Mitte und neigen Sie abwechselnd zu beiden Seiten."],"fehler":["Die Schulter wird zum Ohr hochgezogen.","Der Kopf dreht sich beim Neigen mit."],"bild":{"v":1,"basis":"sitz_front","start":{},"ende":{"kopf":30},"bewegung":["kopf"]}},
{"schluessel":"HW-05","version":"1.0.0","name":"Dehnung M. trapezius pars descendens","alltagsname":"Nacken seitlich dehnen","region":"hws","ziel":"dehnung","ausgangsstellung":"sitz","hilfsmittel":["stuhl"],"niveau":1,"dosierung":{"saetze":3,"dauer_s":30,"je_seite":true,"taeglich":1},"anleitung":["Setzen Sie sich aufrecht auf einen Stuhl und halten Sie sich mit der rechten Hand seitlich an der Sitzfläche fest.","Neigen Sie den Kopf langsam zur linken Schulter, die Nase zeigt weiter nach vorn.","Legen Sie die linke Hand auf den Kopf und verstärken Sie die Neigung nur ganz sanft, bis Sie rechts im Nacken eine Dehnung spüren.","Halten Sie die Dehnung ruhig, atmen Sie weiter und wechseln Sie danach die Seite."],"fehler":["Die Hand zieht kräftig am Kopf.","Die Schulter der gedehnten Seite zieht nach oben.","Der Kopf dreht sich, statt sich zu neigen."],"bild":{"v":1,"basis":"sitz_front","start":{"haende":["sitz",null]},"ende":{"kopf":28,"arm":[10,156],"ellbogen":[6,123],"haende":["sitz",null]},"bewegung":["kopf"]}},
{"schluessel":"HW-06","version":"1.0.0","name":"Dehnung des Schulterblatthebers","alltagsname":"Nacken schräg nach vorn dehnen","region":"hws","ziel":"dehnung","ausgangsstellung":"sitz","hilfsmittel":["stuhl"],"niveau":2,"dosierung":{"saetze":3,"dauer_s":30,"je_seite":true,"taeglich":1},"anleitung":["Setzen Sie sich aufrecht auf einen Stuhl und halten Sie sich mit der rechten Hand seitlich an der Sitzfläche fest.","Drehen Sie den Kopf etwa halb nach links und neigen Sie ihn dann nach vorn, als wollten Sie in die linke Achsel schauen.","Legen Sie die linke Hand auf den Hinterkopf und lassen Sie das Gewicht des Arms die Dehnung rechts hinten im Nacken sanft verstärken.","Halten Sie die Dehnung ruhig, atmen Sie weiter und wechseln Sie danach die Seite."],"fehler":["Die Hand zieht den Kopf kräftig nach unten.","Die Schulter der gedehnten Seite zieht nach oben.","Der Rücken wird rund, statt nur den Kopf zu neigen."]},
{"schluessel":"HW-07","version":"1.0.0","name":"HWS-Isometrie gegen Handwiderstand","alltagsname":"Kopf gegen die Hand drücken","region":"hws","ziel":"stabilitaet","ausgangsstellung":"sitz","hilfsmittel":[],"niveau":2,"dosierung":{"wiederholungen":5,"halten_s":5,"taeglich":1},"anleitung":["Setzen Sie sich aufrecht hin und legen Sie eine Hand seitlich an den Kopf, über dem Ohr.","Drücken Sie den Kopf sanft gegen die Hand und halten Sie mit der Hand dagegen, sodass sich der Kopf nicht bewegt.","Halten Sie den Druck, atmen Sie dabei weiter und lassen Sie langsam los.","Üben Sie jede Richtung so oft wie im Plan: zu beiden Seiten, mit der Hand an der Stirn und mit beiden Händen am Hinterkopf."],"fehler":["Es wird mit voller Kraft gedrückt; gemeint ist ein leichter Druck.","Der Kopf weicht aus und bewegt sich.","Die Luft wird angehalten."],"hinweise_praxis":"Die Dosierung gilt je Richtung: rechts, links, Stirn und Hinterkopf. Das Bild zeigt nur die Hand an der Seite.","bild":{"v":1,"basis":"sitz_front","start":{"arm":[121,10],"ellbogen":[145,6]},"ende":{"arm":[121,10],"ellbogen":[145,6]}}},
{"schluessel":"HW-08","version":"1.0.0","name":"Hinterkopf in die Unterlage drücken","alltagsname":"Hinterkopf sanft ins Kissen drücken","region":"hws","ziel":"kraft","ausgangsstellung":"rueckenlage","hilfsmittel":["kissen"],"niveau":1,"dosierung":{"wiederholungen":10,"halten_s":5,"taeglich":1},"anleitung":["Legen Sie sich auf den Rücken, der Kopf liegt auf einem flachen Kissen, die Beine sind angestellt.","Ziehen Sie das Kinn leicht ein und drücken Sie den Hinterkopf sanft in das Kissen.","Halten Sie den Druck, atmen Sie ruhig weiter und lassen Sie dann locker."],"fehler":["Das Kinn hebt sich, der Kopf wird nach hinten überstreckt.","Es wird so fest gedrückt, dass sich die Schultern anspannen oder abheben."],"bild":{"v":1,"basis":"rueckenlage_angestellt","start":{},"ende":{},"hilfsmittel":[{"art":"kissen","an":"kopf"}]}},
{"schluessel":"HW-09","version":"1.0.0","name":"Kopfabheben mit Kinn-Nicken (Ausdauer der Nackenbeuger)","alltagsname":"Kopf mit eingezogenem Kinn anheben","region":"hws","ziel":"kraft","ausgangsstellung":"rueckenlage","hilfsmittel":[],"niveau":3,"dosierung":{"wiederholungen":5,"halten_s":10,"taeglich":1},"anleitung":["Legen Sie sich auf den Rücken und stellen Sie die Beine an.","Nicken Sie das Kinn sanft ein und halten Sie es so.","Heben Sie den Kopf nur wenige Zentimeter von der Unterlage ab, das Kinn bleibt eingezogen.","Halten Sie den Kopf ruhig in der Luft und legen Sie ihn dann langsam wieder ab."],"fehler":["Das Kinn schiebt sich nach vorn zur Decke.","Der Kopf wird zu hoch gehoben.","Der Kopf zittert, weil die Haltezeit zu lang ist."],"hinweise_praxis":"Die Haltezeit endet, sobald das Kinn nach vorn schiebt oder der Kopf zittert; dann im Plan kürzer dosieren.","bild":{"v":1,"basis":"rueckenlage_angestellt","start":{"kopf":8},"ende":{"kopf":34},"bewegung":["kopf"]}},
{"schluessel":"HW-10","version":"1.0.0","name":"Selbstmobilisation obere HWS mit Handtuch (Rotation)","alltagsname":"Kopf mit dem Handtuch drehen","region":"hws","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":["handtuch"],"niveau":3,"dosierung":{"wiederholungen":6,"je_seite":true,"taeglich":1},"anleitung":["Setzen Sie sich aufrecht hin und legen Sie ein Handtuch quer um den oberen Nacken, direkt unter dem Hinterkopf.","Halten Sie ein Ende unten vor der Brust fest und führen Sie das andere Ende so nach vorn, wie es Ihnen in der Praxis gezeigt wurde.","Drehen Sie den Kopf langsam zur Seite, das Handtuch begleitet und unterstützt die Drehung.","Halten Sie am Ende der Drehung kurz und drehen Sie ruhig zurück zur Mitte.","Hören Sie sofort auf, wenn Ihnen schwindelig oder übel wird."],"fehler":["Das Handtuch liegt zu tief am Nacken.","Es wird mit Schwung oder kräftigem Zug gedreht.","Der Oberkörper dreht mit."],"hinweise_praxis":"Nur nach Befund der oberen Halswirbelsäule und nach gemeinsamem Einüben; Griff und Zugrichtung vor Ort zeigen. Bei Schwindel, Sehstörungen, Übelkeit oder Kribbeln abbrechen."},
{"schluessel":"HW-11","version":"1.0.0","name":"Nackenstreckung im Vierfüßlerstand","alltagsname":"Im Vierfüßler Kopf heben und senken","region":"hws","ziel":"stabilitaet","ausgangsstellung":"vierfuessler","hilfsmittel":["matte"],"niveau":3,"dosierung":{"saetze":2,"wiederholungen":10},"anleitung":["Gehen Sie auf einer Matte in den Vierfüßlerstand: Hände unter den Schultern, Knie unter den Hüften.","Halten Sie den Rücken gerade und lassen Sie den Kopf mit leicht eingezogenem Kinn nach unten sinken.","Heben Sie den Kopf langsam an, bis er wieder in einer Linie mit dem Rücken ist.","Schauen Sie dabei weiter zum Boden und heben Sie den Kopf nicht über die Linie des Rückens."],"fehler":["Der Kopf wird über die Linie des Rückens hinaus in den Nacken gelegt.","Der Rücken hängt durch oder wird rund.","Die Schultern sinken zwischen die Arme."],"hinweise_praxis":"Der Vierfüßlerstand ist für viele Ältere wegen Knien oder Handgelenken nicht möglich; dann eine Übung im Sitz aus derselben Gruppe wählen.","bild":{"v":1,"basis":"vierfuessler","unterlage":"matte","start":{"kopf":42,"huefte":[72.5,72.5],"schulter":[72.5,72.5]},"ende":{"kopf":0,"huefte":[72.5,72.5],"schulter":[72.5,72.5]},"bewegung":["kopf"]}},
{"schluessel":"BW-01","version":"1.0.0","name":"Aufrichtung im Sitz","alltagsname":"Sich groß machen","region":"bws","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":["stuhl"],"niveau":1,"dosierung":{"wiederholungen":10,"halten_s":5,"taeglich":3},"anleitung":["Setzen Sie sich auf einen Stuhl, ohne sich anzulehnen, die Füße stehen flach auf dem Boden.","Lassen Sie den Rücken zuerst locker rund werden.","Richten Sie sich dann langsam auf, als zöge ein Faden am Scheitel Sie nach oben.","Halten Sie die aufrechte Haltung, atmen Sie ruhig weiter und lassen Sie wieder locker."],"fehler":["Das Kinn wird nach vorn oben geschoben, statt den Hinterkopf lang zu machen.","Es entsteht ein starkes Hohlkreuz.","Die Schultern ziehen zu den Ohren."],"hinweise_praxis":"Gedacht als kurze Haltungspause mehrmals am Tag; 3-mal täglich ist nur der Startwert.","bild":{"v":1,"basis":"sitz","start":{"rumpf":6,"huefte":[96,96],"wirbelsaeule":34,"kopf":-6},"ende":{"rumpf":0,"huefte":[90,90],"wirbelsaeule":-4},"bewegung":["kopf"]}},
{"schluessel":"BW-02","version":"1.0.0","name":"Skapula-Retraktion im Sitz","alltagsname":"Schulterblätter nach hinten-unten ziehen","region":"bws","ziel":"kraft","ausgangsstellung":"sitz","hilfsmittel":["stuhl"],"niveau":1,"dosierung":{"saetze":2,"wiederholungen":10,"halten_s":3,"taeglich":1},"anleitung":["Setzen Sie sich aufrecht auf einen Stuhl, die Arme hängen locker.","Ziehen Sie beide Schulterblätter sanft nach hinten und unten, als wollten Sie sie in die hinteren Hosentaschen stecken.","Halten Sie die Spannung und atmen Sie dabei ruhig weiter.","Lassen Sie die Schultern langsam wieder locker."],"fehler":["Die Schultern werden zu den Ohren hochgezogen.","Der Rücken geht ins Hohlkreuz, statt nur die Schulterblätter zu bewegen.","Das Kinn schiebt sich nach vorn."]},
{"schluessel":"BW-03","version":"1.0.0","name":"BWS-Extension über die Stuhllehne","alltagsname":"Über die Lehne nach hinten strecken","region":"bws","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":["stuhl"],"niveau":2,"dosierung":{"wiederholungen":10,"taeglich":1},"anleitung":["Setzen Sie sich auf einen Stuhl mit fester Lehne, der Rücken lehnt an.","Verschränken Sie die Hände hinter dem Kopf, die Ellbogen zeigen nach vorn.","Lehnen Sie den oberen Rücken langsam über die Oberkante der Lehne nach hinten und schauen Sie dabei leicht nach oben.","Kommen Sie ruhig zurück in den aufrechten Sitz."],"fehler":["Die Bewegung kommt aus dem unteren Rücken, das Gesäß rutscht nach vorn.","Der Kopf wird mit den Händen in den Nacken gezogen.","Es wird mit Schwung nach hinten gelehnt."],"hinweise_praxis":"Nur mit standfestem Stuhl, der nicht nach hinten kippen kann; die Lehne sollte etwa bis zur Mitte des Rückens reichen.","bild":{"v":1,"basis":"sitz","start":{"rumpf":-6,"huefte":[84,84],"haende":["nacken","nacken"]},"ende":{"rumpf":-18,"huefte":[72,72],"wirbelsaeule":-16,"kopf":-8,"haende":["nacken","nacken"]},"bewegung":["kopf"]}},
{"schluessel":"BW-04","version":"1.0.0","name":"BWS-Rotation im Sitz","alltagsname":"Oberkörper drehen","region":"bws","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":["stuhl"],"niveau":1,"dosierung":{"wiederholungen":10,"je_seite":true,"taeglich":1},"anleitung":["Setzen Sie sich aufrecht auf einen Stuhl, die Füße stehen fest auf dem Boden.","Kreuzen Sie die Arme vor der Brust, die Hände liegen auf den Schultern.","Drehen Sie den Oberkörper langsam zu einer Seite, so weit es angenehm geht; die Knie zeigen weiter nach vorn.","Drehen Sie ruhig zurück zur Mitte und wechseln Sie die Seite."],"fehler":["Das Becken und die Knie drehen mit.","Der Oberkörper neigt sich beim Drehen zur Seite.","Die Drehung wird mit Schwung ans Ende geführt."]},
{"schluessel":"BW-05","version":"1.0.0","name":"Rumpfseitneige im Sitz","alltagsname":"Zur Seite neigen","region":"bws","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":["stuhl"],"niveau":1,"dosierung":{"wiederholungen":10,"je_seite":true,"taeglich":1},"anleitung":["Setzen Sie sich aufrecht auf einen Stuhl, die Füße stehen hüftbreit auf dem Boden.","Stützen Sie eine Hand in die Hüfte und lassen Sie den anderen Arm locker hängen.","Neigen Sie den Oberkörper langsam zur Seite des hängenden Arms, die Hand sinkt Richtung Boden.","Richten Sie sich ruhig wieder auf; beide Gesäßhälften bleiben dabei auf dem Stuhl.","Wechseln Sie nach allen Wiederholungen die Seite."],"fehler":["Eine Gesäßhälfte hebt vom Stuhl ab.","Der Oberkörper kippt nach vorn, statt sich zur Seite zu neigen."],"hinweise_praxis":"Bei Unsicherheit im Sitz einen Stuhl mit Armlehnen wählen oder seitlich sichern.","bild":{"v":1,"basis":"sitz_front","start":{"haende":["huefte",null]},"ende":{"rumpf":15,"bein":[-9,21],"knie":[90,63.5],"arm":[10,20],"haende":["huefte",null]},"bewegung":["ellbogen_fern"]}},
{"schluessel":"BW-06","version":"1.0.0","name":"Offenes Buch (Rotation in Seitlage)","alltagsname":"Arm in Seitlage aufklappen","region":"bws","ziel":"mobilitaet","ausgangsstellung":"seitlage","hilfsmittel":["kissen"],"niveau":2,"dosierung":{"wiederholungen":10,"je_seite":true,"taeglich":1},"anleitung":["Legen Sie sich auf die Seite, der Kopf liegt auf einem Kissen, Hüften und Knie sind etwa rechtwinklig gebeugt.","Strecken Sie beide Arme auf Schulterhöhe nach vorn, die Handflächen liegen aufeinander.","Öffnen Sie den oberen Arm langsam in einem Bogen nach hinten und schauen Sie der Hand nach, die Knie bleiben aufeinander.","Führen Sie den Arm ruhig wieder zurück und wechseln Sie nach allen Wiederholungen die Seite."],"fehler":["Das obere Knie rutscht vom unteren weg, das Becken dreht mit.","Der Arm wird mit Schwung nach hinten geworfen.","Der Kopf bleibt stehen, statt der Hand zu folgen."],"hinweise_praxis":"Den Arm nur so weit öffnen, wie es ohne Schmerz in der Schulter geht; er muss den Boden nicht erreichen."},
{"schluessel":"BW-07","version":"1.0.0","name":"Katzenbuckel und Pferderücken","alltagsname":"Rücken rund und hohl machen","region":"bws","ziel":"mobilitaet","ausgangsstellung":"vierfuessler","hilfsmittel":["matte"],"niveau":2,"dosierung":{"wiederholungen":10,"taeglich":1},"anleitung":["Gehen Sie auf einer Matte in den Vierfüßlerstand: Hände unter den Schultern, Knie unter den Hüften.","Machen Sie den Rücken langsam rund wie eine Katze und lassen Sie dabei den Kopf sinken.","Lassen Sie den Rücken danach langsam etwas durchhängen und heben Sie den Blick leicht an.","Wechseln Sie ruhig und fließend zwischen beiden Stellungen und atmen Sie dabei weiter."],"fehler":["Der Kopf wird im Hohlkreuz weit in den Nacken gelegt.","Die Bewegung kommt nur aus dem unteren Rücken.","Die Arme beugen sich, statt gestreckt zu bleiben."],"hinweise_praxis":"Der Vierfüßlerstand ist für viele Ältere wegen Knien oder Handgelenken nicht möglich; dann eine Übung im Sitz aus derselben Gruppe wählen.","bild":{"v":1,"basis":"vierfuessler","unterlage":"matte","start":{"wirbelsaeule":34,"kopf":30,"huefte":[72.5,72.5],"schulter":[72.5,72.5]},"ende":{"wirbelsaeule":-22,"kopf":-8,"huefte":[72.5,72.5],"schulter":[72.5,72.5]},"bewegung":["kopf"]}},
{"schluessel":"BW-08","version":"1.0.0","name":"Rudern mit Theraband","alltagsname":"Band zum Körper ziehen","region":"bws","ziel":"kraft","ausgangsstellung":"sitz","hilfsmittel":["theraband","stuhl","tuerrahmen"],"niveau":2,"dosierung":{"saetze":3,"wiederholungen":12},"anleitung":["Befestigen Sie das Band in Brusthöhe an einem festen Halt vor Ihnen, etwa an einer Türklinke.","Setzen Sie sich aufrecht auf einen Stuhl und fassen Sie die Enden mit gestreckten Armen.","Ziehen Sie die Ellbogen dicht am Körper nach hinten und die Schulterblätter zueinander.","Lassen Sie die Arme langsam und kontrolliert wieder nach vorn."],"fehler":["Der Oberkörper lehnt sich nach hinten, statt nur die Arme zu bewegen.","Die Schultern ziehen zu den Ohren.","Das Band schnellt zurück, statt langsam nachgelassen zu werden."],"hinweise_praxis":"Die Bandstärke steht in der Dosierung als Last, etwa „Theraband gelb“.","bild":{"v":1,"basis":"sitz","start":{"rumpf":0,"schulter":[72,68],"ellbogen":[6,6]},"ende":{"rumpf":0,"schulter":[-24,-28],"ellbogen":[100,100]},"hilfsmittel":[{"art":"tuerrahmen","x":92},{"art":"band","von":"tuerrahmen","nach":"hand_nah"}],"bewegung":["hand_nah"]}},
{"schluessel":"BW-09","version":"1.0.0","name":"Band auseinanderziehen (Pull-Apart)","alltagsname":"Band vor der Brust auseinanderziehen","region":"bws","ziel":"kraft","ausgangsstellung":"stand","hilfsmittel":["theraband"],"niveau":2,"dosierung":{"saetze":3,"wiederholungen":12},"anleitung":["Stellen Sie sich aufrecht hin und fassen Sie das Band schulterbreit mit beiden Händen.","Heben Sie die gestreckten Arme vor dem Körper auf Brusthöhe.","Ziehen Sie das Band langsam auseinander, bis die Arme zur Seite zeigen, und führen Sie die Schulterblätter dabei zueinander.","Lassen Sie die Arme langsam wieder zusammenkommen."],"fehler":["Die Schultern ziehen zu den Ohren.","Der Rücken geht ins Hohlkreuz.","Die Ellbogen beugen sich stark."],"hinweise_praxis":"Die Bandstärke steht in der Dosierung als Last, etwa „Theraband gelb“."},
{"schluessel":"BW-10","version":"1.0.0","name":"Wandengel (Arme an der Wand gleiten)","alltagsname":"Arme an der Wand hochschieben","region":"bws","ziel":"mobilitaet","ausgangsstellung":"stand","hilfsmittel":["wand"],"niveau":2,"dosierung":{"saetze":2,"wiederholungen":10,"taeglich":1},"anleitung":["Stellen Sie sich mit dem Rücken an eine Wand, die Füße stehen eine Fußlänge davor.","Legen Sie Hinterkopf, Rücken und Gesäß an die Wand und heben Sie die Arme seitlich, die Ellbogen sind rechtwinklig gebeugt.","Schieben Sie die Arme langsam an der Wand nach oben, so weit es geht, ohne dass der Rücken sich löst.","Gleiten Sie ruhig zurück in die Ausgangsstellung."],"fehler":["Der untere Rücken löst sich von der Wand, ein Hohlkreuz entsteht.","Die Schultern ziehen zu den Ohren.","Die Arme verlieren den Kontakt zur Wand."],"hinweise_praxis":"Erreichen die Unterarme die Wand nicht, nur so weit bewegen, wie Rücken und Kopf an der Wand bleiben.","bild":{"v":1,"basis":"stand_front","start":{"arm":[88,88],"ellbogen":[88,88]},"ende":{"arm":[150,150],"ellbogen":[24,24]},"bewegung":["hand_nah","hand_fern"]}},
{"schluessel":"BW-11","version":"1.0.0","name":"Brustmuskeldehnung im Türrahmen","alltagsname":"Brust im Türrahmen dehnen","region":"bws","ziel":"dehnung","ausgangsstellung":"stand","hilfsmittel":["tuerrahmen"],"niveau":2,"dosierung":{"saetze":3,"dauer_s":30,"taeglich":1},"anleitung":["Stellen Sie sich in eine offene Tür.","Legen Sie beide Unterarme an den Türrahmen, die Ellbogen sind etwa auf Schulterhöhe.","Machen Sie einen kleinen Schritt nach vorn, bis Sie vorn an der Brust eine Dehnung spüren.","Halten Sie die Dehnung ruhig, atmen Sie weiter und treten Sie dann wieder zurück."],"fehler":["Der Rücken geht ins Hohlkreuz, statt den Oberkörper aufrecht zu halten.","Die Schultern ziehen nach oben.","Der Schritt ist so groß, dass es in der Schulter zieht oder kribbelt."],"hinweise_praxis":"Kribbeln oder Taubheit im Arm sind kein Dehngefühl: dann die Ellbogen tiefer legen oder den Schritt verkleinern.","bild":{"v":1,"basis":"stand_front","start":{"arm":[88,88],"ellbogen":[90,90]},"ende":{"arm":[88,88],"ellbogen":[90,90]},"hilfsmittel":[{"art":"tuerrahmen","x":-47},{"art":"tuerrahmen","x":47}]}},
{"schluessel":"BW-12","version":"1.0.0","name":"Armheben in Bauchlage (Y und T)","alltagsname":"In Bauchlage Arme anheben","region":"bws","ziel":"kraft","ausgangsstellung":"bauchlage","hilfsmittel":["kissen","matte"],"niveau":3,"dosierung":{"saetze":2,"wiederholungen":[8,10]},"anleitung":["Legen Sie sich auf den Bauch, ein flaches Kissen liegt unter dem Bauch, die Stirn ruht auf der Unterlage.","Strecken Sie die Arme schräg nach vorn aus wie ein Y, die Daumen zeigen nach oben.","Heben Sie beide Arme ein kleines Stück von der Unterlage ab, halten Sie kurz und legen Sie sie langsam ab.","Üben Sie danach genauso mit seitlich ausgestreckten Armen wie ein T."],"fehler":["Der Kopf wird angehoben und in den Nacken gelegt.","Die Schultern ziehen zu den Ohren.","Der untere Rücken geht ins Hohlkreuz."],"hinweise_praxis":"Bauchlage ist für viele Hochbetagte nicht möglich (Atmung, Herz, Endoprothese); dann im Sitz üben, etwa „Rudern mit Theraband“.","bild":{"v":1,"basis":"bauchlage","unterlage":"matte","start":{"schulter":[176,176]},"ende":{"schulter":[192,192]},"hilfsmittel":[{"art":"kissen","an":"becken"}],"bewegung":["ellbogen_nah"]}},
{"schluessel":"EH-01","version":"1.0.0","name":"Ellenbogen beugen und strecken","alltagsname":"Arm beugen und strecken","region":"ellenbogen","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":[],"niveau":1,"dosierung":{"saetze":2,"wiederholungen":10,"taeglich":2},"anleitung":["Setzen Sie sich aufrecht hin, die Arme hängen locker neben dem Körper, die Handflächen zeigen nach vorn.","Beugen Sie einen oder beide Ellbogen langsam, bis die Hand Richtung Schulter kommt.","Strecken Sie den Arm danach langsam wieder ganz.","Der Oberarm bleibt dabei ruhig neben dem Körper."],"fehler":["Der Oberarm wandert nach vorn, statt neben dem Körper zu bleiben.","Der Arm wird am Ende nicht ganz gestreckt.","Die Bewegung geht mit Schwung."],"hinweise_praxis":"Nach Ruhigstellung oder Operation gelten Bewegungsgrenzen nach ärztlicher Vorgabe.","bild":{"v":1,"basis":"sitz","start":{"schulter":[15,10],"ellbogen":[5,5]},"ende":{"schulter":[15,10],"ellbogen":[132,128]},"bewegung":["hand_nah"]}},
{"schluessel":"EH-02","version":"1.0.0","name":"Pro- und Supination","alltagsname":"Handfläche nach oben und unten drehen","region":"ellenbogen","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":["tisch"],"niveau":1,"dosierung":{"saetze":2,"wiederholungen":10,"taeglich":2},"anleitung":["Setzen Sie sich an einen Tisch und legen Sie den Unterarm auf, der Ellbogen ist rechtwinklig gebeugt und liegt am Körper.","Drehen Sie die Handfläche langsam nach oben, so weit es angenehm geht.","Drehen Sie sie danach langsam nach unten, bis der Handrücken oben liegt.","Nur der Unterarm dreht sich, der Ellbogen bleibt am Körper."],"fehler":["Der Ellbogen wandert vom Körper weg, die Schulter dreht mit.","Die Drehung kommt aus dem Handgelenk statt aus dem Unterarm."]},
{"schluessel":"EH-03","version":"1.0.0","name":"Bizepscurl","alltagsname":"Gewicht zur Schulter beugen","region":"ellenbogen","ziel":"kraft","ausgangsstellung":"sitz","hilfsmittel":["hantel"],"niveau":2,"dosierung":{"saetze":3,"wiederholungen":12},"anleitung":["Setzen Sie sich aufrecht hin und nehmen Sie in jede Hand eine Hantel oder eine Wasserflasche.","Lassen Sie die Arme neben dem Körper hängen, die Handflächen zeigen nach vorn.","Beugen Sie die Ellbogen langsam und führen Sie das Gewicht Richtung Schulter.","Senken Sie es langsam wieder ab, bis die Arme fast gestreckt sind."],"fehler":["Der Oberkörper schwingt nach hinten mit.","Die Ellbogen wandern nach vorn.","Das Gewicht fällt schnell nach unten, statt langsam abgesenkt zu werden."],"hinweise_praxis":"Das Gewicht steht in der Dosierung als Last, etwa „1 kg“ oder „0,5-l-Flasche“.","bild":{"v":1,"basis":"sitz","start":{"schulter":[15,10],"ellbogen":[5,5]},"ende":{"schulter":[15,10],"ellbogen":[128,124]},"hilfsmittel":[{"art":"hantel","an":"hand_nah"}],"bewegung":["hand_nah"]}},
{"schluessel":"EH-04","version":"1.0.0","name":"Trizepsstrecken mit Abstützen","alltagsname":"Arm nach hinten strecken","region":"ellenbogen","ziel":"kraft","ausgangsstellung":"stand","hilfsmittel":["tisch","hantel"],"niveau":2,"dosierung":{"saetze":3,"wiederholungen":12,"je_seite":true},"anleitung":["Stellen Sie sich vor einen Tisch und stützen Sie sich mit einer Hand darauf ab, der Rücken ist gerade nach vorn geneigt.","Nehmen Sie das Gewicht in die andere Hand und legen Sie den Oberarm eng an den Körper, der Ellbogen ist gebeugt.","Strecken Sie den Ellbogen langsam, bis der Arm gerade nach hinten zeigt; der Oberarm bleibt ruhig.","Beugen Sie den Arm langsam wieder und wechseln Sie nach allen Wiederholungen die Seite."],"fehler":["Der Oberarm schwingt mit, statt ruhig am Körper zu bleiben.","Der Rücken wird rund.","Das Gewicht wird mit Schwung nach hinten geworfen."],"hinweise_praxis":"Das Gewicht steht in der Dosierung als Last, etwa „1 kg“; die stützende Hand gibt Halt und Gleichgewicht.","bild":{"v":1,"basis":"stand","start":{"rumpf":58,"huefte":[64,64],"knie":[12,12],"schulter":[-18,60],"ellbogen":[95,0],"haende":[null,"tisch"]},"ende":{"rumpf":58,"huefte":[64,64],"knie":[12,12],"schulter":[-18,60],"ellbogen":[4,0],"haende":[null,"tisch"]},"hilfsmittel":[{"art":"tisch","x":70},{"art":"hantel","an":"hand_nah"}],"bewegung":["hand_nah"]}},
{"schluessel":"EH-05","version":"1.0.0","name":"Exzentrische Handgelenksextension","alltagsname":"Gewicht langsam absenken","region":"ellenbogen","ziel":"kraft","ausgangsstellung":"sitz","hilfsmittel":["tisch","hantel"],"niveau":2,"dosierung":{"saetze":3,"wiederholungen":15,"taeglich":1},"anleitung":["Setzen Sie sich an einen Tisch und legen Sie den Unterarm so auf, dass die Hand über die Kante ragt, die Handfläche zeigt nach unten.","Nehmen Sie ein leichtes Gewicht in die Hand und heben Sie die Hand mit Hilfe der anderen Hand nach oben.","Lassen Sie die helfende Hand los und senken Sie das Gewicht ganz langsam ab, etwa 3 bis 4 Sekunden lang.","Heben Sie die Hand wieder mit Hilfe der anderen Hand an und beginnen Sie von vorn."],"fehler":["Das Gewicht wird aus eigener Kraft wieder hochgehoben statt mit der anderen Hand.","Das Absenken geht zu schnell.","Der Unterarm hebt von der Tischplatte ab."],"hinweise_praxis":"Die Dosierung gilt für einen Arm; für beide Seiten im Plan „je Seite“ setzen. Ein leichter Belastungsschmerz während der Übung ist häufig, er sollte bis zum nächsten Tag abklingen. Gewicht als Last eintragen."},
{"schluessel":"EH-06","version":"1.0.0","name":"Dehnung der Handgelenkstrecker","alltagsname":"Handrücken sanft beugen","region":"ellenbogen","ziel":"dehnung","ausgangsstellung":"stand","hilfsmittel":[],"niveau":1,"dosierung":{"saetze":3,"dauer_s":30,"taeglich":1},"anleitung":["Stellen Sie sich aufrecht hin und strecken Sie einen Arm gerade nach vorn, die Handfläche zeigt nach unten.","Beugen Sie das Handgelenk, sodass die Finger nach unten zeigen.","Ziehen Sie mit der anderen Hand den Handrücken sanft zu sich, bis Sie oben am Unterarm eine Dehnung spüren.","Halten Sie die Dehnung ruhig und atmen Sie weiter."],"fehler":["Der Ellbogen wird gebeugt.","Es wird ruckartig oder kräftig gezogen.","Die Schulter zieht nach oben."],"hinweise_praxis":"Die Dosierung gilt für einen Arm; für beide Seiten im Plan „je Seite“ setzen. Kribbeln in den Fingern ist kein Dehngefühl."},
{"schluessel":"EH-07","version":"1.0.0","name":"Handgelenk beugen und strecken","alltagsname":"Hand auf und ab bewegen","region":"hand","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":["tisch"],"niveau":1,"dosierung":{"saetze":2,"wiederholungen":10,"taeglich":2},"anleitung":["Setzen Sie sich an einen Tisch und legen Sie den Unterarm so auf, dass die Hand über die Kante ragt.","Heben Sie die Hand langsam nach oben, so weit es angenehm geht.","Senken Sie sie danach langsam nach unten, so weit es angenehm geht.","Der Unterarm bleibt dabei ruhig liegen, die Finger sind locker."],"fehler":["Der Unterarm hebt von der Tischplatte ab.","Die Finger werden zur festen Faust geschlossen.","Die Bewegung geht mit Schwung."]},
{"schluessel":"EH-08","version":"1.0.0","name":"Faustschluss und Finger spreizen","alltagsname":"Faust machen, Finger spreizen","region":"hand","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":[],"niveau":1,"dosierung":{"saetze":2,"wiederholungen":10,"taeglich":3},"anleitung":["Setzen Sie sich bequem hin und legen Sie den Unterarm auf dem Oberschenkel oder einem Tisch ab.","Schließen Sie die Hand langsam zu einer lockeren Faust, der Daumen liegt außen.","Öffnen Sie die Hand danach und spreizen Sie die Finger weit auseinander.","Wechseln Sie ruhig zwischen Faust und gespreizten Fingern."],"fehler":["Die Faust wird mit voller Kraft zusammengedrückt.","Die Finger werden beim Öffnen nicht ganz gestreckt."],"hinweise_praxis":"Bei geschwollener Hand die Übung mit hochgelagertem Arm ausführen lassen."},
{"schluessel":"EH-09","version":"1.0.0","name":"Sehnengleitübungen","alltagsname":"Finger in fünf Stellungen führen","region":"hand","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":[],"niveau":1,"dosierung":{"wiederholungen":5,"taeglich":3},"anleitung":["Setzen Sie sich bequem hin, stützen Sie den Ellbogen auf und strecken Sie die Finger gerade nach oben.","Beugen Sie nur die vorderen Fingergelenke zu einer Hakenfaust, strecken Sie die Finger wieder und schließen Sie die Hand dann zur vollen Faust.","Beugen Sie danach nur die Fingergrundgelenke, die Finger bleiben gestreckt wie eine Tischplatte.","Machen Sie zuletzt eine gerade Faust: Die Fingerkuppen berühren unten die Handfläche, die vordersten Gelenke bleiben gestreckt.","Kehren Sie nach jeder Stellung zur geraden Hand zurück und halten Sie jede Stellung kurz."],"fehler":["Die Stellungen werden mit Kraft erzwungen statt ruhig erreicht.","Das Handgelenk beugt sich mit.","Bei der Hakenfaust beugen sich auch die Fingergrundgelenke."],"hinweise_praxis":"Die Dosierung gilt je Stellung. Die fünf Stellungen einmal gemeinsam einüben; nach Operation an Sehnen der Hand gilt das Schema der Handchirurgie."},
{"schluessel":"EH-10","version":"1.0.0","name":"Griffkraft mit Softball","alltagsname":"Weichen Ball zusammendrücken","region":"hand","ziel":"kraft","ausgangsstellung":"sitz","hilfsmittel":["ball"],"niveau":1,"dosierung":{"saetze":3,"wiederholungen":10,"halten_s":3,"taeglich":1},"anleitung":["Setzen Sie sich bequem hin und nehmen Sie einen weichen Ball in die Hand.","Drücken Sie den Ball mit der ganzen Hand zusammen, so fest es angenehm ist.","Halten Sie den Druck so lange wie im Plan angegeben und atmen Sie dabei weiter.","Lassen Sie langsam los und öffnen Sie die Hand ganz."],"fehler":["Das Handgelenk knickt beim Drücken ab.","Die Luft wird angehalten.","Es wird so fest gedrückt, dass es schmerzt."],"hinweise_praxis":"Ein Schaumstoffball oder eine zusammengerollte Socke genügt; die Härte des Balls als Last eintragen."},
{"schluessel":"EH-11","version":"1.0.0","name":"Handtuch auswringen","alltagsname":"Handtuch auswringen","region":"hand","ziel":"kraft","ausgangsstellung":"sitz","hilfsmittel":["handtuch"],"niveau":2,"dosierung":{"saetze":3,"wiederholungen":10,"taeglich":1},"anleitung":["Setzen Sie sich aufrecht hin und fassen Sie ein zusammengerolltes Handtuch mit beiden Händen vor dem Körper.","Drehen Sie die Hände gegeneinander, als wollten Sie das Handtuch auswringen.","Lösen Sie die Spannung und drehen Sie danach in die andere Richtung.","Arbeiten Sie langsam und nur mit so viel Kraft, wie es angenehm ist."],"fehler":["Die Schultern ziehen nach oben.","Es wird ruckartig gedreht.","Die Handgelenke knicken stark ab."],"hinweise_praxis":"Belastet Handgelenk und Daumensattelgelenk deutlich; erst üben, wenn diese Belastung erlaubt ist."},
{"schluessel":"EH-12","version":"1.0.0","name":"Daumen-Finger-Opposition","alltagsname":"Daumen tippt jede Fingerkuppe an","region":"hand","ziel":"koordination","ausgangsstellung":"sitz","hilfsmittel":[],"niveau":1,"dosierung":{"saetze":3,"wiederholungen":4,"taeglich":2},"anleitung":["Setzen Sie sich bequem hin, die Hand ist locker geöffnet.","Tippen Sie mit der Daumenkuppe nacheinander die Kuppen von Zeigefinger, Mittelfinger, Ringfinger und kleinem Finger an.","Jede Fingerkuppe zählt als eine Wiederholung; nach dem kleinen Finger ist ein Durchgang geschafft.","Achten Sie darauf, dass sich die Kuppen berühren und jedes Mal ein kleines „O“ entsteht."],"fehler":["Der Daumen berührt die Finger seitlich statt mit der Kuppe.","Die Bewegung wird hastig statt genau ausgeführt."]},
{"schluessel":"KN-01","version":"1.0.0","name":"Kniestreckung im Sitz (Long Arc Quad)","alltagsname":"Im Sitz das Knie strecken","region":"knie","ziel":"kraft","ausgangsstellung":"sitz","hilfsmittel":["stuhl"],"hilfsmittel_optional":["gewichtsmanschette"],"niveau":1,"dosierung":{"saetze":3,"wiederholungen":10,"halten_s":3,"je_seite":true,"taeglich":1},"anleitung":["Setzen Sie sich aufrecht auf einen Stuhl, beide Füße stehen flach auf dem Boden.","Strecken Sie ein Knie langsam, bis das Bein fast gerade ist.","Ziehen Sie die Fußspitze zu sich und halten Sie das Bein 3 Sekunden.","Senken Sie den Fuß langsam ab und wechseln Sie nach allen Wiederholungen die Seite."],"fehler":["Der Oberkörper lehnt sich nach hinten.","Das Bein fällt schnell zurück, statt langsam abgesenkt zu werden."],"hinweise_praxis":"Steigerung über eine Gewichtsmanschette am Knöchel; die Last im Plan als Dosierung eintragen.","bild":{"v":1,"basis":"sitz","start":{},"ende":{"knie":[8,87],"sprung":[-12,0],"fuss_flach":[false,true]},"bewegung":["knoechel_nah"]}},
{"schluessel":"KN-02","version":"1.0.0","name":"Kniebeugung im Sitz","alltagsname":"Fuß unter den Stuhl ziehen","region":"knie","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":["stuhl"],"niveau":1,"dosierung":{"saetze":2,"wiederholungen":10,"taeglich":3},"anleitung":["Setzen Sie sich vorn auf die Stuhlkante, beide Füße stehen auf dem Boden.","Schieben Sie einen Fuß langsam nach hinten unter den Stuhl, so weit es angenehm geht.","Bleiben Sie dort einen Moment und schieben Sie den Fuß wieder nach vorn."],"fehler":["Das Gesäß rutscht nach vorn, statt das Knie zu beugen.","Die Ferse hebt früh ab und das Knie beugt kaum."],"bild":{"v":1,"basis":"sitz","start":{"knie":[80,87]},"ende":{"knie":[122,87],"fuss_flach":[false,true],"sprung":[-5,0]},"bewegung":["knoechel_nah"]}},
{"schluessel":"KN-03","version":"1.0.0","name":"Fußgleiten im Sitz","alltagsname":"Fuß auf dem Handtuch vor und zurück","region":"knie","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":["stuhl","handtuch"],"niveau":1,"dosierung":{"saetze":2,"wiederholungen":15,"taeglich":3},"anleitung":["Setzen Sie sich auf einen Stuhl und legen Sie ein Handtuch unter einen Fuß.","Schieben Sie den Fuß auf dem Handtuch langsam nach vorn, bis das Knie fast gestreckt ist.","Ziehen Sie den Fuß danach so weit zurück, wie es angenehm geht.","Bewegen Sie sich ruhig und ohne Schwung."],"fehler":["Der Fuß wird angehoben statt geschoben.","Der Oberkörper schaukelt mit."],"bild":{"v":1,"basis":"sitz","start":{"knie":[105,87]},"ende":{"knie":[35,87],"loesen":{"winkel":"huefte_nah","gleich":["ferse_nah","ferse_fern"]}},"bewegung":["knoechel_nah"]}},
{"schluessel":"KN-04","version":"1.0.0","name":"Passive Kniestreckung, Ferse hochgelagert","alltagsname":"Ferse hochlegen, Knie hängen lassen","region":"knie","ziel":"mobilitaet","ausgangsstellung":"sitz","hilfsmittel":["stuhl","handtuch"],"niveau":1,"dosierung":{"saetze":1,"dauer_s":240,"taeglich":3},"anleitung":["Setzen Sie sich auf einen Stuhl und legen Sie die Ferse auf einen zweiten Stuhl.","Legen Sie ein gefaltetes Handtuch unter die Ferse, nicht unter das Knie.","Lassen Sie das Knie locker durchhängen und atmen Sie ruhig weiter.","Bleiben Sie so lange in dieser Lage, wie es im Plan steht."],"fehler":["Das Knie wird aktiv durchgedrückt, statt locker zu hängen.","Ein Kissen liegt unter dem Knie und hält es gebeugt."],"hinweise_praxis":"Nach Knieendoprothese keine Dauerlagerung mit Kissen unter dem Knie: Das Kissen nur für die Übung verwenden, sonst droht ein Streckdefizit.","bild":{"v":1,"basis":"sitz","start":{"fuesse":["hocker",null],"fuss_flach":[false,true],"sprung":[-5,0]},"ende":{"fuesse":["hocker",null],"fuss_flach":[false,true],"sprung":[-5,0]},"hilfsmittel":[{"art":"hocker","x":96}]}},
{"schluessel":"KN-05","version":"1.0.0","name":"Patellamobilisation","alltagsname":"Kniescheibe sanft verschieben","region":"knie","ziel":"mobilitaet","ausgangsstellung":"rueckenlage","hilfsmittel":[],"niveau":1,"dosierung":{"saetze":1,"wiederholungen":10,"taeglich":2},"anleitung":["Legen Sie sich auf den Rücken, das Bein liegt gestreckt und ganz locker.","Fassen Sie die Kniescheibe mit Daumen und Zeigefinger am oberen und unteren Rand.","Schieben Sie sie sanft nach oben und unten, danach nach rechts und links.","Bewegen Sie jede Richtung 10-mal, ohne auf die Kniescheibe zu drücken."],"fehler":["Die Oberschenkelmuskulatur ist angespannt, die Kniescheibe bewegt sich kaum.","Es wird auf die Kniescheibe gedrückt, statt sie zu schieben."],"hinweise_praxis":"Erst nach abgeschlossener Wundheilung, nicht über der Narbe."},
{"schluessel":"KN-06","version":"1.0.0","name":"Endgradige Kniestreckung mit Band (TKE)","alltagsname":"Knie gegen das Band durchstrecken","region":"knie","ziel":"kraft","ausgangsstellung":"stand","hilfsmittel":["theraband","tuerrahmen"],"niveau":2,"dosierung":{"saetze":3,"wiederholungen":12,"je_seite":true},"anleitung":["Befestigen Sie das Band in Kniehöhe an einem festen Gegenstand, etwa am Türrahmen.","Stellen Sie sich mit dem Gesicht dazu und legen Sie das Band hinter ein Knie.","Beugen Sie das Knie leicht und strecken Sie es dann gegen den Zug des Bandes ganz.","Lassen Sie das Knie langsam wieder leicht beugen."],"fehler":["Das Knie wird ruckartig nach hinten durchgedrückt.","Das Becken weicht nach hinten aus, statt das Knie zu strecken."],"hinweise_praxis":"Die Bandstärke als Last in der Dosierung eintragen, etwa „Theraband gelb“.","bild":{"v":1,"basis":"stand","start":{"huefte":[22,22],"knie":[34,34],"rumpf":8},"ende":{},"hilfsmittel":[{"art":"tuerrahmen","x":62},{"art":"band","von":"tuerrahmen","nach":"knie_nah"}],"bewegung":["knie_nah"]}},
{"schluessel":"KN-07","version":"1.0.0","name":"Mini-Kniebeuge mit Halt","alltagsname":"Mit Halt leicht in die Knie gehen","region":"knie","ziel":"kraft","ausgangsstellung":"stand","hilfsmittel":["tisch"],"niveau":1,"dosierung":{"saetze":3,"wiederholungen":10},"anleitung":["Stellen Sie sich vor die Arbeitsplatte und halten Sie sich mit beiden Händen fest.","Stellen Sie die Füße hüftbreit auseinander.","Gehen Sie langsam ein kleines Stück in die Knie, als wollten Sie sich setzen.","Richten Sie sich wieder auf, ohne die Knie ganz durchzudrücken."],"fehler":["Die Knie schieben weit über die Fußspitzen.","Die Knie fallen nach innen.","Die Fersen heben ab."],"bild":{"v":1,"basis":"stand","start":{"haende":["tisch","tisch"]},"ende":{"rumpf":22,"huefte":[60,60],"knie":[52,52],"haende":["tisch","tisch"]},"hilfsmittel":[{"art":"tisch","x":34}],"bewegung":["becken"]}},
{"schluessel":"KN-08","version":"1.0.0","name":"Kniebeuge zum Stuhl","alltagsname":"Bis zum Stuhl absenken und wieder hoch","region":"knie","ziel":"kraft","ausgangsstellung":"stand","hilfsmittel":["stuhl"],"niveau":2,"dosierung":{"saetze":3,"wiederholungen":10},"anleitung":["Stellen Sie sich mit dem Rücken vor einen Stuhl, die Füße stehen hüftbreit.","Schieben Sie das Gesäß nach hinten und senken Sie sich langsam ab, bis es den Sitz berührt.","Setzen Sie sich nicht ab, sondern drücken Sie sich gleich wieder in den Stand.","Strecken Sie die Arme dabei nach vorn, wenn es das Gleichgewicht erleichtert."],"fehler":["Die Person lässt sich auf den Stuhl fallen.","Die Knie fallen nach innen.","Der Oberkörper kippt weit nach vorn."],"bild":{"v":1,"basis":"stand","start":{"schulter":[80,76],"ellbogen":[4,4]},"ende":{"sitz":"stuhl","rumpf":34,"huefte":[116,116],"knie":[113,113],"schulter":[112,108],"ellbogen":[4,4]},"bewegung":["becken"]}},
{"schluessel":"KN-09","version":"1.0.0","name":"Kniebeuge an der Wand (Wall Slide)","alltagsname":"An der Wand in die Knie gleiten","region":"knie","ziel":"kraft","ausgangsstellung":"stand","hilfsmittel":["wand"],"niveau":2,"dosierung":{"saetze":3,"wiederholungen":10},"anleitung":["Lehnen Sie sich mit dem Rücken an eine Wand, die Füße stehen etwa eine Fußlänge davor.","Gleiten Sie mit dem Rücken langsam an der Wand nach unten, bis die Knie leicht gebeugt sind.","Halten Sie kurz und schieben Sie sich wieder nach oben."],"fehler":["Die Knie fallen nach innen.","Das Gesäß löst sich von der Wand."],"bild":{"v":1,"basis":"stand","anker":"becken","start":{"huefte":[15,15]},"ende":{"huefte":[50,50],"knie":[65,65]},"hilfsmittel":[{"art":"wand","x":-8}],"bewegung":["becken"]}},
{"schluessel":"KN-10","version":"1.0.0","name":"Wandsitz","alltagsname":"An der Wand sitzen","region":"knie","ziel":"kraft","ausgangsstellung":"stand","hilfsmittel":["wand"],"niveau":3,"dosierung":{"saetze":3,"dauer_s":30},"anleitung":["Lehnen Sie sich mit dem Rücken an eine Wand.","Gehen Sie mit den Füßen ein Stück nach vorn und gleiten Sie nach unten, bis die Knie etwa rechtwinklig sind.","Halten Sie diese Stellung und atmen Sie ruhig weiter.","Schieben Sie sich danach an der Wand wieder nach oben."],"fehler":["Die Knie schieben über die Fußspitzen hinaus.","Die Luft wird angehalten."],"hinweise_praxis":"Die Tiefe nach Beschwerden wählen; rechtwinklig ist das Ziel, nicht der Anfang.","bild":{"v":1,"basis":"stand","anker":"becken","start":{"huefte":[30,30]},"ende":{"huefte":[88,88],"knie":[88,88]},"hilfsmittel":[{"art":"wand","x":-8}],"bewegung":["becken"]}},
{"schluessel":"KN-11","version":"1.0.0","name":"Aufsteigen auf eine Stufe (Step-up)","alltagsname":"Auf die Stufe steigen","region":"knie","ziel":"kraft","ausgangsstellung":"stand","hilfsmittel":["stufe"],"niveau":2,"dosierung":{"saetze":3,"wiederholungen":10,"je_seite":true},"anleitung":["Stellen Sie sich vor eine Stufe und halten Sie sich bei Bedarf am Geländer fest.","Setzen Sie einen Fuß ganz auf die Stufe.","Steigen Sie mit der Kraft dieses Beins hinauf, bis Sie auf der Stufe stehen.","Steigen Sie rückwärts wieder hinunter, zuerst mit dem anderen Bein."],"fehler":["Das Knie fällt beim Hochsteigen nach innen.","Das untere Bein stößt sich kräftig vom Boden ab."],"bild":{"v":1,"basis":"stand","start":{"rumpf":6,"huefte":[60,6],"knie":[75,0],"fuesse":["stufe",null]},"ende":{"stuetze":"ferse_nah"},"hilfsmittel":[{"art":"stufe","x":-12}],"bewegung":["becken"]}},
{"schluessel":"KN-12","version":"1.0.0","name":"Exzentrischer Step-down","alltagsname":"Langsam von der Stufe absenken","region":"knie","ziel":"kraft","ausgangsstellung":"stand","hilfsmittel":["stufe"],"niveau":3,"dosierung":{"saetze":3,"wiederholungen":8,"je_seite":true},"anleitung":["Stellen Sie sich auf die unterste Stufe und halten Sie sich am Geländer fest.","Stellen Sie ein Bein frei über die Kante nach vorn.","Beugen Sie das Standbein langsam, bis die Ferse des freien Beins den Boden berührt.","Drücken Sie sich mit dem Standbein wieder nach oben."],"fehler":["Das Becken kippt zur Seite des freien Beins.","Das Standbein wird schnell gebeugt statt langsam.","Das Knie des Standbeins fällt nach innen."],"bild":{"v":1,"basis":"stand","start":{"huefte":[0,24],"fuss_flach":[true,false],"sprung":[0,-5],"stuetze":"ferse_nah"},"ende":{"rumpf":20,"huefte":[62,48],"knie":[90,0],"fuss_flach":[true,false],"sprung":[0,-10],"stuetze":"ferse_nah"},"hilfsmittel":[{"art":"stufe","x":14,"nach":"hinten"}],"bewegung":["becken"]}},
{"schluessel":"KN-13","version":"1.0.0","name":"Kniebeuge in Schrittstellung mit Halt (Split Squat)","alltagsname":"In Schrittstellung absenken","region":"knie","ziel":"kraft","ausgangsstellung":"stand","hilfsmittel":["stuhl"],"niveau":3,"dosierung":{"saetze":3,"wiederholungen":8,"je_seite":true},"anleitung":["Stellen Sie sich neben eine Stuhllehne und halten Sie sich mit einer Hand fest.","Machen Sie einen großen Schritt nach vorn, die hintere Ferse hebt ab.","Senken Sie sich gerade nach unten, bis das hintere Knie fast den Boden berührt.","Drücken Sie sich wieder nach oben und wechseln Sie nach allen Wiederholungen die Seite."],"fehler":["Das vordere Knie schiebt weit über die Fußspitze.","Der Oberkörper kippt nach vorn.","Die Schritte sind zu kurz."],"bild":{"v":1,"basis":"stand","start":{"huefte":[25,-32],"fuss_flach":[true,false],"sprung":[0,15],"haende":[null,"lehne"],"loesen":{"winkel":"sprung_fern","gleich":["zehen_fern","ferse_nah"]}},"ende":{"huefte":[80,-5],"knie":[90,75],"fuss_flach":[true,false],"sprung":[0,-25],"haende":[null,"lehne"],"loesen":{"winkel":"sprung_fern","gleich":["zehen_fern","ferse_nah"]}},"hilfsmittel":[{"art":"stuhl","x":6}],"bewegung":["becken"]}},
{"schluessel":"KN-14","version":"1.0.0","name":"Kniebeugung im Stand (Beinbeuger)","alltagsname":"Ferse Richtung Po heben","region":"knie","ziel":"kraft","ausgangsstellung":"stand","hilfsmittel":["stuhl"],"hilfsmittel_optional":["gewichtsmanschette"],"niveau":1,"dosierung":{"saetze":3,"wiederholungen":10,"je_seite":true},"anleitung":["Stellen Sie sich hinter einen Stuhl und halten Sie sich an der Lehne fest.","Heben Sie eine Ferse langsam Richtung Po, das Knie zeigt dabei nach unten.","Senken Sie den Fuß langsam wieder ab.","Wechseln Sie nach allen Wiederholungen die Seite."],"fehler":["Das Knie wandert nach vorn.","Der Oberkörper kippt nach vorn, das Hohlkreuz verstärkt sich."],"hinweise_praxis":"Steigerung über eine Gewichtsmanschette am Knöchel; die Last im Plan als Dosierung eintragen.","bild":{"v":1,"basis":"stand","anker":"knoechel_fern","start":{"haende":["lehne","lehne"]},"ende":{"knie":[98,0],"fuss_flach":[false,true],"sprung":[15,0],"haende":["lehne","lehne"]},"hilfsmittel":[{"art":"stuhl","x":32}],"bewegung":["ferse_nah"]}},
{"schluessel":"KN-15","version":"1.0.0","name":"Beinbeuger in Bauchlage","alltagsname":"In Bauchlage die Ferse zum Po","region":"knie","ziel":"kraft","ausgangsstellung":"bauchlage","hilfsmittel":["matte"],"hilfsmittel_optional":["gewichtsmanschette"],"niveau":2,"dosierung":{"saetze":3,"wiederholungen":10,"je_seite":true},"anleitung":["Legen Sie sich auf den Bauch, die Stirn ruht auf einem flachen Kissen oder auf den Händen.","Beugen Sie ein Knie langsam, bis der Unterschenkel senkrecht steht.","Senken Sie den Unterschenkel langsam wieder ab.","Wechseln Sie nach allen Wiederholungen die Seite."],"fehler":["Das Becken hebt sich von der Unterlage.","Der Unterschenkel fällt am Ende schnell zurück."],"hinweise_praxis":"Bauchlage ist für viele Hochbetagte nicht möglich (Atmung, Herz, Endoprothese); dann die Übung im Stand wählen.","bild":{"v":1,"basis":"bauchlage","unterlage":"matte","start":{},"ende":{"knie":[90,0],"sprung":[10,70]},"hilfsmittel":[{"art":"kissen","an":"kopf"}],"bewegung":["ferse_nah"]}},
{"schluessel":"KN-16","version":"1.0.0","name":"Dehnung der ischiokruralen Muskulatur im Sitz","alltagsname":"Bein ausstrecken, nach vorn neigen","region":"knie","ziel":"dehnung","ausgangsstellung":"sitz","hilfsmittel":["stuhl"],"niveau":1,"dosierung":{"saetze":3,"dauer_s":30,"je_seite":true,"taeglich":1},"anleitung":["Setzen Sie sich vorn auf die Stuhlkante.","Strecken Sie ein Bein nach vorn aus, die Ferse steht auf dem Boden, die Fußspitze zeigt nach oben.","Neigen Sie den geraden Oberkörper langsam nach vorn, bis Sie hinten am Oberschenkel eine Dehnung spüren.","Halten Sie die Dehnung ruhig und atmen Sie weiter."],"fehler":["Der Rücken wird rund, statt aus der Hüfte nach vorn zu neigen.","Es wird gewippt."],"bild":{"v":1,"basis":"sitz","start":{"knie":[4,87],"sprung":[-15,0],"fuss_flach":[false,true],"haende":["oberschenkel","oberschenkel"],"loesen":{"winkel":"huefte_nah","gleich":["ferse_nah","ferse_fern"]}},"ende":{"rumpf":32,"huefte":[70,118],"knie":[4,87],"sprung":[-15,0],"fuss_flach":[false,true],"haende":["knie","knie"],"loesen":{"winkel":"huefte_nah","gleich":["ferse_nah","ferse_fern"]}},"bewegung":["schulter"]}},
{"schluessel":"KN-17","version":"1.0.0","name":"Dehnung der ischiokruralen Muskulatur mit Handtuch","alltagsname":"In Rückenlage das Bein mit dem Handtuch heben","region":"knie","ziel":"dehnung","ausgangsstellung":"rueckenlage","hilfsmittel":["handtuch","matte"],"niveau":2,"dosierung":{"saetze":3,"dauer_s":30,"je_seite":true,"taeglich":1},"anleitung":["Legen Sie sich auf den Rücken und legen Sie ein Handtuch um eine Fußsohle.","Halten Sie die Enden des Handtuchs mit beiden Händen.","Ziehen Sie das gestreckte Bein langsam nach oben, bis Sie hinten am Bein eine Dehnung spüren.","Halten Sie die Dehnung ruhig, das andere Bein bleibt auf der Unterlage liegen."],"fehler":["Das Knie des gehobenen Beins wird gebeugt.","Der Kopf hebt von der Unterlage ab."],"bild":{"v":1,"basis":"rueckenlage","unterlage":"matte","start":{"huefte":[30,0],"schulter":[45,45],"ellbogen":[30,30],"sprung":[-5,12]},"ende":{"huefte":[78,0],"schulter":[75,75],"ellbogen":[25,25],"sprung":[-10,12]},"hilfsmittel":[{"art":"handtuch","von":"zehen_nah","nach":"hand_nah"}],"bewegung":["knoechel_nah"]}},
{"schluessel":"KN-18","version":"1.0.0","name":"Quadrizepsdehnung im Stand","alltagsname":"Im Stand die Ferse zum Po ziehen","region":"knie","ziel":"dehnung","ausgangsstellung":"stand","hilfsmittel":["stuhl"],"hilfsmittel_optional":["handtuch"],"niveau":2,"dosierung":{"saetze":3,"dauer_s":30,"je_seite":true,"taeglich":1},"anleitung":["Stellen Sie sich an eine Stuhllehne und halten Sie sich mit einer Hand fest.","Beugen Sie ein Knie und fassen Sie den Fuß mit der Hand derselben Seite; reicht sie nicht, legen Sie ein Handtuch um den Fuß.","Ziehen Sie die Ferse sanft Richtung Po, bis Sie vorn am Oberschenkel eine Dehnung spüren.","Halten Sie die Knie nebeneinander und den Oberkörper aufrecht."],"fehler":["Das Hohlkreuz verstärkt sich.","Das gebeugte Knie wandert nach vorn oder zur Seite."],"bild":{"v":1,"basis":"stand","anker":"knoechel_fern","start":{"knie":[95,0],"fuss_flach":[false,true],"sprung":[20,0],"haende":["fuss","lehne"]},"ende":{"huefte":[-6,0],"knie":[138,0],"fuss_flach":[false,true],"sprung":[30,0],"haende":["fuss","lehne"]},"hilfsmittel":[{"art":"stuhl","x":30}],"bewegung":["ferse_nah"]}},
{"schluessel":"KN-19","version":"1.0.0","name":"Einbeinige Mini-Kniebeuge mit Halt","alltagsname":"Auf einem Bein leicht in die Knie gehen","region":"knie","ziel":"stabilitaet","ausgangsstellung":"stand","hilfsmittel":["tisch"],"niveau":3,"dosierung":{"saetze":3,"wiederholungen":8,"je_seite":true},"anleitung":["Stellen Sie sich vor die Arbeitsplatte und halten Sie sich mit beiden Händen leicht fest.","Heben Sie einen Fuß etwas vom Boden ab.","Beugen Sie das Standbein langsam ein kleines Stück und strecken Sie es wieder.","Achten Sie darauf, dass das Knie über dem Fuß bleibt."],"fehler":["Das Knie fällt nach innen.","Das Becken sinkt auf der Seite des freien Beins ab.","Die Hände tragen das Gewicht."],"bild":{"v":1,"basis":"stand","start":{"huefte":[0,8],"knie":[0,85],"fuss_flach":[true,false],"sprung":[0,20],"haende":["tisch","tisch"]},"ende":{"rumpf":20,"huefte":[52,26],"knie":[44,85],"fuss_flach":[true,false],"sprung":[0,20],"haende":["tisch","tisch"]},"hilfsmittel":[{"art":"tisch","x":34}],"bewegung":["becken"]}}
]$katalog$::jsonb,
    true);
  if jsonb_array_length(v_ergebnis -> 'conflicts') > 0 then
    raise exception 'Katalog im Seed: Namenskonflikt %', v_ergebnis -> 'conflicts';
  end if;
end
$seed$;
-- katalog:ende

-- -----------------------------------------------------------------------------
-- Uebungsplaene (UEB-EPIC-002)
--
-- Erfunden: ein Heimprogramm fuer Erika in der Behandlung, das in fuenf Tagen
-- auslaeuft (Wiedervorlage, ANN-302), und ein Trainingsplan fuer Tina. Beide
-- entstehen wie in der Anwendung als Entwurf, bekommen ihren Schnappschuss
-- (ANN-300) und werden dann zugewiesen - der Riegel laesst genau diesen Weg zu.
-- -----------------------------------------------------------------------------
insert into public.exercise_plans
  (id, organization_id, service_area, patient_id, training_relationship_id, title, sessions_per_week, created_by, updated_by) values
  ('aeaeaeae-aeae-4eae-8eae-000000000001', '22222222-2222-4222-8222-000000000001', 'therapy', '66666666-6666-4666-8666-000000000002', null, 'Heimprogramm Knie', 3, '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000002'),
  ('aeaeaeae-aeae-4eae-8eae-000000000002', '22222222-2222-4222-8222-000000000001', 'training', null, 'eeeeeeee-eeee-4eee-8eee-000000000001', 'Kraft Grundlagen', 2, '11111111-1111-4111-8111-000000000007', '11111111-1111-4111-8111-000000000007');

insert into public.exercise_plan_items
  (organization_id, plan_id, position, variant_id, sets, reps_min, reps_max, duration_seconds, load, tempo, rest_seconds, double_progression, note, created_by, updated_by) values
  ('22222222-2222-4222-8222-000000000001', 'aeaeaeae-aeae-4eae-8eae-000000000001', 1, 'acacacac-acac-4cac-8cac-000000000001', 3, 8, 12, null, 'Rucksack 3 kg', null, 60, true, 'Langsam runter, zügig hoch.', '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000002'),
  ('22222222-2222-4222-8222-000000000001', 'aeaeaeae-aeae-4eae-8eae-000000000001', 2, 'acacacac-acac-4cac-8cac-000000000005', 2, null, null, 30, null, null, 45, false, null, '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000002'),
  ('22222222-2222-4222-8222-000000000001', 'aeaeaeae-aeae-4eae-8eae-000000000001', 3, 'acacacac-acac-4cac-8cac-000000000007', 3, 12, 15, null, null, null, 30, false, null, '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000002'),
  ('22222222-2222-4222-8222-000000000001', 'aeaeaeae-aeae-4eae-8eae-000000000002', 1, 'acacacac-acac-4cac-8cac-000000000009', 3, 10, 15, null, 'Theraband gelb', '2 s ziehen, 2 s zurück', 60, true, null, '11111111-1111-4111-8111-000000000007', '11111111-1111-4111-8111-000000000007'),
  ('22222222-2222-4222-8222-000000000001', 'aeaeaeae-aeae-4eae-8eae-000000000002', 2, 'acacacac-acac-4cac-8cac-000000000011', 3, 8, 8, null, null, null, 90, false, 'Vorderes Knie bleibt über dem Fuß.', '11111111-1111-4111-8111-000000000007', '11111111-1111-4111-8111-000000000007');

update public.exercise_plan_items i
   set exercise_name = e.name, exercise_lay_name = e.lay_name, variant_name = v.name,
       variant_lay_name = v.lay_name, body_region = e.body_region, instruction = v.instruction,
       equipment = v.equipment
  from public.exercise_variants v
  join public.exercises e on e.id = v.exercise_id
 where v.id = i.variant_id
   and i.plan_id in ('aeaeaeae-aeae-4eae-8eae-000000000001', 'aeaeaeae-aeae-4eae-8eae-000000000002');

update public.exercise_plans
   set status = 'assigned', assigned_at = now() - interval '37 days', assigned_by = created_by,
       runs_from = current_date - 37, runs_until = current_date + 5, original_runs_until = current_date + 5
 where id = 'aeaeaeae-aeae-4eae-8eae-000000000001';

update public.exercise_plans
   set status = 'assigned', assigned_at = now() - interval '14 days', assigned_by = created_by,
       runs_from = current_date - 14, runs_until = current_date + 28, original_runs_until = current_date + 28
 where id = 'aeaeaeae-aeae-4eae-8eae-000000000002';

-- -----------------------------------------------------------------------------
-- Arbeitszeiten (CAL-005)
--
-- Ein alltagsnaher Wochenplan fuer die drei behandelnden Personen: Montag bis
-- Freitag, vormittags und nachmittags, mit Mittagspause. Olivia Office
-- behandelt nicht und bekommt deshalb keinen Plan.
--
-- Zeiten sind Ortszeiten der Praxis (Europe/Berlin), keine UTC-Zeitstempel.
-- Datumsbezogene Abweichungen stehen bewusst nicht im Seed: sie brauchen ein
-- konkretes Datum und waeren nach kurzer Zeit Vergangenheit.
-- -----------------------------------------------------------------------------
insert into public.staff_working_hours (organization_id, staff_member_id, weekday, starts_at, ends_at)
select
  '22222222-2222-4222-8222-000000000001',
  mitarbeitende.id,
  wochentag,
  block.von,
  block.bis
from (values
  ('55555555-5555-4555-8555-000000000001'::uuid),
  ('55555555-5555-4555-8555-000000000002'::uuid),
  ('55555555-5555-4555-8555-000000000004'::uuid)
) as mitarbeitende (id)
cross join generate_series(1, 5) as wochentag
cross join (values
  (time '08:00', time '12:00'),
  (time '13:00', time '18:00')
) as block (von, bis);

-- -----------------------------------------------------------------------------
-- Training im gemeinsamen Kalender (TRN-EPIC-002)
--
-- Tom Trainingsbetreuung bekommt einen Wochenplan, Tina einen Kontakt mit
-- Anschrift (fuer den Hausbesuch im Training, ANN-177), eine Vereinbarung ueber
-- zehn Einheiten und zwei Trainingstermine: heute in der Praxis an der
-- Vereinbarung, morgen als Einzelstunde ueber Video ohne Vereinbarung
-- (ADR-022 Punkt 5). Tom sieht im Kalender genau diese beiden; die
-- Behandlungstermine oben sieht er nicht (Punkt 11).
-- -----------------------------------------------------------------------------
insert into public.staff_working_hours (organization_id, staff_member_id, weekday, starts_at, ends_at)
select '22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000006', wochentag, time '09:00', time '19:00'
from generate_series(1, 6) as wochentag;

insert into public.training_contact_details
  (training_relationship_id, organization_id, email, phone, street, house_number, postal_code, city) values
  ('eeeeeeee-eeee-4eee-8eee-000000000001', '22222222-2222-4222-8222-000000000001',
   'tina.training@kunde.invalid', '+49 7071 0000109', 'Trainingsweg', '5', '72076', 'Tuebingen');

insert into public.training_bases
  (id, organization_id, training_relationship_id, status, started_on, agreed_quantity) values
  ('ffffffff-ffff-4fff-8fff-000000000001', '22222222-2222-4222-8222-000000000001',
   'eeeeeeee-eeee-4eee-8eee-000000000001', 'active', '2026-09-01', 10);

insert into public.appointments (
  id, organization_id, training_relationship_id, training_basis_id, staff_member_id, location_id,
  appointment_type, kind, status, starts_at, ends_at
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000007', '22222222-2222-4222-8222-000000000001',
   'eeeeeeee-eeee-4eee-8eee-000000000001', 'ffffffff-ffff-4fff-8fff-000000000001',
   '55555555-5555-4555-8555-000000000006', '33333333-3333-4333-8333-000000000001',
   'practice', 'training', 'confirmed',
   (current_date + time '10:00') at time zone 'Europe/Berlin', (current_date + time '11:00') at time zone 'Europe/Berlin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000008', '22222222-2222-4222-8222-000000000001',
   'eeeeeeee-eeee-4eee-8eee-000000000001', null,
   '55555555-5555-4555-8555-000000000006', null,
   'video', 'training', 'confirmed',
   (current_date + 1 + time '17:00') at time zone 'Europe/Berlin', (current_date + 1 + time '18:00') at time zone 'Europe/Berlin');

-- -----------------------------------------------------------------------------
-- TRN-007: Eine durchgefuehrte Trainingsstunde, vorgestern (ANN-181)
--
-- Abschliessen am Trainingstermin kommt in der Oberflaeche erst mit
-- TRN-EPIC-004. Damit die Sichtung eine Trainingsleistung erfassen und als
-- Rechnung im Kreis TR ausstellen kann, steht eine Stunde schon als
-- durchgefuehrt hier - von Tom abgeschlossen, an Tinas Vereinbarung.
-- -----------------------------------------------------------------------------
insert into public.appointments (
  id, organization_id, training_relationship_id, training_basis_id, staff_member_id, location_id,
  appointment_type, kind, status, starts_at, ends_at, completed_at, completed_by
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000009', '22222222-2222-4222-8222-000000000001',
   'eeeeeeee-eeee-4eee-8eee-000000000001', 'ffffffff-ffff-4fff-8fff-000000000001',
   '55555555-5555-4555-8555-000000000006', '33333333-3333-4333-8333-000000000001',
   'practice', 'training', 'completed',
   (current_date - 2 + time '10:00') at time zone 'Europe/Berlin', (current_date - 2 + time '11:00') at time zone 'Europe/Berlin',
   (current_date - 2 + time '11:00') at time zone 'Europe/Berlin', '11111111-1111-4111-8111-000000000007');

-- -----------------------------------------------------------------------------
-- POR-EPIC-001: Plattformzugaenge (ADR-023)
--
-- Tina hat einen Zugang zu ihrem Training. Erika hat ein Konto mit zwei
-- Zugaengen - Behandlung und Training -, damit der Bereichsschalter (DSN-001
-- D6) etwas zu schalten hat. Direkt eingetragen statt ueber die Einladung:
-- Der Seed ist der Stand nach dem Einloesen, nicht der Weg dorthin.
-- -----------------------------------------------------------------------------
insert into public.platform_accesses
  (id, organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
   account_user_id, status, created_by, activated_at) values
  ('cafecafe-cafe-4afe-8afe-000000000001', '22222222-2222-4222-8222-000000000001',
   'training', 'eeeeeeee-eeee-4eee-8eee-000000000001', null, 'eeeeeeee-eeee-4eee-8eee-000000000001',
   '11111111-1111-4111-8111-000000000008', 'active', '11111111-1111-4111-8111-000000000003', now()),
  ('cafecafe-cafe-4afe-8afe-000000000002', '22222222-2222-4222-8222-000000000001',
   'treatment', '66666666-6666-4666-8666-000000000002', '66666666-6666-4666-8666-000000000002', null,
   '11111111-1111-4111-8111-000000000009', 'active', '11111111-1111-4111-8111-000000000003', now()),
  ('cafecafe-cafe-4afe-8afe-000000000003', '22222222-2222-4222-8222-000000000001',
   'training', 'eeeeeeee-eeee-4eee-8eee-000000000002', null, 'eeeeeeee-eeee-4eee-8eee-000000000002',
   '11111111-1111-4111-8111-000000000009', 'active', '11111111-1111-4111-8111-000000000003', now());

-- POR-EPIC-001b: Paula Mustermann begleitet Max (Begleitung, ADR-023 Punkt 13).
-- Nachweis: Ausweis gesehen, Einwilligung von Max auf dem Praxisgeraet
-- bestaetigt, beides durch Olivia (Buero). Gespeichert ist kein Dokument
-- (ANN-205), der Wortlaut steht in src/lib/vertretung.ts (ANN-206).
insert into public.platform_accesses
  (id, organization_id, relationship_kind, relationship_id, patient_id,
   account_user_id, status, created_by, activated_at, access_kind, representative_name,
   proof_documents, proof_recorded_by, proof_recorded_at,
   consent_text_version, consent_recorded_by, consent_recorded_at, consent_earlier_messages,
   finance_scope) values
  ('cafecafe-cafe-4afe-8afe-000000000004', '22222222-2222-4222-8222-000000000001',
   'treatment', '66666666-6666-4666-8666-000000000001', '66666666-6666-4666-8666-000000000001',
   '11111111-1111-4111-8111-000000000010', 'active', '11111111-1111-4111-8111-000000000003', now(),
   'companion', 'Paula Mustermann',
   array['identity_document'], '11111111-1111-4111-8111-000000000003', now(),
   'begleitung-2026-10-02b', '11111111-1111-4111-8111-000000000003', now(), false,
   -- ABN-010: Rechnungen nur mit ausdruecklicher Einwilligung; Max hat sie nicht gegeben.
   false);

-- POR-019: Tina und Paula haben den Einstieg hinter sich; Erika sieht ihn bei
-- der naechsten Anmeldung (Sichtung Plattform).
update public.platform_accesses
   set onboarding_finished_at = now()
 where id in ('cafecafe-cafe-4afe-8afe-000000000001', 'cafecafe-cafe-4afe-8afe-000000000004');

-- -----------------------------------------------------------------------------
-- KOM-EPIC-001: Rueckfragen ueber die Plattform (Sichtung Plattform und
-- Kommunikation). Erika fragt zu Beschwerden (offen, ueberfaellig) und zu einem
-- Termin (beantwortet vom Buero); Paula fragt fuer Max (offen); Tina fragt im
-- Training nach ihrer Rechnung (offen). Antwortfrist zwei Werktage (ANN-309).
-- -----------------------------------------------------------------------------
insert into public.platform_messages
  (id, organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
   topic, status, due_on, created_by_access_id, created_by, created_at, last_entry_at) values
  ('d1d1d1d1-d1d1-4d1d-8d1d-000000000001', '22222222-2222-4222-8222-000000000001',
   'treatment', '66666666-6666-4666-8666-000000000002', '66666666-6666-4666-8666-000000000002', null,
   'complaint', 'open', app.add_workdays(current_date - 5, 2),
   'cafecafe-cafe-4afe-8afe-000000000002', '11111111-1111-4111-8111-000000000009',
   now() - interval '5 days', now() - interval '5 days'),
  ('d1d1d1d1-d1d1-4d1d-8d1d-000000000002', '22222222-2222-4222-8222-000000000001',
   'treatment', '66666666-6666-4666-8666-000000000002', '66666666-6666-4666-8666-000000000002', null,
   'organisational', 'answered', null,
   'cafecafe-cafe-4afe-8afe-000000000002', '11111111-1111-4111-8111-000000000009',
   now() - interval '2 days', now() - interval '1 day'),
  ('d1d1d1d1-d1d1-4d1d-8d1d-000000000003', '22222222-2222-4222-8222-000000000001',
   'treatment', '66666666-6666-4666-8666-000000000001', '66666666-6666-4666-8666-000000000001', null,
   'other', 'open', app.add_workdays(current_date, 2),
   -- Nicht vor der Einwilligung der Begleitung (consent_recorded_at = now()),
   -- sonst saehe Paula ihre eigene Frage nicht (ADR-023 Punkt 13).
   'cafecafe-cafe-4afe-8afe-000000000004', '11111111-1111-4111-8111-000000000010',
   now(), now()),
  ('d1d1d1d1-d1d1-4d1d-8d1d-000000000004', '22222222-2222-4222-8222-000000000001',
   'training', 'eeeeeeee-eeee-4eee-8eee-000000000001', null, 'eeeeeeee-eeee-4eee-8eee-000000000001',
   'organisational', 'open', app.add_workdays(current_date - 1, 2),
   'cafecafe-cafe-4afe-8afe-000000000001', '11111111-1111-4111-8111-000000000008',
   now() - interval '1 day', now() - interval '1 day');

insert into public.platform_message_entries
  (organization_id, message_id, side, body, access_id, author_kind, author_label, created_by,
   created_at) values
  ('22222222-2222-4222-8222-000000000001', 'd1d1d1d1-d1d1-4d1d-8d1d-000000000001', 'person',
   'Seit dem letzten Termin zieht es im rechten Knie, wenn ich Treppen gehe. Soll ich die Kniebeugen trotzdem machen?',
   'cafecafe-cafe-4afe-8afe-000000000002', 'self', null, '11111111-1111-4111-8111-000000000009',
   now() - interval '5 days'),
  ('22222222-2222-4222-8222-000000000001', 'd1d1d1d1-d1d1-4d1d-8d1d-000000000002', 'person',
   'Kann ich den Termin am Freitag auf den Nachmittag legen?',
   'cafecafe-cafe-4afe-8afe-000000000002', 'self', null, '11111111-1111-4111-8111-000000000009',
   now() - interval '2 days'),
  ('22222222-2222-4222-8222-000000000001', 'd1d1d1d1-d1d1-4d1d-8d1d-000000000002', 'practice',
   'Ja, Freitag um 15 Uhr geht. Wir haben den Termin verschoben.',
   null, 'staff', 'Olivia Office', '11111111-1111-4111-8111-000000000003',
   now() - interval '1 day'),
  ('22222222-2222-4222-8222-000000000001', 'd1d1d1d1-d1d1-4d1d-8d1d-000000000003', 'person',
   'Mein Vater fragt, ob er zum naechsten Termin die Gehhilfe bereitlegen soll.',
   'cafecafe-cafe-4afe-8afe-000000000004', 'companion', 'Paula Mustermann',
   '11111111-1111-4111-8111-000000000010', now()),
  ('22222222-2222-4222-8222-000000000001', 'd1d1d1d1-d1d1-4d1d-8d1d-000000000004', 'person',
   'Auf meiner letzten Rechnung steht das Paket zweimal. Ist das richtig?',
   'cafecafe-cafe-4afe-8afe-000000000001', 'self', null, '11111111-1111-4111-8111-000000000008',
   now() - interval '1 day');
