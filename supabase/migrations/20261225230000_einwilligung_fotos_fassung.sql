-- Neue Fassung der Einwilligungstexte (ANN-262): Der Widerruf zu Fotos löscht die Arbeitshilfen,
-- Fotos der Behandlungsdokumentation bleiben in der Akte (ADR-017 Punkt 46, ANN-814).
-- Eine Seite mit dem alten Text weist der Server ab, statt eine Einwilligung dazu zu speichern.

create or replace function app.platform_consent_wording_version()
returns text
language sql immutable
set search_path to ''
as $$
  select '2026-11'::text
$$;
