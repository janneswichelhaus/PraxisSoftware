-- =============================================================================
-- LEI-002: Das Trainingsverhaeltnis loescht sich nach eigener Frist
--
-- ADR-021 Punkt 4 gibt dem zweiten Verhaeltnis eine eigene Datenklasse und
-- einen eigenen Anker (LEI-001). Diese Migration macht daraus einen Vorgang:
--
--   app.delete_training_relationship   loescht ein Verhaeltnis samt
--                                      Journalzeile - und die Person, wenn
--                                      kein Verhaeltnis mehr auf sie zeigt.
--   apply_retention                    bekommt die fuenfte Regel: drei Jahre
--                                      ab Vertragsende.
--   app.delete_patient_record          bekommt die VIERTE Pruefung vor dem
--                                      Loeschen der Person (ADR-021,
--                                      Konsequenzen) - ohne sie braeche der
--                                      Lauf am Fremdschluessel ab.
--   reapply_deletion_journal           kennt die neue Tabelle und ihre Stelle
--                                      in der Reihenfolge.
--
-- DAS ENDE DES EINEN VERHAELTNISSES BEENDET DAS ANDERE NICHT. Wer seine
-- Behandlung abschliesst und weiter trainiert, verliert seine Trainingsdaten
-- nicht - und umgekehrt. Die Identitaet ueberlebt beide und faellt erst,
-- wenn kein Verhaeltnis mehr auf sie zeigt (ADR-021, Konsequenzen; ADR-008
-- Punkt 9). Beide Loeschwege pruefen deshalb dieselben vier Verweise.
--
-- DIE FRIST KOMMT AUS DEM SCHEDULE, nicht aus dieser Datei (ANN-001): Keine
-- Zahl steht hier, nur app.retention_interval('trainingsverhaeltnis').
-- =============================================================================

