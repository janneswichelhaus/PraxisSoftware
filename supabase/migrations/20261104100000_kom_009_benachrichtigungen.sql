-- =============================================================================
-- KOM-009 (KOM-EPIC-003): Benachrichtigungen nach Regeln (ADR-024 Abschnitt C)
--
-- Wer etwas tun soll, erfaehrt es - nach Regeln, nie statt der Uebersicht
-- (Punkt 10). Diese Migration baut den Teil in der Datenbank:
--
--   1. Der Katalog: sechs Arten, an einer Stelle (Punkt 13). Den Wortlaut
--      fuehrt src/lib/begriffe.ts; supabase/tests/benachrichtigungen.test.ts
--      haelt beide Listen gleich.
--   2. Die Wahl der Person je Zugang, je Art und je Weg, von Anfang an aus,
--      mit Ruhezeit und Zeitpunkt (Punkt 15).
--   3. Der Schalter der Praxis: owner schaltet eine Art fuer alle ab, nie fuer
--      eine Person ein (Punkt 15, letzter Satz).
--   4. Die Push-Registrierung je Geraet (Punkt 17).
--   5. Das Auftragsbuch: Ereignisse legen Zustellauftraege an, ohne Text und
--      ohne Adresse (Punkte 16, 17). Den Versand uebernimmt die Edge Function
--      `notifications` - scharf erst mit OPS-001 und B13 (Punkt 16, 18).
--   6. Die Ereignisse: Terminerinnerung (Zeitplan), Termin von der Praxis
--      verschoben oder abgesagt, Antwort auf eine Rueckfrage, Terminwunsch
--      beantwortet, neuer Plan.
--
-- Mitarbeitende bekommen nichts davon (Punkt 12, W4): Was die Praxis tun
-- soll, steht in den Offenen Punkten. Kein Auditereignis (Punkt 17): ADR-010
-- und sein Katalog bleiben unveraendert. Die Praxis sieht nicht, wer
-- Benachrichtigungen eingeschaltet hat (ADR-024 Folgefrage 2, ANN-344).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Katalog und Regeln - je eine Stelle
-- -----------------------------------------------------------------------------
create function app.notification_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'appointment_reminder',
    'appointment_changed',
    'appointment_cancelled',
    'message_answered',
    'request_answered',
    'plan_assigned'
  ]::text[]
$$;

revoke all on function app.notification_kinds() from public, anon, authenticated;

comment on function app.notification_kinds() is
  'KOM-009 (ADR-024 Punkt 13): der geschlossene Katalog der Benachrichtigungsarten. Wortlaut in src/lib/begriffe.ts (BENACHRICHTIGUNGEN); eine neue Art ist eine Aenderung beider Stellen mit Review.';

