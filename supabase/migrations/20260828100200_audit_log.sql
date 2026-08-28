-- =============================================================================
-- Audit-Log (ADR-010)
--
-- ADR-010 verlangt, dass das Oeffnen einer Patientenakte in der Detailansicht
-- auditierbar ist. Der erste Anwendungsschnitt enthaelt genau diese Ansicht,
-- also entsteht die Pflicht hier und nicht spaeter.
--
-- Bewusst minimal: eine Tabelle, ein Ereignistyp, eine RPC. Der vollstaendige
-- Ereigniskatalog aus ADR-010 wird mit dem jeweiligen Fachfeature ergaenzt.
--
-- Grundsaetze aus ADR-010:
--   * nur Metadaten, keine klinischen Inhalte
--   * ueber den normalen Anwendungspfad weder aenderbar noch loeschbar
--   * Aufbewahrung initial 3 Jahre (ADR-008)
-- =============================================================================

create table public.audit_log (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  actor_user_id   uuid not null,
  action          text not null check (action in ('patient_record.viewed')),
  subject_type    text not null check (subject_type in ('patient')),
  subject_id      uuid not null,
  occurred_at     timestamptz not null default now(),
  context         jsonb not null default '{}'::jsonb
);

comment on table public.audit_log is
  'Auditnachweis sensibler Zugriffe (ADR-010). Enthaelt ausschliesslich Metadaten. Datenklasse: Patientenakten-Auditlog, initial 3 Jahre (ADR-008).';
comment on column public.audit_log.context is
  'Zusaetzliche Metadaten. Es duerfen KEINE klinischen Inhalte und keine Freitexte aus der Akte abgelegt werden.';
comment on column public.audit_log.actor_user_id is
  'auth.users.id des handelnden Accounts. Bewusst ohne FK, damit ein spaeter geloeschter Account den Nachweis nicht entfernt (ADR-008).';

create index audit_log_org_occurred_idx on public.audit_log (organization_id, occurred_at desc);
create index audit_log_subject_idx on public.audit_log (subject_type, subject_id);

-- Deny-by-default. Es gibt bewusst keine Policy: weder Lesen noch Schreiben
-- ist ueber den normalen Anwendungspfad moeglich. Eintraege entstehen
-- ausschliesslich ueber die RPC unten.
alter table public.audit_log enable row level security;

revoke all on public.audit_log from anon, authenticated;

-- -----------------------------------------------------------------------------
-- log_patient_record_view
--
-- SECURITY DEFINER, umgeht also RLS. Deshalb prueft die Funktion die
-- Sichtbarkeit des Patienten selbst noch einmal, statt sich auf den Aufrufer
-- zu verlassen. Ohne diese Pruefung waere sie ein Orakel fuer fremde
-- Patienten-IDs (PROJECT_PRINCIPLES.md 13).
-- -----------------------------------------------------------------------------
create or replace function public.log_patient_record_view(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.organization_id
    into v_org
  from public.patients p
  where p.id = p_patient_id
    and p.organization_id = app.current_organization_id()
    and (
      app.can_read_patient_directory()
      or p.person_id = app.current_person_id()
    );

  if v_org is null then
    raise exception 'patient not accessible' using errcode = '42501';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, context
  )
  values (
    v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id,
    jsonb_build_object('surface', 'web')
  );
end;
$$;

comment on function public.log_patient_record_view(uuid) is
  'Protokolliert das Oeffnen einer Patientenakte in der Detailansicht (ADR-010).';

revoke all on function public.log_patient_record_view(uuid) from public, anon;
grant execute on function public.log_patient_record_view(uuid) to authenticated;
