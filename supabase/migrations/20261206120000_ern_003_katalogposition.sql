-- =============================================================================
-- ERN-003 (ERN-EPIC-001): Die Ernährungsberatung in der Preisliste
--
-- ADR-027 Punkt 15, ADR-009 Punkte 5, 6, 15 und 16. Pfad A (Leistungen).
--
--   service_catalog_items.item_kind  + 'nutrition_counselling'
--
-- Eine eigene Positionsart, in BEIDEN Bereichen: Die Rechnung trägt genau
-- einen Bereich (ADR-009 Punkt 16), und die Beratung steht auf der Rechnung
-- des Bereichs, an dem das Profil hängt - also je Bereich eine Position. Ohne
-- Heilmittel und ohne Laufzeit.
--
-- DAS STEUERKENNZEICHEN hängt am Posten (ADR-009 Punkt 15) und wird hier
-- NICHT erzwungen: ADR-027 Punkt 15 nennt „steuerpflichtig 19 %“ als
-- Voreinstellung, bis G13 mit der Steuerberatung (B4) entscheidet. Die
-- Voreinstellung setzt der Editor der Preisliste; die bestehenden Regeln
-- gelten weiter (im Training nie steuerfrei, Satz passend zur Einordnung).
--
-- NICHT HIER (ANN-622): das Erfassen einer Beratung als Leistung an einem
-- Termin - `record_billable_services` nimmt weiter nur Behandlung und
-- Ausfallhonorar. Die Position steht bereit; wie eine Sitzung entsteht,
-- entscheidet Jannes (Frage im Bericht).
-- =============================================================================

alter table public.service_catalog_items
  drop constraint service_catalog_items_item_kind_check;
alter table public.service_catalog_items
  add constraint service_catalog_items_item_kind_check
    check (item_kind in ('treatment', 'absence_fee', 'aftercare_month', 'training_package',
                         'nutrition_counselling'));

-- ANN-622: Ernährungsberatung als eigene Positionsart, ohne Heilmittel, in
-- beiden Bereichen; das Steuerkennzeichen voreingestellt, nicht erzwungen.
alter table public.service_catalog_items
  add constraint service_catalog_items_nutrition_counselling check (
    item_kind <> 'nutrition_counselling' or remedy is null
  );

comment on constraint service_catalog_items_nutrition_counselling on public.service_catalog_items is
  'ERN-003 (ADR-027 Punkt 15, ANN-622): Die Ernährungsberatung ist keine Behandlung mit Heilmittel; sie steht je Bereich als eigene Position. Das Steuerkennzeichen trägt der Posten (voreingestellt steuerpflichtig 19 %, bis G13/B4).';

comment on column public.service_catalog_items.item_kind is
  'treatment = erbrachte Behandlung (die Hausbesuchspauschale ist eine davon), absence_fee = Ausfallhonorar zu einem Gebuehrenanlass nach ADR-018 Fassung 2, aftercare_month = Monat des Nachsorge-Abos, training_package = Trainingspaket, nutrition_counselling = Ernaehrungsberatung (ADR-027 Punkt 15). ABR-002 laesst Behandlung und Ausfallhonorar nie ineinander rutschen.';
