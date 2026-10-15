-- =============================================================================
-- UEB-013: Übungen ohne Zeichnung
--
-- Jannes, 2026-10-15: "Ich moechte keine KI-Bilder." Die Linienfiguren aus der
-- Posen-Beschreibung (UEB-012, ANN-381) sind KI-erstellt; sie fallen weg. Bilder
-- und Videos dreht die Praxis spaeter selbst, bis dahin erklaert die Anleitung
-- in Schritten die Uebung (ANN-539). Verworfen sind damit ANN-381 (Posen-
-- Beschreibung) und ANN-480 (Bild der Ausgangsstellung).
--
--   public.exercise_variants.illustration    geleert
--   public.exercise_plan_items.illustration  geleert, auch in zugewiesenen
--                                            Plaenen (der eingefrorene
--                                            Schnappschuss verliert nur das
--                                            Bild; Name, Anleitung und
--                                            Dosierung bleiben, ANN-300)
--   app.exercise_illustration_valid          nimmt nur noch null an - die
--                                            eine Stelle, an der ein Bild
--                                            wieder zugelassen wuerde
--
-- Die Spalten bleiben (nullable): Projektionen, Schnappschuss und Import
-- liefern weiter den Schluessel `illustration`, jetzt immer null. Eigene
-- Fotos und Videos der Praxis waeren Dateien (ADR-017) und kaemen ueber einen
-- eigenen Weg; dann fallen die Spalten mit.
--
-- Keine neue Auditaktion (ADR-010 Fassung 3), keine neue Tabelle.
-- =============================================================================

update public.exercise_variants
   set illustration = null
 where illustration is not null;

-- Der Waechter laesst Positionen nur im Entwurf aendern (ANN-300). Das Leeren
-- des Bildes ist die eine Ausnahme dieser Migration und aendert nichts, was
-- die Person gelesen oder geuebt hat.
alter table public.exercise_plan_items disable trigger exercise_plan_items_guard;

update public.exercise_plan_items
   set illustration = null
 where illustration is not null;

alter table public.exercise_plan_items enable trigger exercise_plan_items_guard;

create or replace function app.exercise_illustration_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null
$$;

comment on function app.exercise_illustration_valid(jsonb) is
  'UEB-012, UEB-013 (ANN-539): Ein Uebungsbild gibt es nicht mehr - gueltig ist nur null. Die eine Stelle, an der ein Bild wieder zugelassen wuerde.';
