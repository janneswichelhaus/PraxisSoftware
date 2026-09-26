-- =============================================================================
-- Therapiebericht an die Verordner:in (DOK-005, Story DOK-005a)
--
-- Zu einer Verordnung schreibt die Therapeut:in einen Bericht. Die Anwendung
-- uebernimmt dafuer woertlich, was schon in der Akte steht - Verordnung,
-- angekreuzte Dokumentationseintraege, das Koerperschema einer Erhebung - und
-- fuegt nichts hinzu (PROJECT_PRINCIPLES.md §17, ADR-006 Punkt 2 und 4).
--
--   * GESPEICHERT, NICHT NUR GEDRUCKT (ANN-121). Was an die Verordner:in
--     ging, muss spaeter nachweisbar sein (§630f BGB). Ein Bericht hat zwei
--     Zustaende: `entwurf` (frei aenderbar, verwerfbar) und `abgeschlossen`
--     (eingefroren als Snapshot, unveraenderlich; eine Korrektur ist ein
--     neuer Bericht) - dasselbe Muster wie der Rechnungs-Snapshot (ANN-077).
--   * AUSWAHL DURCH DEN MENSCHEN (ANN-122). Welche Eintraege und welches
--     Koerperschema in den Bericht gehen, kreuzt die Therapeut:in an; nichts
--     ist vorbelegt. Eigener Text und die Empfehlung zum Verordnungsende
--     stehen mit Verfasser:in und Datum da - die "Quelle und Datum" aus der
--     Roadmap (ANN-014).
--   * BRIEFKOPF (ANN-123). Name und Anschrift der Praxis aus den
--     Praxis-Stammdaten, ohne Steuer- und Bankangaben; fehlen sie, nur der
--     Name der Organisation.
--   * WER: schreiben therapist und team_lead (app.can_write_treatment_note,
--     wie die Dokumentation, ADR-016 Punkt 1); lesen die vier Praxisrollen
--     (app.can_read_treatment_note, ADR-004 Fassung 2). Patientenkonto und
--     Trainingsbetreuung nicht.
--   * AUDIT (ADR-010): created, updated, completed, discarded, viewed je
--     geliefertem Bericht und exported beim Druck (Punkt 2 "Download/Export
--     klinischer Daten"; der Knopf gilt als Export wie der signierte Verweis
--     nach Punkt 14). Nur Metadaten.
--   * NUR VERORDNUNGEN. Ein Selbstzahler hat keine Verordner:in, an die ein
--     Bericht ginge (ADR-020 Punkt 3).
--
-- Datenklasse: Patientenakte. Faellt mit der Akte (FK on delete cascade).
-- =============================================================================

create table public.therapy_reports (
  id                         uuid primary key default extensions.gen_random_uuid(),
  organization_id            uuid not null references public.organizations (id) on delete restrict,
  patient_id                 uuid not null references public.patients (id) on delete cascade,
  -- Cascade fuer den Loeschlauf der Akte (ADR-008); delete_treatment_basis
  -- weist eine Verordnung mit Bericht vorher ab - still verschwindet keiner.
  treatment_basis_id         uuid not null references public.treatment_bases (id) on delete cascade,

  status                     text not null default 'entwurf'
                               check (status in ('entwurf', 'abgeschlossen')),

  -- Eigener Text der Therapeut:in und ihre Empfehlung zum Verordnungsende;
  -- je Feld, wer es zuletzt geschrieben hat und wann (ANN-014, ANN-121).
  report_text                text check (report_text is null
                                         or length(btrim(report_text)) between 1 and 8000),
  report_text_updated_by     uuid,
  report_text_updated_at     timestamptz,
  recommendation             text check (recommendation is null
                                         or length(btrim(recommendation)) between 1 and 2000),
  recommendation_updated_by  uuid,
  recommendation_updated_at  timestamptz,

  -- Angekreuzte, finalisierte Dokumentationseintraege der Akte (ANN-122).
  note_ids                   uuid[] not null default '{}'
                               check (cardinality(note_ids) <= 50),
  -- Eine abgeschlossene Erhebung mit Koerperschema (ANN-107).
  body_chart_response_id     uuid references public.patient_questionnaire_responses (id),

  -- Beim Abschluss eingefroren; danach liest jeder nur noch den Snapshot.
  snapshot                   jsonb,

  created_at                 timestamptz not null default now(),
  created_by                 uuid,
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid,
  completed_at               timestamptz,
  completed_by               uuid,

  constraint therapy_reports_abschluss check (
    (status = 'abgeschlossen') = (completed_at is not null)
    and (status = 'abgeschlossen') = (snapshot is not null)
  )
);

comment on table public.therapy_reports is
  'Therapieberichte an die Verordner:in (DOK-005, ANN-121). Entwurf aenderbar, abgeschlossen als Snapshot eingefroren. Kein direkter Zugriff, nur ueber die Funktionen. Datenklasse: Patientenakte, faellt mit der Akte.';
comment on column public.therapy_reports.recommendation is
  'Empfehlung der Therapeut:in zum Verordnungsende - von ihr formuliert und verantwortet, nie von der Anwendung erzeugt oder bewertet (ANN-014, ADR-006 Punkt 4).';

create index therapy_reports_patient_idx on public.therapy_reports (patient_id, created_at);
create index therapy_reports_basis_idx on public.therapy_reports (treatment_basis_id);

alter table public.therapy_reports enable row level security;
revoke all on public.therapy_reports from public, anon, authenticated;

insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values
  ('therapy_reports', 'patientenakte', 'ueber_elterndatensatz',
   'Therapieberichte an die Verordner:in samt eingefrorenem Snapshot. Klinische Unterlage der Akte; faellt mit ihr (FK on delete cascade).', 49);

