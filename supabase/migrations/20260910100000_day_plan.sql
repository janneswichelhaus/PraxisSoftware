-- =============================================================================
-- Tagesliste des Hausbesuchstags (UX-001)
--
-- Der Kalenderlesepfad list_appointments liefert bewusst KEINE Besuchsadresse:
-- fuer eine Wochenuebersicht ist sie nicht erforderlich
-- (PROJECT_PRINCIPLES.md 16, ADR-004). Genau das war im Produktreview die
-- Bruchstelle Nr. 1 - wer morgens losfaehrt, hat die Adresse nicht, den
-- Klingelnamen nicht und keine Nummer, unter der sich eine Verspaetung
-- ankuendigen laesst.
--
-- Diese Funktion ist der zweite, engere Lesepfad fuer genau diesen Zweck:
--
--   * GENAU EIN Kalendertag und GENAU EINE behandelnde Person. Kein Zeitraum,
--     kein "alle Personen". Ein Aufruf legt damit hoechstens einen Arbeitstag
--     einer Person offen - deutlich weniger als die Patientenliste, die die
--     Kartei ohnehin vollstaendig ausliefert.
--   * Adresse, Zugangshinweis und Besonderheit NUR beim Hausbesuch. Beim
--     Praxis- und Videotermin sind sie fuer die Anfahrt gegenstandslos und
--     werden gar nicht erst geliefert - Zweckbindung im Lesepfad statt
--     Ausblenden im Browser (ADR-004).
--   * Rufnummern: Festnetz und Mobil der Person selbst. Sie stehen fuer den
--     einen Zweck da, den die Tagesliste hat - anrufen, wenn niemand oeffnet
--     oder es spaeter wird (PAT-005).
--   * Dokumentationsstand ohne Inhalt, damit die Liste "offen heute" von
--     "erledigt" unterscheiden kann. Derselbe Zuschnitt wie der
--     Behandlungsnachweis (ANN-006) und nur fuer die Rollen, die ihn lesen
--     duerfen; sonst bleibt das Feld leer statt falsch.
--
-- ANN-010 (docs/decisions/ASSUMPTIONS.md): Sichtbarkeit der internen
-- Versorgungsangaben. Diese Funktion liefert sie an dieselben Rollen wie
-- patient_directory, nur enger zugeschnitten. Kein neuer Rollenschnitt.
--
-- Kein eigener Auditeintrag: geliefert werden ausschliesslich organisatorische
-- Angaben, die dieselbe Rolle ueber patient_directory ohnehin fuer den
-- gesamten Bestand lesen darf. Ein Ereignis hier wuerde protokollieren, dass
-- jemand seinen eigenen Arbeitstag ansieht (ADR-010, ADR-011).
-- =============================================================================

create or replace function public.list_day_plan(
  p_date            date,
  p_staff_member_id uuid
)
returns table (
  id                     uuid,
  patient_id             uuid,
  staff_member_id        uuid,
  appointment_type       text,
  status                 text,
  starts_at              timestamptz,
  ends_at                timestamptz,
  patient_given_name     text,
  patient_family_name    text,
  location_name          text,
  visit_street           text,
  visit_house_number     text,
  visit_postal_code      text,
  visit_city             text,
  patient_phone          text,
  patient_phone_mobile   text,
  home_visit_access_note text,
  special_note           text,
  documentation_status   text,
  organization_time_zone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org           uuid;
  v_tz            text;
  v_start         timestamptz;
  v_end           timestamptz;
  v_darf_nachweis boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Derselbe Schnitt wie beim Kalender: die Tagesliste ist eine
  -- andere Darstellung derselben Termine, kein zweites Recht.
  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_date is null or p_staff_member_id is null then
    raise exception 'date and staff member are required' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_appointments und create_appointment.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  v_darf_nachweis := app.can_read_treatment_evidence();

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.appointment_type,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      l.name,
      a.visit_street,
      a.visit_house_number,
      a.visit_postal_code,
      a.visit_city,
      pc.phone,
      pc.phone_mobile,
      -- Zweckbindung: der Zugangshinweis beschreibt die Wohnungstuer. Zu
      -- einem Praxis- oder Videotermin hat er keinen Zweck.
      case when a.appointment_type = 'home_visit' then care.home_visit_access_note end,
      case when a.appointment_type = 'home_visit' then care.special_note end,
      -- ANN-006: Dokumentationsstand ohne Inhalt. Leer, wenn die Rolle den
      -- Behandlungsnachweis nicht lesen darf - eine falsche Angabe waere
      -- schlimmer als keine.
      case when v_darf_nachweis then coalesce(t.status, 'none') end,
      v_tz
    from public.appointments a
    join public.patients p        on p.id  = a.patient_id
    join public.persons pp        on pp.id = p.person_id
    left join public.locations l  on l.id  = a.location_id
    left join public.patient_contact_details pc on pc.patient_id = a.patient_id
    left join public.patient_care_details care  on care.patient_id = a.patient_id
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    where a.organization_id  = v_org
      and a.staff_member_id  = p_staff_member_id
      and a.starts_at       >= v_start
      and a.starts_at        < v_end
    order by a.starts_at, a.id;
end;
$$;

comment on function public.list_day_plan(date, uuid) is
  'Tagesliste einer behandelnden Person fuer genau einen Kalendertag (UX-001): Termine mit Besuchsadresse, Rufnummern, Zugangshinweis und Dokumentationsstand. Adresse und Zugangshinweis nur beim Hausbesuch (ANN-010, ADR-004).';

revoke all on function public.list_day_plan(date, uuid) from public, anon;
grant execute on function public.list_day_plan(date, uuid) to authenticated;
