-- =============================================================================
-- TRK-004 (TRK-EPIC-002): Schmerz differenziert und Bewegungssicherheit neben
-- dem Schmerz
--
-- IDEA-TRK-005: "Schmerz 0-10" ist zu grob - wann (in Ruhe, bei, nach
-- Belastung, nachts, morgens), wie lange bis zurueck auf dem Ausgangsniveau,
-- welche Art. IDEA-TRK-003: Bewegungssicherheit ist eine eigene Groesse mit
-- eigener Richtung, nach einer Einheit und im Check-in (ANN-353, ANN-354).
--
--   app.tracking_parameters()   + sechs Groessen im Check-in, eine je Einheit
--
-- Eine neue Groesse ist eine Zeile im Katalog (ANN-348); Tabellen, Rechte und
-- Funktionen bleiben. Eine Auswahl (Schmerzart) ist eine ganze Zahl wie jede
-- andere Angabe: 1 bis 5, die Woerter stehen in src/lib/erfassungsgroessen.ts
-- (ANN-354). Erfassen und anzeigen, nie bewerten (ADR-006 Punkt 11): kein
-- Muster, keine Einordnung ("neuropathisch"), keine Schwelle.
-- =============================================================================

-- Die Rueckgabe bleibt gleich; neu sind nur Zeilen. Aus
-- 20261105100000_trk_001_session_values.sql.
create or replace function app.tracking_parameters()
returns table (parameter_key text, cadence text, min_value integer, max_value integer, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('session_exertion',          'session', 0, 10,  1),
    ('session_pain',              'session', 0, 10,  2),
    -- TRK-004: Bewegungssicherheit nach der Einheit (IDEA-TRK-003).
    ('session_confidence',        'session', 0, 10,  3),
    ('pain_rest',                 'checkin', 0, 10,  1),
    ('pain_load',                 'checkin', 0, 10,  2),
    -- TRK-004: Schmerz differenziert (IDEA-TRK-005, ANN-353).
    ('pain_after_load',           'checkin', 0, 10,  3),
    ('pain_night',                'checkin', 0, 10,  4),
    ('pain_morning',              'checkin', 0, 10,  5),
    ('pain_recovery_hours',       'checkin', 0, 72,  6),
    -- Schmerzart: 1 dumpf, 2 stechend, 3 brennend, 4 elektrisierend,
    -- 5 ziehend (ANN-354).
    ('pain_quality',              'checkin', 1, 5,   7),
    -- TRK-004: Bewegungssicherheit im Alltag (IDEA-TRK-003, ANN-353).
    ('movement_confidence',       'checkin', 0, 10,  8),
    ('daily_impairment',          'checkin', 0, 10,  9),
    ('sleep_quality',             'checkin', 0, 10, 10),
    ('stress',                    'checkin', 0, 10, 11),
    ('morning_stiffness_minutes', 'checkin', 0, 240, 12)
  ) as t (parameter_key, cadence, min_value, max_value, sort_order)
$$;

comment on function app.tracking_parameters() is
  'TRK-001, TRK-004 (ANN-348, ANN-353, ANN-354): Katalog der Erfassungsgroessen nach Takt (IDEA-TRK-001) - Schluessel, Takt, Wertebereich, Reihenfolge. Die eine Stelle; Beschriftungen und die Woerter einer Auswahl in src/lib/erfassungsgroessen.ts. Keine Schwelle, keine Bewertung (ADR-006 Punkt 11).';

comment on function public.finish_platform_exercise_session(uuid, uuid, text, jsonb) is
  'UEB-010, TRK-001, TRK-004: beendet eine offene Einheit, wahlweise mit "Das war schwierig, weil ..." (hoechstens 500 Zeichen) und mit Angaben zur Einheit { session_exertion, session_pain, session_confidence: 0 bis 10 } (ANN-348, ANN-353); im Training beides nur mit Einwilligung (ANN-306). Ein ungueltiger Wert 22023, dann bleibt die Einheit offen. Danach aendert sich an der Einheit nichts mehr.';
