-- =============================================================================
-- Dateiablage der Patientenakte: Ablegen, Anzeigen, Ausliefern (DAT-001)
--
-- Setzt ADR-017 um. Der ADR ist am 2026-09-12 angenommen; diese Migration
-- nimmt sich keine Spielraeume, die er nicht laesst.
--
-- DIE DATENBANK FUEHRT, DER BUCKET FOLGT (ADR-017 Abschnitt B).
--   patient_files          eine Zeile je Datei. Diese Zeile ist die Wahrheit.
--                          Ein Objekt ohne Zeile ist Abfall, eine Zeile ohne
--                          Objekt ist ein Fehler (Punkt 27, DAT-003).
--   storage.buckets        genau ein privater Bucket 'patientenakte' - der
--                          Bucket je Datenklasse aus Punkt 3. Der Bucket fuer
--                          Abrechnungsbelege entsteht mit ABR-EPIC-002b, nicht
--                          hier (ADR-014: nichts auf Vorrat).
--   storage_deletion_orders  der Loeschauftrag fuer das Objekt. Eine
--                          Datenbankfunktion kann kein Objekt loeschen; der
--                          Auftrag ueberbrueckt das nachweisbar (Punkt 25).
--
-- DER UPLOAD LAEUFT IN ZWEI PHASEN MIT BESTAETIGUNG (Punkt 7):
--   (a) prepare_patient_file_upload  legt die Zeile 'pending' an und leitet den
--       Objektschluessel ab. HIER wird die Berechtigung geprueft, BEVOR Bytes
--       fliessen.
--   (b) der Browser laedt unter genau diesem Schluessel hoch. Die Policy auf
--       storage.objects laesst nur einen Schluessel zu, zu dem eine
--       'pending'-Zeile mit Schreibrecht existiert.
--   (c) confirm_patient_file_upload prueft Groesse und MIME-Typ gegen das, was
--       die Storage-API tatsaechlich abgelegt hat, und setzt 'ready'. Nur
--       'ready' ist sichtbar und verweisfaehig.
--
-- DER OBJEKTSCHLUESSEL TRAEGT NUR KENNUNGEN (Punkt 5):
--   <organization_id>/<bezugsdatensatz_id>/<datei_id> - ohne Endung, ohne
--   Namen, ohne Datum. Er steht in URLs, Fehlermeldungen und Anbieterlogs, die
--   wir nicht filtern (ADR-011). Deshalb ist er eine generierte Spalte: er kann
--   gar nicht erst falsch geschrieben werden.
--
-- DER OBJEKTSCHLUESSEL VERLAESST DIE DATENBANK NUR UEBER EINEN AUDITIERTEN
-- VORGANG (ANN-052). list_patient_files liefert ihn nicht. Wer eine Datei
-- oeffnen will, ruft issue_patient_file_link - und genau dort entsteht
-- 'patient_file.link_issued'. Ohne den Schluessel hilft die Leseberechtigung
-- auf storage.objects niemandem: er ist nicht erratbar.
--
-- WAS DIE BESTAETIGUNG PRUEFEN KANN UND WAS NICHT (ANN-053): Groesse und
-- MIME-Typ stehen in storage.objects.metadata, das die Storage-API selbst
-- schreibt - sie sind pruefbar. Die SHA-256-Pruefsumme rechnet der Browser; die
-- Datenbank sieht die Bytes nie und kann sie nicht nachrechnen. Sie ist damit
-- eine festgehaltene Erklaerung und wird erst gegen eine zweite Messung zum
-- Nachweis (Punkt 9).
--
-- DATENKLASSE (ADR-008, Punkt 23): patient_files gehoert zur Klasse
-- 'patientenakte' und faellt mit der Akte. Die Zeile faellt per Kaskade, das
-- Objekt ueber den Loeschauftrag aus dem Trigger unten - auf jedem Loeschweg,
-- auch dem, den es heute noch nicht gibt.
--
-- BEWUSST NICHT ENTHALTEN:
--   * Virenpruefung (Punkt 28: in V1 nicht, Pflicht ab dem ersten Upload von
--     aussen - dann mit eigenem ADR).
--   * Ein Teilen-Link (Punkt 17: ein signierter Verweis ist nicht widerrufbar).
--   * Uploads durch Patient:innen (Punkt 14: es gibt kein Portal).
--   * Dokumentarten der Abrechnung ('rechnung', 'kostenvoranschlag'): sie
--     kommen mit ihrem Bucket in ABR-EPIC-002b.
--   * Texterkennung auf dem Scan (IDEA-PRX-023 Stufe 2, ADR-005).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Der Bucket
--
-- Privat, mit doppelt durchgesetzter Allowlist (Punkt 18): am Bucket und noch
-- einmal bei der Bestaetigung. SVG und HTML fehlen mit Absicht - sie tragen
-- Skript und wuerden auf der Domaene des Anbieters ausgeliefert.
--
-- In der Wegwerf-Datenbank der Tests legt der Shim storage.buckets an; in
-- Supabase existiert die Tabelle bereits. Beide Wege enden hier.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patientenakte',
  'patientenakte',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create or replace function app.patient_file_bucket()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'patientenakte'::text
$$;

comment on function app.patient_file_bucket() is
  'Name des privaten Buckets der Patientenakte (ADR-017 Punkt 3). Die einzige Stelle, an der er steht.';

create or replace function app.patient_file_max_bytes()
returns bigint
language sql
immutable
set search_path = ''
as $$
  select 10485760::bigint
