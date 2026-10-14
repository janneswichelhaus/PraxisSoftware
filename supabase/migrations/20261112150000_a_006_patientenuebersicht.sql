-- =============================================================================
-- B1 und B10 (BEF-151, BEF-160, Auftrag Jannes 14.10.2026): Die Patientenliste
-- zeigt Karteileichen und den Zahlungsstand, die Akte den Stand jeder
-- Grundlage und die Rechnungen der Person.
--
-- Jannes: „Karteileichen sichtbar machen: offene Verordnung, die noch Termine
-- oder Abrechnung braucht. Zusätzlich anzeigen, was abgerechnet ist, welche
-- Zahlungen eingegangen sind und wo gemahnt werden muss.“ Und statt der Suche
-- ab drei Zeichen „eine Patientenliste, die sich filtern und sortieren lässt
-- (zuletzt behandelt, offene Verordnung, A–Z)“. Rechte und RLS bleiben.
--
-- Zusammengefuehrt wird, was es gibt - nichts davon rechnet neu:
--   * der Stand je Grundlage aus app.treatment_basis_billing (a_005, ANN-514),
--   * offene Rechnungen und Zahlungen wie app.open_invoices und list_invoices,
--   * Zahlungserinnerungen aus invoice_payment_reminders (ABR-003d).
--
--   1. app.invoice_reminder_due - die eine Regel fuer „zu mahnen“ (ANN-516).
--   2. list_patient_overview - die Liste als ein JSON-Wert: Sie muss jede
--      Person tragen, auch ueber die 200 Zeilen hinaus, die die API je Antwort
--      liefert (config.toml max_rows); ein Wert wird nicht gekuerzt.
--   3. list_patient_treatment_basis_slots - dazu der Stand je Grundlage.
--   4. list_patient_invoices - die Rechnungen einer Person (owner, office).
--
-- Rollen wie bisher: Kartei, Termine und Grundlagen lesen owner, therapist,
-- team_lead und office; Rechnungen und Zahlungen nur owner und office
-- (ANN-139). Keine Auditaktion: Die Liste ist keine Akteneinsicht.
-- =============================================================================

-- 1. Zu mahnen ------------------------------------------------------------------

-- ANN-516: Zu mahnen ist eine ueberfaellige Rechnung ohne laufende Erinnerungsfrist.
create function app.invoice_reminder_due(
  p_invoice_id  uuid,
  p_due_on      date,
  p_outstanding integer,
  p_today       date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_outstanding, 0) > 0
     and p_due_on < p_today
     and not exists (
       select 1
       from public.invoice_payment_reminders r
       where r.invoice_id = p_invoice_id
         and r.due_on >= p_today
     )
$$;

revoke all on function app.invoice_reminder_due(uuid, date, integer, date) from public, anon, authenticated;

comment on function app.invoice_reminder_due(uuid, date, integer, date) is
  'B1 (BEF-151, ANN-516): Eine ausgestellte Rechnung ist zu mahnen, wenn etwas offen ist, das Zahlungsziel verstrichen ist und keine Zahlungserinnerung eine noch laufende Frist gesetzt hat. Keine Stufe, keine Gebuehr (ANN-080).';

-- 2. Die Patientenliste ---------------------------------------------------------

