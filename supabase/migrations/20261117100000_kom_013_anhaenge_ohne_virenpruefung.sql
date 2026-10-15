-- =============================================================================
-- KOM-013: Anhaenge von aussen ohne Virenpruefung, von selbst an
--
-- Jannes, 2026-10-15: "Ich moechte keinen Virenscanner und trotzdem Bilder
-- und Videos von Patienten zulassen." ADR-017 Fassung 6 kehrt dafuer Punkt 29
-- (Virenpruefung MUSS vor dem ersten Upload von aussen) und den Satz aus
-- Punkt 69 um, nach dem ohne Pruefergebnis kein Anhang einer echten Person
-- ready wird; ADR-026 ist abgelehnt (ANN-371, Fassung 2).
--
--   public.organizations.external_attachments_enabled   Standard jetzt an,
--                                                        alle bestehenden an
--
-- Unveraendert bleiben: der Schalter selbst (je Organisation, nur in der
-- Datenbank zu aendern - so laesst sich ein Betrieb weiterhin abschalten),
-- app.message_attachment_scan_required() (aus: ein Anhang wird nach den
-- Pruefungen aus Punkt 49 ready und traegt sichtbar "nicht auf Schadsoftware
-- geprueft"), die Einwilligung (Punkt 61), Format, Dauer und Groesse (Punkte
-- 62, 63), die Anzeige nur im Medienelement ohne Download und die Frist von
-- 30 Tagen.
-- =============================================================================

alter table public.organizations
  alter column external_attachments_enabled set default true;

update public.organizations
   set external_attachments_enabled = true
 where not external_attachments_enabled;

comment on column public.organizations.external_attachments_enabled is
  'KOM-012, KOM-013 (ANN-371 Fassung 2, ADR-017 Fassung 6): ob Patient:innen und Kund:innen Fotos und Videos an Rueckfragen anhaengen koennen. Standard an, ohne Virenpruefung (Entscheidung Jannes 2026-10-15). Aus nur von Hand in der Datenbank; keine Funktion aendert ihn.';

comment on function app.message_attachment_scan_required() is
  'KOM-005, KOM-013 (ADR-017 Punkt 69 in Fassung 6): der Schalter der Virenpruefung fuer Anhaenge an Rueckfragen. Aus und vorgesehen aus (ADR-026 abgelehnt, 2026-10-15): ein Anhang wird nach den Pruefungen aus Punkt 49 ready und ist als "nicht auf Schadsoftware geprueft" gekennzeichnet. An: er bliebe pending, bis ein Pruefergebnis vorliegt.';