$$;

comment on function app.patient_file_max_bytes() is
  'Groesse je Datei, hoechstens 10 MB (ADR-017 Punkt 18). Muss mit dem Limit am Bucket uebereinstimmen.';

-- -----------------------------------------------------------------------------
-- Katalog der Dokumentarten
--
-- Punkt 12: Jede Datei traegt eine Dokumentart aus festem Katalog, und die Art
-- bestimmt den Rollenschnitt. Keine freie Eingabe, keine Datei ohne Art.
--
-- Der Rollenschnitt steht als DATEN in is_clinical, nicht als zweite Liste im
-- Funktionscode - dieselbe Ueberlegung wie beim Retention Schedule (ANN-001).
-- Die deutschen Beschriftungen liegen in src/features/files/dokumentarten.ts;
-- ein Test haelt beide Listen deckungsgleich, damit die SQL-Dateien wie alle
-- uebrigen frei von Umlauten bleiben.
--
-- Warum der Verordnungsscan klinisch ist, obwohl 'office' die Verordnung
-- organisatorisch sieht (ANN-011, Punkt 12): Ein Scan laesst sich nicht
-- projizieren. Er zeigt das ganze Blatt einschliesslich Diagnose. Eine Datei
-- folgt immer dem strengsten Teil ihres Inhalts.
-- -----------------------------------------------------------------------------
create table public.patient_file_document_types (
  key         text primary key check (key ~ '^[a-z_]+$'),
  is_clinical boolean not null,
  sort_order  smallint not null default 100,
  note        text not null check (length(btrim(note)) between 1 and 500)
);

comment on table public.patient_file_document_types is
  'Fester Katalog der Dokumentarten (ADR-017 Punkt 12). is_clinical ist der Rollenschnitt: klinisch sehen owner/therapist/team_lead, organisatorisch zusaetzlich office. Datenklasse: Konfiguration, kein Personenbezug.';
comment on column public.patient_file_document_types.is_clinical is
  'true: die Datei kann Gesundheitsdaten zeigen und ist fuer office unsichtbar. Eine falsch gewaehlte Art ist eine Offenlegung nach PROJECT_PRINCIPLES.md 13, kein Schoenheitsfehler.';

insert into public.patient_file_document_types (key, is_clinical, sort_order, note) values
  ('verordnungsscan', true,  10,
   'Foto oder Scan des Verordnungsblatts (VER-004). Klinisch, weil das Blatt die Diagnose zeigt und ein Bild sich nicht projizieren laesst (ANN-011).'),
  ('befund',          true,  20,
   'Befund einer aerztlichen oder therapeutischen Untersuchung.'),
  ('arztbrief',       true,  30,
   'Schreiben einer aerztlichen Stelle zur Patientin oder zum Patienten.'),
  ('klinisches_bild', true,  40,
   'Bildgebung oder Aufnahme mit klinischer Aussage. Fotos und Videos von Patient:innen sind davon nicht erfasst - sie brauchen eigene Einwilligung und eigene Frist (ADR-017 Punkt 30).'),
  ('einwilligung',    false, 50,
   'Unterschriebene Einwilligung oder Datenschutzinformation. Organisatorisch: office sieht sie.'),
  ('vertrag',         false, 60,
   'Behandlungsvertrag und vergleichbare Vereinbarungen. Organisatorisch: office sieht sie.');

alter table public.patient_file_document_types enable row level security;

grant select on public.patient_file_document_types to authenticated;

create policy patient_file_document_types_select_staff
  on public.patient_file_document_types for select to authenticated
  using (app.is_staff());

-- -----------------------------------------------------------------------------
-- patient_files
--
-- Kein Tabellenrecht und keine Policy - dasselbe Muster wie prescriptions und
-- treatment_notes. Die Tabelle traegt mit Anzeigename und Dokumentart Angaben,
-- die rollenabhaengig projiziert werden muessen (ADR-004); ein Tabellenrecht
-- wuerde diese Trennung an genau einer Stelle aushebeln. Erreichbar ist sie
-- ausschliesslich ueber die Funktionen weiter unten.
--
-- UNVERAENDERLICH (Punkt 8): Es gibt keinen Weg, Inhalt, Groesse, Pruefsumme
-- oder Schluessel einer bestaetigten Datei zu aendern - weder in der Datenbank
-- (kein UPDATE-Recht, kein UPDATE-Pfad ausser dem Zustandswechsel) noch im
-- Objektspeicher (keine UPDATE-Policy auf storage.objects). Eine berichtigte
-- Fassung ist eine neue Datei; das Ersetzen kommt mit DAT-002.
--
-- Die Kaskaden sind Absicht: Faellt die Akte, fallen die Dateien; faellt eine
-- Verordnung, faellt ihr Scan - wie ihre Positionen. Der Trigger unten sorgt
-- dafuer, dass auf jedem dieser Wege ein Loeschauftrag fuer das Objekt
-- entsteht. Kaskaden bekommen keine eigene Zeile im Loeschjournal (LOE-002a);
-- den Nachweis fuer das Objekt fuehrt die Quittung (Punkt 25).
-- -----------------------------------------------------------------------------
create table public.patient_files (
  id               uuid primary key default extensions.gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  patient_id       uuid not null references public.patients (id) on delete cascade,
  prescription_id  uuid references public.prescriptions (id) on delete cascade,
  document_type    text not null references public.patient_file_document_types (key) on delete restrict,
  display_name     text not null check (length(btrim(display_name)) between 1 and 200),
  mime_type        text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size        bigint not null check (byte_size > 0 and byte_size <= 10485760),
  checksum_sha256  text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status           text not null default 'pending' check (status in ('pending', 'ready')),
  uploaded_by      uuid,
  created_at       timestamptz not null default now(),
  confirmed_at     timestamptz,

  object_key       text not null generated always as (
                     organization_id::text || '/'
                     || coalesce(prescription_id, patient_id)::text || '/'
                     || id::text
                   ) stored,

  -- 'ready' und Bestaetigungszeitpunkt gehoeren zusammen: es gibt keine
  -- sichtbare Datei ohne serverseitige Bestaetigung (Punkt 7c).
  constraint patient_files_ready_has_confirmation check (
    (status = 'ready') = (confirmed_at is not null)
  ),

  -- Punkt 10: Jede Datei haengt an einem Bezugsdatensatz. Der Scan haengt an
  -- der Verordnung, sonst waere er ein Blatt ohne Auftrag.
  constraint patient_files_scan_belongs_to_prescription check (
    document_type <> 'verordnungsscan' or prescription_id is not null
  )
);