create function public.list_patient_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org        uuid;
  v_zeitzone   text;
  v_heute      date;
  v_abrechnung boolean;
  v_liste      jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_patient_directory() then
    -- G6b: abgewiesen wird mit leerer Liste und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'patient_directory.read', 'not allowed to read the patient directory');
    return '[]'::jsonb;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read the patient directory' using errcode = '42501';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;
  -- ANN-139: Rechnungen und Zahlungen nur fuer die Rollen der Abrechnung.
  v_abrechnung := app.can_read_invoicing();

  with personen as (
    select p.id, pe.given_name, pe.family_name,
           c.date_of_birth, c.email, c.phone, c.postal_code, c.city
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details c on c.patient_id = p.id
    where p.organization_id = v_org
  ),
  termine as (
    select a.patient_id,
           max((a.starts_at at time zone v_zeitzone)::date)
             filter (where a.starts_at <= now() and a.status not in ('cancelled', 'no_show'))
             as zuletzt,
           min(a.starts_at)
             filter (where a.status = 'confirmed' and a.starts_at > now())
             as naechster
    from public.appointments a
    where a.organization_id = v_org
      and a.kind = 'therapy'
      and a.patient_id is not null
    group by a.patient_id
  ),
  grundlagen as (
    select tb.patient_id,
           count(*) filter (where s.state in ('laeuft', 'termine_fehlen', 'nachholen', 'abrechnen'))
             as offen,
           count(*) filter (where s.state = 'termine_fehlen') as termine_fehlen,
           count(*) filter (where s.state = 'nachholen') as nachholen,
           count(*) filter (where s.state = 'abrechnen') as abrechnen,
           count(*) filter (where s.state = 'in_abrechnung') as in_abrechnung
    from public.treatment_bases tb
    cross join lateral app.treatment_basis_billing(tb.id) s
    where tb.organization_id = v_org
    group by tb.patient_id
  ),
  rechnungen as (
    select i.patient_id,
           count(*) as gestellt,
           count(*) filter (where z.bezahlt >= i.total_cents) as bezahlt,
           sum(greatest(i.total_cents - z.bezahlt, 0)) as offen_cents,
           count(*) filter (where i.total_cents - z.bezahlt > 0 and i.due_on < v_heute)
             as ueberfaellig,
           count(*) filter (where app.invoice_reminder_due(i.id, i.due_on, i.total_cents - z.bezahlt, v_heute))
             as mahnen
    from public.invoices i
    left join lateral (
      select coalesce(sum(case when p.direction = 'incoming' then p.amount_cents
                               else -p.amount_cents end), 0)::integer as bezahlt
      from public.payments p
      where p.invoice_id = i.id
        and p.voided_at is null
    ) z on true
    where v_abrechnung
      and i.organization_id = v_org
      and i.status = 'issued'
      and i.patient_id is not null
      -- Eine stornierte Rechnung ist keine Forderung mehr (ABR-003c).
      and not exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id)
    group by i.patient_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pe.id,
           'given_name', pe.given_name,
           'family_name', pe.family_name,
           'date_of_birth', pe.date_of_birth,
           'email', pe.email,
           'phone', pe.phone,
           'postal_code', pe.postal_code,
           'city', pe.city,
           'last_visit_on', t.zuletzt,
           'next_appointment_at', t.naechster,
           'open_bases', coalesce(g.offen, 0),
           'bases_need_appointments', coalesce(g.termine_fehlen, 0),
           'bases_need_followup', coalesce(g.nachholen, 0),
           'bases_ready', coalesce(g.abrechnen, 0),
           'bases_in_billing', coalesce(g.in_abrechnung, 0),
           'billing_visible', v_abrechnung,
           'invoices_issued', case when v_abrechnung then coalesce(r.gestellt, 0) end,
           'invoices_paid', case when v_abrechnung then coalesce(r.bezahlt, 0) end,
           'outstanding_cents', case when v_abrechnung then coalesce(r.offen_cents, 0) end,
           'invoices_overdue', case when v_abrechnung then coalesce(r.ueberfaellig, 0) end,
           'reminders_due', case when v_abrechnung then coalesce(r.mahnen, 0) end
         ) order by pe.family_name, pe.given_name, pe.id), '[]'::jsonb)
    into v_liste
  from personen pe
  left join termine t on t.patient_id = pe.id
  left join grundlagen g on g.patient_id = pe.id
  left join rechnungen r on r.patient_id = pe.id;

  return v_liste;
end;
$$;

revoke all on function public.list_patient_overview() from public, anon;
grant execute on function public.list_patient_overview() to authenticated;

comment on function public.list_patient_overview() is
  'B1/B10 (BEF-151, BEF-160): die Patientenliste als ein JSON-Wert - Name, Geburtsdatum, Ort und Kontakt wie patient_list_entries, dazu zuletzt behandelt, naechster Termin, Grundlagen je Zustand (offen, Termine fehlen, nachholen, abrechnen, in Abrechnung) und fuer owner/office Rechnungen, Bezahltes, Offenes, Ueberfaelliges und zu Mahnendes (ANN-516). Ein Wert statt Zeilen, damit die Liste nicht bei 200 Personen endet. Nur fuer can_read_patient_directory.';

-- 3. Stand je Grundlage in der Akte ---------------------------------------------
--
-- Rumpf aus 20261002120000_abn_001_slot_counts.sql; dazu der Stand aus
-- app.treatment_basis_billing (ANN-514). Neue Spalten, deshalb neu angelegt.

drop function public.list_patient_treatment_basis_slots(uuid);

