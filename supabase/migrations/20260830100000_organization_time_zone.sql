-- =============================================================================
-- Zeitzone der Organisation (CAL-001)
--
-- Termine sind der erste Fachvorgang, der einen Zeitpunkt fachlich einordnen
-- muss: "Dienstag 9 Uhr" ist eine Aussage in der Zeitzone der Praxis, nicht in
-- der des Browsers, des Servers oder des Betriebssystems. ADR-014 verlangt
-- zeitzonenbewusste Zeitstempel; timestamptz allein genuegt dafuer nicht,
-- weil es den Ortsbezug nicht mitfuehrt.
--
-- Deshalb traegt die Organisation ihre IANA-Zeitzone explizit.
--
-- Bewusst OHNE Datenbank-Default: ein Default 'Europe/Berlin' wuerde jede
-- spaeter angelegte Organisation stillschweigend nach Berlin legen. Eine neue
-- Organisation MUSS ihre Zeitzone bewusst setzen. Die bestehenden
-- synthetischen Organisationen werden einmalig auf Europe/Berlin gesetzt.
-- =============================================================================

alter table public.organizations
  add column time_zone text
    check (length(btrim(time_zone)) between 1 and 100);

-- Einmalige Zuweisung fuer den Bestand. Danach ist die Spalte verpflichtend.
update public.organizations
   set time_zone = 'Europe/Berlin'
 where time_zone is null;

alter table public.organizations
  alter column time_zone set not null;

comment on column public.organizations.time_zone is
  'IANA-Zeitzone der Praxis (z. B. Europe/Berlin). Massgeblich fuer die Auslegung von Kalendertagen und Uhrzeiten (CAL-001, ADR-014). Bewusst ohne Default: jede Organisation legt sie ausdruecklich fest.';

-- -----------------------------------------------------------------------------
-- Gueltigkeitspruefung gegen den IANA-Katalog der Datenbank.
--
-- Eine CHECK-Constraint kann das nicht leisten: pg_timezone_names ist eine
-- Sicht und nicht immutable. Ein Trigger ist hier die einzige Stelle, an der
-- ein Tippfehler wie 'Europe/Berlim' auffaellt, bevor er die Terminanzeige
-- einer ganzen Praxis verschiebt.
-- -----------------------------------------------------------------------------
create or replace function app.assert_valid_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- NULL bleibt der NOT-NULL-Constraint ueberlassen: sie meldet den fehlenden
  -- Wert deutlicher als eine Katalogpruefung, die ins Leere laeuft.
  if new.time_zone is not null and not exists (
    select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone
  ) then
    raise exception 'unknown IANA time zone' using errcode = '22023';
  end if;
  return new;
end;
$$;

comment on function app.assert_valid_time_zone() is
  'Prueft organizations.time_zone gegen den IANA-Katalog der Datenbank (CAL-001).';

create trigger organizations_time_zone_valid
  before insert or update of time_zone on public.organizations
  for each row execute function app.assert_valid_time_zone();
