-- =============================================================================
-- KOM-005 (KOM-EPIC-002), Teil 2: Projektionen, Antwort mit Zeitmarke,
-- Widerruf, Loeschlauf
--
-- ADR-017 Punkte 61, 65, 67, 68. Die Rumpfe stammen aus ihren juengsten
-- Fassungen und sind nur um die Anhaenge ergaenzt:
--   public.platform_messages        20261020100000_kom_001_platform_messages.sql
--   public.get_platform_message     20261020120000_kom_004_messages_in_record.sql
--   public.answer_platform_message  20261020110000_kom_002_practice_messages.sql
--   public.record_platform_consent  20261013110000_por_017_training_consent.sql
--   public.apply_retention, public.reapply_deletion_journal
--                                   20261020100000_kom_001_platform_messages.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plattform: die Nachrichten mit ihren Anhaengen (feste Schluesselliste,
--    ADR-023 Punkt 22). Eine Begleitung sieht keine Anhaenge (Punkt 67) und
--    keine Zeitmarke, die auf einen zeigt.
-- -----------------------------------------------------------------------------
create or replace function public.platform_messages(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_anhang  boolean;
  v_zone    text;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  v_anhang := v_zugang.access_kind in ('self', 'legal_representative');
  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'messages')
  );

  return jsonb_build_object(
    'response_workdays', (
      select o.message_response_workdays from public.organizations o
      where o.id = v_zugang.organization_id
    ),
    'can_write', app.platform_access_allows(p_access_id, 'message')
                 and app.platform_access_writable(p_access_id),
    'health_topics', app.platform_message_topic_allowed(
                       v_zugang.relationship_kind, v_zugang.relationship_id, 'complaint'),
    -- KOM-005: Ob angehaengt werden kann (Stufe, Art des Zugangs), und der
    -- Stand der Einwilligung - sie wird beim ersten Anhaengen angeboten.
    'can_attach', app.platform_access_allows(p_access_id, 'attach')
                  and app.platform_access_allows(p_access_id, 'message')
                  and app.platform_access_writable(p_access_id)
                  and app.message_attachments_offered(
                        v_zugang.relationship_kind, v_zugang.relationship_id),
    'attachment_consent', case
      when not v_anhang then null
      else case app.message_attachment_consent(v_zugang.relationship_kind, v_zugang.relationship_id)
        when 'consent_granted' then 'granted'
        when 'consent_withdrawn' then 'withdrawn'
        when 'consent_refused' then 'refused'
        else 'open'
      end
    end,
    'attachment_limit', app.message_attachment_limit(),
    'attachment_max_seconds', app.message_attachment_max_seconds(),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'topic', m.topic,
        'reference_label', m.reference_label,
        'status', m.status,
        'due_on', m.due_on,
        'created_at', m.created_at,
        'last_entry_at', m.last_entry_at,
        'closed_at', m.closed_at,
        'closed_by_side', m.closed_by_side,
        -- Fuer die Grenze von drei (Punkt 59); die Begleitung erfaehrt nicht
        -- einmal, dass es Anhaenge gibt.
        'attachment_count', case when v_anhang then (
          select count(*)::integer from public.platform_message_attachments x
          where x.message_id = m.id) end,
        'attachments', case when not v_anhang then '[]'::jsonb else coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', x.id,
            'media_kind', x.media_kind,
            'mime_type', x.mime_type,
            'duration_seconds', x.duration_seconds,
            'created_at', x.created_at,
            'delete_on', ((x.created_at + app.retention_interval('rueckfrageanhang'))
                            at time zone coalesce(v_zone, 'Europe/Berlin'))::date,
            'author', case
              when x.access_id = p_access_id then 'you'
              when x.author_kind = 'self' then 'person'
              else 'representative'
            end,
            'author_label', x.author_label,
            'server_verified', x.verified_at is not null,
            'malware_scanned', app.message_attachment_scan_required()
          ) order by x.created_at, x.id)
          from app.platform_visible_attachments(p_access_id) x
          where x.message_id = m.id
        ), '[]'::jsonb) end,
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id,
            'side', e.side,
            'body', e.body,
            'created_at', e.created_at,
            'author', case
              when e.side = 'practice' then 'practice'
              when e.access_id = p_access_id then 'you'
              when e.author_kind = 'self' then 'person'
              else 'representative'
            end,
            'author_label', case when e.side = 'person' then e.author_label end,
            'attachment_id', case when v_anhang then e.attachment_id end,
            'attachment_mark_seconds', case when v_anhang then e.attachment_mark_seconds end
          ) order by e.created_at, e.id)
          from public.platform_message_entries e
          where e.message_id = m.id
        ), '[]'::jsonb)
      ) order by (m.status = 'closed'), m.last_entry_at desc, m.id)
      from app.platform_visible_messages(p_access_id) m
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.platform_messages(uuid) is
  'KOM-001/005: Plattformprojektion "Nachrichten" (DSN-001 4.1): die Vorgaenge des Verhaeltnisses mit Eintraegen und - fuer Person und rechtliche Vertretung - ihren Anhaengen mit Loeschdatum (ADR-017 Punkte 65, 67), feste Schluesselliste (ADR-023 Punkt 22), dazu Antwortfrist, Schreib- und Anhangrecht und Stand der Einwilligung. Ueber eine Vertretung protokolliert (Punkt 24). Ohne Recht null.';

