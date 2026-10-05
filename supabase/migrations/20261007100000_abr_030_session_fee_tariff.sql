-- =============================================================================
-- ABR-030 (ABR-EPIC-007, BEF-099): Tarif und Honorarvereinbarung
--
-- ADR-009 Fassung 5 Punkte 5 und 22: Je Behandlungstermin entsteht genau
-- einmal das vereinbarte Terminhonorar. Massgeblich ist die am Leistungstag
-- geltende Vereinbarung mit der Person, sonst der allgemeine Tarif. Beide
-- sind versioniert mit Gueltigkeitsbeginn, und eine neue Preisliste aendert
-- keine Vereinbarung.
--
-- Zwei Bausteine (ANN-231):
--
--   1. Der **Tarif** ist ein Betrag an der Preisliste
--      (`service_catalog_versions.session_fee_cents`). Die Preisliste ist
--      schon versioniert und wird mit dem Veroeffentlichen eingefroren
--      (ANN-070) - der Trigger service_catalog_versions_frozen gilt fuer jede
--      Spalte der Zeile, also auch fuer diese.
--   2. Die **Honorarvereinbarung** je Person ist ein unveraenderlicher
--      Eintrag mit Betrag und Gueltigkeitsbeginn. Eine Aenderung ist ein
--      neuer Eintrag.
--
-- Welcher Betrag an einem Tag gilt, beantwortet genau eine Funktion:
-- app.session_fee_on. Festgeschrieben wird er erst beim Bestaetigen der
-- Heilmittel (ABR-031); hier entsteht noch keine Forderung.
--
-- Keine neue Aktion im Auditlog: Den Nachweis traegt das Datenmodell
-- (created_by, created_at; ADR-010 Fassung 3).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Tarif an der Preisliste
-- -----------------------------------------------------------------------------
alter table public.service_catalog_versions
  add column session_fee_cents integer
    check (session_fee_cents is null or session_fee_cents between 0 and 1000000);

comment on column public.service_catalog_versions.session_fee_cents is
  'Allgemeiner Tarif des Terminhonorars in Cent (ABR-030, ADR-009 Punkt 22, ANN-231): je durchgefuehrtem Behandlungstermin genau einmal, einschliesslich Dokumentation und Hausbesuch. Mit der Version veroeffentlicht und eingefroren. null heisst: diese Preisliste kennt kein Terminhonorar.';

