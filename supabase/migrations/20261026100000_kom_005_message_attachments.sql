-- =============================================================================
-- KOM-005 (KOM-EPIC-002): Foto und Video an einer Rueckfrage
--
-- ADR-017 Fassung 5, Abschnitt L (Punkte 59 bis 70); ADR-023 Punkte 13, 19,
-- 22, 24; ADR-008; ADR-010 Fassung 3 (das Datenmodell ist der Nachweis).
--
--   storage.buckets 'rueckfrageanhang'      eigener privater Bucket (Punkt 60)
--   public.platform_message_attachments     eine Zeile je Anhang, Bezug die
--                                           Rueckfrage (Punkt 10, 60)
--   public.message_attachment_access_grants einmalige Lesefreigaben wie
--                                           FIX-015 (ANN-052)
--   retention_classes 'rueckfrageanhang'    30 Tage ab der Aufnahme (Punkt 65)
--   Einwilligungszweck 'message_attachments' in beiden Modellen (Punkt 61)
--   app.message_attachment_scan_required()  der Schalter der Virenpruefung
--                                           (Punkt 69), heute aus
--
-- Derselbe Weg wie jede Datei (Punkt 60): Phase (a) prueft die Berechtigung,
-- bevor Bytes fliessen, (b) laedt der Browser unter genau dem Schluessel hoch,
-- (c) bestaetigt der Server gegen storage.objects. Die Pruefung am Inhalt
-- (Punkt 49) folgt demselben Schalter wie bei den Dateien der Akte
-- (app.patient_file_verification_required, ANN-337); die Virenpruefung hat
-- ihren eigenen (Punkt 69). Ist einer an, bleibt ein Anhang pending, bis das
-- Ergebnis vorliegt.
--
-- Wer (Punkte 59, 67): anhaengen die Person und ihre rechtliche Vertretung,
-- nie die Begleitung, und nur im Nachsorge-Abo oder im Training (ANN-332).
-- Sehen die Person, ihre Vertretung und in der Praxis, wer den Vorgang liest.
-- Loeschen die Person jederzeit und in der Praxis, wer antworten darf.
--
-- Protokoll (Punkt 67, ANN-334): nichts Neues. Das Oeffnen des Vorgangs steht
-- als *.viewed im Protokoll, Anzeigen ist kein Ereignis (ADR-010 Punkt 14),
-- wer geloescht hat, steht am Loeschauftrag (ordered_by). Auch ein Befund der
-- Pruefung am Server schreibt keinen Auditeintrag: eine neue Aktion braeuchte
-- eine Aenderung von ADR-010 mit Freigabe. Nachweis sind Loeschjournal und
-- Loeschauftrag.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bucket und Konstanten - je eine Stelle
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rueckfrageanhang',
  'rueckfrageanhang',
  false,
  10485760,
  array['image/jpeg', 'video/webm', 'video/mp4']
)
on conflict (id) do nothing;

create function app.message_attachment_bucket()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'rueckfrageanhang'::text
$$;

comment on function app.message_attachment_bucket() is
  'KOM-005: Name des privaten Buckets der Anhaenge an Rueckfragen (ADR-017 Punkte 3 und 60). Die einzige Stelle, an der er steht.';

-- Punkt 59: hoechstens drei Anhaenge je Vorgang.
create function app.message_attachment_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 3
$$;

-- Punkt 62: ein Video dauert hoechstens 30 Sekunden.
create function app.message_attachment_max_seconds()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 30
$$;

-- Punkt 69: Ohne Pruefergebnis wird kein Anhang einer echten Person ready.
-- Heute aus (synthetische Testkonten); einschalten gehoert ins Go-live-Gate
-- (ADR-007 Punkt 5) zusammen mit dem ADR, der den Pruefer waehlt.
create function app.message_attachment_scan_required()
returns boolean
language sql
immutable
set search_path = ''
as $$
  select false
$$;

comment on function app.message_attachment_scan_required() is
  'KOM-005 (ADR-017 Punkt 69): der Schalter der Virenpruefung fuer Anhaenge an Rueckfragen. Aus: ein Anhang wird nach den Pruefungen aus Punkt 49 ready und ist als "nicht auf Schadsoftware geprueft" gekennzeichnet. An: er bleibt pending, bis ein Pruefergebnis vorliegt. Einschalten erst mit dem ADR zum Pruefer; gehoert ins Go-live-Gate.';

