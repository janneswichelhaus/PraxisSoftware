-- =============================================================================
-- ANN-100: Zugang zur Test-Umgebung (OPS-002a)
--
-- supabase/seed.sql setzt fuer alle Konten ein Entwicklungskennwort, das im
-- Repository steht. Auf einer oeffentlich erreichbaren Adresse darf es nie
-- gelten. Diese Datei laeuft deshalb in DERSELBEN Transaktion wie der Seed
-- (psql --single-transaction) und ersetzt es, bevor es je festgeschrieben ist.
--
-- Das Kennwort kommt aus der Einstellung `praxis.zugang_passwort`, die der
-- Workflow aus dem Secret TESTENV_LOGIN_PASSWORD setzt
-- (supabase/testumgebung/neu-aufsetzen.psql). Fehlt es, bekommt jedes Konto
-- ein zufaelliges Kennwort, das niemand kennt: Die Umgebung ist dann gesperrt,
-- nicht offen.
-- =============================================================================

do $$
declare
  kennwort text := coalesce(current_setting('praxis.zugang_passwort', true), '');
begin
  if kennwort <> '' and length(kennwort) < 12 then
    raise exception 'TESTENV_LOGIN_PASSWORD ist kuerzer als 12 Zeichen.';
  end if;

  if kennwort = '' then
    raise notice 'Kein Zugangskennwort gesetzt - alle Konten der Test-Umgebung sind gesperrt.';
  end if;

  -- Je Konto ein eigenes Zufallskennwort, falls keines gesetzt ist.
  update auth.users
     set encrypted_password = extensions.crypt(
           case when kennwort = '' then encode(extensions.gen_random_bytes(32), 'hex') else kennwort end,
           extensions.gen_salt('bf')
         ),
         updated_at = now()
   where email like '%@praxis.invalid' or email like '%@patient.invalid';
end;
$$;

-- Die Einstellung lebt nur bis zum Ende der Sitzung; sie wird trotzdem sofort
-- geleert, damit sie in keiner spaeteren Abfrage derselben Sitzung auftaucht.
select set_config('praxis.zugang_passwort', '', false);