-- -----------------------------------------------------------------------------
-- 2. Praxis: ein Vorgang mit seinen Anhaengen (ohne Objektschluessel)
-- -----------------------------------------------------------------------------
create or replace function public.get_platform_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_vorgang public.platform_messages%rowtype;
  v_name    record;
  v_zone    text;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'not allowed to read platform messages' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  v_vorgang := app.practice_message(p_message_id, false);
  select o.time_zone into v_zone from public.organizations o where o.id = v_org;

  select pe.given_name, pe.family_name into v_name
  from public.persons pe
  where pe.id = coalesce(
    (select pa.person_id from public.patients pa where pa.id = v_vorgang.patient_id),
    (select t.person_id from public.training_relationships t
      where t.id = v_vorgang.training_relationship_id));

  if v_vorgang.relationship_kind = 'treatment' then
    perform app.log_record_access(v_org, auth.uid(), 'patient_record.viewed', 'patient',
                                  v_vorgang.patient_id);
  else
    perform app.log_record_access(v_org, auth.uid(), 'training_relationship.viewed',
                                  'training_relationship', v_vorgang.training_relationship_id);
  end if;

  return jsonb_build_object(
    'id', v_vorgang.id,
    'relationship_kind', v_vorgang.relationship_kind,
    'relationship_id', v_vorgang.relationship_id,
    'patient_id', v_vorgang.patient_id,
    'training_relationship_id', v_vorgang.training_relationship_id,
    'given_name', v_name.given_name,
    'family_name', v_name.family_name,
    'topic', v_vorgang.topic,
    'reference_label', v_vorgang.reference_label,
    'exercise_plan_id', v_vorgang.exercise_plan_id,
    'status', v_vorgang.status,
    'due_on', v_vorgang.due_on,
    'overdue', v_vorgang.status = 'open' and v_vorgang.due_on < app.training_today(v_org),
    'created_at', v_vorgang.created_at,
    'closed_at', v_vorgang.closed_at,
    'closed_by_side', v_vorgang.closed_by_side,
    'record_assigned_at', v_vorgang.record_assigned_at,
    'record_assigned_by_label', v_vorgang.record_assigned_by_label,
    'can_answer', app.can_answer_platform_message(v_vorgang.relationship_kind, v_vorgang.topic),
    'can_assign', app.can_assign_platform_message(v_vorgang.relationship_kind)
                  and v_vorgang.record_assigned_at is null,
    -- KOM-005 (ADR-017 Punkt 67): sehen, wer den Vorgang liest; loeschen,
    -- wer antworten darf. Ohne Objektschluessel (ANN-052).
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'media_kind', x.media_kind,
        'mime_type', x.mime_type,
        'duration_seconds', x.duration_seconds,
        'created_at', x.created_at,
        'delete_on', ((x.created_at + app.retention_interval('rueckfrageanhang'))
                        at time zone coalesce(v_zone, 'Europe/Berlin'))::date,
        'author_kind', x.author_kind,
        'author_label', x.author_label,
        'server_verified', x.verified_at is not null,
        'malware_scanned', app.message_attachment_scan_required(),
        'object_missing', not exists (
          select 1 from storage.objects o
          where o.bucket_id = app.message_attachment_bucket() and o.name = x.object_key)
      ) order by x.created_at, x.id)
      from public.platform_message_attachments x
      where x.message_id = v_vorgang.id
        and app.message_attachment_visible(x)
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'side', e.side,
        'body', e.body,
        'author_kind', e.author_kind,
        'author_label', e.author_label,
        'created_at', e.created_at,
        'attachment_id', e.attachment_id,
        'attachment_mark_seconds', e.attachment_mark_seconds
      ) order by e.created_at, e.id)
      from public.platform_message_entries e
      where e.message_id = v_vorgang.id
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Antwort mit Zeitmarke (Punkt 68, ANN-338): optional ein Video dieses
--    Vorgangs und eine Sekunde darin. Keine Zeichnung, kein Einzelbild.
-- -----------------------------------------------------------------------------
drop function public.answer_platform_message(uuid, text);

