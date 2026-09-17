-- =============================================================================
-- Der Pflichtvermerk fehlt in der klinischen Sicht der Akte (CAL-018, Nachtrag)
--
-- Befund aus dem angemeldeten E2E-Lauf vom 2026-09-17
-- (`patient-record-documentation.spec.ts`, DOK-003/ROL-001): Der
-- Behandlungsverlauf der Akte blieb leer, sobald eine Dokumentation existierte.
--
-- Ursache: CAL-018 hat `visit_without_treatment` zum Pflichtfeld des
-- Eintragsschemas in `src/features/documentation/api.ts` gemacht. Dieses
-- Schema liegt UNTER ZWEI Lesepfaden - `get_treatment_note` am Termin und
-- `list_patient_treatment_notes` in der Akte -, nachgezogen wurde aber nur der
-- erste. Die Akte bekam Eintraege ohne das Feld, die Pruefung im Browser wies
-- die ganze Seite ab, und der Verlauf zeigte nichts mehr.
--
-- Der Befund war nur hinter der Anmeldung sichtbar: Die Komponententests
-- reichen ihre Eintraege als getippte Vorgabe herein und haben das Feld
-- deshalb mitbekommen, ohne dass es je aus der Datenbank kam.
--
-- Die Korrektur ist der zweite Lesepfad, nicht ein weicheres Schema: Ob eine
-- Behandlung stattgefunden hat, entscheidet spaeter ueber eine Rechnung ohne
-- erbrachte Leistung (ADR-018 Fassung 3 Punkt 9). In der Akte ist das genauso
-- wenig wegzulassen wie am Termin.
--
-- Unveraendert aus 20260904120000_treatment_note_auto_finalisation.sql bis auf
-- den einen Schluessel im JSON; der Kommentar bleibt der aus
-- 20260915100000_office_reads_treatment_documentation.sql (ROL-001).
-- =============================================================================

create or replace function public.list_patient_treatment_notes(
  p_patient_id       uuid,
  p_limit            integer     default 20,
  p_before_starts_at timestamptz default null,
  p_before_id        uuid        default null
)
returns table (
  appointment_id         uuid,
  starts_at              timestamptz,
  ends_at                timestamptz,
  appointment_type       text,
  appointment_status     text,
  staff_given_name       text,
  staff_family_name      text,
  organization_time_zone text,
  notes                  jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_seite uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment documentation' using errcode = '42501';
  end if;

  select array_agg(s.appointment_id order by s.starts_at desc, s.appointment_id desc)
    into v_seite
  from app.patient_record_page(
         v_org, p_patient_id, p_limit, p_before_starts_at, p_before_id
       ) s;

  if v_seite is null then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'treatment_note.viewed', 'treatment_note', t.id, 'success',
         jsonb_build_object(
           'surface', 'web',
           'appointment_id', t.appointment_id,
           'patient_id', p_patient_id
         )
  from public.treatment_notes t
  where t.appointment_id = any (v_seite);

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.status,
      sp.given_name,
      sp.family_name,
      o.time_zone,
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id',                  t.id,
                   'appointment_id',      t.appointment_id,
                   'addendum_to_note_id', t.addendum_to_note_id,
                   'status',              t.status,
                   'content',             t.content,
                   -- Der Pflichtvermerk aus Hausbesuch-Szenario 1 (CAL-018).
                   'visit_without_treatment', t.visit_without_treatment,
                   'created_at',          t.created_at,
                   'updated_at',          t.updated_at,
                   'finalized_at',        t.finalized_at,
                   'finalisation_kind',   t.finalisation_kind,
                   'version_count',       (select count(*)
                                             from public.treatment_note_versions v
                                            where v.note_id = t.id),
                   'author_name',         verfasser.display_name,
                   'last_editor_name',    bearbeiter.display_name,
                   'finalized_by_name',   finalisierer.display_name
                 )
                 order by (t.addendum_to_note_id is not null), t.created_at
               )
        from public.treatment_notes t
        left join public.user_profiles verfasser    on verfasser.id    = t.created_by
        left join public.user_profiles bearbeiter   on bearbeiter.id   = t.updated_by
        left join public.user_profiles finalisierer on finalisierer.id = t.finalized_by
        where t.appointment_id = a.id
      ), '[]'::jsonb)
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    where a.id = any (v_seite)
    order by a.starts_at desc, a.id desc;
end;
$$;

comment on function public.list_patient_treatment_notes(uuid, integer, timestamptz, uuid) is
  'Klinische Sicht der Akte (DOK-003, DOK-004, ROL-001, CAL-018): Termine eines Patienten mit ihren Eintraegen samt Inhalt, Art der Finalisierung und Pflichtvermerk aus Hausbesuch-Szenario 1, protokolliert je Eintrag treatment_note.viewed (ADR-010, ADR-016 Punkt 8 und 9). owner, therapist, team_lead und office.';
