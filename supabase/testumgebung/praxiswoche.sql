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
    -- Versions- und Variantenbits wie bei einer RFC-4122-UUID der Version 4:
    -- Ein reiner md5-Wert ist keine gueltige UUID, und die Plattform verwirft
    -- dann die ganze Terminliste (zod, src/features/platform/api.ts).
    overlay(overlay(md5('praxiswoche-' || woche.tag || '-' || plan.nummer)
      placing '4' from 13) placing '8' from 17)::uuid as id,
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

-- -----------------------------------------------------------------------------
-- TEAM-001: der Teamchat mit ein paar Absprachen - synthetisch, ohne
-- Patientenbezug. Feste Kennungen, damit die Bildstrecke die Gespräche öffnen
-- kann (scripts/bildstrecke/routen.mjs).
-- -----------------------------------------------------------------------------
-- Kanäle legt die Praxis selbst an (ANN-611); für die Testumgebung zwei als
-- Beispiel. Das Gespräch der Radflotte entsteht mit der Praxis und bekommt
-- hier nur eine feste Kennung.
update public.team_channels
set id = '7e7e7e7e-7e7e-4e7e-8e7e-000000000002'
where organization_id = '22222222-2222-4222-8222-000000000001' and kind = 'fleet'
  and not exists (select 1 from public.team_messages m where m.channel_id = team_channels.id);

insert into public.team_channels (id, organization_id, kind, name, description)
values
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000001', '22222222-2222-4222-8222-000000000001', 'channel',
   'Allgemein', 'Organisatorisches für das ganze Team.'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000003', '22222222-2222-4222-8222-000000000001', 'channel',
   'Vertretungen', 'Kurzfristige Einsatzänderungen.')
on conflict do nothing;

insert into public.team_channels (id, organization_id, kind, created_at)
values ('7e7e7e7e-7e7e-4e7e-8e7e-000000000004', '22222222-2222-4222-8222-000000000001', 'direct',
        now() - interval '3 days')
on conflict (id) do nothing;

insert into public.team_channel_members (organization_id, channel_id, staff_member_id)
values
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000004',
   '55555555-5555-4555-8555-000000000001'),
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000004',
   '55555555-5555-4555-8555-000000000002')
on conflict do nothing;

insert into public.team_messages
  (id, organization_id, channel_id, parent_id, author_staff_member_id, body, created_at)
values
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000101', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000001', null, '55555555-5555-4555-8555-000000000001',
   'Die Belege für den Monat bitte bis Freitag einreichen.', now() - interval '2 days 3 hours'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000102', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000001', null, '55555555-5555-4555-8555-000000000003',
   '@Tim Teamleitung die neuen Druckerpatronen sind da, sie liegen im Büro.', now() - interval '50 minutes'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000103', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000101',
   '55555555-5555-4555-8555-000000000003',
   'Die Tankbelege von der Tour am Dienstag reiche ich morgen nach.', now() - interval '2 days 1 hour'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000201', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000002', null, '55555555-5555-4555-8555-000000000002',
   'Lastenrad 3 hat unterwegs die Kette verloren. Panne ist gemeldet, das Rad steht im Depot Süd.',
   now() - interval '1 day 2 hours'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000202', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000002', '7e7e7e7e-7e7e-4e7e-8e7e-000000000201',
   '55555555-5555-4555-8555-000000000004',
   '@Anna Beispiel danke. Ich schaue morgen früh drauf, nimm bis dahin Rad 2.',
   now() - interval '1 day 1 hour'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000203', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000002', null, '55555555-5555-4555-8555-000000000003',
   'Wer hat den Schlüssel für Depot Nord? Er hängt nicht am Brett.', now() - interval '35 minutes'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000301', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000003', null, '55555555-5555-4555-8555-000000000004',
   'Für den Nachmittag suche ich eine Vertretung für zwei Hausbesuche in der Weststadt.',
   now() - interval '25 minutes'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000401', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000004', null, '55555555-5555-4555-8555-000000000002',
   'Kannst du heute Nachmittag kurz telefonieren? Es geht um meinen Wochenplan.',
   now() - interval '15 minutes')
on conflict (id) do nothing;

insert into public.team_message_mentions (organization_id, message_id, staff_member_id)
values
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000102',
   '55555555-5555-4555-8555-000000000004'),
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000202',
   '55555555-5555-4555-8555-000000000002')
on conflict do nothing;

-- TEAM-002: ein privater Kanal der Leitung (Jannes, Tim), eine Gruppe
-- (Anna, Olivia, Tom), eine Antwort auch im Gespräch, Reaktionen, eine
-- angeheftete Nachricht, Gemerktes mit fälliger Erinnerung und eine geplante
-- Nachricht - synthetisch, ohne Patientenbezug.
insert into public.team_channels (id, organization_id, kind, name, description, created_at)
values ('7e7e7e7e-7e7e-4e7e-8e7e-000000000005', '22222222-2222-4222-8222-000000000001', 'private',
        'Leitung', 'Dienstpläne und Personalfragen.', now() - interval '5 days')
on conflict do nothing;
insert into public.team_channels (id, organization_id, kind, created_at)
values ('7e7e7e7e-7e7e-4e7e-8e7e-000000000006', '22222222-2222-4222-8222-000000000001', 'group',
        now() - interval '2 days')
on conflict (id) do nothing;

