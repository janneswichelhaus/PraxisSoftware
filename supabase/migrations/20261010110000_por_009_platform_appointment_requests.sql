-- =============================================================================
-- POR-009: Terminwunsch ueber die Plattform (PROJECT_PRINCIPLES.md 8, DSN-001
-- 4.1 "Termine", D4; ADR-018 Punkt 1; ADR-023 Punkte 19, 22, 23, 24)
--
-- Ein Wunsch ist ein Wunsch: Einen Termin daraus macht das Buero (8). Der
-- Wunsch ist ein EIGENER Datensatz und kein Termin im Zustand "angefragt"
-- (ANN-243): Er nennt Tage und Tageszeiten, keinen Zeitraum, und darf
-- deshalb weder Belegung noch Raster beruehren. Die Terminzustaende
-- `requested` und `tentative` aus ADR-018 bleiben beschrieben und nicht
-- gebaut - sie entstehen, wenn eine Person aus angebotenen Zeitfenstern
-- waehlt (DSN-001 4.1, "ist auch die Auswahl ein Wunsch").
--
-- Drei Arten (kind): `new` (Termin wuenschen), `change` und `cancel` am
-- eigenen Termin (POR-010). Der Zustand: offen, erledigt, nicht moeglich,
-- zurueckgezogen. Wer den Wunsch geschrieben hat, steht am Datensatz
-- (Zugang und Konto) - das ist der Nachweis (ADR-010 Fassung 3), kein
-- Auditeintrag. Ueber eine Vertretung ist der Aufruf protokolliert
-- (ADR-023 Punkt 24, ANN-209).
--
-- Datenklasse `terminwunsch` (ANN-243): zwoelf Monate nach der Antwort, wie
-- Terminanfragen in ADR-008 (ANN-001); offene Wuensche bleiben, mit dem
-- Verhaeltnis fallen sie. Regel im Loeschlauf unten.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Tabelle
-- -----------------------------------------------------------------------------
create table public.platform_appointment_requests (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  relationship_kind        text not null check (relationship_kind in ('treatment', 'training')),
  relationship_id          uuid not null,
  -- Die lebenden Verweise: Faellt das Verhaeltnis, faellt der Wunsch.
  patient_id               uuid references public.patients (id) on delete cascade,
  training_relationship_id uuid references public.training_relationships (id) on delete cascade,
  -- Der Termin, um den es geht (change, cancel). Faellt er, bleibt der Wunsch
  -- als beantworteter Vorgang ohne Termin stehen.
  appointment_id           uuid references public.appointments (id) on delete set null,
  kind                     text not null check (kind in ('new', 'change', 'cancel')),
  -- Welche Tage passen (hoechstens 14) und welche Tageszeiten.
  preferred_days           date[] not null default '{}'
                             check (cardinality(preferred_days) <= 14),
  preferred_times          text[] not null default '{}'
                             check (preferred_times <@ array['morning', 'midday', 'afternoon']::text[]),
  note                     text check (note is null or length(btrim(note)) between 1 and 500),
  status                   text not null default 'open'
                             check (status in ('open', 'done', 'declined', 'withdrawn')),
  -- Wer den Wunsch geschrieben hat: der Zugang (Person oder Vertretung,
  -- ADR-023 Punkt 14) und das Konto dahinter. Kein FK auf das Konto - es
  -- faellt frueher als der Nachweis (Punkt 5).
  created_by_access_id     uuid not null references public.platform_accesses (id) on delete cascade,
  created_by               uuid not null,
  created_at               timestamptz not null default now(),
  -- Die Antwort der Praxis (POR-011) bzw. das Zurueckziehen durch die Person.
  resolved_at              timestamptz,
  resolved_by              uuid,
  answer                   text check (answer is null or length(btrim(answer)) between 1 and 300),
  -- Bei "erledigt" an einem neuen Wunsch: der Termin, der daraus wurde.
  resulting_appointment_id uuid references public.appointments (id) on delete set null,

  constraint platform_appointment_requests_relationship_matches check (
    (relationship_kind = 'treatment' and training_relationship_id is null
       and patient_id = relationship_id)
    or (relationship_kind = 'training' and patient_id is null
       and training_relationship_id = relationship_id)
  ),
  -- Ein neuer Wunsch nennt mindestens einen Tag und keinen Termin; eine
  -- Aenderung oder Absage nennt ihren Termin.
  constraint platform_appointment_requests_kind_fields check (
    (kind = 'new' and appointment_id is null and cardinality(preferred_days) >= 1)
    or (kind in ('change', 'cancel'))
  ),
  constraint platform_appointment_requests_resolution_stamp check (
    (status = 'open') = (resolved_at is null)
  ),
  constraint platform_appointment_requests_resolved_by_needs_at check (
    resolved_by is null or resolved_at is not null
  ),
  constraint platform_appointment_requests_answer_needs_resolution check (
    answer is null or status in ('done', 'declined')
  ),
  constraint platform_appointment_requests_result_needs_done check (
    resulting_appointment_id is null or status = 'done'
  )
);

