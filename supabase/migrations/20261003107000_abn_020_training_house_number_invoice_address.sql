-- =============================================================================
-- ABN-020 (BEF-111): Trainingskontakt mit getrennter Hausnummer, Rechnung nur
-- mit vollstaendiger Anschrift
--
-- Abnahme Jannes, 2026-10-02:
--   1. Getrennte Felder (ANN-177): Der Trainingskontakt fuehrt Strasse und
--      Hausnummer als zwei Felder, wie die Akte. Der Hausbesuch uebernimmt
--      sie unveraendert; die Trennung am letzten Leerzeichen entfaellt
--      (app.split_street_and_house_number). Bestehende Eintraege werden
--      einmal aufgeteilt - nur, was eindeutig ist; der Rest bleibt
--      ungeteilt stehen und ist "zur Pruefung" ableitbar: house_number leer,
--      street enthaelt eine Ziffer. Die Kontaktseite zeigt das.
--   2. Rechnung (ANN-182): Eine Rechnung wird ohne vollstaendige
--      Empfaengeranschrift (Strasse, Hausnummer, PLZ, Ort) nicht
--      ausgestellt. Die Sperre sitzt in issue_invoice - auf Wunsch von
--      Jannes (Freigabe 2026-10-02) fuer alle Rechnungen, nicht nur im
--      Training: an die Patientin selbst, an einen hinterlegten Empfaenger
--      und an die Trainingskund:in. Die Fehlermeldung nennt die fehlenden
--      Felder (DETAIL), die Oberflaeche uebersetzt sie.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Spalte und einmalige Aufteilung
-- -----------------------------------------------------------------------------
alter table public.training_contact_details
  add column house_number text
    check (house_number is null or length(btrim(house_number)) between 1 and 20);

comment on column public.training_contact_details.house_number is
  'Hausnummer, getrennt von der Strasse wie in der Akte (ABN-020, BEF-111, ANN-177 Fassung 2).';

-- Eindeutig ist eine Aufteilung, wenn die Hausnummer mit einer Ziffer beginnt
-- (das prueft die Trennfunktion) und der Rest nicht selbst auf eine
-- einzelne Zahl oder einen einzelnen Grossbuchstaben endet ("B 27",
-- "Strasse 4 12"). Der Rest bleibt ungeteilt zur Pruefung stehen.
with geteilt as (
  select d.training_relationship_id, s.street, s.house_number
  from public.training_contact_details d
  cross join lateral app.split_street_and_house_number(d.street) s
  where s.house_number is not null
    and s.street !~ '(^|\s)([0-9]+|[A-Z])$'
)
update public.training_contact_details d
   set street = g.street,
       house_number = g.house_number
  from geteilt g
 where g.training_relationship_id = d.training_relationship_id;

-- -----------------------------------------------------------------------------
-- 2. Schreib- und Lesewege
-- -----------------------------------------------------------------------------
drop function app.write_training_contact(uuid, uuid, uuid, date, text, text, text, text, text);

create function app.write_training_contact(
  p_relationship_id uuid, p_org uuid, p_actor uuid, p_date_of_birth date, p_email text,
  p_phone text, p_street text, p_house_number text, p_postal_code text, p_city text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_date_of_birth is not null and p_date_of_birth > app.training_today(p_org) then
    raise exception 'date of birth is in the future' using errcode = '22023';
  end if;

  insert into public.training_contact_details as d (
    training_relationship_id, organization_id, date_of_birth, email, phone,
    street, house_number, postal_code, city, created_by
  )
  values (
    p_relationship_id, p_org, p_date_of_birth,
    lower(app.leer_zu_null(p_email)), app.leer_zu_null(p_phone),
    app.leer_zu_null(p_street), app.leer_zu_null(p_house_number),
    app.leer_zu_null(p_postal_code), app.leer_zu_null(p_city),
    p_actor
  )
  on conflict (training_relationship_id) do update
     set date_of_birth = excluded.date_of_birth,
         email         = excluded.email,
         phone         = excluded.phone,
         street        = excluded.street,
         house_number  = excluded.house_number,
         postal_code   = excluded.postal_code,
         city          = excluded.city,
         updated_at    = now(),
         updated_by    = p_actor;
end;
$$;

revoke all on function app.write_training_contact(uuid, uuid, uuid, date, text, text, text, text, text, text) from public, anon, authenticated;

-- Der Hausbesuch uebernimmt die Felder unveraendert.
create or replace function app.training_visit_address(p_relationship_id uuid)
returns table (street text, house_number text, postal_code text, city text)
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(d.street), ''), nullif(btrim(d.house_number), ''),
         nullif(btrim(d.postal_code), ''), nullif(btrim(d.city), '')
  from public.training_contact_details d
  where d.training_relationship_id = p_relationship_id
