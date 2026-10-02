-- =============================================================================
-- ABN-021 (BEF-112): Anonyme Belegt-Bloecke fuer die Trainingsbetreuung
--
-- Bis hierher sah die Trainingsbetreuung im Kalender nur Trainingstermine
-- (ADR-022 Punkt 11, ANN-180); eine belegte Zeit erfuhr sie erst beim
-- Speichern (Ueberschneidung, 23P01). Abnahme Jannes, 2026-10-02: Sie sieht
-- relevante belegte Zeiten als anonyme Bloecke "belegt", damit sie freie
-- Zeiten erkennt.
--
--   * Ein Block traegt nur Person, Beginn und Ende - keinen Kontext, keinen
--     Namen, keine Adresse, keinen Zustand. Ueberlappende und angrenzende
--     Zeiten einer Person sind verschmolzen, damit nicht einmal die Zahl der
--     Termine herauskommt.
--   * Nur aus Terminen, die die aufrufende Person NICHT als Termin lesen darf
--     (app.may_read_appointment_context), ohne abgesagte, und nur fuer
--     Mitarbeitende, die die Trainingsbetreuung buchen kann
--     (app.is_assignable_trainer). Praxisrollen lesen ohnehin alles und
--     bekommen eine leere Liste.
--   * Raeume gibt es im Datenmodell nicht; dieser Teil des Befunds hat keinen
--     Gegenstand (ADR-014: nicht vorbauen).
--   * Kein Audit: Die Belegung ist die Restoffenbarung, die ADR-022 Punkt 11
--     bewusst traegt (die Ueberschneidungspruefung verraet sie ohnehin).
-- =============================================================================

create function public.list_busy_blocks(
  p_from            date,
  p_to              date,
  p_staff_member_id uuid default null
)
returns table (staff_member_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_calendar() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;
  if p_from is null or p_to is null then
    raise exception 'from and to are required' using errcode = '22023';
  end if;
  if p_to <= p_from then
    raise exception 'to must be after from' using errcode = '22023';
  end if;
  if p_to - p_from > 31 then
    raise exception 'requested range is too large' using errcode = '22023';
  end if;

  -- Wer jeden Termin lesen darf, braucht keinen anonymen Block.
  if app.is_staff() then
    return;
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  v_start := (p_from::timestamp) at time zone v_tz;
  v_end   := (p_to::timestamp)   at time zone v_tz;

  return query
    with zeiten as (
      select a.staff_member_id as person, tstzrange(a.starts_at, a.ends_at, '[)') as zeit
      from public.appointments a
      where a.organization_id = v_org
        and not app.may_read_appointment_context(a.kind)
        and a.status <> 'cancelled'
        and a.starts_at < v_end
        and a.ends_at > v_start
        and (p_staff_member_id is null or a.staff_member_id = p_staff_member_id)
        and app.is_assignable_trainer(a.staff_member_id, v_org)
    ),
    verschmolzen as (
      select z.person, range_agg(z.zeit) as zeiten from zeiten z group by z.person
    )
    select v.person, lower(u.zeit), upper(u.zeit)
    from verschmolzen v
    cross join lateral unnest(v.zeiten) as u(zeit)
    order by 1, 2;
end;
$$;

comment on function public.list_busy_blocks(date, date, uuid) is
  'Anonyme Belegt-Bloecke fuer die Trainingsbetreuung (ABN-021, BEF-112, ANN-180 Fassung 2): genau Person, Beginn, Ende - verschmolzen, ohne Kontext, Namen, Adresse oder Zustand. Praxisrollen bekommen nichts. Fenster hoechstens 31 Tage wie list_appointments.';

revoke all on function public.list_busy_blocks(date, date, uuid) from public, anon;
grant execute on function public.list_busy_blocks(date, date, uuid) to authenticated;
