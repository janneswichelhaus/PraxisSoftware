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
delete from public.staff_working_hour_exceptions;
delete from public.staff_working_hours;
delete from public.appointments;
delete from public.prescription_items;
delete from public.prescriptions;
delete from public.prescribers;
delete from public.patient_care_details;
delete from public.patient_contact_details;
delete from public.staff_private_details;
delete from public.user_roles;
delete from public.user_profiles;
delete from public.patients;
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
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-000000000006', 'authenticated', 'authenticated', 'erika.beispiel@patient.invalid',  extensions.crypt('LokalerTestzugang!2026', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '');

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
  ('44444444-4444-4444-8444-000000000007', '22222222-2222-4222-8222-000000000001', 'Petra',  'Platzhalter');

-- -----------------------------------------------------------------------------
-- Mitarbeiter
-- -----------------------------------------------------------------------------
insert into public.staff_members (id, organization_id, person_id, primary_location_id, work_email, work_phone) values
  ('55555555-5555-4555-8555-000000000001', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000001', '33333333-3333-4333-8333-000000000001', 'jannes.test@praxis.invalid',     '+49 7071 0000101'),
  ('55555555-5555-4555-8555-000000000002', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000002', '33333333-3333-4333-8333-000000000001', 'anna.beispiel@praxis.invalid',   '+49 7071 0000102'),
  ('55555555-5555-4555-8555-000000000003', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000003', '33333333-3333-4333-8333-000000000001', 'olivia.office@praxis.invalid',   '+49 7071 0000103'),
  ('55555555-5555-4555-8555-000000000004', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000004', '33333333-3333-4333-8333-000000000001', 'tim.teamleitung@praxis.invalid', '+49 7071 0000104');

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
-- Verordnungen (VER-001, VER-002)
-- -----------------------------------------------------------------------------
-- Rein synthetisch. Die Diagnosen sind erfunden und stammen aus keinem realen
-- Fall (PROJECT_PRINCIPLES.md 3.1). Zwei Jahre, damit die Gruppierung nach Jahr
-- in der Akte sichtbar wird, und eine ausgeschoepfte Verordnung als Gegenprobe.
insert into public.prescriptions (id, organization_id, patient_id, prescriber_id, prescription_kind, issued_on, frequency_note, note, diagnosis, therapy_goal, prescriber_note, follow_up_recommendation) values
  ('88888888-8888-4888-8888-000000000001', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000001', '77777777-7777-4777-8777-000000000001', 'first',     '2026-02-05', '2x pro Woche', null,                          'Synthetisch: Bewegungseinschraenkung der rechten Schulter nach Sturz.', 'Schmerzfreie Beweglichkeit im Alltag.', 'Belastung langsam steigern.', null),
  ('88888888-8888-4888-8888-000000000002', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000001', '77777777-7777-4777-8777-000000000001', 'follow_up', '2026-06-18', '2x pro Woche', 'Rezept liegt im Ordner.',     'Synthetisch: Fortbestehende Bewegungseinschraenkung rechte Schulter.',  'Rueckkehr zur Gartenarbeit.',          null,                          'Synthetisch: Eine weitere Folgeverordnung waere aus meiner Sicht sinnvoll.'),
  ('88888888-8888-4888-8888-000000000003', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000002', '77777777-7777-4777-8777-000000000002', 'first',     '2025-11-12', '1x pro Woche', null,                          'Synthetisch: Verspannung der Nackenmuskulatur.',                        null,                                   null,                          null);

insert into public.prescription_items (id, organization_id, prescription_id, sort_order, remedy, prescribed_quantity, used_quantity) values
  ('99999999-9999-4999-8999-000000000001', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000001', 1, 'Krankengymnastik',        10, 10),
  ('99999999-9999-4999-8999-000000000002', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000001', 2, 'Waermetherapie',          10, 10),
  ('99999999-9999-4999-8999-000000000003', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000002', 1, 'Krankengymnastik',        10,  7),
  ('99999999-9999-4999-8999-000000000004', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000003', 1, 'Manuelle Therapie',        6,  2);

-- -----------------------------------------------------------------------------
-- Accountzuordnung
-- -----------------------------------------------------------------------------
insert into public.user_profiles (id, organization_id, person_id, display_name) values
  ('11111111-1111-4111-8111-000000000001', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000001', 'Jannes Test'),
  ('11111111-1111-4111-8111-000000000002', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000002', 'Anna Beispiel'),
  ('11111111-1111-4111-8111-000000000003', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000003', 'Olivia Office'),
  ('11111111-1111-4111-8111-000000000004', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000004', 'Tim Teamleitung'),
  ('11111111-1111-4111-8111-000000000005', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000005', 'Max Mustermann'),
  ('11111111-1111-4111-8111-000000000006', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000006', 'Erika Beispiel');

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
  ('11111111-1111-4111-8111-000000000006', '22222222-2222-4222-8222-000000000001', 'patient');

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
   'home_visit', 'scheduled', (current_date + time '09:00') at time zone 'Europe/Berlin', (current_date + time '10:00') at time zone 'Europe/Berlin',
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
   'practice', 'scheduled', (current_date + time '16:00') at time zone 'Europe/Berlin', (current_date + time '17:00') at time zone 'Europe/Berlin',
   null, null, null, null, null, null, null, null);

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
