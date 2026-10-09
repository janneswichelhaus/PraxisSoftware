-- =============================================================================
-- KOM-001 (KOM-EPIC-001): Eine Frage an die Praxis - strukturiert, nicht als
-- Chat
--
-- PROJECT_PRINCIPLES.md 10 (Patientenkommunikation gehoert zur Person und ist
-- der Akte zuordenbar), IDEA-KOM-001 und -002, DSN-001 4.1 "Nachrichten";
-- ADR-023 Punkte 13, 19, 22, 23, 24.
--
--   public.platform_messages          der Vorgang: Thema, Bezug, Zustand,
--                                     Antwortfrist (ANN-308, ANN-309)
--   public.platform_message_entries   seine Eintraege - Frage, Antwort,
--                                     Nachtrag -, unveraenderlich (ANN-308)
--   public.organizations              + message_response_workdays (ANN-309)
--   public.platform_messages(...)     Plattformprojektion, feste Schluessel
--   public.start_platform_message     Frage stellen
--   public.add_platform_message_entry nachtragen
--   public.close_platform_message     als erledigt markieren
--
-- Was hier NICHT entsteht: eine Einstufung nach Inhalt ("klingt dringend").
-- Das waere eine Risikoklassifikation nach ADR-006 Punkt 4. Der Hinweis auf
-- 112 und 116117 steht in der Oberflaeche, fuer alle gleich
-- (src/features/platform/nachrichtentexte.ts).
--
-- Protokoll (ADR-010 Fassung 3): Wer was wann geschrieben hat, steht an den
-- Eintraegen. Ueber eine Vertretung laeuft jeder Aufruf durch
-- app.log_platform_representation wie die uebrigen Plattformwege.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Antwortfrist der Praxis (ANN-309) - in den Praxisstammdaten
-- -----------------------------------------------------------------------------
alter table public.organizations
  add column message_response_workdays smallint not null default 2
    check (message_response_workdays between 1 and 10);

comment on column public.organizations.message_response_workdays is
  'KOM-001 (ANN-309): Antwort auf eine Nachricht in der Regel innerhalb so vieler Werktage (Montag bis Freitag). Steht als Zusage ueber dem Eingabefeld der Plattform und als "Antwort faellig bis" in der Praxis. Keine Benachrichtigung, keine Eskalation.';