comment on table public.patient_files is
  'Dateien der Patientenakte (ADR-017). Die Zeile fuehrt, das Objekt folgt. Datenklasse: patientenakte, zehn Jahre nach Abschluss der Versorgung (ADR-008 Punkt 4). Kein Tabellenrecht, keine Policy: erreichbar nur ueber die Funktionen dieser Migration.';
comment on column public.patient_files.object_key is
  'Objektschluessel nach ADR-017 Punkt 5 - nur Kennungen, keine Endung, kein Name. Generiert, damit er nicht falsch geschrieben werden kann. Verlaesst die Datenbank ausschliesslich ueber prepare_patient_file_upload und issue_patient_file_link (ANN-052).';
comment on column public.patient_files.checksum_sha256 is
  'SHA-256 der hochgeladenen Bytes, im Browser gerechnet. Die Datenbank sieht die Bytes nie und kann die Summe nicht nachrechnen - sie ist eine festgehaltene Erklaerung, kein serverseitig erhobener Messwert (ANN-053, ADR-017 Punkt 9).';
comment on column public.patient_files.status is
  'pending: Zeile angelegt, Objekt noch nicht bestaetigt. ready: Groesse und MIME-Typ gegen storage.objects geprueft. Nur ready ist sichtbar und verweisfaehig (ADR-017 Punkt 7).';

create index patient_files_patient_idx
  on public.patient_files (patient_id, created_at desc);
create index patient_files_prescription_idx
  on public.patient_files (prescription_id)
  where prescription_id is not null;
create unique index patient_files_object_key_idx
  on public.patient_files (object_key);
create index patient_files_pending_idx
  on public.patient_files (created_at)
  where status = 'pending';

alter table public.patient_files enable row level security;
revoke all on public.patient_files from anon, authenticated;

-- -----------------------------------------------------------------------------
-- storage_deletion_orders
--
-- Punkt 25: Loeschen ist zweistufig und selbst nachweispflichtig. Die Zeile
-- faellt in der Datenbank; fuer das Objekt entsteht ein Auftrag, den ein
-- angemeldeter Vorgang ausfuehrt und quittiert. Erst die Quittung schliesst die
-- Loeschung ab.
--
-- Warum nicht einfach eine Edge Function: Sie ist fuer produktive
-- Gesundheitsdaten nach ADR-015 Punkt 20 nicht freigegeben. Warum nicht
-- stillschweigend: Ein offener Auftrag ist ein noch nicht geloeschtes Objekt
-- und gehoert sichtbar in den monatlichen Bericht (ADR-010 Punkt 6).
--
-- Der Auftrag traegt den Objektschluessel, also Kennungen ohne Namen und ohne
-- Inhalt - nach der Loeschung ein Schluessel ohne Schloss, genau wie das
-- Loeschjournal (ANN-031). Er muss den Restore ueberleben (Punkt 26).
--
-- Ausgefuehrt und quittiert wird mit DAT-002.
-- -----------------------------------------------------------------------------
create table public.storage_deletion_orders (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  bucket_id       text not null check (length(btrim(bucket_id)) between 1 and 100),
  object_key      text not null check (length(btrim(object_key)) between 1 and 500),
  ordered_at      timestamptz not null default now(),
  receipted_at    timestamptz,
  receipted_by    uuid,

  constraint storage_deletion_orders_receipt_complete check (
    (receipted_at is null) = (receipted_by is null)
  )
);

comment on table public.storage_deletion_orders is
  'Loeschauftraege fuer Objekte im Objektspeicher (ADR-017 Punkt 25). Offen bedeutet: die Zeile ist weg, das Objekt noch nicht. Die Quittung schliesst die Loeschung ab. Datenklasse: Loeschjournal, ohne eigene Frist (ANN-031) - er muss den Restore ueberleben.';

-- Ein offener Auftrag je Objekt. Erledigte Auftraege bleiben als Nachweis
-- stehen, deshalb ist der Index partiell.
create unique index storage_deletion_orders_open_idx
  on public.storage_deletion_orders (bucket_id, object_key)
  where receipted_at is null;
create index storage_deletion_orders_org_idx
  on public.storage_deletion_orders (organization_id, ordered_at);

