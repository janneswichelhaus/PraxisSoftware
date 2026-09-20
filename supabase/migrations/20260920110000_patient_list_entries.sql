-- =============================================================================
-- R3-012: Die Patientenliste bekommt ihre eigene, schlanke Sicht
--
-- Die Liste las bisher `patient_directory` - die Kartei, die alles traegt,
-- was die Akte braucht: Versorgungsvermerk, Hinweis zum Hausbesuchszugang,
-- Bemerkung und die vollstaendige Anschrift. Angezeigt hat sie davon nichts;
-- gerendert werden Name, Alter, Ort und Status, gesucht wird ueber Name, Ort,
-- Postleitzahl, Telefon und E-Mail. Der Rest lag trotzdem im Browser - fuer
-- **jede** Patientin der Praxis auf einmal.
--
-- ADR-004 sagt dazu unter "Projektionen": Was jemand sehen darf, entscheidet
-- die Datenbank, nicht die Spaltenliste im Client. Genau das ist hier der
-- Unterschied - eine kuerzere `select`-Liste im Client waere dieselbe
-- Entscheidung an der falschen Stelle, und die naechste Erweiterung der Liste
-- haette sie still wieder aufgehoben.
--
-- `patient_directory` bleibt unveraendert: Die Akte braucht die volle
-- Projektion, und sie holt sie fuer **eine** Person.
--
-- security_invoker wie bei der Kartei: Die RLS der Basistabellen entscheidet
-- weiter, welche Zeilen jemand sieht. Ein Patientenkonto sieht nur sich
-- selbst, anon gar nichts.
-- =============================================================================

create view public.patient_list_entries
with (security_invoker = true) as
select
  p.id,
  p.organization_id,
  p.status,
  pe.given_name,
  pe.family_name,
  c.date_of_birth,
  c.email,
  c.phone,
  c.postal_code,
  c.city
from public.patients p
join public.persons pe on pe.id = p.person_id
left join public.patient_contact_details c on c.patient_id = p.id;

comment on view public.patient_list_entries is
  'Schlanke Projektion fuer die Patientenliste (ADR-004, R3-012): Name, Geburtsdatum, Ort, Postleitzahl, Telefon, E-Mail und Status - genau das, was die Liste zeigt und wonach sie sucht. Keine Versorgungsangaben, keine Strasse, keine feste Therapeut:in; dafuer gibt es patient_directory in der Akte. security_invoker: die RLS der Basistabellen gilt unveraendert.';

revoke all on public.patient_list_entries from anon, authenticated;
grant select on public.patient_list_entries to authenticated;
