-- =============================================================================
-- BEF-179 Zeitkonto: Eine Zurückweisung erreicht die Person (Pfad A)
--
-- Weist owner einen Freizeitausgleich zurück, ist die Zeit sofort wieder
-- Arbeitszeit (ANN-595). Bis hierher sah die Person das nur im Zeitkonto. Jetzt
-- steht ein zurückgewiesener Freizeitausgleich bei ihr in der Übersicht unter
-- „noch offen“, bis sein Tag vorbei ist - ohne Benachrichtigung, Push bleibt
-- aus (Entscheidung Jannes 2026-10-17).
--
-- Die Übersicht lädt bei jedem Öffnen. Sie liest deshalb nicht das ganze
-- Zeitkonto (`list_time_account` mit allen Einträgen, Gründen und - für owner
-- und Büro - den Salden aller), sondern nur, was die Zeile braucht: Tag,
-- Beginn und Ende der eigenen zurückgewiesenen Freizeitausgleiche. Der Grund
-- steht im Zeitkonto, einen Tipp weiter; am Telefon in der Halterung bleibt er
-- aus der Übersicht (ANN-675, PROJECT_PRINCIPLES.md 2.2).
--
-- Nur lesend, nur das eigene Konto, kein Auditeintrag (ADR-010 Punkt 15),
-- keine neue Tabelle, keine Frist.
-- =============================================================================

create function public.list_rejected_time_off()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_eigen uuid;
  v_heute date;
begin
  v_org := app.staff_request_org(app.can_keep_time_account(), 'not allowed to keep a time account');
  v_eigen := app.own_staff_member(v_org);
  if v_eigen is null then
    return '[]'::jsonb;
  end if;
  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = v_org;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'on_date', e.on_date,
             'starts_at', to_char(e.starts_at, 'HH24:MI'),
             'ends_at', to_char(e.ends_at, 'HH24:MI')
           ) order by e.on_date, e.starts_at, e.id), '[]'::jsonb)
    from public.staff_time_account_entries e
    where e.organization_id = v_org
      and e.staff_member_id = v_eigen
      and e.kind = 'time_off'
      and e.status = 'rejected'
      and e.on_date >= v_heute
  );
end;
$$;

revoke all on function public.list_rejected_time_off() from public, anon;
grant execute on function public.list_rejected_time_off() to authenticated;

comment on function public.list_rejected_time_off() is
  'BEF-179 (ANN-675): die eigenen zurückgewiesenen Freizeitausgleiche, deren Tag noch nicht vorbei ist - für „noch offen“ in der Übersicht. Nur Tag, Beginn und Ende, ohne Grund; den liest das Zeitkonto. Keine Benachrichtigung.';
