-- =============================================================================
-- BEF-148: Ein Zustellauftrag wird nur von dem gemeldet, der ihn hält
-- (Zweitreview KOM-EPIC-003, Hinweise H1, H2)
--
-- Ein abgeholter Auftrag ist 15 Minuten vergeben. Dauerte ein Lauf länger,
-- holte der nächste ihn erneut ab - und das späte Melden des ersten
-- überschrieb dessen Stand: als „gesendet", während der zweite noch sendete,
-- oder als neuer Versuch, der den zweiten doppelt senden ließ.
-- finish_notification_delivery prüfte nicht, ob der Aufrufer den Anspruch von
-- jetzt hält.
--
--   claim_notification_deliveries   + claimed_at (der Anspruch, auf Millisekunden)
--   finish_notification_delivery    + p_claimed_at; ein fremder oder alter
--                                     Anspruch: 'no claimed delivery'
--   purge_notification_deliveries   + Push-Registrierungen von Zugängen, die
--                                     geendet haben (nicht: gesperrt)
--
-- Rümpfe aus 20261104100000_kom_009_benachrichtigungen.sql, sonst unverändert.
-- Rechte wie dort: nur service_role für Abholen und Melden; der Löschlauf
-- läuft im Zeitplan.
-- =============================================================================

drop function public.claim_notification_deliveries(integer);
drop function public.finish_notification_delivery(uuid, text, text[]);

create function public.claim_notification_deliveries(p_limit integer default 50)
returns table (
  id          uuid,
  kind        text,
  channel     text,
  subject_at  timestamptz,
  time_zone   text,
  email       text,
  push_targets jsonb,
  -- BEF-148: der Anspruch. Melden verlangt ihn zurück.
  claimed_at  timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auftrag record;
  v_grund   text;
  v_neu     timestamptz;
begin
  for v_auftrag in
    select d.id, d.access_id, d.organization_id, o.time_zone,
           s.quiet_from, s.quiet_until
    from public.notification_deliveries d
    join public.organizations o on o.id = d.organization_id
    left join public.platform_notification_settings s on s.access_id = d.access_id
    where d.state = 'pending'
      and d.due_at <= now()
      and (d.claimed_at is null or d.claimed_at < now() - interval '15 minutes')
    -- Der naechste Termin zuerst: Greift die Tagesgrenze je Art, geht die
    -- Erinnerung an den naechsten Termin, nicht an einen zufaelligen
    -- (Zweitreview S1).
    order by d.due_at, d.subject_at nulls last, d.id
    limit greatest(least(coalesce(p_limit, 50), 200), 1)
    for update of d skip locked
  loop
    v_grund := app.notification_drop_reason(v_auftrag.id);
    if v_grund is not null then
      update public.notification_deliveries d
         set state = 'dropped', drop_reason = v_grund, finished_at = now(), claimed_at = null
       where d.id = v_auftrag.id;
      continue;
    end if;

    v_neu := app.notification_due_at(
      now(), v_auftrag.time_zone,
      coalesce(v_auftrag.quiet_from, app.notification_rule('quiet_from')::smallint),
      coalesce(v_auftrag.quiet_until, app.notification_rule('quiet_until')::smallint));
    if v_neu > now() then
      update public.notification_deliveries d set due_at = v_neu, claimed_at = null
       where d.id = v_auftrag.id;
      continue;
    end if;

    -- Auf Millisekunden (BEF-148): So kommt der Anspruch durch jeden Client
    -- unverändert zurück, auch durch ein JavaScript-Datum.
    update public.notification_deliveries d
       set claimed_at = date_trunc('milliseconds', now()), attempts = d.attempts + 1
     where d.id = v_auftrag.id;

    return query
    select d.id, d.kind, d.channel, d.subject_at, v_auftrag.time_zone,
           case when d.channel = 'email' then (
             select lower(btrim(u.email)) from public.platform_accesses a
             join auth.users u on u.id = a.account_user_id
             where a.id = d.access_id
           ) end,
           case when d.channel = 'push' then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth_secret)
                      order by p.created_at), '[]'::jsonb)
             from public.platform_push_subscriptions p where p.access_id = d.access_id
           ) end,
           d.claimed_at
    from public.notification_deliveries d
    where d.id = v_auftrag.id;
  end loop;
