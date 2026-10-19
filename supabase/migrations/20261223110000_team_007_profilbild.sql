-- =============================================================================
-- TEAM-007: Profilbild im Teamchat (ADR-017 Fassung 10, Abschnitt O; ANN-667)
--
-- Wer am Teamchat teilnimmt, kann sich ein Profilbild geben - freiwillig, nur
-- sich selbst, jederzeit entfernbar. Es steht vor den eigenen Nachrichten und
-- in jeder Liste von Personen, umrahmt von der eigenen Farbe (TEAM-006).
--
-- Abschnitt O legt das Bild **in die Datenbank, nicht in einen Bucket**: ein
-- Quadrat von 256 × 256 Bildpunkten als JPEG, auf dem Gerät aus Pixeln
-- gerechnet (ohne Aufnahmemetadaten, Punkt 34), höchstens 64 KiB. Ein Bild,
-- das in jeder Liste steht, bräuchte im Bucket einen Verweis je Person und
-- Liste - genau das schließt Punkt 15 aus; in einer Zeile unter den Rechten
-- des Teamchats gibt es keinen Verweis, der sich weitergeben, zwischenspeichern
-- oder nicht widerrufen ließe (Punkte 16, 17), und die Löschung ist die der
-- Zeile mit Löschjournal (Punkt 26 entfällt).
--
-- Der Server prüft das Bild am Inhalt, bevor er es ablegt (Punkt 49 in
-- derselben Transaktion statt in einer Edge Function): JPEG von Anfang bis
-- Ende, nur Segmente, die der Dekoder braucht - kein EXIF, XMP, IPTC, ICC,
-- kein Kommentar, kein Vorschaubild, nichts hinter dem Bildende -, genau 256 ×
-- 256. Er schreibt keine Bytes um (Punkt 52): Ein Befund lehnt ab.
--
-- Unveränderlich (Punkt 8): Ein neues Bild ist eine neue Zeile, das alte fällt
-- mit Eintrag im Löschjournal - ebenso beim Entfernen und mit dem Ausscheiden
-- (Mitarbeiterdatensatz inaktiv). Ausgeschiedene zeigen kein Bild mehr.
--
--   public.staff_profile_pictures      ein Bild je Person, Klasse profilbild
--   public.set_own_profile_picture     eigenes Bild setzen oder ersetzen
--   public.remove_own_profile_picture  eigenes Bild entfernen
--   public.get_team_profile_picture    ein Bild lesen (Kennung = Fassung)
--   public.list_team_avatars           + Kennung des Bildes
--   public.reapply_deletion_journal    + staff_profile_pictures
--
-- Kein Tabellenrecht (ADR-004), kein Auditeintrag (ADR-010 Punkte 15 bis 17;
-- ADR-017 Punkt 78 sinngemäß): Wer wann ein Bild gesetzt hat, steht an der
-- Zeile; Anzeigen ist kein Ereignis.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Grenzen
-- -----------------------------------------------------------------------------
create function app.profile_picture_side()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 256
$$;

create function app.profile_picture_max_bytes()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 65536
$$;

revoke all on function app.profile_picture_side() from public, anon, authenticated;
revoke all on function app.profile_picture_max_bytes() from public, anon, authenticated;

comment on function app.profile_picture_side() is
  'TEAM-007 (ADR-017 Punkt 89): Kantenlänge eines Profilbilds in Bildpunkten - quadratisch, auf dem Gerät gerechnet.';
comment on function app.profile_picture_max_bytes() is
  'TEAM-007 (ADR-017 Punkt 89): höchstens so viele Bytes je Profilbild.';

-- -----------------------------------------------------------------------------
-- 2. Prüfung am Inhalt (ADR-017 Punkte 49 und 89)
-- -----------------------------------------------------------------------------
-- Liefert null für ein gültiges Bild, sonst den Grund: 'size', 'format',
-- 'metadata' oder 'dimensions'. Läuft das ganze JPEG ab wie die Bereinigung
-- auf dem Gerät (`jpegSegmente` in src/features/files/metadaten.ts), auch
-- durch die Bilddaten jedes Scans: Ein Segment hinter dem ersten Scan wäre
-- sonst ein Versteck.
create function app.profile_picture_problem(p_image bytea)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  n       integer := coalesce(octet_length(p_image), 0);
  i       integer := 2;
  m       integer;
  laenge  integer;
  ende    integer;
  folge   integer;
  breite  integer;
  hoehe   integer;
  rahmen  boolean := false;
  scan    boolean := false;
