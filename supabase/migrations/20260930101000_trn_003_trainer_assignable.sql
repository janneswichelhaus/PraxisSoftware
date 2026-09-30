-- =============================================================================
-- TRN-003: Die Trainingsbetreuung wird zuweisbar (TRN-EPIC-001)
--
-- LEI-003 hat die Rolle `trainer` angelegt und bewusst NICHT zuweisbar
-- gemacht: "Ein Konto mit dieser Rolle und ohne Trainingsbereich faende eine
-- leere Anwendung vor; die Rolle wird zuweisbar, wenn es etwas zu bedienen
-- gibt." Mit TRN-001 und TRN-002 gibt es das - Trainingskund:innen anlegen,
-- oeffnen, aendern, Vertrag beenden.
--
-- Geaendert wird genau die eine Stelle, die die Liste der vergebbaren Rollen
-- traegt. Einladen und Rollenwechsel pruefen ueber sie; beide bleiben allein
-- owner vorbehalten und protokolliert (staff_account.invited,
-- staff_account.roles_changed). `patient` bleibt ausgeschlossen (§4.6).
--
-- Was die Rolle darf, steht unveraendert in den Policies: Trainings-
-- verhaeltnisse ja (app.can_read/can_write_training_relationships), Akte,
-- Kartei, Termine und Dokumentation nein - app.is_staff() kennt sie nicht
-- (ADR-021 Punkt 6, PROJECT_PRINCIPLES.md §4.9). Wer beide Bereiche braucht,
-- bekommt beide Rollen; die Haeufung ist erlaubt, der Schluss nicht (§4.8).
-- =============================================================================

create or replace function app.assert_staff_role_keys(p_role_keys text[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_role_keys is null or cardinality(p_role_keys) = 0 then
    raise exception 'at least one role is required' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_role_keys) as r(key)
    where r.key is null or r.key not in ('owner', 'therapist', 'team_lead', 'office', 'trainer')
  ) then
    raise exception 'unknown role' using errcode = '22023';
  end if;

  if cardinality(p_role_keys) <> (select count(distinct r.key) from unnest(p_role_keys) as r(key)) then
    raise exception 'duplicate role' using errcode = '22023';
  end if;
end;
$$;

comment on function app.assert_staff_role_keys(text[]) is
  'Prueft eine Rollenliste fuer einen Praxiszugang: owner, therapist, team_lead, office und seit TRN-003 trainer. "patient" ist bewusst ausgeschlossen (PROJECT_PRINCIPLES.md 4.6).';