$$;

drop function app.split_street_and_house_number(text);

drop function public.create_training_client(text, text, date, text, text, text, text, text, date);
CREATE OR REPLACE FUNCTION public.create_training_client(p_given_name text, p_family_name text, p_date_of_birth date DEFAULT NULL::date, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_contract_started_on date DEFAULT NULL::date, p_house_number text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_person uuid;
  v_id     uuid;
  v_start  date;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    -- Abgewiesen mit bestaetigtem denied-Eintrag und HTTP 403 (G6c).
    perform app.record_denied_write(v_actor, 'training_relationship.created', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  if app.leer_zu_null(p_given_name) is null or app.leer_zu_null(p_family_name) is null then
    raise exception 'name is required' using errcode = '22023';
  end if;

  -- Ohne Angabe beginnt der Vertrag heute.
  v_start := coalesce(p_contract_started_on, app.training_today(v_org));

  insert into public.persons (organization_id, given_name, family_name, created_by)
  values (v_org, btrim(p_given_name), btrim(p_family_name), v_actor)
  returning id into v_person;

  insert into public.training_relationships (
    organization_id, person_id, status, contract_started_on, created_by
  )
  values (v_org, v_person, 'active', v_start, v_actor)
  returning id into v_id;

  perform app.write_training_contact(
    v_id, v_org, v_actor, p_date_of_birth, p_email, p_phone, p_street, p_house_number, p_postal_code, p_city
  );

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.created', 'training_relationship', v_id, 'success',
    -- Kein Name, kein Kontakt: Metadaten reichen fuer den Nachweis (ADR-010 Punkt 3).
    jsonb_build_object('surface', 'web', 'new_person', true)
  );

  return v_id;
end;
$function$
;

revoke all on function public.create_training_client(text, text, date, text, text, text, text, text, date, text) from public, anon;
grant execute on function public.create_training_client(text, text, date, text, text, text, text, text, date, text) to authenticated;

drop function public.start_training_for_person(uuid, date, date, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.start_training_for_person(p_person_id uuid, p_contract_started_on date DEFAULT NULL::date, p_date_of_birth date DEFAULT NULL::date, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_house_number text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_relationship.created', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  -- Die Person sperren und pruefen, dass der Aufrufer sie aus dem anderen
  -- Bereich kennt. app.is_staff() ist die Behandlungsseite; die Trainings-
  -- betreuung allein hat sie nicht.
  perform 1
  from public.persons pe
  where pe.id = p_person_id
    and pe.organization_id = v_org
    and app.is_staff()
    and (
      exists (select 1 from public.patients x where x.person_id = pe.id and x.organization_id = v_org)
      or exists (select 1 from public.staff_members x where x.person_id = pe.id and x.organization_id = v_org)
    )
  for update of pe;
  if not found then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.training_relationships t where t.person_id = p_person_id) then
    raise exception 'training relationship already exists' using errcode = '23505';
  end if;

  insert into public.training_relationships (
    organization_id, person_id, status, contract_started_on, created_by
  )
  values (
    v_org, p_person_id, 'active',
    coalesce(p_contract_started_on, app.training_today(v_org)), v_actor
  )
  returning id into v_id;

  -- Aus der Akte wird nichts uebernommen (ANN-173). Was im Formular steht,
  -- hat die anlegende Person fuer das Training eingegeben - das kommt mit,
  -- sonst gingen ihre Eingaben still verloren (Zweitreview TRN-EPIC-001).
  perform app.write_training_contact(
    v_id, v_org, v_actor, p_date_of_birth, p_email, p_phone, p_street, p_house_number, p_postal_code, p_city
  );

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.created', 'training_relationship', v_id, 'success',
    jsonb_build_object('surface', 'web', 'new_person', false)
  );

  return v_id;
end;
$function$
;


revoke all on function public.start_training_for_person(uuid, date, date, text, text, text, text, text, text) from public, anon;
grant execute on function public.start_training_for_person(uuid, date, date, text, text, text, text, text, text) to authenticated;

drop function public.update_training_client(uuid, text, text, date, text, text, text, text, text, date);
CREATE OR REPLACE FUNCTION public.update_training_client(p_relationship_id uuid, p_given_name text, p_family_name text, p_date_of_birth date, p_email text, p_phone text, p_street text, p_postal_code text, p_city text, p_contract_started_on date, p_house_number text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor  uuid;
  v_org    uuid;
  v_person uuid;
  v_ende   date;
  v_alt    record;
  v_felder text[] := '{}';
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_write_training_relationships() then
    perform app.record_denied_write(v_actor, 'training_relationship.updated', 'not allowed to manage training clients');
    return null;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage training clients' using errcode = '42501';
  end if;

  if app.leer_zu_null(p_given_name) is null or app.leer_zu_null(p_family_name) is null then
    raise exception 'name is required' using errcode = '22023';
  end if;

  select t.person_id, t.contract_ended_on into v_person, v_ende
  from public.training_relationships t
  where t.id = p_relationship_id and t.organization_id = v_org
  for update;
  if not found then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  if p_contract_started_on is null then
    raise exception 'contract start is required' using errcode = '22023';
  end if;
  if v_ende is not null and p_contract_started_on > v_ende then
    raise exception 'contract start is after the contract end' using errcode = '22023';
  end if;

  -- Welche Felder sich aendern - nur die Namen der Felder gehen ins Protokoll.
  select pe.given_name, pe.family_name, t.contract_started_on,
         d.date_of_birth, d.email, d.phone, d.street, d.house_number, d.postal_code, d.city
    into v_alt
  from public.training_relationships t
  join public.persons pe on pe.id = t.person_id
  left join public.training_contact_details d on d.training_relationship_id = t.id
  where t.id = p_relationship_id;

  if v_alt.given_name is distinct from btrim(p_given_name)
     or v_alt.family_name is distinct from btrim(p_family_name) then
    v_felder := array_append(v_felder, 'name');
  end if;
  if v_alt.contract_started_on is distinct from p_contract_started_on then
    v_felder := array_append(v_felder, 'contract_started_on');
  end if;
  if v_alt.date_of_birth is distinct from p_date_of_birth
     or v_alt.email is distinct from lower(app.leer_zu_null(p_email))
     or v_alt.phone is distinct from app.leer_zu_null(p_phone)
     or v_alt.street is distinct from app.leer_zu_null(p_street)
     or v_alt.house_number is distinct from app.leer_zu_null(p_house_number)
     or v_alt.postal_code is distinct from app.leer_zu_null(p_postal_code)
     or v_alt.city is distinct from app.leer_zu_null(p_city) then
    v_felder := array_append(v_felder, 'contact');
  end if;

  if cardinality(v_felder) = 0 then
    return p_relationship_id;
  end if;

  -- Der Name einer Mitarbeiter:in oder eines Kontos gehoert in die
  -- Mitarbeiterstammdaten: Aendern darf ihn dort nur, wer sie pflegt
  -- (app.can_manage_staff_master_data, ANN-174). Aus dem Training heraus
  -- ginge das an Pruefung und Protokoll vorbei (Zweitreview TRN-EPIC-001).
  -- Die Meldung verraet nichts, was §4.8 schuetzt: Zugehoerigkeit zum Team
  -- ist kein Behandlungsdatum.
  if array_position(v_felder, 'name') is not null
     and not app.can_manage_staff_master_data()
     and (
       exists (select 1 from public.staff_members x where x.person_id = v_person)
       or exists (select 1 from public.user_profiles x where x.person_id = v_person)
     ) then
    raise exception 'name is managed in staff master data' using errcode = '42501';
  end if;

  -- Der Name gehoert der Person, nicht dem Verhaeltnis (ANN-174).
  update public.persons
     set given_name = btrim(p_given_name), family_name = btrim(p_family_name)
   where id = v_person
     and (given_name is distinct from btrim(p_given_name)
          or family_name is distinct from btrim(p_family_name));

  update public.training_relationships
     set contract_started_on = p_contract_started_on
   where id = p_relationship_id
     and contract_started_on is distinct from p_contract_started_on;

  perform app.write_training_contact(
    p_relationship_id, v_org, v_actor, p_date_of_birth, p_email, p_phone, p_street, p_house_number, p_postal_code, p_city
  );

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.updated', 'training_relationship', p_relationship_id, 'success',
    jsonb_build_object('surface', 'web', 'fields', to_jsonb(v_felder))
  );

  return p_relationship_id;
end;
$function$
;

revoke all on function public.update_training_client(uuid, text, text, date, text, text, text, text, text, date, text) from public, anon;
grant execute on function public.update_training_client(uuid, text, text, date, text, text, text, text, text, date, text) to authenticated;

drop function public.get_training_client(uuid);
CREATE OR REPLACE FUNCTION public.get_training_client(p_relationship_id uuid)
 RETURNS TABLE(id uuid, person_id uuid, given_name text, family_name text, status text, contract_started_on date, contract_ended_on date, date_of_birth date, email text, phone text, street text, house_number text, postal_code text, city text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_org   uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_training_relationships() then
    perform app.record_denied_read(v_actor, 'training_relationship.viewed', 'not allowed to read training clients');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read training clients' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.training_relationships t
    where t.id = p_relationship_id and t.organization_id = v_org
  ) then
    raise exception 'training relationship not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'training_relationship.viewed', 'training_relationship', p_relationship_id, 'success',
    jsonb_build_object('surface', 'web')
  );

  return query
    select t.id, t.person_id, pe.given_name, pe.family_name, t.status,
           t.contract_started_on, t.contract_ended_on,
           d.date_of_birth, d.email, d.phone, d.street, d.house_number, d.postal_code, d.city
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    left join public.training_contact_details d on d.training_relationship_id = t.id
    where t.id = p_relationship_id;
