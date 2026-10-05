-- =============================================================================
-- UBK-010: Fahrzeitfaktor als Praxiseinstellung (ANN-237)
--
-- Der Kartendienst rechnet mit dem Lastenradprofil praktisch mit festen
-- ~23 km/h (gemessen an vier Abschnitten: 22,6 bis 23,5 km/h). Im Alltag
-- liegt die Praxis naeher bei 15 km/h (Ampeln, Steigung, Abstellen). Jannes
-- hat am 2026-10-05 einen Faktor 1,5 entschieden (Wiedervorlage von
-- ANN-097): Jede Fahrzeit des Kartendienstes wird mit ihm multipliziert,
-- bevor sie angezeigt oder an check_travel_buffers bzw. rate_slot_travel
-- gegeben wird.
--
-- Diese Migration legt nur den Wert ab. Angewendet wird er im Browser an
-- genau einer Stelle (`planungsfahrzeit` in src/features/tours/
-- fahrzeitfaktor.ts): Die Fahrzeit entsteht dort, die Datenbank bekommt sie
-- nur hereingereicht (ANN-097). Ein zweites Multiplizieren hier waere eine
-- zweite Stelle.
--
-- Datenschutz: ein Praxiswert, kein Merkmal einer Person (§20). Geaendert
-- wird er wie das Raster nur von owner; die Zeile weist den Wert selbst nach,
-- ein Auditeintrag entsteht nicht (ADR-010 Fassung 3, wie
-- set_location_tour_start).
-- =============================================================================

alter table public.organizations
  add column travel_time_factor numeric(2, 1) not null default 1.5
    check (travel_time_factor between 1.0 and 2.5);

comment on column public.organizations.travel_time_factor is
  'UBK-010, ANN-237: Faktor auf jede Fahrzeit des Kartendienstes (1,0 bis 2,5 in Schritten von 0,1; Voreinstellung 1,5). Angewendet im Browser an genau einer Stelle, bevor Anzeige und Fahrpufferpruefung rechnen.';

-- -----------------------------------------------------------------------------
-- set_travel_time_factor - nur owner, nur die eigene Praxis
-- -----------------------------------------------------------------------------
create function public.set_travel_time_factor(p_factor numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.has_any_role('owner') then
    raise exception 'not allowed to change the travel time factor' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to change the travel time factor' using errcode = '42501';
  end if;

  -- Schritte von 0,1: Ein Wert wie 1,55 wuerde die Spalte still runden.
  -- Abgewiesen statt gerundet - gespeichert wird, was gewaehlt wurde.
  if p_factor is null
     or p_factor < 1.0
     or p_factor > 2.5
     or p_factor <> round(p_factor, 1) then
    raise exception 'travel time factor must be between 1.0 and 2.5 in steps of 0.1'
      using errcode = '22023';
  end if;

  update public.organizations o
     set travel_time_factor = p_factor
   where o.id = v_org;
end;
$$;

comment on function public.set_travel_time_factor(numeric) is
  'UBK-010, ANN-237: setzt den Fahrzeitfaktor der Praxis (1,0 bis 2,5, Schritt 0,1). Nur owner. Ohne Auditeintrag (ADR-010 Fassung 3).';

revoke all on function public.set_travel_time_factor(numeric) from public, anon;
grant execute on function public.set_travel_time_factor(numeric) to authenticated;