create or replace function public.set_service_catalog_session_fee(
  p_version_id uuid,
  p_session_fee_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_published timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  select v.published_at into v_published
  from public.service_catalog_versions v
  where v.id = p_version_id
    and v.organization_id = app.current_organization_id();

  if not found then
    raise exception 'service catalog version not found' using errcode = '42501';
  end if;

  if v_published is not null then
    raise exception 'published service catalog version is immutable' using errcode = '23514';
  end if;

  if p_session_fee_cents is not null and p_session_fee_cents not between 0 and 1000000 then
    raise exception 'session fee out of range' using errcode = '22023';
  end if;

  update public.service_catalog_versions
     set session_fee_cents = p_session_fee_cents
   where id = p_version_id;
end;
$$;

comment on function public.set_service_catalog_session_fee(uuid, integer) is
  'Setzt den Tarif des Terminhonorars an einem Entwurf der Preisliste (ABR-030, ANN-231). Nur owner; eine veroeffentlichte Version bleibt unveraenderlich.';

revoke all on function public.set_service_catalog_session_fee(uuid, integer) from public, anon;
grant execute on function public.set_service_catalog_session_fee(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Die Honorarvereinbarung je Person
--
-- Lesen owner und office (Abrechnung, PROJECT_PRINCIPLES.md 4.3); anlegen
-- und entfernen allein owner, denn ein Preis ist Praxiseinstellung (4.1,
-- ANN-071, ANN-231). Kein Tabellenrecht und keine Policy: erreichbar nur
-- ueber die Funktionen dieser Migration (ADR-004).
--
-- Die Vereinbarung faellt mit der Akte (on delete cascade): Geloescht wird
-- die Akte erst nach ihrer Frist (ADR-008), und eine Vereinbarung ohne
-- Person hat keinen Gegenstand mehr. Was sie bewirkt hat, steht festge-
-- schrieben an der Leistung und im Rechnungssnapshot.
-- -----------------------------------------------------------------------------
create table public.patient_fee_agreements (
  id                uuid primary key default extensions.gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  patient_id        uuid not null references public.patients (id) on delete cascade,
  valid_from        date not null,
  session_fee_cents integer not null check (session_fee_cents between 0 and 1000000),
  created_at        timestamptz not null default now(),
  created_by        uuid
);

comment on table public.patient_fee_agreements is
  'Mit einer Person vereinbartes Terminhonorar ab einem Tag (ABR-030, ADR-009 Punkte 5 und 22, ANN-231). Unveraenderlich; eine Aenderung ist ein neuer Eintrag. Datenklasse: Abrechnungsdaten der Akte. Nur ueber Funktionen erreichbar.';
comment on column public.patient_fee_agreements.valid_from is
  'Erster Leistungstag, an dem die Vereinbarung gilt. Am Leistungstag gilt die juengste bis zu diesem Tag; sie geht dem allgemeinen Tarif vor.';

create unique index patient_fee_agreements_patient_from_key
  on public.patient_fee_agreements (patient_id, valid_from);
create index patient_fee_agreements_org_idx
  on public.patient_fee_agreements (organization_id, patient_id, valid_from desc);

revoke all on public.patient_fee_agreements from anon, authenticated;
alter table public.patient_fee_agreements enable row level security;

-- Unveraenderlich bis auf den einen Weg, der die Person wechselt: das
-- Zusammenfuehren zweier Akten (merge_patients).
create or replace function app.patient_fee_agreement_stays_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id   is distinct from old.organization_id
     or new.valid_from        is distinct from old.valid_from
     or new.session_fee_cents is distinct from old.session_fee_cents
     or new.created_at        is distinct from old.created_at
     or new.created_by        is distinct from old.created_by then
    raise exception 'fee agreement is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger patient_fee_agreements_frozen
  before update on public.patient_fee_agreements
  for each row execute function app.patient_fee_agreement_stays_frozen();

-- -----------------------------------------------------------------------------
-- 3. Welches Honorar an einem Tag gilt - die eine Stelle (ANN-231)
-- -----------------------------------------------------------------------------
create or replace function app.session_fee_on(
  p_patient_id uuid,
  p_on date,
  out amount_cents integer,
  out source text,
  out fee_agreement_id uuid,
  out valid_from date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select p.organization_id into v_org from public.patients p where p.id = p_patient_id;
  if not found then
    return;
  end if;

  select f.session_fee_cents, 'agreement', f.id, f.valid_from
    into amount_cents, source, fee_agreement_id, valid_from
  from public.patient_fee_agreements f
  where f.patient_id = p_patient_id
    and f.valid_from <= p_on
  order by f.valid_from desc
  limit 1;

  if found then
    return;
  end if;

  select v.session_fee_cents, 'tariff', null::uuid, v.valid_from
    into amount_cents, source, fee_agreement_id, valid_from
  from public.service_catalog_versions v
  where v.id = app.active_service_catalog_version(v_org, p_on)
    and v.session_fee_cents is not null;

  if not found then
    amount_cents := null;
    source := null;
    fee_agreement_id := null;
    valid_from := null;
  end if;
end;
$$;

comment on function app.session_fee_on(uuid, date) is
  'Das am Leistungstag geltende Terminhonorar einer Person (ABR-030, ADR-009 Punkte 5 und 22, ANN-231): die juengste Honorarvereinbarung bis zu diesem Tag, sonst der Tarif der dann gueltigen Preisliste, sonst null.';

revoke all on function app.session_fee_on(uuid, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Lesen, anlegen, entfernen
-- -----------------------------------------------------------------------------
create or replace function public.get_patient_session_fee(p_patient_id uuid)
returns table (
  current_cents      integer,
  current_source     text,
  current_valid_from date,
  agreements         jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_heute date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_billable_services() then
    perform app.record_denied_read(auth.uid(), 'billable_services.read', 'not allowed to read fee agreements');
    return;
  end if;

  v_org := app.current_organization_id();

  if not exists (
    select 1 from public.patients p where p.id = p_patient_id and p.organization_id = v_org
  ) then
    return;
  end if;

  select (now() at time zone o.time_zone)::date into v_heute
  from public.organizations o where o.id = v_org;

  return query
  select h.amount_cents, h.source, h.valid_from,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', f.id,
                    'valid_from', f.valid_from,
                    'session_fee_cents', f.session_fee_cents,
                    'created_at', f.created_at,
                    'created_by_name', up.display_name
                  ) order by f.valid_from desc)
           from public.patient_fee_agreements f
           left join public.user_profiles up on up.id = f.created_by
           where f.patient_id = p_patient_id
         ), '[]'::jsonb)
  from app.session_fee_on(p_patient_id, v_heute) h;
end;
$$;

comment on function public.get_patient_session_fee(uuid) is
  'Das heute geltende Terminhonorar einer Person mit Herkunft (Vereinbarung oder Tarif) und ihre Honorarvereinbarungen (ABR-030). owner und office.';

revoke all on function public.get_patient_session_fee(uuid) from public, anon;
grant execute on function public.get_patient_session_fee(uuid) to authenticated;

create or replace function public.create_patient_fee_agreement(
  p_patient_id uuid,
  p_valid_from date,
  p_session_fee_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage fee agreements' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if not exists (
    select 1 from public.patients p where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = '42501';
  end if;

  if p_valid_from is null then
    raise exception 'valid_from is required' using errcode = '22023';
  end if;

  if p_session_fee_cents is null or p_session_fee_cents not between 0 and 1000000 then
    raise exception 'session fee out of range' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.patient_fee_agreements f
    where f.patient_id = p_patient_id and f.valid_from = p_valid_from
  ) then
    raise exception 'a fee agreement from this day already exists' using errcode = '23505';
  end if;

  insert into public.patient_fee_agreements (
    organization_id, patient_id, valid_from, session_fee_cents, created_by
  )
  values (v_org, p_patient_id, p_valid_from, p_session_fee_cents, v_actor)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_patient_fee_agreement(uuid, date, integer) is
  'Legt eine Honorarvereinbarung ab einem Tag an (ABR-030, ANN-231). Nur owner. Bereits festgeschriebene Honorare aendert sie nicht (ANN-232).';

revoke all on function public.create_patient_fee_agreement(uuid, date, integer) from public, anon;
grant execute on function public.create_patient_fee_agreement(uuid, date, integer) to authenticated;

create or replace function public.delete_patient_fee_agreement(p_agreement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage fee agreements' using errcode = '42501';
  end if;

  begin
    delete from public.patient_fee_agreements f
     where f.id = p_agreement_id
       and f.organization_id = app.current_organization_id();
  exception
    -- Eine angewandte Vereinbarung ist der Nachweis eines festgeschriebenen
    -- Honorars (ABR-031) und bleibt.
    when foreign_key_violation then
      raise exception 'fee agreement is already applied' using errcode = '23514';
  end;

  if not found then
    raise exception 'fee agreement not found' using errcode = '42501';
  end if;
end;
$$;

comment on function public.delete_patient_fee_agreement(uuid) is
  'Entfernt eine Honorarvereinbarung, die noch an keinem Termin angewandt wurde (ABR-030). Nur owner.';

revoke all on function public.delete_patient_fee_agreement(uuid) from public, anon;
grant execute on function public.delete_patient_fee_agreement(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Bestandsfunktionen, die die neue Tabelle und Spalte kennen muessen
--
-- Wortgleich aus dem geltenden Stand uebernommen; geaendert sind nur die
-- mit ABR-030 markierten Stellen.
-- -----------------------------------------------------------------------------

-- Eine Kopie der Preisliste nimmt den Tarif mit.
CREATE OR REPLACE FUNCTION public.create_service_catalog_version(p_label text, p_valid_from date, p_copy_from uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_label text;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_label := nullif(btrim(p_label), '');
  if v_label is null then
    raise exception 'label is required' using errcode = '22023';
  end if;

  if p_valid_from is null then
    raise exception 'valid_from is required' using errcode = '22023';
  end if;

  insert into public.service_catalog_versions (organization_id, label, valid_from, created_by)
  values (v_org, v_label, p_valid_from, v_actor)
  returning id into v_id;

  -- ABR-030: Die Kopie nimmt den Tarif des Terminhonorars mit.
  if p_copy_from is not null then
    update public.service_catalog_versions n
       set session_fee_cents = q.session_fee_cents
      from public.service_catalog_versions q
     where n.id = v_id
       and q.id = p_copy_from
       and q.organization_id = v_org;
  end if;

  if p_copy_from is not null then
    insert into public.service_catalog_items (
      organization_id, catalog_version_id, sort_order, code, label,
      item_kind, remedy, unit_price_cents, currency, tax_treatment, tax_rate_permille,
      service_area, created_by
    )
    select v_org, v_id, q.sort_order, q.code, q.label,
           q.item_kind, q.remedy, q.unit_price_cents, q.currency,
           q.tax_treatment, q.tax_rate_permille, q.service_area, v_actor
    from public.service_catalog_items q
    join public.service_catalog_versions qv on qv.id = q.catalog_version_id
    where q.catalog_version_id = p_copy_from
      and qv.organization_id = v_org;

    -- Eine Vorlage, die es nicht gibt, ist ein Tippfehler und kein leerer
    -- Entwurf: Sonst entstuende stillschweigend eine Preisliste ohne Preise.
    if not exists (
      select 1 from public.service_catalog_items where catalog_version_id = v_id
    ) then
      raise exception 'copy source has no items' using errcode = '22023';
    end if;
  end if;


  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION app.patient_merge_plan(p_organization_id uuid, p_source uuid, p_target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quelle     record;
  v_ziel       record;
  v_konflikte  text[] := '{}';
  v_angehaengt text[] := '{}';
  v_sperren    text[] := '{}';
  v_zaehler    jsonb;
  v_text       text;
  v_feld       text;
begin
  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work, c.fax,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_quelle
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_source and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  select p.id, p.status, p.care_concluded_on, p.person_id,
         pe.given_name, pe.family_name,
         c.date_of_birth, c.email, c.phone, c.phone_mobile, c.phone_work, c.fax,
         c.institution, c.street, c.house_number, c.postal_code, c.city,
         d.primary_therapist_staff_member_id, d.treatment_table_required,
         d.home_visit_access_note, d.special_note, d.remark, d.take_along_items
    into v_ziel
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details c on c.patient_id = p.id
  left join public.patient_care_details d on d.patient_id = p.id
  where p.id = p_target and p.organization_id = p_organization_id;
  if not found then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  -- Felder, in denen beide Akten etwas anderes tragen: Die bleibende gewinnt,
  -- die Vorschau zeigt beide (ANN-147). Die Anschrift zaehlt als ein Feld.
  foreach v_feld in array array[
    'given_name', 'family_name', 'date_of_birth', 'email', 'phone', 'phone_mobile',
    'phone_work', 'fax', 'institution', 'primary_therapist_staff_member_id',
    'treatment_table_required'
  ] loop
    if (to_jsonb(v_quelle) ->> v_feld) is not null
       and (to_jsonb(v_ziel) ->> v_feld) is not null
       and lower(btrim(to_jsonb(v_quelle) ->> v_feld)) <> lower(btrim(to_jsonb(v_ziel) ->> v_feld)) then
      v_konflikte := v_konflikte || v_feld;
    end if;
  end loop;

  if coalesce(v_quelle.street, v_quelle.house_number, v_quelle.postal_code, v_quelle.city) is not null
     and coalesce(v_ziel.street, v_ziel.house_number, v_ziel.postal_code, v_ziel.city) is not null
     and row(lower(v_quelle.street), lower(v_quelle.house_number), v_quelle.postal_code, lower(v_quelle.city))
         is distinct from
         row(lower(v_ziel.street), lower(v_ziel.house_number), v_ziel.postal_code, lower(v_ziel.city)) then
    v_konflikte := v_konflikte || 'address'::text;
  end if;

  -- Freitexte: angehaengt, nie verworfen - aber nie ueber die Grenze der
  -- Spalte hinaus gekuerzt. Dann sperrt der Vorgang (ANN-149).
  v_text := app.merge_note(v_ziel.home_visit_access_note, v_quelle.home_visit_access_note);
  if v_text is distinct from v_ziel.home_visit_access_note and v_ziel.home_visit_access_note is not null then
    v_angehaengt := v_angehaengt || 'home_visit_access_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.special_note, v_quelle.special_note);
  if v_text is distinct from v_ziel.special_note and v_ziel.special_note is not null then
    v_angehaengt := v_angehaengt || 'special_note'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 1000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  v_text := app.merge_note(v_ziel.remark, v_quelle.remark);
  if v_text is distinct from v_ziel.remark and v_ziel.remark is not null then
    v_angehaengt := v_angehaengt || 'remark'::text;
  end if;
  if length(btrim(coalesce(v_text, ''))) > 2000 then
    v_sperren := v_sperren || 'note_too_long'::text;
  end if;

  if not app.take_along_items_valid(
    app.merge_take_along(v_ziel.take_along_items, v_quelle.take_along_items)
  ) then
    v_sperren := v_sperren || 'take_along_too_many'::text;
  end if;

  -- Ein Konto an der Dublette: Es verloere seine Akte. Das klaert die Praxis
  -- vorher, nicht der Vorgang (ANN-149).
  if exists (
    select 1 from public.user_profiles up where up.person_id = v_quelle.person_id
  ) then
    v_sperren := v_sperren || 'source_has_account'::text;
  end if;

  -- Zwei Entwuerfe fuer denselben Monat und Bereich: Einer muss vorher weg.
  if exists (
    select 1
    from public.invoices q
    join public.invoices z
      on z.patient_id = p_target
     and z.status = 'draft'
     and z.period_month = q.period_month
     and z.service_area = q.service_area
    where q.patient_id = p_source
      and q.status = 'draft'
  ) then
    v_sperren := v_sperren || 'draft_invoice_overlap'::text;
  end if;

  -- Zwei offene Eintraege ohne Grundlage auf der Warteliste. Mit Grundlage
  -- koennen sie nicht zusammenstossen: Die Grundlagen wandern mit.
  if exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_source and w.status = 'open' and w.treatment_basis_id is null
  ) and exists (
    select 1 from public.waitlist_entries w
    where w.patient_id = p_target and w.status = 'open' and w.treatment_basis_id is null
  ) then
    v_sperren := v_sperren || 'open_waitlist_overlap'::text;
  end if;

  -- ABR-030: Zwei Honorarvereinbarungen ab demselben Tag haetten keine
  -- Antwort auf die Frage, welche gilt.
  if exists (
    select 1
    from public.patient_fee_agreements q
    join public.patient_fee_agreements z on z.valid_from = q.valid_from
    where q.patient_id = p_source and z.patient_id = p_target
  ) then
    v_sperren := v_sperren || 'fee_agreement_overlap'::text;
  end if;

  v_zaehler := jsonb_build_object(
    'appointments',
      (select count(*) from public.appointments a where a.patient_id = p_source),
    'treatment_notes',
      (select count(*) from public.treatment_notes n
         join public.appointments a on a.id = n.appointment_id
        where a.patient_id = p_source),
    'treatment_bases',
      (select count(*) from public.treatment_bases b where b.patient_id = p_source),
    'billable_services',
      (select count(*) from public.billable_services s where s.patient_id = p_source),
    'invoices',
      (select count(*) from public.invoices i where i.patient_id = p_source),
    'invoices_issued',
      (select count(*) from public.invoices i where i.patient_id = p_source and i.status = 'issued'),
    'invoice_recipients',
      (select count(*) from public.invoice_recipients r where r.patient_id = p_source),
    'fee_agreements',
      (select count(*) from public.patient_fee_agreements f where f.patient_id = p_source),
    'patient_files',
      (select count(*) from public.patient_files f where f.patient_id = p_source),
    'privacy_records',
      (select count(*) from public.patient_privacy_records r where r.patient_id = p_source),
    'questionnaire_responses',
      (select count(*) from public.patient_questionnaire_responses r where r.patient_id = p_source),
    'course_events',
      (select count(*) from public.patient_course_events e where e.patient_id = p_source),
    'therapy_reports',
      (select count(*) from public.therapy_reports r where r.patient_id = p_source),
    'tasks',
      (select count(*) from public.tasks t where t.patient_id = p_source),
    'waitlist_entries',
      (select count(*) from public.waitlist_entries w where w.patient_id = p_source),
    'legal_holds',
      (select count(*) from public.legal_holds h
        where h.subject_type = 'patient' and h.subject_id = p_source)
  );

  return jsonb_build_object(
    'source', jsonb_build_object(
      'id', v_quelle.id, 'given_name', v_quelle.given_name, 'family_name', v_quelle.family_name,
      'date_of_birth', v_quelle.date_of_birth, 'status', v_quelle.status,
      'care_concluded_on', v_quelle.care_concluded_on
    ),
    'target', jsonb_build_object(
      'id', v_ziel.id, 'given_name', v_ziel.given_name, 'family_name', v_ziel.family_name,
      'date_of_birth', v_ziel.date_of_birth, 'status', v_ziel.status,
      'care_concluded_on', v_ziel.care_concluded_on
    ),
    'counts', v_zaehler,
    'conflicts', to_jsonb(v_konflikte),
    'appended', to_jsonb(v_angehaengt),
    'blockers', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from unnest(v_sperren) x)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.merge_patients(p_source_patient_id uuid, p_target_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor       uuid;
  v_org         uuid;
  v_plan        jsonb;
  v_quelle      public.patients%rowtype;
  v_ziel        public.patients%rowtype;
  v_person      uuid;
  v_status      text;
  v_ende_on     date;
  v_ende_at     timestamptz;
  v_ende_by     uuid;
  v_beginn      date;
  v_anschrift   boolean;
  v_fotos       integer := 0;
  v_sperre      uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_merge_patients() then
    perform app.record_denied_write(v_actor, 'patient.merged', 'not allowed to merge patients');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to merge patients' using errcode = '42501';
  end if;

  if p_source_patient_id is not distinct from p_target_patient_id then
    raise exception 'a patient cannot be merged into itself' using errcode = '22023';
  end if;

  -- Beide Akten sperren, in fester Reihenfolge - zwei gleichzeitige Vorgaenge
  -- ueber dasselbe Paar warten aufeinander statt sich zu verklemmen.
  perform 1 from public.patients p
  where p.id in (p_source_patient_id, p_target_patient_id)
    and p.organization_id = v_org
  order by p.id
  for update;

  select * into v_quelle from public.patients p
  where p.id = p_source_patient_id and p.organization_id = v_org;
  select * into v_ziel from public.patients p
  where p.id = p_target_patient_id and p.organization_id = v_org;
  if v_quelle.id is null or v_ziel.id is null then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);
  if jsonb_array_length(v_plan -> 'blockers') > 0 then
    raise exception 'patient merge blocked: %',
      (select string_agg(x, ', ') from jsonb_array_elements_text(v_plan -> 'blockers') x)
      using errcode = '22023';
  end if;

  -- Was vor dem Zusammenfuehren schon faellig war, faellt unter dem Stand, der
  -- es faellig gemacht hat (ADR-017 Punkt 36 und 38).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_quelle.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die Zahlen des Nachweises erst jetzt: Ein eben geloeschtes Foto ist
  -- nicht mitgewandert und steht schon in photos_deleted.
  v_plan := app.patient_merge_plan(v_org, v_quelle.id, v_ziel.id);

  perform pg_catalog.set_config('app.patient_merge', 'on', true);

  -- Stammdaten (ANN-147) --------------------------------------------------
  if exists (select 1 from public.patient_contact_details c where c.patient_id = v_ziel.id) then
    select coalesce(z.street, z.house_number, z.postal_code, z.city) is null
       and coalesce(q.street, q.house_number, q.postal_code, q.city) is not null
      into v_anschrift
    from public.patient_contact_details z
    left join public.patient_contact_details q on q.patient_id = v_quelle.id
    where z.patient_id = v_ziel.id;

    update public.patient_contact_details z
       set date_of_birth = coalesce(z.date_of_birth, q.date_of_birth),
           email         = coalesce(z.email, q.email),
           phone         = coalesce(z.phone, q.phone),
           phone_mobile  = coalesce(z.phone_mobile, q.phone_mobile),
           phone_work    = coalesce(z.phone_work, q.phone_work),
           fax           = coalesce(z.fax, q.fax),
           institution   = coalesce(z.institution, q.institution),
           street        = case when v_anschrift then q.street else z.street end,
           house_number  = case when v_anschrift then q.house_number else z.house_number end,
           postal_code   = case when v_anschrift then q.postal_code else z.postal_code end,
           city          = case when v_anschrift then q.city else z.city end
      from public.patient_contact_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;

    -- Zweiter Schritt, weil der Trigger die Koordinate bei jeder
    -- Adressaenderung leert: Die Anschrift kommt mit ihrer Verortung.
    if v_anschrift then
      update public.patient_contact_details z
         set lat = q.lat, lon = q.lon, geocode_precision = q.geocode_precision
        from public.patient_contact_details q
       where z.patient_id = v_ziel.id
         and q.patient_id = v_quelle.id;
    end if;
  else
    update public.patient_contact_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  if exists (select 1 from public.patient_care_details d where d.patient_id = v_ziel.id) then
    update public.patient_care_details z
       set primary_therapist_staff_member_id =
             coalesce(z.primary_therapist_staff_member_id, q.primary_therapist_staff_member_id),
           treatment_table_required = coalesce(z.treatment_table_required, q.treatment_table_required),
           home_visit_access_note = app.merge_note(z.home_visit_access_note, q.home_visit_access_note),
           special_note           = app.merge_note(z.special_note, q.special_note),
           remark                 = app.merge_note(z.remark, q.remark),
           take_along_items       = app.merge_take_along(z.take_along_items, q.take_along_items)
      from public.patient_care_details q
     where z.patient_id = v_ziel.id
       and q.patient_id = v_quelle.id;
  else
    update public.patient_care_details
       set patient_id = v_ziel.id
     where patient_id = v_quelle.id;
  end if;

  -- Der Bezug wechselt ----------------------------------------------------
  -- Zwei Standardempfaenger kann es nicht geben; der der bleibenden Akte bleibt.
  if exists (
    select 1 from public.invoice_recipients r where r.patient_id = v_ziel.id and r.is_default
  ) then
    update public.invoice_recipients
       set is_default = false
     where patient_id = v_quelle.id and is_default;
  end if;

  update public.invoice_recipients           set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- ABR-030: Die Honorarvereinbarungen ziehen mit; gleiche Tage sperrt der Plan.
  update public.patient_fee_agreements       set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.treatment_bases              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.appointments                 set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.billable_services            set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.invoices                     set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_files                set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_privacy_records      set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_questionnaire_responses set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.patient_course_events        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.therapy_reports              set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.tasks                        set patient_id = v_ziel.id where patient_id = v_quelle.id;
  update public.waitlist_entries             set patient_id = v_ziel.id where patient_id = v_quelle.id;
  -- Ein Legal Hold folgt den Daten, die er schuetzt (ANN-150). Seit ABN-018
  -- (BEF-108) bleiben alle Gruende wirksam: Eine Akte kann mehrere aktive
  -- Sperren tragen, keine wird beim Zusammenfuehren aufgehoben.
  v_sperre := null;
  update public.legal_holds
     set subject_id = v_ziel.id
   where subject_type = 'patient' and subject_id = v_quelle.id;
  -- Fruehere Nachweise der Dublette ziehen mit (ABN-018).
  update public.patient_merge_records set target_patient_id = v_ziel.id
   where target_patient_id = v_quelle.id;

  perform pg_catalog.set_config('app.patient_merge', 'off', true);

  -- Versorgungsstand (ANN-148) --------------------------------------------
  v_status := case
    when v_quelle.status = 'active' or v_ziel.status = 'active' then 'active'
    else 'inactive'
  end;
  v_beginn := least(v_quelle.care_started_on, v_ziel.care_started_on);

  if v_quelle.care_concluded_on is null or v_ziel.care_concluded_on is null then
    null;
  elsif (v_quelle.care_concluded_on, v_quelle.care_concluded_at)
        > (v_ziel.care_concluded_on, v_ziel.care_concluded_at) then
    v_ende_on := v_quelle.care_concluded_on;
    v_ende_at := v_quelle.care_concluded_at;
    v_ende_by := v_quelle.care_concluded_by;
  else
    v_ende_on := v_ziel.care_concluded_on;
    v_ende_at := v_ziel.care_concluded_at;
    v_ende_by := v_ziel.care_concluded_by;
  end if;

  update public.patients
     set status            = v_status,
         care_started_on   = v_beginn,
         care_concluded_on = v_ende_on,
         care_concluded_at = v_ende_at,
         care_concluded_by = v_ende_by
   where id = v_ziel.id;

  -- Die Einwilligungsvermerke beider Akten gelten jetzt gemeinsam: Ein
  -- Widerruf in der einen trifft die aelteren Fotos der anderen - sofort,
  -- wie beim Widerruf selbst (ADR-017 Punkt 36).
  v_fotos := v_fotos + app.delete_due_patient_photos(
    v_org, v_ziel.id, extensions.gen_random_uuid(), v_actor, 'patient_merged'
  );

  -- Die leere Akte faellt (ANN-150) -----------------------------------------
  -- Was noch an ihr haengt, faellt mit ihr (Kontakt und Versorgungsangaben der
  -- Dublette, soweit sie in die bleibende Akte eingeflossen sind).
  delete from public.patient_contact_details where patient_id = v_quelle.id;
  delete from public.patient_care_details where patient_id = v_quelle.id;
  delete from public.patients where id = v_quelle.id;

  -- Die Person nur, wenn nichts anderes an ihr haengt: Mitarbeiter:in, Konto,
  -- Trainingsverhaeltnis (ADR-021) bleiben, wie sie sind.
  v_person := v_quelle.person_id;
  if not exists (select 1 from public.patients p where p.person_id = v_person)
     and not exists (select 1 from public.staff_members s where s.person_id = v_person)
     and not exists (select 1 from public.user_profiles u where u.person_id = v_person)
     and not exists (select 1 from public.training_relationships t where t.person_id = v_person) then
    delete from public.persons where id = v_person;
  end if;

  -- Nachweis an der bleibenden Akte, so lange wie sie (ABN-018, BEF-108):
  -- nicht allein im dreijaehrigen Auditlog.
  insert into public.patient_merge_records (
    organization_id, target_patient_id, source_patient_id, merged_by, counts, photos_deleted
  )
  values (v_org, v_ziel.id, v_quelle.id, v_actor, v_plan -> 'counts', v_fotos);


  return jsonb_build_object(
    'target_patient_id', v_ziel.id,
    'moved', v_plan -> 'counts',
    'photos_deleted', v_fotos
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.export_patient_record(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'take_along_items', v.take_along_items,
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
        'fee_waived_at', t.fee_waived_at,
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
        'confirmed_at', da.confirmed_at,
        'photo_locked_at', da.photo_locked_at
      ) order by da.created_at)
      from public.patient_files da
      where da.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Die Fotos gehoeren zur vollstaendigen Kopie, auch
    -- gesperrte, solange sie vorhanden sind. Die Datei selbst gibt owner je
    -- Foto heraus (hand_out_patient_photo, protokolliert); dieser Abschnitt
    -- ist die Liste dazu.
    'patient_photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fo.id,
        'display_name', fo.display_name,
        'art', fo.document_type,
        'aufgenommen_am', fo.created_at,
        'gesperrt', not app.patient_photo_usable(fo.document_type, fo.patient_id, fo.created_at, fo.photo_locked_at),
        'datei_vorhanden', exists (
          select 1 from storage.objects o
          where o.bucket_id = app.patient_file_bucket_for(fo.document_type) and o.name = fo.object_key)
      ) order by fo.created_at)
      from public.patient_files fo
      where fo.patient_id = p_patient_id
        and app.is_patient_photo_type(fo.document_type)
        and fo.status = 'ready'
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Datum und Zweck der Zugriffe aus dem Auditlog -
    -- ohne Namen und ohne Kennung der Beschaeftigten (Art. 15 Abs. 4 DSGVO);
    -- eine begruendete Ausnahme prueft owner im Einzelfall (ANN-092).
    'access_log', coalesce((
      select jsonb_agg(jsonb_build_object(
        'zeitpunkt', al.occurred_at,
        'aktion', al.action,
        'gegenstand', al.subject_type,
        'ergebnis', al.outcome,
        'durch', case al.actor_kind
                   when 'user' then 'praxis'
                   when 'system' then 'system'
                   when 'platform' then 'person_selbst'
                   when 'representative' then 'vertretung'
                 end
      ) order by al.occurred_at)
      from public.audit_log al
      where al.organization_id = v_org
        -- LOG-EPIC-001: Zugriffe, keine Abweisungen. Die Aktionen sind seit
        -- ADR-010 Fassung 3 ohnehin nur noch, was die Daten nicht zeigen.
        and al.outcome = 'success'
        -- Auch die Zugriffe auf zusammengefuehrte Doppelanlagen gehoeren
        -- zu dieser Person (ABN-018, BEF-108).
        and ((al.subject_type = 'patient' and al.subject_id = any(array(
                select p_patient_id
                union all
                select mr2.source_patient_id from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
             or al.context ->> 'patient_id' = any(array(
                select p_patient_id::text
                union all
                select mr2.source_patient_id::text from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
    ), '[]'::jsonb),

    -- ABN-018 (BEF-108): Nachweise des Zusammenfuehrens an dieser Akte.
    'patient_merge_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'merged_at', mr.merged_at,
        'source_patient_id', mr.source_patient_id,
        'counts', mr.counts
      ) order by mr.merged_at)
      from public.patient_merge_records mr
      where mr.target_patient_id = p_patient_id
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

    -- ABR-030: Honorarvereinbarungen sind Daten zur Person (Art. 15 DSGVO).
    'fee_agreements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'valid_from', f.valid_from,
        'session_fee_cents', f.session_fee_cents,
        'created_at', f.created_at
      ) order by f.valid_from)
      from public.patient_fee_agreements f
      where f.patient_id = p_patient_id
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
        'created_at', ce.created_at,
        -- ABN-013 (BEF-102): Ein entferntes Ereignis bleibt Teil der Akte.
        'removed_at', ce.removed_at
      ) order by ce.occurred_on, ce.created_at)
      from public.patient_course_events ce
      where ce.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-015: gesicherte, noch nicht uebernommene Befundangaben.
    'treatment_draft_findings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', df.appointment_id,
        'findings', df.findings,
        'updated_at', df.updated_at
      ) order by df.updated_at)
      from public.treatment_draft_findings df
      join public.appointments a on a.id = df.appointment_id
      where a.patient_id = p_patient_id
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
    ), '[]'::jsonb),

    -- PRX-001: Wartelisteneintraege mit Wunschfenstern.
    'waitlist_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'treatment_basis_id', w.treatment_basis_id,
        'appointment_type', w.appointment_type,
        'duration_minutes', w.duration_minutes,
        'time_windows', w.time_windows,
        'earliest_on', w.earliest_on,
        'needed_by', w.needed_by,
        'priority_reason', w.priority_reason,
        'note', w.note,
        'status', w.status,
        'placed_appointment_id', w.placed_appointment_id,
        'created_at', w.created_at,
        'closed_at', w.closed_at
      ) order by w.created_at)
      from public.waitlist_entries w
      where w.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-012: Aufgaben und Wiedervorlagen mit Bezug auf diese Person.
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'title', k.title,
        'note', k.note,
        'due_on', k.due_on,
        'status', k.status,
        'assigned_to', nullif(btrim(concat_ws(' ', ape.given_name, ape.family_name)), ''),
        'created_at', k.created_at,
        'done_at', k.done_at
      ) order by k.created_at)
      from public.tasks k
      left join public.staff_members asm on asm.id = k.assigned_staff_member_id
      left join public.persons ape on ape.id = asm.person_id
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-014: Anrufstand der Termine (nicht erreicht, Nachricht hinterlassen).
    'appointment_call_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', c.appointment_id,
        'outcome', c.outcome,
        'attempts', c.attempts,
        'recorded_at', c.recorded_at
      ) order by c.recorded_at)
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where a.patient_id = p_patient_id
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
        'was', 'Inhalt hochgeladener Dateien und Fotos',
        'grund', 'Die Kopie nennt jede Datei mit Name, Art und Pruefsumme und jedes Foto, auch gesperrte; die Datei selbst wird je Datei herausgegeben (ADR-017, ANN-128).'
      ),
      jsonb_build_object(
        'was', 'Namen der Beschaeftigten im Zugriffsprotokoll',
        'grund', 'Das Protokoll nennt Zeitpunkt und Zweck jedes Zugriffs; wer zugegriffen hat, steht nur auf begruendetes Verlangen nach Pruefung im Einzelfall darin (Art. 15 Abs. 4 DSGVO, ANN-092).'
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
$function$;
