-- Zurück (`anmeldung-sichern.sql`) nur an dasselbe Konto mit derselben Kennung und Adresse; was der
-- Seed nicht mehr kennt, entfällt. Die Freigabe nach ihrem Passkey: Sie verweist auf ihn.

create temp table erhalt_wieder on commit drop as
select k.id from erhalt_konten k join auth.users u on u.id = k.id and u.email = k.email;

\if :mit_passkeys
insert into auth.webauthn_credentials
select e.* from erhalt_passkeys e where e.user_id in (select id from erhalt_wieder);
\endif

insert into public.passkey_approvals
select e.* from erhalt_freigaben e where e.user_id in (select id from erhalt_wieder);

insert into public.account_pins
select e.* from erhalt_pins e where e.user_id in (select id from erhalt_wieder);