end;
$function$
;

revoke all on function public.get_training_client(uuid) from public, anon;
grant execute on function public.get_training_client(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Rechnung nur mit vollstaendiger Empfaengeranschrift
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.build_invoice_document(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invoice   record;
  v_profile   record;
  v_items     jsonb;
  v_gruppen   jsonb;
  v_basen     jsonb;
  v_empfaenger jsonb;
  v_patient   jsonb;
  v_summe     integer;
  v_steuer    integer;
  v_waehrung  text;
  v_anzahl    integer;
begin
  select i.* into v_invoice from public.invoices i where i.id = p_invoice_id;
  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  select b.* into v_profile
  from public.practice_billing_profiles b
  where b.organization_id = v_invoice.organization_id;

  if not found then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  -- Die Zeilen. Preis, Bezeichnung und Steuerkennzeichen kommen aus der
  -- Katalogposition - sie ist unveraenderlich, solange ihre Preisliste in
  -- Kraft ist (ABR-001).
  select jsonb_agg(z.zeile order by z.sort_order),
         sum(z.brutto)::integer,
         count(*)::integer,
         max(z.currency)
    into v_items, v_summe, v_anzahl, v_waehrung
  from (
    select it.sort_order,
           c.currency,
           (b.quantity * c.unit_price_cents) as brutto,
           jsonb_build_object(
             'performed_on',      b.performed_on,
             'code',              c.code,
             'label',             c.label,
             'item_kind',         c.item_kind,
             'quantity',          b.quantity,
             'unit_price_cents',  c.unit_price_cents,
             'line_total_cents',  b.quantity * c.unit_price_cents,
             'currency',          c.currency,
             'tax_treatment',     c.tax_treatment,
             'tax_rate_permille', c.tax_rate_permille
           ) as zeile
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = p_invoice_id
  ) z;

  if v_anzahl is null or v_anzahl = 0 then
    raise exception 'invoice has no items' using errcode = '22023';
  end if;

  if (select count(distinct c.currency)
        from public.invoice_items it
        join public.billable_services b     on b.id = it.billable_service_id
        join public.service_catalog_items c on c.id = b.catalog_item_id
       where it.invoice_id = p_invoice_id) > 1 then
    raise exception 'an invoice cannot mix currencies' using errcode = '22023';
  end if;

  -- Steuergruppen: je Kennzeichen und Satz der Bruttobetrag, die darin
  -- enthaltene Steuer und der Nettobetrag. Unter der Kleinunternehmerregelung
  -- ist die enthaltene Steuer null - auch bei einer steuerpflichtigen
  -- Position (Par. 19 UStG). Der Grund der Befreiung steht an der Gruppe
  -- (ABR-006, ANN-082).
  select jsonb_agg(g.gruppe order by g.tax_treatment, g.tax_rate_permille),
         sum(g.steuer)::integer
    into v_gruppen, v_steuer
  from (
    select c.tax_treatment,
           c.tax_rate_permille,
           sum(b.quantity * c.unit_price_cents)::integer as brutto,
           case
             when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
             else round(sum(b.quantity * c.unit_price_cents)::numeric
                        * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
           end as steuer,
           jsonb_build_object(
             'tax_treatment',     c.tax_treatment,
             'tax_rate_permille', c.tax_rate_permille,
             'gross_cents',       sum(b.quantity * c.unit_price_cents)::integer,
             'tax_cents',
               case
                 when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
                 else round(sum(b.quantity * c.unit_price_cents)::numeric
                            * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
               end,
             'net_cents',
               sum(b.quantity * c.unit_price_cents)::integer
               - case
                   when v_profile.small_business or c.tax_treatment <> 'taxable' then 0
                   else round(sum(b.quantity * c.unit_price_cents)::numeric
                              * c.tax_rate_permille / (1000 + c.tax_rate_permille))::integer
                 end,
             'exemption_reason', app.tax_exemption_reason(c.tax_treatment)
           ) as gruppe
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = p_invoice_id
    group by c.tax_treatment, c.tax_rate_permille
  ) g;

  -- Verordnungsbezug: Bauart, Ausstellungsdatum, Verordner:in. Ausdruecklich
  -- ohne Diagnose, Therapieziel und Verordnerhinweis - die Rechnung geht an
  -- Dritte (ADR-004 Fassung 2, Datensparsamkeit).
  select jsonb_agg(v.eintrag order by v.issued_on)
    into v_basen
  from (
    select distinct tb.issued_on,
           jsonb_build_object(
             'kind',       tb.treatment_basis_kind,
             'issued_on',  tb.issued_on,
             'prescriber',
               case when pr.id is null then null
                    else btrim(coalesce(pr.title || ' ', '') || pr.given_name || ' ' || pr.family_name)
               end
           ) as eintrag
    from public.invoice_items it
    join public.billable_services b on b.id = it.billable_service_id
    join public.appointments a      on a.id = b.appointment_id
    join public.treatment_bases tb  on tb.id = a.treatment_basis_id
    left join public.prescribers pr on pr.id = tb.prescriber_id
    where it.invoice_id = p_invoice_id
  ) v;

  -- Empfaenger: die hinterlegte Zeile oder, wenn keine gewaehlt ist, die
  -- Patientin selbst (ANN-076).
  --
  -- TRN-008 (ANN-182): Eine Trainingsrechnung geht an die Kund:in selbst, mit
  -- der Anschrift aus dem Trainingskontakt - nie aus der Akte, auch wenn
  -- dieselbe Person eine hat (ADR-021 Punkt 3). Seit ABN-020 (BEF-111) mit
  -- Strasse und Hausnummer in getrennten Feldern wie in der Akte.
  if v_invoice.training_relationship_id is not null then
    select jsonb_build_object(
             'kind',         'self',
             'name',         pe.given_name || ' ' || pe.family_name,
             'street',       tc.street,
             'house_number', tc.house_number,
             'postal_code',  tc.postal_code,
             'city',         tc.city,
             'reference',    null
           )
      into v_empfaenger
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    left join public.training_contact_details tc on tc.training_relationship_id = t.id
    where t.id = v_invoice.training_relationship_id;
  elsif v_invoice.recipient_id is null then
    select jsonb_build_object(
             'kind',         'self',
             'name',         pe.given_name || ' ' || pe.family_name,
             'street',       pc.street,
             'house_number', pc.house_number,
             'postal_code',  pc.postal_code,
             'city',         pc.city,
             'reference',    null
           )
      into v_empfaenger
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details pc on pc.patient_id = p.id
    where p.id = v_invoice.patient_id;
  else
    select jsonb_build_object(
             'kind',         r.recipient_kind,
             'name',         r.name,
             'street',       r.street,
             'house_number', r.house_number,
             'postal_code',  r.postal_code,
             'city',         r.city,
             'reference',    r.reference
           )
      into v_empfaenger
    from public.invoice_recipients r
    where r.id = v_invoice.recipient_id;
  end if;

  -- Die behandelte Person steht auch dann auf der Rechnung, wenn jemand
  -- anderes sie bezahlt - sonst liesse sich die Leistung nicht zuordnen.
  --
  -- TRN-008 (ANN-182): Im Training ist sie zugleich die Empfaengerin; das
  -- Geburtsdatum dient in der Behandlung der Zuordnung bei Beihilfe und
  -- Versicherung und bleibt im Training weg (Datenminimierung, Art. 5 Abs. 1
  -- lit. c DSGVO). Der Schluessel heisst im Snapshot weiter `patient`: Er
  -- nennt die Person, fuer die geleistet wurde; die Beschriftung waehlt die
  -- Darstellung am Bereich.
  if v_invoice.training_relationship_id is not null then
    select jsonb_build_object(
             'name',          pe.given_name || ' ' || pe.family_name,
             'date_of_birth', null
           )
      into v_patient
    from public.training_relationships t
    join public.persons pe on pe.id = t.person_id
    where t.id = v_invoice.training_relationship_id;
  else
    select jsonb_build_object(
             'name',          pe.given_name || ' ' || pe.family_name,
             'date_of_birth', pc.date_of_birth
           )
      into v_patient
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details pc on pc.patient_id = p.id
    where p.id = v_invoice.patient_id;
  end if;

  return jsonb_build_object(
    'schema_version', 3,
    'period_month', v_invoice.period_month,
    'service_area', v_invoice.service_area,
    'currency', v_waehrung,
    'issuer', jsonb_build_object(
      'legal_name',        v_profile.legal_name,
      'street',            v_profile.street,
      'house_number',      v_profile.house_number,
      'postal_code',       v_profile.postal_code,
      'city',              v_profile.city,
      'phone',             v_profile.phone,
      'email',             v_profile.email,
      'tax_number',        v_profile.tax_number,
      'vat_id',            v_profile.vat_id,
      'small_business',    v_profile.small_business,
      'bank_name',         v_profile.bank_name,
      'account_holder',    v_profile.account_holder,
      'iban',              v_profile.iban,
      'bic',               v_profile.bic,
      'payment_term_days', v_profile.payment_term_days
    ),
    'recipient', v_empfaenger,
    'patient', v_patient,
    'treatment_bases', coalesce(v_basen, '[]'::jsonb),
    'items', v_items,
    'tax_groups', coalesce(v_gruppen, '[]'::jsonb),
    'totals', jsonb_build_object(
      'total_cents', v_summe,
      'tax_total_cents', coalesce(v_steuer, 0)
    )
  );
end;
$function$
;

create function app.assert_invoice_recipient_address(p_recipient jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_fehlt text[] := '{}';
begin
  if nullif(btrim(p_recipient ->> 'street'), '') is null then v_fehlt := array_append(v_fehlt, 'street'); end if;
  if nullif(btrim(p_recipient ->> 'house_number'), '') is null then v_fehlt := array_append(v_fehlt, 'house_number'); end if;
  if nullif(btrim(p_recipient ->> 'postal_code'), '') is null then v_fehlt := array_append(v_fehlt, 'postal_code'); end if;
  if nullif(btrim(p_recipient ->> 'city'), '') is null then v_fehlt := array_append(v_fehlt, 'city'); end if;
  if cardinality(v_fehlt) > 0 then
    raise exception 'invoice recipient address incomplete'
      using errcode = '22023', detail = array_to_string(v_fehlt, ',');
  end if;
end;
$$;

comment on function app.assert_invoice_recipient_address(jsonb) is
  'Keine Rechnung ohne vollstaendige Empfaengeranschrift: Strasse, Hausnummer, PLZ, Ort (ABN-020, BEF-111). DETAIL nennt die fehlenden Felder.';

revoke all on function app.assert_invoice_recipient_address(jsonb) from public, anon;

CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_nummer   text;
  v_prefix   text;
  v_frist    smallint;
  v_dokument jsonb;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'invoice is already issued' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  select b.payment_term_days into v_frist
  from public.practice_billing_profiles b
  where b.organization_id = v_org;

  -- Ohne Absender keine Rechnung. Der Hinweis nennt die Luecke, damit die
  -- Oberflaeche nicht raten muss, was fehlt (ADR-009 Punkt 10).
  if not found then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  -- Das Kuerzel des Kreises, in den diese Rechnung gehoert (ABR-010).
  v_prefix := app.invoice_number_prefix(v_org, v_invoice.service_area);

  v_dokument := app.build_invoice_document(p_invoice_id);

  -- Der Par. 14c-Riegel (ABR-007, ADR-009 Punkt 18). Er steht hier und nicht
  -- in der Oberflaeche, weil die Steuerschuld mit dem **Ausweis** entsteht -
  -- nicht mit der Zahlung und nicht mit der Absicht. Was einmal falsch
  -- draufsteht, kostet ein Storno (Punkt 9).
  perform app.assert_invoice_tax_lawful(v_dokument);
  -- ABN-020 (BEF-111): keine Rechnung ohne vollstaendige Empfaengeranschrift.
  perform app.assert_invoice_recipient_address(v_dokument -> 'recipient');

  v_nummer := app.next_invoice_number(
    v_org, extract(year from v_heute)::smallint, v_invoice.service_area, v_prefix);

  -- Der Snapshot traegt Nummer und Daten mit: Er ist das Dokument, nicht ein
  -- Teil davon (ADR-009 Punkt 11).
  v_dokument := v_dokument || jsonb_build_object(
    'invoice_number', v_nummer,
    'issued_on', v_heute,
    'due_on', v_heute + v_frist::integer
  );

  update public.invoices
     set status          = 'issued',
         invoice_number  = v_nummer,
         issued_on       = v_heute,
         issued_at       = now(),
         issued_by       = v_actor,
         due_on          = v_heute + v_frist::integer,
         total_cents     = (v_dokument -> 'totals' ->> 'total_cents')::integer,
         tax_total_cents = (v_dokument -> 'totals' ->> 'tax_total_cents')::integer,
         currency        = v_dokument ->> 'currency',
         snapshot        = v_dokument
   where id = p_invoice_id;

  -- Die Leistung ist ab jetzt abgerechnet; ihr Entfernen laeuft nur noch ueber
  -- Storno (ADR-009 Punkt 9).
  update public.billable_services b
     set status = 'invoiced'
   where b.id in (select it.billable_service_id
                  from public.invoice_items it
                  where it.invoice_id = p_invoice_id);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.issued', 'invoice', p_invoice_id, 'success',
    jsonb_strip_nulls(jsonb_build_object('surface', 'web', 'patient_id', v_invoice.patient_id,
                       'training_relationship_id', v_invoice.training_relationship_id,
                       'invoice_number', v_nummer,
                       'service_area', v_invoice.service_area,
                       'total_cents', (v_dokument -> 'totals' ->> 'total_cents')::integer))
  );

  return v_nummer;
end;
$function$
;