begin
  if n < 128 or n > app.profile_picture_max_bytes() then
    return 'size';
  end if;
  if get_byte(p_image, 0) <> 255 or get_byte(p_image, 1) <> 216 then
    return 'format';
  end if;

  loop
    if i >= n or get_byte(p_image, i) <> 255 then
      return 'format';
    end if;
    -- Füllbytes vor einem Marker.
    while i + 1 < n and get_byte(p_image, i + 1) = 255 loop
      i := i + 1;
    end loop;
    if i + 1 >= n then
      return 'format';
    end if;
    m := get_byte(p_image, i + 1);

    exit when m = 217; -- EOI

    -- RST0-7 und TEM tragen keine Länge.
    if m between 208 and 215 or m = 1 then
      i := i + 2;
      continue;
    end if;

    if i + 4 > n then
      return 'format';
    end if;
    laenge := get_byte(p_image, i + 2) * 256 + get_byte(p_image, i + 3);
    ende := i + 2 + laenge;
    if laenge < 2 or ende > n then
      return 'format';
    end if;

    if m = 238 then
      -- APP14 „Adobe“ sagt dem Dekoder nur, wie die Farben umzurechnen sind.
      if laenge < 7 or substring(p_image from i + 5 for 5) <> '\x41646f6265'::bytea then
        return 'metadata';
      end if;
    elsif m between 224 and 239 or m = 254 then
      -- Alle übrigen APPn (JFIF, EXIF, XMP, ICC, IPTC, Hersteller) und COM.
      return 'metadata';
    elsif m between 192 and 207 and m not in (196, 200, 204) then
      -- SOFn: Höhe und Breite.
      if laenge < 8 then
        return 'format';
      end if;
      hoehe := get_byte(p_image, i + 5) * 256 + get_byte(p_image, i + 6);
      breite := get_byte(p_image, i + 7) * 256 + get_byte(p_image, i + 8);
      rahmen := true;
    elsif m = 218 then
      -- SOS: Die Bilddaten des Scans gehören zum Segment, bis ein Marker folgt,
      -- der weder Füllung (FF 00) noch Rücksetzmarker ist.
      if not rahmen then
        return 'format';
      end if;
      scan := true;
      while ende < n loop
        if get_byte(p_image, ende) <> 255 then
          ende := ende + 1;
          continue;
        end if;
        exit when ende + 1 >= n;
        folge := get_byte(p_image, ende + 1);
        if folge = 0 or folge between 208 and 215 then
          ende := ende + 2;
          continue;
        end if;
        exit;
      end loop;
    elsif m not in (196, 204, 219, 220, 221) then
      -- Außer DHT, DAC, DQT, DNL und DRI kennt die Erlaubnisliste nichts.
      return 'format';
    end if;

    i := ende;
  end loop;

  -- Das Bildende ist das Ende der Datei; ein Bild hat einen Scan.
  if i + 2 <> n or not scan then
    return 'format';
  end if;
  if breite is distinct from app.profile_picture_side()
     or hoehe is distinct from app.profile_picture_side() then
    return 'dimensions';
  end if;
  return null;
end;
$$;

revoke all on function app.profile_picture_problem(bytea) from public, anon, authenticated;

comment on function app.profile_picture_problem(bytea) is
  'TEAM-007 (ADR-017 Punkt 90): Prüfung eines Profilbilds am Inhalt - JPEG ohne Metadaten, 256 × 256, höchstens 64 KiB. Liefert null oder den Grund der Ablehnung (size, format, metadata, dimensions).';

-- -----------------------------------------------------------------------------
-- 3. Datenklasse und Tabelle
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('profilbild', 'intern', null, 'none', null, 'ANN-667',
   'Profilbild einer beschäftigten Person im Teamchat (ADR-017 Abschnitt O): freiwillig, bis die Person es entfernt oder ersetzt, spätestens mit dem Ausscheiden (Mitarbeiterdatensatz inaktiv) - dann sofort, mit Eintrag im Löschjournal. Keine Frist nach Zeit.',
   104);