-- Ruhezeit, Obergrenzen, Zeitpunkt der Terminerinnerung und Wiederholungen:
-- Konstanten an einer Stelle (Punkt 15, ANN-343).
create function app.notification_rule(p_key text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'quiet_from' then 20        -- Ruhezeit ab 20 Uhr (Vorschlag ADR-024)
    when 'quiet_until' then 8        -- bis 8 Uhr
    when 'reminder_hour' then 17     -- Erinnerung am Vortag ab 17 Uhr
    when 'weekly_cap' then 10        -- hoechstens zehn je Woche und Weg
    when 'max_attempts' then 3       -- dann aufgegeben (Punkt 16)
    when 'stale_hours' then 24       -- spaeter als einen Tag nach Faelligkeit: entfaellt
  end
$$;

revoke all on function app.notification_rule(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Wahl der Person (Punkt 15)
-- -----------------------------------------------------------------------------
create table public.platform_notification_settings (
  access_id       uuid primary key references public.platform_accesses (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  email_kinds     text[] not null default '{}' check (email_kinds <@ app.notification_kinds()),
  push_kinds      text[] not null default '{}' check (push_kinds <@ app.notification_kinds()),
  -- null: die Vorgabe aus app.notification_rule. Gleich: keine Ruhezeit.
  quiet_from      smallint check (quiet_from between 0 and 23),
  quiet_until     smallint check (quiet_until between 0 and 23),
  chosen_at       timestamptz not null default now(),
  chosen_by       uuid not null,

  constraint platform_notification_settings_quiet_both check (
    (quiet_from is null) = (quiet_until is null)
  )
);

comment on table public.platform_notification_settings is
  'KOM-009 (ADR-024 Punkt 15): welche Arten ein Plattformzugang auf welchem Weg bekommen will, mit Ruhezeit und Zeitpunkt der Wahl. Ohne Zeile ist alles aus. Je Zugang - eine Vertretung waehlt fuer ihren Zugang selbst. Kein Tabellenrecht: nur ueber die Funktionen dieser Migration.';

alter table public.platform_notification_settings enable row level security;
revoke all on public.platform_notification_settings from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Der Schalter der Praxis
-- -----------------------------------------------------------------------------
create table public.notification_kind_switches (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind            text not null check (kind = any (app.notification_kinds())),
  disabled_at     timestamptz not null default now(),
  disabled_by     uuid not null,
  unique (organization_id, kind)
);

comment on table public.notification_kind_switches is
  'KOM-009 (ADR-024 Punkt 15): Arten, die die Praxis fuer alle abgeschaltet hat. Eine Zeile heisst aus; einschalten loescht sie. Nur owner, nur ueber Funktionen.';

alter table public.notification_kind_switches enable row level security;
revoke all on public.notification_kind_switches from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Push-Registrierung je Geraet (Punkt 17)
-- -----------------------------------------------------------------------------
create table public.platform_push_subscriptions (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  access_id       uuid not null references public.platform_accesses (id) on delete cascade,
  -- Der Endpunkt des Push-Dienstes des Browsers und seine Schluessel
  -- (RFC 8291): p256dh 65 Byte, auth 16 Byte, base64url ohne Fuellzeichen.
  endpoint        text not null check (endpoint ~ '^https://[^\s]+$' and length(endpoint) <= 2048),
  p256dh          text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth_secret     text not null check (auth_secret ~ '^[A-Za-z0-9_-]{22}$'),
  created_at      timestamptz not null default now(),
  unique (access_id, endpoint)
);

comment on table public.platform_push_subscriptions is
  'KOM-009 (ADR-024 Punkt 17): Push-Registrierung eines Geraets fuer einen Zugang. Faellt beim Abmelden auf dem Geraet, wenn der Push-Dienst den Endpunkt abweist, mit dem Ende des Zugangs und mit dem Konto.';

create index platform_push_subscriptions_access_idx on public.platform_push_subscriptions (access_id);

alter table public.platform_push_subscriptions enable row level security;
revoke all on public.platform_push_subscriptions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Das Auftragsbuch (Punkte 16, 17)
-- -----------------------------------------------------------------------------
create table public.notification_deliveries (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  access_id       uuid not null references public.platform_accesses (id) on delete cascade,
  kind            text not null check (kind = any (app.notification_kinds())),
  channel         text not null check (channel in ('email', 'push')),
  -- Worauf sich der Auftrag bezieht (Termin, Rueckfrage, Wunsch, Plan): nur
  -- die Kennung, damit der Versand prueft, ob er noch Sinn hat (ANN-345).
  subject_id      uuid,
  -- Datum und Uhrzeit fuer den Text - das Einzige, was er nennen darf (Punkt 14).
  subject_at      timestamptz,
  created_at      timestamptz not null default now(),
  due_at          timestamptz not null,
  state           text not null default 'pending'
                    check (state in ('pending', 'sent', 'failed', 'dropped')),
  claimed_at      timestamptz,
  attempts        smallint not null default 0 check (attempts >= 0),
  finished_at     timestamptz,
  drop_reason     text check (drop_reason in (
                    'access_ended', 'switched_off', 'not_wanted', 'no_address', 'no_device',
                    'obsolete', 'daily_cap', 'weekly_cap', 'stale')),

  constraint notification_deliveries_finished check (
    (state = 'pending') = (finished_at is null)
    and (state = 'dropped') = (drop_reason is not null)
  )
);

comment on table public.notification_deliveries is
  'KOM-009 (ADR-024 Punkte 16, 17): Zustellauftraege fuer Benachrichtigungen an Plattformzugaenge. Katalogschluessel, Weg, Zeitpunkte, Zustand - kein Text, keine Adresse, kein Endpunkt. 30 Tage nach dem Abschluss geloescht (purge_notification_deliveries). Nur ueber Funktionen.';

-- Eine Erinnerung je Termin, Zeitpunkt, Zugang und Weg - der Zeitplan darf
-- stuendlich laufen.
create unique index notification_deliveries_one_reminder
  on public.notification_deliveries (access_id, kind, channel, subject_id, subject_at)
  where kind = 'appointment_reminder';
create index notification_deliveries_due_idx
  on public.notification_deliveries (due_at) where state = 'pending';
create index notification_deliveries_access_idx
  on public.notification_deliveries (access_id, channel, state);

alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Datenklassen (ADR-008)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('benachrichtigung', 'intern', null, 'event_time', interval '30 days', 'ANN-345',
   'Zustellauftraege fuer Benachrichtigungen: 30 Tage nach Versand, Abbruch oder Aufgabe (ADR-024 Punkt 17). Ohne Text und Adresse.',
   79);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('notification_deliveries', 'benachrichtigung', 'automatisch',
   'Eigener Zeitplan purge_notification_deliveries, taeglich: abgeschlossene Auftraege 30 Tage nach dem Abschluss. Kein Loeschjournal - nach einem Restore faellt ein Auftrag im naechsten Lauf erneut, weil die Frist am Auftrag selbst haengt.', 81),
  ('platform_notification_settings', 'plattformzugang', 'ueber_elterndatensatz',
   'Die Wahl der Person zu Benachrichtigungen (ADR-024 Punkt 15) steht am Zugang und faellt mit ihm (cascade).', 82),
  ('platform_push_subscriptions', 'plattformzugang', 'ueber_elterndatensatz',
   'Push-Registrierung je Geraet: faellt beim Abmelden, bei abgewiesenem Endpunkt, mit dem Ende des Zugangs (Trigger) und spaetestens mit dem Zugang (cascade).', 83),
  ('notification_kind_switches', 'konfiguration', 'keine',
   'Von der Praxis abgeschaltete Benachrichtigungsarten. Einstellung der Organisation ohne Personenbezug.', 84);

-- -----------------------------------------------------------------------------
-- 6. Zeitpunkt nach Ruhezeit
--
-- Faellt der Zeitpunkt in die Ruhezeit, geht der Auftrag zu ihrem Ende, in der
-- Zeitzone der Praxis (Punkt 15). Gleicher Anfang und gleiches Ende: keine
-- Ruhezeit.
-- -----------------------------------------------------------------------------
create function app.notification_due_at(
  p_at    timestamptz,
  p_tz    text,
  p_from  smallint,
  p_until smallint
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ortszeit timestamp := p_at at time zone p_tz;
  v_stunde   integer := extract(hour from v_ortszeit)::integer;
  v_ruhe     boolean;
  v_ende     timestamp;
begin
  if p_from is null or p_until is null or p_from = p_until then
    return p_at;
  end if;
  if p_from > p_until then
    v_ruhe := v_stunde >= p_from or v_stunde < p_until;
  else
    v_ruhe := v_stunde >= p_from and v_stunde < p_until;
  end if;
  if not v_ruhe then
    return p_at;
  end if;
  v_ende := date_trunc('day', v_ortszeit) + make_interval(hours => p_until);
  if v_ende <= v_ortszeit then
    v_ende := v_ende + interval '1 day';
  end if;
  return v_ende at time zone p_tz;
end;
$$;

revoke all on function app.notification_due_at(timestamptz, text, smallint, smallint)
  from public, anon, authenticated;

-- Ist der Zugang noch einer, der benachrichtigt werden kann? Aktiv und nicht
-- beendet - ohne Sitzung, fuer Ereignisse und Versand.
create function app.notification_access_live(p_access_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.status = 'active' and coalesce(app.platform_access_ended_at(a.id) > now(), true)
    from public.platform_accesses a
    where a.id = p_access_id
  ), false)
$$;

revoke all on function app.notification_access_live(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Auftrag anlegen - an einer Stelle
--
-- Fuer jeden lebenden Zugang des Verhaeltnisses, der die Art auf einem Weg
-- gewaehlt hat. Schaltet die Praxis die Art ab, entsteht nichts. Ein Termin,
-- der vor dem Zeitpunkt nach Ruhezeit beginnt, bekommt keine Erinnerung und
-- keine Aenderungsnachricht mehr ("entfaellt, wenn es keinen Sinn mehr hat").
-- -----------------------------------------------------------------------------
create function app.enqueue_notification(
  p_org        uuid,
  p_rel_kind   text,
  p_rel_id     uuid,
  p_kind       text,
  p_subject_id uuid,
  p_subject_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_anzahl integer;
begin
  if p_rel_id is null or not (p_kind = any (app.notification_kinds())) then
    return 0;
  end if;
  if exists (
    select 1 from public.notification_kind_switches k
    where k.organization_id = p_org and k.kind = p_kind
  ) then
    return 0;
  end if;
  select o.time_zone into v_tz from public.organizations o where o.id = p_org;

  insert into public.notification_deliveries
    (organization_id, access_id, kind, channel, subject_id, subject_at, due_at)
  select p_org, a.id, p_kind, w.channel, p_subject_id, p_subject_at, z.due_at
  from public.platform_accesses a
  join public.platform_notification_settings s on s.access_id = a.id
  cross join (values ('email'), ('push')) w(channel)
  cross join lateral (
    select app.notification_due_at(
      now(), v_tz,
      coalesce(s.quiet_from, app.notification_rule('quiet_from')::smallint),
      coalesce(s.quiet_until, app.notification_rule('quiet_until')::smallint)
    ) as due_at
  ) z
  where a.organization_id = p_org
    and a.relationship_kind = p_rel_kind
    and a.relationship_id = p_rel_id
    and app.notification_access_live(a.id)
    and (
      (w.channel = 'email' and p_kind = any (s.email_kinds))
      or (w.channel = 'push' and p_kind = any (s.push_kinds)
          and exists (select 1 from public.platform_push_subscriptions p where p.access_id = a.id))
    )
    and not (
      p_kind in ('appointment_reminder', 'appointment_changed')
      and p_subject_at is not null and p_subject_at <= z.due_at
    )
  on conflict (access_id, kind, channel, subject_id, subject_at)
    where kind = 'appointment_reminder' do nothing;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke all on function app.enqueue_notification(uuid, text, uuid, text, uuid, timestamptz)
  from public, anon, authenticated;

-- Das Verhaeltnis eines Termins - wie in public.platform_appointments.
create function app.notification_appointment_relationship(p_appointment public.appointments)
returns table (rel_kind text, rel_id uuid)
language sql
immutable
set search_path = ''
as $$
  select case p_appointment.kind when 'therapy' then 'treatment' when 'training' then 'training' end,
         case p_appointment.kind
           when 'therapy' then p_appointment.patient_id
           when 'training' then p_appointment.training_relationship_id
         end
$$;

revoke all on function app.notification_appointment_relationship(public.appointments)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Ereignisse
-- -----------------------------------------------------------------------------

-- Termin von der Praxis verschoben oder abgesagt. Termine aendert nur die
-- Praxis; liegt am Termin ein offener Wunsch der Person, antwortet die Praxis
-- darauf, und die Person erfaehrt es als "Terminwunsch beantwortet" - nicht
-- doppelt (ANN-346).
create function app.notify_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rel record;
begin
  if new.kind not in ('therapy', 'training') then
    return new;
  end if;
  if exists (
    select 1 from public.platform_appointment_requests w
    where w.appointment_id = new.id and w.status = 'open'
  ) then
    return new;
  end if;
  select * into v_rel from app.notification_appointment_relationship(new);

  if old.status = 'confirmed' and new.status = 'cancelled' and old.starts_at > now() then
    perform app.enqueue_notification(new.organization_id, v_rel.rel_kind, v_rel.rel_id,
                                     'appointment_cancelled', new.id, old.starts_at);
  elsif old.status = 'confirmed' and new.status = 'confirmed'
        and new.starts_at is distinct from old.starts_at and new.starts_at > now() then
    perform app.enqueue_notification(new.organization_id, v_rel.rel_kind, v_rel.rel_id,
                                     'appointment_changed', new.id, new.starts_at);
  end if;
  return new;
end;
$$;

create trigger appointments_notify
  after update of status, starts_at on public.appointments
  for each row execute function app.notify_appointment_update();

revoke all on function app.notify_appointment_update() from public, anon, authenticated;

-- Antwort der Praxis auf eine Rueckfrage.
create function app.notify_message_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vorgang public.platform_messages%rowtype;
begin
  if new.side <> 'practice' then
    return new;
  end if;
  select * into v_vorgang from public.platform_messages m where m.id = new.message_id;
  perform app.enqueue_notification(v_vorgang.organization_id, v_vorgang.relationship_kind,
                                   v_vorgang.relationship_id, 'message_answered',
                                   v_vorgang.id, null);
  return new;
end;
$$;

create trigger platform_message_entries_notify
  after insert on public.platform_message_entries
  for each row execute function app.notify_message_answered();

revoke all on function app.notify_message_answered() from public, anon, authenticated;

-- Terminwunsch beantwortet (erledigt oder abgelehnt; zurueckziehen ist die
-- Person selbst).
create function app.notify_request_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'open' and new.status in ('done', 'declined') then
    perform app.enqueue_notification(new.organization_id, new.relationship_kind,
                                     new.relationship_id, 'request_answered', new.id, null);
  end if;
  return new;
end;
$$;

create trigger platform_appointment_requests_notify
  after update of status on public.platform_appointment_requests
  for each row execute function app.notify_request_answered();

revoke all on function app.notify_request_answered() from public, anon, authenticated;

-- Neuer Plan: ein Plan wird zugewiesen (auch eine neue Fassung).
create function app.notify_plan_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'assigned' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform app.enqueue_notification(
      new.organization_id,
      case new.service_area when 'therapy' then 'treatment' else 'training' end,
      coalesce(new.patient_id, new.training_relationship_id),
      'plan_assigned', new.id, null);
  end if;
  return new;
end;
$$;

create trigger exercise_plans_notify
  after insert or update of status on public.exercise_plans
  for each row execute function app.notify_plan_assigned();

revoke all on function app.notify_plan_assigned() from public, anon, authenticated;

-- Ein Zugang endet: seine Geraete werden nicht mehr benachrichtigt.
create function app.drop_push_subscriptions_on_access_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'revoked' and old.status <> 'revoked' then
    delete from public.platform_push_subscriptions p where p.access_id = new.id;
  end if;
  return new;
end;
$$;

create trigger platform_accesses_drop_push
  after update of status on public.platform_accesses
  for each row execute function app.drop_push_subscriptions_on_access_end();

revoke all on function app.drop_push_subscriptions_on_access_end() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 9. Terminerinnerung (Zeitplan, ADR-024 Folgefrage 1, ANN-343)
--
-- Stuendlich; ab 17 Uhr in der Zeitzone der Praxis fuer die Termine des
-- naechsten Tages, am Freitag fuer Samstag bis Montag, am Wochenende nichts.
-- Nur bestaetigte Termine. Der eindeutige Index macht den Lauf wiederholbar.
-- -----------------------------------------------------------------------------
create function app.notification_reminder_days(p_local timestamp)
returns setof date
language sql
immutable
set search_path = ''
as $$
  select (p_local::date + n)
  from generate_series(1, case extract(isodow from p_local)::integer
                            when 5 then 3
                            when 6 then 0
                            when 7 then 0
                            else 1
                          end) n
  where extract(hour from p_local) >= app.notification_rule('reminder_hour')
$$;

revoke all on function app.notification_reminder_days(timestamp) from public, anon, authenticated;

create function public.enqueue_appointment_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    record;
  v_termin record;
  v_anzahl integer := 0;
begin
  for v_org in
    select o.id, o.time_zone from public.organizations o
    where not exists (
      select 1 from public.notification_kind_switches k
      where k.organization_id = o.id and k.kind = 'appointment_reminder'
    )
  loop
    for v_termin in
      select a.id, a.starts_at, r.rel_kind, r.rel_id
      from public.appointments a
      cross join lateral app.notification_appointment_relationship(a) r
      where a.organization_id = v_org.id
        and a.status = 'confirmed'
        and a.kind in ('therapy', 'training')
        and (a.starts_at at time zone v_org.time_zone)::date in (
          select d from app.notification_reminder_days(now() at time zone v_org.time_zone) d
        )
    loop
      v_anzahl := v_anzahl + app.enqueue_notification(
        v_org.id, v_termin.rel_kind, v_termin.rel_id,
        'appointment_reminder', v_termin.id, v_termin.starts_at);
    end loop;
  end loop;
  return v_anzahl;
end;
$$;

comment on function public.enqueue_appointment_reminders() is
  'KOM-009 (ADR-024 Punkt 13, ANN-343): legt die Terminerinnerungen fuer den naechsten Tag an (Freitag: bis Montag), stuendlich ab 17 Uhr wiederholbar. Nur fuer den Zeitplan.';

revoke all on function public.enqueue_appointment_reminders() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 10. Versand: abholen und bestaetigen (nur service_role, Punkt 16)
-- -----------------------------------------------------------------------------

-- Warum ein Auftrag nicht (mehr) geht - null: er geht. Geprueft wird beim
-- Abholen mit dem Stand von jetzt, nicht beim Anlegen.
create function app.notification_drop_reason(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d       public.notification_deliveries%rowtype;
  s       public.platform_notification_settings%rowtype;
  v_tz    text;
  v_heute date;
  v_termin public.appointments%rowtype;
begin
  select * into d from public.notification_deliveries x where x.id = p_id;
  if not app.notification_access_live(d.access_id) then
    return 'access_ended';
  end if;
  if exists (
    select 1 from public.notification_kind_switches k
    where k.organization_id = d.organization_id and k.kind = d.kind
  ) then
    return 'switched_off';
  end if;
  select * into s from public.platform_notification_settings x where x.access_id = d.access_id;
  if not found
     or (d.channel = 'email' and not (d.kind = any (s.email_kinds)))
     or (d.channel = 'push' and not (d.kind = any (s.push_kinds))) then
    return 'not_wanted';
  end if;
  if d.channel = 'push' and not exists (
    select 1 from public.platform_push_subscriptions p where p.access_id = d.access_id
  ) then
    return 'no_device';
  end if;
  if d.channel = 'email' and not exists (
    select 1 from public.platform_accesses a
    join auth.users u on u.id = a.account_user_id
    where a.id = d.access_id and coalesce(btrim(u.email), '') <> ''
  ) then
    return 'no_address';
  end if;
  if d.due_at < now() - make_interval(hours => app.notification_rule('stale_hours')) then
    return 'stale';
  end if;

  if d.kind in ('appointment_reminder', 'appointment_changed') then
    select * into v_termin from public.appointments a where a.id = d.subject_id;
    if not found or v_termin.status <> 'confirmed'
       or v_termin.starts_at is distinct from d.subject_at or v_termin.starts_at <= now() then
      return 'obsolete';
    end if;
  elsif d.kind = 'appointment_cancelled' and d.subject_at <= now() then
    return 'obsolete';
  end if;

  -- Obergrenzen je Weg: eine je Art und Tag, eine Zahl je Woche. Mitgezaehlt
  -- wird, was gerade abgeholt ist.
  select o.time_zone into v_tz from public.organizations o where o.id = d.organization_id;
  v_heute := (now() at time zone v_tz)::date;
  if exists (
    select 1 from public.notification_deliveries x
    where x.access_id = d.access_id and x.channel = d.channel and x.kind = d.kind and x.id <> d.id
      and (x.state = 'sent' or (x.state = 'pending' and x.claimed_at > now() - interval '15 minutes'))
      and (coalesce(x.finished_at, x.claimed_at) at time zone v_tz)::date = v_heute
  ) then
    return 'daily_cap';
  end if;
  if (
    select count(*) from public.notification_deliveries x
    where x.access_id = d.access_id and x.channel = d.channel and x.id <> d.id
      and (x.state = 'sent' or (x.state = 'pending' and x.claimed_at > now() - interval '15 minutes'))
      and coalesce(x.finished_at, x.claimed_at) > now() - interval '7 days'
  ) >= app.notification_rule('weekly_cap') then
    return 'weekly_cap';
  end if;
  return null;
end;
$$;

revoke all on function app.notification_drop_reason(uuid) from public, anon, authenticated;

-- Holt faellige Auftraege ab. Was nicht mehr geht, faellt mit Grund; was in
-- eine (inzwischen geaenderte) Ruhezeit fiele, wird verschoben. Ein
-- abgeholter Auftrag ist 15 Minuten vergeben (wie ANN-217).
create function public.claim_notification_deliveries(p_limit integer default 50)
returns table (
  id          uuid,
  kind        text,
  channel     text,
  subject_at  timestamptz,
  time_zone   text,
  email       text,
  push_targets jsonb
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
    order by d.due_at, d.id
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

    update public.notification_deliveries d
       set claimed_at = now(), attempts = d.attempts + 1
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
           ) end
    from public.notification_deliveries d
    where d.id = v_auftrag.id;
  end loop;
end;
$$;

comment on function public.claim_notification_deliveries(integer) is
  'KOM-009 (ADR-024 Punkt 16): gibt dem Versand faellige Benachrichtigungen mit Adresse bzw. Push-Zielen. Prueft Zugang, Wahl, Schalter, Sinn, Obergrenzen und Ruhezeit beim Abholen. Nur service_role.';

revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer) to service_role;

-- Der Versand meldet das Ergebnis. 'gone': kein Ziel mehr erreichbar. Ein
-- abgewiesener Endpunkt loescht die Registrierung (Punkt 16). Fehlschlaege
-- werden begrenzt wiederholt, dann aufgegeben.
create function public.finish_notification_delivery(
  p_id             uuid,
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
  if not found or d.state <> 'pending' or d.claimed_at is null then
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

comment on function public.finish_notification_delivery(uuid, text, text[]) is
  'KOM-009 (ADR-024 Punkt 16): der Versand meldet sent, failed oder gone. Abgewiesene Endpunkte fallen, Fehlschlaege werden hoechstens dreimal versucht. Nur service_role.';

revoke all on function public.finish_notification_delivery(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.finish_notification_delivery(uuid, text, text[]) to service_role;

-- Abgeschlossene Auftraege 30 Tage nach dem Abschluss (Punkt 17).
create function public.purge_notification_deliveries()
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
  return v_anzahl;
end;
$$;

revoke all on function public.purge_notification_deliveries() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute format('select cron.schedule(%L, %L, %L)',
      'enqueue-appointment-reminders', '5 * * * *',
      'select public.enqueue_appointment_reminders()');
    execute format('select cron.schedule(%L, %L, %L)',
      'purge-notification-deliveries', '50 3 * * *',
      'select public.purge_notification_deliveries()');
  else
    raise notice 'pg_cron ist nicht verfuegbar - Terminerinnerungen (KOM-009) entstehen nicht automatisch.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 11. Die Person: lesen und waehlen (Punkt 15)
-- -----------------------------------------------------------------------------
create function public.platform_notification_settings(
  p_access_id uuid,
  p_endpoint  text default null
)
returns table (
  email_kinds       text[],
  push_kinds        text[],
  quiet_from        smallint,
  quiet_until       smallint,
  chosen_at         timestamptz,
  disabled_kinds    text[],
  device_registered boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  return query
  select coalesce(s.email_kinds, '{}'::text[]),
         coalesce(s.push_kinds, '{}'::text[]),
         coalesce(s.quiet_from, app.notification_rule('quiet_from')::smallint),
         coalesce(s.quiet_until, app.notification_rule('quiet_until')::smallint),
         s.chosen_at,
         coalesce((select array_agg(k.kind order by k.kind)
                   from public.notification_kind_switches k
                   where k.organization_id = v_zugang.organization_id), '{}'::text[]),
         p_endpoint is not null and exists (
           select 1 from public.platform_push_subscriptions p
           where p.access_id = p_access_id and p.endpoint = p_endpoint)
  from (select 1) eins
  left join public.platform_notification_settings s on s.access_id = p_access_id;
end;
$$;

comment on function public.platform_notification_settings(uuid, text) is
  'KOM-009 (ADR-024 Punkt 15): die eigene Wahl zu Benachrichtigungen fuer einen lesbaren Zugang, die von der Praxis abgeschalteten Arten und ob dieses Geraet fuer Push registriert ist. Kein Vertretungseintrag: die Wahl ist Sache des eigenen Zugangs.';

revoke all on function public.platform_notification_settings(uuid, text) from public, anon;
grant execute on function public.platform_notification_settings(uuid, text) to authenticated;

create function public.set_platform_notification_settings(
  p_access_id   uuid,
  p_email_kinds text[],
  p_push_kinds  text[],
  p_quiet_from  smallint,
  p_quiet_until smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    raise exception 'platform access denied' using errcode = '42501';
  end if;
  if p_email_kinds is null or p_push_kinds is null
     or not (p_email_kinds <@ app.notification_kinds())
     or not (p_push_kinds <@ app.notification_kinds())
     or p_quiet_from is null or p_quiet_until is null
     or p_quiet_from not between 0 and 23 or p_quiet_until not between 0 and 23 then
    raise exception 'invalid notification settings' using errcode = '22023';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  insert into public.platform_notification_settings
    (access_id, organization_id, email_kinds, push_kinds, quiet_from, quiet_until, chosen_at, chosen_by)
  values (
    p_access_id, v_zugang.organization_id,
    (select coalesce(array_agg(distinct k order by k), '{}') from unnest(p_email_kinds) k),
    (select coalesce(array_agg(distinct k order by k), '{}') from unnest(p_push_kinds) k),
    p_quiet_from, p_quiet_until, now(), auth.uid()
  )
  on conflict (access_id) do update
    set email_kinds = excluded.email_kinds,
        push_kinds  = excluded.push_kinds,
        quiet_from  = excluded.quiet_from,
        quiet_until = excluded.quiet_until,
        chosen_at   = excluded.chosen_at,
        chosen_by   = excluded.chosen_by;
end;
$$;

comment on function public.set_platform_notification_settings(uuid, text[], text[], smallint, smallint) is
  'KOM-009 (ADR-024 Punkt 15): die eigene Wahl je Art und Weg mit Ruhezeit, mit Zeitpunkt am Zugang. Abschalten geht immer, auch in der Lesefrist.';

revoke all on function public.set_platform_notification_settings(uuid, text[], text[], smallint, smallint)
  from public, anon;
grant execute on function public.set_platform_notification_settings(uuid, text[], text[], smallint, smallint)
  to authenticated;

create function public.register_platform_push_subscription(
  p_access_id uuid,
  p_endpoint  text,
  p_p256dh    text,
  p_auth      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    raise exception 'platform access denied' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  begin
    insert into public.platform_push_subscriptions
      (organization_id, access_id, endpoint, p256dh, auth_secret)
    values (v_zugang.organization_id, p_access_id, p_endpoint, p_p256dh, p_auth)
    on conflict (access_id, endpoint) do update
      set p256dh = excluded.p256dh, auth_secret = excluded.auth_secret;
  exception when check_violation or not_null_violation then
    raise exception 'invalid push subscription' using errcode = '22023';
  end;
end;
$$;

comment on function public.register_platform_push_subscription(uuid, text, text, text) is
  'KOM-009 (ADR-024 Punkte 15, 17): registriert dieses Geraet fuer Push an einem lesbaren Zugang. Erst nach der Browserabfrage auf dem Geraet.';

revoke all on function public.register_platform_push_subscription(uuid, text, text, text) from public, anon;
grant execute on function public.register_platform_push_subscription(uuid, text, text, text) to authenticated;

-- Abmelden auf diesem Geraet oder Push hier ausschalten: alle Registrierungen
-- dieses Endpunkts an den eigenen Zugaengen fallen. Bewusst ohne offene
-- Sitzung (Sperre): Abschalten muss immer gehen und gibt nichts preis.
create function public.remove_platform_push_subscription(p_endpoint text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from public.platform_push_subscriptions p
   using public.platform_accesses a
   where a.id = p.access_id
     and a.account_user_id = auth.uid()
     and p.endpoint = p_endpoint;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

comment on function public.remove_platform_push_subscription(text) is
  'KOM-009 (ADR-024 Punkt 17): loescht die Push-Registrierung dieses Geraets an allen eigenen Zugaengen - beim Abmelden und beim Ausschalten.';

revoke all on function public.remove_platform_push_subscription(text) from public, anon;
grant execute on function public.remove_platform_push_subscription(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 12. Die Praxis: eine Art fuer alle abschalten (nur owner)
-- -----------------------------------------------------------------------------
create function public.notification_kind_switches()
returns table (kind text, disabled_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_any_role('owner') then
    raise exception 'owner only' using errcode = '42501';
  end if;
  return query
  select k.kind, k.disabled_at
  from public.notification_kind_switches k
  where k.organization_id = app.current_organization_id()
  order by k.kind;
end;
$$;

comment on function public.notification_kind_switches() is
  'KOM-009 (ADR-024 Punkt 15): die Benachrichtigungsarten, die die Praxis fuer alle abgeschaltet hat. Nur owner; sagt nichts ueber die Wahl einzelner Personen (ANN-344).';

revoke all on function public.notification_kind_switches() from public, anon;
grant execute on function public.notification_kind_switches() to authenticated;

create function public.set_notification_kind_enabled(p_kind text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_any_role('owner') then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if p_kind is null or not (p_kind = any (app.notification_kinds())) or p_enabled is null then
    raise exception 'invalid notification kind' using errcode = '22023';
  end if;
  if p_enabled then
    delete from public.notification_kind_switches k
     where k.organization_id = app.current_organization_id() and k.kind = p_kind;
  else
    insert into public.notification_kind_switches (organization_id, kind, disabled_by)
    values (app.current_organization_id(), p_kind, auth.uid())
    on conflict (organization_id, kind) do nothing;
  end if;
end;
$$;

comment on function public.set_notification_kind_enabled(text, boolean) is
  'KOM-009 (ADR-024 Punkt 15): owner schaltet eine Art fuer alle ab oder wieder frei - fuer eine einzelne Person einschalten kann die Praxis nie.';

revoke all on function public.set_notification_kind_enabled(text, boolean) from public, anon;
grant execute on function public.set_notification_kind_enabled(text, boolean) to authenticated;
