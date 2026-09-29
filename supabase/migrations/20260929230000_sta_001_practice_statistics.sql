-- =============================================================================
-- STA-001: Fuenf Kennzahlen fuer die Praxisfuehrung (STA-EPIC-001, IDEA-PRX-025)
--
-- Eine lesende Funktion, eine Zeile, fuenf Zahlen - gerechnet in dieser einen
-- Quelle, ausschliesslich aus vorhandenen Daten. Keine Tabelle, kein Lauf, der
-- Werte ablegt, und damit keine zweite Datenhaltung neben Abrechnung (ADR-009)
-- und Terminen (ADR-018).
--
--   (1) UMSATZ UND ZAHLUNGSEINGANG des gewaehlten Monats und des Vormonats.
--       Zwei getrennte Zahlen mit zwei getrennten Rechenwegen wie in der
--       Auswertung "Einnahmen je Leistungsart" (ADR-009 Punkt 19, ABR-011):
--       Umsatz ist Rechnungsstellung (ausgestellte Rechnungen am
--       Ausstellungstag, Stornodokumente am Tag des Stornos mit umgekehrtem
--       Vorzeichen), Zahlungseingang ist Zufluss (gebuchte Zahlungen, eine
--       Rueckzahlung zieht ab, eine stornierte Zahlung zaehlt nicht). Beide
--       werden nie zu einer Zahl verrechnet. Der Umsatz ist brutto und steht
--       als Praxissumme mit der Aufteilung je Leistungsbereich (ANN-151).
--   (2) OFFENE POSTEN mit Alter: aus app.open_invoices, der einen Regel fuer
--       "offen" (PRX-008), gestaffelt nach Tagen ueber der Faelligkeit.
--   (3) AUSLASTUNG der naechsten vierzehn Tage (heute eingeschlossen): Minuten
--       gebuchter Behandlungs- und Trainingstermine INNERHALB der Arbeitszeit
--       gegen die Minuten der Arbeitszeit selbst, nach derselben Regel wie die
--       Terminsuche (app.working_ranges). Nur als Praxissumme (ANN-152).
--   (4) VERORDNUNGEN OHNE ANSCHLUSS, die enden oder aufgebraucht sind - dieselbe
--       Regel wie die Erinnerung (PRX-016, ANN-146), die dafuer hier an eine
--       gemeinsame Stelle zieht (app.ending_treatment_bases) -, dazu kommende
--       Termine einer Verordnung, die sie nicht mehr deckt
--       (app.appointment_is_covered); Selbstzahler zaehlen in beiden nicht.
--   (5) AUSFAELLE der letzten vier Wochen und der vier davor: Absagen durch
--       Patient:innen und Nichtantreffen, davon mit Gebuehrenanlass, und die
--       Summe der erfassten Ausfallhonorare (ANN-153).
--
-- WER: allein owner (ADR-004, Roadmap STA-EPIC-001). Ein abgewiesener Aufruf
-- liefert keine Zeile und wird als statistics.read protokolliert (G6b). Ein
-- erfolgreicher Aufruf wird NICHT protokolliert: Die Funktion liefert Summen
-- ohne Personenbezug - keine Patientin, keine Rechnung, keine Mitarbeiterin
-- (ANN-154, Par. 20, B6).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Verordnungen, die enden - die eine Regel
--
-- Der Rumpf stammt unveraendert aus list_ending_prescriptions (PRX-016). Die
-- Erinnerung und die Kennzahl lesen ab jetzt beide hier; zwei Kopien derselben
-- Regel liefen frueher oder spaeter auseinander.
-- -----------------------------------------------------------------------------
create function app.ending_treatment_bases(p_organization_id uuid)
returns table (
  treatment_basis_id        uuid,
  patient_id                uuid,
  prescriber_id             uuid,
  treatment_basis_kind      text,
  issued_on                 date,
  follow_up_recommendation  text,
  prescribed                integer,
  used                      integer,
  planned                   integer,
  last_appointment_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with kandidaten as (
    select tb.id, tb.patient_id, tb.prescriber_id, tb.treatment_basis_kind, tb.issued_on,
           tb.follow_up_recommendation,
           z.prescribed, z.used, z.planned,
           (select max(a.starts_at)
              from public.appointments a
             where a.treatment_basis_id = tb.id
               and a.organization_id = p_organization_id
               and a.status <> 'cancelled') as letzter
    from public.treatment_bases tb
    join public.patients pa on pa.id = tb.patient_id
    cross join lateral app.treatment_basis_slot_counts(tb.id, p_organization_id) z
    where tb.organization_id = p_organization_id
      and tb.treatment_basis_kind <> 'self_pay'
      and pa.status = 'active'
      and pa.care_concluded_on is null
      -- Ohne Anschluss: keine juengere Grundlage derselben Person.
      and not exists (
        select 1 from public.treatment_bases neu
        where neu.patient_id = tb.patient_id
          and neu.organization_id = p_organization_id
          and (neu.issued_on, neu.created_at) > (tb.issued_on, tb.created_at)
      )
  )
  select k.id, k.patient_id, k.prescriber_id, k.treatment_basis_kind, k.issued_on,
         k.follow_up_recommendation, k.prescribed, k.used, k.planned, k.letzter
  from kandidaten k
  where k.prescribed is not null
    and (
      k.used >= k.prescribed
      or (
        greatest(k.used, k.planned) >= k.prescribed
        and k.letzter is not null
        and k.letzter <= now() + app.reminder_prescription_horizon()
      )
    )
$$;

comment on function app.ending_treatment_bases(uuid) is
  'Verordnungen ohne Anschluss, deren Kontingent genutzt oder ganz verplant ist und deren letzter Termin in den naechsten vierzehn Tagen liegt (PRX-016, ANN-146). Einzige Stelle der Regel; list_ending_prescriptions und get_practice_statistics lesen daraus (STA-001). Ohne Rollenpruefung: nur aus Funktionen mit eigener Pruefung aufrufen.';

revoke all on function app.ending_treatment_bases(uuid) from public, anon, authenticated;

-- Die Erinnerung liest jetzt aus der Regel; Rueckgabe, Rollen und Reihenfolge
-- unveraendert (Rumpf aus 20260929210000_prx_016_reminders.sql).
create or replace function public.list_ending_prescriptions()
returns table (
  treatment_basis_id    uuid,
  patient_id            uuid,
  patient_given_name    text,
  patient_family_name   text,
  treatment_basis_kind  text,
  issued_on             date,
  prescribed            integer,
  used                  integer,
  planned               integer,
  last_appointment_at   timestamptz,
  has_recommendation    boolean,
  prescriber_name       text,
  prescriber_phone      text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_treatment_bases() then
    perform app.record_denied_read(auth.uid(), 'treatment_bases.read', 'not allowed to read ending prescriptions');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read ending prescriptions' using errcode = '42501';
  end if;

  return query
  select k.treatment_basis_id,
         k.patient_id,
         pe.given_name,
         pe.family_name,
         k.treatment_basis_kind,
         k.issued_on,
         k.prescribed,
         k.used,
         k.planned,
         k.last_appointment_at,
         (k.follow_up_recommendation is not null or exists (
           select 1 from public.therapy_reports r
           where r.treatment_basis_id = k.treatment_basis_id
             and r.organization_id = v_org
             and r.recommendation is not null
         )),
         nullif(btrim(concat_ws(' ', pr.title, pr.given_name, pr.family_name)), ''),
         pr.phone
  from app.ending_treatment_bases(v_org) k
  join public.patients pa on pa.id = k.patient_id
  join public.persons pe on pe.id = pa.person_id
  left join public.prescribers pr on pr.id = k.prescriber_id
  order by k.last_appointment_at asc nulls first, pe.family_name, k.treatment_basis_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Wer die Kennzahlen sehen darf
-- -----------------------------------------------------------------------------
create function app.can_read_practice_statistics()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select app.has_any_role('owner') $$;

comment on function app.can_read_practice_statistics() is
  'STA-001: Die Kennzahlen der Praxisfuehrung sieht allein owner (ADR-004, Roadmap STA-EPIC-001). Eine Stelle fuer Lesen und Zielwerte.';

revoke all on function app.can_read_practice_statistics() from public, anon;
grant execute on function app.can_read_practice_statistics() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Auditkatalog: statistics.read (nur fuer den abgewiesenen Fall)
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text])));