alter table public.storage_deletion_orders enable row level security;
revoke all on public.storage_deletion_orders from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Der Trigger, der keinen Loeschweg auslaesst
--
-- Jede geloeschte Zeile hinterlaesst einen Auftrag - egal ob der Loeschlauf,
-- eine Kaskade aus der Verordnung, der Vorgang aus DAT-002 oder ein Weg, den
-- es heute noch nicht gibt, sie geloescht hat. Genau das ist der Unterschied
-- zwischen "wir denken beim Loeschen daran" und "das Objekt kann gar nicht
-- verwaisen".
--
-- Kein Auftrag ohne Objekt: Eine 'pending'-Zeile, deren Upload nie ankam, hat
-- nichts zu loeschen. Sonst stuende in der Liste Arbeit, die keine ist.
-- -----------------------------------------------------------------------------
create function app.order_patient_file_object_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from storage.objects o
    where o.bucket_id = app.patient_file_bucket()
      and o.name = old.object_key
  ) then
    insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
    values (old.organization_id, app.patient_file_bucket(), old.object_key)
    on conflict do nothing;
  end if;

  return old;
end;
$$;

comment on function app.order_patient_file_object_deletion() is
  'Schreibt beim Loeschen einer Dateizeile den Loeschauftrag fuer ihr Objekt (ADR-017 Punkt 25). Haengt am Trigger, damit kein Loeschweg daran vorbeikommt.';

create trigger patient_files_order_object_deletion
  after delete on public.patient_files
  for each row execute function app.order_patient_file_object_deletion();

-- -----------------------------------------------------------------------------
-- Retention (ADR-008, ADR-017 Punkt 23)
--
-- Die Datei erbt die Datenklasse ihres Bezugsdatensatzes. Keine Datei ohne
-- Klasse - supabase/tests/retention.test.ts prueft die Vollstaendigkeit gegen
-- pg_tables.
--
-- deletion_mode 'ueber_elterndatensatz': Die Zeile faellt per Kaskade mit der
-- Akte beziehungsweise mit der Verordnung. Der Legal Hold der Patient:in
-- erfasst die Dateien damit automatisch mit (Punkt 24, ANN-033) - es gibt
-- keinen zweiten Mechanismus fuer dieselbe Frage.
-- -----------------------------------------------------------------------------
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values

  ('patient_files', 'patientenakte', 'ueber_elterndatensatz',
   'Dateien der Akte einschliesslich Verordnungsscan. Fallen mit der Akte oder mit ihrer Verordnung (FK on delete cascade). Das Objekt folgt ueber einen Loeschauftrag mit Quittung (ADR-017 Punkt 25).', 35),

  ('storage_deletion_orders', 'loeschjournal', 'keine',
   'Loeschauftraege und ihre Quittungen. Zusammen mit dem Loeschjournal der Nachweis, dass auf beiden Speichern geloescht wurde (ADR-017 Punkt 25 und 26); ohne eigene Frist (ANN-031).', 115),

  ('patient_file_document_types', 'konfiguration', 'keine',
   'Katalog der Dokumentarten samt Rollenschnitt.', 260);

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010, ADR-017 Punkt 20)
--
-- Drei Ereignisse: hochgeladen, Verweis ausgestellt, geloescht. Das dritte
-- entsteht mit DAT-002, steht aber schon hier, weil der Katalog eine Liste ist
-- und keine Chronik.
--
-- Der Eintrag traegt Datei- und Patientenkennung, Dokumentart und Zeitpunkt -
-- nie den Anzeigenamen, nie den Objektschluessel, nie Inhalt.
--
-- PROTOKOLLIERT WIRD DIE AUSSTELLUNG DES VERWEISES, NICHT DAS LADEN DER DATEI
-- (Punkt 21). Die Anfrage am Objekt laeuft zwischen Browser und Anbieter; die
-- Anwendung sieht sie nicht. Wer den Verweis erzeugt hat, HATTE den Zugriff -
-- ob Bytes geflossen sind, steht nicht fest. Das gehoert so in die DSFA.
--
-- Das Auflisten der Dateien einer Akte ist bewusst KEIN Ereignis (Punkt 22):
-- Das Oeffnen der Akte ist bereits auditiert, und ADR-010 waegt genauso ab
-- ("Detailansicht ja, Trefferliste nein").
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; ein Datenbanktest prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'patient_record.viewed',
    'audit_log.read',
    'patient.created',
    'patient.updated',
    'patient.status_changed',
    'patient.care_concluded',
    'patient.care_reopened',
    'legal_hold.placed',
    'legal_hold.released',
    'retention.applied',
    'retention.reapplied',
    'appointment.created',
    'appointment.updated',
    'appointment.rescheduled',
    'appointment.cancelled',
    'appointment.no_show',
    'appointment.completed',
    'appointment.documented',
    'appointment.reopened',
    'appointment.notified',
    'organization.appointment_grid_changed',
    'organization.documentation_deadline_changed',
    'staff_working_hours.created',
    'staff_working_hours.updated',
    'staff_working_hours.removed',
    'staff_working_hour_exception.created',
    'staff_working_hour_exception.updated',
    'staff_working_hour_exception.removed',
    'staff_member.created',
    'staff_member.updated',
    'staff_member.status_changed',
    'staff_account.invited',
    'staff_account.invitation_revoked',
    'staff_account.invitation_accepted',
    'staff_account.roles_changed',
    'staff_account.locked',
    'staff_account.unlocked',
    'staff_account.password_reset_requested',
    'account.password_changed',
    'account.sessions_ended',
    'account.mfa_enrolled',
    'account.mfa_removed',
    'treatment_note.created',
    'treatment_note.updated',
    'treatment_note.viewed',
    'treatment_note.finalized',
    'treatment_note.auto_finalized',
    'treatment_note.revised',
    'treatment_note.addendum_created',
    'treatment_note.history_viewed',
    'prescription.viewed',
    'prescription.created',
    'prescription.updated',
    'prescription.deleted',
    'patient_file.uploaded',
    'patient_file.link_issued',
    'patient_file.deleted',
    'text_snippet.created',
    'text_snippet.updated',
    'text_snippet.deleted'
  ));

alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member',
    'treatment_note',
    'prescription',
    'patient_file'
  ));

-- -----------------------------------------------------------------------------
-- Berechtigungen (ADR-017 Punkt 12 und 13, ADR-004)
--
-- Vier Funktionen statt einer, weil sie vier verschiedene Fragen beantworten
-- und sich einzeln aendern koennen sollen:
--
--   lesen, organisatorisch  alle Praxisrollen
--   lesen, klinisch         owner, therapist, team_lead - office nicht
--   schreiben, klinisch     owner, therapist, team_lead
--   schreiben, organisat.   alle Praxisrollen; office pflegt Einwilligung und
--                           Vertrag an den Stammdaten, und Punkt 13 bindet das
--                           Hochladen an das Schreibrecht am Bezugsdatensatz
--
-- Patient:innen kommen in keiner dieser Funktionen vor. Sie laden in V1 nichts
-- hoch und sehen nichts (Punkt 14) - es gibt kein Portal, und diese Migration
-- baut keines vor.
-- -----------------------------------------------------------------------------
create or replace function app.can_read_patient_files()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

create or replace function app.can_read_clinical_patient_files()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead')
$$;

create or replace function app.can_write_clinical_patient_files()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead')
$$;

create or replace function app.can_write_organisational_patient_files()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

comment on function app.can_read_clinical_patient_files() is
  'Wer klinische Dateien sehen darf (ADR-017 Punkt 12). office ist bewusst nicht dabei: ein Scan zeigt das ganze Blatt (ANN-011).';

