-- =============================================================================
-- ABN-019 (BEF-110 Punkt 2): Die MDR-Sperre auch auf dem Server
--
-- Abnahme Jannes, 2026-10-02: Eine Funktion wird erst nach dokumentierter
-- MDR-Pruefung geoeffnet; vorhandene Serverzugaenge solcher Funktionen werden
-- ebenfalls gesperrt, nicht nur die Adressen der Oberflaeche.
--
-- Heute gibt es fuer keine klassifizierte Funktion einen Serverzugang
-- (src/app/mdr.ts). Diese Funktion ist die eine Stelle, die jede kuenftige
-- Serverfunktion eines klassifizierten Bereichs fragt, bevor sie etwas tut:
-- `if not app.mdr_released('ki-analyse') then raise ...`. Sie kennt keine
-- Freigabe - solange kein Freigabevermerk mit Pruefdokument vorliegt, ist die
-- Antwort fuer jede Kennung `false`. Eine Freigabe ist eine neue Migration mit
-- Verweis auf das Pruefdokument, kein Schalter (ADR-006 Punkt 13, ANN-089).
-- =============================================================================

create function app.mdr_released(p_feature_id text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Freigegebene Kennungen stuenden hier, je mit Verweis auf die Pruefung.
  select p_feature_id = any (array[]::text[])
$$;

comment on function app.mdr_released(text) is
  'Ist die MDR-klassifizierte Funktion nach dokumentierter Pruefung freigegeben (ABN-019, BEF-110, ANN-089)? Heute fuer jede Kennung false. Jede kuenftige Serverfunktion eines Bereichs aus src/app/mdr.ts fragt sie zuerst.';

revoke all on function app.mdr_released(text) from public, anon;
grant execute on function app.mdr_released(text) to authenticated;