-- -----------------------------------------------------------------------------
-- delete_treatment_basis: eine Verordnung mit Bericht bleibt
--
-- Geloescht wird eine falsch erfasste Grundlage (VER-003). Haengt ein Bericht
-- an ihr, ist sie nicht falsch erfasst, sondern Grundlage eines Schreibens an
-- die Verordner:in; der Bericht darf nicht still mitfallen. Ein Entwurf wird
-- vorher verworfen. Rumpf sonst unveraendert aus
-- 20260918120000_treatment_basis.sql.
-- -----------------------------------------------------------------------------
create or replace function public.delete_treatment_basis(p_treatment_basis_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.therapy_reports r
    where r.treatment_basis_id = p_treatment_basis_id and r.organization_id = v_org
  ) then
    raise exception 'treatment basis has therapy reports' using errcode = '23503';
  end if;

  delete from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org
  returning p.patient_id into v_patient_id;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.deleted', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Ein abgeschlossener Bericht ist unveraenderlich - auch fuer postgres. Geloescht
-- wird er nur mit der Akte (die Funktionen verwerfen allein Entwuerfe).
-- -----------------------------------------------------------------------------
create function app.therapy_report_unveraenderlich()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'abgeschlossen' then
    raise exception 'therapy report is completed and cannot be changed' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function app.therapy_report_unveraenderlich() from public, anon, authenticated;

create trigger therapy_reports_unveraenderlich
  before update on public.therapy_reports
  for each row execute function app.therapy_report_unveraenderlich();

-- -----------------------------------------------------------------------------
-- app.therapy_report_pruefen: Auswahl gegen die Akte pruefen
--
-- Jeder angekreuzte Eintrag gehoert zur Akte des Berichts und ist finalisiert
-- (ADR-016 Punkt 4 - ein Entwurf ist kein Nachweis). Das Koerperschema kommt
-- aus einer abgeschlossenen, nicht ersetzten Erhebung derselben Akte, die
-- tatsaechlich Markierungen traegt. Der Server kennt die Definitionen nicht
-- (ANN-105) und erkennt das Koerperschema an der Form der Antwort.
-- -----------------------------------------------------------------------------
create function app.therapy_report_pruefen(
  p_org        uuid,
  p_patient_id uuid,
  p_note_ids   uuid[],
  p_response   uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if cardinality(p_note_ids) > 50 then
    raise exception 'too many entries' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_note_ids) as gewaehlt(id)
    where not exists (
      select 1
      from public.treatment_notes d
      join public.appointments t on t.id = d.appointment_id
      where d.id = gewaehlt.id
        and d.status = 'final'
        and t.patient_id = p_patient_id
        and t.organization_id = p_org
    )
  ) then
    raise exception 'entry not usable for this report' using errcode = '22023';
  end if;

  if p_response is not null and not exists (
    select 1
    from public.patient_questionnaire_responses qr
    where qr.id = p_response
      and qr.patient_id = p_patient_id
      and qr.organization_id = p_org
      and qr.status = 'abgeschlossen'
      and not exists (
        select 1 from public.patient_questionnaire_responses neu
        where neu.supersedes_response_id = qr.id
      )
      and exists (
        select 1 from jsonb_each(qr.answers) as a(kennung, antwort)
        where jsonb_typeof(a.antwort) = 'object' and a.antwort ? 'markierungen'
      )
  ) then
    raise exception 'body chart not usable for this report' using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.therapy_report_pruefen(uuid, uuid, uuid[], uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- app.therapy_report_dokument: der Bericht als Dokument
--
-- Eine Stelle baut das Dokument - fuer die Vorschau eines Entwurfs und fuer
-- den Snapshot beim Abschluss (wie ANN-077). Alles ist uebernommen: Woerter
-- aus der Akte, Zahlen gezaehlt, nichts gedeutet. `schema_version` macht den
-- Snapshot von spaeteren Schemaaenderungen unabhaengig.
-- -----------------------------------------------------------------------------
create function app.therapy_report_dokument(p_report_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  b     public.therapy_reports%rowtype;
  v_tz  text;
begin
  select * into b from public.therapy_reports where id = p_report_id;
  if not found then
    return null;
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = b.organization_id;

  return jsonb_build_object(
    'schema_version', 1,

    -- ANN-123: Anschrift ohne Steuer- und Bankangaben.
    'praxis', coalesce(
      (select jsonb_build_object(
         'name', pb.legal_name,
         'street', pb.street,
         'house_number', pb.house_number,
         'postal_code', pb.postal_code,
         'city', pb.city,
         'phone', pb.phone,
         'email', pb.email)
       from public.practice_billing_profiles pb
       where pb.organization_id = b.organization_id),
      (select jsonb_build_object('name', o.name)
       from public.organizations o where o.id = b.organization_id)
    ),

    'empfaenger', (
      select jsonb_build_object(
        'title', vo.title,
        'given_name', vo.given_name,
        'family_name', vo.family_name,
        'practice_name', vo.practice_name,
        'street', vo.street,
        'house_number', vo.house_number,
        'postal_code', vo.postal_code,
        'city', vo.city,
        'fax', vo.fax)
      from public.treatment_bases g
      join public.prescribers vo on vo.id = g.prescriber_id
      where g.id = b.treatment_basis_id
    ),

    'patient', (
      select jsonb_build_object(
        'given_name', pe.given_name,
        'family_name', pe.family_name,
        'date_of_birth', (
          select k.date_of_birth from public.patient_contact_details k
          where k.patient_id = pa.id
        ))
      from public.patients pa
      join public.persons pe on pe.id = pa.person_id
      where pa.id = b.patient_id
    ),

    'verordnung', (
      select jsonb_build_object(
        'treatment_basis_kind', g.treatment_basis_kind,
        'issued_on', g.issued_on,
        'diagnosis', g.diagnosis,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'remedy', i.remedy,
            'prescribed_quantity', i.prescribed_quantity
          ) order by i.sort_order)
          from public.treatment_base_items i
          where i.treatment_basis_id = g.id
        ), '[]'::jsonb),
        -- Gezaehlt, nicht bewertet: stattgefundene Termine dieser Verordnung.
        'termine_durchgefuehrt', (
          select count(*) from public.appointments t
          where t.treatment_basis_id = g.id
            and t.status in ('completed', 'documented', 'invoiced')
        ),
        'erster_termin', (
          select min((t.starts_at at time zone v_tz)::date) from public.appointments t
          where t.treatment_basis_id = g.id
            and t.status in ('completed', 'documented', 'invoiced')
        ),
        'letzter_termin', (
          select max((t.starts_at at time zone v_tz)::date) from public.appointments t
          where t.treatment_basis_id = g.id
            and t.status in ('completed', 'documented', 'invoiced')
        ))
      from public.treatment_bases g
      where g.id = b.treatment_basis_id
    ),

    -- Woertlich, in der Reihenfolge der Termine.
    'eintraege', coalesce((
      select jsonb_agg(jsonb_build_object(
        'note_id', d.id,
        'datum', (t.starts_at at time zone v_tz)::date,
        'verfasser', (select up.display_name from public.user_profiles up where up.id = d.created_by),
        'inhalt', d.content,
        'ergaenzung', d.addendum_to_note_id is not null
      ) order by t.starts_at, d.created_at)
      from public.treatment_notes d
      join public.appointments t on t.id = d.appointment_id
      where d.id = any (b.note_ids)
        and t.patient_id = b.patient_id
    ), '[]'::jsonb),

    'koerperschema', (
      select jsonb_build_object(
        'erhoben_am', qr.recorded_on,
        'markierungen', (
          select coalesce(jsonb_agg(m.markierung), '[]'::jsonb)
          from jsonb_each(qr.answers) as a(kennung, antwort),
               jsonb_array_elements(
                 case when jsonb_typeof(a.antwort -> 'markierungen') = 'array'
                      then a.antwort -> 'markierungen' else '[]'::jsonb end
               ) as m(markierung)
        ))
      from public.patient_questionnaire_responses qr
      where qr.id = b.body_chart_response_id
    ),

    'text', case when b.report_text is null then null else jsonb_build_object(
      'inhalt', b.report_text,
      'verfasser', (select up.display_name from public.user_profiles up where up.id = b.report_text_updated_by),
      'datum', (b.report_text_updated_at at time zone v_tz)::date
    ) end,

    'empfehlung', case when b.recommendation is null then null else jsonb_build_object(
      'inhalt', b.recommendation,
      'verfasser', (select up.display_name from public.user_profiles up where up.id = b.recommendation_updated_by),
      'datum', (b.recommendation_updated_at at time zone v_tz)::date
    ) end
  );
