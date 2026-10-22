-- =============================================================================
-- BEF-180 Zeitkonto: Freizeitausgleich am Tag selbst zurücknehmen (Pfad A)
--
-- Bis hierher nahm man einen Freizeitausgleich nur vor seinem Tag zurück
-- (ANN-594): Wer am Morgen doch bleibt, konnte den Eintrag für heute nicht
-- zurücknehmen. Jetzt geht es, solange die freie Zeit noch nicht begonnen hat
-- (Entscheidung Jannes 2026-10-17); genommene Zeit holt weiter niemand zurück.
-- Die Abweichung in den Arbeitszeiten fällt wie bisher mit dem Eintrag.
--
-- Die Regel steht an einer Stelle (app.time_off_started) und gilt am Server
-- für das Zurücknehmen und für `can_withdraw` in `list_time_account`. Ein
-- eigener Eintrag, dessen freie Zeit begonnen hat, nennt das (55000) statt
-- „nicht gefunden“: Wer ihn eingetragen hat, kennt ihn ohnehin; fremde,
-- entschiedene und unbekannte bleiben ununterscheidbar (P0002).
--
-- Kein Auditeintrag (ADR-010 Punkt 15), keine neue Tabelle, keine Frist.
-- =============================================================================

-- Hat die freie Zeit eines Freizeitausgleichs zum Zeitpunkt `p_at` begonnen?
-- Tag und Beginn in Ortszeit der Praxis. Der Zeitpunkt kommt als Parameter,
-- damit die Regel ohne Uhr prüfbar ist; die Aufrufer geben now().
create function app.time_off_started(
  p_on_date date, p_starts_at time, p_time_zone text, p_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select ((p_on_date + p_starts_at) at time zone p_time_zone) <= p_at
$$;

revoke all on function app.time_off_started(date, time, text, timestamptz)
  from public, anon, authenticated;

comment on function app.time_off_started(date, time, text, timestamptz) is
  'BEF-180 (ANN-594): ob die freie Zeit eines Freizeitausgleichs zum Zeitpunkt begonnen hat - Tag und Beginn in Ortszeit der Praxis. Bis dahin lässt er sich zurücknehmen, auch am Tag selbst.';

-- Stand ZK-001, dazu BEF-180: ein Freizeitausgleich bis zum Beginn seiner
-- freien Zeit, nicht mehr nur vor seinem Tag.
create or replace function public.withdraw_time_account_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_eintrag record;
begin
  v_org := app.staff_request_org(app.can_keep_time_account(), 'not allowed to keep a time account');
  select e.id, e.staff_member_id, e.kind, e.on_date, e.starts_at, o.time_zone into v_eintrag
  from public.staff_time_account_entries e
  join public.organizations o on o.id = e.organization_id
  where e.id = p_entry_id
    and e.organization_id = v_org
    and e.status = 'valid'
    and e.entered_by = auth.uid()
    -- Wer für andere gebucht hat, nimmt das nur zurück, solange er es noch
    -- darf (Zweitreview B5).
    and (not (e.entered_for_other or e.kind = 'correction') or app.can_book_time_accounts())
  for update of e;
  if not found then
    raise exception 'time account entry not found' using errcode = 'P0002';
  end if;
  -- Genommene Zeit holt niemand zurück (ANN-594): Hat die freie Zeit
  -- begonnen, bleibt der Freizeitausgleich stehen.
  if v_eintrag.kind = 'time_off'
     and app.time_off_started(v_eintrag.on_date, v_eintrag.starts_at, v_eintrag.time_zone, now()) then
    raise exception 'time off has begun' using errcode = '55000';
  end if;
  perform 1 from public.staff_members sm where sm.id = v_eintrag.staff_member_id for no key update;
  update public.staff_time_account_entries
     set status = 'withdrawn', withdrawn_at = now()
   where id = v_eintrag.id;
  delete from public.staff_working_hour_exceptions e where e.time_account_entry_id = v_eintrag.id;
end;
$$;

comment on function public.withdraw_time_account_entry(uuid) is
  'ZK-001 (ANN-594), BEF-180: die eigene Eingabe zurücknehmen, solange sie gilt; einen Freizeitausgleich, bis seine freie Zeit beginnt (auch am Tag selbst, sonst 55000), eine Buchung für andere oder eine Korrektur nur mit dem Recht dazu. Fremde, entschiedene und unbekannte Einträge sind nicht zu unterscheiden.';

-- Stand ZK-001, dazu BEF-180: `can_withdraw` nach derselben Regel wie das
-- Zurücknehmen.
create or replace function public.list_time_account(p_staff_member_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_eigen  uuid;
  v_andere boolean;
  v_owner  boolean;
  v_ziel   uuid;
  v_zone   text;
begin
  v_org := app.staff_request_org(app.can_keep_time_account(), 'not allowed to keep a time account');
  v_eigen := app.own_staff_member(v_org);
  v_andere := app.can_book_time_accounts();
  v_owner := app.can_decide_staff_requests();
  v_ziel := case when p_staff_member_id is null then v_eigen
                 else app.time_account_target(v_org, p_staff_member_id) end;
  select o.time_zone into v_zone
  from public.organizations o where o.id = v_org;

  return jsonb_build_object(
    'my_staff_member_id', v_eigen,
    'can_book_others', v_andere,
    'can_reject', v_owner,
    'account', case when v_ziel is null then null else jsonb_build_object(
      'staff_member_id', v_ziel,
      'name', app.staff_display_name(v_ziel),
      'balance_minutes', app.time_account_balance(v_org, v_ziel),
      'entries', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', e.id,
                 'kind', e.kind,
                 'on_date', e.on_date,
                 'starts_at', to_char(e.starts_at, 'HH24:MI'),
                 'ends_at', to_char(e.ends_at, 'HH24:MI'),
                 'minutes', e.minutes,
                 'note', e.note,
                 'status', e.status,
                 'entered_at', e.entered_at,
                 'entered_by_name', case when e.entered_for_other then app.account_display_name(e.entered_by) end,
                 'rejected_at', e.rejected_at,
                 'rejected_by_name', app.account_display_name(e.rejected_by),
                 'rejection_note', e.rejection_note,
                 'withdrawn_at', e.withdrawn_at,
                 -- Ein Übertrag hat niemanden, der ihn eingetragen hat.
                 'can_withdraw', coalesce(e.status = 'valid' and e.entered_by = auth.uid()
                                 and (e.kind <> 'time_off'
                                      or not app.time_off_started(e.on_date, e.starts_at, v_zone, now()))
                                 and (not (e.entered_for_other or e.kind = 'correction') or v_andere),
                                 false),
                 'can_reject', v_owner and e.status = 'valid' and e.kind <> 'carryover'
                               and e.staff_member_id is distinct from v_eigen
               ) order by e.on_date desc, e.starts_at desc nulls last, e.entered_at desc), '[]'::jsonb)
        from public.staff_time_account_entries e
        where e.organization_id = v_org and e.staff_member_id = v_ziel
      )
    ) end,
    'accounts', case when not v_andere then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
               'staff_member_id', k.id,
               'name', k.name,
               'balance_minutes', app.time_account_balance(v_org, k.id)
             ) order by k.name, k.id), '[]'::jsonb)
      from (
        select sm.id, app.staff_display_name(sm.id) as name
        from public.staff_members sm
        where sm.organization_id = v_org
          and (sm.employment_status = 'active' or exists (
            select 1 from public.staff_time_account_entries e
            where e.staff_member_id = sm.id and e.status = 'valid'))
      ) k
    ) end
  );
end;
$$;
