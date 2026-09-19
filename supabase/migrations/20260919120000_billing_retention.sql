-- =============================================================================
-- ABR-001/ABR-002: Aufbewahrung der Abrechnungsdaten (ADR-008)
--
-- ADR-008 nennt eine Datenklasse ohne Fristzuordnung einen Mangel, und der
-- Retention Schedule sagte bisher selbst, wo die Luecke sitzt: "Rohdaten,
-- KI-Entwuerfe, Terminanfragen, Teamchat und Rechnungen haben noch keine
-- Tabelle; ihre Zeile entsteht mit dem Feature, das sie anlegt"
-- (20260911150000_retention_schedule.sql). Mit ABR-001 und ABR-002 gibt es
-- drei solche Tabellen - also entsteht hier ihre Zeile.
--
-- Die Klasse ist neu, weil die Frist eine andere Herkunft hat als die der
-- Akte: Paragraf 147 AO, nicht Paragraf 630f BGB. ADR-008 fuehrt sie in der
-- Tabelle der Datenklassen als "Ausgestellte Rechnungen und Buchungsbelege,
-- gesetzliche steuerliche Aufbewahrungsfrist, aktuell grundsaetzlich acht
-- Jahre". Sie laeuft ab Ende des Kalenderjahres - so rechnet das Steuerrecht,
-- und so rechnet bereits die Klasse `termin_ohne_nachweis`.
--
-- **Geloescht wird nichts nach eigener Regel.** Eine Leistung faellt mit der
-- Patientenakte, und deren zehn Jahre ab Abschluss der Versorgung sind nie
-- kuerzer als acht Jahre ab dem Leistungsjahr: Der Abschluss liegt nie vor der
-- Leistung. Die Preisliste faellt gar nicht - auf sie zeigen Leistungen mit
-- RESTRICT, und sie ist der Beleg dafuer, welcher Preis galt.
--
-- Zwei Funktionen ziehen nach. Ihre Ruempfe sind unveraendert aus
-- 20260918120000_treatment_basis.sql uebernommen; PostgreSQL kennt kein
-- teilweises Ersetzen einer Funktion. Der fachliche Unterschied steht je an
-- einer Stelle und ist dort vermerkt.
--
-- Der abgesagte Termin mit Gebuehrenanlass braucht hier nichts: Die Regel fuer
-- `termin_ohne_nachweis` nimmt seit CAL-014b jede Zeile mit `fee_basis`
-- ausdruecklich aus, und eine Leistung kann nur an einem dokumentierten Termin
-- oder an einem Gebuehrenanlass entstehen (ABR-002). Die Dreijahresfrist
-- trifft damit keinen Termin, an dem eine Leistung haengt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Datenklasse
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order) values
  ('abrechnungsdaten', 'gesetzlich', 'Par. 147 Abs. 3 AO', 'calendar_year_end', interval '8 years', null,
   'Abrechnungsdaten und Buchungsbelege: acht Jahre ab Ende des Kalenderjahres (ADR-008). Sie fallen ueber die Patientenakte, deren zehn Jahre ab Abschluss der Versorgung nie kuerzer sind; der Leistungskatalog faellt gar nicht.', 15);

-- -----------------------------------------------------------------------------
-- 2. Die drei neuen Tabellen
-- -----------------------------------------------------------------------------
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('billable_services', 'abrechnungsdaten', 'ueber_elterndatensatz',
   'Erfasste Leistungen. Fallen mit der Patientenakte und werden im Lauf vor dem Termin geloescht (FK restrict).', 15),
  ('service_catalog_items', 'abrechnungsdaten', 'keine',
   'Positionen einer Preisliste. Kein Personenbezug; sie sind der Beleg dafuer, welcher Preis galt, und Leistungen zeigen mit RESTRICT auf sie.', 16),
  ('service_catalog_versions', 'abrechnungsdaten', 'keine',
   'Preislisten. Kein Personenbezug; eine veroeffentlichte Liste ist unveraenderlich und bleibt als Beleg (ADR-009 Punkt 5).', 17);

-- -----------------------------------------------------------------------------
-- 3. Der Loeschlauf der Akte nimmt die Leistungen mit
--
-- Unveraendert bis auf den ersten Block: Leistungen fallen vor Termin und
-- Patientenzeile, weil sie mit RESTRICT auf beide zeigen.
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

  -- Leistungen fallen zuerst: Sie zeigen mit RESTRICT auf den Termin und auf
  -- die Patientenzeile, und ihre steuerliche Frist ist nie laenger als die
  -- zehn Jahre der Akte (ADR-008, ABR-002).
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

  with geloescht as (
    delete from public.persons pe
     where pe.id = v_person
       and not exists (select 1 from public.patients x      where x.person_id = pe.id)
       and not exists (select 1 from public.staff_members x where x.person_id = pe.id)
       and not exists (select 1 from public.user_profiles x where x.person_id = pe.id)
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
  'Loescht eine Patientenakte vollstaendig in Fremdschluesselreihenfolge und schreibt je eigenstaendig geloeschter Zeile eine Journalzeile (ADR-008, LOE-002a). Seit ABR-002 einschliesslich der erfassten Leistungen. Prueft KEINEN Legal Hold - das tut der Aufrufer.';

revoke all on function app.delete_patient_record(uuid, uuid, timestamp with time zone)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Die Wiederanwendung kennt die neue Tabelle
--
-- Unveraendert bis auf einen Eintrag in der Reihenfolge: Was zuerst geloescht
-- wurde, wird nach einer Wiederherstellung zuerst wieder geloescht (ADR-008
-- Punkt 8).
-- -----------------------------------------------------------------------------
create or replace function public.reapply_deletion_journal()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reihenfolge text[] := array[
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
  'Zieht nach einer Wiederherstellung die Loeschungen des Journals erneut nach (ADR-008 Punkt 8). Seit ABR-002 einschliesslich der erfassten Leistungen.';
