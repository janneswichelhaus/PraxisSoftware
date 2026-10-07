-- =============================================================================
-- Zusaetzliche Testpatient:innen fuer die Test-Umgebung (AKTE-009)
--
-- Laeuft NACH supabase/seed.sql und VOR praxiswoche.sql, nur beim Neu-Aufsetzen
-- der Test-Umgebung (neu-aufsetzen.psql). Der lokale Seed bleibt unveraendert:
-- Die Tests zaehlen auf seine drei Patient:innen.
--
-- Rein synthetisch (PROJECT_PRINCIPLES.md 3.1): erfundene Namen, Strassen,
-- Rufnummern und Koordinaten im Stadtgebiet von Tuebingen ohne Bezug zu einem
-- echten Ort; Diagnosen sind als "Synthetisch:" gekennzeichnet.
--
-- Zwoelf Personen, bewusst verschieden, damit die Oberflaeche an den Faellen
-- geprueft werden kann, die im Alltag vorkommen: lange Namen, minderjaehrig,
-- Einrichtung, ohne Telefon, nur E-Mail, mit und ohne Grundlage, Verordnung
-- und Selbstzahler, Anmeldebogen da oder offen, Liege, Etage, lange Hinweise,
-- eine nicht mehr laufende Versorgung.
--
-- Kennungen: ...-0000000001NN, damit sie sich mit keiner festen Kennung des
-- Seeds und der Tests ueberschneiden.
-- =============================================================================

insert into public.persons (id, organization_id, given_name, family_name) values
  ('44444444-4444-4444-8444-000000000104', '22222222-2222-4222-8222-000000000001', 'Annemarie',  'Langname-Mustergueltig'),
  ('44444444-4444-4444-8444-000000000105', '22222222-2222-4222-8222-000000000001', 'Ben',        'Beispielsohn'),
  ('44444444-4444-4444-8444-000000000106', '22222222-2222-4222-8222-000000000001', 'Clara',      'Testfall'),
  ('44444444-4444-4444-8444-000000000107', '22222222-2222-4222-8222-000000000001', 'Dieter',     'Dummy'),
  ('44444444-4444-4444-8444-000000000108', '22222222-2222-4222-8222-000000000001', 'Emma',       'Erfunden'),
  ('44444444-4444-4444-8444-000000000109', '22222222-2222-4222-8222-000000000001', 'Friedrich',  'Fiktiv'),
  ('44444444-4444-4444-8444-000000000110', '22222222-2222-4222-8222-000000000001', 'Greta',      'Gedacht'),
  ('44444444-4444-4444-8444-000000000111', '22222222-2222-4222-8222-000000000001', 'Hasan',      'Hypothetisch'),
  ('44444444-4444-4444-8444-000000000112', '22222222-2222-4222-8222-000000000001', 'Ida',        'Imaginaer'),
  ('44444444-4444-4444-8444-000000000113', '22222222-2222-4222-8222-000000000001', 'Jonas',      'Jedermann'),
  ('44444444-4444-4444-8444-000000000114', '22222222-2222-4222-8222-000000000001', 'Karin',      'Konstrukt'),
  ('44444444-4444-4444-8444-000000000115', '22222222-2222-4222-8222-000000000001', 'Lukas',      'Lorem')
on conflict (id) do nothing;

