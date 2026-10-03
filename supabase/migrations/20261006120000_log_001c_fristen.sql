-- =============================================================================
-- LOG-EPIC-001, PR (c): Fristen, Legal Hold, Loeschjournal
-- (Freigabe Jannes, 2026-10-03; ANN-230)
--
--   * Auditlog in zwei Klassen: Lese- und Sicherheitsereignisse zwoelf
--     Monate (ADR-011 Punkt 4), alle uebrigen Eintraege drei Jahre. Welche
--     Aktion in welche Klasse faellt, sagt app.audit_retention_class - die
--     eine Stelle.
--   * Loeschjournal: 60 Tage ab der Loeschung. Es dient dem Nachziehen nach
--     einer Wiederherstellung (ADR-008 Punkt 8); Backups leben 30 Tage
--     (ADR-012, Entscheidung Jannes), dazu 30 Tage Puffer. Den Nachweis je
--     Lauf traegt retention.applied im Auditlog, drei Jahre.
--   * Loeschauftraege der Ablage: drei Jahre ab der Quittung; offene
--     Auftraege fallen nie.
--   * Legal Hold: haelt jede Auditzeile einer gehaltenen Akte - ueber den
--     Gegenstand oder context.patient_id, auch fuer zusammengefuehrte
--     Doppelanlagen - und jeden Plattformzugang zu ihr.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fristklassen und ihre Zuordnung
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values (
  'auditlog_lesen_sicherheit', 'intern', 'Art. 5 Abs. 2, Art. 32 DSGVO', 'event_time',
  interval '1 year', 'ANN-230',
  'Lese- und Sicherheitsereignisse im Auditlog (Akte geoeffnet, Lesen ueber eine Vertretung, Abweisungen, Kontosicherheit): zwoelf Monate ab dem Ereignis (ADR-011 Punkt 4). Ein Legal Hold an der Akte haelt die Loeschung an.',
  31
), (
  'loeschauftrag', 'intern', null, 'case_closed', interval '3 years', 'ANN-230',
  'Quittierte Loeschauftraege der Ablage: drei Jahre ab der Quittung. Offene Auftraege bleiben, bis sie ausgefuehrt sind (ADR-017 Punkt 25).',
  111
);

update public.retention_classes
   set note = 'Uebrige Auditeintraege (Exporte, Herunterladen, Zugaenge, Konten und Rechte, Loeschlauf): drei Jahre ab dem Ereignis. Laeuft nach eigener Frist und nicht mit der Akte (ANN-029); ein Legal Hold an der Akte haelt die Loeschung an.'
 where key = 'auditlog';

update public.retention_classes
   set anchor = 'event_time',
       retention_interval = interval '60 days',
       assumption_key = 'ANN-230',
       note = 'Nachweis wirksam gewordener Loeschungen fuer das Nachziehen nach einer Wiederherstellung (ADR-008 Punkt 8): 60 Tage ab der Loeschung - Backups leben 30 Tage (ADR-012), dazu 30 Tage Puffer. Den Nachweis je Lauf traegt retention.applied im Auditlog.'
 where key = 'loeschjournal';

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values (
  'audit_log', 'auditlog_lesen_sicherheit', 'automatisch',
  'Lese- und Sicherheitsereignisse; welche Aktion in welche Klasse faellt, sagt app.audit_retention_class.',
  101
);

update public.retention_assignments
   set deletion_mode = 'automatisch',
       scope_note = 'Eintraege aelter als 60 Tage. Laenger braucht sie das Nachziehen nach einer Wiederherstellung nicht (ADR-012: Backups 30 Tage).'
 where table_name = 'deletion_journal' and class_key = 'loeschjournal';

delete from public.retention_assignments
 where table_name in ('storage_deletion_orders', 'patient_file_access_grants')
   and class_key = 'loeschjournal';

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values (
  'storage_deletion_orders', 'loeschauftrag', 'automatisch',
  'Quittierte Auftraege drei Jahre nach der Quittung; offene bleiben (ADR-017 Punkt 25 und 26).',
  115
), (
  'patient_file_access_grants', 'loeschauftrag', 'ueber_elterndatensatz',
  'Einmalige Loeschfreigabe am Objekt eines Loeschauftrags (FIX-015, ADR-017 Punkt 25): beim ersten Zugriff verbraucht, nach 30 Sekunden verfallen; faellt spaetestens mit dem Auftrag (FK on delete cascade).',
  116
);