-- Werktage sind Montag bis Freitag. Feiertage kennt die Anwendung nicht
-- (ANN-309): die Frist ist eine Zusage "in der Regel", kein Fristenkalender.
create function app.add_workdays(p_from date, p_days integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_tag    date := p_from;
  v_zaehle integer := 0;
begin
  while v_zaehle < greatest(coalesce(p_days, 0), 0) loop
    v_tag := v_tag + 1;
    if extract(isodow from v_tag) < 6 then
      v_zaehle := v_zaehle + 1;
    end if;
  end loop;
  return v_tag;
end;
$$;

revoke all on function app.add_workdays(date, integer) from public, anon, authenticated;

comment on function app.add_workdays(date, integer) is
  'KOM-001 (ANN-309): der n-te Werktag (Montag bis Freitag) nach einem Tag. Eine Frage vom Samstag mit zwei Werktagen ist am Dienstag faellig.';

-- Faellig ab heute, in der Zeitzone der Praxis.
create function app.message_due_on(p_organization_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select app.add_workdays(app.training_today(o.id), o.message_response_workdays)
  from public.organizations o
  where o.id = p_organization_id
$$;

revoke all on function app.message_due_on(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Der Vorgang
-- -----------------------------------------------------------------------------
create table public.platform_messages (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  relationship_kind        text not null check (relationship_kind in ('treatment', 'training')),
  relationship_id          uuid not null,
  -- Die lebenden Verweise: Faellt das Verhaeltnis, faellt der Vorgang.
  patient_id               uuid references public.patients (id) on delete cascade,
  training_relationship_id uuid references public.training_relationships (id) on delete cascade,
  -- Worum geht es? (DSN-001 4.1): Uebung, Beschwerden, Termin oder Rechnung,
  -- Sonstiges. Bedienhilfe und Zustaendigkeit (ANN-310), keine Einstufung.
  topic                    text not null
                             check (topic in ('exercise', 'complaint', 'organisational', 'other')),
  -- Bezug auf einen zugewiesenen Plan und eine Uebung daraus (IDEA-KOM-001).
  -- Die Bezeichnung ist ein Schnappschuss: Sie bleibt lesbar, wenn der Plan
  -- faellt oder abgeloest wird.
  exercise_plan_id         uuid references public.exercise_plans (id) on delete set null,
  exercise_plan_item_id    uuid references public.exercise_plan_items (id) on delete set null,
  reference_label          text check (reference_label is null
                                       or length(btrim(reference_label)) between 1 and 200),
  status                   text not null default 'open'
                             check (status in ('open', 'answered', 'closed')),
  -- Antwort faellig bis (ANN-309); nur solange die Praxis am Zug ist.
  due_on                   date,
  -- Wer gefragt hat. Kein FK auf das Konto (faellt nach 30 Tagen); der
  -- Zugang darf vor einem der Akte zugeordneten Vorgang fallen (ADR-023
  -- Punkt 5) - die Eintraege tragen deshalb die Angabe selbst.
  created_by_access_id     uuid references public.platform_accesses (id) on delete set null,
  created_by               uuid not null,
  created_at               timestamptz not null default now(),
  last_entry_at            timestamptz not null default now(),
  closed_at                timestamptz,
  closed_by                uuid,
  closed_by_side           text check (closed_by_side in ('person', 'practice')),
  -- KOM-004 (ANN-312): der Akte zugeordnet. Nur in der Behandlung, endgueltig.
  record_assigned_at       timestamptz,
  record_assigned_by       uuid,
  record_assigned_by_label text check (record_assigned_by_label is null
                                       or length(btrim(record_assigned_by_label)) between 1 and 160),

  constraint platform_messages_relationship_matches check (
    (relationship_kind = 'treatment' and training_relationship_id is null
       and patient_id = relationship_id)
    or (relationship_kind = 'training' and patient_id is null
       and training_relationship_id = relationship_id)
  ),
  constraint platform_messages_reference_only_exercise check (
    topic = 'exercise'
    or (exercise_plan_id is null and exercise_plan_item_id is null and reference_label is null)
  ),
  constraint platform_messages_due_while_open check ((status = 'open') = (due_on is not null)),
  constraint platform_messages_closed_stamp check (
    (status = 'closed') = (closed_at is not null and closed_by_side is not null)
  ),
  constraint platform_messages_record_only_treatment check (
    record_assigned_at is null or relationship_kind = 'treatment'
  ),
  constraint platform_messages_record_stamp check (
    (record_assigned_at is null) = (record_assigned_by is null)
    and (record_assigned_at is null) = (record_assigned_by_label is null)
  )
);

comment on table public.platform_messages is
  'KOM-001: eine Frage an die Praxis als Vorgang mit Thema, Bezug und Zustand (IDEA-KOM-001, ANN-308). Datenklasse in der Behandlung: Patientenkommunikation, drei Jahre ab Ende des Jahres, in dem der Vorgang erledigt wurde; der Akte zugeordnet (KOM-004): wie die Akte. Im Training: wie das Trainingsverhaeltnis. Kein Tabellenrecht (ADR-023 Punkt 19).';
comment on column public.platform_messages.created_by is
  'auth.users.id des fragenden Kontos; bei einer Vertretung das Konto der vertretenden Person (ADR-023 Punkt 14).';

create index platform_messages_org_status_idx on public.platform_messages (organization_id, status);
create index platform_messages_relationship_idx on public.platform_messages (relationship_id);
create index platform_messages_patient_idx
  on public.platform_messages (patient_id) where patient_id is not null;
create index platform_messages_training_idx
  on public.platform_messages (training_relationship_id) where training_relationship_id is not null;
create index platform_messages_plan_idx
  on public.platform_messages (exercise_plan_id) where exercise_plan_id is not null;
create index platform_messages_item_idx
  on public.platform_messages (exercise_plan_item_id) where exercise_plan_item_id is not null;
create index platform_messages_access_idx
  on public.platform_messages (created_by_access_id) where created_by_access_id is not null;

alter table public.platform_messages enable row level security;
revoke all on public.platform_messages from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Die Eintraege - unveraenderlich (ANN-308)
--
-- Ein Eintrag wird geschrieben und nie geaendert: Ordnet die Praxis den
-- Vorgang der Akte zu, steht dort genau das, was geschrieben wurde
-- (IDEA-KOM-007, ADR-006 Punkt 3). Geloescht wird nur mit dem Vorgang.
-- -----------------------------------------------------------------------------
create table public.platform_message_entries (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  message_id      uuid not null references public.platform_messages (id) on delete cascade,
  side            text not null check (side in ('person', 'practice')),
  body            text not null check (length(btrim(body)) between 1 and 2000),
  -- Auf der Seite der Person: der Zugang und seine Art. Der Name einer
  -- Vertretung steht als Schnappschuss daneben, weil ihr Konto frueher
  -- faellt als der Eintrag (ADR-023 Konsequenzen). Auf der Seite der
  -- Praxis: der Anzeigename der schreibenden Person.
  access_id       uuid references public.platform_accesses (id) on delete set null,
  author_kind     text not null
                    check (author_kind in ('self', 'legal_representative', 'companion', 'staff')),
  author_label    text check (author_label is null or length(btrim(author_label)) between 1 and 160),
  created_by      uuid not null,
  created_at      timestamptz not null default clock_timestamp(),

  constraint platform_message_entries_side_fields check (
    (side = 'person' and author_kind in ('self', 'legal_representative', 'companion'))
    or (side = 'practice' and author_kind = 'staff' and access_id is null)
  ),
  constraint platform_message_entries_label check (
    (author_kind = 'self') = (author_label is null)
  )
);

comment on table public.platform_message_entries is
  'KOM-001: Eintraege eines Vorgangs - Frage, Antwort der Praxis, Nachtrag (ANN-308). Unveraenderlich; fallen mit dem Vorgang. Datenklasse wie der Vorgang. Kein Tabellenrecht.';

create index platform_message_entries_message_idx
  on public.platform_message_entries (message_id, created_at);
create index platform_message_entries_access_idx
  on public.platform_message_entries (access_id) where access_id is not null;

alter table public.platform_message_entries enable row level security;
revoke all on public.platform_message_entries from public, anon, authenticated;

create function app.platform_message_entries_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Faellt nur der Zugang (on delete set null), bleibt der Eintrag, wie er ist.
  if tg_op = 'UPDATE'
     and old.access_id is not null and new.access_id is null
     and (to_jsonb(new) - 'access_id') = (to_jsonb(old) - 'access_id') then
    return new;
  end if;
  raise exception 'platform message entries are immutable' using errcode = '42501';
end;
$$;

create trigger platform_message_entries_guard
  before update on public.platform_message_entries
  for each row execute function app.platform_message_entries_immutable();

-- Geloescht wird ein Eintrag nur mit seinem Vorgang (Kaskade; Zweitreview
-- H1): Steht der Vorgang noch, ist ein einzelnes Loeschen ein Eingriff in
-- das, was geschrieben wurde - auch auf einem privilegierten Weg.
create function app.platform_message_entries_only_with_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.platform_messages m where m.id = old.message_id) then
    raise exception 'platform message entries are deleted only with their message'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger platform_message_entries_delete_guard
  before delete on public.platform_message_entries
  for each row execute function app.platform_message_entries_only_with_message();

-- -----------------------------------------------------------------------------
-- 4. Datenklasse (ADR-008: "Organisatorische Patientenkommunikation", ANN-001)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('patientenkommunikation', 'intern', null, 'calendar_year_end', interval '3 years', 'ANN-001',
   'Nachrichten der Behandlung ueber die Plattform, die nicht der Akte zugeordnet sind: drei Jahre ab Ende des Kalenderjahres, in dem der Vorgang erledigt oder zuletzt beantwortet wurde (ADR-008). Offene Vorgaenge bleiben; mit der Akte fallen sie. Zugeordnete Vorgaenge haben die Frist der Akte (KOM-004, ANN-312).',
   77);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('platform_messages', 'patientenkommunikation', 'automatisch',
   'Erledigte und beantwortete Vorgaenge der Behandlung ohne Zuordnung zur Akte, drei Jahre ab Jahresende. Ein Legal Hold an der Akte haelt.', 77),
  ('platform_messages', 'patientenakte', 'ueber_elterndatensatz',
   'Der Akte zugeordnete Vorgaenge (KOM-004). Fallen mit der Akte (cascade).', 77),
  ('platform_messages', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Vorgaenge im Training. Fallen mit dem Trainingsverhaeltnis (cascade).', 77),
  ('platform_message_entries', 'patientenkommunikation', 'ueber_elterndatensatz',
   'Eintraege eines Vorgangs. Fallen mit ihm (cascade).', 78),
  ('platform_message_entries', 'patientenakte', 'ueber_elterndatensatz',
   'Eintraege eines der Akte zugeordneten Vorgangs. Fallen mit ihm (cascade).', 78),
  ('platform_message_entries', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Eintraege eines Vorgangs im Training. Fallen mit ihm (cascade).', 78);

-- -----------------------------------------------------------------------------
-- 5. Was ein Zugang sieht und schreiben darf - je eine Stelle
-- -----------------------------------------------------------------------------

-- Die Vorgaenge des eigenen Verhaeltnisses. Eine Begleitung sieht Vorgaenge
-- von vor ihrer Einwilligung nur, wenn diese es umfasst (ADR-023 Punkt 13,
-- "ob fruehere Nachrichten mit den Antworten der Praxis sichtbar sind").
create function app.platform_visible_messages(p_access_id uuid)
returns setof public.platform_messages
language sql
stable
security definer
set search_path = ''
as $$
  select m.*
  from public.platform_accesses a
  join public.platform_messages m
    on m.organization_id = a.organization_id
   and m.relationship_kind = a.relationship_kind
   and m.relationship_id = a.relationship_id
  where a.id = p_access_id
    and (
      a.access_kind <> 'companion'
      or coalesce(a.consent_earlier_messages, false)
      or coalesce(m.created_at >= a.consent_recorded_at, false)
    )
$$;

revoke all on function app.platform_visible_messages(uuid) from public, anon, authenticated;

comment on function app.platform_visible_messages(uuid) is
  'KOM-001: die Vorgaenge, die ein Zugang sieht (ADR-023 Punkt 13). Ohne Rechtepruefung: nur aus Plattformfunktionen nach app.platform_access_allows aufrufen.';

-- Im Training sind Fragen zu Uebungen und Beschwerden Angaben zur Gesundheit;
-- sie brauchen die Einwilligung (ADR-021 Punkt 4) - dieselbe Stelle wie
-- "Das war schwierig, weil ..." (ANN-306). In der Behandlung traegt die
-- Heilbehandlung sie. Termin, Rechnung und Sonstiges gehen immer (ANN-311).
create function app.platform_message_topic_allowed(p_kind text, p_relationship_id uuid, p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_topic in ('organisational', 'other') then true
    when p_topic in ('exercise', 'complaint')
      then app.platform_exercise_note_allowed(p_kind, p_relationship_id)
    else false
  end
$$;

revoke all on function app.platform_message_topic_allowed(text, uuid, text)
  from public, anon, authenticated;

-- Schreiben: Recht 'message' (alle Arten des Zugangs, ADR-023 W3) und nicht
-- in der Lesefrist (ANN-313, wie ANN-305).
create function app.assert_platform_message(p_access_id uuid)
returns public.platform_accesses
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'message')
     or not app.platform_access_writable(p_access_id) then
    raise exception 'platform access not allowed' using errcode = '42501';
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;
  return v_zugang;
end;
$$;

revoke all on function app.assert_platform_message(uuid) from public, anon, authenticated;

create function app.platform_message_body(p_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'message text is required' using errcode = '22023';
  end if;
  if length(btrim(p_body)) > 2000 then
    raise exception 'message text too long' using errcode = '22023';
  end if;
  return btrim(p_body);
end;
$$;

revoke all on function app.platform_message_body(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Frage stellen
-- -----------------------------------------------------------------------------
create function public.start_platform_message(
  p_access_id uuid,
  p_topic     text,
  p_body      text,
  p_plan_id   uuid,
  p_item_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
  v_text   text;
  v_plan   public.exercise_plans%rowtype;
  v_label  text;
  v_id     uuid;
begin
  v_zugang := app.assert_platform_message(p_access_id);

  if p_topic is null or p_topic not in ('exercise', 'complaint', 'organisational', 'other') then
    raise exception 'unknown topic' using errcode = '22023';
  end if;
  if not app.platform_message_topic_allowed(
           v_zugang.relationship_kind, v_zugang.relationship_id, p_topic) then
    raise exception 'topic needs consent' using errcode = '42501';
  end if;
  v_text := app.platform_message_body(p_body);

  -- Bezug nur bei "Uebung" und nur auf einen Plan, den die Plattform dem
  -- Verhaeltnis zeigt (ANN-304); die Uebung muss in diesem Plan stehen.
  if p_item_id is not null and p_plan_id is null then
    raise exception 'exercise needs its plan' using errcode = '22023';
  end if;
  if p_plan_id is not null then
    if p_topic <> 'exercise' then
      raise exception 'reference only for exercise questions' using errcode = '22023';
    end if;
    select p.* into v_plan
    from app.platform_visible_exercise_plans(v_zugang.relationship_kind, v_zugang.relationship_id) p
    where p.id = p_plan_id and p.organization_id = v_zugang.organization_id;
    if v_plan.id is null then
      raise exception 'exercise plan not found' using errcode = 'P0002';
    end if;
    v_label := v_plan.title;
    if p_item_id is not null then
      select i.variant_lay_name into v_label
      from public.exercise_plan_items i
      where i.id = p_item_id and i.plan_id = v_plan.id;
      if not found then
        raise exception 'exercise not found' using errcode = 'P0002';
      end if;
    end if;
    v_label := left(btrim(v_label), 200);
  end if;

  insert into public.platform_messages (
    organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
    topic, exercise_plan_id, exercise_plan_item_id, reference_label,
    status, due_on, created_by_access_id, created_by
  )
  values (
    v_zugang.organization_id, v_zugang.relationship_kind, v_zugang.relationship_id,
    v_zugang.patient_id, v_zugang.training_relationship_id,
    p_topic, v_plan.id, p_item_id, nullif(v_label, ''),
    'open', app.message_due_on(v_zugang.organization_id), v_zugang.id, auth.uid()
  )
  returning id into v_id;

  insert into public.platform_message_entries (
    organization_id, message_id, side, body, access_id, author_kind, author_label, created_by
  )
  values (
    v_zugang.organization_id, v_id, 'person', v_text, v_zugang.id, v_zugang.access_kind,
    case when v_zugang.access_kind <> 'self' then v_zugang.representative_name end, auth.uid()
  );

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'message')
  );
  return v_id;
end;
$$;

revoke all on function public.start_platform_message(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.start_platform_message(uuid, text, text, uuid, uuid) to authenticated;

comment on function public.start_platform_message(uuid, text, text, uuid, uuid) is
  'KOM-001: eine Frage an die Praxis stellen (IDEA-KOM-001, ANN-308): Thema, Text, optional Plan und Uebung. Recht message, nicht in der Lesefrist (ANN-313); im Training Uebung und Beschwerden nur mit Einwilligung (ANN-311). Antwort faellig nach den Werktagen der Praxis (ANN-309).';

-- -----------------------------------------------------------------------------
-- 7. Nachtragen und erledigen
-- -----------------------------------------------------------------------------
create function app.platform_open_message(p_access_id uuid, p_message_id uuid)
returns public.platform_messages
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vorgang public.platform_messages%rowtype;
begin
  select m.* into v_vorgang
  from app.platform_visible_messages(p_access_id) m
  where m.id = p_message_id;
  if v_vorgang.id is null then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  if v_vorgang.status = 'closed' then
    raise exception 'message is closed' using errcode = '22023';
  end if;
  return v_vorgang;
end;
$$;

revoke all on function app.platform_open_message(uuid, uuid) from public, anon, authenticated;

create function public.add_platform_message_entry(
  p_access_id  uuid,
  p_message_id uuid,
  p_body       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_vorgang public.platform_messages%rowtype;
  v_text    text;
  v_id      uuid;
begin
  v_zugang := app.assert_platform_message(p_access_id);
  v_vorgang := app.platform_open_message(p_access_id, p_message_id);
  -- Auch ein Nachtrag zu einer Uebung oder zu Beschwerden ist eine Angabe
  -- zur Gesundheit (ANN-311): nach einem Widerruf im Training nicht mehr.
  if not app.platform_message_topic_allowed(
           v_vorgang.relationship_kind, v_vorgang.relationship_id, v_vorgang.topic) then
    raise exception 'topic needs consent' using errcode = '42501';
  end if;
  v_text := app.platform_message_body(p_body);

  insert into public.platform_message_entries (
    organization_id, message_id, side, body, access_id, author_kind, author_label, created_by
  )
  values (
    v_vorgang.organization_id, v_vorgang.id, 'person', v_text, v_zugang.id, v_zugang.access_kind,
    case when v_zugang.access_kind <> 'self' then v_zugang.representative_name end, auth.uid()
  )
  returning id into v_id;

  -- Die Praxis ist wieder am Zug. War sie es schon, bleibt die Frist.
  update public.platform_messages m
     set status = 'open',
         due_on = case when m.status = 'open' then m.due_on
                       else app.message_due_on(m.organization_id) end,
         last_entry_at = now()
   where m.id = v_vorgang.id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'message')
  );
  return v_id;
end;
$$;

revoke all on function public.add_platform_message_entry(uuid, uuid, text) from public, anon;
grant execute on function public.add_platform_message_entry(uuid, uuid, text) to authenticated;

comment on function public.add_platform_message_entry(uuid, uuid, text) is
  'KOM-001: zu einem offenen oder beantworteten Vorgang nachtragen (ANN-308). Die Praxis ist danach wieder am Zug; eine neue Frist nur, wenn sie schon geantwortet hatte (ANN-309).';

create function public.close_platform_message(p_access_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang  public.platform_accesses%rowtype;
  v_vorgang public.platform_messages%rowtype;
begin
  v_zugang := app.assert_platform_message(p_access_id);
  v_vorgang := app.platform_open_message(p_access_id, p_message_id);

  update public.platform_messages m
     set status = 'closed',
         due_on = null,
         closed_at = now(),
         closed_by = auth.uid(),
         closed_by_side = 'person'
   where m.id = v_vorgang.id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'message')
  );
end;
$$;

revoke all on function public.close_platform_message(uuid, uuid) from public, anon;
grant execute on function public.close_platform_message(uuid, uuid) to authenticated;

comment on function public.close_platform_message(uuid, uuid) is
  'KOM-001: einen Vorgang als erledigt markieren (ANN-308). Danach kein Nachtrag mehr; eine neue Frage ist ein neuer Vorgang.';

-- -----------------------------------------------------------------------------
-- 8. Die Projektion - feste Schluesselliste (ADR-023 Punkt 22)
--
-- Die Antwort steht als "Praxis", ohne Namen der Fachperson (wie UEB-009).
-- Wer auf der Seite der Person geschrieben hat: "you" (dieser Zugang),
-- "person" (die Person selbst) oder die Vertretung mit ihrem Namen.
-- -----------------------------------------------------------------------------
create function public.platform_messages(p_access_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zugang public.platform_accesses%rowtype;
begin
  if not app.platform_access_allows(p_access_id, 'read') then
    return null;
  end if;
  select * into v_zugang from public.platform_accesses a where a.id = p_access_id;

  perform app.log_platform_representation(
    v_zugang.id, 'platform_representation.read', jsonb_build_object('view', 'messages')
  );

  return jsonb_build_object(
    'response_workdays', (
      select o.message_response_workdays from public.organizations o
      where o.id = v_zugang.organization_id
    ),
    'can_write', app.platform_access_allows(p_access_id, 'message')
                 and app.platform_access_writable(p_access_id),
    'health_topics', app.platform_message_topic_allowed(
                       v_zugang.relationship_kind, v_zugang.relationship_id, 'complaint'),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'topic', m.topic,
        'reference_label', m.reference_label,
        'status', m.status,
        'due_on', m.due_on,
        'created_at', m.created_at,
        'last_entry_at', m.last_entry_at,
        'closed_at', m.closed_at,
        'closed_by_side', m.closed_by_side,
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id,
            'side', e.side,
            'body', e.body,
            'created_at', e.created_at,
            'author', case
              when e.side = 'practice' then 'practice'
              when e.access_id = p_access_id then 'you'
              when e.author_kind = 'self' then 'person'
              else 'representative'
            end,
            'author_label', case when e.side = 'person' then e.author_label end
          ) order by e.created_at, e.id)
          from public.platform_message_entries e
          where e.message_id = m.id
        ), '[]'::jsonb)
      ) order by (m.status = 'closed'), m.last_entry_at desc, m.id)
      from app.platform_visible_messages(p_access_id) m
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.platform_messages(uuid) from public, anon;
grant execute on function public.platform_messages(uuid) to authenticated;