create table public.staff_profile_pictures (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  staff_member_id uuid not null unique references public.staff_members (id) on delete cascade,
  image           bytea not null check (octet_length(image) between 128 and 65536),
  created_at      timestamptz not null default now()
);

comment on table public.staff_profile_pictures is
  'TEAM-007 (ADR-017 Abschnitt O, ANN-667): Profilbild einer Person im Teamchat - JPEG 256 × 256 ohne Metadaten, höchstens 64 KiB, gesetzt nur von der Person selbst. Unveränderlich: ein neues Bild ist eine neue Zeile. Klasse profilbild: fällt beim Entfernen, Ersetzen und Ausscheiden, mit Löschjournal. Kein Tabellenrecht.';
comment on column public.staff_profile_pictures.id is
  'Kennung und zugleich Fassung des Bildes - ändert sich mit jedem neuen Bild; die Anwendung hält ein Bild je Kennung.';

create index staff_profile_pictures_organization_id_idx
  on public.staff_profile_pictures (organization_id);

alter table public.staff_profile_pictures enable row level security;
revoke all on public.staff_profile_pictures from public, anon, authenticated;

create function app.staff_profile_pictures_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'profile pictures are immutable' using errcode = '42501';
end;
$$;

revoke all on function app.staff_profile_pictures_guard() from public, anon, authenticated;

create trigger staff_profile_pictures_guard
  before update on public.staff_profile_pictures
  for each row execute function app.staff_profile_pictures_guard();

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('staff_profile_pictures', 'profilbild', 'automatisch',
   'Profilbild (TEAM-007): fällt, wenn die Person es entfernt oder ersetzt und wenn ihr Mitarbeiterdatensatz inaktiv wird - sofort, mit Eintrag im Löschjournal; mit dem Mitarbeiterdatensatz (cascade).',
   186);

-- -----------------------------------------------------------------------------
-- 4. Löschen: eine Stelle für alle drei Wege
-- -----------------------------------------------------------------------------
-- Tageweise gebündelt wie im Teamchat (TEAM-001, Zweitreview N4): eine
-- Lauf-Kennung je Praxis und Tag, Tag statt Uhrzeit.
create function app.forget_profile_picture(p_org uuid, p_picture uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at, deleted_at)
  values (p_org, md5('profile_picture:' || p_org::text || ':' || current_date::text)::uuid,
          'staff_profile_pictures', p_picture, 'profilbild',
          date_trunc('day', now()), date_trunc('day', now()));
  delete from public.staff_profile_pictures where id = p_picture;
end;
$$;

revoke all on function app.forget_profile_picture(uuid, uuid) from public, anon, authenticated;

-- Mit dem Ausscheiden fällt das Bild (ANN-667).
create function app.staff_profile_picture_on_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bild uuid;
begin
  select p.id into v_bild from public.staff_profile_pictures p where p.staff_member_id = new.id;
  if v_bild is not null then
    perform app.forget_profile_picture(new.organization_id, v_bild);
  end if;
  return null;
end;
$$;

revoke all on function app.staff_profile_picture_on_leave() from public, anon, authenticated;

create trigger staff_members_profile_picture_on_leave
  after update of employment_status on public.staff_members
  for each row
  when (new.employment_status = 'inactive' and old.employment_status is distinct from 'inactive')
  execute function app.staff_profile_picture_on_leave();