end;
$$;

revoke all on function app.therapy_report_dokument(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_therapy_report: leerer Entwurf zu einer Verordnung
-- -----------------------------------------------------------------------------
create function public.create_therapy_report(p_treatment_basis_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_kind    text;
  v_id      uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;

  select g.patient_id, g.treatment_basis_kind into v_patient, v_kind
  from public.treatment_bases g
  where g.id = p_treatment_basis_id and g.organization_id = v_org;
  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;
  if v_kind = 'self_pay' then
    raise exception 'a therapy report needs a prescription' using errcode = '22023';
  end if;

  insert into public.therapy_reports (
    organization_id, patient_id, treatment_basis_id, created_by, updated_by
  )
  values (v_org, v_patient, p_treatment_basis_id, v_actor, v_actor)
  returning id into v_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'therapy_report.created', 'therapy_report', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient)
  );

  return v_id;
end;
$$;

comment on function public.create_therapy_report(uuid) is
  'Legt einen leeren Therapiebericht zu einer Verordnung an (DOK-005a). therapist, team_lead; protokolliert als therapy_report.created.';

revoke all on function public.create_therapy_report(uuid) from public, anon;
grant execute on function public.create_therapy_report(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- update_therapy_report: Entwurf speichern
--
-- Mit erwartetem Stand wie bei der Dokumentation: Schreiben zwei Personen
-- zugleich, verliert keine still ihren Text (40001).
-- -----------------------------------------------------------------------------
create function public.update_therapy_report(
  p_report_id              uuid,
  p_report_text            text,
  p_recommendation         text,
  p_note_ids               uuid[],
  p_body_chart_response_id uuid,
  p_expected_updated_at    timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  b        public.therapy_reports%rowtype;
  v_text   text := nullif(btrim(p_report_text), '');
  v_empf   text := nullif(btrim(p_recommendation), '');
  v_ids    uuid[];
  v_stand  timestamptz;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;

  select * into b from public.therapy_reports r
  where r.id = p_report_id and r.organization_id = v_org
  for update;
  if not found then
    raise exception 'therapy report not found' using errcode = 'P0002';
  end if;
  if b.status <> 'entwurf' then
    raise exception 'therapy report is completed and cannot be changed' using errcode = '55000';
  end if;
  if b.updated_at is distinct from p_expected_updated_at then
    raise exception 'therapy report was changed in the meantime' using errcode = '40001';
  end if;

  -- Reihenfolge der Auswahl ist ohne Bedeutung; doppelte Kreuze zaehlen einmal.
  select coalesce(array_agg(distinct x), '{}') into v_ids
  from unnest(coalesce(p_note_ids, '{}'::uuid[])) as x;

  perform app.therapy_report_pruefen(v_org, b.patient_id, v_ids, p_body_chart_response_id);

  v_stand := clock_timestamp();

  update public.therapy_reports r
     set report_text               = v_text,
         report_text_updated_by    = case when v_text is distinct from b.report_text
                                          then case when v_text is null then null else v_actor end
                                          else r.report_text_updated_by end,
         report_text_updated_at    = case when v_text is distinct from b.report_text
                                          then case when v_text is null then null else v_stand end
                                          else r.report_text_updated_at end,
         recommendation            = v_empf,
         recommendation_updated_by = case when v_empf is distinct from b.recommendation
                                          then case when v_empf is null then null else v_actor end
                                          else r.recommendation_updated_by end,
         recommendation_updated_at = case when v_empf is distinct from b.recommendation
                                          then case when v_empf is null then null else v_stand end
                                          else r.recommendation_updated_at end,
         note_ids                  = v_ids,
         body_chart_response_id    = p_body_chart_response_id,
         updated_at                = v_stand,
         updated_by                = v_actor
   where r.id = p_report_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'therapy_report.updated', 'therapy_report', p_report_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', b.patient_id)
  );

  return v_stand;
end;
$$;

comment on function public.update_therapy_report(uuid, text, text, uuid[], uuid, timestamptz) is
  'Speichert den Entwurf eines Therapieberichts (DOK-005a, ANN-122). therapist, team_lead; nur Eintraege und Erhebungen der eigenen Akte; protokolliert als therapy_report.updated.';

revoke all on function public.update_therapy_report(uuid, text, text, uuid[], uuid, timestamptz) from public, anon;
grant execute on function public.update_therapy_report(uuid, text, text, uuid[], uuid, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- complete_therapy_report: abschliessen und einfrieren
-- -----------------------------------------------------------------------------
create function public.complete_therapy_report(
  p_report_id           uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  b       public.therapy_reports%rowtype;
  v_tz    text;
  v_jetzt timestamptz;
  v_dok   jsonb;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;

  select * into b from public.therapy_reports r
  where r.id = p_report_id and r.organization_id = v_org
  for update;
  if not found then
    raise exception 'therapy report not found' using errcode = 'P0002';
  end if;
  if b.status <> 'entwurf' then
    raise exception 'therapy report is completed and cannot be changed' using errcode = '55000';
  end if;
  if b.updated_at is distinct from p_expected_updated_at then
    raise exception 'therapy report was changed in the meantime' using errcode = '40001';
  end if;
  if b.report_text is null and b.recommendation is null and cardinality(b.note_ids) = 0 then
    raise exception 'therapy report is empty' using errcode = '22023';
  end if;

  -- Seit dem Speichern kann eine Erhebung ersetzt worden sein.
  perform app.therapy_report_pruefen(v_org, b.patient_id, b.note_ids, b.body_chart_response_id);

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  v_jetzt := clock_timestamp();
  v_dok := app.therapy_report_dokument(p_report_id)
           || jsonb_build_object('abgeschlossen', jsonb_build_object(
                'datum', (v_jetzt at time zone v_tz)::date,
                'von', (select up.display_name from public.user_profiles up where up.id = v_actor)));

  update public.therapy_reports r
     set status       = 'abgeschlossen',
         snapshot     = v_dok,
         completed_at = v_jetzt,
         completed_by = v_actor,
         updated_at   = v_jetzt,
         updated_by   = v_actor
   where r.id = p_report_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'therapy_report.completed', 'therapy_report', p_report_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', b.patient_id)
  );
end;
$$;

comment on function public.complete_therapy_report(uuid, timestamptz) is
  'Schliesst einen Therapiebericht ab und friert ihn als Snapshot ein (DOK-005a, ANN-121). therapist, team_lead; protokolliert als therapy_report.completed.';

revoke all on function public.complete_therapy_report(uuid, timestamptz) from public, anon;
grant execute on function public.complete_therapy_report(uuid, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- discard_therapy_report: einen Entwurf verwerfen
-- -----------------------------------------------------------------------------
create function public.discard_therapy_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_status  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;

  select r.patient_id, r.status into v_patient, v_status
  from public.therapy_reports r
  where r.id = p_report_id and r.organization_id = v_org
  for update;
  if not found then
    raise exception 'therapy report not found' using errcode = 'P0002';
  end if;
  if v_status <> 'entwurf' then
    raise exception 'therapy report is completed and cannot be changed' using errcode = '55000';
  end if;

  delete from public.therapy_reports r where r.id = p_report_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'therapy_report.discarded', 'therapy_report', p_report_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient)
  );
end;
$$;

comment on function public.discard_therapy_report(uuid) is
  'Verwirft den Entwurf eines Therapieberichts (DOK-005a). therapist, team_lead; ein abgeschlossener Bericht bleibt; protokolliert als therapy_report.discarded.';

revoke all on function public.discard_therapy_report(uuid) from public, anon;
grant execute on function public.discard_therapy_report(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- list_patient_therapy_reports: die Berichte einer Akte
--
-- Mit der Empfehlung samt Quelle und Datum, damit die Verordnung sie zeigen
-- kann (ANN-014). Beim abgeschlossenen Bericht aus dem Snapshot.
-- -----------------------------------------------------------------------------
create function public.list_patient_therapy_reports(p_patient_id uuid)
returns table (
  id                     uuid,
  treatment_basis_id     uuid,
  status                 text,
  created_at             timestamptz,
  author_name            text,
  completed_at           timestamptz,
  completed_on           date,
  completed_by_name      text,
  recommendation         text,
  recommendation_by_name text,
  recommendation_on      date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_tz    text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    perform app.record_denied_read(v_actor, 'therapy_report.viewed', 'not allowed to read therapy reports');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read therapy reports' using errcode = '42501';
  end if;
  select o.time_zone into v_tz from public.organizations o where o.id = v_org;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'therapy_report.viewed', 'therapy_report', r.id, 'success',
         jsonb_build_object('surface', 'web', 'patient_id', p_patient_id)
  from public.therapy_reports r
  where r.patient_id = p_patient_id and r.organization_id = v_org;

  return query
    select r.id, r.treatment_basis_id, r.status, r.created_at,
           (select up.display_name from public.user_profiles up where up.id = r.created_by),
           r.completed_at,
           (r.completed_at at time zone v_tz)::date,
           (select up.display_name from public.user_profiles up where up.id = r.completed_by),
           case when r.status = 'abgeschlossen'
                then r.snapshot -> 'empfehlung' ->> 'inhalt' else r.recommendation end,
           case when r.status = 'abgeschlossen'
                then r.snapshot -> 'empfehlung' ->> 'verfasser'
                else (select up.display_name from public.user_profiles up
                      where up.id = r.recommendation_updated_by) end,
           case when r.status = 'abgeschlossen'
                then (r.snapshot -> 'empfehlung' ->> 'datum')::date
                else (r.recommendation_updated_at at time zone v_tz)::date end
    from public.therapy_reports r
    where r.patient_id = p_patient_id and r.organization_id = v_org
    order by r.created_at;
end;
$$;

comment on function public.list_patient_therapy_reports(uuid) is
  'Therapieberichte einer Akte mit Empfehlung, Quelle und Datum (DOK-005a, ANN-014). Alle vier Praxisrollen; je Bericht protokolliert als therapy_report.viewed, abgewiesen mit denied-Eintrag (ADR-010).';

revoke all on function public.list_patient_therapy_reports(uuid) from public, anon;
grant execute on function public.list_patient_therapy_reports(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- get_therapy_report: ein Bericht mit seinem Dokument
-- -----------------------------------------------------------------------------
create function public.get_therapy_report(p_report_id uuid)
returns table (
  id                     uuid,
  patient_id             uuid,
  treatment_basis_id     uuid,
  status                 text,
  report_text            text,
  recommendation         text,
  note_ids               uuid[],
  body_chart_response_id uuid,
  updated_at             timestamptz,
  document               jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  b       public.therapy_reports%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_note() then
    perform app.record_denied_read(v_actor, 'therapy_report.viewed', 'not allowed to read therapy reports');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read therapy reports' using errcode = '42501';
  end if;

  select * into b from public.therapy_reports r
  where r.id = p_report_id and r.organization_id = v_org;
  if not found then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'therapy_report.viewed', 'therapy_report', b.id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', b.patient_id)
  );

  return query
    select b.id, b.patient_id, b.treatment_basis_id, b.status, b.report_text,
           b.recommendation, b.note_ids, b.body_chart_response_id, b.updated_at,
           case when b.status = 'abgeschlossen' then b.snapshot
                else app.therapy_report_dokument(b.id) end;
end;
$$;

comment on function public.get_therapy_report(uuid) is
  'Ein Therapiebericht mit Dokument - beim Entwurf frisch gebaut, beim abgeschlossenen Bericht der Snapshot (DOK-005a). Alle vier Praxisrollen; protokolliert als therapy_report.viewed.';

revoke all on function public.get_therapy_report(uuid) from public, anon;
grant execute on function public.get_therapy_report(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- list_therapy_report_sources: was sich ankreuzen laesst
--
-- Finalisierte Eintraege der Akte (hoechstens die 200 juengsten) und
-- abgeschlossene, nicht ersetzte Erhebungen mit Koerperschema. Wer sie liest,
-- liest klinische Inhalte: protokolliert wie in der Akte je Eintrag und je
-- Erhebung (ADR-016 Punkt 9). Nur fuer die schreibenden Rollen - wer nicht
-- schreiben darf, hat hier nichts auszuwaehlen.
-- -----------------------------------------------------------------------------
create function public.list_therapy_report_sources(p_report_id uuid)
returns table (
  kind              text,
  id                uuid,
  occurred_on       date,
  author_name       text,
  content           text,
  in_treatment_basis boolean,
  is_addendum       boolean,
  body_chart        jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_tz    text;
  b       public.therapy_reports%rowtype;
  v_notizen uuid[];
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_treatment_note() then
    perform app.record_denied_read(v_actor, 'treatment_note.viewed', 'not allowed to write therapy reports');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write therapy reports' using errcode = '42501';
  end if;

  select * into b from public.therapy_reports r
  where r.id = p_report_id and r.organization_id = v_org;
  if not found then
    raise exception 'therapy report not found' using errcode = 'P0002';
  end if;
  select o.time_zone into v_tz from public.organizations o where o.id = v_org;

  select coalesce(array_agg(n.id), '{}') into v_notizen
  from (
    select d.id
    from public.treatment_notes d
    join public.appointments t on t.id = d.appointment_id
    where t.patient_id = b.patient_id and t.organization_id = v_org and d.status = 'final'
    order by t.starts_at desc, d.created_at desc
    limit 200
  ) n;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'treatment_note.viewed', 'treatment_note', n.id, 'success',
         jsonb_build_object('surface', 'web', 'patient_id', b.patient_id)
  from unnest(v_notizen) as n(id);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  select v_org, v_actor, 'questionnaire_response.viewed', 'questionnaire_response', qr.id, 'success',
         jsonb_build_object('surface', 'web', 'patient_id', b.patient_id)
  from public.patient_questionnaire_responses qr
  where qr.patient_id = b.patient_id and qr.organization_id = v_org
    and qr.status = 'abgeschlossen'
    and not exists (select 1 from public.patient_questionnaire_responses neu
                    where neu.supersedes_response_id = qr.id)
    and exists (select 1 from jsonb_each(qr.answers) as a(kennung, antwort)
                where jsonb_typeof(a.antwort) = 'object' and a.antwort ? 'markierungen');

  return query
    select 'eintrag'::text, d.id, (t.starts_at at time zone v_tz)::date,
           (select up.display_name from public.user_profiles up where up.id = d.created_by),
           d.content,
           t.treatment_basis_id is not distinct from b.treatment_basis_id,
           d.addendum_to_note_id is not null,
           null::jsonb
    from public.treatment_notes d
    join public.appointments t on t.id = d.appointment_id
    where d.id = any (v_notizen)
    union all
    select 'koerperschema'::text, qr.id, qr.recorded_on,
           (select up.display_name from public.user_profiles up where up.id = qr.created_by),
           null::text, null::boolean, false,
           (select coalesce(jsonb_agg(m.markierung), '[]'::jsonb)
            from jsonb_each(qr.answers) as a(kennung, antwort),
                 jsonb_array_elements(
                   case when jsonb_typeof(a.antwort -> 'markierungen') = 'array'
                        then a.antwort -> 'markierungen' else '[]'::jsonb end
                 ) as m(markierung))
    from public.patient_questionnaire_responses qr
    where qr.patient_id = b.patient_id and qr.organization_id = v_org
      and qr.status = 'abgeschlossen'
      and not exists (select 1 from public.patient_questionnaire_responses neu
                      where neu.supersedes_response_id = qr.id)
      and exists (select 1 from jsonb_each(qr.answers) as a(kennung, antwort)
                  where jsonb_typeof(a.antwort) = 'object' and a.antwort ? 'markierungen')
    order by 1, 3, 2;
end;
$$;

comment on function public.list_therapy_report_sources(uuid) is
  'Was sich in einen Therapiebericht uebernehmen laesst: finalisierte Eintraege der Akte (hoechstens 200) und abgeschlossene Erhebungen mit Koerperschema (DOK-005a, ANN-122). therapist, team_lead; je Eintrag und Erhebung protokolliert.';

revoke all on function public.list_therapy_report_sources(uuid) from public, anon;
grant execute on function public.list_therapy_report_sources(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- log_therapy_report_export: der Druckknopf
--
-- Ob tatsaechlich gedruckt wurde, sieht die Anwendung nicht (B14 Weg 1). Der
-- Knopf gilt als Export wie der signierte Verweis bei Dateien (ADR-010
-- Punkt 2 und 14). Lesen darf, wer den Bericht lesen darf.
-- -----------------------------------------------------------------------------
create function public.log_therapy_report_export(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_patient uuid;
  v_status  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_treatment_note() then
    raise exception 'not allowed to read therapy reports' using errcode = '42501';
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read therapy reports' using errcode = '42501';
  end if;

  select r.patient_id, r.status into v_patient, v_status
  from public.therapy_reports r
  where r.id = p_report_id and r.organization_id = v_org;
  if not found then
    raise exception 'therapy report not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'therapy_report.exported', 'therapy_report', p_report_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient, 'status', v_status)
  );
end;
$$;

comment on function public.log_therapy_report_export(uuid) is
  'Protokolliert den Druck eines Therapieberichts als therapy_report.exported (DOK-005a, ADR-010 Punkt 2). Alle vier Praxisrollen.';

revoke all on function public.log_therapy_report_export(uuid) from public, anon;
grant execute on function public.log_therapy_report_export(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Auskunft nach Art. 15 DSGVO: die Therapieberichte gehoeren zur Kopie
-- (Art. 15 Abs. 3), der abgeschlossene mit seinem Snapshot - so, wie er
-- verschickt wurde. Rumpf sonst unveraendert aus
-- 20260926130000_ux_003a_treatment_table.sql.
-- -----------------------------------------------------------------------------
create or replace function public.export_patient_record(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_actor  uuid;
  v_daten  jsonb;
begin
  v_actor := auth.uid();
  v_org   := app.auskunft_organisation(p_patient_id);

  select jsonb_build_object(
    'persons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'given_name', pe.given_name,
        'family_name', pe.family_name,
        'created_at', pe.created_at
      ) order by pe.created_at)
      from public.persons pe
      join public.patients pa on pa.person_id = pe.id
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id,
        'status', pa.status,
        'care_started_on', pa.care_started_on,
        'care_concluded_on', pa.care_concluded_on,
        'care_concluded_at', pa.care_concluded_at,
        'created_at', pa.created_at
      ))
      from public.patients pa
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patient_contact_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date_of_birth', k.date_of_birth,
        'email', k.email,
        'phone', k.phone,
        'phone_mobile', k.phone_mobile,
        'phone_work', k.phone_work,
        'fax', k.fax,
        'institution', k.institution,
        'street', k.street,
        'house_number', k.house_number,
        'postal_code', k.postal_code,
        'city', k.city,
        -- MAP-006a: die Koordinate ist ein Personendatum wie die Adresse (Art. 15 DSGVO).
        'lat', k.lat,
        'lon', k.lon,
        'geocode_precision', k.geocode_precision,
        'created_at', k.created_at
      ))
      from public.patient_contact_details k
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_care_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'primary_therapist', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = v.primary_therapist_staff_member_id
        ),
        'home_visit_access_note', v.home_visit_access_note,
        'special_note', v.special_note,
        'remark', v.remark,
        -- UX-003a: Behandlungsliege (ANN-116).
        'treatment_table_required', v.treatment_table_required,
        'created_at', v.created_at
      ))
      from public.patient_care_details v
      where v.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', t.kind,
        'appointment_type', t.appointment_type,
        'status', t.status,
        'title', t.title,
        'starts_at', t.starts_at,
        'ends_at', t.ends_at,
        'staff_member', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = t.staff_member_id
        ),
        'visit_street', t.visit_street,
        'visit_house_number', t.visit_house_number,
        'visit_postal_code', t.visit_postal_code,
        'visit_city', t.visit_city,
        'visit_lat', t.visit_lat,
        'visit_lon', t.visit_lon,
        'cancellation_reason', t.cancellation_reason,
        'cancellation_received_at', t.cancellation_received_at,
        'fee_basis', t.fee_basis,
        'no_show_recorded_at', t.no_show_recorded_at,
        'completed_at', t.completed_at,
        'created_at', t.created_at
      ) order by t.starts_at)
      from public.appointments t
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointment_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'appointment_id', n.appointment_id,
        'channel', n.channel,
        'notified_at', n.notified_at
      ) order by n.notified_at)
      from public.appointment_notifications n
      join public.appointments t on t.id = n.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_bases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'treatment_basis_kind', g.treatment_basis_kind,
        'issued_on', g.issued_on,
        'prescriber', (
          select btrim(coalesce(vo.title || ' ', '') || vo.given_name || ' ' || vo.family_name)
          from public.prescribers vo
          where vo.id = g.prescriber_id
        ),
        'diagnosis', g.diagnosis,
        'therapy_goal', g.therapy_goal,
        'frequency_note', g.frequency_note,
        'prescriber_note', g.prescriber_note,
        'follow_up_recommendation', g.follow_up_recommendation,
        'note', g.note,
        'appointment_count', g.appointment_count,
        'created_at', g.created_at
      ) order by g.issued_on, g.created_at)
      from public.treatment_bases g
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_base_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'treatment_basis_id', i.treatment_basis_id,
        'sort_order', i.sort_order,
        'remedy', i.remedy,
        'prescribed_quantity', i.prescribed_quantity,
        'used_quantity', i.used_quantity
      ) order by i.sort_order)
      from public.treatment_base_items i
      join public.treatment_bases g on g.id = i.treatment_basis_id
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'appointment_id', d.appointment_id,
        'status', d.status,
        'content', d.content,
        'visit_without_treatment', d.visit_without_treatment,
        'addendum_to_note_id', d.addendum_to_note_id,
        'finalisation_kind', d.finalisation_kind,
        'finalized_at', d.finalized_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = d.created_by
        ),
        'created_at', d.created_at,
        'updated_at', d.updated_at
      ) order by d.created_at)
      from public.treatment_notes d
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_note_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'note_id', f.note_id,
        'version_no', f.version_no,
        'content', f.content,
        'change_reason', f.change_reason,
        'recorded_at', f.recorded_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = f.author_id
        )
      ) order by f.recorded_at, f.version_no)
      from public.treatment_note_versions f
      join public.treatment_notes d on d.id = f.note_id
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', da.id,
        'document_type', da.document_type,
        'display_name', da.display_name,
        'mime_type', da.mime_type,
        'byte_size', da.byte_size,
        'checksum_sha256', da.checksum_sha256,
        'status', da.status,
        'treatment_basis_id', da.treatment_basis_id,
        'created_at', da.created_at,
        'confirmed_at', da.confirmed_at
      ) order by da.created_at)
      from public.patient_files da
      where da.patient_id = p_patient_id
    ), '[]'::jsonb),

    'legal_holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'reason', s.reason,
        'placed_at', s.placed_at,
        'released_at', s.released_at
      ) order by s.placed_at)
      from public.legal_holds s
      where s.subject_type = 'patient' and s.subject_id = p_patient_id
    ), '[]'::jsonb),

    'billable_services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'appointment_id', l.appointment_id,
        'performed_on', l.performed_on,
        'quantity', l.quantity,
        'status', l.status,
        'service_area', l.service_area,
        'service', (
          select btrim(k.code || ' ' || k.label)
          from public.service_catalog_items k
          where k.id = l.catalog_item_id
        )
      ) order by l.performed_on)
      from public.billable_services l
      where l.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'recipient_kind', e.recipient_kind,
        'name', e.name,
        'street', e.street,
        'house_number', e.house_number,
        'postal_code', e.postal_code,
        'city', e.city,
        'reference', e.reference,
        'is_default', e.is_default,
        'created_at', e.created_at
      ) order by e.created_at)
      from public.invoice_recipients e
      where e.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'invoice_number', r.invoice_number,
        'period_month', r.period_month,
        'issued_on', r.issued_on,
        'due_on', r.due_on,
        'total_cents', r.total_cents,
        'tax_total_cents', r.tax_total_cents,
        'currency', r.currency,
        'service_area', r.service_area,
        'snapshot', r.snapshot,
        'created_at', r.created_at
      ) order by r.created_at)
      from public.invoices r
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'invoice_id', ri.invoice_id,
        'billable_service_id', ri.billable_service_id,
        'sort_order', ri.sort_order,
        'service_area', ri.service_area
      ) order by ri.sort_order)
      from public.invoice_items ri
      join public.invoices r on r.id = ri.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_cancellations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'invoice_id', st.invoice_id,
        'cancellation_number', st.cancellation_number,
        'reason', st.reason,
        'cancelled_on', st.cancelled_on
      ) order by st.cancelled_on)
      from public.invoice_cancellations st
      join public.invoices r on r.id = st.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_payment_reminders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'invoice_id', m.invoice_id,
        'reminder_on', m.reminder_on,
        'due_on', m.due_on,
        'outstanding_cents', m.outstanding_cents,
        'currency', m.currency
      ) order by m.reminder_on)
      from public.invoice_payment_reminders m
      join public.invoices r on r.id = m.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', z.id,
        'invoice_id', z.invoice_id,
        'direction', z.direction,
        'amount_cents', z.amount_cents,
        'currency', z.currency,
        'paid_on', z.paid_on,
        'method', z.method,
        'note', z.note,
        'voided_at', z.voided_at,
        'void_reason', z.void_reason
      ) order by z.paid_on)
      from public.payments z
      join public.invoices r on r.id = z.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PAT-006: Vermerke zu Datenschutzinformation, Vertrag und Einwilligungen.
    'patient_privacy_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'record_kind', pr.record_kind,
        'purpose', pr.purpose,
        'notice_version', pr.notice_version,
        'occurred_on', pr.occurred_on,
        'recorded_at', pr.recorded_at
      ) order by pr.recorded_at)
      from public.patient_privacy_records pr
      where pr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002b: erhobene Fragebögen samt Korrekturen, mit Antworten.
    'patient_questionnaire_responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qr.id,
        'instrument_id', qr.instrument_id,
        'definition_version', qr.definition_version,
        'status', qr.status,
        'recorded_on', qr.recorded_on,
        'answers', qr.answers,
        'supersedes_response_id', qr.supersedes_response_id,
        'change_reason', qr.change_reason,
        'author', (
          select up.display_name from public.user_profiles up where up.id = qr.created_by
        ),
        'created_at', qr.created_at,
        'completed_at', qr.completed_at
      ) order by qr.recorded_on, qr.created_at)
      from public.patient_questionnaire_responses qr
      where qr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002e: Ereignisse im Verlauf.
    'patient_course_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'occurred_on', ce.occurred_on,
        'kind', ce.kind,
        'note', ce.note,
        'created_at', ce.created_at
      ) order by ce.occurred_on, ce.created_at)
      from public.patient_course_events ce
      where ce.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- DOK-005a: Therapieberichte an die Verordner:in.
    'therapy_reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'treatment_basis_id', tr.treatment_basis_id,
        'status', tr.status,
        'report_text', tr.report_text,
        'recommendation', tr.recommendation,
        'note_ids', to_jsonb(tr.note_ids),
        'body_chart_response_id', tr.body_chart_response_id,
        'snapshot', tr.snapshot,
        'author', (
          select up.display_name from public.user_profiles up where up.id = tr.created_by
        ),
        'created_at', tr.created_at,
        'completed_at', tr.completed_at
      ) order by tr.created_at)
      from public.therapy_reports tr
      where tr.patient_id = p_patient_id
    ), '[]'::jsonb)
  )
  into v_daten;

  -- Der Auditeintrag traegt nur Metadaten: wer, wann, welche Akte (ADR-010
  -- Punkt 3). Keine Zahl ueber den Inhalt, kein Name.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_record.exported', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'purpose', 'auskunft_art_15')
  );

  return jsonb_build_object(
    'erstellt_am', now(),
    'organisation', (select o.name from public.organizations o where o.id = v_org),
    'patient_id', p_patient_id,
    'rechtsgrundlage', 'Art. 15 Abs. 3 DSGVO',
    'tabellen', v_daten,
    'nicht_enthalten', jsonb_build_array(
      jsonb_build_object(
        'was', 'Inhalt hochgeladener Dateien',
        'grund', 'Die Kopie nennt jede Datei mit Name, Art und Pruefsumme; die Datei selbst wird getrennt herausgegeben (ADR-017).'
      ),
      jsonb_build_object(
        'was', 'Protokoll der Zugriffe auf die Akte',
        'grund', 'Jede Zeile ist zugleich ein Datensatz ueber eine beschaeftigte Person (Art. 15 Abs. 4 DSGVO); sie wird auf gesondertes Verlangen erteilt (ANN-092).'
      ),
      jsonb_build_object(
        'was', 'Daten eines Trainingsverhaeltnisses',
        'grund', 'Training ist ein eigenes Rechtsverhaeltnis mit eigener Akte und eigener Frist (ADR-021); die Auskunft dazu wird getrennt erteilt.'
      ),
      jsonb_build_object(
        'was', 'Interne Kennungen bearbeitender Konten',
        'grund', 'Wo eine Person die Angabe traegt, steht ihr Name; die technische Kennung des Kontos sagt nichts aus.'
      )
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Ereigniskatalog (ADR-010)
--
-- Muss deckungsgleich mit AUDIT_ACTIONS in src/features/audit/actions.ts
-- bleiben; supabase/tests/audit.test.ts prueft beides gegeneinander.
-- -----------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_subject_type_check;
alter table public.audit_log add constraint audit_log_subject_type_check
  check (subject_type in (
    'patient',
    'organization',
    'appointment',
    'staff_working_hours',
    'staff_working_hour_exception',
    'staff_member',
    'treatment_note',
    'prescription',
    'treatment_basis',
    'text_snippet',
    'user_account',
    'patient_file',
    'storage_deletion_order',
    'service_catalog_version',
    'invoice_recipient',
    'invoice',
    'payment',
    'questionnaire_response',
    'patient_course_event',
    'therapy_report'
  ));

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  CHECK ((action = ANY (ARRAY['patient_record.viewed'::text, 'patient_record.exported'::text, 'audit_log.read'::text, 'patient.created'::text, 'patient.updated'::text, 'patient.status_changed'::text, 'patient.care_concluded'::text, 'patient.care_reopened'::text, 'legal_hold.placed'::text, 'legal_hold.released'::text, 'retention.applied'::text, 'retention.reapplied'::text, 'appointment.created'::text, 'appointment.updated'::text, 'appointment.rescheduled'::text, 'appointment.cancelled'::text, 'appointment.no_show'::text, 'appointment.completed'::text, 'appointment.documented'::text, 'appointment.reopened'::text, 'appointment.notified'::text, 'organization.appointment_grid_changed'::text, 'organization.documentation_deadline_changed'::text, 'organization.billing_profile_changed'::text, 'staff_working_hours.created'::text, 'staff_working_hours.updated'::text, 'staff_working_hours.removed'::text, 'staff_working_hour_exception.created'::text, 'staff_working_hour_exception.updated'::text, 'staff_working_hour_exception.removed'::text, 'staff_member.created'::text, 'staff_member.updated'::text, 'staff_member.status_changed'::text, 'staff_account.invited'::text, 'staff_account.invitation_revoked'::text, 'staff_account.invitation_accepted'::text, 'staff_account.roles_changed'::text, 'staff_account.locked'::text, 'staff_account.unlocked'::text, 'staff_account.password_reset_requested'::text, 'account.password_changed'::text, 'account.sessions_ended'::text, 'account.mfa_enrolled'::text, 'account.mfa_removed'::text, 'treatment_note.created'::text, 'treatment_note.updated'::text, 'treatment_note.viewed'::text, 'treatment_note.finalized'::text, 'treatment_note.auto_finalized'::text, 'treatment_note.revised'::text, 'treatment_note.addendum_created'::text, 'treatment_note.history_viewed'::text, 'prescription.viewed'::text, 'prescription.created'::text, 'prescription.updated'::text, 'prescription.deleted'::text, 'treatment_basis.viewed'::text, 'treatment_basis.created'::text, 'treatment_basis.updated'::text, 'treatment_basis.deleted'::text, 'treatment_basis.appointments_transferred'::text, 'patient_file.uploaded'::text, 'patient_file.link_issued'::text, 'patient_file.deleted'::text, 'patient_file.type_corrected'::text, 'storage_deletion.claimed'::text, 'storage_deletion.receipted'::text, 'storage_deletion.ordered'::text, 'text_snippet.created'::text, 'text_snippet.updated'::text, 'text_snippet.deleted'::text, 'service_catalog.version_created'::text, 'service_catalog.version_updated'::text, 'service_catalog.version_published'::text, 'service_catalog.version_deleted'::text, 'billable_service.recorded'::text, 'billable_service.removed'::text, 'invoice_recipient.created'::text, 'invoice_recipient.updated'::text, 'invoice_recipient.deleted'::text, 'invoice.draft_created'::text, 'invoice.draft_deleted'::text, 'invoice.recipient_changed'::text, 'invoice.issued'::text, 'invoice.cancelled'::text, 'invoice.reminder_created'::text, 'payment.recorded'::text, 'payment.voided'::text, 'organization.bootstrapped'::text, 'deletion_runs.read'::text, 'patient_privacy.recorded'::text, 'appointments.read'::text, 'patient_directory.read'::text, 'treatment_bases.read'::text, 'treatment_evidence.read'::text, 'patient_files.read'::text, 'text_snippets.read'::text, 'invoicing.read'::text, 'billable_services.read'::text, 'legal_holds.read'::text, 'storage_deletion.read'::text, 'patient.address_geocoded'::text, 'organization.tour_start_changed'::text, 'questionnaire_response.created'::text, 'questionnaire_response.updated'::text, 'questionnaire_response.completed'::text, 'questionnaire_response.discarded'::text, 'questionnaire_response.viewed'::text, 'patient_course_event.created'::text, 'patient_course_event.removed'::text, 'patient_course_event.viewed'::text, 'therapy_report.created'::text, 'therapy_report.updated'::text, 'therapy_report.completed'::text, 'therapy_report.discarded'::text, 'therapy_report.viewed'::text, 'therapy_report.exported'::text])));