-- Ist diese Dokumentart klinisch? Liest den Katalog, damit der Rollenschnitt
-- nicht ein zweites Mal als Liste im Code steht.
create or replace function app.patient_file_type_is_clinical(p_document_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select t.is_clinical
  from public.patient_file_document_types t
  where t.key = p_document_type
$$;

-- Darf die aufrufende Person eine Datei dieser Art sehen?
-- Eine unbekannte Art liefert null und damit "nein" - deny-by-default bis in
-- die Hilfsfunktion.
create or replace function app.can_see_patient_file_type(p_document_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case
      when app.patient_file_type_is_clinical(p_document_type)
        then app.can_read_clinical_patient_files()
      else app.can_read_patient_files()
    end,
    false
  )
$$;

-- Darf die aufrufende Person eine Datei dieser Art an diesem Bezugsdatensatz
-- anlegen oder loeschen? Punkt 13: Das folgt dem SCHREIBRECHT am
-- Bezugsdatensatz, nicht dem Leserecht an der Datei. Haengt die Datei an einer
-- Verordnung, gilt zusaetzlich das Schreibrecht an Verordnungen - die
-- strengere der beiden Bedingungen gewinnt.
create or replace function app.can_write_patient_file(
  p_document_type   text,
  p_prescription_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case
      when app.patient_file_type_is_clinical(p_document_type)
        then app.can_write_clinical_patient_files()
      else app.can_write_organisational_patient_files()
    end,
    false
  )
  and (p_prescription_id is null or app.can_write_prescriptions())
$$;

comment on function app.can_write_patient_file(text, uuid) is
  'Schreibrecht an einer Datei nach ADR-017 Punkt 13: Dokumentart plus, bei einer Datei an der Verordnung, das Schreibrecht an Verordnungen.';

-- Ist diese Patientin fuer die aufrufende Person ueberhaupt erreichbar?
-- Ohne diese Pruefung waeren die SECURITY-DEFINER-Funktionen unten ein Orakel
-- fuer fremde Patientenkennungen (PROJECT_PRINCIPLES.md 13).
create or replace function app.patient_file_organization(p_patient_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = app.current_organization_id()
    and app.can_read_patient_directory()
$$;

grant execute on function app.patient_file_bucket() to authenticated;
grant execute on function app.patient_file_max_bytes() to authenticated;
grant execute on function app.can_read_patient_files() to authenticated;
grant execute on function app.can_read_clinical_patient_files() to authenticated;
grant execute on function app.can_write_clinical_patient_files() to authenticated;
grant execute on function app.can_write_organisational_patient_files() to authenticated;
grant execute on function app.patient_file_type_is_clinical(text) to authenticated;
grant execute on function app.can_see_patient_file_type(text) to authenticated;
grant execute on function app.can_write_patient_file(text, uuid) to authenticated;
grant execute on function app.patient_file_organization(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS auf storage.objects (ADR-017 Punkt 11, ADR-004 Punkt 5 und 6)
--
-- Die zweite Verteidigungslinie, und im Objektspeicher die einzige, die zur
-- Laufzeit greift: Der Browser spricht fuer Upload und Download direkt mit der
-- Storage-API, nicht ueber eine unserer Funktionen. Deshalb duerfen diese
-- Policies keine abgeschwaechte Fassung der Fachregeln sein - sie leiten sich
-- aus denselben app.can_*-Funktionen ab.
--
-- Vier Policies waeren moeglich, es gibt drei:
--   insert  nur zu einer 'pending'-Zeile mit Schreibrecht
--   select  nur zu einer 'ready'-Zeile mit Leserecht der Dokumentart
--   delete  nur zu einem offenen Loeschauftrag (DAT-002)
--   update  GIBT ES NICHT. Punkt 8: Dateien sind unveraenderlich. Ohne
--           UPDATE-Policy laeuft auch ein 'upsert: true' des Clients ins Leere.
--
-- Der service_role-Schluessel erreicht niemals den Browser (Punkt 11); er
-- umgeht RLS und ist deshalb kein Bestandteil dieses Wegs.
-- -----------------------------------------------------------------------------
create or replace function app.may_upload_patient_file_object(p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_files f
    where f.object_key = p_object_key
      and f.status = 'pending'
      and f.organization_id = app.current_organization_id()
      and app.can_write_patient_file(f.document_type, f.prescription_id)
  )
$$;

create or replace function app.may_read_patient_file_object(p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_files f
    where f.object_key = p_object_key
      and f.status = 'ready'
      and f.organization_id = app.current_organization_id()
      and app.can_see_patient_file_type(f.document_type)
  )
$$;

comment on function app.may_read_patient_file_object(text) is
  'Traegt die Leseregel der Dateiablage in die Policy auf storage.objects (ADR-017 Punkt 11). Keine zweite Rechtelogik, sondern dieselbe.';

grant execute on function app.may_upload_patient_file_object(text) to authenticated;
grant execute on function app.may_read_patient_file_object(text) to authenticated;

create policy patient_files_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = app.patient_file_bucket()
    and app.may_upload_patient_file_object(name)
  );

create policy patient_files_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = app.patient_file_bucket()
    and app.may_read_patient_file_object(name)
  );

-- -----------------------------------------------------------------------------
-- prepare_patient_file_upload - Phase (a)
--
-- Legt die Zeile an und liefert den Objektschluessel. Hier und nur hier wird
-- entschieden, ob diese Person diese Datei an diese Stelle legen darf; danach
-- ist der Schluessel festgelegt und die Policy auf storage.objects laesst genau
-- ihn zu.
--
-- Der Rueckgabewert enthaelt den Objektschluessel, weil der Browser ihn zum
-- Hochladen braucht. Das ist die eine von zwei Stellen, an denen er die
-- Datenbank verlaesst (ANN-052) - und sie ist an das Schreibrecht gebunden.
--
-- Kein Auditeintrag: Bis hierhin ist nichts hochgeladen. Der Eintrag entsteht
-- mit der Bestaetigung.
-- -----------------------------------------------------------------------------
create function public.prepare_patient_file_upload(
  p_patient_id      uuid,
  p_prescription_id uuid,
  p_document_type   text,
  p_display_name    text,
  p_mime_type       text,
  p_byte_size       bigint,
  p_checksum_sha256 text
)
returns table (file_id uuid, bucket_id text, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.patient_file_organization(p_patient_id);
  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patient_file_document_types t where t.key = p_document_type
  ) then
    raise exception 'unknown document type %', p_document_type using errcode = '22023';
  end if;

  -- Die Verordnung muss zu genau dieser Patientin in dieser Organisation
  -- gehoeren. Sonst haenge der Scan an einem fremden Auftrag - und traege
  -- dessen Frist.
  if p_prescription_id is not null and not exists (
    select 1
    from public.prescriptions pr
    where pr.id = p_prescription_id
      and pr.patient_id = p_patient_id
      and pr.organization_id = v_org
  ) then
    raise exception 'prescription not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(p_document_type, p_prescription_id) then
    raise exception 'not allowed to upload this document type' using errcode = '42501';
  end if;

  -- Allowlist und Groesse, erste von zwei Durchsetzungen (Punkt 18). Die
  -- zweite steht am Bucket; die dritte prueft bei der Bestaetigung gegen das,
  -- was tatsaechlich abgelegt wurde.
  if p_mime_type is null or p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'unsupported media type' using errcode = '22023';
  end if;

  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > app.patient_file_max_bytes() then
    raise exception 'file too large or empty' using errcode = '22023';
  end if;

  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid checksum' using errcode = '22023';
  end if;

  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 200 then
    raise exception 'invalid display name' using errcode = '22023';
  end if;

  insert into public.patient_files (
    organization_id, patient_id, prescription_id, document_type,
    display_name, mime_type, byte_size, checksum_sha256, uploaded_by
  )
  values (
    v_org, p_patient_id, p_prescription_id, p_document_type,
    btrim(p_display_name), p_mime_type, p_byte_size, p_checksum_sha256, v_actor
  )
  returning id into v_id;

  return query
    select f.id, app.patient_file_bucket(), f.object_key
    from public.patient_files f
    where f.id = v_id;
end;
$$;

comment on function public.prepare_patient_file_upload(uuid, uuid, text, text, text, bigint, text) is
  'Phase (a) des zweiphasigen Uploads (ADR-017 Punkt 7a): prueft die Berechtigung, bevor Bytes fliessen, und liefert den Objektschluessel.';

-- -----------------------------------------------------------------------------
-- confirm_patient_file_upload - Phase (c)
--
-- Ohne diesen Schritt waere "hochgeladen" eine Behauptung des Browsers
-- (Punkt 7). Geprueft wird gegen storage.objects.metadata - das schreibt die
-- Storage-API selbst, nicht der Client.
--
-- Was hier NICHT geprueft werden kann, ist die Pruefsumme: Die Datenbank sieht
-- die Bytes nie (ANN-053). Wer sie nachrechnen will, muss die Datei laden - das
-- ist ein Werkzeug fuer den Betrieb, keine Funktion dieser Anwendung.
-- -----------------------------------------------------------------------------
create function public.confirm_patient_file_upload(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_datei    record;
  v_metadata jsonb;
  v_groesse  bigint;
  v_mime     text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
  for update;

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(v_datei.document_type, v_datei.prescription_id) then
    raise exception 'not allowed to confirm this file' using errcode = '42501';
  end if;

  if v_datei.status <> 'pending' then
    raise exception 'file is not pending' using errcode = '22023';
  end if;

  select o.metadata into v_metadata
  from storage.objects o
  where o.bucket_id = app.patient_file_bucket()
    and o.name = v_datei.object_key;

  if not found then
    raise exception 'object was not uploaded' using errcode = '22023';
  end if;

  v_groesse := nullif(v_metadata ->> 'size', '')::bigint;
  v_mime    := nullif(v_metadata ->> 'mimetype', '');

  if v_groesse is distinct from v_datei.byte_size then
    raise exception 'uploaded size does not match the announced size' using errcode = '22023';
  end if;

  if v_mime is distinct from v_datei.mime_type then
    raise exception 'uploaded media type does not match the announced media type'
      using errcode = '22023';
  end if;

  if v_groesse > app.patient_file_max_bytes() then
    raise exception 'file too large' using errcode = '22023';
  end if;

  if v_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'unsupported media type' using errcode = '22023';
  end if;

  update public.patient_files
     set status = 'ready',
         confirmed_at = now()
   where id = p_file_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.uploaded', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type
    )
  );