-- -----------------------------------------------------------------------------
-- Bruttobetrag eines Rechnungsdokuments - dieselbe Rechnung wie die Auswertung
-- "Einnahmen je Leistungsart" (ABR-011): die Summe der Steuergruppen im
-- Snapshot, nicht eine Spalte daneben. Laufen Snapshot und Spalte je
-- auseinander, zeigen Statistik und Auswertung trotzdem dieselbe Zahl.
-- -----------------------------------------------------------------------------
create function app.snapshot_gross_cents(p_snapshot jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum((g ->> 'gross_cents')::bigint), 0)::bigint
  from jsonb_array_elements(coalesce(p_snapshot -> 'tax_groups', '[]'::jsonb)) as g
$$;

comment on function app.snapshot_gross_cents(jsonb) is
  'STA-001: Brutto eines ausgestellten Rechnungsdokuments als Summe seiner Steuergruppen im Snapshot - dieselbe Grundlage wie list_revenue_by_service_area (ABR-011).';

revoke all on function app.snapshot_gross_cents(jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Die Kennzahlen
--
-- p_month ist irgendein Tag des Monats fuer Kennzahl (1); ohne Angabe der
-- laufende Monat in der Zeitzone der Praxis. Die Kennzahlen (2) bis (5) sind
-- Stichtagswerte von heute - ihr Vergleich ist der Vorzeitraum aus (5); einen
-- gespeicherten Verlauf gibt es bewusst nicht (keine zweite Datenhaltung).
-- -----------------------------------------------------------------------------
create function public.get_practice_statistics(p_month date default null)
returns table (
  time_zone                     text,
  today                         date,
  -- (1) Umsatz und Zahlungseingang
  month                         date,
  previous_month                date,
  revenue_cents                 bigint,
  revenue_therapy_cents         bigint,
  revenue_training_cents        bigint,
  revenue_previous_cents        bigint,
  payments_cents                bigint,
  payments_previous_cents       bigint,
  -- (2) Offene Posten
  open_count                    integer,
  open_cents                    bigint,
  open_not_due_count            integer,
  open_not_due_cents            bigint,
  open_overdue_1_30_count       integer,
  open_overdue_1_30_cents       bigint,
  open_overdue_31_60_count      integer,
  open_overdue_31_60_cents      bigint,
  open_overdue_over_60_count    integer,
  open_overdue_over_60_cents    bigint,
  -- (3) Auslastung
  utilization_from              date,
  utilization_to                date,
  available_minutes             integer,
  booked_minutes                integer,
  -- (4) Verordnungen ohne Anschluss
  ending_bases                  integer,
  uncovered_appointments        integer,
  -- (5) Ausfaelle
  absences_from                 date,
  absences_to                   date,
  patient_cancellations         integer,
  no_shows                      integer,
  absences_with_fee             integer,
  absence_fee_cents             bigint,
  absences_previous             integer,
  absence_fee_previous_cents    bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org        uuid;
  v_tz         text;
  v_heute      date;
  v_monat      date;
  v_vormonat   date;
  v_ausfall_ab date;
  v_vorher_ab  date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_practice_statistics() then
    perform app.record_denied_read(auth.uid(), 'statistics.read', 'not allowed to read practice statistics');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read practice statistics' using errcode = '42501';
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_tz)::date;
  v_monat := date_trunc('month', coalesce(p_month, v_heute))::date;
  if v_monat < date '2020-01-01' or v_monat > date '2200-01-01' then
    raise exception 'month out of range' using errcode = '22023';
  end if;
  v_vormonat := (v_monat - interval '1 month')::date;
  -- Vier Wochen einschliesslich heute, davor dieselbe Laenge.
  v_ausfall_ab := v_heute - 27;
  v_vorher_ab  := v_heute - 55;

  return query
  with
  -- ---------------------------------------------------------------------------
  -- (1) Rechnungsstellung: Rechnung am Ausstellungstag, Storno am eigenen Tag
  -- ---------------------------------------------------------------------------
  rechnungsstellung as (
    select i.issued_on as tag,
           coalesce(i.snapshot ->> 'service_area', i.service_area) as bereich,
           app.snapshot_gross_cents(i.snapshot) as betrag
    from public.invoices i
    where i.organization_id = v_org
      and i.status = 'issued'
      and i.issued_on >= v_vormonat
      and i.issued_on < (v_monat + interval '1 month')::date
    union all
    select c.cancelled_on,
           coalesce(i.snapshot ->> 'service_area', i.service_area),
           -app.snapshot_gross_cents(i.snapshot)
    from public.invoice_cancellations c
    join public.invoices i on i.id = c.invoice_id
    where c.organization_id = v_org
      and c.cancelled_on >= v_vormonat
      and c.cancelled_on < (v_monat + interval '1 month')::date
  ),
  umsatz as (
    select coalesce(sum(r.betrag) filter (where r.tag >= v_monat), 0)::bigint as gesamt,
           coalesce(sum(r.betrag) filter (where r.tag >= v_monat and r.bereich = 'therapy'), 0)::bigint as behandlung,
           coalesce(sum(r.betrag) filter (where r.tag >= v_monat and r.bereich = 'training'), 0)::bigint as training,
           coalesce(sum(r.betrag) filter (where r.tag < v_monat), 0)::bigint as vormonat
    from rechnungsstellung r
  ),
  -- Zufluss: gebuchte Zahlungen, die Rueckzahlung zieht ab.
  zufluss as (
    select coalesce(sum(case p.direction when 'incoming' then p.amount_cents else -p.amount_cents end)
                      filter (where p.paid_on >= v_monat), 0)::bigint as monat,
           coalesce(sum(case p.direction when 'incoming' then p.amount_cents else -p.amount_cents end)
                      filter (where p.paid_on < v_monat), 0)::bigint as vormonat
    from public.payments p
    where p.organization_id = v_org
      and p.voided_at is null
      and p.paid_on >= v_vormonat
      and p.paid_on < (v_monat + interval '1 month')::date
  ),
  -- ---------------------------------------------------------------------------
  -- (2) Offene Posten nach Tagen ueber der Faelligkeit
  -- ---------------------------------------------------------------------------
  offen as (
    select o.outstanding_cents::bigint as betrag,
           v_heute - o.due_on as tage
    from app.open_invoices(v_org) o
  ),
  posten as (
    select count(*)::integer as anzahl,
           coalesce(sum(o.betrag), 0)::bigint as summe,
           count(*) filter (where o.tage is null or o.tage <= 0)::integer as n0,
           coalesce(sum(o.betrag) filter (where o.tage is null or o.tage <= 0), 0)::bigint as s0,
           count(*) filter (where o.tage between 1 and 30)::integer as n1,
           coalesce(sum(o.betrag) filter (where o.tage between 1 and 30), 0)::bigint as s1,
           count(*) filter (where o.tage between 31 and 60)::integer as n2,
           coalesce(sum(o.betrag) filter (where o.tage between 31 and 60), 0)::bigint as s2,
           count(*) filter (where o.tage > 60)::integer as n3,
           coalesce(sum(o.betrag) filter (where o.tage > 60), 0)::bigint as s3
    from offen o
  ),
  -- ---------------------------------------------------------------------------
  -- (3) Auslastung: Arbeitszeit und gebuchte Zeit darin, je Person und Tag
  -- gerechnet und nur als Summe geliefert (ANN-152).
  -- ---------------------------------------------------------------------------
  tage as (
    select g::date as tag
    from generate_series(v_heute::timestamp, (v_heute + 13)::timestamp, interval '1 day') g
  ),
  arbeit as (
    select sm.id as staff, t.tag, app.working_ranges(sm.id, v_org, t.tag) as bereiche
    from public.staff_members sm
    cross join tage t
    where sm.organization_id = v_org
      and app.is_assignable_therapist(sm.id, v_org)
  ),
  gebucht as (
    select a.staff, a.tag,
           range_agg(app.timerange(
             greatest(t.starts_at at time zone v_tz, a.tag::timestamp)::time,
             case when t.ends_at at time zone v_tz >= (a.tag + 1)::timestamp
                  then time '24:00'
                  else (t.ends_at at time zone v_tz)::time end,
             '[)'
           )) as zeiten
    from arbeit a
    join public.appointments t
      on t.organization_id = v_org
     and t.staff_member_id = a.staff
     and t.status <> 'cancelled'
     and t.kind in ('therapy', 'training')
     and t.starts_at < ((a.tag + 1)::timestamp at time zone v_tz)
     and t.ends_at > (a.tag::timestamp at time zone v_tz)
    where a.bereiche is not null
    group by a.staff, a.tag
  ),
  auslastung as (
    select coalesce(sum((
             select sum(extract(epoch from (upper(r) - lower(r))) / 60)
             from unnest(a.bereiche) r
           )), 0)::integer as verfuegbar,
           coalesce(sum((
             select sum(extract(epoch from (upper(r) - lower(r))) / 60)
             from unnest(a.bereiche * g.zeiten) r
           )), 0)::integer as belegt
    from arbeit a
    left join gebucht g on g.staff = a.staff and g.tag = a.tag
    where a.bereiche is not null
  ),
  -- ---------------------------------------------------------------------------
  -- (4) Verordnungen ohne Anschluss und ungedeckte kommende Termine
  -- ---------------------------------------------------------------------------
  verordnungen as (
    select count(*)::integer as endend
    from app.ending_treatment_bases(v_org)
  ),
  ungedeckt as (
    select count(*)::integer as termine
    from public.appointments a
    -- Nur Verordnungen: Bei einem Selbstzahler gibt es niemanden anzufragen,
    -- und die Kennzahl gilt den Verordnungen (wie app.ending_treatment_bases).
    join public.treatment_bases tb
      on tb.id = a.treatment_basis_id
     and tb.treatment_basis_kind <> 'self_pay'
    where a.organization_id = v_org
      and a.status = 'confirmed'
      and a.starts_at >= now()
      and app.appointment_is_covered(a.id) is false
  ),
  -- ---------------------------------------------------------------------------
  -- (5) Ausfaelle nach dem Tag des Termins (ANN-153). Eine Absage bleibt
  -- `cancelled`, ein Nichtantreffen `no_show` - auch mit Gebuehr und Rechnung
  -- darueber (Constraints appointments_cancellation_fields, _no_show_fields).
  -- ---------------------------------------------------------------------------
  ausfall as (
    select a.id,
           (a.starts_at at time zone v_tz)::date as tag,
           (a.status = 'cancelled' and a.cancellation_reason = 'patient_request') as absage,
           (a.status = 'no_show') as nicht_angetroffen,
           (a.fee_basis is not null) as mit_gebuehr
    from public.appointments a
    where a.organization_id = v_org
      and a.kind in ('therapy', 'training')
      and a.starts_at >= (v_vorher_ab::timestamp at time zone v_tz)
      and a.starts_at < ((v_heute + 1)::timestamp at time zone v_tz)
      and (
        (a.status = 'cancelled' and a.cancellation_reason = 'patient_request')
        or a.status = 'no_show'
      )
  ),
  honorar as (
    select f.id,
           coalesce(sum(bs.quantity * ci.unit_price_cents), 0)::bigint as betrag
    from ausfall f
    join public.billable_services bs on bs.appointment_id = f.id
    join public.service_catalog_items ci on ci.id = bs.catalog_item_id and ci.item_kind = 'absence_fee'
    group by f.id
  ),
  ausfaelle as (
    select count(*) filter (where f.tag >= v_ausfall_ab and f.absage)::integer as absagen,
           count(*) filter (where f.tag >= v_ausfall_ab and f.nicht_angetroffen)::integer as nicht_angetroffen,
           count(*) filter (where f.tag >= v_ausfall_ab and f.mit_gebuehr)::integer as mit_gebuehr,
           coalesce(sum(h.betrag) filter (where f.tag >= v_ausfall_ab), 0)::bigint as honorar,
           count(*) filter (where f.tag < v_ausfall_ab)::integer as vorher,
           coalesce(sum(h.betrag) filter (where f.tag < v_ausfall_ab), 0)::bigint as honorar_vorher
    from ausfall f
    left join honorar h on h.id = f.id
  )
  select v_tz,
         v_heute,
         v_monat,
         v_vormonat,
         u.gesamt, u.behandlung, u.training, u.vormonat,
         z.monat, z.vormonat,
         p.anzahl, p.summe, p.n0, p.s0, p.n1, p.s1, p.n2, p.s2, p.n3, p.s3,
         v_heute, v_heute + 13, al.verfuegbar, al.belegt,
         v.endend, ug.termine,
         v_ausfall_ab, v_heute,
         af.absagen, af.nicht_angetroffen, af.mit_gebuehr, af.honorar,
         af.vorher, af.honorar_vorher
  from umsatz u, zufluss z, posten p, auslastung al, verordnungen v, ungedeckt ug, ausfaelle af;
end;
$$;

comment on function public.get_practice_statistics(date) is
  'STA-001: fuenf Kennzahlen der Praxisfuehrung in einer Zeile - Umsatz und Zahlungseingang des Monats gegen den Vormonat (getrennte Grundlagen), offene Posten nach Alter, Auslastung der naechsten vierzehn Tage, Verordnungen ohne Anschluss samt ungedeckter Termine, Ausfaelle der letzten vier Wochen gegen die vier davor. Nur Summen, keine Person. Allein owner; ein abgewiesener Aufruf liefert keine Zeile und wird als statistics.read protokolliert.';

revoke all on function public.get_practice_statistics(date) from public, anon;
grant execute on function public.get_practice_statistics(date) to authenticated;
