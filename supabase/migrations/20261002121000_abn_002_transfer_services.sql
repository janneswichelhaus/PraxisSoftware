-- ABN-002 (BEF-097): Eine Terminuebertragung nimmt die erfassten, nicht
-- abgerechneten Leistungen mit.
--
-- Bisher wechselte nur `appointments.treatment_basis_id`. Hatte ein Termin
-- schon eine erfasste Leistung, zeigte `billable_services.treatment_base_item_id`
-- weiter auf die Position der alten Grundlage, und deren `used_quantity` blieb
-- dort verbraucht (ANN-073 bindet die Wirkung an die Leistung). Terminzuordnung,
-- Leistungszuordnung und Kontingentverbrauch passten danach nicht zusammen -
-- genau der Abrechnungsfehler, den PROJECT_PRINCIPLES.md 13 ausschliesst.
--
-- Jetzt gilt (Abnahme Jannes, 2026-10-02, ANN-068 Fassung 2):
--
--   * Uebertragen werden duerfen auch durchgefuehrte Termine - als
--     nachvollziehbare Zuordnungskorrektur mit demselben Auditereignis.
--     Abgerechnete Leistungen bleiben ausgeschlossen (R3-001).
--   * Erfasste, nicht abgerechnete Leistungen ziehen **in derselben
--     Transaktion** mit: Sie bekommen die Position der Zielgrundlage mit
--     demselben Heilmittel (dieselbe Bruecke wie bei der Erfassung,
--     `treatment_base_items.remedy`), die genutzte Menge wandert von der alten
--     Position auf die neue.
--   * Gibt es am Ziel keine passende Position oder reicht ihr Kontingent nicht,
--     wird der ganze Vorgang mit einem verstaendlichen Grund abgewiesen -
--     nichts wird still getrennt.
--   * Leistungen ohne Position (Ausfallhonorar, Termin ohne Grundlage) ziehen
--     ohne Mengenbewegung mit; sie haengen ohnehin nur am Termin.
--
-- Der Auditkontext nennt zusaetzlich die Zahl der mitgezogenen Leistungen und
-- die bewegten Mengen je Heilmittel - Heilmittelnamen sind Katalogbegriffe,
-- keine klinischen Inhalte (ADR-011).

