-- =============================================================================
-- Terminzettel: die naechsten Termine einer Patient:in zum Ausdrucken
-- (CAL-011, IDEA-PRX-006)
--
-- Hochbetagte Patient:innen ohne Portal bekommen heute einen von Hand
-- geschriebenen Zettel. Diese Funktion liefert genau das, was darauf steht -
-- und sonst nichts.
--
-- Eigener Lesepfad statt einer Erweiterung von
-- list_patient_upcoming_appointments (UX-006): Der Zettel braucht den
-- Standortnamen, die Akte braucht ihn nicht. Eine gemeinsame Projektion haette
-- also entweder dem Zettel etwas gefehlt oder die Akte mehr ausgeliefert, als
-- sie anzeigt (ADR-004, Datenminimierung). Zwei Zwecke, zwei Projektionen.
--
-- Was NICHT geliefert wird und warum:
--
--   * Keine Adresse des Hausbesuchs. Es ist die eigene Adresse der Patient:in;
--     auf ihrem Zettel waere sie Fuellstoff.
--   * Kein Status. Ausgegeben werden ohnehin nur bestaetigte Termine - ein
--     abgesagter gehoert nicht auf einen Zettel, den jemand mitnimmt.
--   * Keine Verordnung, keine Diagnose, kein Behandlungsinhalt. Der Zettel ist
--     ein organisatorisches Dokument (PROJECT_PRINCIPLES.md 4.6, 5).
--
-- AUDIT: Die Funktion schreibt patient_record.viewed in derselben Transaktion.
-- Sie ist ueber eine eigene Adresse erreichbar; ohne diesen Eintrag liesse sich
-- der Name einer Patient:in samt ihrer Termine offenlegen, ohne dass davon eine
-- Spur bliebe - die Akte selbst protokolliert nur ihren eigenen Aufruf
-- (ADR-010 Punkt 2). Kein neues Ereignis im Katalog: fachlich ist der Zettel
-- ein Blick in dieselbe Akte, und ein Ereignis, das nur an einer Stelle
-- entsteht, machte den Katalog laenger, ohne ihn aussagekraeftiger zu machen.
-- =============================================================================

create function public.list_patient_appointment_slip(
  p_patient_id uuid,
  p_limit      integer default 20
)
returns table (
  id                     uuid,
  starts_at              timestamptz,
  ends_at                timestamptz,
  appointment_type       text,
  location_name          text,
  staff_given_name       text,
  staff_family_name      text,
  organization_time_zone text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_actor uuid;
  v_limit integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Wer den Kalender lesen darf, darf den Zettel drucken.
  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  -- Eine unbekannte und eine fremde ID liefern dieselbe leere Antwort und
  -- erzeugen keinen Auditeintrag (PROJECT_PRINCIPLES.md 13).
  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    return;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, context
  )
  values (
    v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id,
    jsonb_build_object('surface', 'web', 'view', 'appointment_slip')
  );

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      l.name,
      sp.given_name,
      sp.family_name,
      o.time_zone
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    left join public.locations l on l.id  = a.location_id
    where a.organization_id = v_org
      and a.patient_id      = p_patient_id
      and a.starts_at > now()
      -- Nur bestaetigte Termine: ein abgesagter gehoert nicht auf einen Zettel,
      -- den jemand mitnimmt (ADR-018).
      and a.status = 'confirmed'
    order by a.starts_at, a.id
    limit v_limit;
end;
$$;

comment on function public.list_patient_appointment_slip(uuid, integer) is
  'Die naechsten bestaetigten Termine einer Patientin fuer den Terminzettel (CAL-011). Mit Standortnamen, ohne Adresse und ohne klinische Inhalte; protokolliert patient_record.viewed.';

revoke all on function public.list_patient_appointment_slip(uuid, integer) from public, anon;
grant execute on function public.list_patient_appointment_slip(uuid, integer) to authenticated;
