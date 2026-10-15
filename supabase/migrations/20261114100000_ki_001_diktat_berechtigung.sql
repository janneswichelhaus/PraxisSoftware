-- =============================================================================
-- KI-001: Darf diese Person zu diesem Termin diktieren? (BEF-153, KI-EPIC-001)
--
-- Das AI Gateway (supabase/functions/ai-gateway, ADR-005) fragt vor jedem
-- Diktat diese Funktion - mit dem Zugangstoken der Person, ueber PostgREST.
-- Die Antwort ist ein Ja oder Nein, nie ein Inhalt: kein Name, keine
-- Patientenkennung, kein Text. Die Aufnahme gehoert damit eindeutig zu dem
-- Termin der Schreibseite und ueber ihn zu genau einer Patient:in
-- (PROJECT_PRINCIPLES.md 6.3, "Start und Zuordnung").
--
-- Ja nur, wenn alles zusammen gilt:
--   * angemeldet, mit offener Sitzung - app.session_open() steckt in der
--     Rollen- und der Organisationspruefung (ADR-025);
--   * Schreibrecht an der Behandlungsdokumentation
--     (app.can_write_treatment_note(): therapist, team_lead);
--   * der Termin liegt in der eigenen Organisation, ist ein Behandlungstermin
--     (kind = 'therapy', ADR-021, ADR-022) und weder abgesagt noch nicht
--     angetroffen - dieselben Zustaende, zu denen create_treatment_note einen
--     Eintrag zulaesst.
--
-- Abgewiesen wird
--   * ohne Sitzung mit der Ausnahme 42501, wie jeder Pfad;
--   * ohne Schreibrecht mit `false` und dem vorhandenen Abweisungseintrag
--     ueber app.record_denied_read (Operation treatment_note.dictated) -
--     derselbe Ausgang wie die Pruefpfade seit G6b (check_appointment_slots).
--     Ohne Organisation (Plattformkonto, gesperrte Sitzung) wirft der Helfer
--     selbst 42501. Kein neues Auditereignis (ADR-010 Punkt 17): Die Aktion
--     bleibt access.denied;
--   * bei einem fremden, unbekannten, abgesagten oder nicht angetroffenen
--     Termin, einem Trainingstermin oder einem Ereignis mit `false` ohne
--     Eintrag. Das ist keine Frage der Rolle, und der Abweisungseintrag nennt
--     als Grund `role`. Ob es einen Termin einer anderen Praxis gibt, verraet
--     die Antwort nicht.
--
-- Die Funktion schreibt sonst nichts: Ein erlaubtes Diktat hinterlaesst keine
-- Zeile (ADR-010 Punkt 15, die Akte weist erst den uebernommenen Entwurf
-- nach). Keine neue Tabelle, keine neue Spalte, keine neue Datenklasse.
-- =============================================================================

create function public.check_dictation_access(p_appointment_id uuid)
returns boolean
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

  if not app.can_write_treatment_note() then
    -- Ausgang der Pruefpfade (G6b): false und ein access.denied-Eintrag.
    perform app.record_denied_read(
      v_actor, 'treatment_note.dictated', 'not allowed to dictate treatment documentation'
    );
    return false;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    return false;
  end if;

  return exists (
    select 1
    from public.appointments a
    where a.id = p_appointment_id
      and a.organization_id = v_org
      and a.kind = 'therapy'
      and a.status not in ('cancelled', 'no_show')
  );
end;
$$;

comment on function public.check_dictation_access(uuid) is
  'KI-001 (BEF-153, ADR-005): Darf die angemeldete Person zu diesem Behandlungstermin diktieren? Aufgerufen nur vom AI Gateway mit dem Token der Person. Ohne Schreibrecht false mit access.denied (treatment_note.dictated); sonst schreibt die Funktion nichts.';

revoke all on function public.check_dictation_access(uuid) from public, anon;
grant execute on function public.check_dictation_access(uuid) to authenticated;