end;
$$;

create function public.finish_notification_delivery(
  p_id             uuid,
  p_claimed_at     timestamptz,
  p_outcome        text,
  p_gone_endpoints text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.notification_deliveries%rowtype;
begin
  if p_outcome is null or p_outcome not in ('sent', 'failed', 'gone') then
    raise exception 'invalid outcome' using errcode = '22023';
  end if;
  select * into d from public.notification_deliveries x where x.id = p_id for update;
  -- BEF-148: Nur wer den Anspruch von jetzt hält, meldet. Ein Lauf, der
  -- länger als 15 Minuten brauchte, trifft einen Auftrag, den ein zweiter
  -- Lauf schon wieder abgeholt hat - sein „gesendet" oder „gescheitert"
  -- überschriebe dessen Stand.
  if not found or d.state <> 'pending' or d.claimed_at is null
     or d.claimed_at is distinct from p_claimed_at then
    raise exception 'no claimed delivery' using errcode = 'P0002';
  end if;

  delete from public.platform_push_subscriptions p
   where p.access_id = d.access_id
     and p.endpoint = any (coalesce(p_gone_endpoints, '{}'::text[]));

  if p_outcome = 'sent' then
    update public.notification_deliveries x
       set state = 'sent', finished_at = now()
     where x.id = p_id;
  elsif p_outcome = 'gone' then
    update public.notification_deliveries x
       set state = 'dropped', drop_reason = 'no_device', finished_at = now()
     where x.id = p_id;
  elsif d.attempts >= app.notification_rule('max_attempts') then
    update public.notification_deliveries x
       set state = 'failed', finished_at = now()
     where x.id = p_id;
  else
    update public.notification_deliveries x
       set claimed_at = null,
           due_at = now() + make_interval(mins => 15 * d.attempts)
     where x.id = p_id;
  end if;
end;
$$;

comment on function public.claim_notification_deliveries(integer) is
  'KOM-009 (ADR-024 Punkt 16): gibt dem Versand faellige Benachrichtigungen mit Adresse bzw. Push-Zielen und dem Anspruch (claimed_at). Prueft Zugang, Wahl, Schalter, Sinn, Obergrenzen und Ruhezeit beim Abholen. Nur service_role.';

revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer) to service_role;

comment on function public.finish_notification_delivery(uuid, timestamptz, text, text[]) is
  'KOM-009 (ADR-024 Punkt 16), BEF-148: der Versand meldet sent, failed oder gone - nur mit dem Anspruch, den er beim Abholen bekam. Abgewiesene Endpunkte fallen, Fehlschlaege werden hoechstens dreimal versucht. Nur service_role.';

revoke all on function public.finish_notification_delivery(uuid, timestamptz, text, text[]) from public, anon, authenticated;
grant execute on function public.finish_notification_delivery(uuid, timestamptz, text, text[]) to service_role;


create or replace function public.purge_notification_deliveries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  delete from public.notification_deliveries d
   where d.state <> 'pending'
     and d.finished_at < now() - app.retention_interval('benachrichtigung');
  get diagnostics v_anzahl = row_count;
  -- BEF-148: Push-Registrierungen eines Zugangs, der geendet hat - zeitlich
  -- (Lesefrist, Volljährigkeit) oder durch Widerruf. Beim Widerruf fallen sie
  -- schon sofort (Trigger). Eine Sperre ist kein Ende: Sie lässt sich
  -- aufheben, und die Registrierung des Geräts bleibt dafür stehen
  -- (Zweitreview); geschickt wird während der Sperre ohnehin nichts.
  delete from public.platform_push_subscriptions p
   using public.platform_accesses a
   where a.id = p.access_id
     and (a.status = 'revoked' or coalesce(app.platform_access_ended_at(a.id) <= now(), false));
  return v_anzahl;
end;
$$;

update public.retention_assignments
   set scope_note = 'Push-Registrierung je Geraet: faellt beim Abmelden, bei abgewiesenem Endpunkt, beim Widerruf des Zugangs (Trigger), mit seinem zeitlichen Ende im taeglichen Lauf purge_notification_deliveries (BEF-148, ANN-669) und spaetestens mit dem Zugang (cascade). Eine Sperre laesst sie stehen.'
 where table_name = 'platform_push_subscriptions';