-- -----------------------------------------------------------------------------
-- 2. app.audit_retention_class: die eine Stelle fuer die Frist je Aktion
-- -----------------------------------------------------------------------------
create function app.audit_retention_class(p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_action in (
      'patient_record.viewed', 'training_relationship.viewed', 'platform_representation.read',
      'access.denied',
      'account.password_changed', 'account.sessions_ended', 'account.mfa_enrolled',
      'account.mfa_removed',
      'staff_account.locked', 'staff_account.unlocked', 'staff_account.password_reset_requested'
    ) then 'auditlog_lesen_sicherheit'
    else 'auditlog'
  end
$$;

comment on function app.audit_retention_class(text) is
  'LOG-EPIC-001 (ADR-011 Punkt 4): Lese- und Sicherheitsereignisse zwoelf Monate, alle uebrigen Auditeintraege drei Jahre.';

revoke all on function app.audit_retention_class(text) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. app.audit_entry_held: haelt ein Legal Hold diese Auditzeile?
--
-- Die Akte einer Zeile ist ihr Gegenstand (subject_type = 'patient') oder
-- context.patient_id. Eine zusammengefuehrte Doppelanlage gehoert zur Akte,
-- in der sie aufgegangen ist (ABN-018).
-- -----------------------------------------------------------------------------
create function app.audit_entry_held(
  p_organization_id uuid, p_subject_type text, p_subject_id uuid, p_context jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with akte as (
    select case when p_subject_type = 'patient' then p_subject_id
                when p_context ->> 'patient_id' ~ '^[0-9a-f-]{36}$'
                  then (p_context ->> 'patient_id')::uuid
           end as id
  )
  select coalesce((
    select app.under_legal_hold(p_organization_id, 'patient', akte.id)
        or exists (
             select 1 from public.patient_merge_records m
             where m.organization_id = p_organization_id
               and m.source_patient_id = akte.id
               and app.under_legal_hold(p_organization_id, 'patient', m.target_patient_id))
    from akte
    where akte.id is not null
  ), false)
$$;

revoke all on function app.audit_entry_held(uuid, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Loeschlauf: zwei Auditfristen mit Legal Hold, Auftraege, Journal
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
    -- Plattform, Teil 2 (POR-002, ANN-189): Zugaenge mit ihren Einladungen,
    -- drei Jahre nach ihrem Ende. Nach den Verhaeltnissen oben: Ein im
    -- selben Lauf geloeschtes Verhaeltnis hat seinen Zugang da schon beendet.
    -- -------------------------------------------------------------------
    v_plattform := app.delete_due_platform_accesses(v_org.id, v_run);

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte
                + v_aufgaben + v_anrufe + v_konten + v_plattform;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal > 0
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
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 5. Plattformzugaenge einer gehaltenen Akte bleiben
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.delete_due_platform_accesses(p_org uuid, p_run uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_anzahl integer;
begin
  with faellig as (
    select a.id, a.organization_id,
           app.platform_access_ended_at(a.id) + app.retention_interval('plattformzugang') as due_at,
           -- LOG-EPIC-001: Ein Zugang mit Zweifel-Vermerk (ADR-023 Punkt 13)
           -- bleibt so lange wie die Akte bzw. das Verhaeltnis; deren
           -- Loeschung setzt die Verweise auf null.
           a.companion_declined_at is null
             or (a.patient_id is null and a.training_relationship_id is null) as frei
    from public.platform_accesses a
    where a.organization_id = p_org
  ),
  geloescht as (
    delete from public.platform_accesses a
    using faellig f
    where a.id = f.id
      and f.due_at is not null
      and f.due_at <= now()
      and f.frei
      -- LOG-EPIC-001: Ein Legal Hold an der Akte haelt auch ihre Zugaenge.
      and not app.under_legal_hold(p_org, 'patient', a.patient_id)
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'platform_accesses', g.id, 'plattformzugang', f.due_at
  from geloescht g
  join faellig f on f.id = g.id;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$function$;