end;
$$;

comment on function public.confirm_patient_file_upload(uuid) is
  'Phase (c) des zweiphasigen Uploads (ADR-017 Punkt 7c): prueft Groesse und MIME-Typ gegen storage.objects und macht die Datei sichtbar. Auditereignis patient_file.uploaded.';

-- -----------------------------------------------------------------------------
-- discard_patient_file_upload
--
-- Der Weg zurueck, wenn der Upload im Browser scheitert. Ohne ihn bliebe bei
-- jedem Abbruch eine unsichtbare 'pending'-Zeile stehen, bis der taegliche
-- Lauf sie nach 24 Stunden verwirft - und die Person haette keinen zweiten
-- Versuch unter demselben Namen.
--
-- Nur 'pending': Eine bestaetigte Datei wird geloescht, nicht verworfen
-- (DAT-002).
-- -----------------------------------------------------------------------------
create function public.discard_patient_file_upload(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_datei record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
    and f.status = 'pending';

  if not found then
    raise exception 'pending upload not accessible' using errcode = '42501';
  end if;

  if not app.can_write_patient_file(v_datei.document_type, v_datei.prescription_id) then
    raise exception 'not allowed to discard this upload' using errcode = '42501';
  end if;

  -- Der Trigger schreibt den Loeschauftrag, falls doch schon ein Objekt liegt.
  delete from public.patient_files where id = p_file_id;
end;
$$;

comment on function public.discard_patient_file_upload(uuid) is
  'Verwirft eine nicht bestaetigte Dateizeile nach einem abgebrochenen Upload (ADR-017 Punkt 7).';

-- -----------------------------------------------------------------------------
-- list_patient_files
--
-- Die rollenabhaengige Projektion (ADR-004). Zwei Dinge fehlen mit Absicht:
--
--   * der OBJEKTSCHLUESSEL. Er ist die Voraussetzung fuer einen signierten
--     Verweis; wer ihn hier bekaeme, koennte eine Datei ohne Auditeintrag
--     oeffnen (ANN-052).
--   * jede Datei einer Dokumentart, die die Rolle nicht sehen darf. Nicht
--     ausgegraut, nicht als "1 weitere Datei" gezaehlt - gar nicht. Eine
--     Zaehlung waere schon eine Aussage ueber den Inhalt der Akte.
--
-- object_missing beantwortet Punkt 27 an der einzelnen Datei: Ein Datensatz
-- ohne Objekt ist ein sichtbarer Fehler, keine leere Flaeche und kein stiller
-- Ausgleich (PROJECT_PRINCIPLES.md 13). Die Uebersicht dazu kommt mit DAT-003.
--
-- Kein Auditereignis (Punkt 22).
-- -----------------------------------------------------------------------------
create function public.list_patient_files(
  p_patient_id      uuid,
  p_prescription_id uuid default null
)
returns table (
  id               uuid,
  prescription_id  uuid,
  document_type    text,
  is_clinical      boolean,
  display_name     text,
  mime_type        text,
  byte_size        bigint,
  checksum_sha256  text,
  uploaded_at      timestamptz,
  uploaded_by_name text,
  object_missing   boolean
)
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

  v_org := app.patient_file_organization(p_patient_id);
  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  if not app.can_read_patient_files() then
    raise exception 'not allowed to read patient files' using errcode = '42501';
  end if;

  return query
    select f.id,
           f.prescription_id,
           f.document_type,
           t.is_clinical,
           f.display_name,
           f.mime_type,
           f.byte_size,
           f.checksum_sha256,
           f.confirmed_at,
           nullif(btrim(coalesce(pe.given_name, '') || ' ' || coalesce(pe.family_name, '')), ''),
           not exists (
             select 1
             from storage.objects o
             where o.bucket_id = app.patient_file_bucket()
               and o.name = f.object_key
           )
    from public.patient_files f
    join public.patient_file_document_types t on t.key = f.document_type
    left join public.user_profiles up on up.id = f.uploaded_by
    left join public.persons pe on pe.id = up.person_id
    where f.patient_id = p_patient_id
      and f.organization_id = v_org
      and f.status = 'ready'
      and (p_prescription_id is null or f.prescription_id = p_prescription_id)
      and app.can_see_patient_file_type(f.document_type)
    order by f.confirmed_at desc, f.id;
end;
$$;

comment on function public.list_patient_files(uuid, uuid) is
  'Dateien einer Akte als rollenabhaengige Projektion (ADR-004, ADR-017 Punkt 12). Ohne Objektschluessel (ANN-052) und ohne die Dateien, die die Rolle nicht sehen darf.';

-- -----------------------------------------------------------------------------
-- issue_patient_file_link
--
-- Der einzige Weg zum Objektschluessel einer bestaetigten Datei - und damit die
-- Stelle, an der 'patient_file.link_issued' entsteht (Punkt 20). Den
-- eigentlichen signierten Verweis erzeugt der Client mit createSignedUrl:
-- 60 Sekunden, je Zugriff neu, mit dem Anzeigenamen als Downloadnamen
-- (Punkt 15). Die Datenbank kann ihn nicht erzeugen - sie hat den Schluessel
-- nicht, mit dem er unterschrieben wird.
--
-- Was das bedeutet, steht in Punkt 21 und ist keine Nachlaessigkeit: Wer den
-- Verweis erzeugt hat, HATTE den Zugriff. Ob die Bytes geflossen sind, steht
-- nicht fest. Punkt 15 haelt den Unterschied klein - ein Verweis je bewusstem
-- Zugriff, nie auf Vorrat fuer eine Liste.
-- -----------------------------------------------------------------------------
create function public.issue_patient_file_link(p_file_id uuid)
returns table (
  bucket_id    text,
  object_key   text,
  display_name text,
  mime_type    text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_datei record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select f.* into v_datei
  from public.patient_files f
  where f.id = p_file_id
    and f.organization_id = app.current_organization_id()
    and f.status = 'ready';

  if not found then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  if not app.can_see_patient_file_type(v_datei.document_type) then
    raise exception 'file not accessible' using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_datei.organization_id, v_actor, 'patient_file.link_issued', 'patient_file', p_file_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_datei.patient_id,
      'document_type', v_datei.document_type
    )
  );

  return query
    select app.patient_file_bucket(), v_datei.object_key, v_datei.display_name, v_datei.mime_type;
