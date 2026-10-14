-- =============================================================================
-- B1 (BEF-151, Auftrag Jannes 14.10.2026, ADR-008 Fassung 3): Der Fristanker
-- der Patientenakte kommt aus der letzten Behandlung oder Leistung.
--
-- Bisher (ANN-032): Die zehn Jahre aus Par. 630f Abs. 3 BGB liefen erst ab dem
-- ausdruecklichen Vorgang „Versorgung abschliessen“ (patients.care_concluded_on);
-- ohne ihn wurde nie geloescht, und die Uebersicht erinnerte nach sechs Monaten
-- daran (list_care_without_conclusion). Jannes will keinen Versorgungsstatus im
-- Alltag; der Zeitpunkt soll sich aus dem ergeben, was ohnehin festgehalten ist.
--
-- Neu:
--   * app.patient_retention_anchor(patient): das spaeteste Datum aus
--       - Tag eines Behandlungstermins, der abgehakt, dokumentiert, abgerechnet
--         oder als nicht angetroffen vermerkt ist,
--       - Leistungstag einer erfassten Leistung,
--       - einem etwaigen ausdruecklichen Abschluss (er bleibt fuer den Uebergang
--         in Training und Nachsorge-Abo bestehen und kann die Frist nur
--         verlaengern, nie verkuerzen).
--     Ohne jede Behandlung bleibt der Anker leer: Dann laeuft keine Frist, wie
--     bisher ohne Abschluss. Eine Rechnung verschiebt den Anker nicht: Sie
--     haelt die Akte wie bisher ueber ihre eigene steuerliche Frist (die
--     Sperre in apply_retention, ADR-009 Punkt 9) - „Abschluss der
--     Behandlung“ (Par. 630f BGB) ist die letzte Behandlung, nicht die
--     Rechnung darueber.
--   * app.patient_has_upcoming_care(patient): ein kuenftiger, nicht abgesagter
--     Behandlungstermin haelt die Akte immer.
--   * apply_retention und patient_retention_status rechnen mit dem Anker
--     (juengste Fassungen, sonst wortgleich).
--   * Die Erinnerung „Versorgung abschliessen?“ entfaellt.
-- =============================================================================

-- ANN-511: der Fristanker der Patientenakte - eine Stelle.
create function app.patient_retention_anchor(p_patient_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    p.care_concluded_on,
    (select max((a.starts_at at time zone o.time_zone)::date)
       from public.appointments a
      where a.patient_id = p.id
        and a.kind = 'therapy'
        and (a.completed_at is not null
             or a.status in ('completed', 'documented', 'invoiced', 'no_show'))),
    (select max(b.performed_on)
       from public.billable_services b
      where b.patient_id = p.id)
  )
  from public.patients p
  join public.organizations o on o.id = p.organization_id
  where p.id = p_patient_id
$$;

revoke all on function app.patient_retention_anchor(uuid) from public, anon, authenticated;

comment on function app.patient_retention_anchor(uuid) is
  'B1 (BEF-151, ANN-511, ADR-008 Fassung 3): Fristanker der Patientenakte - das spaeteste Datum aus abgehaktem, dokumentiertem, abgerechnetem oder als nicht angetroffen vermerktem Behandlungstermin, erfasster Leistung und ausdruecklichem Abschluss. Leer ohne jede Behandlung: dann keine Frist. Rechnungen halten ueber ihre eigene Frist (Sperre), nicht ueber den Anker.';

create function app.patient_has_upcoming_care(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments a
    where a.patient_id = p_patient_id
      and a.kind = 'therapy'
      and a.status <> 'cancelled'
      and a.ends_at > now()
  )
$$;

revoke all on function app.patient_has_upcoming_care(uuid) from public, anon, authenticated;

comment on function app.patient_has_upcoming_care(uuid) is
  'B1 (BEF-151): Hat die Akte einen kuenftigen, nicht abgesagten Behandlungstermin? Dann faellt sie im Loeschlauf nicht, gleich was der Anker sagt.';

update public.retention_classes
   set note = 'Zehn Jahre nach Abschluss der Behandlung. Der Anker ist app.patient_retention_anchor (B1, ADR-008 Fassung 3): das spaeteste Datum aus letzter Behandlung, Leistung, Rechnung und einem etwaigen ausdruecklichen Abschluss. Ohne jede Behandlung laeuft keine Frist; ein kuenftiger Termin haelt die Akte.',
       assumption_key = 'ANN-511'
 where key = 'patientenakte';

