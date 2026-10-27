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
    -- dann die ganze Terminliste (zod, src/features/portal/platform/api.ts).
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

-- TEAM-007: zwei synthetische Profilbilder - ein Rad und ein Blatt, keine
-- Personen (ADR-017 Punkt 95) - für Olivia und Tim; die übrigen zeigen ihre
-- Initialen auf ihrer Farbe (TEAM-006). Beide bestehen die Prüfung am Inhalt
-- (256 × 256, JPEG ohne APPn-Segmente).
insert into public.staff_profile_pictures (organization_id, staff_member_id, image)
values
  ('22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000004',
   decode('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', 'base64')),
  ('22222222-2222-4222-8222-000000000001', '55555555-5555-4555-8555-000000000003',
   decode('/9j/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAEAAQADASIAAhEBAxEB/8QAHAABAAIDAQEBAAAAAAAAAAAAAAQGAwUHAggB/8QAQxAAAQMDAgQDAwgFCwUAAAAAAQACAwQFESExBhJBUQcTYRQicTJCgZGxwdHwFRcjM1IWJFRlk6Gk0uHi8TZTdLKz/8QAGQEBAAMBAQAAAAAAAAAAAAAAAAIDBAEF/8QAJBEBAAICAgICAgMBAAAAAAAAAAECAxEhMQQSIlFBQhMyYXH/2gAMAwEAAhEDEQA/APpFERYmgREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBFhq62loIxLV1MNPGTyh0rwwE9snroVoa3xD4do2yctY6okjPL5cMbiXHONCcNI65z8FGbRHcozaI7lZEVIqPFi1thcaahrZJdOVsnKxp16kE409FC/W7/Uv+K/2KE5qfaE5qfboiLnf63f6l/xX+xSqTxZtz4yau31cMmdGxFsgx3yS3XfTCfzU+yM1PtekVXpPErh2ojL5aialcDjklhcSR393mGPp6LZ10Vn4utVbazU01XTzxmOXyZGSGPOzhuA4EZBI3GeinF4nqU4vE9Sk2m9W6+0zqm2VsNZCyR0TnxOyA9pwR947ggjIIKmLgvBt3rvCjjifh28vmFrqpORr3lrI9XAMqRkkBpAw7DtBnOSzC70kTtzHf2jnsREUkxERAREQEREBERAREQEREBERAREQEWm4j4rt/DcJ9of5lS5hdFTt+U/XGp+aM9T2OM4wuV8Q8YXTiGSRsszoaQn3aaM4aBpgO/iOgOT12xsqr5Yr/1VkzVpx+XQr54jWi1ZjpXfpGcfNhd+zG279RsTtnUYOFRbn4hX+5NLBUtpIyAC2lbyEkHO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WNbrFGehGRkuG+TtnbIBVpoLdSWunFNRU8dPEPmsGMnAGSepwBqdVIWrHgivMtePBFeZERFevEREBERAREQEREBERAREQFDu1lt19pm01zooayFkjZWslbkB7TkH7j3BIOQSFMRAREQEREGqr+FLHc8mptlM5zn+Y57G+W9ztckubgnfqVX63wqtMzZDSVdXTyOOWBxD2MGdsYBIxp8r61dUUJx1nuEJx1nuHNqjwjnbC4012jkl05WyQljTr1IJxp6KH+qm9/0q3f2j/wDIuqooTgohOCjlX6qb3/Srd/aP/wAilUnhJVPjJq7pDDJnRsURkGO+SW676YXS0T+ChHj0UWk8JrcyMiruFXNJnR0QbGMdsEO131yrDR8GcPUPP5Vqpnc+M+cDLt258436LcopxjrHUJxjrHUCIimmIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiD//Z', 'base64'))
on conflict (staff_member_id) do nothing;

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