comment on table public.platform_appointment_requests is
  'Terminwunsch ueber die Plattform (POR-009, ANN-243): Tage und Tageszeiten oder eine Aenderung bzw. Absage am eigenen Termin; einen Termin macht daraus das Buero (PROJECT_PRINCIPLES.md 8). Datenklasse: Terminwunsch, zwoelf Monate nach der Antwort.';
comment on column public.platform_appointment_requests.created_by is
  'auth.users.id des schreibenden Kontos; bei einer Vertretung das Konto der vertretenden Person (ADR-023 Punkt 14).';

-- Hoechstens ein offener Wunsch je Termin (POR-010).
create unique index platform_appointment_requests_one_open_per_appointment
  on public.platform_appointment_requests (appointment_id)
  where status = 'open' and appointment_id is not null;

create index platform_appointment_requests_org_open_idx
  on public.platform_appointment_requests (organization_id, status);
create index platform_appointment_requests_relationship_idx
  on public.platform_appointment_requests (relationship_id);
create index platform_appointment_requests_patient_idx
  on public.platform_appointment_requests (patient_id) where patient_id is not null;
create index platform_appointment_requests_training_idx
  on public.platform_appointment_requests (training_relationship_id)
  where training_relationship_id is not null;

-- Gelesen und geschrieben wird nur ueber Funktionen (ADR-023 Punkt 19).
alter table public.platform_appointment_requests enable row level security;
revoke all on public.platform_appointment_requests from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Datenklasse (ADR-008; ANN-243)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('terminwunsch', 'intern', null, 'case_closed', interval '1 year', 'ANN-243',
   'Terminwunsch ueber die Plattform: zwoelf Monate nach der Antwort der Praxis bzw. dem Zurueckziehen, wie Terminanfragen (ANN-001). Offene Wuensche bleiben; mit dem Verhaeltnis fallen sie.',
   76);

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('platform_appointment_requests', 'terminwunsch', 'automatisch',
   'Beantwortete und zurueckgezogene Wuensche zwoelf Monate nach der Antwort; offene bleiben; mit Akte bzw. Trainingsverhaeltnis fallen sie (cascade).', 76);

-- -----------------------------------------------------------------------------
-- 3. Termin wuenschen (DSN-001 4.1)
-- -----------------------------------------------------------------------------
create function public.request_platform_appointment(
  p_access_id uuid,
  p_days      date[],
  p_times     text[],
  p_note      text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_zone   text;
  v_heute  date;
  v_tage   date[];
  v_id     uuid;
begin
  -- Wuenschen duerfen alle drei Arten des Zugangs (ADR-023 Punkt 13, W3).
  if not app.platform_access_allows(p_access_id, 'request') then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  select o.time_zone into v_zone from public.organizations o where o.id = v_zugang.organization_id;
  v_heute := (now() at time zone v_zone)::date;

  -- Tage: mindestens einer, hoechstens 14, keiner vor heute, keiner weiter
  -- als ein Jahr voraus; doppelte werden zusammengefasst.
  select array_agg(distinct t order by t) into v_tage
  from unnest(coalesce(p_days, '{}'::date[])) t;
  if v_tage is null or cardinality(v_tage) = 0 then
    raise exception 'at least one day is required' using errcode = '22023';
  end if;
  if cardinality(v_tage) > 14 then
    raise exception 'too many days' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_tage) t where t < v_heute or t > v_heute + 365) then
    raise exception 'day out of range' using errcode = '22023';
  end if;
  if not (coalesce(p_times, '{}'::text[]) <@ array['morning', 'midday', 'afternoon']::text[]) then
    raise exception 'unknown time of day' using errcode = '22023';
  end if;
  if p_note is not null and length(btrim(p_note)) > 500 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  insert into public.platform_appointment_requests (
    organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
    kind, preferred_days, preferred_times, note, created_by_access_id, created_by
  )
  values (
    v_zugang.organization_id, v_zugang.relationship_kind, v_zugang.relationship_id,
    v_zugang.patient_id, v_zugang.training_relationship_id,
    'new', v_tage,
    (select coalesce(array_agg(distinct t), '{}'::text[]) from unnest(coalesce(p_times, '{}'::text[])) t),
    nullif(btrim(p_note), ''), v_zugang.id, auth.uid()
  )
  returning id into v_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'request')
  );
  return v_id;
