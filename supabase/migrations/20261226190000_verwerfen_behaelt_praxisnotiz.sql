-- Verwirft die Person ihren Plattform-Entwurf, fallen nur ihre Antworten weg (§13, ANN-808): Hat die
-- Praxis darin schon notiert, bleibt die Notiz als Entwurf der Praxis stehen. Die Plattform zeigt
-- Entwürfe der Praxis nicht, für die Person ist der Entwurf also fort.

create or replace function public.discard_platform_questionnaire_response(p_access_id uuid, p_response_id uuid)
returns boolean
language plpgsql security definer
set search_path to ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_alt    record;
  v_praxis text[];
begin
  if not app.platform_access_allows(p_access_id, 'questionnaire') then
    return false;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  select r.id, r.instrument_id, r.definition_version, r.answers into v_alt
  from public.patient_questionnaire_responses r
  where r.id = p_response_id
    and r.patient_id = v_zugang.relationship_id
    and r.organization_id = v_zugang.organization_id
    and r.source = 'platform'
    and r.status = 'entwurf'
  for update;
  if not found then
    return false;
  end if;

  v_praxis := app.questionnaire_practice_items(v_alt.instrument_id, v_alt.definition_version);
  if v_alt.answers ?| v_praxis then
    update public.patient_questionnaire_responses
       set answers = (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                        from jsonb_each(v_alt.answers) e where e.key = any(v_praxis)),
           source = 'practice', source_access_id = null,
           updated_at = now(), updated_by = auth.uid()
     where id = v_alt.id;
  else
    delete from public.patient_questionnaire_responses where id = v_alt.id;
  end if;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'questionnaire_discard')
  );
  return true;
end;
$$;

comment on function public.discard_platform_questionnaire_response(uuid, uuid) is
  'POR-012: Die Person verwirft ihren eigenen Plattform-Entwurf des Befundbogens, auch in der Lesefrist (ANN-810). Hat die Praxis darin notiert, bleibt nur diese Notiz als Entwurf der Praxis (§13, ANN-808); sonst fällt der Entwurf. Abgeschlossenes bleibt.';