-- -----------------------------------------------------------------------------
-- 5. Setzen, entfernen, lesen
-- -----------------------------------------------------------------------------
-- Das Bild kommt als Base64 (JSON trägt keine Bytes). Jede Ablehnung nennt
-- nur ihren Grund, nie den Inhalt (ADR-011).
create function public.set_own_profile_picture(p_image text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_staff   uuid;
  v_bild    bytea;
  v_grund   text;
  v_alt     uuid;
  v_neu     uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();

  if p_image is null or length(p_image) > 4 * app.profile_picture_max_bytes() / 3 + 4 then
    raise exception 'profile picture rejected: size' using errcode = '22023';
  end if;
  begin
    v_bild := decode(p_image, 'base64');
  exception when others then
    raise exception 'profile picture rejected: format' using errcode = '22023';
  end;
  v_grund := app.profile_picture_problem(v_bild);
  if v_grund is not null then
    raise exception 'profile picture rejected: %', v_grund using errcode = '22023';
  end if;

  -- Je Person nacheinander: zwei gleichzeitige Bilder ersetzen einander.
  perform 1 from public.staff_members sm where sm.id = v_staff for no key update;
  select p.id into v_alt from public.staff_profile_pictures p where p.staff_member_id = v_staff;
  if v_alt is not null then
    perform app.forget_profile_picture(v_org, v_alt);
  end if;

  insert into public.staff_profile_pictures (organization_id, staff_member_id, image)
  values (v_org, v_staff, v_bild)
  returning id into v_neu;
  return v_neu;
end;
$$;

create function public.remove_own_profile_picture()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_alt   uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  perform 1 from public.staff_members sm where sm.id = v_staff for no key update;
  select p.id into v_alt from public.staff_profile_pictures p where p.staff_member_id = v_staff;
  if v_alt is null then
    return false;
  end if;
  perform app.forget_profile_picture(v_org, v_alt);
  return true;
end;
$$;

-- Ein Bild je Aufruf, gefunden über seine Kennung aus list_team_avatars. Nur
-- aktive Personen der eigenen Praxis; sonst „nicht gefunden“, ohne zu sagen,
-- ob es woanders eines gibt.
create function public.get_team_profile_picture(p_picture uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_bild  bytea;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();

  select p.image into v_bild
  from public.staff_profile_pictures p
  join public.staff_members sm on sm.id = p.staff_member_id
  where p.id = p_picture and p.organization_id = v_org and sm.employment_status = 'active';
  if v_bild is null then
    raise exception 'profile picture not found' using errcode = 'P0002';
  end if;
  return translate(encode(v_bild, 'base64'), E'\n', '');
end;
$$;

-- list_team_avatars: dazu die Kennung des Bildes, nur für Aktive.
drop function public.list_team_avatars();

create function public.list_team_avatars()
returns table (staff_member_id uuid, color text, picture_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();

  return query
  select sm.id, coalesce(c.color, 'schiefer'),
         case when sm.employment_status = 'active' then p.id end
  from public.staff_members sm
  left join public.staff_colors c on c.staff_member_id = sm.id
  left join public.staff_profile_pictures p on p.staff_member_id = sm.id
  where sm.organization_id = v_org
  order by sm.id;
end;
$$;

revoke all on function public.set_own_profile_picture(text) from public, anon;
revoke all on function public.remove_own_profile_picture() from public, anon;
revoke all on function public.get_team_profile_picture(uuid) from public, anon;
revoke all on function public.list_team_avatars() from public, anon;
grant execute on function public.set_own_profile_picture(text) to authenticated;
grant execute on function public.remove_own_profile_picture() to authenticated;
grant execute on function public.get_team_profile_picture(uuid) to authenticated;
grant execute on function public.list_team_avatars() to authenticated;

comment on function public.set_own_profile_picture(text) is
  'TEAM-007 (ADR-017 Abschnitt O): das eigene Profilbild setzen oder ersetzen - Base64 eines JPEG 256 × 256 ohne Metadaten; das alte fällt mit Löschjournal. Liefert die Kennung des neuen Bildes.';
comment on function public.remove_own_profile_picture() is
  'TEAM-007 (ADR-017 Abschnitt O): das eigene Profilbild entfernen, mit Löschjournal. Liefert, ob eines da war.';
comment on function public.get_team_profile_picture(uuid) is
  'TEAM-007 (ADR-017 Abschnitt O): ein Profilbild der eigenen Praxis als Base64, nur von aktiven Personen.';
comment on function public.list_team_avatars() is
  'TEAM-006, TEAM-007: Farbe und Kennung des Profilbilds je Mitarbeiterdatensatz der eigenen Praxis, für alle, die am Teamchat teilnehmen. Ausgeschiedene ohne Bild.';

-- -----------------------------------------------------------------------------
-- 6. Wiederherstellung (ADR-008 Punkt 8): + staff_profile_pictures
--
-- Aus 20261212100000_team_003_teamchat_anhaenge.sql (jüngste Fassung); neu ist
-- nur 'staff_profile_pictures' vor den Beschäftigtendaten.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reapply_deletion_journal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reihenfolge text[] := array[
    'invoice_payment_reminders',
    'invoice_cancellations',
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'patient_files',
    -- Vor Grundlage und Termin: ein Eintrag zeigt auf beide (on delete set
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird
    -- (PRX-001, Zweitreview 5).
    'waitlist_entries',
    -- PRX-012: eine Aufgabe zeigt auf Person und Mitarbeitende (cascade
    -- beziehungsweise set null) - geloescht wird sie vorher.
    'tasks',
    -- TRN-009: das Trainingsprotokoll haengt am Termin (restrict) und faellt
    -- vor ihm - dieselbe Reihenfolge wie im Lauf.
    'training_protocols',
    -- PRX-014: der Anrufstand haengt am Termin und faellt vor ihm.
    'appointment_call_states',
    -- POR-009: ein Terminwunsch zeigt auf Termin (set null) und Verhaeltnis
    -- (cascade) - geloescht wird er vorher.
    'platform_appointment_requests',
    -- KOM-005: ein Anhang haengt am Vorgang (cascade) und faellt vor ihm.
    'platform_message_attachments',
    -- KOM-001: ein Vorgang zeigt auf Plan, Uebung (set null) und Akte
    -- (cascade); seine Eintraege fallen mit ihm.
    'platform_messages',
    -- FLT-001: die Radflotte haengt an keiner Akte. Schluessel und Sperren
    -- vor den Pannen (eine Sperre zeigt auf ihre Panne, set null); einzeln
    -- geloeschte Fotos vor Check-Up und Panne, deren Stellen und uebrige
    -- Fotos mit ihnen fallen (cascade); das ausgemusterte Rad zuletzt.
    'fleet_key_handovers',
    'fleet_blocks',
    'fleet_photos',
    'fleet_checkups',
    'fleet_breakdowns',
    'fleet_bikes',
    -- URL-001: Storno und Abwesenheiten in den Arbeitszeiten fallen mit ihrem
    -- Urlaub (cascade).
    'staff_leave_requests',
    'staff_leave_entitlements',
    -- AZ-001: Arbeitszeitaenderungen haengen an keiner anderen Zeile.
    'staff_working_time_requests',
    -- ZK-001: ein Eintrag im Zeitkonto; seine Abweichung faellt mit ihm
    -- (cascade).
    'staff_time_account_entries',
    -- ERS-001: einzeln verworfene Belege vor ihrem Antrag; eine Erstattung
    -- nimmt ihre übrigen Belege mit (cascade), deren Objekte über den
    -- Löschauftrag.
    'staff_reimbursement_receipts',
    'staff_reimbursements',
    -- ORG-006: Rückmeldungen von Beschäftigten hängen an keiner anderen Zeile.
    'staff_feedback',
    -- TEAM-007: ein Profilbild hängt an keiner anderen Zeile; entfernt,
    -- ersetzt oder mit dem Ausscheiden gefallen, bleibt es fort.
    'staff_profile_pictures',
    -- TEAM-003: einzeln verworfene, nie gesendete Anhänge (ANN-652) vor den
    -- Nachrichten; gesendete fallen mit ihrer Nachricht (cascade) oder ihrem
    -- Inhalt (Auslöser), ihre Objekte über den Löschauftrag.
    'team_message_attachments',
    -- TEAM-001: erst geleerte Inhalte (die Zeile bleibt als Anker), dann
    -- Nachrichten vor ihren Gesprächen; Antworten, Erwähnungen und Lesestand
    -- fallen mit (cascade).
    'team_message_contents',
    'team_messages',
    'team_channels',
    -- ERN-001: das Ernährungsprofil vor seinem Verhältnis; Einwilligung und
    -- Gewicht fallen mit ihm (cascade).
    'nutrition_profiles',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- TRN-EPIC-003 (Zweitreview): Kontaktdaten des Trainings aus der
    -- Teilloeschung. Ihr Schluessel ist das Verhaeltnis, nicht `id`.
    'training_contact_details',
    -- TRN-005: die Vereinbarung nach ihren Terminen (on delete set null) und
    -- vor ihrem Verhaeltnis (restrict) - dieselbe Reihenfolge wie im Lauf
    -- (app.delete_training_relationship). Fehlte seit CAL-026.
    'training_bases',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations',
    -- POR-002: der Zugang mit seinen Einladungen (on delete cascade) und das
    -- Konto beim Anmeldedienst. `auth_users` ist kein Tabellenname in
    -- public, sondern die eine Ausnahme unten.
    'platform_accesses',
    'auth_users'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Das Konto einer Plattform liegt beim Anmeldedienst (ADR-023 Punkt 5).
    -- ABN-011 (BEF-115): auch hier ueber die Admin-API. Was nach dem Restore
    -- wieder da ist, verliert sofort jeden Zugang und bekommt einen
    -- Loeschauftrag. Als erneut angewandt gilt der Journaleintrag erst mit
    -- der Bestaetigung (confirm_platform_account_deletion, Zweitreview B1).
    if v_tabelle = 'auth_users' then
      update public.platform_accesses a
         set status = 'revoked',
             revoked_at = coalesce(a.revoked_at, now()),
             revoked_by = null,
             revoked_reason = 'account_deleted',
             locked_at = null,
             locked_by = null
       where a.account_user_id = any (v_ids) and a.status <> 'revoked';

      perform app.order_platform_account_deletion(
        j.target_id, j.organization_id, null, j.due_at, 'reapply')
      from public.deletion_journal j
      join auth.users u on u.id = j.target_id
      where j.target_table = 'auth_users'
        and j.target_id = any (v_ids);
      v_geloescht := null;
    -- TEAM-001: Nur der Inhalt fiel (Anker mit Antworten) - leeren, nicht
    -- löschen, sonst nähme cascade die Antworten mit. Wer entfernt hat, steht
    -- nach einem Restore nicht mehr fest; der Anker heißt dann „gelöscht“.
    elsif v_tabelle = 'team_message_contents' then
      delete from public.team_message_mentions where message_id = any (v_ids);
      with g as (
        update public.team_messages
           set body = null, edited_at = null, author_staff_member_id = null,
               removed_at = coalesce(removed_at, now()),
               removed_kind = coalesce(removed_kind, 'author')
         where id = any (v_ids) and body is not null
        returning id
      )
      select array_agg(id) into v_geloescht from g;
    else
    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where %I = any($1) returning %I as id) select array_agg(id) from g',
      v_tabelle,
      app.deletion_key_column(v_tabelle),
      app.deletion_key_column(v_tabelle)
    )
    into v_geloescht
    using v_ids;
    end if;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  -- ORG-006 (Nachprüfung N2): Anonyme Rückmeldungen schreibt der Lauf mit
  -- neuer Kennung neu - ein älteres Backup trägt andere Kennungen als das
  -- Journal. Was nach dem Restore über der Frist liegt, fällt hier nach der
  -- Regel selbst, nicht erst im nächsten Lauf.
  delete from public.staff_feedback f
  using public.organizations o
  where o.id = f.organization_id
    and app.retention_due_at(
          (f.month + interval '1 month' - interval '1 day')::date,
          app.retention_interval('rueckmeldung'),
          o.time_zone
        ) <= now();

  -- TEAM-001: Fällige Ausgangsnachrichten mit laufenden Antworten verlieren
  -- ihren Inhalt nach der Regel, nicht über das Journal (ANN-610).
  perform app.strip_due_team_anchors(o.id, o.time_zone) from public.organizations o;

  -- TEAM-007: Ein Bild, das ein Restore zurückbringt, obwohl die Person
  -- inzwischen ausgeschieden ist, fällt nach der Regel (ANN-667).
  delete from public.staff_profile_pictures p
  using public.staff_members sm
  where sm.id = p.staff_member_id and sm.employment_status <> 'active';

  -- Die Wiederanwendung weist deletion_journal.reapplied_at nach (LOG-EPIC-001).

  return v_gesamt;
end;
$function$;