create function public.answer_platform_message(
  p_message_id    uuid,
  p_body          text,
  p_attachment_id uuid default null,
  p_mark_seconds  integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vorgang public.platform_messages%rowtype;
  v_anhang  public.platform_message_attachments%rowtype;
  v_text    text;
  v_id      uuid;
begin
  if auth.uid() is null or not app.may_read_platform_messages('any') then
    raise exception 'not allowed to answer platform messages' using errcode = '42501';
  end if;
  v_vorgang := app.practice_message(p_message_id, true);
  if v_vorgang.status = 'closed' then
    raise exception 'message is closed' using errcode = '22023';
  end if;
  v_text := app.platform_message_body(p_body);

  if (p_attachment_id is null) <> (p_mark_seconds is null) then
    raise exception 'a mark needs its video' using errcode = '22023';
  end if;
  if p_attachment_id is not null then
    select x.* into v_anhang
    from public.platform_message_attachments x
    where x.id = p_attachment_id and x.message_id = v_vorgang.id and x.media_kind = 'video'
      and app.message_attachment_visible(x);
    if v_anhang.id is null then
      raise exception 'video not found' using errcode = 'P0002';
    end if;
    if p_mark_seconds < 0 or p_mark_seconds > v_anhang.duration_seconds then
      raise exception 'mark outside the video' using errcode = '22023';
    end if;
  end if;

  perform 1 from public.platform_messages m where m.id = v_vorgang.id for update;

  insert into public.platform_message_entries (
    organization_id, message_id, side, body, access_id, author_kind, author_label, created_by,
    attachment_id, attachment_mark_seconds
  )
  values (
    v_vorgang.organization_id, v_vorgang.id, 'practice', v_text, null, 'staff',
    app.current_display_name(), auth.uid(), v_anhang.id, p_mark_seconds
  )
  returning id into v_id;

  update public.platform_messages m
     set status = 'answered', due_on = null, last_entry_at = now()
   where m.id = v_vorgang.id;
  return v_id;
end;
$$;

revoke all on function public.answer_platform_message(uuid, text, uuid, integer) from public, anon;
grant execute on function public.answer_platform_message(uuid, text, uuid, integer) to authenticated;

comment on function public.answer_platform_message(uuid, text, uuid, integer) is
  'KOM-002/005: Antwort der Praxis auf einen offenen oder beantworteten Vorgang (ANN-308), optional mit Zeitmarke in einem Video des Vorgangs (ADR-017 Punkt 68, ANN-338). Wer antworten darf: app.can_answer_platform_message (ANN-310, ANN-311).';

-- -----------------------------------------------------------------------------
-- 4. Erteilen und widerrufen: der Widerruf zu Anhaengen loescht sofort.
--    Rumpf sonst unveraendert aus 20261013110000_por_017_training_consent.sql.
-- -----------------------------------------------------------------------------
create or replace function public.record_platform_consent(
  p_access_id       uuid,
  p_purpose         text,
  p_grant           boolean,
  p_wording_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_zone    text;
  v_heute   date;
  v_letzte  text;
  v_zeit    timestamptz;
  v_art     text;
  v_name    text;
  v_id      uuid;
begin
  if p_grant is null then
    raise exception 'grant or withdraw' using errcode = '22023';
  end if;
  -- Erteilen nur mit dem Recht consent (Person, rechtliche Vertretung, in der
  -- Lesezeit); widerrufen zusaetzlich die Person selbst nach der Lesefrist.
  if not (app.platform_access_allows(p_access_id, 'consent')
          or (not p_grant and app.platform_own_access_after_reading(p_access_id))) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  if p_purpose is null
     or not (p_purpose = any (app.platform_consent_purposes(v_zugang.relationship_kind))) then
    raise exception 'unknown purpose' using errcode = '22023';
  end if;
  if p_wording_version is distinct from app.platform_consent_wording_version() then
    raise exception 'wording outdated' using errcode = '22023';
  end if;

  -- Gleichzeitige Aufrufe desselben Verhaeltnisses nacheinander: Der Stand,
  -- gegen den geprueft wird, ist der, auf den geschrieben wird.
  if v_zugang.relationship_kind = 'treatment' then
    perform 1 from public.patients p
    where p.id = v_zugang.relationship_id and p.organization_id = v_zugang.organization_id
    for update;
  else
    perform 1 from public.training_relationships t
    where t.id = v_zugang.relationship_id and t.organization_id = v_zugang.organization_id
    for update;
  end if;
  if not found then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;

  if v_zugang.relationship_kind = 'treatment' then
    select r.record_kind into v_letzte
    from public.patient_privacy_records r
    where r.patient_id = v_zugang.relationship_id and r.purpose = p_purpose
    order by r.recorded_at desc, r.id desc
    limit 1;
  else
    select r.record_kind into v_letzte
    from public.training_consent_records r
    where r.training_relationship_id = v_zugang.relationship_id and r.purpose = p_purpose
    order by r.recorded_at desc, r.id desc
    limit 1;
  end if;

  -- Der neue Vermerk ist der juengste, auch wenn ein gleichzeitiger Aufruf
  -- spaeter begann und vorher schrieb (Zweitreview): now(), mindestens aber
  -- eine Mikrosekunde nach dem bisher juengsten.
  if v_zugang.relationship_kind = 'treatment' then
    select greatest(now(), max(r.recorded_at) + interval '1 microsecond') into v_zeit
    from public.patient_privacy_records r where r.patient_id = v_zugang.relationship_id;
  else
    select greatest(now(), max(r.recorded_at) + interval '1 microsecond') into v_zeit
    from public.training_consent_records r
    where r.training_relationship_id = v_zugang.relationship_id;
  end if;
  v_zeit := coalesce(v_zeit, now());

  if p_grant then
    if v_letzte is not distinct from 'consent_granted' then
      raise exception 'consent already granted' using errcode = '23514';
    end if;
    v_art := 'consent_granted';
  else
    if v_letzte is distinct from 'consent_granted' then
      raise exception 'no consent to withdraw' using errcode = '23514';
    end if;
    v_art := 'consent_withdrawn';
  end if;

  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;
  v_heute := (now() at time zone coalesce(v_zone, 'Europe/Berlin'))::date;
  v_name := case when v_zugang.access_kind = 'legal_representative'
                 then v_zugang.representative_name end;

  if v_zugang.relationship_kind = 'treatment' then
    insert into public.patient_privacy_records (
      organization_id, patient_id, record_kind, purpose, occurred_on, recorded_by, recorded_at,
      source, platform_access_id, platform_access_kind, representative_name, wording_version
    )
    values (
      v_zugang.organization_id, v_zugang.relationship_id, v_art, p_purpose, v_heute, auth.uid(),
      v_zeit,
      'platform', v_zugang.id, v_zugang.access_kind, v_name, p_wording_version
    )
    returning id into v_id;

    -- ADR-017 Punkt 36: Der Widerruf der Fotoeinwilligung loescht sofort.
    if v_art = 'consent_withdrawn' and p_purpose = 'patient_photos' then
      perform app.delete_due_patient_photos(
        v_zugang.organization_id, v_zugang.relationship_id, extensions.gen_random_uuid(),
        auth.uid(), 'consent_withdrawn'
      );
    end if;
  else
    insert into public.training_consent_records (
      organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by,
      recorded_at, source, platform_access_id, platform_access_kind, representative_name,
      wording_version
    )
    values (
      v_zugang.organization_id, v_zugang.relationship_id, v_art, p_purpose, v_heute, auth.uid(),
      v_zeit,
      'platform', v_zugang.id, v_zugang.access_kind, v_name, p_wording_version
    )
    returning id into v_id;
  end if;

  -- KOM-005 (ADR-017 Punkt 61): Der Widerruf der Einwilligung zu Anhaengen
  -- loescht sofort alle Anhaenge des Verhaeltnisses, in derselben
  -- Transaktion, mit Loeschjournal und Loeschauftraegen; unter Legal Hold
  -- gesperrt (ANN-335).
  if v_art = 'consent_withdrawn' and p_purpose = 'message_attachments' then
    perform app.remove_message_attachments(
      v_zugang.organization_id, 'relationship', v_zugang.relationship_id,
      extensions.gen_random_uuid());
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read',
    jsonb_build_object('view', case when p_grant then 'consent_granted' else 'consent_withdrawn' end)
  );
  return v_id;
end;
$$;

comment on function public.record_platform_consent(uuid, text, boolean, text) is
  'POR-016/017, KOM-005: Einwilligung erteilen oder widerrufen ueber die Plattform (ADR-023 Punkt 13), Behandlung und Training. Recht consent; widerrufen auch die Person selbst nach der Lesefrist (ANN-261). Zeile mit Herkunft und Textfassung (ANN-262); Widerruf der Fotos loescht sofort (ADR-017 Punkt 36), ebenso der Widerruf zu Anhaengen an Rueckfragen (Punkt 61).';

-- -----------------------------------------------------------------------------
-- 5. Loeschlauf und Wiederanwendung des Journals: + Anhaenge (Punkt 65)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_retention()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_steuer    integer;
  v_verhaelt  record;
  v_training  integer;
  v_termine   integer;
  v_audit     integer;
  v_auftraege integer;
  v_journal   integer;
  v_zugang    integer;
  v_fotos     integer;
  v_warte     integer;
  v_aufgaben  integer;
  v_anrufe    integer;
  v_konten    integer;
  v_plattform integer;
  v_wuensche  integer;
  v_nachrichten integer;
  v_anhaenge  integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 1 (POR-002, ADR-023 Punkt 5, ANN-189): Konten beim
    -- Anmeldedienst, 30 Tage nach dem Ende des letzten Zugangs. VOR den
    -- Verhaeltnissen: Solange das Verhaeltnis steht, ist das Ende seines
    -- Zugangs das Ende der Lesefrist (DSN-001 D2) und nicht der Tag, an dem
    -- der Lauf das Verhaeltnis loescht.
    -- -------------------------------------------------------------------
    v_konten := app.delete_due_platform_accounts(v_org.id, v_run);

    -- -------------------------------------------------------------------
    -- Patientenfotos: zwoelf Monate ab Aufnahme, spaetestens drei Monate
    -- nach dem festgehaltenen Abschluss, Widerruf (ADR-017 Punkt 38).
    -- Ein Legal Hold haelt an.
    -- -------------------------------------------------------------------
    v_fotos := app.delete_due_patient_photos(v_org.id, null, v_run, null, 'retention');

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Versorgung
    -- -------------------------------------------------------------------
    for v_akte in
      select p.id,
             app.retention_due_at(
               p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
             ) as due_at
      from public.patients p
      where p.organization_id = v_org.id
        and p.care_concluded_on is not null
        and app.retention_due_at(
              p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
            ) <= now()
      order by p.care_concluded_on
      for update of p skip locked
    loop
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      -- Neu mit ABR-003: Die steuerliche Frist einer ausgestellten Rechnung
      -- kann die zehn Jahre der Akte ueberdauern. Gesetzliche Aufbewahrung
      -- hat Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2).
      if app.billing_retention_due_at(v_akte.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Trainingsverhaeltnis: drei Jahre ab Vertragsende (ADR-021 Punkt 4)
    --
    -- Eigene Schleife und nicht ein Zweig der Akte: Die Frist ist kuerzer,
    -- der Anker ein anderer, und die Rechtsgrundlage traegt die
    -- Heilbehandlungs-Ausnahme nicht. Ohne Vertragsende laeuft keine Frist -
    -- ein laufendes Training wird nie geloescht.
    --
    -- KEIN LEGAL HOLD, UND ZWAR ABSICHTLICH: Loeschsperren stehen heute auf
    -- Patientenebene (ANN-033); ein Hold auf ein Trainingsverhaeltnis ist
    -- nicht darstellbar und waere hier eine Pruefung ohne Gegenstand. Wer
    -- eine Loeschung anhalten muss, raeumt bis dahin contract_ended_on - der
    -- Anker ist genau dafuer ruecknehmbar gebaut (LEI-001). Eine Sperre in
    -- der Behandlung wirkt nicht hierher: Der Hold haengt am Verhaeltnis
    -- (ADR-021), und die gemeinsame Person haelt sie ueber die Akte.
    --
    -- SKIP LOCKED wie bei der Akte: ein Verhaeltnis, an dem gerade jemand
    -- arbeitet, kommt im naechsten Lauf erneut dran.
    -- -------------------------------------------------------------------
    for v_verhaelt in
      select t.id,
             app.retention_due_at(
               t.contract_ended_on,
               app.retention_interval('trainingsverhaeltnis'),
               v_org.time_zone
             ) as due_at
      from public.training_relationships t
      where t.organization_id = v_org.id
        and t.contract_ended_on is not null
        and app.retention_due_at(
              t.contract_ended_on,
              app.retention_interval('trainingsverhaeltnis'),
              v_org.time_zone
            ) <= now()
      order by t.contract_ended_on
      for update of t skip locked
    loop
      -- TRN-008 (ANN-183): Die steuerliche Frist der Belege kann die drei
      -- Jahre des Verhaeltnisses ueberdauern. Gesetzliche Aufbewahrung hat
      -- Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2) - dieselbe
      -- Regel wie an der Akte.
      if app.training_billing_retention_due_at(v_verhaelt.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        -- Zweitreview: gehalten werden nur die Belege und was sie tragen;
        -- der Rest faellt nach den drei Jahren aus ADR-021 Punkt 4.
        v_training := v_training
          + app.reduce_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
        continue;
      end if;

      v_training := v_training
        + app.delete_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- Vorgang mit Gebuehrenanlass bleibt stehen: er ist die Grundlage
    -- einer Forderung (ANN-035, CAL-014b). Die mit der Abrechnung
    -- angekuendigte Bedingung "ohne Rechnung" ist damit erfuellt: Eine
    -- Rechnung kann nur an einem dokumentierten Termin oder an einem
    -- Gebuehrenanlass haengen, und beide nimmt die Abfrage bereits aus.
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc(
                  'year',
                  coalesce(a.cancelled_at, a.no_show_recorded_at) at time zone v_org.time_zone
                ) + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.fee_basis is null
        -- CAL-026: NUR Praxistermine. Ein Trainingstermin faellt mit seinem
        -- Verhaeltnis (oben) und nach dessen Frist - nicht hier. Zwei Gruende,
        -- und beide sind hart: Diese Frist rechnet ab Kalenderjahresende statt
        -- ab Vertragsende, und die Sperrpruefung darunter laeuft ueber
        -- a.patient_id, der am Trainingstermin leer ist - eine Sperre am
        -- Verhaeltnis haette die Zeile nicht gehalten (ADR-022, Konsequenzen).
        and a.kind <> 'training'
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show' and a.no_show_recorded_at is not null)
        )
        and not exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointments a
      using faellig f
      where a.id = f.id
        and f.due_at <= now()
      returning a.id, a.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointments', g.id, 'termin_ohne_nachweis', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_termine = row_count;

    -- -------------------------------------------------------------------
    -- Auditlog: drei Jahre ab dem Ereignis (ANN-029)
    -- -------------------------------------------------------------------
    -- LOG-EPIC-001: zwei Klassen (app.audit_retention_class), und ein Legal
    -- Hold haelt jede Zeile seiner Akte - ueber den Gegenstand oder
    -- context.patient_id, auch fuer zusammengefuehrte Doppelanlagen.
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval(app.audit_retention_class(a.action))
        and not app.audit_entry_held(v_org.id, a.subject_type, a.subject_id, a.context)
      returning a.id, a.organization_id, a.occurred_at, app.audit_retention_class(a.action) as klasse
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, g.klasse,
           g.occurred_at + app.retention_interval(g.klasse)
    from geloescht g;
    get diagnostics v_audit = row_count;

    -- -------------------------------------------------------------------
    -- Quittierte Loeschauftraege der Ablage: drei Jahre ab der Quittung
    -- (LOG-EPIC-001). Offene Auftraege bleiben. Nicht im Journal: Ein
    -- Auftrag ist selbst der Nachweis einer Loeschung, kein Fachdatensatz.
    -- -------------------------------------------------------------------
    delete from public.storage_deletion_orders o
    where o.organization_id = v_org.id
      and o.receipted_at is not null
      and o.receipted_at < now() - app.retention_interval('loeschauftrag');
    get diagnostics v_auftraege = row_count;

    -- -------------------------------------------------------------------
    -- Loeschjournal: 60 Tage ab der Loeschung (ADR-012: Backups 30 Tage,
    -- dazu 30 Tage Puffer). Zuletzt, damit die Eintraege dieses Laufs nicht
    -- mitfallen.
    -- -------------------------------------------------------------------
    delete from public.deletion_journal j
    where j.organization_id = v_org.id
      and j.deleted_at < now() - app.retention_interval('loeschjournal');
    get diagnostics v_journal = row_count;

    -- -------------------------------------------------------------------
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs (ANN-026)
    -- -------------------------------------------------------------------
    with faellig as (
      select i.id,
             i.organization_id,
             coalesce(
               i.accepted_at,
               i.revoked_at,
               case when i.status = 'pending' and i.expires_at <= now() then i.expires_at end
             ) + app.retention_interval('zugangseinladung') as due_at
      from public.staff_account_invitations i
      where i.organization_id = v_org.id
    ),
    geloescht as (
      delete from public.staff_account_invitations i
      using faellig f
      where i.id = f.id
        and f.due_at is not null
        and f.due_at <= now()
      returning i.id, i.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'staff_account_invitations', g.id, 'zugangseinladung', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_zugang = row_count;

    -- -------------------------------------------------------------------
    -- Warteliste: zwoelf Monate nach dem Schliessen (ANN-133). Offene
    -- Eintraege fallen nur mit der Akte. Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.closed_at + app.retention_interval('warteliste') as due_at
      from public.waitlist_entries w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.closed_at is not null
        and not app.under_legal_hold(v_org.id, 'patient', w.patient_id)
    ),
    geloescht as (
      delete from public.waitlist_entries w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'waitlist_entries', g.id, 'warteliste', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_warte = row_count;

    -- -------------------------------------------------------------------
    -- Aufgaben: zwoelf Monate nach dem Erledigen (ANN-142). Offene
    -- Aufgaben bleiben; mit Personenbezug fallen sie mit der Akte. Ein
    -- Legal Hold an der Akte haelt auch die erledigte Aufgabe.
    -- -------------------------------------------------------------------
    with faellig as (
      select k.id,
             k.organization_id,
             k.done_at + app.retention_interval('aufgabe') as due_at
      from public.tasks k
      where k.organization_id = v_org.id
        and k.status = 'done'
        and k.done_at is not null
        and (k.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', k.patient_id))
    ),
    geloescht as (
      delete from public.tasks k
      using faellig f
      where k.id = f.id
        and f.due_at <= now()
      returning k.id, k.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'tasks', g.id, 'aufgabe', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_aufgaben = row_count;

    -- -------------------------------------------------------------------
    -- Anrufstand: vierzehn Tage nach dem Termin (ANN-144). Ein "nicht
    -- erreicht" soll kein Merkmal der Person werden (§20, IDEA-PRX-041).
    -- -------------------------------------------------------------------
    with faellig as (
      select c.id,
             c.organization_id,
             a.starts_at + app.retention_interval('anrufstand') as due_at
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where c.organization_id = v_org.id
        -- Ein Legal Hold an der Akte haelt auch den Anrufstand (ADR-008
        -- Punkt 7, Zweitreview).
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointment_call_states c
      using faellig f
      where c.id = f.id
        and f.due_at <= now()
      returning c.id, c.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointment_call_states', g.id, 'anrufstand', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_anrufe = row_count;

    -- -------------------------------------------------------------------
    -- Terminwuensche der Plattform (POR-009, ANN-246): zwoelf Monate nach
    -- der Antwort der Praxis bzw. dem Zurueckziehen. Offene Wuensche
    -- bleiben; mit dem Verhaeltnis fallen sie ohnehin (cascade). Ein Legal
    -- Hold an der Akte haelt auch den beantworteten Wunsch.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.resolved_at + app.retention_interval('terminwunsch') as due_at
      from public.platform_appointment_requests w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.resolved_at is not null
        and (w.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', w.patient_id))
    ),
    geloescht as (
      delete from public.platform_appointment_requests w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_appointment_requests', g.id, 'terminwunsch', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_wuensche = row_count;

    -- -------------------------------------------------------------------
    -- KOM-005 (ADR-017 Punkt 65): Anhaenge an Rueckfragen, 30 Tage ab der
    -- Aufnahme oder ab ihrer Sperre. Vor den Vorgaengen: ein Anhang, der mit
    -- seinem Vorgang faellt, steht nicht doppelt im Journal. Ein Legal Hold
    -- an der Akte haelt (gesperrt, ANN-335).
    -- -------------------------------------------------------------------
    v_anhaenge := app.remove_message_attachments(v_org.id, 'due', null, v_run);

    -- -------------------------------------------------------------------
    -- Nachrichten der Behandlung (KOM-001, ADR-008 "Organisatorische
    -- Patientenkommunikation", ANN-001): drei Jahre ab Ende des
    -- Kalenderjahres, in dem der Vorgang abgeschlossen wurde: erledigt, oder
    -- beantwortet und danach nichts mehr von der Person (Anker: die letzte
    -- Antwort; Zweitreview S1, ANN-308). Offene bleiben; der Akte
    -- zugeordnete (KOM-004, ANN-312) fallen erst mit ihr; im Training fallen
    -- sie mit dem Verhaeltnis (cascade). Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select m.id,
             m.organization_id,
             app.retention_due_at(
               (date_trunc('year', coalesce(m.closed_at, m.last_entry_at)
                                     at time zone v_org.time_zone)
                 + interval '1 year' - interval '1 day')::date,
               app.retention_interval('patientenkommunikation'),
               v_org.time_zone
             ) as due_at
      from public.platform_messages m
      where m.organization_id = v_org.id
        and m.relationship_kind = 'treatment'
        and m.status in ('closed', 'answered')
        and m.record_assigned_at is null
        and not app.under_legal_hold(v_org.id, 'patient', m.patient_id)
    ),
    geloescht as (
      delete from public.platform_messages m
      using faellig f
      where m.id = f.id
        and f.due_at <= now()
      returning m.id, m.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_messages', g.id, 'patientenkommunikation', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_nachrichten = row_count;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 2 (POR-002, ANN-189): Zugaenge mit ihren Einladungen,
    -- drei Jahre nach ihrem Ende. Nach den Verhaeltnissen oben: Ein im
    -- selben Lauf geloeschtes Verhaeltnis hat seinen Zugang da schon beendet.
    -- -------------------------------------------------------------------
    v_plattform := app.delete_due_platform_accesses(v_org.id, v_run);

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte
                + v_aufgaben + v_anrufe + v_konten + v_plattform + v_wuensche + v_nachrichten + v_anhaenge;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal + v_wuensche + v_nachrichten + v_anhaenge > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenfoto', v_fotos,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'loeschauftrag', v_auftraege,
          'loeschjournal', v_journal,
          'zugangseinladung', v_zugang,
          'warteliste', v_warte,
          'aufgabe', v_aufgaben,
          'anrufstand', v_anrufe,
          'plattformkonto', v_konten,
          'plattformzugang', v_plattform,
          'terminwunsch', v_wuensche,
          'patientenkommunikation', v_nachrichten,
          'rueckfrageanhang', v_anhaenge,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

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

  -- Die Wiederanwendung weist deletion_journal.reapplied_at nach (LOG-EPIC-001).

  return v_gesamt;
end;
$function$;


-- -----------------------------------------------------------------------------
-- 6. Praxis: der Widerruf vom Papier loescht ebenso; erteilt wird auf der
--    Plattform (ANN-333). Rumpf sonst unveraendert aus
--    20261013140000_por_021_zweitreview.sql.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_patient_privacy_entry(p_patient_id uuid, p_record_kind text, p_purpose text, p_notice_version text, p_occurred_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_zone     text;
  v_letzte   record;
  v_id       uuid;
  v_zeit     timestamptz;
  v_fotos    integer := 0;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_update_patient() then
    raise exception 'not allowed to record privacy entries' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record privacy entries' using errcode = '42501';
  end if;

  -- Eine fremde Akte und eine nicht vorhandene sehen gleich aus (ADR-003).
  perform 1
  from public.patients p
  where p.id = p_patient_id and p.organization_id = v_org
  for update;

  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if p_occurred_on is null then
    raise exception 'date is required' using errcode = '22023';
  end if;

  select o.time_zone into v_zone from public.organizations o where o.id = v_org;
  if p_occurred_on > (now() at time zone coalesce(v_zone, 'Europe/Berlin'))::date then
    raise exception 'date lies in the future' using errcode = '22023';
  end if;

  -- KOM-005 (ADR-017 Punkt 61, ANN-333): Die Einwilligung zu Anhaengen an
  -- Rueckfragen erteilt die Person auf der Plattform, wenn sie zum ersten Mal
  -- etwas anhaengen will. Die Praxis vermerkt nur den Widerruf vom Papier.
  if p_purpose = 'message_attachments' and p_record_kind <> 'consent_withdrawn' then
    raise exception 'this consent is given on the platform' using errcode = '22023';
  end if;

  if p_record_kind in ('consent_granted', 'consent_withdrawn', 'consent_refused') then
    select r.record_kind, r.occurred_on
      into v_letzte
    from public.patient_privacy_records r
    where r.patient_id = p_patient_id
      and r.purpose = p_purpose
    order by r.recorded_at desc, r.id desc
    limit 1;

    if p_record_kind = 'consent_granted'
       and v_letzte.record_kind is not distinct from 'consent_granted' then
      raise exception 'consent already granted' using errcode = '23514';
    end if;

    if p_record_kind = 'consent_withdrawn' then
      if v_letzte.record_kind is distinct from 'consent_granted' then
        raise exception 'no consent to withdraw' using errcode = '23514';
      end if;
      if p_occurred_on < v_letzte.occurred_on then
        raise exception 'withdrawal before consent' using errcode = '22023';
      end if;
    end if;

    -- Punkt 35: Eine Ablehnung ist ein eigener Vermerk, kein Widerruf. Wer
    -- eingewilligt hat, widerruft; zweimal hintereinander abgelehnt ist
    -- nichts Neues.
    if p_record_kind = 'consent_refused' then
      if v_letzte.record_kind is not distinct from 'consent_granted' then
        raise exception 'consent is granted, record a withdrawal' using errcode = '23514';
      end if;
      if v_letzte.record_kind is not distinct from 'consent_refused' then
        raise exception 'consent already refused' using errcode = '23514';
      end if;
    end if;
  end if;

  -- Wertebereich und Form pruefen die Constraints der Tabelle.
  -- POR-016 (Zweitreview): Der neue Vermerk ist der juengste, auch wenn
  -- ein gleichzeitiger Aufruf spaeter begann und vorher schrieb.
  select greatest(now(), max(r.recorded_at) + interval '1 microsecond') into v_zeit
  from public.patient_privacy_records r
  where r.patient_id = p_patient_id;
  v_zeit := coalesce(v_zeit, now());

  insert into public.patient_privacy_records (
    organization_id, patient_id, record_kind, purpose, notice_version,
    occurred_on, recorded_by, recorded_at
  )
  values (
    v_org, p_patient_id, p_record_kind, p_purpose, p_notice_version,
    p_occurred_on, v_actor, v_zeit
  )
  returning id into v_id;

  -- Punkt 36: Der Widerruf der Fotoeinwilligung sperrt sofort und loescht in
  -- derselben Transaktion - Zeilen, Loeschauftraege, Loeschjournal. Unter
  -- Legal Hold bleiben die Fotos gesperrt stehen (release_legal_hold).
  if p_record_kind = 'consent_withdrawn' and p_purpose = 'patient_photos' then
    v_fotos := app.delete_due_patient_photos(
      v_org, p_patient_id, extensions.gen_random_uuid(), v_actor, 'consent_withdrawn'
    );
  end if;

  -- KOM-005 (Punkt 61): Der Widerruf zu Anhaengen loescht sofort alle
  -- Anhaenge der Akte, auch vom Papier vermerkt.
  if p_record_kind = 'consent_withdrawn' and p_purpose = 'message_attachments' then
    perform app.remove_message_attachments(
      v_org, 'relationship', p_patient_id, extensions.gen_random_uuid());
  end if;


  return v_id;
end;
$function$;