-- -----------------------------------------------------------------------------
-- Loeschlauf: juengste Fassung (20261026110000_kom_005b_attachment_projections),
-- geaendert nur im Block der Patientenakte.
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
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Behandlung.
    --
    -- B1 (BEF-151, ADR-008 Fassung 3): Der Anker ist nicht mehr allein der
    -- ausdrueckliche Abschluss, sondern app.patient_retention_anchor - das
    -- spaeteste Datum aus letzter Behandlung, Leistung, Rechnung und einem
    -- etwaigen ausdruecklichen Abschluss. Eine Akte mit kuenftigem Termin
    -- faellt nie, und ohne jede Behandlung laeuft weiter keine Frist.
    -- -------------------------------------------------------------------
    for v_akte in
      select k.id, k.due_at
      from (
        select p.id,
               app.retention_due_at(
                 app.patient_retention_anchor(p.id),
                 app.retention_interval('patientenakte'),
                 v_org.time_zone
               ) as due_at
        from public.patients p
        where p.organization_id = v_org.id
      ) k
      join public.patients p on p.id = k.id
      where k.due_at is not null
        and k.due_at <= now()
        and not app.patient_has_upcoming_care(k.id)
      order by k.due_at
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

-- -----------------------------------------------------------------------------
-- Auskunft zur Aufbewahrung (Art. 15/17): juengste Fassung aus
-- 20261003105000_abn_018_waitlist_review_merge_records_holds.sql, mit dem Anker.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.patient_retention_status(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org        uuid;
  v_zone       text;
  v_abschluss  date;
  v_anker      date;
  v_akte       record;
  v_abr        record;
  v_jahr       date;
  v_klassen    jsonb := '[]'::jsonb;
begin
  v_org := app.auskunft_organisation(p_patient_id);

  select o.time_zone into v_zone from public.organizations o where o.id = v_org;

  select p.care_concluded_on into v_abschluss
  from public.patients p where p.id = p_patient_id;

  -- B1 (ADR-008 Fassung 3): Anker aus letzter Behandlung, Leistung, Rechnung
  -- und einem etwaigen ausdruecklichen Abschluss. Ohne jede Behandlung laeuft
  -- keine Frist; ein kuenftiger Termin haelt die Akte (dann kein Datum).
  v_anker := case when app.patient_has_upcoming_care(p_patient_id) then null
                  else app.patient_retention_anchor(p_patient_id) end;

  select k.key, k.legal_reference, k.retention_interval, k.anchor
    into v_akte
  from public.retention_classes k where k.key = 'patientenakte';

  v_klassen := v_klassen || jsonb_build_array(jsonb_build_object(
    'key', v_akte.key,
    'legal_reference', v_akte.legal_reference,
    'anchor', v_akte.anchor,
    'anker_datum', v_anker,
    'frist_ende', case when v_anker is null then null
                       else (v_anker + v_akte.retention_interval)::date end,
    'loeschbar_ab', case when v_anker is null then null
                         else app.retention_due_at(v_anker, v_akte.retention_interval, v_zone) end,
    'datensaetze', (select count(*) from public.patients p where p.id = p_patient_id)
  ));

  -- Abrechnung: eigene Frist ab Ende des Kalenderjahres der letzten
  -- ausgestellten Rechnung. Sie haelt die Akte laenger fest als die Akte sich
  -- selbst, wenn spaet abgerechnet wurde (ADR-008, Konsequenz zu ADR-009).
  select k.key, k.legal_reference, k.retention_interval, k.anchor
    into v_abr
  from public.retention_classes k where k.key = 'abrechnungsdaten';

  select make_date(extract(year from max(r.issued_on))::int, 12, 31)
    into v_jahr
  from public.invoices r
  where r.patient_id = p_patient_id and r.issued_on is not null;

  v_klassen := v_klassen || jsonb_build_array(jsonb_build_object(
    'key', v_abr.key,
    'legal_reference', v_abr.legal_reference,
    'anchor', v_abr.anchor,
    'anker_datum', v_jahr,
    'frist_ende', case when v_jahr is null then null
                       else (v_jahr + v_abr.retention_interval)::date end,
    'loeschbar_ab', case when v_jahr is null then null
                         else app.retention_due_at(v_jahr, v_abr.retention_interval, v_zone) end,
    'datensaetze', (select count(*) from public.invoices r
                    where r.patient_id = p_patient_id and r.issued_on is not null)
  ));

  return jsonb_build_object(
    'patient_id', p_patient_id,
    'zeitzone', v_zone,
    'versorgung_abgeschlossen_am', v_abschluss,
    'klassen', v_klassen,
    -- ABN-018 (BEF-108): Eine Akte kann mehrere aktive Sperren tragen; der
    -- Stand nennt die frueheste und alle Gruende.
    'loeschsperre', (
      select jsonb_build_object(
               'seit', min(s.placed_at),
               'grund', string_agg(s.reason, '; ' order by s.placed_at))
      from public.legal_holds s
      where s.subject_type = 'patient'
        and s.subject_id = p_patient_id
        and s.released_at is null
      having count(*) > 0
    )
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- Die Erinnerung „Versorgung abschliessen?“ entfaellt: Der Anker braucht den
-- Vorgang nicht mehr. Statt ihrer zeigt die Uebersicht offene Grundlagen ohne
-- weitere Termine und solche, die abzurechnen sind (20261112150000_a_006).
-- -----------------------------------------------------------------------------
drop function if exists public.list_care_without_conclusion();
