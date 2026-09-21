-- =============================================================================
-- CAL-026: Kein Durchgriff ueber den gemeinsamen Kalender - bis auf die Belegung
--
-- Drei Dinge, die zusammengehoeren, weil sie dieselbe Grenze ziehen:
--
--   1. **Lesen** filtert nach Kontext (ADR-022 Punkt 11): Wer nur die
--      Trainingsrolle hat, liest keinen Behandlungstermin; wer nur die
--      Praxisrollen hat, liest keinen Trainingstermin. Was beide erfahren,
--      ist die BELEGUNG - Zeit und Mitarbeitende, nie der fremde Termin.
--   2. **Dokumentieren** bleibt der Behandlung vorbehalten (Punkt 6). Der
--      Riegel steht in der Datenbank, nicht in der Oberflaeche (ADR-004
--      Punkt 5), und er erreicht auch die automatische Finalisierung.
--   3. **Loeschen** geschieht je ZEILE am Kontext und nicht je Tabelle
--      (ADR-022, Konsequenzen). Eine Tabelle, drei Fristen: zehn Jahre an der
--      Akte, drei Jahre ab Vertragsende am Training, drei Jahre ab
--      Kalenderjahresende am Termin ohne Nachweis.
--
-- DIE FESTLEGUNG, DIE ADR-022 DEM LOOP MIT ADR-008 UEBERLAESST (offene
-- Folgefrage "zwei Fristen in einer Tabelle"): **eine Zuordnung je Kontext**,
-- keine neue Datenklasse "Kalender". `retention_assignments` traegt seit
-- LOE-001a mehrere Zeilen je Tabelle und nennt das ausdruecklich "kein
-- Modellfehler"; der dritte Kontext bekommt deshalb seine dritte Zeile und
-- nicht das Schedule eine neue Achse. Eine Klasse "Kalender" mit einer Regel,
-- die den Kontext liest, haette die Frist aus der Datenklasse in den
-- Programmcode verschoben - und `retention.test.ts` prueft die Zuordnung, nicht
-- den Code.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Leseregel an einer Stelle
--
-- Eine Funktion statt derselben Bedingung in Policy und drei Lesepfaden: Der
-- Kontext entscheidet, welche Rolle den Termin sieht, und diese Entscheidung
-- soll genau einmal im Schema stehen. Wer beide Zugehoerigkeiten hat (owner,
-- office), sieht beides - das ist keine Durchbrechung, sondern die Haeufung
-- zweier Rollen an einer Person, die PROJECT_PRINCIPLES.md §4.8 ausdruecklich
-- erlaubt. Verboten ist der SCHLUSS von einer Rolle auf den anderen Bereich,
-- und den macht keine der beiden Bedingungen.
-- -----------------------------------------------------------------------------
create function app.may_read_appointment_context(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'training' then app.can_read_training_relationships()
    else app.is_staff()
  end
$$;

comment on function app.may_read_appointment_context(text) is
  'Welche Rolle welchen Terminkontext lesen darf (ADR-022 Punkt 11). Behandlungstermin und internes Ereignis: die vier Praxisrollen. Trainingstermin: owner, trainer und office wie am Verhaeltnis (LEI-003). Ob die Trainingsrolle INTERNE Termine sieht, gehoert zum Rollenschnitt in E18 Schritt 5 - bis dahin gilt hier die engere Antwort.';

revoke all on function app.may_read_appointment_context(text) from public, anon;
grant execute on function app.may_read_appointment_context(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Policy auf dem Kalender (ADR-022 Punkt 11)
--
-- `appointments_select_staff_only` zeigte jeder Praxisrolle jeden Termin der
-- Organisation - was richtig war, solange jeder Termin entweder Behandlung
-- oder Ereignis war. Jetzt waere es der Durchgriff, den ADR-021 Punkt 6
-- verbietet.
-- -----------------------------------------------------------------------------
drop policy appointments_select_staff_only on public.appointments;

create policy appointments_select_by_context
  on public.appointments for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.may_read_appointment_context(kind)
  );

comment on policy appointments_select_by_context on public.appointments is
  'Ein Kalender, drei Kontexte, kein Durchgriff (ADR-022 Punkt 11). Die Belegung bleibt gemeinsam - sie entsteht aus der EXCLUDE-Constraint und nicht aus dieser Policy.';

-- -----------------------------------------------------------------------------
-- 3. Die Lesepfade ziehen nach
--
-- SECURITY DEFINER umgeht RLS. Die Policy allein liesse den Trainingstermin
-- also weiterhin in jeder Tagesliste stehen - genau der Mehraufwand je
-- Feature, den ADR-022 ankuendigt ("Jede Kalenderabfrage, jede Tagesliste und
-- jede Projektion muss sich entscheiden, welchen Kontext sie meint").
--
-- Unveraendert aus den jeweils letzten Fassungen bis auf die eine Zeile
-- `app.may_read_appointment_context(a.kind)`. PostgreSQL kennt kein
-- teilweises Ersetzen einer Funktion.
--
-- NICHT geaendert: `list_staff_future_appointments`. Sie beantwortet beim
-- Deaktivieren eines Zugangs die Frage "was haengt an dieser Person noch?" -
-- also genau die Belegung, die Punkt 11 ausdruecklich gemeinsam laesst. Wuerde
-- sie den Trainingstermin ausblenden, bliebe er beim Deaktivieren unbemerkt
-- stehen. Personenfelder und Titel sind am Trainingstermin leer; sie nennt
-- damit Zeit und Mitarbeitende und nichts darueber hinaus.
-- -----------------------------------------------------------------------------
create or replace function public.list_appointments(
  p_from            date,
  p_to              date,
  p_staff_member_id uuid default null,
  p_location_id     uuid default null,
  p_status          text default 'active'
)
returns table (
  id uuid, patient_id uuid, staff_member_id uuid, location_id uuid,
  appointment_type text, kind text, title text, status text,
  starts_at timestamptz, ends_at timestamptz,
  patient_given_name text, patient_family_name text,
  staff_given_name text, staff_family_name text, location_name text
)
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

  if not app.can_read_appointments() then
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

  if p_status is null
     or p_status not in (
       'confirmed', 'cancelled', 'no_show', 'completed', 'documented', 'invoiced',
       'active', 'done', 'all'
     ) then
    raise exception 'unknown status filter' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  v_start := (p_from::timestamp) at time zone v_tz;
  v_end   := (p_to::timestamp)   at time zone v_tz;

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.location_id,
      a.appointment_type,
      a.kind,
      a.title,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      sp.given_name,
      sp.family_name,
      l.name
    from public.appointments a
    left join public.patients p  on p.id  = a.patient_id
    left join public.persons pp  on pp.id = p.person_id
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    left join public.locations l on l.id  = a.location_id
    where a.organization_id = v_org
      and app.may_read_appointment_context(a.kind)
      and a.starts_at >= v_start
      and a.starts_at <  v_end
      and (p_staff_member_id is null or a.staff_member_id = p_staff_member_id)
      and (p_location_id     is null or a.location_id     = p_location_id)
      and (
        p_status = 'all'
        or (p_status = 'active' and a.status <> 'cancelled')
        or (p_status = 'done'   and a.status in ('completed', 'documented', 'invoiced'))
        or a.status = p_status
      )
    order by a.starts_at, sp.family_name, sp.given_name, a.id;
end;
$$;

create or replace function public.list_day_plan(p_date date, p_staff_member_id uuid)
returns table (
  id uuid, patient_id uuid, staff_member_id uuid, appointment_type text, kind text,
  title text, status text, starts_at timestamptz, ends_at timestamptz,
  patient_given_name text, patient_family_name text, location_name text,
  visit_street text, visit_house_number text, visit_postal_code text, visit_city text,
  patient_phone text, patient_phone_mobile text,
  home_visit_access_note text, special_note text,
  documentation_status text, organization_time_zone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org           uuid;
  v_tz            text;
  v_start         timestamptz;
  v_end           timestamptz;
  v_darf_nachweis boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Derselbe Schnitt wie beim Kalender: die Tagesliste ist eine
  -- andere Darstellung derselben Termine, kein zweites Recht.
  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_date is null or p_staff_member_id is null then
    raise exception 'date and staff member are required' using errcode = '22023';
  end if;

  select o.time_zone into v_tz
  from public.organizations o
  where o.id = v_org;

  if v_tz is null then
    raise exception 'organization has no time zone' using errcode = '22023';
  end if;

  -- Halboffenes Fenster [Tag 00:00, Folgetag 00:00) in der Zeitzone der Praxis
  -- - dieselbe Auslegung wie in list_appointments und create_appointment.
  v_start := (p_date::timestamp) at time zone v_tz;
  v_end   := ((p_date + 1)::timestamp) at time zone v_tz;

  v_darf_nachweis := app.can_read_treatment_evidence();

  return query
    select
      a.id,
      a.patient_id,
      a.staff_member_id,
      a.appointment_type,
      a.kind,
      a.title,
      a.status,
      a.starts_at,
      a.ends_at,
      pp.given_name,
      pp.family_name,
      l.name,
      a.visit_street,
      a.visit_house_number,
      a.visit_postal_code,
      a.visit_city,
      pc.phone,
      pc.phone_mobile,
      -- Zweckbindung: der Zugangshinweis beschreibt die Wohnungstuer. Zu
      -- einem Praxis- oder Videotermin hat er keinen Zweck.
      case when a.appointment_type = 'home_visit' then care.home_visit_access_note end,
      case when a.appointment_type = 'home_visit' then care.special_note end,
      -- ANN-006: Dokumentationsstand ohne Inhalt. Leer, wenn die Rolle den
      -- Behandlungsnachweis nicht lesen darf - eine falsche Angabe waere
      -- schlimmer als keine. An einem Ereignis ebenfalls leer: Dort gibt es
      -- keine Dokumentation, und 'none' hiesse "fehlt noch" (CAL-016). Am
      -- Trainingstermin gilt dasselbe, und zwar dauerhaft (ADR-022 Punkt 6).
      case when v_darf_nachweis and a.kind = 'treatment' then coalesce(t.status, 'none') end,
      v_tz
    from public.appointments a
    left join public.patients p        on p.id  = a.patient_id
    left join public.persons pp        on pp.id = p.person_id
    left join public.locations l  on l.id  = a.location_id
    left join public.patient_contact_details pc on pc.patient_id = a.patient_id
    left join public.patient_care_details care  on care.patient_id = a.patient_id
    left join public.treatment_notes t
           on t.appointment_id = a.id
          and t.addendum_to_note_id is null
    where a.organization_id  = v_org
      and app.may_read_appointment_context(a.kind)
      and a.staff_member_id  = p_staff_member_id
      and a.starts_at       >= v_start
      and a.starts_at        < v_end
    order by a.starts_at, a.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Der Dokumentationsriegel bekommt seinen dritten Zweig (ADR-022 Punkt 6)
--
-- Die Dokumentationspflicht aus Par. 630f BGB gilt fuer die BEHANDLUNG. Ein
-- Eintrag nach ADR-016 entsteht nur am Behandlungstermin.
--
-- Der Riegel sitzt an der Tabelle und nicht im Schreibweg. `CAL-015b` hat ihn
-- in `create_treatment_note` gelegt, wo er das Ereignis abfaengt; ein zweiter
-- Zweig an derselben Stelle haette denselben Riegel ein drittes Mal zu pflegen
-- gegeben (Nachtrag, spaetere Schreibwege, der Trainingsbereich). An der
-- Tabelle gilt er fuer JEDEN Schreibweg, auch fuer den, den es noch nicht
-- gibt - und das ist die Zusage aus Punkt 6: "durchgesetzt wird das in der
-- Datenbank, nicht in der Oberflaeche".
-- -----------------------------------------------------------------------------
create function public.treatment_notes_context_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
begin
  select a.kind into v_kind
  from public.appointments a
  where a.id = new.appointment_id;

  if v_kind is distinct from 'treatment' then
    raise exception 'only a treatment appointment can be documented'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.treatment_notes_context_guard() is
  'Par. 630f BGB gilt fuer die Behandlung: ein Dokumentationseintrag entsteht nur am Behandlungstermin (ADR-022 Punkt 6, ADR-016). Das Trainingsprotokoll ist kein Eintrag in diesem Sinne und haengt am Verhaeltnis, nicht am Termin (Punkt 7).';

create trigger treatment_notes_context_guard
  before insert on public.treatment_notes
  for each row execute function public.treatment_notes_context_guard();

-- Die automatische Finalisierung erreicht einen Trainingstermin "unter keinen
-- Umstaenden" (Punkt 6). Sie erreicht ihn schon ueber den Riegel oben nicht,
-- weil es keinen Entwurf an ihm geben kann; die Bedingung hier sagt es
-- ausdruecklich und kostet nichts. Unveraendert aus
-- 20260904120000_treatment_note_auto_finalisation.sql bis auf diese Zeile.
create or replace function public.finalize_overdue_treatment_notes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note  record;
  v_count integer := 0;
begin
  for v_note in
    select t.id,
           t.organization_id,
           t.appointment_id,
           t.content,
           t.updated_by,
           a.patient_id,
           app.documentation_deadline(
             a.starts_at, t.created_at, o.time_zone, o.documentation_auto_finalize_days
           ) as due_at
    from public.treatment_notes t
    join public.appointments a   on a.id = t.appointment_id
    join public.organizations o  on o.id = t.organization_id
    where t.status = 'draft'
      and a.kind = 'treatment'
      and app.documentation_deadline(
            a.starts_at, t.created_at, o.time_zone, o.documentation_auto_finalize_days
          ) <= now()
    order by t.created_at
    for update of t skip locked
  loop
    update public.treatment_notes
       set status            = 'final',
           finalisation_kind = 'automatic',
           finalized_at      = now(),
           finalized_by      = null,
           updated_at        = now()
     where id = v_note.id;

    insert into public.treatment_note_versions (
      organization_id, note_id, version_no, content, change_reason, author_id
    )
    values (
      v_note.organization_id, v_note.id, 1, v_note.content, null, v_note.updated_by
    );

    insert into public.audit_log (
      organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
    )
    values (
      v_note.organization_id, null, 'system', 'treatment_note.auto_finalized',
      'treatment_note', v_note.id, 'success',
      jsonb_build_object(
        'surface', 'scheduler',
        'appointment_id', v_note.appointment_id,
        'patient_id', v_note.patient_id,
        'due_at', v_note.due_at
      )
    );

    perform app.mark_appointment_documented(v_note.appointment_id, null);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Der Gebuehrenanlass bleibt bei der Behandlung
--
-- ADR-022 Punkt 8: ADR-018 gilt fuer `therapy` und `training` gleichermassen -
-- ein Trainingstermin kann abgesagt, nicht angetroffen und abgeschlossen
-- werden. Was NICHT mitgilt, ist der Gebuehrenanlass: Ob die Absage unter 24
-- Stunden auch im Dienstvertrag ueber Training einen Anspruch begruendet, ist
-- eine Vertrags- und AGB-Frage des Projektinhabers (offene Folgefrage in
-- ADR-022); bis sie beantwortet ist, gilt ADR-018 Punkt 8 weiter nur fuer die
-- Behandlung. `appointments_fee_basis_values` sagt das seit CAL-015b.
--
-- `record_no_show` haette das gebrochen: Sie setzt den Anlass an JEDEM
-- Hausbesuch, und Personal Training zu Hause ist einer (ADR-022 Punkt 9).
-- Der Vermerk waere an einer Constraint gescheitert, die eine ganz andere
-- Sprache spricht. Unveraendert aus 20260912200000_cancellation_notice.sql bis
-- auf diesen einen Zweig.
--
-- `cancel_appointment` braucht dieselbe Aenderung nicht: Sie prueft
-- `kind = 'treatment'` bereits, seit es das Ereignis gibt.
-- -----------------------------------------------------------------------------
create or replace function public.record_no_show(
  p_appointment_id      uuid,
  p_expected_updated_at timestamptz,
  p_protocol_confirmed  boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_alt      record;
  v_protokoll boolean;
  v_anlass   text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_no_show() then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to record no-shows' using errcode = '42501';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected updated_at is required' using errcode = '22023';
  end if;

  select a.id, a.patient_id, a.staff_member_id, a.status, a.kind,
         a.appointment_type, a.updated_at
    into v_alt
  from public.appointments a
  where a.id = p_appointment_id
    and a.organization_id = v_org
  for update;

  if not found then
    raise exception 'appointment not found' using errcode = 'P0002';
  end if;

  if v_alt.kind = 'event' then
    raise exception 'event cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'cancelled' then
    raise exception 'cancelled appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status = 'no_show' then
    raise exception 'appointment is already recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.status <> 'confirmed' then
    raise exception 'completed appointment must be reopened first' using errcode = '22023';
  end if;

  -- Wo dokumentiert wurde, hat eine Behandlung stattgefunden. Der Vermerk
  -- waere ein Widerspruch zum Nachweis - und wuerde die Invariante aus
  -- ADR-018 Punkt 3 aushebeln.
  if exists (
    select 1 from public.treatment_notes t where t.appointment_id = p_appointment_id
  ) then
    raise exception 'documented appointment cannot be recorded as no-show' using errcode = '22023';
  end if;

  if v_alt.kind <> 'treatment' then
    -- Der Trainingstermin: Vermerk ja, Forderung nein. Das Protokoll aus
    -- ANN-055 traegt den Anlass; ohne Anlass hat es nichts zu bestaetigen.
    if p_protocol_confirmed is true then
      raise exception 'no-show protocol applies to treatment appointments only'
        using errcode = '22023';
    end if;
    v_protokoll := false;
    v_anlass    := null;

  -- Das Protokoll ist ein Hausbesuchsprotokoll (ANN-055). An der Praxistuer
  -- gibt es nichts zu klingeln, und eine Bestaetigung, die niemand geben
  -- kann, waere hier die Grundlage einer Forderung.
  elsif v_alt.appointment_type = 'home_visit' then
    if p_protocol_confirmed is not true then
      raise exception 'no-show protocol must be confirmed for home visits'
        using errcode = '22023';
    end if;
    v_protokoll := true;
    v_anlass    := 'no_show';
  else
    if p_protocol_confirmed is true then
      raise exception 'no-show protocol applies to home visits only'
        using errcode = '22023';
    end if;
    v_protokoll := false;
    v_anlass    := null;
  end if;

  if v_alt.updated_at is distinct from p_expected_updated_at then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  update public.appointments
     set status                    = 'no_show',
         no_show_recorded_at       = now(),
         no_show_recorded_by       = v_actor,
         no_show_protocol_confirmed = v_protokoll,
         fee_basis                 = v_anlass,
         updated_at                = now()
   where id = p_appointment_id
     and updated_at = p_expected_updated_at
     and status = 'confirmed';

  if not found then
    raise exception 'appointment was changed meanwhile' using errcode = '40001';
  end if;

  -- Das Protokoll steht im Kontext, weil es eine Forderung begruendet
  -- (ADR-010). Kein klinischer Inhalt: Dass niemand geoeffnet hat, ist eine
  -- organisatorische Feststellung.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'appointment.no_show', 'appointment', p_appointment_id, 'success',
    jsonb_build_object(
      'surface', 'web',
      'patient_id', v_alt.patient_id,
      'staff_member_id', v_alt.staff_member_id,
      'protocol_confirmed', v_protokoll,
      'fee_basis', v_anlass
    )
  );

  return p_appointment_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Loeschung je Zeile am Kontext (ADR-022, Konsequenzen)
--
-- Die dritte Zuordnung derselben Tabelle. `retention_assignments` sieht
-- mehrere Zeilen je Tabelle seit LOE-001a ausdruecklich vor.
-- -----------------------------------------------------------------------------
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values

  ('appointments', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Trainingstermine (kind = training). Fallen mit dem Trainingsverhaeltnis und nach eigener Frist - nicht mit der Patientenakte und nicht nach der Frist fuer Termine ohne Nachweis (ADR-022, Konsequenzen). Werden im Lauf vor dem Verhaeltnis geloescht (FK restrict).', 57);

-- -----------------------------------------------------------------------------
-- 7. Der Loeschlauf liest den Kontext
--
-- ZWEI Stellen, und die erste ist die stillere:
--
--   a) Die Regel `termin_ohne_nachweis` haette den abgesagten Trainingstermin
--      mitgenommen - nach der FALSCHEN Frist (drei Jahre ab Kalenderjahresende
--      statt ab Vertragsende) und am LEGAL HOLD VORBEI: Sie prueft die Sperre
--      ueber `a.patient_id`, und der ist am Trainingstermin leer. Eine Sperre
--      am Trainingsverhaeltnis haette die Zeile nicht gehalten. Genau das ist
--      "zwei Fristen in einer Tabelle", und genau deshalb steht der Kontext
--      jetzt in der Bedingung.
--
--   b) `app.delete_training_relationship` raeumt die Termine und die Klammern
--      des Verhaeltnisses, bevor sie das Verhaeltnis selbst raeumt - sonst
--      scheitert sie am Fremdschluessel (restrict) und der Lauf bliebe still
--      stehen.
--
-- Unveraendert aus 20260920131000_training_retention.sql bis auf diese beiden
-- Aenderungen.
-- -----------------------------------------------------------------------------
create or replace function app.delete_training_relationship(
  p_relationship_id uuid,
  p_run_id          uuid,
  p_due_at          timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_count  integer := 0;
  v_n      integer;
begin
  select t.person_id
    into v_person
  from public.training_relationships t
  where t.id = p_relationship_id;

  if not found then
    return 0;
  end if;

  -- Die Termine des Verhaeltnisses. Sie tragen keinen Behandlungsnachweis und
  -- koennen keinen tragen (ADR-022 Punkt 6); `appointment_notifications`
  -- faellt per Kaskade mit.
  with geloescht as (
    delete from public.appointments a
     where a.training_relationship_id = p_relationship_id
    returning a.id, a.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'appointments', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.training_bases b
     where b.training_relationship_id = p_relationship_id
    returning b.id, b.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_bases', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  with geloescht as (
    delete from public.training_relationships t
     where t.id = p_relationship_id
    returning t.id, t.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'training_relationships', g.id, 'trainingsverhaeltnis', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  -- Dieselben vier Verweise wie in der Akte, und aus demselben Grund: Die
  -- Person gehoert keinem der beiden Bereiche, sie wird von beiden benutzt.
  with geloescht as (
    delete from public.persons pe
     where pe.id = v_person
       and not exists (select 1 from public.patients x               where x.person_id = pe.id)
       and not exists (select 1 from public.staff_members x          where x.person_id = pe.id)
       and not exists (select 1 from public.user_profiles x          where x.person_id = pe.id)
       and not exists (select 1 from public.training_relationships x where x.person_id = pe.id)
    returning pe.id, pe.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run_id, 'persons', g.id, 'personenstammdaten', p_due_at
  from geloescht g;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

comment on function app.delete_training_relationship(uuid, uuid, timestamptz) is
  'Loescht ein faelliges Trainingsverhaeltnis samt seinen Terminen und Klammern, Kinder vor Eltern (LEI-002, CAL-026). Die gemeinsame persons-Zeile faellt nur, wenn kein Verhaeltnis und kein Konto mehr auf sie zeigt (ADR-008 Punkt 9).';

create or replace function public.apply_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $BODY$
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
  v_zugang    integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

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
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval('auditlog')
        and not (
          a.subject_type = 'patient'
          and app.under_legal_hold(v_org.id, 'patient', a.subject_id)
        )
      returning a.id, a.organization_id, a.occurred_at
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, 'auditlog',
           g.occurred_at + app.retention_interval('auditlog')
    from geloescht g;
    get diagnostics v_audit = row_count;

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

    v_gesamt := v_gesamt + v_akten + v_training + v_termine + v_audit + v_zugang;

    if v_akten + v_training + v_termine + v_audit + v_zugang > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'zugangseinladung', v_zugang,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$BODY$;