create function public.list_patient_treatment_basis_slots(p_patient_id uuid)
returns table (
  treatment_basis_id uuid,
  prescribed         integer,
  used               integer,
  planned            integer,
  upcoming           integer,
  remaining          integer,
  covered            integer,
  uncovered          integer,
  performed          integer,
  documented         integer,
  open_count         integer,
  past_open          integer,
  state              text,
  released_at        timestamptz,
  invoiced           boolean,
  can_release        boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_darf  boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_bases() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'treatment_bases.read', 'not allowed to read treatment_bases');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  v_darf := app.can_release_treatment_basis();

  return query
    select
      p.id,
      zahlen.prescribed,
      zahlen.used,
      zahlen.planned,
      (
        select count(*)::integer
        from public.appointments a
        where a.treatment_basis_id = p.id
          and a.organization_id = v_org
          and a.status not in ('cancelled', 'no_show')
          and a.starts_at > now()
      ),
      zahlen.remaining,
      zahlen.covered,
      zahlen.uncovered,
      stand.performed,
      stand.documented,
      stand.open_count,
      stand.past_open,
      stand.state,
      stand.released_at,
      stand.invoiced,
      (v_darf and stand.ready)
    from public.treatment_bases p
    cross join lateral app.treatment_basis_slot_counts(p.id, v_org) zahlen
    cross join lateral app.treatment_basis_billing(p.id) stand
    where p.organization_id = v_org
      and p.patient_id = p_patient_id
    order by p.issued_on desc, p.id desc;
end;
$$;

revoke all on function public.list_patient_treatment_basis_slots(uuid) from public, anon;
grant execute on function public.list_patient_treatment_basis_slots(uuid) to authenticated;

comment on function public.list_patient_treatment_basis_slots(uuid) is
  'Kontingente aller Grundlagen einer Person, gezaehlt in Terminen (ANN-064), und seit B1/B7 ihr Stand fuer die Abrechnung (ANN-514): erbracht, dokumentiert, offen, nachzuholen, Zustand, freigegeben, abgerechnet und ob die angemeldete Person sie jetzt in die Abrechnung stellen kann.';

-- 4. Rechnungen einer Person ------------------------------------------------------

create function public.list_patient_invoices(p_patient_id uuid)
returns table (
  id                 uuid,
  status             text,
  invoice_number     text,
  period_month       date,
  issued_on          date,
  due_on             date,
  total_cents        integer,
  paid_cents         integer,
  outstanding_cents  integer,
  currency           text,
  payment_state      text,
  overdue            boolean,
  cancelled          boolean,
  reminder_due       boolean,
  last_reminder_on   date,
  treatment_basis_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_heute date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read invoices');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read invoices' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = v_org;

  return query
    with rechnung as (
      select i.*,
             coalesce(z.bezahlt, 0) as bezahlt,
             exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id)
               as storniert
      from public.invoices i
      left join lateral (
        select sum(case when p.direction = 'incoming' then p.amount_cents
                        else -p.amount_cents end)::integer as bezahlt
        from public.payments p
        where p.invoice_id = i.id
          and p.voided_at is null
      ) z on true
      where i.organization_id = v_org
        and i.patient_id = p_patient_id
    )
    select r.id,
           r.status,
           r.invoice_number,
           r.period_month,
           r.issued_on,
           r.due_on,
           -- Der Entwurf rechnet live, die ausgestellte Rechnung zeigt ihren
           -- festgeschriebenen Betrag (ADR-009 Punkt 10).
           coalesce(r.total_cents, summe.brutto)::integer,
           case when r.status = 'issued' then r.bezahlt else 0 end,
           case when r.status = 'issued' and not r.storniert
                then greatest(r.total_cents - r.bezahlt, 0) else 0 end,
           coalesce(r.currency, summe.currency),
           case when r.status = 'issued'
                then app.invoice_payment_state(r.total_cents, r.bezahlt)
                else 'unpaid' end,
           (r.status = 'issued' and not r.storniert and r.due_on < v_heute
            and r.bezahlt < r.total_cents),
           r.storniert,
           (r.status = 'issued' and not r.storniert
            and app.invoice_reminder_due(r.id, r.due_on, r.total_cents - r.bezahlt, v_heute)),
           (select max(m.reminder_on) from public.invoice_payment_reminders m where m.invoice_id = r.id),
           r.treatment_basis_id
    from rechnung r
    left join lateral (
      select sum(app.billable_service_amount(b.id)) as brutto,
             max(c.currency) as currency
      from public.invoice_items it
      join public.billable_services b     on b.id = it.billable_service_id
      join public.service_catalog_items c on c.id = b.catalog_item_id
      where it.invoice_id = r.id
    ) summe on true
    order by r.status, r.issued_on desc nulls first, r.invoice_number desc nulls first, r.id;
end;
$$;

revoke all on function public.list_patient_invoices(uuid) from public, anon;
grant execute on function public.list_patient_invoices(uuid) to authenticated;

comment on function public.list_patient_invoices(uuid) is
  'B1 (BEF-151): die Rechnungen einer Person fuer die Akte - Entwurf oder ausgestellt, Betrag, Bezahltes, Offenes, Zahlungsstand, ueberfaellig, storniert, zu mahnen (ANN-516) und die letzte Zahlungserinnerung, dazu die Grundlage. Nur fuer can_read_invoicing (owner, office).';
