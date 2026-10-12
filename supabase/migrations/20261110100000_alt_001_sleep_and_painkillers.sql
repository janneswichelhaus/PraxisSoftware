-- =============================================================================
-- ALT-001 (ALT-EPIC-001): Schlafdauer und Bedarfsmedikation als Verlaufsgroessen
--
-- IDEA-ALT-003: Schlaf und Stress als taegliche Ein-Klick-Werte. Schlafqualitaet
-- und Stress fragt der Check-in seit TRK-002 (ANN-349); neu ist die
-- Schlafdauer in Stunden. IDEA-ALT-004: Bedarfsmedikation als Haeufigkeit,
-- nicht als Medikationsplan - an wie vielen der letzten sieben Tage Schmerzmittel
-- bei Bedarf genommen wurden (ANN-368). Der Zusammenhang "Schmerzmittel in den
-- letzten 24 Stunden" (TRK-005, ANN-355) bleibt daneben stehen.
--
--   app.tracking_parameters()   + sleep_hours, painkiller_days_7d (Fragen)
--
-- Eine neue Groesse ist eine Zeile im Katalog (ANN-348); Tabellen, Rechte,
-- Fristen und Funktionen bleiben. Die Reihenfolge ordnet die neuen Fragen zu
-- ihren Nachbarn; sort_order steht nirgends gespeichert. Erfassen und
-- anzeigen, nie bewerten (ADR-006 Punkt 11): kein "zu wenig Schlaf", keine
-- Ableitung "Ihr Schmerz kommt vom Schlafmangel" (IDEA-ALT-003, Vorsicht).
-- =============================================================================

-- Rueckgabe unveraendert; aus 20261106110000_trk_005_context.sql.
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
    ('pain_side',                 'checkin', 1, 4,  16, 'context')
  ) as t (parameter_key, cadence, min_value, max_value, sort_order, role)
$$;

comment on function app.tracking_parameters() is
  'TRK-001, TRK-004, TRK-005, ALT-001 (ANN-348, ANN-353 bis ANN-355, ANN-368): Katalog der Erfassungsgroessen nach Takt (IDEA-TRK-001) - Schluessel, Takt, Wertebereich, Reihenfolge und Rolle (Frage oder Zusammenhang). Die eine Stelle; Beschriftungen und die Woerter einer Auswahl in src/lib/erfassungsgroessen.ts. Keine Schwelle, keine Bewertung (ADR-006 Punkt 11).';