revoke all on function app.message_attachment_bucket() from public, anon;
revoke all on function app.message_attachment_limit() from public, anon, authenticated;
revoke all on function app.message_attachment_max_seconds() from public, anon, authenticated;
revoke all on function app.message_attachment_scan_required() from public, anon;
grant execute on function app.message_attachment_bucket() to authenticated;
grant execute on function app.message_attachment_scan_required() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Tabelle
--
-- Kein Tabellenrecht, keine Policy: erreichbar nur ueber die Funktionen
-- unten (wie patient_files). Unveraenderlich bis auf Zustand, Pruefung und
-- Sperre (Punkt 8).
-- -----------------------------------------------------------------------------
create table public.platform_message_attachments (
  id                        uuid primary key default extensions.gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete restrict,
  message_id                uuid not null references public.platform_messages (id) on delete cascade,
  media_kind                text not null check (media_kind in ('photo', 'video')),
  mime_type                 text not null check (mime_type in ('image/jpeg', 'video/webm', 'video/mp4')),
  byte_size                 bigint not null check (byte_size > 0 and byte_size <= 10485760),
  -- Vom Geraet angegeben, aus der Aufnahme (Punkt 62); nur beim Video.
  duration_seconds          smallint check (duration_seconds between 1 and 30),
  checksum_sha256           text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status                    text not null default 'pending' check (status in ('pending', 'ready')),
  -- Phase (c) ist gelaufen, das Ergebnis der Pruefung steht noch aus
  -- (Punkte 51 und 69).
  confirmation_requested_at timestamptz,
  confirmed_at              timestamptz,
  -- Punkt 49: Typ, Pruefsumme, keine Tonspur, keine Metadaten - am Server.
  verified_at               timestamptz,
  -- ANN-335: unter Legal Hold gesperrt statt geloescht (Punkt 36 sinngemaess).
  locked_at                 timestamptz,
  -- Wer angehaengt hat: Zugang und Art, bei einer Vertretung ihr Name als
  -- Kopie (wie an den Eintraegen, KOM-001).
  access_id                 uuid references public.platform_accesses (id) on delete set null,
  author_kind               text not null check (author_kind in ('self', 'legal_representative')),
  author_label              text check (author_label is null
                                        or length(btrim(author_label)) between 1 and 160),
  created_by                uuid not null,
  created_at                timestamptz not null default now(),

  -- Punkt 5: nur Kennungen. Generiert, damit er nicht falsch geschrieben
  -- werden kann.
  object_key                text not null generated always as (
                              organization_id::text || '/' || message_id::text || '/' || id::text
                            ) stored,

  constraint platform_message_attachments_kind_matches check (
    (media_kind = 'photo' and mime_type = 'image/jpeg' and duration_seconds is null)
    or (media_kind = 'video' and mime_type in ('video/webm', 'video/mp4')
        and duration_seconds is not null)
  ),
  constraint platform_message_attachments_ready_confirmed check (
    (status = 'ready') = (confirmed_at is not null)
  ),
  constraint platform_message_attachments_label check (
    (author_kind = 'self') = (author_label is null)
  )
);

comment on table public.platform_message_attachments is
  'KOM-005 (ADR-017 Abschnitt L): Foto oder Video an einer Rueckfrage der Plattform. Bezug die Rueckfrage, hoechstens drei je Vorgang. Datenklasse rueckfrageanhang: 30 Tage ab der Aufnahme, faellt frueher mit dem Vorgang, beim Widerruf der Einwilligung sofort. Kein Weg in Akte oder Trainingsprotokoll (Punkt 66). Kein Tabellenrecht.';
comment on column public.platform_message_attachments.checksum_sha256 is
  'SHA-256 der abgelegten Bytes, im Browser gerechnet; zum Nachweis des Servers erst mit verified_at (ADR-017 Punkte 9 und 49).';

create index platform_message_attachments_message_idx
  on public.platform_message_attachments (message_id, created_at);
create unique index platform_message_attachments_object_key_idx
  on public.platform_message_attachments (object_key);
create index platform_message_attachments_org_created_idx
  on public.platform_message_attachments (organization_id, created_at);
create index platform_message_attachments_access_idx
  on public.platform_message_attachments (access_id) where access_id is not null;

alter table public.platform_message_attachments enable row level security;
revoke all on public.platform_message_attachments from public, anon, authenticated;

create function app.platform_message_attachments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Was eine Datei ist, aendert sich nicht (Punkt 8): nur Zustand, Pruefung,
  -- Sperre und der fallende Zugang. Der Objektschluessel ist generiert und im
  -- BEFORE-Trigger noch leer; er folgt aus den Kennungen, die hier geprueft
  -- werden.
  if (to_jsonb(new) - array['status', 'confirmation_requested_at', 'confirmed_at', 'verified_at',
                            'locked_at', 'access_id', 'object_key'])
     is distinct from
     (to_jsonb(old) - array['status', 'confirmation_requested_at', 'confirmed_at', 'verified_at',
                            'locked_at', 'access_id', 'object_key']) then
    raise exception 'message attachments are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger platform_message_attachments_guard
  before update on public.platform_message_attachments
  for each row execute function app.platform_message_attachments_guard();

-- Jede geloeschte Zeile hinterlaesst einen Loeschauftrag fuer ihr Objekt -
-- auf jedem Weg, auch ueber die Kaskade des Vorgangs (Punkt 25, wie DAT-001).
create function app.order_message_attachment_object_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = app.message_attachment_bucket() and o.name = old.object_key
  ) then
    insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
    values (old.organization_id, app.message_attachment_bucket(), old.object_key)
    on conflict do nothing;
  end if;
  return old;
end;
$$;

create trigger platform_message_attachments_order_object_deletion
  after delete on public.platform_message_attachments
  for each row execute function app.order_message_attachment_object_deletion();

-- -----------------------------------------------------------------------------
-- 3. Die Antwort mit Zeitmarke (Punkt 68): ein Eintrag der Praxis zeigt auf
--    eine Stelle in einem Video. Faellt das Video, bleibt die Zahl im Text.
-- -----------------------------------------------------------------------------
alter table public.platform_message_entries
  add column attachment_id uuid
    references public.platform_message_attachments (id) on delete set null,
  add column attachment_mark_seconds smallint
    check (attachment_mark_seconds between 0 and 30),
  add constraint platform_message_entries_mark_practice check (
    attachment_mark_seconds is null or side = 'practice'
  ),
  add constraint platform_message_entries_mark_complete check (
    attachment_id is null or attachment_mark_seconds is not null
  );

create index platform_message_entries_attachment_idx
  on public.platform_message_entries (attachment_id) where attachment_id is not null;

comment on column public.platform_message_entries.attachment_mark_seconds is
  'KOM-005 (ADR-017 Punkt 68, ANN-338): die Stelle im Video, auf die die Antwort der Praxis zeigt ("bei 0:12"). Bleibt, wenn das Video nach seiner Frist faellt.';

CREATE OR REPLACE FUNCTION app.platform_message_entries_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Faellt nur der Zugang oder der Anhang (on delete set null), bleibt der
  -- Eintrag, wie er ist.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['access_id', 'attachment_id'])
         = (to_jsonb(old) - array['access_id', 'attachment_id'])
     and (new.access_id is not distinct from old.access_id
          or (old.access_id is not null and new.access_id is null))
     and (new.attachment_id is not distinct from old.attachment_id
          or (old.attachment_id is not null and new.attachment_id is null)) then
    return new;
  end if;
  raise exception 'platform message entries are immutable' using errcode = '42501';