end;
$$;

revoke all on function public.request_platform_appointment(uuid, date[], text[], text) from public, anon;
grant execute on function public.request_platform_appointment(uuid, date[], text[], text) to authenticated;

comment on function public.request_platform_appointment(uuid, date[], text[], text) is
  'POR-009: Termin wuenschen ueber die Plattform (PROJECT_PRINCIPLES.md 8, ANN-243): Tage, Tageszeiten, freie Zeile. Ein Wunsch, kein Termin; Recht request (alle Arten des Zugangs). Nachweis am Datensatz, Vertretung protokolliert.';

-- -----------------------------------------------------------------------------
-- 4. Die eigenen Wuensche lesen
-- -----------------------------------------------------------------------------
create function public.platform_appointment_requests(p_access_id uuid)
returns table (
  id              uuid,
  kind            text,
  appointment_id  uuid,
  preferred_days  date[],
  preferred_times text[],
  note            text,
  status          text,
  created_at      timestamptz,
  resolved_at     timestamptz,
  answer          text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'requests')
  );

  return query
  select w.id, w.kind, w.appointment_id, w.preferred_days, w.preferred_times, w.note,
         w.status, w.created_at, w.resolved_at, w.answer
  from public.platform_appointment_requests w
  where w.organization_id = v_zugang.organization_id
    and w.relationship_kind = v_zugang.relationship_kind
    and w.relationship_id = v_zugang.relationship_id
  order by (w.status <> 'open'), w.created_at desc, w.id;
end;
$$;

revoke all on function public.platform_appointment_requests(uuid) from public, anon;
grant execute on function public.platform_appointment_requests(uuid) to authenticated;

comment on function public.platform_appointment_requests(uuid) is
  'POR-009: Plattformprojektion der eigenen Terminwuensche des Verhaeltnisses (offene zuerst), mit Zustand und Antwort der Praxis. Nur ueber einen lesbaren Zugang; Vertretung protokolliert (ADR-023 Punkt 24).';

-- -----------------------------------------------------------------------------
-- 5. Einen offenen Wunsch zurueckziehen
-- -----------------------------------------------------------------------------
create function public.withdraw_platform_appointment_request(p_access_id uuid, p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'request') then
    return false;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  update public.platform_appointment_requests w
     set status = 'withdrawn', resolved_at = now(), resolved_by = auth.uid()
   where w.id = p_request_id
     and w.organization_id = v_zugang.organization_id
     and w.relationship_kind = v_zugang.relationship_kind
     and w.relationship_id = v_zugang.relationship_id
     and w.status = 'open';
  if not found then
    return false;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'request_withdrawn')
  );
  return true;
end;
$$;

revoke all on function public.withdraw_platform_appointment_request(uuid, uuid) from public, anon;
grant execute on function public.withdraw_platform_appointment_request(uuid, uuid) to authenticated;

comment on function public.withdraw_platform_appointment_request(uuid, uuid) is
  'POR-009: Die Person zieht einen offenen Terminwunsch zurueck; der Vorgang bleibt als zurueckgezogen stehen (Frist ANN-243). Nur ueber einen lesbaren Zugang des eigenen Verhaeltnisses.';

-- -----------------------------------------------------------------------------
-- 6. Loeschlauf: Regel fuer die Klasse terminwunsch. Rumpf sonst unveraendert
--    aus 20261006120000_log_001c_fristen.sql; reapply_deletion_journal mit der
--    Tabelle vor den Terminen.
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
    -- Terminwuensche der Plattform (POR-009, ANN-243): zwoelf Monate nach
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
    -- Plattform, Teil 2 (POR-002, ANN-189): Zugaenge mit ihren Einladungen,
    -- drei Jahre nach ihrem Ende. Nach den Verhaeltnissen oben: Ein im
    -- selben Lauf geloeschtes Verhaeltnis hat seinen Zugang da schon beendet.
    -- -------------------------------------------------------------------
    v_plattform := app.delete_due_platform_accesses(v_org.id, v_run);

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte
                + v_aufgaben + v_anrufe + v_konten + v_plattform + v_wuensche;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal + v_wuensche > 0
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
