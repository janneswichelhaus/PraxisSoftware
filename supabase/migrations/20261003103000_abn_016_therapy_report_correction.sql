-- =============================================================================
-- ABN-016 (BEF-104): Berichtskorrektur mit Kette
--
-- Bis hierher sagte die Oberflaeche nur "Eine Korrektur ist ein neuer
-- Bericht" (ANN-121); ein Verweis auf den ersetzten Bericht und ein Grund
-- fehlten. Abnahme Jannes, 2026-10-02: Eine Berichtskorrektur verweist auf den
-- ersetzten Bericht und traegt Korrekturgrund, Zeitpunkt und Verfasser:in.
--
--   * `supersedes_report_id` und `change_reason`, beide oder keins; ein
--     Bericht wird hoechstens einmal ersetzt (die Kette verzweigt nicht), nur
--     ein abgeschlossener, nur innerhalb derselben Verordnung - nach dem
--     Muster der Fragebogenkorrektur (ANN-103).
--   * Das Dokument des Berichts nennt die Korrektur (`korrektur`), das Blatt
--     sagt "Korrigierte Fassung"; die Liste nennt die Kette.
-- =============================================================================

alter table public.therapy_reports
  add column supersedes_report_id uuid references public.therapy_reports (id) on delete cascade,
  add column change_reason text
    check (change_reason is null or length(btrim(change_reason)) between 3 and 500),
  add constraint therapy_reports_correction_shape
    check ((supersedes_report_id is null) = (change_reason is null));

comment on column public.therapy_reports.supersedes_report_id is
  'Der abgeschlossene Bericht, den dieser korrigiert (ABN-016, BEF-104). Faellt mit ihm und der Akte.';
comment on column public.therapy_reports.change_reason is
  'Grund der Korrektur, 3 bis 500 Zeichen (ABN-016). Zeitpunkt und Verfasser:in sind created_at/created_by.';

create unique index therapy_reports_supersedes_key
  on public.therapy_reports (supersedes_report_id)
  where supersedes_report_id is not null;

-- Die Kette bleibt: weder Verweis noch Grund aendern sich nach dem Anlegen.
create function app.guard_therapy_report_correction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.supersedes_report_id is distinct from old.supersedes_report_id
     or new.change_reason is distinct from old.change_reason then
    raise exception 'therapy report correction is fixed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger therapy_reports_correction_fixed
  before update on public.therapy_reports
  for each row execute function app.guard_therapy_report_correction();

-- -----------------------------------------------------------------------------
-- create_therapy_report: mit optionaler Korrektur (alte Signatur entfaellt;
-- der Aufruf nur mit der Grundlage bleibt gueltig)
-- -----------------------------------------------------------------------------
drop function public.create_therapy_report(uuid);

CREATE OR REPLACE FUNCTION public.create_therapy_report(
  p_treatment_basis_id    uuid,
  p_supersedes_report_id  uuid default null,
  p_change_reason         text default null
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_kind    text;
  v_id      uuid;
  v_alt     record;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;

  select g.patient_id, g.treatment_basis_kind into v_patient, v_kind
  from public.treatment_bases g
  where g.id = p_treatment_basis_id and g.organization_id = v_org;
  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;
  if v_kind = 'self_pay' then
    raise exception 'a therapy report needs a prescription' using errcode = '22023';
  end if;

  -- ABN-016 (BEF-104): Eine Korrektur verweist auf den ersetzten,
  -- abgeschlossenen Bericht derselben Verordnung und traegt ihren Grund.
  if p_supersedes_report_id is not null then
    select r.status, r.treatment_basis_id into v_alt
    from public.therapy_reports r
    where r.id = p_supersedes_report_id and r.organization_id = v_org
    for update;
    if not found then
      raise exception 'therapy report not found' using errcode = 'P0002';
    end if;
    if v_alt.status <> 'abgeschlossen' then
      raise exception 'only a completed therapy report can be corrected' using errcode = '23514';
    end if;
    if v_alt.treatment_basis_id <> p_treatment_basis_id then
      raise exception 'correction must use the same treatment basis' using errcode = '23514';
    end if;
    if p_change_reason is null or length(btrim(p_change_reason)) not between 3 and 500 then
      raise exception 'a correction needs a reason' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.therapy_reports r where r.supersedes_report_id = p_supersedes_report_id
    ) then
      raise exception 'therapy report already corrected' using errcode = '23505';
    end if;
  elsif p_change_reason is not null then
    raise exception 'a reason belongs to a correction' using errcode = '22023';
  end if;

  insert into public.therapy_reports (
    organization_id, patient_id, treatment_basis_id, created_by, updated_by,
    supersedes_report_id, change_reason
  )
  values (v_org, v_patient, p_treatment_basis_id, v_actor, v_actor,
          p_supersedes_report_id, nullif(btrim(p_change_reason), ''))
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'therapy_report.created', 'therapy_report', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient,
                       'supersedes_report_id', p_supersedes_report_id)
  );

  return v_id;