end;
$function$;

-- -----------------------------------------------------------------------------
-- 4. Einmalige Lesefreigaben (FIX-015, ANN-052) - eine eigene Tabelle, weil
--    die der Akte an Datei oder Loeschauftrag haengt.
-- -----------------------------------------------------------------------------
create table public.message_attachment_access_grants (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id         uuid not null,
  attachment_id   uuid not null
                    references public.platform_message_attachments (id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  constraint message_attachment_access_grants_short_lived check (
    expires_at > created_at and expires_at <= created_at + interval '5 minutes'
  )
);

comment on table public.message_attachment_access_grants is
  'KOM-005: einmalige, personengebundene Freigabe fuer genau einen Verweis auf einen Anhang (ANN-052). Verbraucht beim ersten Zugriff, verfaellt nach 30 Sekunden. Keine Schluessel, keine Namen.';

create index message_attachment_access_grants_attachment_idx
  on public.message_attachment_access_grants (attachment_id);
create index message_attachment_access_grants_expiry_idx
  on public.message_attachment_access_grants (organization_id, expires_at);

alter table public.message_attachment_access_grants enable row level security;
revoke all on public.message_attachment_access_grants from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Datenklasse (ADR-008, Punkt 65)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('rueckfrageanhang', 'intern', 'Art. 9 Abs. 2 lit. a DSGVO', 'event_time', interval '30 days',
   'ANN-332',
   'Fotos und Videos, die die Person an ihre Rueckfrage haengt: 30 Tage nach der Aufnahme, frueher mit dem Vorgang, sofort beim Widerruf der Einwilligung. Keine Verlaengerung, kein Weg in die Akte (ADR-017 Punkte 65 und 66). Ein Legal Hold an der Akte haelt.',
   78);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('platform_message_attachments', 'rueckfrageanhang', 'automatisch',
   'Anhaenge an Rueckfragen, 30 Tage ab der Aufnahme; fallen frueher mit dem Vorgang (cascade) und beim Widerruf der Einwilligung. Das Objekt folgt ueber den Loeschauftrag (ADR-017 Punkt 25).', 79),
  ('message_attachment_access_grants', 'rueckfrageanhang', 'ueber_elterndatensatz',
   'Einmalige Lesefreigabe an einem Anhang (ANN-052): beim ersten Zugriff verbraucht, nach 30 Sekunden verfallen; faellt spaetestens mit dem Anhang (cascade).', 80);

-- -----------------------------------------------------------------------------
-- 6. Die Einwilligung - ein eigener Zweck in beiden Modellen (Punkt 61)
-- -----------------------------------------------------------------------------
alter table public.patient_privacy_records
  drop constraint patient_privacy_records_purpose_check,
  add constraint patient_privacy_records_purpose_check check (
    purpose in ('email_contact', 'prescriber_report', 'patient_photos', 'message_attachments')
  );

alter table public.training_consent_records
  drop constraint training_consent_records_purpose_check,
  add constraint training_consent_records_purpose_check check (
    purpose in ('training_health_data', 'message_attachments')
  );

create or replace function app.platform_consent_purposes(p_relationship_kind text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_relationship_kind
    when 'treatment' then array['email_contact', 'prescriber_report', 'patient_photos', 'message_attachments']
    when 'training' then array['training_health_data', 'message_attachments']
    else '{}'::text[]
  end
$$;

-- Der juengste Vermerk des Zwecks entscheidet.
create function app.message_attachment_consent(p_kind text, p_relationship_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'treatment' then (
      select r.record_kind from public.patient_privacy_records r
      where r.patient_id = p_relationship_id and r.purpose = 'message_attachments'
      order by r.recorded_at desc, r.id desc limit 1)
    when 'training' then (
      select r.record_kind from public.training_consent_records r
      where r.training_relationship_id = p_relationship_id and r.purpose = 'message_attachments'
      order by r.recorded_at desc, r.id desc limit 1)
  end
$$;

revoke all on function app.message_attachment_consent(text, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Wer anhaengen darf - je eine Stelle
--
-- Punkt 59: im Nachsorge-Abo (Stufe 2) und im Training, nicht waehrend der
-- Behandlung (Stufe 1). Ein Abo zaehlt ab seinem Beginn und bis zu seinem
-- Ende (ANN-332).
-- -----------------------------------------------------------------------------
create function app.message_attachments_offered(p_kind text, p_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'training' then true
    when 'treatment' then exists (
      select 1 from public.aftercare_subscriptions s
      where s.patient_id = p_relationship_id
        and s.starts_on <= app.training_today(s.organization_id)
        and (s.ends_on is null or s.ends_on >= app.training_today(s.organization_id))
    )
    else false
  end
$$;

revoke all on function app.message_attachments_offered(text, uuid) from public, anon, authenticated;

comment on function app.message_attachments_offered(text, uuid) is
  'KOM-005 (ADR-017 Punkt 59, ANN-332): ob in diesem Verhaeltnis Fotos und Videos an Rueckfragen vorgesehen sind - im Training immer, in der Behandlung nur mit laufendem Nachsorge-Abo.';

-- Neues Recht 'attach': die Person selbst und ihre rechtliche Vertretung, nie
-- die Begleitung (Punkte 59 und 67). Sonst unveraendert aus
-- 20261019110000_ueb_010_exercise_sessions.sql.
create or replace function app.platform_access_allows(p_access_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      -- Gesundheit: Lesen, Wuensche, Nachrichten. Jede Vertretung traegt
      -- diesen Bereich nachgewiesen (Constraint platform_accesses_kind_fields).
      when p_capability in ('read', 'request', 'message') then true
      -- Rechnungen und Zahlungen: der eigene Zugang, sonst nur mit
      -- nachgewiesener Vermoegenssorge bzw. Einwilligung (ABN-010).
      when p_capability = 'billing'
        then a.access_kind = 'self' or coalesce(a.finance_scope, false)
      -- ANG-003 (ANN-273): einen Vertrag kuendigen die Person selbst und eine
      -- rechtliche Vertretung mit Vermoegenssorge, nie eine Begleitung.
      when p_capability = 'contract'
        then a.access_kind = 'self'
             or (a.access_kind = 'legal_representative' and coalesce(a.finance_scope, false))
      -- POR-012 (ANN-248): den Befundbogen fuellt die Person selbst oder ihre
      -- rechtliche Vertretung aus - eine Angabe zur Gesundheit, die eine
      -- Begleitung nicht fuer sie macht.
      -- UEB-010 (ANN-306): ebenso die Einheit am Plan.
      -- KOM-005 (ADR-017 Punkte 59 und 67): ebenso Foto und Video an einer
      -- Rueckfrage - die Begleitung liest die Worte, nicht die Bilder.
      when p_capability in ('consent', 'export', 'manage_companions', 'questionnaire', 'exercise',
                            'attach')
        then a.access_kind in ('self', 'legal_representative')
      else false
    end
    from public.platform_accesses a
    where a.id = p_access_id
      and exists (select 1 from app.platform_readable_access(a.id))
  ), false)
$$;

-- Ein Anhang ist sichtbar: bestaetigt, nicht gesperrt, nicht faellig.
create function app.message_attachment_visible(p_attachment public.platform_message_attachments)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_attachment.status = 'ready'
     and p_attachment.locked_at is null
     and p_attachment.created_at + app.retention_interval('rueckfrageanhang') > now()
$$;

revoke all on function app.message_attachment_visible(public.platform_message_attachments)
  from public, anon, authenticated;

-- Die Anhaenge, die ein Zugang sieht: die seines Verhaeltnisses, nie fuer
-- eine Begleitung (Punkt 67).
create function app.platform_visible_attachments(p_access_id uuid)
returns setof public.platform_message_attachments
language sql
stable
security definer
set search_path = ''
as $$
  select x.*
  from app.platform_visible_messages(p_access_id) m
  join public.platform_message_attachments x on x.message_id = m.id
  join public.platform_accesses a on a.id = p_access_id
  where a.access_kind in ('self', 'legal_representative')
    and app.platform_access_allows(p_access_id, 'read')
    and app.message_attachment_visible(x)
$$;

revoke all on function app.platform_visible_attachments(uuid) from public, anon, authenticated;

-- Loeschen und Sperren an einer Stelle (Punkte 36, 61, 65, 67; ANN-335).
-- Unter Legal Hold der Akte wird gesperrt statt geloescht; der Loeschlauf
-- loescht, sobald der Hold endet. Jede Loeschung steht im Loeschjournal, damit
-- sie nach einer Wiederherstellung erneut angewendet wird (ADR-017 Punkt 26).
-- p_scope: 'attachment' (eine Kennung), 'relationship' (alle eines
-- Verhaeltnisses, Widerruf) oder 'due' (faellige der Organisation, Lauf).
create function app.remove_message_attachments(
  p_organization_id uuid,
  p_scope           text,
  p_id              uuid,
  p_run_id          uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  with kandidaten as (
    select x.id,
           least(x.created_at + app.retention_interval('rueckfrageanhang'),
                 coalesce(x.locked_at, 'infinity'::timestamptz)) as due_at,
           x.locked_at,
           m.relationship_kind = 'treatment'
             and app.under_legal_hold(p_organization_id, 'patient', m.patient_id) as gehalten
    from public.platform_message_attachments x
    join public.platform_messages m on m.id = x.message_id
    where x.organization_id = p_organization_id
      and case p_scope
            when 'attachment' then x.id = p_id
            when 'relationship' then m.relationship_id = p_id
            when 'due' then true
            else false
          end
    for update of x
  ),
  betroffen as (
    select k.id, k.locked_at, k.gehalten,
           case when p_scope = 'due' then k.due_at else now() end as due_at
    from kandidaten k
    where p_scope <> 'due' or k.due_at <= now()
  ),
  gesperrt as (
    update public.platform_message_attachments x
       set locked_at = b.due_at
      from betroffen b
     where x.id = b.id and b.gehalten and b.locked_at is null
    returning x.id
  ),
  zu_loeschen as (
    select b.id, b.due_at from betroffen b where not b.gehalten
  ),
  geloescht as (
    delete from public.platform_message_attachments x
    using zu_loeschen z
    where x.id = z.id
    returning x.id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select p_organization_id, p_run_id, 'platform_message_attachments', g.id, 'rueckfrageanhang',
         z.due_at
  from geloescht g
  join zu_loeschen z on z.id = g.id;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function app.remove_message_attachments(uuid, text, uuid, uuid)
  from public, anon, authenticated;

comment on function app.remove_message_attachments(uuid, text, uuid, uuid) is
  'KOM-005 (ADR-017 Punkte 61, 65, 67; ANN-335): loescht Anhaenge mit Loeschjournal - einen, alle eines Verhaeltnisses (Widerruf) oder die faelligen (Lauf). Unter Legal Hold der Akte gesperrt statt geloescht. Der Trigger schreibt die Loeschauftraege fuer die Objekte.';

-- -----------------------------------------------------------------------------
-- 8. Plattform: anhaengen - Phase (a), (c) und der Rueckweg
-- -----------------------------------------------------------------------------
create function public.prepare_message_attachment_upload(
  p_access_id        uuid,
  p_message_id       uuid,
  p_mime_type        text,
  p_byte_size        bigint,
  p_checksum_sha256  text,
  p_duration_seconds integer
)
returns table (attachment_id uuid, bucket_id text, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_vorgang public.platform_messages%rowtype;
  v_art     text;
  v_id      uuid;
begin
  v_zugang := app.assert_platform_message(p_access_id);
  if not app.platform_access_allows(p_access_id, 'attach') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  v_vorgang := app.platform_open_message(p_access_id, p_message_id);

  if not app.message_attachments_offered(v_vorgang.relationship_kind, v_vorgang.relationship_id) then
    raise exception 'attachments not offered' using errcode = '42501';
  end if;
  if app.message_attachment_consent(v_vorgang.relationship_kind, v_vorgang.relationship_id)
     is distinct from 'consent_granted' then
    raise exception 'no consent to attachments' using errcode = '42501';
  end if;
  -- Wie beim Nachtrag (ANN-311): im Training ist ein Bild zur Uebung oder zu
  -- Beschwerden eine Angabe zur Gesundheit.
  if not app.platform_message_topic_allowed(
           v_vorgang.relationship_kind, v_vorgang.relationship_id, v_vorgang.topic) then
    raise exception 'topic needs consent' using errcode = '42501';
  end if;

  if p_mime_type = 'image/jpeg' then
    v_art := 'photo';
    if p_duration_seconds is not null then
      raise exception 'a photo has no duration' using errcode = '22023';
    end if;
  elsif p_mime_type in ('video/webm', 'video/mp4') then
    v_art := 'video';
    if p_duration_seconds is null
       or p_duration_seconds not between 1 and app.message_attachment_max_seconds() then
      raise exception 'video too long or empty' using errcode = '22023';
    end if;
  else
    raise exception 'unsupported media type' using errcode = '22023';
  end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > app.patient_file_max_bytes() then
    raise exception 'file too large or empty' using errcode = '22023';
  end if;
  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid checksum' using errcode = '22023';
  end if;

  -- Hoechstens drei je Vorgang, auch gleichzeitig: der Vorgang ist gesperrt.
  perform 1 from public.platform_messages m where m.id = v_vorgang.id for update;
  if (select count(*) from public.platform_message_attachments x where x.message_id = v_vorgang.id)
     >= app.message_attachment_limit() then
    raise exception 'too many attachments' using errcode = '23514';
  end if;

  insert into public.platform_message_attachments (
    organization_id, message_id, media_kind, mime_type, byte_size, duration_seconds,
    checksum_sha256, access_id, author_kind, author_label, created_by
  )
  values (
    v_vorgang.organization_id, v_vorgang.id, v_art, p_mime_type, p_byte_size, p_duration_seconds,
    p_checksum_sha256, v_zugang.id, v_zugang.access_kind,
    case when v_zugang.access_kind <> 'self' then v_zugang.representative_name end, auth.uid()
  )
  returning id into v_id;

  return query
    select x.id, app.message_attachment_bucket(), x.object_key
    from public.platform_message_attachments x where x.id = v_id;
end;
$$;

revoke all on function public.prepare_message_attachment_upload(uuid, uuid, text, bigint, text, integer)
  from public, anon;
grant execute on function public.prepare_message_attachment_upload(uuid, uuid, text, bigint, text, integer)
  to authenticated;

comment on function public.prepare_message_attachment_upload(uuid, uuid, text, bigint, text, integer) is
  'KOM-005 (ADR-017 Punkte 7a, 59 bis 63): Phase (a) - prueft Zugang, Stufe, Einwilligung, Zahl und Format, bevor Bytes fliessen, und liefert den Objektschluessel.';

-- Die eigene vorbereitete Zeile des Kontos, solange der Zugang schreiben darf.
create function app.own_pending_attachment(p_access_id uuid, p_attachment_id uuid)
returns public.platform_message_attachments
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_anhang public.platform_message_attachments%rowtype;
begin
  select x.* into v_anhang
  from public.platform_message_attachments x
  join app.platform_visible_messages(p_access_id) m on m.id = x.message_id
  where x.id = p_attachment_id
    and x.access_id = p_access_id
    and x.created_by = auth.uid()
    and x.status = 'pending'
    and x.confirmation_requested_at is null;
  if v_anhang.id is null then
    raise exception 'attachment not found' using errcode = 'P0002';
  end if;
  return v_anhang;
end;
$$;

revoke all on function app.own_pending_attachment(uuid, uuid) from public, anon, authenticated;

create function public.confirm_message_attachment_upload(p_access_id uuid, p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anhang   public.platform_message_attachments%rowtype;
  v_vorgang  public.platform_messages%rowtype;
  v_metadata jsonb;
begin
  perform app.assert_platform_message(p_access_id);
  if not app.platform_access_allows(p_access_id, 'attach') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  v_anhang := app.own_pending_attachment(p_access_id, p_attachment_id);
  v_vorgang := app.platform_open_message(p_access_id, v_anhang.message_id);
  -- Ein Widerruf zwischen Vorbereitung und Bestaetigung laesst den Anhang
  -- nicht mehr sichtbar werden (Punkt 61, wie Punkt 36).
  if app.message_attachment_consent(v_vorgang.relationship_kind, v_vorgang.relationship_id)
     is distinct from 'consent_granted' then
    raise exception 'no consent to attachments' using errcode = '42501';
  end if;

  perform 1 from public.platform_message_attachments x where x.id = v_anhang.id for update;

  select o.metadata into v_metadata
  from storage.objects o
  where o.bucket_id = app.message_attachment_bucket() and o.name = v_anhang.object_key;
  if not found then
    raise exception 'object was not uploaded' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'size', '')::bigint is distinct from v_anhang.byte_size then
    raise exception 'uploaded size does not match the announced size' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'mimetype', '') is distinct from v_anhang.mime_type then
    raise exception 'uploaded media type does not match the announced media type'
      using errcode = '22023';
  end if;

  -- Punkte 51 und 69: Ist eine der Pruefungen scharf, wird der Anhang erst
  -- mit ihrem Ergebnis ready.
  if app.patient_file_verification_required() or app.message_attachment_scan_required() then
    update public.platform_message_attachments
       set confirmation_requested_at = now()
     where id = v_anhang.id;
  else
    update public.platform_message_attachments
       set status = 'ready', confirmed_at = now()
     where id = v_anhang.id;
  end if;

  update public.platform_messages m set last_entry_at = now() where m.id = v_anhang.message_id;

  perform app.log_platform_representation(
    p_access_id, 'platform_representation.read', jsonb_build_object('view', 'message')
  );
end;
$$;

revoke all on function public.confirm_message_attachment_upload(uuid, uuid) from public, anon;
grant execute on function public.confirm_message_attachment_upload(uuid, uuid) to authenticated;

comment on function public.confirm_message_attachment_upload(uuid, uuid) is
  'KOM-005 (ADR-017 Punkt 7c): Phase (c) - prueft Groesse und Typ gegen storage.objects; ready, solange weder Pruefung am Server noch Virenpruefung scharf sind (Punkte 51, 69).';

create function public.discard_message_attachment_upload(p_access_id uuid, p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anhang public.platform_message_attachments%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'attach') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  v_anhang := app.own_pending_attachment(p_access_id, p_attachment_id);
  -- Der Trigger schreibt den Loeschauftrag, falls doch schon ein Objekt liegt.
  delete from public.platform_message_attachments where id = v_anhang.id;
end;
$$;

revoke all on function public.discard_message_attachment_upload(uuid, uuid) from public, anon;
grant execute on function public.discard_message_attachment_upload(uuid, uuid) to authenticated;

comment on function public.discard_message_attachment_upload(uuid, uuid) is
  'KOM-005 (ADR-017 Punkt 7): verwirft die eigene, nicht bestaetigte Zeile nach einem abgebrochenen Upload.';

-- Nach 24 Stunden unbestaetigt: verworfen (Punkt 7). Wie bei der Akte kein
-- Zweig im Loeschlauf - das ist Aufraeumen, keine Frist.
create function public.discard_stale_message_attachment_uploads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  delete from public.platform_message_attachments
   where status = 'pending'
     and created_at < now() - interval '24 hours';
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function public.discard_stale_message_attachment_uploads() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute format(
      'select cron.schedule(%L, %L, %L)',
      'discard-stale-message-attachment-uploads',
      '35 3 * * *',
      'select public.discard_stale_message_attachment_uploads()'
    );
  else
    raise notice 'pg_cron ist nicht verfuegbar - unbestaetigte Anhaenge (KOM-005) werden nicht automatisch verworfen.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 9. Ansehen - Plattform und Praxis
--
-- Der Objektschluessel verlaesst die Datenbank nur hier, gegen eine
-- einmalige Freigabe (ANN-052). Kein eigener Auditeintrag (Punkt 67); ueber
-- eine Vertretung liest die Vertretung (ADR-023 Punkt 24).
-- -----------------------------------------------------------------------------
create function app.grant_message_attachment(p_attachment public.platform_message_attachments)
returns table (bucket_id text, object_key text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.message_attachment_access_grants g
   where g.organization_id = p_attachment.organization_id
     and g.expires_at <= now();

  insert into public.message_attachment_access_grants (
    organization_id, user_id, attachment_id, expires_at
  )
  values (
    p_attachment.organization_id, auth.uid(), p_attachment.id,
    now() + app.patient_file_access_grant_ttl()
  );

  return query
    select app.message_attachment_bucket(), p_attachment.object_key, p_attachment.mime_type;
end;
$$;

revoke all on function app.grant_message_attachment(public.platform_message_attachments)
  from public, anon, authenticated;

create function public.issue_platform_message_attachment_link(p_access_id uuid, p_attachment_id uuid)
returns table (bucket_id text, object_key text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anhang public.platform_message_attachments%rowtype;
begin
  select x.* into v_anhang
  from app.platform_visible_attachments(p_access_id) x
  where x.id = p_attachment_id;
  -- Fremd, gesperrt, faellig oder nicht vorhanden sehen gleich aus.
  if v_anhang.id is null then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;

  perform app.log_platform_representation(
    p_access_id, 'platform_representation.read', jsonb_build_object('view', 'message')
  );

  return query select * from app.grant_message_attachment(v_anhang);
end;
$$;

revoke all on function public.issue_platform_message_attachment_link(uuid, uuid) from public, anon;
grant execute on function public.issue_platform_message_attachment_link(uuid, uuid) to authenticated;

comment on function public.issue_platform_message_attachment_link(uuid, uuid) is
  'KOM-005 (ADR-017 Punkte 15, 54, 67): einmalige Freigabe fuer genau einen Verweis auf einen eigenen Anhang - Person und rechtliche Vertretung, nie die Begleitung. Kein eigener Auditeintrag; eine Vertretung liest (ADR-023 Punkt 24).';

create function public.issue_message_attachment_link(p_attachment_id uuid)
returns table (bucket_id text, object_key text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anhang  public.platform_message_attachments%rowtype;
  v_vorgang public.platform_messages%rowtype;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;
  select x.* into v_anhang
  from public.platform_message_attachments x
  where x.id = p_attachment_id and x.organization_id = app.current_organization_id();
  if v_anhang.id is null or not app.message_attachment_visible(v_anhang) then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;
  select m.* into v_vorgang from public.platform_messages m where m.id = v_anhang.message_id;
  if not app.can_read_platform_message(v_vorgang.relationship_kind, v_vorgang.topic) then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;

  return query select * from app.grant_message_attachment(v_anhang);
end;
$$;

revoke all on function public.issue_message_attachment_link(uuid) from public, anon;
grant execute on function public.issue_message_attachment_link(uuid) to authenticated;

comment on function public.issue_message_attachment_link(uuid) is
  'KOM-005 (ADR-017 Punkte 15, 54, 67): einmalige Freigabe fuer genau einen Verweis auf einen Anhang fuer die Praxis - wer den Vorgang lesen darf (app.can_read_platform_message). Kein eigener Auditeintrag: das Oeffnen des Vorgangs steht schon im Protokoll.';

-- -----------------------------------------------------------------------------
-- 10. RLS auf storage.objects fuer den neuen Bucket (ADR-017 Punkt 11)
--
-- Hochladen nur zu einer eigenen pending-Zeile eines Zugangs, der anhaengen
-- darf; lesen nur gegen eine Freigabe, die dabei verbraucht wird; loeschen
-- nur zu einem offenen Loeschauftrag - dieselben Funktionen wie fuer die
-- Akte. Kein UPDATE (Punkt 8).
-- -----------------------------------------------------------------------------
create function app.may_upload_message_attachment_object(p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_message_attachments x
    where x.object_key = p_object_key
      and x.status = 'pending'
      and x.confirmation_requested_at is null
      and x.created_by = auth.uid()
      and x.created_at > now() - interval '24 hours'
      and x.access_id is not null
      and app.platform_access_allows(x.access_id, 'attach')
      and app.platform_access_writable(x.access_id)
  )
$$;

create function app.may_read_message_attachment_object(p_object_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_org     uuid;
  v_grant   uuid;
begin
  if v_actor is null then
    return false;
  end if;
  v_org := app.current_organization_id();

  select g.id into v_grant
  from public.message_attachment_access_grants g
  join public.platform_message_attachments x on x.id = g.attachment_id
  join public.platform_messages m on m.id = x.message_id
  where x.object_key = p_object_key
    and app.message_attachment_visible(x)
    and g.organization_id = x.organization_id
    and g.user_id = v_actor
    and g.expires_at > now()
    and (
      -- Praxis: wer den Vorgang lesen darf.
      (v_org is not null and x.organization_id = v_org
         and app.can_read_platform_message(m.relationship_kind, m.topic))
      -- Plattform: ein lesbarer Zugang des Kontos zu diesem Verhaeltnis, der
      -- Anhaenge sieht (nie die Begleitung).
      or (v_org is null and exists (
            select 1 from public.platform_accesses a
            where a.account_user_id = v_actor
              and a.organization_id = x.organization_id
              and a.relationship_kind = m.relationship_kind
              and a.relationship_id = m.relationship_id
              and exists (select 1 from app.platform_visible_attachments(a.id) v where v.id = x.id)
          ))
    )
  order by g.created_at
  limit 1
  for update of g skip locked;

  if v_grant is null then
    return false;
  end if;
  delete from public.message_attachment_access_grants where id = v_grant;
  return true;
end;
$$;

grant execute on function app.may_upload_message_attachment_object(text) to authenticated;
grant execute on function app.may_read_message_attachment_object(text) to authenticated;

create policy message_attachments_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = app.message_attachment_bucket()
    and app.may_upload_message_attachment_object(name)
  );

create policy message_attachments_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = app.message_attachment_bucket()
    and app.may_read_message_attachment_object(name)
  );

create policy message_attachments_objects_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = app.message_attachment_bucket()
    and app.may_delete_storage_object(bucket_id, name)
  );

create policy message_attachments_objects_select_for_deletion
  on storage.objects for select to authenticated
  using (
    bucket_id = app.message_attachment_bucket()
    and app.may_read_storage_object_for_deletion(bucket_id, name)
  );

-- -----------------------------------------------------------------------------
-- 11. Loeschen - die Person jederzeit, die Praxis mit Antwortrecht (Punkt 67)
-- -----------------------------------------------------------------------------
create function public.delete_platform_message_attachment(p_access_id uuid, p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anhang public.platform_message_attachments%rowtype;
begin
  -- "Jederzeit": auch nach der Lesefrist, solange der eigene Zugang aktiv ist
  -- (wie der Widerruf, ANN-261).
  if not (app.platform_access_allows(p_access_id, 'attach')
          or app.platform_own_access_after_reading(p_access_id)) then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;
  select x.* into v_anhang
  from public.platform_message_attachments x
  join public.platform_messages m on m.id = x.message_id
  join public.platform_accesses a on a.id = p_access_id
  where x.id = p_attachment_id
    and m.organization_id = a.organization_id
    and m.relationship_kind = a.relationship_kind
    and m.relationship_id = a.relationship_id
    and x.status = 'ready'
    and x.locked_at is null;
  if v_anhang.id is null then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;

  perform app.remove_message_attachments(
    v_anhang.organization_id, 'attachment', v_anhang.id, extensions.gen_random_uuid());
  perform app.log_platform_representation(
    p_access_id, 'platform_representation.read', jsonb_build_object('view', 'message')
  );
end;
$$;

revoke all on function public.delete_platform_message_attachment(uuid, uuid) from public, anon;
grant execute on function public.delete_platform_message_attachment(uuid, uuid) to authenticated;

comment on function public.delete_platform_message_attachment(uuid, uuid) is
  'KOM-005 (ADR-017 Punkt 67): die Person oder ihre rechtliche Vertretung loescht einen Anhang - jederzeit, die Person auch nach der Lesefrist. Loeschjournal und Loeschauftrag (ordered_by); unter Legal Hold gesperrt (ANN-335).';

create function public.delete_message_attachment(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anhang  public.platform_message_attachments%rowtype;
  v_vorgang public.platform_messages%rowtype;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;
  select x.* into v_anhang
  from public.platform_message_attachments x
  where x.id = p_attachment_id and x.organization_id = app.current_organization_id()
    and x.status = 'ready' and x.locked_at is null;
  if v_anhang.id is null then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;
  select m.* into v_vorgang from public.platform_messages m where m.id = v_anhang.message_id;
  if not app.can_read_platform_message(v_vorgang.relationship_kind, v_vorgang.topic) then
    raise exception 'attachment not accessible' using errcode = '42501';
  end if;
  if not app.can_answer_platform_message(v_vorgang.relationship_kind, v_vorgang.topic) then
    raise exception 'not allowed to delete this attachment' using errcode = '42501';
  end if;

  perform app.remove_message_attachments(
    v_anhang.organization_id, 'attachment', v_anhang.id, extensions.gen_random_uuid());
end;
$$;

revoke all on function public.delete_message_attachment(uuid) from public, anon;
grant execute on function public.delete_message_attachment(uuid) to authenticated;

comment on function public.delete_message_attachment(uuid) is
  'KOM-005 (ADR-017 Punkt 67): die Praxis loescht einen Anhang, etwa wenn er Dritte zeigt - wer auf den Vorgang antworten darf. Nachweis am Loeschauftrag (ordered_by) und im Loeschjournal.';

-- -----------------------------------------------------------------------------
-- 12. Pruefung am Server (Punkte 49 bis 52) - nur fuer den Dienst
-- -----------------------------------------------------------------------------
create function public.message_attachment_for_verification(p_attachment_id uuid, p_user_id uuid)
returns table (
  bucket_id        text,
  object_key       text,
  mime_type        text,
  byte_size        bigint,
  checksum_sha256  text,
  already_verified boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select app.message_attachment_bucket(), x.object_key, x.mime_type, x.byte_size,
         x.checksum_sha256, x.verified_at is not null
  from public.platform_message_attachments x
  where x.id = p_attachment_id
    and x.created_by = p_user_id
    and x.created_at > now() - interval '24 hours'
    and (x.status = 'ready' or x.confirmation_requested_at is not null)
$$;

create function public.record_message_attachment_verification(
  p_attachment_id   uuid,
  p_content_type_ok boolean,
  p_checksum_ok     boolean,
  p_metadata_ok     boolean,
  p_no_audio_ok     boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anhang public.platform_message_attachments%rowtype;
begin
  if p_content_type_ok is null or p_checksum_ok is null or p_metadata_ok is null
     or p_no_audio_ok is null then
    raise exception 'incomplete verification result' using errcode = '22023';
  end if;

  select x.* into v_anhang
  from public.platform_message_attachments x
  where x.id = p_attachment_id
  for update;
  if not found then
    return 'not_found';
  end if;
  if v_anhang.verified_at is not null then
    return 'already_verified';
  end if;
  if v_anhang.status <> 'ready' and v_anhang.confirmation_requested_at is null then
    return 'not_confirmed';
  end if;

  if p_content_type_ok and p_checksum_ok and p_metadata_ok and p_no_audio_ok then
    update public.platform_message_attachments
       set verified_at = now(),
           -- Ohne scharfe Virenpruefung ist der Anhang damit fertig; mit ihr
           -- wartet er auf deren Ergebnis (Punkt 69).
           status = case when app.message_attachment_scan_required() then status else 'ready' end,
           confirmed_at = case when app.message_attachment_scan_required() then confirmed_at
                               else coalesce(confirmed_at, now()) end
     where id = p_attachment_id;
    return 'passed';
  end if;

  -- Punkt 52: Befund heisst verwerfen. Unter Legal Hold gesperrt statt
  -- geloescht (ANN-335). Kein Auditeintrag (ANN-334).
  perform app.remove_message_attachments(
    v_anhang.organization_id, 'attachment', v_anhang.id, extensions.gen_random_uuid());
  return 'rejected';
end;
$$;

revoke all on function public.message_attachment_for_verification(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.record_message_attachment_verification(uuid, boolean, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.message_attachment_for_verification(uuid, uuid) to service_role;
grant execute on function public.record_message_attachment_verification(uuid, boolean, boolean, boolean, boolean)
  to service_role;

comment on function public.record_message_attachment_verification(uuid, boolean, boolean, boolean, boolean) is
  'KOM-005 (ADR-017 Punkte 49 bis 52, 63): Ergebnis der Pruefung am Inhalt - Typ an der Signatur, Pruefsumme, keine Metadaten, keine Tonspur. Bestanden: geprueft und, ohne scharfe Virenpruefung, ready. Befund: verworfen mit Loeschjournal und Loeschauftrag. Nur fuer den Dienst.';

-- -----------------------------------------------------------------------------
-- 13. Abgleich (Punkt 27): verwaiste Objekte auch im neuen Bucket. Rumpf
--     sonst unveraendert aus 20260926150000_dok_006b_patient_photos.sql.
-- -----------------------------------------------------------------------------
create or replace function public.count_orphaned_patient_file_objects()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if not app.can_execute_storage_deletion() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'storage_deletion.read', 'not allowed to read the storage reconciliation');
    return null;
  end if;

  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to read the storage reconciliation' using errcode = '42501';
  end if;

  select count(*)
    into v_anzahl
  from storage.objects o
  where o.bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket(),
                        app.message_attachment_bucket())
    and o.name like v_org::text || '/%'
    and not exists (
      select 1
      from public.patient_files f
      where f.object_key = o.name
        and app.patient_file_bucket_for(f.document_type) = o.bucket_id
    )
    and not exists (
      select 1
      from public.platform_message_attachments x
      where x.object_key = o.name
        and o.bucket_id = app.message_attachment_bucket()
    )
    and not exists (
      select 1
      from public.storage_deletion_orders d
      where d.bucket_id = o.bucket_id
        and d.object_key = o.name
        and d.receipted_at is null
    );

  return v_anzahl;
end;
$$;

create or replace function public.order_orphaned_object_deletion()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_execute_storage_deletion() then
    perform app.record_denied_write(auth.uid(), 'storage_deletion.ordered', 'not allowed to order deletions');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to order deletions' using errcode = '42501';
  end if;

  insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
  select v_org, o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket(),
                        app.message_attachment_bucket())
    and o.name like v_org::text || '/%'
    and not exists (
      select 1
      from public.patient_files f
      where f.object_key = o.name
        and app.patient_file_bucket_for(f.document_type) = o.bucket_id
    )
    and not exists (
      select 1
      from public.platform_message_attachments x
      where x.object_key = o.name
        and o.bucket_id = app.message_attachment_bucket()
    )
  on conflict do nothing;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;