insert into public.team_channel_members (organization_id, channel_id, staff_member_id)
values
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000005',
   '55555555-5555-4555-8555-000000000001'),
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000005',
   '55555555-5555-4555-8555-000000000004'),
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000006',
   '55555555-5555-4555-8555-000000000002'),
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000006',
   '55555555-5555-4555-8555-000000000003'),
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000006',
   '55555555-5555-4555-8555-000000000006')
on conflict do nothing;

insert into public.team_messages
  (id, organization_id, channel_id, parent_id, author_staff_member_id, body, also_in_channel, created_at)
values
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000501', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000005', null, '55555555-5555-4555-8555-000000000001',
   'Dienstplan Dezember: Bitte bis Mittwoch die *Urlaubswünsche* sammeln.', false,
   now() - interval '1 day 4 hours'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000502', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000005', null, '55555555-5555-4555-8555-000000000004',
   'Mache ich. Zwei Wünsche liegen schon vor.', false, now() - interval '1 day 3 hours'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000601', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000006', null, '55555555-5555-4555-8555-000000000003',
   'Wer übernimmt am Samstag den Infostand beim Stadtteilfest?', false,
   now() - interval '3 hours'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000602', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000006', '7e7e7e7e-7e7e-4e7e-8e7e-000000000601',
   '55555555-5555-4555-8555-000000000006', 'Ich kann von 10 bis 13 Uhr.', false,
   now() - interval '2 hours'),
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000204', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000002', '7e7e7e7e-7e7e-4e7e-8e7e-000000000201',
   '55555555-5555-4555-8555-000000000003',
   'Den Ersatzschlüssel für Rad 2 habe ich ans Brett gehängt.', true,
   now() - interval '20 hours'),
  -- Geplant für morgen früh - bis dahin sieht sie nur Jannes unter „Geplant“.
  ('7e7e7e7e-7e7e-4e7e-8e7e-000000000104', '22222222-2222-4222-8222-000000000001',
   '7e7e7e7e-7e7e-4e7e-8e7e-000000000001', null, '55555555-5555-4555-8555-000000000001',
   'Teamtreffen am Montag um 8 Uhr im Büro.', false, now() + interval '1 day')
on conflict (id) do nothing;

insert into public.team_message_reactions (organization_id, message_id, staff_member_id, reaction)
values
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000101',
   '55555555-5555-4555-8555-000000000002', 'daumen'),
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000101',
   '55555555-5555-4555-8555-000000000003', 'daumen'),
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000101',
   '55555555-5555-4555-8555-000000000004', 'erledigt'),
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000201',
   '55555555-5555-4555-8555-000000000004', 'augen')
on conflict do nothing;

insert into public.team_message_pins (organization_id, channel_id, message_id)
values ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000001',
        '7e7e7e7e-7e7e-4e7e-8e7e-000000000101')
on conflict do nothing;

-- Anna merkt sich die Belege (Erinnerung morgen) und den Schlüssel (fällig).
insert into public.team_saved_messages (organization_id, message_id, staff_member_id, remind_at)
values
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000101',
   '55555555-5555-4555-8555-000000000002', now() + interval '1 day'),
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000203',
   '55555555-5555-4555-8555-000000000002', now() - interval '10 minutes')
on conflict do nothing;

-- Anna hat Allgemein als Favorit, Tom stellt Vertretungen stumm.
insert into public.team_channel_settings (organization_id, channel_id, staff_member_id, notify, starred)
values
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000001',
   '55555555-5555-4555-8555-000000000002', 'all', true),
  ('22222222-2222-4222-8222-000000000001', '7e7e7e7e-7e7e-4e7e-8e7e-000000000003',
   '55555555-5555-4555-8555-000000000006', 'none', false)
on conflict (channel_id, staff_member_id) do nothing;

-- Den eigenen Stand für das, was man selbst geschrieben hat - wie nach dem
-- Senden in der Anwendung.
insert into public.team_read_states (organization_id, channel_id, staff_member_id, read_up_to)
select m.organization_id, m.channel_id, m.author_staff_member_id, max(m.created_at)
from public.team_messages m
where m.organization_id = '22222222-2222-4222-8222-000000000001' and m.created_at <= now()
group by m.organization_id, m.channel_id, m.author_staff_member_id
on conflict (channel_id, staff_member_id) do nothing;

-- Wer einen Thread begonnen, beantwortet hat oder darin erwähnt ist, folgt
-- ihm (ANN-640) - gelesen bis zum eigenen Beitrag.
insert into public.team_thread_states
  (organization_id, root_message_id, staff_member_id, following, read_up_to)
select r.organization_id, r.id, x.staff, true, max(x.zeit)
from public.team_messages r
join lateral (
  select r.author_staff_member_id as staff, r.created_at as zeit
  union all
  select a.author_staff_member_id, a.created_at
  from public.team_messages a where a.parent_id = r.id
  union all
  select mm.staff_member_id, r.created_at
  from public.team_message_mentions mm
  join public.team_messages b on b.id = mm.message_id
  where b.id = r.id or b.parent_id = r.id
) x on x.staff is not null
where r.organization_id = '22222222-2222-4222-8222-000000000001' and r.parent_id is null
  and r.created_at <= now()
  and exists (select 1 from public.team_messages a where a.parent_id = r.id)
group by r.organization_id, r.id, x.staff
on conflict (root_message_id, staff_member_id) do nothing;