-- -----------------------------------------------------------------------------
-- app.delete_training_relationship
--
-- Das Gegenstueck zu app.delete_patient_record - und bewusst viel kuerzer:
-- Am Trainingsverhaeltnis haengen heute keine Fachdaten. Kommen sie (Termine
-- im Kontext `training`, Trainingsgrundlage, Protokoll, Screening), werden
-- sie hier in Fremdschluesselreihenfolge davorgehaengt, genau wie in der
-- Akte.
--
-- Gibt die Zahl der eigenstaendig geloeschten Zeilen zurueck.
-- -----------------------------------------------------------------------------
create function app.delete_training_relationship(
  p_relationship_id uuid,
  p_run_id          uuid,
  p_due_at          timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_count  integer := 0;
  v_n      integer;
begin
  select t.person_id
    into v_person
  from public.training_relationships t
  where t.id = p_relationship_id;

  if not found then
    return 0;
  end if;

  with geloescht as (
    delete from public.training_relationships t
     where t.id = p_relationship_id
    returning t.id, t.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_relationships', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Dieselben vier Verweise wie in der Akte, und aus demselben Grund: Die
  -- Person gehoert keinem der beiden Bereiche, sie wird von beiden benutzt.
  with geloescht as (
    delete from public.persons pe
     where pe.id = v_person
       and not exists (select 1 from public.patients x               where x.person_id = pe.id)
       and not exists (select 1 from public.staff_members x          where x.person_id = pe.id)
       and not exists (select 1 from public.user_profiles x          where x.person_id = pe.id)
       and not exists (select 1 from public.training_relationships x where x.person_id = pe.id)
    returning pe.id, pe.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'persons', g.id, 'personenstammdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

comment on function app.delete_training_relationship(uuid, uuid, timestamptz) is
  'Loescht ein Trainingsverhaeltnis und schreibt je eigenstaendig geloeschter Zeile eine Journalzeile (ADR-008, ADR-021 Punkt 4, LEI-002). Nimmt die Person mit, wenn weder Akte noch Beschaeftigung noch Konto noch ein weiteres Trainingsverhaeltnis auf sie zeigt. Prueft keine Loeschsperre - das tut der Aufrufer.';

-- Wie bei der Akte: SECURITY DEFINER und ohne Rollenpruefung, deshalb fuer
-- keine Anwendungsrolle ausfuehrbar. Sie gehoert allein dem Loeschlauf.
revoke all on function app.delete_training_relationship(uuid, uuid, timestamptz)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Die Akte laesst die Person stehen, solange jemand trainiert
--
-- Unveraendert aus 20260919180000_payment_reminders.sql uebernommen bis auf
-- die vierte Pruefung vor dem Loeschen der Person.
-- -----------------------------------------------------------------------------
create or replace function app.delete_patient_record(
  p_patient_id uuid,
  p_run_id uuid,
  p_due_at timestamp with time zone
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_person uuid;
  v_count  integer := 0;
  v_n      integer;
begin
  select p.organization_id, p.person_id
    into v_org, v_person
  from public.patients p
  where p.id = p_patient_id;

  if not found then
    return 0;
  end if;

  -- Neu mit ABR-003d: Zahlungserinnerungen zuerst. Auch sie zeigen mit
  -- RESTRICT auf die Rechnung.
  with geloescht as (
    delete from public.invoice_payment_reminders r
     where r.invoice_id in (
       select i.id from public.invoices i where i.patient_id = p_patient_id
     )
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_payment_reminders', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Mit ABR-003c: Stornodokumente vor den Rechnungen. Sie zeigen mit RESTRICT auf
  -- die Rechnung; faellt eines still mit ihr, fehlt seine Zeile im Journal.
  with geloescht as (
    delete from public.invoice_cancellations c
     where c.invoice_id in (
       select i.id from public.invoices i where i.patient_id = p_patient_id
     )
    returning c.id, c.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_cancellations', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Mit ABR-004: Zahlungen vor den Rechnungen. Sie zeigen mit RESTRICT auf die
  -- Rechnung, und ihre steuerliche Frist ist dieselbe - der Lauf haette die
  -- Akte sonst zurueckgehalten (ADR-008 Punkt 2).
  with geloescht as (
    delete from public.payments z
     where z.invoice_id in (
       select i.id from public.invoices i where i.patient_id = p_patient_id
     )
    returning z.id, z.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'payments', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Rechnungszeilen: Sie zeigen mit RESTRICT auf die Leistung.
  with geloescht as (
    delete from public.invoice_items it
     where it.invoice_id in (
       select i.id from public.invoices i where i.patient_id = p_patient_id
     )
    returning it.id, it.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_items', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.invoices i
     where i.patient_id = p_patient_id
    returning i.id, i.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoices', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.invoice_recipients r
     where r.patient_id = p_patient_id
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'invoice_recipients', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Leistungen fallen vor Termin und Patientenzeile, weil sie mit RESTRICT
  -- auf beide zeigen, und ihre steuerliche Frist ist nie laenger als die zehn
  -- Jahre der Akte (ADR-008, ABR-002).
  with geloescht as (
    delete from public.billable_services b
     where b.patient_id = p_patient_id
    returning b.id, b.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'billable_services', g.id, 'abrechnungsdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.treatment_notes t
     where t.appointment_id in (
       select a.id from public.appointments a where a.patient_id = p_patient_id
     )
    returning t.id, t.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'treatment_notes', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.treatment_bases pr
     where pr.patient_id = p_patient_id
    returning pr.id, pr.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'treatment_bases', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.appointments a
     where a.patient_id = p_patient_id
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'appointments', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.legal_holds h
     where h.subject_type = 'patient'
       and h.subject_id = p_patient_id
    returning h.id, h.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'legal_holds', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.patients p
     where p.id = p_patient_id
    returning p.id, p.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'patients', g.id, 'patientenakte', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Die vierte Pruefung (LEI-001, ADR-021 Konsequenzen): Wer noch
  -- trainiert, behaelt seine Stammdaten. Ohne sie braeche der Lauf am
  -- Fremdschluessel ab - oder er naehme einer laufenden Trainingsbetreuung
  -- die Person unter den Fuessen weg. Das Ende des einen Verhaeltnisses
  -- beendet das andere nicht.
  with geloescht as (
    delete from public.persons pe
     where pe.id = v_person
       and not exists (select 1 from public.patients x      where x.person_id = pe.id)
       and not exists (select 1 from public.staff_members x where x.person_id = pe.id)
       and not exists (select 1 from public.user_profiles x where x.person_id = pe.id)
       and not exists (select 1 from public.training_relationships x where x.person_id = pe.id)
    returning pe.id, pe.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'persons', g.id, 'personenstammdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

comment on function app.delete_patient_record(uuid, uuid, timestamp with time zone) is
  'Loescht eine Patientenakte vollstaendig in Fremdschluesselreihenfolge und schreibt je eigenstaendig geloeschter Zeile eine Journalzeile (ADR-008, LOE-002a). Seit ABR-003d einschliesslich Zahlungserinnerungen, Stornodokumenten, Zahlungen, Rechnungen, ihrer Zeilen und der Empfaenger. Seit LEI-002 bleibt die Person stehen, solange ein Trainingsverhaeltnis auf sie zeigt (ADR-021). Prueft KEINEN Legal Hold und KEINE steuerliche Frist - das tut der Aufrufer.';

revoke all on function app.delete_patient_record(uuid, uuid, timestamp with time zone)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Der Loeschlauf lernt das zweite Verhaeltnis
--
-- Unveraendert aus 20260919150000_invoices.sql uebernommen bis auf die neue
-- Schleife, ihren Zaehler und den Wert im Auditereignis.
-- -----------------------------------------------------------------------------
create or replace function public.apply_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
  v_zugang    integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

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
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval('auditlog')
        and not (
          a.subject_type = 'patient'
          and app.under_legal_hold(v_org.id, 'patient', a.subject_id)
        )
      returning a.id, a.organization_id, a.occurred_at
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, 'auditlog',
           g.occurred_at + app.retention_interval('auditlog')
    from geloescht g;
    get diagnostics v_audit = row_count;

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

    v_gesamt := v_gesamt + v_akten + v_training + v_termine + v_audit + v_zugang;

    if v_akten + v_training + v_termine + v_audit + v_zugang > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'zugangseinladung', v_zugang,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$$;

comment on function public.apply_retention() is
  'Fuehrt den Loeschlauf ueber alle Datenklassen aus (ADR-008, LOE-002a). Seit ABR-003 haelt er eine Akte zurueck, solange die steuerliche Frist einer ihrer ausgestellten Rechnungen laeuft (Par. 147 AO, ADR-008 Punkt 2). Seit LEI-002 loescht er Trainingsverhaeltnisse nach eigener Frist und eigenem Anker (ADR-021 Punkt 4).';


-- -----------------------------------------------------------------------------
-- Die Wiederanwendung kennt das zweite Verhaeltnis
-- -----------------------------------------------------------------------------
create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
  v_org       record;
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

    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where id = any($1) returning id) select array_agg(id) from g',
      v_tabelle
    )
    into v_geloescht
    using v_ids;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  if v_gesamt > 0 then
    for v_org in
      select j.organization_id as id, count(*) as anzahl
      from public.deletion_journal j
      where j.reapplied_at = now()
      group by j.organization_id
    loop
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.reapplied', 'organization', v_org.id, 'success',
        jsonb_build_object('surface', 'restore', 'records', v_org.anzahl)
      );
    end loop;
  end if;

  return v_gesamt;
end;
$$;

comment on function public.reapply_deletion_journal() is
  'Zieht nach einer Wiederherstellung die Loeschungen des Journals erneut nach (ADR-008 Punkt 8). Seit ABR-003d einschliesslich Zahlungserinnerungen, Stornodokumenten, Zahlungen, Rechnungen, ihrer Zeilen und der Empfaenger, seit LEI-002 einschliesslich der Trainingsverhaeltnisse.';
