-- =============================================================================
-- PRX-016: Erinnerungen am Rezeptende und an den vergessenen Abschluss
-- (PRX-EPIC-003, IDEA-LZK-007, IDEA-LZK-009)
--
-- Zwei Listen unter "Offene Punkte". Beide FRAGEN nur - keine setzt einen
-- Zustand, keine startet eine Frist (IDEA-LZK-009: "Ein Vorschlag darf keine
-- Frist starten, sondern nur fragen"). Keine Aussage ueber einen Verlauf,
-- keine Empfehlung der Software (§17, ADR-006): gezaehlt werden Termine.
--
--   * VERORDNUNG ENDET (ANN-146): eine Verordnung (nicht Selbstzahler) ohne
--     juengere Grundlage derselben Person, deren Kontingent genutzt ist oder
--     deren Termine alle verplant sind und deren letzter Termin in den
--     naechsten vierzehn Tagen liegt (oder schon war). Dazu, ob eine
--     Empfehlung zum Verordnungsende vorliegt (DOK-005, ANN-014) - ja oder
--     nein, nie ihr Inhalt. Wer: die vier Praxisrollen, wie die Grundlage.
--   * OHNE ABSCHLUSS (ANN-146): Personen ohne Abschluss der Versorgung, die seit
--     sechs Monaten keinen Behandlungstermin hatten und keinen kommenden haben.
--     Wer: die Rollen, die abschliessen duerfen (app.can_conclude_patient_care)
--     - der Abschluss ist eine fachliche Aussage (LOE-001b).
-- =============================================================================

-- Die beiden Schwellen an einer Stelle (ANN-146).
create function app.reminder_prescription_horizon()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '14 days' $$;

create function app.reminder_care_idle()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '6 months' $$;

comment on function app.reminder_prescription_horizon() is
  'ANN-146: Eine Verordnung, deren letzter verplanter Termin innerhalb dieses Zeitraums liegt, gilt als endend.';
comment on function app.reminder_care_idle() is
  'ANN-146: So lange ohne Behandlungstermin (und ohne kommenden), bis die Frage nach dem Abschluss der Versorgung erscheint.';

revoke all on function app.reminder_prescription_horizon() from public, anon;
revoke all on function app.reminder_care_idle() from public, anon;

-- -----------------------------------------------------------------------------
-- 1. Verordnungen, die enden
-- -----------------------------------------------------------------------------
create function public.list_ending_prescriptions()
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
  with kandidaten as (
    select tb.id, tb.patient_id, tb.treatment_basis_kind, tb.issued_on, tb.prescriber_id,
           tb.follow_up_recommendation,
           z.prescribed, z.used, z.planned,
           (select max(a.starts_at)
              from public.appointments a
             where a.treatment_basis_id = tb.id
               and a.organization_id = v_org
               and a.status <> 'cancelled') as letzter
    from public.treatment_bases tb
    join public.patients pa on pa.id = tb.patient_id
    cross join lateral app.treatment_basis_slot_counts(tb.id, v_org) z
    where tb.organization_id = v_org
      and tb.treatment_basis_kind <> 'self_pay'
      and pa.status = 'active'
      and pa.care_concluded_on is null
      -- Ohne Anschluss: keine juengere Grundlage derselben Person.
      and not exists (
        select 1 from public.treatment_bases neu
        where neu.patient_id = tb.patient_id
          and neu.organization_id = v_org
          and (neu.issued_on, neu.created_at) > (tb.issued_on, tb.created_at)
      )
  )
  select k.id,
         k.patient_id,
         pe.given_name,
         pe.family_name,
         k.treatment_basis_kind,
         k.issued_on,
         k.prescribed,
         k.used,
         k.planned,
         k.letzter,
         (k.follow_up_recommendation is not null or exists (
           select 1 from public.therapy_reports r
           where r.treatment_basis_id = k.id
             and r.organization_id = v_org
             and r.recommendation is not null
         )),
         nullif(btrim(concat_ws(' ', pr.title, pr.given_name, pr.family_name)), ''),
         pr.phone
  from kandidaten k
  join public.patients pa on pa.id = k.patient_id
  join public.persons pe on pe.id = pa.person_id
  left join public.prescribers pr on pr.id = k.prescriber_id
  where k.prescribed is not null
    and (
      k.used >= k.prescribed
      or (
        greatest(k.used, k.planned) >= k.prescribed
        and k.letzter is not null
        and k.letzter <= now() + app.reminder_prescription_horizon()
      )
    )
  order by k.letzter asc nulls first, pe.family_name, k.id;
end;
$$;

comment on function public.list_ending_prescriptions() is
  'Verordnungen ohne Anschluss, deren Kontingent genutzt oder ganz verplant ist und deren letzter Termin in den naechsten vierzehn Tagen liegt (PRX-016, ANN-146), mit Empfehlung ja/nein und Kontakt der Verordner:in. Fragt nur, setzt nichts. Die vier Praxisrollen; ein abgewiesener Versuch wird als treatment_bases.read protokolliert.';

revoke all on function public.list_ending_prescriptions() from public, anon;
grant execute on function public.list_ending_prescriptions() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Versorgung ohne Abschluss
-- -----------------------------------------------------------------------------
create function public.list_care_without_conclusion()
returns table (
  patient_id           uuid,
  patient_given_name   text,
  patient_family_name  text,
  last_appointment_at  timestamptz,
  patient_created_at   timestamptz
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
  if not app.can_conclude_patient_care() then
    perform app.record_denied_read(auth.uid(), 'patient_directory.read', 'not allowed to read care without conclusion');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read care without conclusion' using errcode = '42501';
  end if;

  return query
  select pa.id,
         pe.given_name,
         pe.family_name,
         letzter.zeit,
         pa.created_at
  from public.patients pa
  join public.persons pe on pe.id = pa.person_id
  cross join lateral (
    select max(a.starts_at) as zeit
    from public.appointments a
    where a.patient_id = pa.id
      and a.organization_id = v_org
      and a.kind = 'therapy'
      and a.status <> 'cancelled'
  ) letzter
  where pa.organization_id = v_org
    and pa.care_concluded_on is null
    -- Kein kommender Termin ...
    and not exists (
      select 1 from public.appointments a
      where a.patient_id = pa.id
        and a.organization_id = v_org
        and a.status <> 'cancelled'
        and a.starts_at > now()
    )
    -- ... und der letzte liegt lange zurueck; ohne Termin zaehlt die Anlage.
    and coalesce(letzter.zeit, pa.created_at) < now() - app.reminder_care_idle()
  order by coalesce(letzter.zeit, pa.created_at) asc, pe.family_name, pa.id;
end;
$$;

comment on function public.list_care_without_conclusion() is
  'Personen ohne Abschluss der Versorgung, seit sechs Monaten ohne Behandlungstermin und ohne kommenden (PRX-016, ANN-146, IDEA-LZK-009). Fragt nur - der Abschluss bleibt ein ausdruecklicher Vorgang (LOE-001b). Rollen, die abschliessen duerfen; ein abgewiesener Versuch wird als patient_directory.read protokolliert.';

revoke all on function public.list_care_without_conclusion() from public, anon;
grant execute on function public.list_care_without_conclusion() to authenticated;
