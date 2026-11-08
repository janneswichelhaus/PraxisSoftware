-- Der Seed legt die Testkonten neu an und nähme Passkeys, ihre Freigaben und die App-PIN mit (Jannes
-- 2026-11-08: stehen lassen); gesichert sind nur öffentliche Schlüssel und Hashes, bis zum Commit.

-- Ohne Spaltenliste: Das Schema des Anmeldedienstes wechselt mit seiner Fassung.
create temp table erhalt_konten on commit drop as
select u.id, u.email
  from auth.users u
 where u.email like '%@praxis.invalid' or u.email like '%@patient.invalid';

create temp table erhalt_pins on commit drop as
select p.* from public.account_pins p where p.user_id in (select id from erhalt_konten);

create temp table erhalt_freigaben on commit drop as
select a.* from public.passkey_approvals a where a.user_id in (select id from erhalt_konten);

-- Wie die Migrationen: Eine Fassung des Anmeldedienstes ohne Passkeys bricht nichts ab.
select to_regclass('auth.webauthn_credentials') is not null as mit_passkeys \gset
\if :mit_passkeys
create temp table erhalt_passkeys on commit drop as
select c.* from auth.webauthn_credentials c where c.user_id in (select id from erhalt_konten);
\endif