end;
$$;

comment on function public.issue_patient_file_link(uuid) is
  'Gibt den Objektschluessel fuer genau einen bewussten Zugriff heraus und protokolliert die Ausstellung (ADR-017 Punkt 15, 20, 21; ANN-052).';

-- -----------------------------------------------------------------------------
-- discard_stale_patient_file_uploads
--
-- Punkt 7: Eine 'pending'-Zeile, die aelter als 24 Stunden ist, wird samt
-- Objekt verworfen. Der Trigger sorgt fuer den Objektteil.
--
-- Bewusst kein Zweig in apply_retention: Das hier ist keine abgelaufene Frist
-- einer Datenklasse, sondern das Aufraeumen eines unvollstaendigen Vorgangs.
-- Es in den Loeschlauf zu legen wuerde beides vermischen - und eine Aenderung
-- an der einen Sache waere eine Aenderung an der anderen.
-- -----------------------------------------------------------------------------
create function public.discard_stale_patient_file_uploads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  delete from public.patient_files
   where status = 'pending'
     and created_at < now() - interval '24 hours';

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

comment on function public.discard_stale_patient_file_uploads() is
  'Verwirft nicht bestaetigte Dateizeilen aelter als 24 Stunden samt Objekt (ADR-017 Punkt 7). Laeuft zeitgesteuert, ohne Aufrufer und ohne Rollenpruefung.';

revoke all on function public.discard_stale_patient_file_uploads() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Rechte
-- -----------------------------------------------------------------------------
revoke all on function public.prepare_patient_file_upload(uuid, uuid, text, text, text, bigint, text)
  from public, anon;
revoke all on function public.confirm_patient_file_upload(uuid) from public, anon;
revoke all on function public.discard_patient_file_upload(uuid) from public, anon;
revoke all on function public.list_patient_files(uuid, uuid) from public, anon;
revoke all on function public.issue_patient_file_link(uuid) from public, anon;

grant execute on function public.prepare_patient_file_upload(uuid, uuid, text, text, text, bigint, text)
  to authenticated;
grant execute on function public.confirm_patient_file_upload(uuid) to authenticated;
grant execute on function public.discard_patient_file_upload(uuid) to authenticated;
grant execute on function public.list_patient_files(uuid, uuid) to authenticated;
grant execute on function public.issue_patient_file_link(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Zeitplan
--
-- Wie bei der automatischen Finalisierung und beim Loeschlauf: bedingt, damit
-- die Wegwerf-Datenbank der Tests ohne pg_cron auskommt. Fehlt die Erweiterung,
-- bleibt die Migration gueltig und meldet es als Hinweis.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute format(
      'select cron.schedule(%L, %L, %L)',
      'discard-stale-patient-file-uploads',
      '25 3 * * *',
      'select public.discard_stale_patient_file_uploads()'
    );
  else
    raise notice 'pg_cron ist nicht verfuegbar - unbestaetigte Uploads (DAT-001) werden nicht automatisch verworfen.';
  end if;
end
$$;