create or replace function public.transfer_appointments_to_treatment_basis(
  p_treatment_basis_id uuid,
  p_appointment_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org        uuid;
  v_actor      uuid := auth.uid();
  v_patient    uuid;
  v_anzahl     integer;
  v_geschickt  integer;
  v_quellen    uuid[];
  v_fehlend    text;
  v_leistungen integer := 0;
  v_mengen     jsonb   := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Uebertragen aendert einen Termin, nicht die Grundlage: Es ist dasselbe
  -- Recht wie das Umplanen (ADR-004). Wer eine Verordnung schreiben darf, hat
  -- es ohnehin; das Office plant Termine und darf deshalb auch uebertragen.
  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_treatment_basis_id is null then
    raise exception 'treatment basis is required' using errcode = '22023';
  end if;

  if p_appointment_ids is null or cardinality(p_appointment_ids) = 0 then
    raise exception 'appointments must be a non-empty array' using errcode = '22023';
  end if;

  -- Die Zielgrundlage bestimmt die Patient:in. Sie wird hier gelesen und nicht
  -- vom Aufrufer entgegengenommen: Eine mitgeschickte Patientenkennung waere
  -- eine zweite Wahrheit, die auseinanderlaufen kann.
  select p.patient_id
    into v_patient
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  -- Alles oder nichts: Erst wird gezaehlt, was die Bedingungen erfuellt, dann
  -- geschrieben. Eine Kennung, die durchfaellt - fremde Organisation, andere
  -- Patient:in, abgesagt, abgerechnet oder ein Ereignis ohne Patient:in -,
  -- laesst den ganzen Vorgang scheitern.
  v_geschickt := cardinality(array(select distinct unnest(p_appointment_ids)));

  select count(*), array_agg(distinct a.treatment_basis_id)
    into v_anzahl, v_quellen
  from public.appointments a
  where a.id = any(p_appointment_ids)
    and a.organization_id = v_org
    and a.patient_id      = v_patient
    and a.status not in ('cancelled', 'invoiced')
    -- Abgerechnet ist die Leistung, nicht der Termin (ANN-081): Der Zustand
    -- 'invoiced' an appointments entsteht im Betrieb nicht, issue_invoice
    -- setzt ihn nicht. Geprueft wird deshalb der Zustand, den es wirklich
    -- gibt. Die Bedingung oben bleibt daneben stehen - sie kostet nichts und
    -- traegt weiter, falls ADR-018 spaeter vollstaendig umgesetzt wird.
    and not exists (
      select 1 from public.billable_services b
      where b.appointment_id = a.id
        and b.status = 'invoiced'
    );

  if v_anzahl <> v_geschickt then
    raise exception 'appointments are not transferable' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------------------
  -- ABN-002: Die erfassten Leistungen, die eine Position tragen und noch nicht
  -- am Ziel haengen. Je alter Position die Zielposition mit demselben
  -- Heilmittel; fehlt eine, ist der ganze Vorgang abzuweisen - bevor
  -- irgendetwas geschrieben wurde.
  -- ---------------------------------------------------------------------------
  create temp table abn_umzug on commit drop as
    select b.id              as leistung_id,
           b.quantity        as menge,
           alt.id            as alte_position,
           alt.remedy        as remedy,
           neu.id            as neue_position
    from public.billable_services b
    join public.treatment_base_items alt on alt.id = b.treatment_base_item_id
    left join public.treatment_base_items neu
           on neu.treatment_basis_id = p_treatment_basis_id
          and neu.remedy = alt.remedy
    where b.appointment_id = any(p_appointment_ids)
      and b.organization_id = v_org
      and b.status = 'billable'
      and alt.treatment_basis_id <> p_treatment_basis_id;

  select string_agg(distinct u.remedy, ', ' order by u.remedy)
    into v_fehlend
  from abn_umzug u
  where u.neue_position is null;

  if v_fehlend is not null then
    raise exception 'target basis has no position for remedy %', v_fehlend
      using errcode = '22023';
  end if;

  select count(*) into v_leistungen from abn_umzug;

  if v_leistungen > 0 then
    -- Genau das zuruecknehmen, was das Erfassen gesetzt hat (wie
    -- delete_billable_services) ...
    update public.treatment_base_items p
       set used_quantity = greatest(p.used_quantity - s.menge, 0)
    from (select alte_position, sum(menge)::smallint as menge from abn_umzug group by alte_position) s
    where p.id = s.alte_position;

    -- ... und am Ziel neu verbrauchen. Die Constraint
    -- used_quantity <= prescribed_quantity schuetzt die Abrechnung (ADR-020
    -- Punkt 5); sie bekommt hier nur eine verstaendliche Meldung.
    begin
      update public.treatment_base_items p
         set used_quantity = p.used_quantity + s.menge
      from (select neue_position, sum(menge)::smallint as menge from abn_umzug group by neue_position) s
      where p.id = s.neue_position;
    exception
      when check_violation then
        raise exception 'target basis quantity exhausted' using errcode = '23514';
    end;

    update public.billable_services b
       set treatment_base_item_id = u.neue_position
    from abn_umzug u
    where b.id = u.leistung_id;

    select coalesce(jsonb_agg(jsonb_build_object('remedy', remedy, 'quantity', menge) order by remedy), '[]'::jsonb)
      into v_mengen
    from (select remedy, sum(menge) as menge from abn_umzug group by remedy) m;
  end if;

  -- Der Termin behaelt Tag, Zeit, Person und Ort. `updated_at` bleibt deshalb
  -- unberuehrt: Der Mitteilungsvermerk haengt daran (CAL-012) und gilt weiter -
  -- mitgeteilt wurde ein Zeitpunkt, keine Grundlage.
  update public.appointments a
     set treatment_basis_id = p_treatment_basis_id
   where a.id = any(p_appointment_ids)
     and a.organization_id = v_org;

  -- Ein Ereignis je Uebertragung (CAL-022), ohne klinischen Inhalt: wer, wann,
  -- welche Termine, von welcher Grundlage auf welche, und seit ABN-002 welche
  -- Leistungen und Mengen mitgezogen sind.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.appointments_transferred', 'treatment_basis',
    p_treatment_basis_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_patient,
      'appointment_ids', to_jsonb(p_appointment_ids),
      'from_treatment_basis_ids', to_jsonb(coalesce(v_quellen, array[]::uuid[])),
      'appointment_count', v_anzahl,
      'service_count', v_leistungen,
      'moved_quantities', v_mengen
    )
  );

  return v_anzahl;
end;
$$;

comment on function public.transfer_appointments_to_treatment_basis(uuid, uuid[]) is
  'Uebertraegt Termine auf eine andere Behandlungsgrundlage derselben Patient:in (CAL-022, ANN-068, ANN-081, R3-001, ABN-002): alles oder nichts, die Patient:in kommt aus der Zielgrundlage, abgesagte Termine und solche mit abgerechneter Leistung sind ausgeschlossen. Erfasste, nicht abgerechnete Leistungen ziehen in derselben Transaktion auf die Position der Zielgrundlage mit demselben Heilmittel mit, die genutzte Menge wandert; ohne passende Position oder bei erschoepftem Kontingent wird abgewiesen. Kein Kontingentabbruch fuer die Planung. Protokolliert ein Ereignis je Vorgang (ADR-010).';
