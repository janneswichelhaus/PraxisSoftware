-- =============================================================================
-- OUT-002 (OUT-EPIC-001): Assessments im Training - Protokoll und Wiedervorlage
--
-- IDEA-OUT-007: Ein Assessment ist eine Testbatterie mit festem Ablauf -
-- Messbedingungen, Ergebnisfelder, Seitenvergleich - und einer geplanten
-- Wiederholung. Ein Test ohne festgehaltene Bedingungen ist nicht
-- vergleichbar, einer ohne Wiederholung eine Momentaufnahme.
--
--   public.training_assessments          ein durchgefuehrtes Assessment
--   public.training_assessment_results   seine Ergebnisse, je Messung eine Zeile
--   public.record_training_assessment    festhalten (mit Ergebnissen)
--   public.remove_training_assessment    aus dem Verlauf nehmen, nachvollziehbar
--   public.get_training_assessments      lesen fuer die Trainingsseite
--
-- ANZEIGEN UND AUFZEICHNEN, NICHT BEWERTEN (ADR-006 Punkte 2, 11, 13): Der
-- Seitenvergleich ist eine Division, die die Oberflaeche offen rechnet; ein
-- Schwellenwert, eine Freigabe oder eine Einordnung entsteht nicht - sie
-- gehoeren der Betreuung (IDEA-TRN-008, ANN-365).
--
-- Wer: wie die Plaene im Training (app.can_read_exercise_plans /
-- app.can_write_exercise_plans, ANN-298): lesen owner, trainer und das Buero
-- (ADR-021 Punkt 10), festhalten owner und trainer. Testergebnisse sind
-- Gesundheitsangaben: nur mit Einwilligung (ADR-021 Punkt 4, ANN-365).
-- Protokoll (ADR-010 Fassung 3): Lesen als Oeffnen des Trainingsverhaeltnisses
-- (view: assessments); Schreiben weist das Datenmodell nach.
-- =============================================================================

create table public.training_assessments (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  training_relationship_id uuid not null
                             references public.training_relationships (id) on delete cascade,
  -- Der Name der Testbatterie; mit ihm findet die Wiederholung die vorige.
  title                    text not null check (length(btrim(title)) between 1 and 80),
  performed_on             date not null check (performed_on >= date '1900-01-01'),
  -- Messbedingungen: Geraet, Aufwaermen, Position, Uhrzeit (IDEA-OUT-007).
  conditions               text check (conditions is null or length(btrim(conditions)) between 1 and 500),
  -- Die geplante Wiederholung (Wiedervorlage).
  next_due_on              date,
  created_at               timestamptz not null default now(),
  created_by               uuid not null,
  removed_at               timestamptz,
  removed_by               uuid,
  constraint training_assessments_removed_pair
    check ((removed_at is null) = (removed_by is null)),
  constraint training_assessments_due_after
    check (next_due_on is null or next_due_on > performed_on)
);

comment on table public.training_assessments is
  'OUT-002 (IDEA-OUT-007, ANN-365): durchgefuehrte Assessments im Training mit Messbedingungen und geplanter Wiederholung. Anzeigen und aufzeichnen, nicht bewerten (ADR-006 Punkt 13). Gesundheitsangabe, nur mit Einwilligung. Kein direkter Zugriff, nur ueber die Funktionen. Datenklasse: Trainingsverhaeltnis.';

create index training_assessments_relationship_idx
  on public.training_assessments (training_relationship_id, performed_on);

create table public.training_assessment_results (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  assessment_id   uuid not null references public.training_assessments (id) on delete cascade,
  position        smallint not null check (position between 1 and 20),
  -- Was gemessen wurde, etwa "Einbeinsprung weit".
  label           text not null check (length(btrim(label)) between 1 and 80),
  unit            text check (unit is null or length(btrim(unit)) between 1 and 20),
  -- Entweder ein Wert oder beide Seiten (Seitenvergleich).
  value           numeric(9, 2),
  value_left      numeric(9, 2),
  value_right     numeric(9, 2),
  constraint training_assessment_results_one_or_sides check (
    (value is not null and value_left is null and value_right is null)
    or (value is null and value_left is not null and value_right is not null)
  ),
  unique (assessment_id, position)
);