end;
$function$
;

revoke all on function public.create_therapy_report(uuid, uuid, text) from public, anon;
grant execute on function public.create_therapy_report(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Das Dokument nennt die Korrektur (Rumpf aus dem heutigen Stand)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.therapy_report_dokument(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  b     public.therapy_reports%rowtype;
  v_tz  text;
begin
  select * into b from public.therapy_reports where id = p_report_id;
  if not found then
    return null;
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = b.organization_id;

  return jsonb_build_object(
    'schema_version', 1,

    -- ANN-123: Anschrift ohne Steuer- und Bankangaben.
    'praxis', coalesce(
      (select jsonb_build_object(
         'name', pb.legal_name,
         'street', pb.street,
         'house_number', pb.house_number,
         'postal_code', pb.postal_code,
         'city', pb.city,
         'phone', pb.phone,
         'email', pb.email)
       from public.practice_billing_profiles pb
       where pb.organization_id = b.organization_id),
      (select jsonb_build_object('name', o.name)
       from public.organizations o where o.id = b.organization_id)
    ),

    'empfaenger', (
      select jsonb_build_object(
        'title', vo.title,
        'given_name', vo.given_name,
        'family_name', vo.family_name,
        'practice_name', vo.practice_name,
        'street', vo.street,
        'house_number', vo.house_number,
        'postal_code', vo.postal_code,
        'city', vo.city,
        'fax', vo.fax)
      from public.treatment_bases g
      join public.prescribers vo on vo.id = g.prescriber_id
      where g.id = b.treatment_basis_id
    ),

    'patient', (
      select jsonb_build_object(
        'given_name', pe.given_name,
        'family_name', pe.family_name,
        'date_of_birth', (
          select k.date_of_birth from public.patient_contact_details k
          where k.patient_id = pa.id
        ))
      from public.patients pa
      join public.persons pe on pe.id = pa.person_id
      where pa.id = b.patient_id
    ),

    'verordnung', (
      select jsonb_build_object(
        'treatment_basis_kind', g.treatment_basis_kind,
        'issued_on', g.issued_on,
        'diagnosis', g.diagnosis,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'remedy', i.remedy,
            'prescribed_quantity', i.prescribed_quantity
          ) order by i.sort_order)
          from public.treatment_base_items i
          where i.treatment_basis_id = g.id
        ), '[]'::jsonb),
        -- Gezaehlt, nicht bewertet: stattgefundene Termine dieser Verordnung.
        'termine_durchgefuehrt', (
          select count(*) from public.appointments t
          where t.treatment_basis_id = g.id
            and t.status in ('completed', 'documented', 'invoiced')
        ),
        'erster_termin', (
          select min((t.starts_at at time zone v_tz)::date) from public.appointments t
          where t.treatment_basis_id = g.id
            and t.status in ('completed', 'documented', 'invoiced')
        ),
        'letzter_termin', (
          select max((t.starts_at at time zone v_tz)::date) from public.appointments t
          where t.treatment_basis_id = g.id
            and t.status in ('completed', 'documented', 'invoiced')
        ))
      from public.treatment_bases g
      where g.id = b.treatment_basis_id
    ),

    -- Woertlich, in der Reihenfolge der Termine.
    'eintraege', coalesce((
      select jsonb_agg(jsonb_build_object(
        'note_id', d.id,
        'datum', (t.starts_at at time zone v_tz)::date,
        'verfasser', (select up.display_name from public.user_profiles up where up.id = d.created_by),
        'inhalt', d.content,
        'ergaenzung', d.addendum_to_note_id is not null
      ) order by t.starts_at, d.created_at)
      from public.treatment_notes d
      join public.appointments t on t.id = d.appointment_id
      where d.id = any (b.note_ids)
        and t.patient_id = b.patient_id
    ), '[]'::jsonb),

    'koerperschema', (
      select jsonb_build_object(
        'erhoben_am', qr.recorded_on,
        'markierungen', (
          select coalesce(jsonb_agg(m.markierung), '[]'::jsonb)
          from jsonb_each(qr.answers) as a(kennung, antwort),
               jsonb_array_elements(
                 case when jsonb_typeof(a.antwort -> 'markierungen') = 'array'
                      then a.antwort -> 'markierungen' else '[]'::jsonb end
               ) as m(markierung)
        ))
      from public.patient_questionnaire_responses qr
      where qr.id = b.body_chart_response_id
    ),

    'text', case when b.report_text is null then null else jsonb_build_object(
      'inhalt', b.report_text,
      'verfasser', (select up.display_name from public.user_profiles up where up.id = b.report_text_updated_by),
      'datum', (b.report_text_updated_at at time zone v_tz)::date
    ) end,

    'empfehlung', case when b.recommendation is null then null else jsonb_build_object(
      'inhalt', b.recommendation,
      'verfasser', (select up.display_name from public.user_profiles up where up.id = b.recommendation_updated_by),
      'datum', (b.recommendation_updated_at at time zone v_tz)::date
    ) end,

    -- ABN-016 (BEF-104): Eine Korrektur nennt den ersetzten Bericht, ihren
    -- Grund, wann und von wem.
    'korrektur', case when b.supersedes_report_id is null then null else jsonb_build_object(
      'ersetzt_bericht', b.supersedes_report_id,
      'ersetzt_abgeschlossen_am', (
        select (alt.completed_at at time zone v_tz)::date
        from public.therapy_reports alt where alt.id = b.supersedes_report_id),
      'grund', b.change_reason,
      'verfasser', (select up.display_name from public.user_profiles up where up.id = b.created_by),
      'datum', (b.created_at at time zone v_tz)::date
    ) end
  );
