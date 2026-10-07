-- =============================================================================
-- KND-001 (KND-EPIC-001): Erinnerung an das Abschlussgespraech
--
-- PROJECT_PRINCIPLES.md 4.10: "In den letzten Terminen einer
-- Behandlungsgrundlage erinnert die Anwendung die behandelnde Person an das
-- Abschlussgespraech." Die Erinnerung steht am Termin selbst - auf der
-- Tageskarte und in der Terminansicht - und ist eine Auskunft, kein Vorgang.
--
--   app.closing_talk_due                       ist dieser Termin einer der
--                                              letzten seiner Grundlage?
--   public.get_appointment_billing_context     + closing_talk_due
--
-- WANN (ANN-286): an den letzten zwei Terminen einer Grundlage mit
-- Terminzahl (Position >= Terminzahl - 1), solange die Versorgung offen ist,
-- keine juengere Grundlage derselben Person besteht und seit dem Beginn der
-- Grundlage kein Trainingsangebot in der Akte steht (KND-002), das nicht
-- zurueckgezogen ist. Selbstzahler eingeschlossen - auch sie koennen danach
-- trainieren.
--
-- KEIN BLICK INS TRAINING (4.8): Die Erinnerung fragt nur die Akte. Ob die
-- Person schon trainiert, beeinflusst sie nicht - sonst verriete der Hinweis
-- einer Therapeut:in ein Trainingsverhaeltnis.
--
-- Der Rueckgabetyp waechst um eine Spalte; die Funktion wird deshalb neu
-- angelegt (Rumpf aus 20260929140000_prx_epic_002_zweitreview.sql, sonst
-- unveraendert), die Rechte wie dort.
-- =============================================================================

create function app.closing_talk_due(p_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.kind = 'therapy'
       and a.status not in ('cancelled', 'no_show')
       and b.appointment_count is not null
       and app.appointment_basis_position(a.id) >= b.appointment_count - 1
       and pa.care_concluded_on is null
       and not exists (
         select 1 from public.treatment_bases neu
         where neu.patient_id = b.patient_id
           and neu.organization_id = b.organization_id
           and (neu.issued_on, neu.created_at) > (b.issued_on, b.created_at)
       )
       and not exists (
         select 1 from public.training_offers o
         where o.patient_id = a.patient_id
           and o.organization_id = a.organization_id
           and o.withdrawn_at is null
           and o.created_at >= b.created_at
       )
    from public.appointments a
    join public.treatment_bases b on b.id = a.treatment_basis_id and b.organization_id = a.organization_id
    join public.patients pa on pa.id = a.patient_id and pa.organization_id = a.organization_id
    where a.id = p_appointment_id
  ), false)
$$;

revoke all on function app.closing_talk_due(uuid) from public, anon, authenticated;

comment on function app.closing_talk_due(uuid) is
  'KND-001 (ANN-286): Ist dieser Behandlungstermin einer der letzten zwei seiner Grundlage, bei offener Versorgung, ohne juengere Grundlage und ohne Trainingsangebot seit Beginn der Grundlage? Fragt nur die Akte, nie das Training (4.8).';

drop function public.get_appointment_billing_context(uuid);

create function public.get_appointment_billing_context(p_appointment_id uuid)
returns table (
  appointment_id            uuid,
  treatment_basis_id        uuid,
  treatment_basis_kind      text,
  treatment_basis_issued_on date,
  basis_position            integer,
  basis_appointment_count   integer,
  billing_visible           boolean,
  recipient_kind            text,
  open_invoice_count        integer,
  open_outstanding_cents    integer,
  open_overdue              boolean,
  closing_talk_due          boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_patient uuid;
  v_kind    text;
  v_basis   uuid;
  v_darf    boolean;
  v_heute   date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'appointments.read', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  select a.patient_id, a.kind, a.treatment_basis_id
    into v_patient, v_kind, v_basis
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
    -- Zweitreview: ein nicht lesbarer Bereich wie ein unbekannter Termin.
    and app.may_read_appointment_context(a.kind);

  if not found then
    return;
  end if;

  -- Die Abrechnungslage gibt es am Behandlungstermin. Training rechnet ueber
  -- ein eigenes Verhaeltnis ab (ADR-021), eine Fehlzeit gar nicht.
  if v_kind <> 'therapy' or v_patient is null then
    raise exception 'a billing context exists only for treatment appointments'
      using errcode = '22023';
  end if;

  -- ANN-139: Zahlungsinformationen nur fuer die Rollen der Abrechnung.
  v_darf := app.can_read_invoicing();
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = v_org;

  return query
    select
      p_appointment_id,
      b.id,
      b.treatment_basis_kind,
      b.issued_on,
      app.appointment_basis_position(p_appointment_id),
      b.appointment_count,
      v_darf,
      case when v_darf then coalesce((
        select r.recipient_kind
        from public.invoice_recipients r
        where r.patient_id = v_patient
          and r.organization_id = v_org
          and r.is_default
      ), 'self') end,
      case when v_darf then offen.anzahl end,
      case when v_darf then offen.betrag end,
      case when v_darf then offen.ueberfaellig end,
      -- KND-001: Abschlussgespraech in den letzten Terminen (ANN-286).
      app.closing_talk_due(p_appointment_id)
    from (select 1) eins
    left join public.treatment_bases b on b.id = v_basis and b.organization_id = v_org
    left join lateral (
      select count(*)::integer as anzahl,
             coalesce(sum(o.outstanding_cents), 0)::integer as betrag,
             coalesce(bool_or(o.due_on < v_heute), false) as ueberfaellig
      from app.open_invoices(v_org) o
      where o.patient_id = v_patient
    ) offen on v_darf;
end;
$$;

comment on function public.get_appointment_billing_context(uuid) is
  'PRX-008: Verordnungszaehler und Abrechnungslage am Termin. Position fuer alle Rollen der Terminverwaltung, Empfaenger und offene Rechnungen nur fuer owner und office (ANN-139). Seit KND-001 dazu closing_talk_due: Erinnerung an das Abschlussgespraech (ANN-286).';

revoke all on function public.get_appointment_billing_context(uuid) from public, anon;
grant execute on function public.get_appointment_billing_context(uuid) to authenticated;