comment on table public.training_assessment_results is
  'OUT-002 (IDEA-OUT-007): die Ergebnisse eines Assessments im Training, je Messung eine Zeile - ein Wert oder links und rechts. Unveraendert, ohne Einordnung. Datenklasse: Trainingsverhaeltnis, faellt mit dem Assessment.';

alter table public.training_assessments enable row level security;
alter table public.training_assessment_results enable row level security;
revoke all on public.training_assessments from public, anon, authenticated;
revoke all on public.training_assessment_results from public, anon, authenticated;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('training_assessments', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Assessments im Training mit Messbedingungen und Wiedervorlage (OUT-002), auch entfernte. Gesundheitsangaben mit Einwilligung; fallen mit dem Trainingsverhaeltnis (FK on delete cascade).', 57),
  ('training_assessment_results', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Ergebnisse eines Assessments im Training (OUT-002). Fallen mit dem Assessment.', 57);

-- -----------------------------------------------------------------------------
-- Festhalten
--
-- p_results: [{"label": "...", "unit": "cm", "value": 12}
--             | {"label": "...", "unit": "kg", "left": 32, "right": 40}, ...]
-- Eine bis zwanzig Messungen; die Reihenfolge ist die der Liste.
-- -----------------------------------------------------------------------------
create function public.record_training_assessment(
  p_relationship_id uuid,
  p_title           text,
  p_performed_on    date,
  p_conditions      text,
  p_next_due_on     date,
  p_results         jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_rel   record;
  v_id    uuid;
  v_n     integer;
begin
  if v_actor is null or not app.can_write_exercise_plans('training') then
    raise exception 'not allowed to record assessments' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  select * into v_rel from app.checkin_relationship('training', p_relationship_id, v_org);
  if v_rel.area is null then
    raise exception 'relationship not found' using errcode = 'P0002';
  end if;
  if not v_rel.is_open then
    raise exception 'relationship has ended' using errcode = '22023';
  end if;
  -- ANN-365: Testergebnisse sind Gesundheitsangaben.
  if not app.training_health_consent(p_relationship_id) then
    raise exception 'health data consent missing' using errcode = '42501';
  end if;
  if p_performed_on is null then
    raise exception 'date is required' using errcode = '22023';
  end if;
  if p_performed_on > app.training_today(v_org) then
    raise exception 'assessment date in the future' using errcode = '22023';
  end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception 'results invalid' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_results);
  if v_n not between 1 and 20 then
    raise exception 'results invalid' using errcode = '22023';
  end if;
  -- Jede Messung ist ein Objekt mit Zahlen, wo Zahlen stehen; was sonst
  -- darin steht, faellt weg.
  if exists (
    select 1 from jsonb_array_elements(p_results) r
    where jsonb_typeof(r) <> 'object'
       or coalesce(jsonb_typeof(r -> 'label'), '') <> 'string'
       or (r ? 'unit' and jsonb_typeof(r -> 'unit') not in ('string', 'null'))
       or (r ? 'value' and jsonb_typeof(r -> 'value') not in ('number', 'null'))
       or (r ? 'left' and jsonb_typeof(r -> 'left') not in ('number', 'null'))
       or (r ? 'right' and jsonb_typeof(r -> 'right') not in ('number', 'null'))
  ) then
    raise exception 'results invalid' using errcode = '22023';
  end if;

  -- Titel, Bedingungen, Wiedervorlage pruefen die Constraints der Tabelle.
  insert into public.training_assessments (
    organization_id, training_relationship_id, title, performed_on, conditions, next_due_on,
    created_by
  )
  values (
    v_org, p_relationship_id, btrim(p_title), p_performed_on, nullif(btrim(p_conditions), ''),
    p_next_due_on, v_actor
  )
  returning id into v_id;

  insert into public.training_assessment_results (
    organization_id, assessment_id, position, label, unit, value, value_left, value_right
  )
  select v_org, v_id, r.ordinality::smallint, btrim(r.value ->> 'label'),
         nullif(btrim(r.value ->> 'unit'), ''),
         (r.value ->> 'value')::numeric, (r.value ->> 'left')::numeric,
         (r.value ->> 'right')::numeric
  from jsonb_array_elements(p_results) with ordinality r;

  return v_id;
end;
$$;

revoke all on function public.record_training_assessment(uuid, text, date, text, date, jsonb) from public, anon;
grant execute on function public.record_training_assessment(uuid, text, date, text, date, jsonb) to authenticated;

comment on function public.record_training_assessment(uuid, text, date, text, date, jsonb) is
  'OUT-002 (IDEA-OUT-007, ANN-365): haelt ein Assessment im offenen Trainingsverhaeltnis fest - Titel, Tag (nicht in der Zukunft), Messbedingungen, geplante Wiederholung und 1 bis 20 Messungen mit einem Wert oder beiden Seiten. Wer: app.can_write_exercise_plans(training); nur mit Einwilligung zu Gesundheitsangaben. Der Schreibvorgang steht am Datensatz (created_by, ADR-010 Fassung 3).';

create function public.remove_training_assessment(p_assessment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
begin
  if v_actor is null or not app.can_write_exercise_plans('training') then
    raise exception 'not allowed to remove assessments' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  update public.training_assessments a
     set removed_at = now(), removed_by = v_actor
   where a.id = p_assessment_id
     and a.organization_id = v_org
     and a.removed_at is null;
  if not found then
    raise exception 'assessment not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.remove_training_assessment(uuid) from public, anon;
grant execute on function public.remove_training_assessment(uuid) to authenticated;

comment on function public.remove_training_assessment(uuid) is
  'OUT-002 (ANN-365): nimmt ein falsch festgehaltenes Assessment aus dem Verlauf; Inhalt, Urheber und wer entfernt hat bleiben am Datensatz. Wer: app.can_write_exercise_plans(training).';

-- -----------------------------------------------------------------------------
-- Lesen
-- -----------------------------------------------------------------------------
create function public.get_training_assessments(p_relationship_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_rel   record;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_exercise_plans('training') then
    perform app.record_denied_read(v_actor, 'assessments.read', 'not allowed to read assessments');
    return null;
  end if;
  v_org := app.current_organization_id();
  select * into v_rel from app.checkin_relationship('training', p_relationship_id, v_org);
  if v_rel.area is null then
    return null;
  end if;

  perform app.log_record_access(
    v_org, v_actor, 'training_relationship.viewed', 'training_relationship', p_relationship_id,
    'user', jsonb_build_object('surface', 'web', 'view', 'assessments'));

  return jsonb_build_object(
    'today', app.training_today(v_org),
    'can_write', app.can_write_exercise_plans('training'),
    'relationship_open', v_rel.is_open,
    'health_consent', app.training_health_consent(p_relationship_id),
    -- Juengstes zuerst.
    'assessments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id,
               'title', a.title,
               'performed_on', a.performed_on,
               'conditions', a.conditions,
               'next_due_on', a.next_due_on,
               'created_by_name', up.display_name,
               'results', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'label', r.label, 'unit', r.unit, 'value', r.value,
                          'left', r.value_left, 'right', r.value_right
                        ) order by r.position), '[]'::jsonb)
                 from public.training_assessment_results r
                 where r.assessment_id = a.id
               )
             ) order by a.performed_on desc, a.created_at desc)
      from public.training_assessments a
      left join public.user_profiles up on up.id = a.created_by
      where a.training_relationship_id = p_relationship_id
        and a.organization_id = v_org
        and a.removed_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_training_assessments(uuid) from public, anon;
grant execute on function public.get_training_assessments(uuid) to authenticated;

comment on function public.get_training_assessments(uuid) is
  'OUT-002 (IDEA-OUT-007, ANN-365): die Assessments eines Trainingsverhaeltnisses mit Messbedingungen, Wiedervorlage und Ergebnissen, unveraendert und ohne Einordnung. Lesen wie die Plaene im Training (owner, trainer, office), protokolliert als Oeffnen des Trainingsverhaeltnisses (view: assessments). Ohne Recht null und eine Abweisung im Protokoll.';