end;
$function$
;

-- -----------------------------------------------------------------------------
-- Die Liste nennt die Kette (neue Rueckgabe, deshalb neu angelegt)
-- -----------------------------------------------------------------------------
drop function public.list_patient_therapy_reports(uuid);

CREATE OR REPLACE FUNCTION public.list_patient_therapy_reports(p_patient_id uuid)
 RETURNS TABLE(id uuid, treatment_basis_id uuid, status text, created_at timestamp with time zone, author_name text, completed_at timestamp with time zone, completed_on date, completed_by_name text, recommendation text, recommendation_by_name text, recommendation_on date, supersedes_report_id uuid, superseded_by_report_id uuid, change_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_tz    text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    perform app.record_denied_read(v_actor, 'therapy_report.viewed', 'not allowed to read therapy reports');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read therapy reports' using errcode = '42501';
  end if;
  select o.time_zone into v_tz from public.organizations o where o.id = v_org;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'therapy_report.viewed', 'therapy_report', r.id, 'success',
         jsonb_build_object('surface', 'web', 'patient_id', p_patient_id)
  from public.therapy_reports r
  where r.patient_id = p_patient_id and r.organization_id = v_org;

  return query
    select r.id, r.treatment_basis_id, r.status, r.created_at,
           (select up.display_name from public.user_profiles up where up.id = r.created_by),
           r.completed_at,
           (r.completed_at at time zone v_tz)::date,
           (select up.display_name from public.user_profiles up where up.id = r.completed_by),
           -- Nur beim abgeschlossenen Bericht: Ein Entwurf ist noch keine
           -- Empfehlung an irgendwen, und die Liste braucht ihn nicht.
           r.snapshot -> 'empfehlung' ->> 'inhalt',
           r.snapshot -> 'empfehlung' ->> 'verfasser',
           (r.snapshot -> 'empfehlung' ->> 'datum')::date,
           -- ABN-016 (BEF-104): die Kette der Korrekturen.
           r.supersedes_report_id,
           (select n.id from public.therapy_reports n where n.supersedes_report_id = r.id),
           r.change_reason
    from public.therapy_reports r
    where r.patient_id = p_patient_id and r.organization_id = v_org
    order by r.created_at;
end;
$function$
;

revoke all on function public.list_patient_therapy_reports(uuid) from public, anon;
grant execute on function public.list_patient_therapy_reports(uuid) to authenticated;