comment on function public.platform_messages(uuid) is
  'KOM-001: Plattformprojektion "Nachrichten" (DSN-001 4.1): die Vorgaenge des Verhaeltnisses hinter einem lesbaren Zugang mit ihren Eintraegen, feste Schluesselliste (ADR-023 Punkt 22), dazu Antwortfrist, ob geschrieben werden darf und ob Gesundheitsthemen offenstehen. Ueber eine Vertretung protokolliert (Punkt 24). Ohne Recht null.';

-- -----------------------------------------------------------------------------
-- 9. Loeschlauf: Regel fuer die Klasse patientenkommunikation. Rumpf sonst
--    unveraendert aus 20261010110000_por_009_platform_appointment_requests.sql;
--    reapply_deletion_journal mit der Tabelle vor den Terminen.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_retention()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_steuer    integer;
  v_verhaelt  record;
  v_training  integer;
  v_termine   integer;
  v_audit     integer;
  v_auftraege integer;
  v_journal   integer;
  v_zugang    integer;
  v_fotos     integer;
  v_warte     integer;
  v_aufgaben  integer;
  v_anrufe    integer;
  v_konten    integer;
  v_plattform integer;
  v_wuensche  integer;
  v_nachrichten integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 1 (POR-002, ADR-023 Punkt 5, ANN-189): Konten beim
    -- Anmeldedienst, 30 Tage nach dem Ende des letzten Zugangs. VOR den
    -- Verhaeltnissen: Solange das Verhaeltnis steht, ist das Ende seines
    -- Zugangs das Ende der Lesefrist (DSN-001 D2) und nicht der Tag, an dem
    -- der Lauf das Verhaeltnis loescht.
    -- -------------------------------------------------------------------
    v_konten := app.delete_due_platform_accounts(v_org.id, v_run);

    -- -------------------------------------------------------------------
    -- Patientenfotos: zwoelf Monate ab Aufnahme, spaetestens drei Monate
    -- nach dem festgehaltenen Abschluss, Widerruf (ADR-017 Punkt 38).
    -- Ein Legal Hold haelt an.
    -- -------------------------------------------------------------------
    v_fotos := app.delete_due_patient_photos(v_org.id, null, v_run, null, 'retention');

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Versorgung
    -- -------------------------------------------------------------------
    for v_akte in
      select p.id,
             app.retention_due_at(
               p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
             ) as due_at
      from public.patients p
      where p.organization_id = v_org.id
        and p.care_concluded_on is not null
        and app.retention_due_at(
              p.care_concluded_on, app.retention_interval('patientenakte'), v_org.time_zone
            ) <= now()
      order by p.care_concluded_on
      for update of p skip locked
    loop
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      -- Neu mit ABR-003: Die steuerliche Frist einer ausgestellten Rechnung
      -- kann die zehn Jahre der Akte ueberdauern. Gesetzliche Aufbewahrung
      -- hat Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2).
      if app.billing_retention_due_at(v_akte.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Trainingsverhaeltnis: drei Jahre ab Vertragsende (ADR-021 Punkt 4)
    --
    -- Eigene Schleife und nicht ein Zweig der Akte: Die Frist ist kuerzer,
    -- der Anker ein anderer, und die Rechtsgrundlage traegt die
    -- Heilbehandlungs-Ausnahme nicht. Ohne Vertragsende laeuft keine Frist -
    -- ein laufendes Training wird nie geloescht.
    --
    -- KEIN LEGAL HOLD, UND ZWAR ABSICHTLICH: Loeschsperren stehen heute auf
    -- Patientenebene (ANN-033); ein Hold auf ein Trainingsverhaeltnis ist
    -- nicht darstellbar und waere hier eine Pruefung ohne Gegenstand. Wer
    -- eine Loeschung anhalten muss, raeumt bis dahin contract_ended_on - der
    -- Anker ist genau dafuer ruecknehmbar gebaut (LEI-001). Eine Sperre in
    -- der Behandlung wirkt nicht hierher: Der Hold haengt am Verhaeltnis
    -- (ADR-021), und die gemeinsame Person haelt sie ueber die Akte.
    --
    -- SKIP LOCKED wie bei der Akte: ein Verhaeltnis, an dem gerade jemand
    -- arbeitet, kommt im naechsten Lauf erneut dran.
    -- -------------------------------------------------------------------
    for v_verhaelt in
      select t.id,
             app.retention_due_at(
               t.contract_ended_on,
               app.retention_interval('trainingsverhaeltnis'),
               v_org.time_zone
             ) as due_at
      from public.training_relationships t
      where t.organization_id = v_org.id
        and t.contract_ended_on is not null
        and app.retention_due_at(
              t.contract_ended_on,
              app.retention_interval('trainingsverhaeltnis'),
              v_org.time_zone
            ) <= now()
      order by t.contract_ended_on
      for update of t skip locked
    loop
      -- TRN-008 (ANN-183): Die steuerliche Frist der Belege kann die drei
      -- Jahre des Verhaeltnisses ueberdauern. Gesetzliche Aufbewahrung hat
      -- Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2) - dieselbe
      -- Regel wie an der Akte.
      if app.training_billing_retention_due_at(v_verhaelt.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        -- Zweitreview: gehalten werden nur die Belege und was sie tragen;
        -- der Rest faellt nach den drei Jahren aus ADR-021 Punkt 4.
        v_training := v_training
          + app.reduce_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
        continue;
      end if;

      v_training := v_training
        + app.delete_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- Vorgang mit Gebuehrenanlass bleibt stehen: er ist die Grundlage
    -- einer Forderung (ANN-035, CAL-014b). Die mit der Abrechnung
    -- angekuendigte Bedingung "ohne Rechnung" ist damit erfuellt: Eine
    -- Rechnung kann nur an einem dokumentierten Termin oder an einem
    -- Gebuehrenanlass haengen, und beide nimmt die Abfrage bereits aus.
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc(
                  'year',
                  coalesce(a.cancelled_at, a.no_show_recorded_at) at time zone v_org.time_zone
                ) + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.fee_basis is null
        -- CAL-026: NUR Praxistermine. Ein Trainingstermin faellt mit seinem
        -- Verhaeltnis (oben) und nach dessen Frist - nicht hier. Zwei Gruende,
        -- und beide sind hart: Diese Frist rechnet ab Kalenderjahresende statt
        -- ab Vertragsende, und die Sperrpruefung darunter laeuft ueber
        -- a.patient_id, der am Trainingstermin leer ist - eine Sperre am
        -- Verhaeltnis haette die Zeile nicht gehalten (ADR-022, Konsequenzen).
        and a.kind <> 'training'
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show' and a.no_show_recorded_at is not null)
        )
        and not exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointments a
      using faellig f
      where a.id = f.id
        and f.due_at <= now()
      returning a.id, a.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointments', g.id, 'termin_ohne_nachweis', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_termine = row_count;

    -- -------------------------------------------------------------------
    -- Auditlog: drei Jahre ab dem Ereignis (ANN-029)
    -- -------------------------------------------------------------------
    -- LOG-EPIC-001: zwei Klassen (app.audit_retention_class), und ein Legal
    -- Hold haelt jede Zeile seiner Akte - ueber den Gegenstand oder
    -- context.patient_id, auch fuer zusammengefuehrte Doppelanlagen.
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval(app.audit_retention_class(a.action))
        and not app.audit_entry_held(v_org.id, a.subject_type, a.subject_id, a.context)
      returning a.id, a.organization_id, a.occurred_at, app.audit_retention_class(a.action) as klasse
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, g.klasse,
           g.occurred_at + app.retention_interval(g.klasse)
    from geloescht g;
    get diagnostics v_audit = row_count;

    -- -------------------------------------------------------------------
    -- Quittierte Loeschauftraege der Ablage: drei Jahre ab der Quittung
    -- (LOG-EPIC-001). Offene Auftraege bleiben. Nicht im Journal: Ein
    -- Auftrag ist selbst der Nachweis einer Loeschung, kein Fachdatensatz.
    -- -------------------------------------------------------------------
    delete from public.storage_deletion_orders o
    where o.organization_id = v_org.id
      and o.receipted_at is not null
      and o.receipted_at < now() - app.retention_interval('loeschauftrag');
    get diagnostics v_auftraege = row_count;

    -- -------------------------------------------------------------------
    -- Loeschjournal: 60 Tage ab der Loeschung (ADR-012: Backups 30 Tage,
    -- dazu 30 Tage Puffer). Zuletzt, damit die Eintraege dieses Laufs nicht
    -- mitfallen.
    -- -------------------------------------------------------------------
    delete from public.deletion_journal j
    where j.organization_id = v_org.id
      and j.deleted_at < now() - app.retention_interval('loeschjournal');
    get diagnostics v_journal = row_count;

    -- -------------------------------------------------------------------
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs (ANN-026)
    -- -------------------------------------------------------------------
    with faellig as (
      select i.id,
             i.organization_id,
             coalesce(
               i.accepted_at,
               i.revoked_at,
               case when i.status = 'pending' and i.expires_at <= now() then i.expires_at end
             ) + app.retention_interval('zugangseinladung') as due_at
      from public.staff_account_invitations i
      where i.organization_id = v_org.id
    ),
    geloescht as (
      delete from public.staff_account_invitations i
      using faellig f
      where i.id = f.id
        and f.due_at is not null
        and f.due_at <= now()
      returning i.id, i.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'staff_account_invitations', g.id, 'zugangseinladung', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_zugang = row_count;

    -- -------------------------------------------------------------------
    -- Warteliste: zwoelf Monate nach dem Schliessen (ANN-133). Offene
    -- Eintraege fallen nur mit der Akte. Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.closed_at + app.retention_interval('warteliste') as due_at
      from public.waitlist_entries w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.closed_at is not null
        and not app.under_legal_hold(v_org.id, 'patient', w.patient_id)
    ),
    geloescht as (
      delete from public.waitlist_entries w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'waitlist_entries', g.id, 'warteliste', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_warte = row_count;

    -- -------------------------------------------------------------------
    -- Aufgaben: zwoelf Monate nach dem Erledigen (ANN-142). Offene
    -- Aufgaben bleiben; mit Personenbezug fallen sie mit der Akte. Ein
    -- Legal Hold an der Akte haelt auch die erledigte Aufgabe.
    -- -------------------------------------------------------------------
    with faellig as (
      select k.id,
             k.organization_id,
             k.done_at + app.retention_interval('aufgabe') as due_at
      from public.tasks k
      where k.organization_id = v_org.id
        and k.status = 'done'
        and k.done_at is not null
        and (k.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', k.patient_id))
    ),
    geloescht as (
      delete from public.tasks k
      using faellig f
      where k.id = f.id
        and f.due_at <= now()
      returning k.id, k.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'tasks', g.id, 'aufgabe', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_aufgaben = row_count;

    -- -------------------------------------------------------------------
    -- Anrufstand: vierzehn Tage nach dem Termin (ANN-144). Ein "nicht
    -- erreicht" soll kein Merkmal der Person werden (§20, IDEA-PRX-041).
    -- -------------------------------------------------------------------
    with faellig as (
      select c.id,
             c.organization_id,
             a.starts_at + app.retention_interval('anrufstand') as due_at
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where c.organization_id = v_org.id
        -- Ein Legal Hold an der Akte haelt auch den Anrufstand (ADR-008
        -- Punkt 7, Zweitreview).
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointment_call_states c
      using faellig f
      where c.id = f.id
        and f.due_at <= now()
      returning c.id, c.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointment_call_states', g.id, 'anrufstand', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_anrufe = row_count;

    -- -------------------------------------------------------------------
    -- Terminwuensche der Plattform (POR-009, ANN-246): zwoelf Monate nach
    -- der Antwort der Praxis bzw. dem Zurueckziehen. Offene Wuensche
    -- bleiben; mit dem Verhaeltnis fallen sie ohnehin (cascade). Ein Legal
    -- Hold an der Akte haelt auch den beantworteten Wunsch.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.resolved_at + app.retention_interval('terminwunsch') as due_at
      from public.platform_appointment_requests w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.resolved_at is not null
        and (w.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', w.patient_id))
    ),
    geloescht as (
      delete from public.platform_appointment_requests w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_appointment_requests', g.id, 'terminwunsch', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_wuensche = row_count;

    -- -------------------------------------------------------------------
    -- Nachrichten der Behandlung (KOM-001, ADR-008 "Organisatorische
    -- Patientenkommunikation", ANN-001): drei Jahre ab Ende des
    -- Kalenderjahres, in dem der Vorgang abgeschlossen wurde: erledigt, oder
    -- beantwortet und danach nichts mehr von der Person (Anker: die letzte
    -- Antwort; Zweitreview S1, ANN-308). Offene bleiben; der Akte
    -- zugeordnete (KOM-004, ANN-312) fallen erst mit ihr; im Training fallen
    -- sie mit dem Verhaeltnis (cascade). Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select m.id,
             m.organization_id,
             app.retention_due_at(
               (date_trunc('year', coalesce(m.closed_at, m.last_entry_at)
                                     at time zone v_org.time_zone)
                 + interval '1 year' - interval '1 day')::date,
               app.retention_interval('patientenkommunikation'),
               v_org.time_zone
             ) as due_at
      from public.platform_messages m
      where m.organization_id = v_org.id
        and m.relationship_kind = 'treatment'
        and m.status in ('closed', 'answered')
        and m.record_assigned_at is null
        and not app.under_legal_hold(v_org.id, 'patient', m.patient_id)
    ),
    geloescht as (
      delete from public.platform_messages m
      using faellig f
      where m.id = f.id
        and f.due_at <= now()
      returning m.id, m.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_messages', g.id, 'patientenkommunikation', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_nachrichten = row_count;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 2 (POR-002, ANN-189): Zugaenge mit ihren Einladungen,
    -- drei Jahre nach ihrem Ende. Nach den Verhaeltnissen oben: Ein im
    -- selben Lauf geloeschtes Verhaeltnis hat seinen Zugang da schon beendet.
    -- -------------------------------------------------------------------
    v_plattform := app.delete_due_platform_accesses(v_org.id, v_run);

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte
                + v_aufgaben + v_anrufe + v_konten + v_plattform + v_wuensche + v_nachrichten;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal + v_wuensche + v_nachrichten > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenfoto', v_fotos,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'loeschauftrag', v_auftraege,
          'loeschjournal', v_journal,
          'zugangseinladung', v_zugang,
          'warteliste', v_warte,
          'aufgabe', v_aufgaben,
          'anrufstand', v_anrufe,
          'plattformkonto', v_konten,
          'plattformzugang', v_plattform,
          'terminwunsch', v_wuensche,
          'patientenkommunikation', v_nachrichten,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reapply_deletion_journal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reihenfolge text[] := array[
    'invoice_payment_reminders',
    'invoice_cancellations',
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'patient_files',
    -- Vor Grundlage und Termin: ein Eintrag zeigt auf beide (on delete set
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird
    -- (PRX-001, Zweitreview 5).
    'waitlist_entries',
    -- PRX-012: eine Aufgabe zeigt auf Person und Mitarbeitende (cascade
    -- beziehungsweise set null) - geloescht wird sie vorher.
    'tasks',
    -- TRN-009: das Trainingsprotokoll haengt am Termin (restrict) und faellt
    -- vor ihm - dieselbe Reihenfolge wie im Lauf.
    'training_protocols',
    -- PRX-014: der Anrufstand haengt am Termin und faellt vor ihm.
    'appointment_call_states',
    -- POR-009: ein Terminwunsch zeigt auf Termin (set null) und Verhaeltnis
    -- (cascade) - geloescht wird er vorher.
    'platform_appointment_requests',
    -- KOM-001: ein Vorgang zeigt auf Plan, Uebung (set null) und Akte
    -- (cascade); seine Eintraege fallen mit ihm.
    'platform_messages',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- TRN-EPIC-003 (Zweitreview): Kontaktdaten des Trainings aus der
    -- Teilloeschung. Ihr Schluessel ist das Verhaeltnis, nicht `id`.
    'training_contact_details',
    -- TRN-005: die Vereinbarung nach ihren Terminen (on delete set null) und
    -- vor ihrem Verhaeltnis (restrict) - dieselbe Reihenfolge wie im Lauf
    -- (app.delete_training_relationship). Fehlte seit CAL-026.
    'training_bases',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations',
    -- POR-002: der Zugang mit seinen Einladungen (on delete cascade) und das
    -- Konto beim Anmeldedienst. `auth_users` ist kein Tabellenname in
    -- public, sondern die eine Ausnahme unten.
    'platform_accesses',
    'auth_users'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Das Konto einer Plattform liegt beim Anmeldedienst (ADR-023 Punkt 5).
    -- ABN-011 (BEF-115): auch hier ueber die Admin-API. Was nach dem Restore
    -- wieder da ist, verliert sofort jeden Zugang und bekommt einen
    -- Loeschauftrag. Als erneut angewandt gilt der Journaleintrag erst mit
    -- der Bestaetigung (confirm_platform_account_deletion, Zweitreview B1).
    if v_tabelle = 'auth_users' then
      update public.platform_accesses a
         set status = 'revoked',
             revoked_at = coalesce(a.revoked_at, now()),
             revoked_by = null,
             revoked_reason = 'account_deleted',
             locked_at = null,
             locked_by = null
       where a.account_user_id = any (v_ids) and a.status <> 'revoked';

      perform app.order_platform_account_deletion(
        j.target_id, j.organization_id, null, j.due_at, 'reapply')
      from public.deletion_journal j
      join auth.users u on u.id = j.target_id
      where j.target_table = 'auth_users'
        and j.target_id = any (v_ids);
      v_geloescht := null;
    else
    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where %I = any($1) returning %I as id) select array_agg(id) from g',
      v_tabelle,
      app.deletion_key_column(v_tabelle),
      app.deletion_key_column(v_tabelle)
    )
    into v_geloescht
    using v_ids;
    end if;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  -- Die Wiederanwendung weist deletion_journal.reapplied_at nach (LOG-EPIC-001).

  return v_gesamt;
end;
$function$;