insert into public.patients (id, organization_id, person_id, status, care_started_on) values
  ('66666666-6666-4666-8666-000000000104', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000104', 'active',   current_date - 60),
  ('66666666-6666-4666-8666-000000000105', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000105', 'active',   current_date - 5),
  ('66666666-6666-4666-8666-000000000106', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000106', 'active',   current_date - 120),
  ('66666666-6666-4666-8666-000000000107', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000107', 'active',   current_date - 14),
  ('66666666-6666-4666-8666-000000000108', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000108', 'active',   current_date - 30),
  ('66666666-6666-4666-8666-000000000109', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000109', 'active',   current_date - 200),
  ('66666666-6666-4666-8666-000000000110', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000110', 'active',   current_date - 3),
  ('66666666-6666-4666-8666-000000000111', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000111', 'active',   current_date - 45),
  ('66666666-6666-4666-8666-000000000112', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000112', 'active',   current_date - 1),
  ('66666666-6666-4666-8666-000000000113', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000113', 'inactive', current_date - 400),
  ('66666666-6666-4666-8666-000000000114', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000114', 'active',   current_date - 90),
  ('66666666-6666-4666-8666-000000000115', '22222222-2222-4222-8222-000000000001', '44444444-4444-4444-8444-000000000115', 'active',   current_date - 21)
on conflict (id) do nothing;

-- Kontakt: Hausbesuche mit Koordinaten, Praxispatient:innen teils ohne.
insert into public.patient_contact_details (patient_id, organization_id, date_of_birth, email, phone, street, house_number, postal_code, city, phone_work, phone_mobile, institution, lat, lon, geocode_precision) values
  -- Sehr langer Name, Festnetz und Mobil, Hausbesuch.
  ('66666666-6666-4666-8666-000000000104', '22222222-2222-4222-8222-000000000001', '1941-03-14', null,                           '+49 7071 0000104', 'Musterallee',        '23a', '72072', 'Tuebingen', null,               '+49 160 0000104', null,                            48.5201, 9.0552, 'address'),
  -- Minderjaehrig, nur Mobil.
  ('66666666-6666-4666-8666-000000000105', '22222222-2222-4222-8222-000000000001', (current_date - interval '16 years 3 months')::date, null, null, 'Erfundenweg', '4', '72070', 'Tuebingen', null, '+49 160 0000105', null, null, null, null),
  -- Nur E-Mail, kein Telefon.
  ('66666666-6666-4666-8666-000000000106', '22222222-2222-4222-8222-000000000001', '1985-06-02', 'clara.testfall@patient.invalid', null,               'Platzhalterplatz',   '1',   '72076', 'Tuebingen', null,               null, null,                            null,    null,   null),
  -- Nur Festnetz, Hausbesuch im Erdgeschoss.
  ('66666666-6666-4666-8666-000000000107', '22222222-2222-4222-8222-000000000001', '1950-11-23', null,                           '+49 7071 0000107', 'Attrappenstrasse',   '15',  '72074', 'Tuebingen', null,               null, null,                            48.5342, 9.0612, 'address'),
  ('66666666-6666-4666-8666-000000000108', '22222222-2222-4222-8222-000000000001', '1992-01-30', 'emma.erfunden@patient.invalid',  null,               'Beispielring',       '8',   '72070', 'Tuebingen', '+49 7071 0000208', '+49 160 0000108', null,                            null,    null,   null),
  -- Einrichtung: Anmeldung an der Pforte.
  ('66666666-6666-4666-8666-000000000109', '22222222-2222-4222-8222-000000000001', '1938-08-08', null,                           '+49 7071 0000109', 'Am Fiktivstift',     '2',   '72072', 'Tuebingen', null,               null, 'Pflegeheim Am Fiktivstift', 48.5129, 9.0461, 'address'),
  ('66666666-6666-4666-8666-000000000110', '22222222-2222-4222-8222-000000000001', '1975-05-19', null,                           null,               'Gedankengasse',      '11',  '72074', 'Tuebingen', null,               '+49 160 0000110', null,                            null,    null,   null),
  ('66666666-6666-4666-8666-000000000111', '22222222-2222-4222-8222-000000000001', '1968-12-01', 'hasan.hypothetisch@patient.invalid', '+49 7071 0000111', 'Annahmeweg',     '37',  '72070', 'Tuebingen', null,               '+49 160 0000111', null,                            48.5268, 9.0410, 'address'),
  ('66666666-6666-4666-8666-000000000112', '22222222-2222-4222-8222-000000000001', '2001-07-07', 'ida.imaginaer@patient.invalid', null,               'Traumpfad',          '3',   '72076', 'Tuebingen', null,               '+49 160 0000112', null,                            null,    null,   null),
  ('66666666-6666-4666-8666-000000000113', '22222222-2222-4222-8222-000000000001', '1980-02-29', null,                           '+49 7071 0000113', 'Vergangenheitsweg',  '6',   '72072', 'Tuebingen', null,               null, null,                            null,    null,   null),
  -- Dachgeschoss ohne Aufzug.
  ('66666666-6666-4666-8666-000000000114', '22222222-2222-4222-8222-000000000001', '1959-10-10', null,                           '+49 7071 0000114', 'Konstruktionsstrasse', '42', '72076', 'Tuebingen', null,               '+49 160 0000114', null,                            48.5389, 9.0498, 'address'),
  ('66666666-6666-4666-8666-000000000115', '22222222-2222-4222-8222-000000000001', '1997-04-04', 'lukas.lorem@patient.invalid',  null,               'Ipsumweg',           '19',  '72070', 'Tuebingen', null,               '+49 160 0000115', null,                            null,    null,   null)
on conflict (patient_id) do nothing;

-- Versorgungsangaben: Etage vorn im Zugangshinweis (ANN-197), Liege, lange
-- Hinweise. Ohne klinische Inhalte.
insert into public.patient_care_details (patient_id, organization_id, primary_therapist_staff_member_id, home_visit_access_note, special_note, remark, treatment_table_required) values
  ('66666666-6666-4666-8666-000000000104', '22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000002', '3. OG rechts, Klingel "Langname". Aufzug haeufig defekt, dann Treppe.', 'Hoert schlecht, bitte laut und deutlich sprechen. Tochter ist oft dabei.', 'Termine moeglichst gegen Mittag.', true),
  ('66666666-6666-4666-8666-000000000105', '22222222-2222-4222-8222-000000000001', null,                                    null, 'Minderjaehrig: Termine nur mit Einverstaendnis der Eltern.', null, false),
  ('66666666-6666-4666-8666-000000000106', '22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000002', null, null, 'Bevorzugt Kontakt per E-Mail.', false),
  ('66666666-6666-4666-8666-000000000107', '22222222-2222-4222-8222-000000000001', null,                                    'EG, Klingel "Dummy". Hintereingang benutzen.', null, null, null),
  ('66666666-6666-4666-8666-000000000108', '22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000001', null, null, null, false),
  ('66666666-6666-4666-8666-000000000109', '22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000001', '1. OG, Anmeldung an der Pforte, Zimmer 112. Besuchszeiten 10-12 und 15-18 Uhr.', 'Rollstuhl, Transfer mit zwei Personen.', null, true),
  ('66666666-6666-4666-8666-000000000110', '22222222-2222-4222-8222-000000000001', null,                                    null, null, null, null),
  ('66666666-6666-4666-8666-000000000111', '22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000004', '1. OG links; Klingel "Hypothetisch"; Parken im Hof erlaubt.', E'Katze im Haushalt.\nSchuhe bitte ausziehen.\nTerminerinnerung per SMS gewuenscht.', 'Spricht Deutsch und Englisch.', false),
  ('66666666-6666-4666-8666-000000000112', '22222222-2222-4222-8222-000000000001', null,                                    null, null, null, false),
  ('66666666-6666-4666-8666-000000000113', '22222222-2222-4222-8222-000000000001', null,                                    null, null, null, false),
  ('66666666-6666-4666-8666-000000000114', '22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000004', 'Dachgeschoss, kein Aufzug, Klingel ganz oben.', null, null, true),
  ('66666666-6666-4666-8666-000000000115', '22222222-2222-4222-8222-000000000001', null,                                    null, null, null, false)
on conflict (patient_id) do nothing;

-- Behandlungsgrundlagen: Verordnung (Erst- und Folge-), Selbstzahler, beides;
-- Greta (110) und Ida (112) bewusst ohne Grundlage.
insert into public.treatment_bases (id, organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on, appointment_count, frequency_note, note, diagnosis, therapy_goal, prescriber_note, follow_up_recommendation) values
  ('88888888-8888-4888-8888-000000000104', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000104', '77777777-7777-4777-8777-000000000002', 'first',     current_date - 50, 10, '2x pro Woche', null, 'Synthetisch: Gangunsicherheit nach Krankenhausaufenthalt.', 'Sicher gehen in der Wohnung.', null, null),
  ('88888888-8888-4888-8888-000000000105', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000105', null,                                  'self_pay',  current_date - 5,   6, '1x pro Woche', 'Eltern zahlen selbst.', null, null, null, null),
  ('88888888-8888-4888-8888-000000000106', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000106', '77777777-7777-4777-8777-000000000001', 'first',     current_date - 110, 6, '1x pro Woche', null, 'Synthetisch: Beschwerden im unteren Ruecken.', null, null, null),
  ('88888888-8888-4888-8888-000000000116', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000106', '77777777-7777-4777-8777-000000000001', 'follow_up', current_date - 10, 6, '1x pro Woche', null, 'Synthetisch: Fortbestehende Beschwerden im unteren Ruecken.', 'Wieder laufen koennen.', null, null),
  ('88888888-8888-4888-8888-000000000107', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000107', '77777777-7777-4777-8777-000000000002', 'first',     current_date - 12, 10, '2x pro Woche', null, 'Synthetisch: Kraftminderung beider Beine.', null, null, null),
  ('88888888-8888-4888-8888-000000000108', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000108', null,                                  'self_pay',  current_date - 30,  8, '1x pro Woche', null, null, null, null, null),
  ('88888888-8888-4888-8888-000000000109', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000109', '77777777-7777-4777-8777-000000000002', 'follow_up', current_date - 20, 10, '2x pro Woche', 'Verordnung liegt im Heim.', 'Synthetisch: Kontrakturprophylaxe.', null, null, null),
  ('88888888-8888-4888-8888-000000000111', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000111', '77777777-7777-4777-8777-000000000001', 'first',     current_date - 40, 10, '2x pro Woche', null, 'Synthetisch: Bewegungseinschraenkung des linken Knies.', 'Treppensteigen ohne Hilfe.', null, null),
  ('88888888-8888-4888-8888-000000000113', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000113', '77777777-7777-4777-8777-000000000001', 'first',     current_date - 390, 6, '1x pro Woche', null, 'Synthetisch: Verspannung im Schulterguertel.', null, null, null),
  ('88888888-8888-4888-8888-000000000114', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000114', '77777777-7777-4777-8777-000000000002', 'first',     current_date - 80, 10, '1x pro Woche', null, 'Synthetisch: Schwindel beim Aufstehen.', null, null, null),
  ('88888888-8888-4888-8888-000000000115', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000115', '77777777-7777-4777-8777-000000000001', 'first',     current_date - 21,  6, '1x pro Woche', null, 'Synthetisch: Reizung der Achillessehne.', null, null, null),
  ('88888888-8888-4888-8888-000000000125', '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000115', null,                                  'self_pay',  current_date - 7,   5, 'nach Bedarf',  'Zusaetzlich auf eigene Rechnung.', null, null, null, null)
on conflict (id) do nothing;

insert into public.treatment_base_items (id, organization_id, treatment_basis_id, sort_order, remedy, prescribed_quantity, used_quantity) values
  ('99999999-9999-4999-8999-000000000104', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000104', 1, 'Krankengymnastik',  10, 0),
  ('99999999-9999-4999-8999-000000000106', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000106', 1, 'Krankengymnastik',   6, 0),
  ('99999999-9999-4999-8999-000000000116', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000116', 1, 'Krankengymnastik',   6, 0),
  ('99999999-9999-4999-8999-000000000107', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000107', 1, 'Krankengymnastik',  10, 0),
  ('99999999-9999-4999-8999-000000000109', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000109', 1, 'Krankengymnastik',  10, 0),
  ('99999999-9999-4999-8999-000000000119', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000109', 2, 'Waermetherapie',    10, 0),
  ('99999999-9999-4999-8999-000000000111', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000111', 1, 'Manuelle Therapie', 10, 0),
  ('99999999-9999-4999-8999-000000000113', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000113', 1, 'Krankengymnastik',   6, 0),
  ('99999999-9999-4999-8999-000000000114', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000114', 1, 'Krankengymnastik',  10, 0),
  ('99999999-9999-4999-8999-000000000115', '22222222-2222-4222-8222-000000000001', '88888888-8888-4888-8888-000000000115', 1, 'Krankengymnastik',   6, 0)
on conflict (id) do nothing;

-- Anmeldebogen (AKTE-007, ANN-224): bei sechs Personen vollstaendig, bei den
-- uebrigen offen - damit der Hinweis "! Anmeldebogen fehlt" zu sehen ist.
insert into public.patient_privacy_records (organization_id, patient_id, record_kind, occurred_on, notice_version)
select '22222222-2222-4222-8222-000000000001', p.id::uuid, k.art, current_date - 7,
       case when k.art = 'privacy_notice_handed_out' then '2026-09' end
from (values
  ('66666666-6666-4666-8666-000000000104'),
  ('66666666-6666-4666-8666-000000000106'),
  ('66666666-6666-4666-8666-000000000108'),
  ('66666666-6666-4666-8666-000000000109'),
  ('66666666-6666-4666-8666-000000000111'),
  ('66666666-6666-4666-8666-000000000115')
) as p (id)
cross join (values ('privacy_notice_handed_out'), ('treatment_contract_signed')) as k (art)
where not exists (
  select 1 from public.patient_privacy_records v
  where v.patient_id = p.id::uuid and v.record_kind = k.art
);

-- Honorarvereinbarung (ABR-030, ANN-231): Clara zahlt seit Beginn ihrer
-- Versorgung ein vereinbartes Terminhonorar statt des Tarifs - damit Akte,
-- Bestaetigung und Rechnung den Unterschied zeigen.
insert into public.patient_fee_agreements (organization_id, patient_id, valid_from, session_fee_cents, created_by)
select '22222222-2222-4222-8222-000000000001', '66666666-6666-4666-8666-000000000106',
       current_date - 120, 12000, '11111111-1111-4111-8111-000000000001'
where not exists (
  select 1 from public.patient_fee_agreements f
  where f.patient_id = '66666666-6666-4666-8666-000000000106'
);
