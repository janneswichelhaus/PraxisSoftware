-- =============================================================================
-- TEAM-009: Personenkarte im Teamchat (Auftrag Jannes 2026-10-19, Antwort auf
-- Frage 5 der PR zu TEAM-006 und TEAM-007; ANN-668)
--
-- Ein Tipp auf das Bild einer Person öffnet ihre Karte, wie bei Slack: großes
-- Bild, Name, ihre Rollen in der Praxis und „Direktnachricht“. Bild und Farbe
-- kommen aus list_team_avatars; diese Funktion liefert dazu nur, was die
-- Liste nicht hat - die Praxisrollen - und ob die Person noch im Team ist.
--
-- Bewusst nicht auf der Karte (ANN-668, §20): Anwesenheit, „zuletzt aktiv“,
-- Status, Telefonnummer, Mail, Zahl der Nachrichten. Die Karte sagt, wer
-- jemand in der Praxis ist, nicht was sie tut.
--
--   public.get_team_person   Name, Praxisrollen, im Team, eigene Karte
--
-- Lesen dürfen alle, die am Teamchat teilnehmen, für ihre eigene Praxis. Damit
-- sieht das Team die Praxisrollen der anderen Teilnehmenden - bisher sah nur
-- owner fremde Rollen (Policy user_roles_select_scoped, unverändert); ANN-668
-- liegt dafür im Prüfpaket. Wer nicht teilnimmt (ausgeschieden, ohne Zugang,
-- Konto ruht), kommt ohne Namen und ohne Rollen: Den Namen hat die Stelle, an
-- der man die Karte öffnet, ohnehin, und sonst ließen sich über die Kennungen
-- aus list_team_avatars die Namen aller Mitarbeiterdatensätze abfragen
-- (Zweitreview). Kein Tabellenrecht (ADR-004), kein Auditeintrag (ADR-010
-- Punkte 15 bis 17).
-- =============================================================================

create function public.get_team_person(p_staff uuid)
returns table (
  staff_member_id uuid,
  name            text,
  roles           text[],
  active          boolean,
  own             boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_aktiv boolean;
  -- Die Praxisrollen in der Reihenfolge der Anzeige; `patient` ist keine.
  v_reihe text[] := array['owner', 'therapist', 'team_lead', 'office', 'trainer'];
begin
  select o_org, o_staff into v_org, v_staff from app.teamchat_member();
  if not exists (select 1 from public.staff_members sm
                 where sm.id = p_staff and sm.organization_id = v_org) then
    raise exception 'team person not found' using errcode = 'P0002';
  end if;
  v_aktiv := app.teamchat_participant(v_org, p_staff);

  return query
  select p_staff,
         case when v_aktiv then app.team_staff_name(p_staff) end,
         case when v_aktiv then array(
           select ur.role_key
           from public.staff_members sm
           join public.user_profiles up
             on up.person_id = sm.person_id and up.organization_id = sm.organization_id
            and up.is_active
           join public.user_roles ur
             on ur.user_id = up.id and ur.organization_id = sm.organization_id
           where sm.id = p_staff and ur.role_key = any (v_reihe)
           group by ur.role_key
           order by array_position(v_reihe, ur.role_key)
         ) else array[]::text[] end,
         v_aktiv,
         p_staff = v_staff;
end;
$$;

comment on function public.get_team_person(uuid) is
  'TEAM-009 (ANN-668): Personenkarte im Teamchat - Name, Praxisrollen, im Team. Keine Anwesenheit, kein Status, keine Kontaktdaten.';

revoke all on function public.get_team_person(uuid) from public, anon;
grant execute on function public.get_team_person(uuid) to authenticated;
