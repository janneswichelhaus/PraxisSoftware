-- =============================================================================
-- Praxiswoche fuer die Test-Umgebung (OPS-002a)
--
-- Laeuft NACH supabase/seed.sql und nur dort, wo die Test-Umgebung neu
-- aufgesetzt wird (.github/workflows/test-umgebung.yml, Eingabe
-- "neu_aufsetzen"). Der lokale Seed bleibt unveraendert: Die Tests zaehlen auf
-- seine festen Zeilen.
--
-- Rein synthetisch (PROJECT_PRINCIPLES.md 3.1): dieselben erfundenen Personen
-- wie im Seed, keine klinischen Inhalte.
--
-- Die Woche sind die Werktage von vorgestern bis in vier Tagen - sieben
-- Kalendertage, fuenf Werktage, gleich an welchem Tag neu aufgesetzt wird.
-- Die Kalenderwoche waere am Freitag ganz Vergangenheit. Heute bleibt
-- ausgespart - den Tag belegt der Seed schon. Vergangene Tage sind
-- abgeschlossen, kommende bestaetigt. Die IDs sind aus Tag und Nummer
-- abgeleitet, damit ein zweiter Lauf dieselben Zeilen erzeugt.
-- =============================================================================

with woche as (
  select tag::date as tag
  from generate_series(current_date - 2, current_date + 4, interval '1 day') as tag
  where tag::date <> current_date
    and extract(isodow from tag) between 1 and 5
),
plan (nummer, patient_id, staff_member_id, user_id, location_id, appointment_type, von, bis) as (
  values
    -- Anna Beispiel: zwei Hausbesuche am Vormittag
    (1, '66666666-6666-4666-8666-000000000001'::uuid, '55555555-5555-4555-8555-000000000002'::uuid, '11111111-1111-4111-8111-000000000002'::uuid, null::uuid,                                   'home_visit', time '09:00', time '10:00'),
    (2, '66666666-6666-4666-8666-000000000002'::uuid, '55555555-5555-4555-8555-000000000002'::uuid, '11111111-1111-4111-8111-000000000002'::uuid, null::uuid,                                   'home_visit', time '10:30', time '11:30'),
    -- Jannes: ein Praxistermin am Nachmittag
    (3, '66666666-6666-4666-8666-000000000002'::uuid, '55555555-5555-4555-8555-000000000001'::uuid, '11111111-1111-4111-8111-000000000001'::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'practice',   time '14:00', time '15:00'),
    -- Tim Teamleitung: ein Praxistermin am spaeten Nachmittag
    (4, '66666666-6666-4666-8666-000000000001'::uuid, '55555555-5555-4555-8555-000000000004'::uuid, '11111111-1111-4111-8111-000000000004'::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'practice',   time '16:00', time '17:00'),
    -- AKTE-009: die zusaetzlichen Testpatient:innen aus testpatienten.sql,
    -- damit Kalender, Uebersicht und Tour einen vollen Tag zeigen. Je Person
    -- keine Ueberschneidung; Hausbesuche nur bei Personen mit Anschrift.
    -- Anna: Praxis frueh, Hausbesuche am Nachmittag, Praxis spaet
    (5,  '66666666-6666-4666-8666-000000000115'::uuid, '55555555-5555-4555-8555-000000000002'::uuid, '11111111-1111-4111-8111-000000000002'::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'practice',   time '08:00', time '08:45'),
    (6,  '66666666-6666-4666-8666-000000000104'::uuid, '55555555-5555-4555-8555-000000000002'::uuid, '11111111-1111-4111-8111-000000000002'::uuid, null::uuid,                                   'home_visit', time '13:00', time '14:00'),
    (7,  '66666666-6666-4666-8666-000000000107'::uuid, '55555555-5555-4555-8555-000000000002'::uuid, '11111111-1111-4111-8111-000000000002'::uuid, null::uuid,                                   'home_visit', time '15:00', time '16:00'),
    (8,  '66666666-6666-4666-8666-000000000106'::uuid, '55555555-5555-4555-8555-000000000002'::uuid, '11111111-1111-4111-8111-000000000002'::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'practice',   time '16:30', time '17:30'),
    -- Jannes: Praxis am Morgen, Hausbesuch im Heim, Praxis spaet
    (9,  '66666666-6666-4666-8666-000000000105'::uuid, '55555555-5555-4555-8555-000000000001'::uuid, '11111111-1111-4111-8111-000000000001'::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'practice',   time '09:00', time '09:45'),
    (10, '66666666-6666-4666-8666-000000000109'::uuid, '55555555-5555-4555-8555-000000000001'::uuid, '11111111-1111-4111-8111-000000000001'::uuid, null::uuid,                                   'home_visit', time '10:30', time '11:30'),
    (11, '66666666-6666-4666-8666-000000000108'::uuid, '55555555-5555-4555-8555-000000000001'::uuid, '11111111-1111-4111-8111-000000000001'::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'practice',   time '16:00', time '17:00'),
    -- Tim: zwei Hausbesuche am Vormittag, Praxis am Mittag
    (12, '66666666-6666-4666-8666-000000000111'::uuid, '55555555-5555-4555-8555-000000000004'::uuid, '11111111-1111-4111-8111-000000000004'::uuid, null::uuid,                                   'home_visit', time '09:00', time '10:00'),
    (13, '66666666-6666-4666-8666-000000000114'::uuid, '55555555-5555-4555-8555-000000000004'::uuid, '11111111-1111-4111-8111-000000000004'::uuid, null::uuid,                                   'home_visit', time '10:45', time '11:45'),
    (14, '66666666-6666-4666-8666-000000000110'::uuid, '55555555-5555-4555-8555-000000000004'::uuid, '11111111-1111-4111-8111-000000000004'::uuid, '33333333-3333-4333-8333-000000000001'::uuid, 'practice',   time '13:00', time '14:00')
),
termine as (
  select
    md5('praxiswoche-' || woche.tag || '-' || plan.nummer)::uuid as id,
    plan.*,
    (woche.tag + plan.von) at time zone 'Europe/Berlin' as starts_at,
    (woche.tag + plan.bis) at time zone 'Europe/Berlin' as ends_at,
    woche.tag < current_date as vergangen
  from woche cross join plan
)
insert into public.appointments (
  id, organization_id, patient_id, staff_member_id, location_id,
  appointment_type, status, starts_at, ends_at,
  visit_street, visit_house_number, visit_postal_code, visit_city,
  completed_at, completed_by
)
select
  termine.id,
  '22222222-2222-4222-8222-000000000001',
  termine.patient_id,
  termine.staff_member_id,
  termine.location_id,
  termine.appointment_type,
  case when termine.vergangen then 'completed' else 'confirmed' end,
  termine.starts_at,
  termine.ends_at,
  -- Adress-Snapshot nur fuer Hausbesuche (ANN-003), aus den Stammdaten.
  case when termine.appointment_type = 'home_visit' then kontakt.street end,
  case when termine.appointment_type = 'home_visit' then kontakt.house_number end,
  case when termine.appointment_type = 'home_visit' then kontakt.postal_code end,
  case when termine.appointment_type = 'home_visit' then kontakt.city end,
  case when termine.vergangen then termine.ends_at end,
  case when termine.vergangen then termine.user_id end
from termine
join public.patient_contact_details as kontakt on kontakt.patient_id = termine.patient_id
on conflict (id) do nothing;
