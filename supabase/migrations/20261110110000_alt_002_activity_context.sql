-- =============================================================================
-- ALT-002 (ALT-EPIC-001): Aktivitaet ausserhalb der Uebungen als Zusammenhang
--
-- IDEA-ALT-001: Ohne die Alltagsbelastung ist keine Trainingsreaktion
-- deutbar - wer am Samstag sechs Stunden Umzug gemacht hat, hat am Montag
-- nicht wegen des Plans Schmerzen. Erfasst wird grob und ohne
-- Genauigkeitsanspruch: Art, ungefaehre Dauer, ungefaehre Anstrengung der
-- groessten Belastung seit dem letzten Check-in (ANN-369).
--
--   app.tracking_parameters()   + activity_kind, activity_minutes,
--                                 activity_intensity (Zusammenhang)
--
-- Drei Angaben zum Zusammenhang wie Schmerzmittel und Seite (TRK-005,
-- ANN-355): dieselbe Tabelle, Pruefung, Frist und Einwilligung, freiwillig,
-- nicht unter den fuenf Fragen. Kein Ziel, keine Summe, keine Rangliste,
-- kein Vergleich mit anderen (IDEA-ALT-001, IDEA-ALT-007; ADR-006 Punkt 11).
-- Aus 20261110100000_alt_001_sleep_and_painkillers.sql; Rueckgabe gleich.
-- =============================================================================

create or replace function app.tracking_parameters()
returns table (
  parameter_key text, cadence text, min_value integer, max_value integer, sort_order integer,
  role text
)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('session_exertion',          'session', 0, 10,  1, 'question'),
    ('session_pain',              'session', 0, 10,  2, 'question'),
    ('session_confidence',        'session', 0, 10,  3, 'question'),
    ('pain_rest',                 'checkin', 0, 10,  1, 'question'),
    ('pain_load',                 'checkin', 0, 10,  2, 'question'),
    ('pain_after_load',           'checkin', 0, 10,  3, 'question'),
    ('pain_night',                'checkin', 0, 10,  4, 'question'),
    ('pain_morning',              'checkin', 0, 10,  5, 'question'),
    ('pain_recovery_hours',       'checkin', 0, 72,  6, 'question'),
    ('pain_quality',              'checkin', 1, 5,   7, 'question'),
    -- ALT-001: an wie vielen der letzten 7 Tage Schmerzmittel bei Bedarf
    -- (IDEA-ALT-004, ANN-368).
    ('painkiller_days_7d',        'checkin', 0, 7,   8, 'question'),
    ('movement_confidence',       'checkin', 0, 10,  9, 'question'),
    ('daily_impairment',          'checkin', 0, 10, 10, 'question'),
    ('sleep_quality',             'checkin', 0, 10, 11, 'question'),
    -- ALT-001: Schlafdauer der letzten Nacht in ganzen Stunden (IDEA-ALT-003,
    -- ANN-368).
    ('sleep_hours',               'checkin', 0, 16, 12, 'question'),
    ('stress',                    'checkin', 0, 10, 13, 'question'),
    ('morning_stiffness_minutes', 'checkin', 0, 240, 14, 'question'),
    ('painkiller_24h',            'checkin', 0, 1,  15, 'context'),
    ('pain_side',                 'checkin', 1, 4,  16, 'context'),
    -- ALT-002: die groesste Belastung ausserhalb der Uebungen seit dem
    -- letzten Check-in (IDEA-ALT-001, ANN-369). Art: 1 nichts Besonderes,
    -- 2 Gehen oder Wandern, 3 Radfahren, 4 Garten oder Haushalt, 5 Sport,
    -- 6 schwere koerperliche Arbeit, 7 Sonstiges. Dauer in Minuten.
    -- Anstrengung: 1 leicht, 2 mittel, 3 anstrengend.
    ('activity_kind',             'checkin', 1, 7,  17, 'context'),
    ('activity_minutes',          'checkin', 0, 600, 18, 'context'),
    ('activity_intensity',        'checkin', 1, 3,  19, 'context')
  ) as t (parameter_key, cadence, min_value, max_value, sort_order, role)
$$;

comment on function app.tracking_parameters() is
  'TRK-001, TRK-004, TRK-005, ALT-001, ALT-002 (ANN-348, ANN-353 bis ANN-355, ANN-368, ANN-369): Katalog der Erfassungsgroessen nach Takt (IDEA-TRK-001) - Schluessel, Takt, Wertebereich, Reihenfolge und Rolle (Frage oder Zusammenhang). Die eine Stelle; Beschriftungen und die Woerter einer Auswahl in src/lib/erfassungsgroessen.ts. Keine Schwelle, keine Bewertung (ADR-006 Punkt 11).';
