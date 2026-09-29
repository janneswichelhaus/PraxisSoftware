-- =============================================================================
-- STA-006: Umsatz je behandelnder Person (STA-EPIC-001; B6 aufgeloest,
-- Jannes 2026-09-29)
--
-- Je Monat der Umsatz nach Rechnungsstellung, zugeordnet der Person, die den
-- Termin der abgerechneten Leistung behandelt hat - nicht der Person, die die
-- Rechnung geschrieben hat (ANN-156). Gelesen aus app.revenue_staff_lines
-- (STA-004). Was dort fehlt, weil ein Posten nach einem Storno geloescht
-- wurde, steht fuer owner als "ohne Zuordnung": die Differenz zur
-- Praxissumme aus dem Snapshot (app.revenue_documents). Die Summe aller Zeilen
-- eines Monats ist damit immer der Umsatz des Monats.
--
-- WER SIEHT WAS (ANN-156):
--   * owner: alle Personen der Praxis mit Namen, dazu eine Zeile ohne
--     Zuordnung (Leistung ohne Termin oder Termin ohne Person).
--   * eine Person mit Umsatzbeteiligung (app.has_revenue_share, STA-005):
--     ausschliesslich die eigenen Zeilen - sie braucht sie fuer ihre Verguetung.
--     Massgeblich ist der eigene Mitarbeiterdatensatz, nicht die Rolle: auch
--     eine Trainerin kann beteiligt sein. Ein inaktiver Beschaeftigungsstatus
--     sperrt nicht - gesperrt wird ueber das Konto (STAFF-003).
--   * alle anderen: keine Zeile, abgewiesen als statistics.read (G6b).
--   Kein Ranking, keine Werte zu Zeiten, Wegen oder Ausfaellen je Person - die
--   Funktion liefert Umsatzsummen und nichts sonst (Par. 20 bleibt: keine
--   Verhaltens- oder Leistungskontrolle ueber Touren- und Ortsdaten).
--
-- PROTOKOLL: Anders als die Praxissummen (ANN-154) sind das Beschaeftigtendaten.
-- Jeder erfolgreiche Aufruf schreibt statistics.staff_revenue_viewed - ohne
-- Betraege, mit dem Umfang (alle oder die eigene Person). Die Funktion ist
-- deshalb VOLATILE.
-- =============================================================================

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text, 'patient_file.handed_out'::text, 'waitlist_entry.created'::text, 'waitlist_entry.updated'::text, 'waitlist_entry.closed'::text, 'waitlist.read'::text, 'territory.saved'::text, 'territory.removed'::text, 'appointment_brief.viewed'::text, 'patient_file.assigned'::text, 'task.created'::text, 'task.updated'::text, 'task.completed'::text, 'task.reopened'::text, 'task.deleted'::text, 'tasks.read'::text, 'appointment.call_recorded'::text, 'patient.merged'::text, 'statistics.read'::text, 'organization.practice_target_changed'::text, 'staff_member.compensation_model_changed'::text, 'statistics.staff_revenue_viewed'::text])));

create function public.list_revenue_by_staff(p_months integer default 6)
returns table (
  month           date,
  staff_member_id uuid,
  staff_name      text,
  revenue_cents   bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_tz     text;
  v_bis    date;
  v_von    date;
  v_eigene uuid;
  v_alle   boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();

  v_alle := app.has_any_role('owner');
  if not v_alle and v_org is not null then
    select sm.id into v_eigene
    from public.staff_members sm
    where sm.organization_id = v_org
      and sm.person_id = app.current_person_id();
  end if;

  if not v_alle and (v_eigene is null or not app.has_revenue_share(v_eigene, v_org)) then
    perform app.record_denied_read(v_actor, 'statistics.read', 'not allowed to read revenue by staff');
    return;
  end if;
  if v_org is null then
    raise exception 'not allowed to read revenue by staff' using errcode = '42501';
  end if;
  if p_months is null or p_months < 1 or p_months > 36 then
    raise exception 'months out of range' using errcode = '22023';
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  v_bis := (date_trunc('month', (now() at time zone v_tz)::date) + interval '1 month')::date;
  v_von := (v_bis - make_interval(months => p_months))::date;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'statistics.staff_revenue_viewed',
    case when v_alle then 'organization' else 'staff_member' end,
    case when v_alle then v_org else v_eigene end,
    'success',
    jsonb_build_object('surface', 'web', 'scope', case when v_alle then 'all' else 'self' end,
                       'months', p_months)
  );

  return query
  with zugeordnet as (
    select date_trunc('month', l.tag)::date as monat, l.staff_member_id as person, sum(l.betrag)::bigint as summe
    from app.revenue_staff_lines(v_org, v_von, v_bis) l
    where v_alle or l.staff_member_id = v_eigene
    group by 1, 2
  ),
  praxis as (
    select date_trunc('month', r.tag)::date as monat, sum(r.betrag)::bigint as summe
    from app.revenue_documents(v_org, v_von, v_bis) r
    group by 1
  ),
  rest as (
    -- Nur fuer owner: was keiner Person zugeordnet werden kann.
    select coalesce(p.monat, z.monat) as monat,
           coalesce(p.summe, 0) - coalesce(z.summe, 0) as summe
    from praxis p
    full join (
      select monat, sum(summe)::bigint as summe
      from zugeordnet
      where person is not null
      group by monat
    ) z on z.monat = p.monat
    where v_alle
  ),
  alles as (
    select z.monat, z.person, z.summe from zugeordnet z where z.person is not null
    union all
    select r.monat, null::uuid, r.summe from rest r
  )
  select a.monat,
         a.person,
         case when a.person is null then null
              else nullif(btrim(concat_ws(' ', pe.given_name, pe.family_name)), '') end,
         sum(a.summe)::bigint
  from alles a
  left join public.staff_members sm on sm.id = a.person
  left join public.persons pe       on pe.id = sm.person_id
  group by 1, 2, 3
  having sum(a.summe) <> 0
  order by 1, 3 nulls last, 2;
end;
$$;

comment on function public.list_revenue_by_staff(integer) is
  'STA-006: Umsatz nach Rechnungsstellung je Monat und behandelnder Person (ANN-156). owner alle, eine Person mit Umsatzbeteiligung nur sich selbst, sonst abgewiesen als statistics.read. Jeder Aufruf protokolliert statistics.staff_revenue_viewed ohne Betraege.';
revoke all on function public.list_revenue_by_staff(integer) from public, anon;
grant execute on function public.list_revenue_by_staff(integer) to authenticated;
