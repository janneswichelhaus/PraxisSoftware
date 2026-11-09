-- Antworten auf Rückfragen vom AI Gateway umformen lassen (ANN-861, ADR-005 Punkt 3): Die
-- Datenbank sagt dem Gateway nur Ja oder Nein. Es gilt das Antwortrecht an genau diesem Vorgang
-- (ADR-004 Punkt 6); ein erlaubter Aufruf schreibt nichts.
create function public.check_answer_wording_access(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_vorgang public.platform_messages%rowtype;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Erst die Rolle, dann die Eingabe (ADR-023 Punkt 21).
  if not app.may_read_platform_messages('any') then
    perform app.record_denied_read(v_actor, 'platform_message.answer_worded',
                                   'not allowed to word message answers');
    return false;
  end if;
  select m.* into v_vorgang
  from public.platform_messages m
  where m.id = p_message_id and m.organization_id = app.current_organization_id();
  -- Unbekannt, fremd, für diese Rolle nicht lesbar oder erledigt: Dort gibt es nichts zu antworten.
  if v_vorgang.id is null
     or not app.can_read_platform_message(v_vorgang.relationship_kind, v_vorgang.topic)
     or v_vorgang.status = 'closed' then
    return false;
  end if;
  if not app.can_answer_platform_message(v_vorgang.relationship_kind, v_vorgang.topic) then
    perform app.record_denied_read(v_actor, 'platform_message.answer_worded',
                                   'not allowed to word message answers');
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.check_answer_wording_access(uuid) from public, anon;
grant execute on function public.check_answer_wording_access(uuid) to authenticated;

comment on function public.check_answer_wording_access(uuid) is
  'Darf die angemeldete Person eine Antwort auf diese Rückfrage vom AI Gateway umformen lassen (ANN-861, ADR-005)? Aufgerufen nur vom Gateway mit dem Token der Person. Es gilt das Antwortrecht am Vorgang; ohne es false mit access.denied (platform_message.answer_worded), sonst schreibt die Funktion nichts.';
