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
delete from public.staff_working_hour_exceptions;
delete from public.staff_working_hours;
delete from public.appointment_notifications;
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
delete from public.patients;
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
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000007', 'authenticated', 'authenticated', 'tom.training@praxis.invalid',     extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '');

-- -----------------------------------------------------------------------------
-- Organisation und Standort
-- -----------------------------------------------------------------------------
-- time_zone ist verpflichtend und hat bewusst keinen Datenbank-Default:
-- jede Organisation legt ihre Zeitzone ausdruecklich fest (CAL-001).
insert into public.organizations (id, name, time_zone) values
  ('22222222-2222-4222-8222-000000000001', 'Test Praxis Tuebingen', 'Europe/Berlin');

insert into public.locations (id, organization_id, name) values
  ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-000000000001', 'Hauptstandort Tuebingen');

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
insert into public.patient_contact_details (patient_id, organization_id, date_of_birth, email, phone, street, house_number, postal_code, city, phone_work, phone_mobile, fax, institution) values
  ('66666666-6666-4666-8666-000000000001', '22222222-2222-4222-8222-000000000001', '1957-04-30', 'max.mustermann@patient.invalid', '+49 7071 0000005', 'Beispielstrasse', '12', '72070', 'Tuebingen', '+49 7071 0000205', '+49 160 0000005', null,               null),
  ('66666666-6666-4666-8666-000000000002', '22222222-2222-4222-8222-000000000001', '1963-09-17', 'erika.beispiel@patient.invalid', '+49 7071 0000006', 'Testweg',         '7',  '72072', 'Tuebingen', null,               '+49 160 0000006', null,               null),
  ('66666666-6666-4666-8666-000000000003', '22222222-2222-4222-8222-000000000001', '1971-12-05', null,                             '+49 7071 0000007', 'Fiktivgasse',     '9',  '72074', 'Tuebingen', null,               null,               '+49 7071 0000307', 'Seniorenresidenz Fiktiv');

-- Interne Versorgungsangaben (PAT-005). Sichtbar nur fuer die Rollen der
-- Patientenkartei, nicht fuer das Patientenkonto (ANN-010). Rein synthetisch
-- und ausdruecklich ohne klinische Inhalte.
insert into public.patient_care_details (patient_id, organization_id, primary_therapist_staff_member_id, home_visit_access_note, special_note, remark) values
  ('66666666-6666-4666-8666-000000000001', '22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000002', '2. OG links, Klingel "Mustermann". Aufzug vorhanden. Rad im Hinterhof abstellen.', 'Hund im Flur, wird vor dem Termin weggesperrt.', 'Bevorzugt Termine am Vormittag.'),
  ('66666666-6666-4666-8666-000000000002', '22222222-2222-4222-8222-000000000001', null,                                    'Erdgeschoss, Klingel "Beispiel". Schluessel bei Nachbarin Frau Fiktiv im 1. OG.', null,                                            null),
  ('66666666-6666-4666-8666-000000000003', '22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000004', 'Anmeldung an der Pforte, Zimmer 214.', null, null);

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
insert into public.service_catalog_versions (id, organization_id, label, valid_from) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001', '22222222-2222-4222-8222-000000000001', 'Preisliste 2026', '2026-01-01'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-000000000002', '22222222-2222-4222-8222-000000000001', 'Preisliste 2027 (Entwurf)', '2027-01-01');

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
  ('cccccccc-cccc-4ccc-8ccc-000000000011', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', 1, 'KG',    'Krankengymnastik',                    'treatment',   'Krankengymnastik',                        4800, 'exempt_healthcare',   0, 'therapy'),
  ('cccccccc-cccc-4ccc-8ccc-000000000012', '22222222-2222-4222-8222-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002', 2, 'AUS',   'Ausfallhonorar',                      'absence_fee', null,                                      4800, 'not_taxable',         0, 'therapy');

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
  ('11111111-1111-4111-8111-000000000005', '22222222-2222-4222-8222-000000000001', 'patient'),
  ('11111111-1111-4111-8111-000000000006', '22222222-2222-4222-8222-000000000001', 'patient'),
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
   'practice', 'event', 'Teambesprechung', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'confirmed',
   (current_date + time '08:00') at time zone 'Europe/Berlin', (current_date + time '08:25') at time zone 'Europe/Berlin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-000000000006', '22222222-2222-4222-8222-000000000001', null, '55555555-5555-4555-8555-000000000003', '33333333-3333-4333-8333-000000000001',
   'practice', 'event', 'Teambesprechung', 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', 'confirmed',
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
