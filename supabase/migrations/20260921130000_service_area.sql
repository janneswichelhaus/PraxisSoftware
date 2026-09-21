-- =============================================================================
-- ABR-008: Der Leistungsbereich haengt an der Katalogposition
--
-- ADR-021 trennt Behandlung und Training nach dem **Rechtsverhaeltnis** und
-- nennt die beiden Bereiche im Datenmodell `therapy` und `training` (Punkt 2).
-- ADR-009 Fassung 2 Punkt 16 sagt, wo der Bereich einer Rechnung herkommt:
-- "Eine erfasste Leistung traegt ihren Bereich aus der Katalogposition." Diese
-- Migration baut genau diesen einen Satz - und sonst nichts von ABR-EPIC-005.
--
-- Drei Festlegungen tragen sie:
--
--   1. **Der Bereich steht an der Position, nicht an der Person.** Dieselbe
--      Begruendung wie beim Steuerkennzeichen (Punkt 15): Eine Person kann
--      beide Verhaeltnisse haben (ADR-021 Punkt 1), und eine Heilbehandlung
--      bleibt steuerfrei, auch wenn in derselben Woche eine Trainingsstunde
--      daneben steht.
--   2. **Die Leistung traegt ihn von dort - abgeleitet, nicht eingegeben.**
--      Sie fuehrt heute schon weder Preis noch Bezeichnung noch
--      Steuerkennzeichen als Kopie (ABR-002); der Bereich waere als frei
--      gesetztes Feld ein zweiter Wert fuer denselben Sachverhalt
--      (PROJECT_PRINCIPLES.md 13). Er steht trotzdem in der Spalte: Erst
--      dadurch kann ABR-009 "ein Bereich je Rechnung" ueber Fremdschluessel
--      halten statt ueber eine Abfrage. Ein **zusammengesetzter
--      Fremdschluessel** auf die Katalogposition macht aus der Kopie eine
--      Ableitung, die nicht auseinanderlaufen kann.
--   3. **Der ermaessigte Satz wird angelegt und nicht aktiviert** (Punkt 15,
--      B4). Die drei Kennzeichen bleiben Werte des vorhandenen Paars aus
--      `tax_treatment` und `tax_rate_permille` - **keine vierte Spalte**.
--
-- NICHT hier: die Invariante "ein Bereich je Rechnung" (ABR-009), die
-- getrennten Nummernkreise (ABR-010) und alles, was Training abrechenbar
-- machen wuerde - `billable_services` und `invoices` bleiben patientengebunden
-- (E18 Schritt 7). Eine Katalogposition im Trainingsbereich laesst sich
-- anlegen; erfassen laesst sie sich nur an einem Trainingstermin, und den gibt
-- es mangels Schreibweg noch nicht.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der Bereich an der Katalogposition
--
-- Die Bezeichner stehen fest: ADR-021 Punkt 2 legt `therapy` und `training`
-- ausdruecklich fuer Code und Datenmodell fest. Das ist keine Annahme, sondern
-- eine uebernommene Festlegung.
--
-- Der Vorgabewert traegt den Bestand: Gebaut ist bisher ausschliesslich die
-- Behandlung, jede vorhandene Position ist eine Behandlungsposition. Danach
-- faellt er wieder weg - eine neue Position soll ihren Bereich nennen und ihn
-- nicht geschenkt bekommen.
-- -----------------------------------------------------------------------------
alter table public.service_catalog_items
  add column service_area text not null default 'therapy'
    check (service_area in ('therapy', 'training'));

alter table public.service_catalog_items
  alter column service_area drop default;

comment on column public.service_catalog_items.service_area is
  'Leistungsbereich dieser Position (ADR-009 Punkt 16, ADR-021 Punkt 2): therapy = Heilbehandlung, training = Leistung ohne Heilbehandlungszweck. Die erfasste Leistung traegt ihn von hier, und die Rechnung von der Leistung - eine Rechnung traegt genau einen Bereich.';

-- -----------------------------------------------------------------------------
-- 2. Training ist keine Heilbehandlung
--
-- ADR-021 sagt es im Kontext ausdruecklich: "Training ist keine
-- Heilbehandlung. Daran haengt mehr als ein Etikett: ... ein anderes
-- Steuerkennzeichen." Par. 4 Nr. 14 Buchstabe a UStG traegt nur die
-- Heilbehandlung; eine Trainingsposition als `exempt_healthcare` waere der
-- Fehler in die andere Richtung als Par. 14c - zu wenig ausgewiesen statt zu
-- viel.
--
-- Das ist **keine** Ableitung des Kennzeichens aus dem Bereich (Punkt 15
-- verbietet sie): Steuerpflichtig und nicht steuerbar bleiben in beiden
-- Bereichen frei waehlbar - ein Ausfallhonorar ist auch im Training kein
-- Leistungsaustausch. Ausgeschlossen ist genau die eine Kombination, die
-- rechtlich nicht vorkommen kann.
-- -----------------------------------------------------------------------------
alter table public.service_catalog_items
  add constraint service_catalog_items_training_is_not_healthcare check (
    service_area <> 'training' or tax_treatment <> 'exempt_healthcare'
  );

comment on constraint service_catalog_items_training_is_not_healthcare on public.service_catalog_items is
  'Eine Trainingsposition ist nie eine steuerfreie Heilbehandlung (ADR-021, Par. 4 Nr. 14 Buchstabe a UStG). Das Kennzeichen wird damit nicht aus dem Bereich abgeleitet (ADR-009 Punkt 15) - nur eine unmoegliche Kombination ausgeschlossen.';

-- -----------------------------------------------------------------------------
-- 3. Der ermaessigte Satz: angelegt, nicht aktiviert (Punkt 15, B4)
--
-- Die drei Kennzeichen aus Punkt 15 sind **Werte des vorhandenen Paars** und
-- keine vierte Spalte:
--
--   * steuerfreie Heilbehandlung      -> `exempt_healthcare`, Satz 0
--   * steuerpflichtig zum Regelsatz   -> `taxable`, 190 Promille (Par. 12
--     Abs. 1 UStG) - Personal Training, Praevention, Geraetetraining
--   * steuerpflichtig zum ermaessigten Satz -> `taxable`, 70 Promille (Par. 12
--     Abs. 2 UStG) - verordnungsfaehige Leistungen ohne Verordnung
--
-- Daneben bleibt `not_taxable` fuer das Ausfallhonorar bestehen.
--
-- Zwei Constraints statt einer, und das mit Absicht: Die erste **legt an** -
-- sie haelt fest, dass es genau diese beiden Saetze gibt und kein dritter
-- durch einen Tippfehler entsteht. Die zweite **aktiviert nicht** - sie ist
-- die eine Zeile, die faellt, wenn die Steuerberatung den ermaessigten Satz
-- freigibt (B4, Roadmap G13). Eine Sperre, die sich mit einem `drop
-- constraint` aufheben laesst, ist die billigste umkehrbare Fassung von
-- "angelegt, aber nicht aktiviert".
-- -----------------------------------------------------------------------------
alter table public.service_catalog_items
  add constraint service_catalog_items_taxable_rate_known check (
    tax_treatment <> 'taxable' or tax_rate_permille in (190, 70)
  );

comment on constraint service_catalog_items_taxable_rate_known on public.service_catalog_items is
  'Ein steuerpflichtiger Posten traegt den Regelsatz (190 Promille, Par. 12 Abs. 1 UStG) oder den ermaessigten Satz (70 Promille, Par. 12 Abs. 2 UStG). Ein dritter Satz ist in Deutschland keiner (ADR-009 Punkt 15).';

alter table public.service_catalog_items
  add constraint service_catalog_items_reduced_rate_not_activated check (
    tax_rate_permille <> 70
  );

comment on constraint service_catalog_items_reduced_rate_not_activated on public.service_catalog_items is
  'Das dritte Steuerkennzeichen aus ADR-009 Punkt 15 ("therapy_reduced") ist angelegt, aber nicht aktiviert: Seine Rechtslage ist umstritten und die Freigabe steht bei der Steuerberatung (B4, G13). Diese eine Constraint faellt mit der Freigabe - sonst aendert sich nichts.';

-- -----------------------------------------------------------------------------
-- 4. Der Bereich an der Leistung - abgeleitet statt eingegeben
--
-- Die Spalte ist eine Kopie, und sie waere ein Mangel, wenn sie frei
-- beschreibbar bliebe. Der zusammengesetzte Fremdschluessel macht aus ihr eine
-- Ableitung: Eine Leistung kann nicht auf eine Position zeigen und einen
-- anderen Bereich behaupten - bei keinem Schreibweg, auch bei keinem
-- kuenftigen.
--
-- Der vorhandene einspaltige Fremdschluessel bleibt daneben stehen: Er traegt
-- `on delete restrict` und damit die Zusage, dass eine Position nicht faellt,
-- solange Leistungen an ihr haengen.
-- -----------------------------------------------------------------------------
alter table public.service_catalog_items
  add constraint service_catalog_items_id_service_area_key unique (id, service_area);

comment on constraint service_catalog_items_id_service_area_key on public.service_catalog_items is
  'Zielschluessel fuer zusammengesetzte Fremdschluessel, die den Leistungsbereich mittragen (ABR-008). Fachlich redundant zum Primaerschluessel - genau das macht ihn kostenlos.';

alter table public.billable_services
  add column service_area text;

-- Der Bestand traegt den Bereich seiner Position. Umrechnen ist hier nichts:
-- Es gibt ihn seit einer Anweisung.
update public.billable_services b
   set service_area = c.service_area
  from public.service_catalog_items c
 where c.id = b.catalog_item_id;

alter table public.billable_services
  alter column service_area set not null;

alter table public.billable_services
  add constraint billable_services_catalog_item_area_fkey
    foreign key (catalog_item_id, service_area)
    references public.service_catalog_items (id, service_area)
    on delete restrict;

comment on column public.billable_services.service_area is
  'Leistungsbereich dieser Leistung (ADR-009 Punkt 16). Abgeleitet aus der Katalogposition, nicht eingegeben: Der Trigger setzt ihn, der zusammengesetzte Fremdschluessel haelt ihn. Er steht hier und nicht nur am Join, weil die Rechnung ihre Invariante ueber ihn traegt (ABR-009).';

create index billable_services_area_idx
  on public.billable_services (organization_id, service_area, performed_on desc);

-- -----------------------------------------------------------------------------
-- 5. Der Trigger, der ihn setzt
--
-- Am Trigger und nicht im Schreibpfad - dieselbe Bauart wie die Sperre an der
-- veroeffentlichten Preisliste (ABR-001) und der Dokumentationsriegel an
-- `treatment_notes` (CAL-026): Sie gilt fuer jeden Weg in die Tabelle, auch
-- fuer den, den es noch nicht gibt.
--
-- Ein mitgegebener Wert wird **nicht** stillschweigend ueberschrieben. Wer
-- einen Bereich mitschickt, der nicht zur Position gehoert, meint etwas
-- anderes als das, was passieren wuerde - und das ist ein Fehler und keine
-- Vorgabe (dieselbe Haltung wie in Punkt 16 zum Terminkontext).
-- -----------------------------------------------------------------------------
create or replace function app.billable_service_area_from_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_area text;
begin
  select c.service_area into v_area
  from public.service_catalog_items c
  where c.id = new.catalog_item_id;

  -- Eine Position, die es nicht gibt, weist der Fremdschluessel ab; hier
  -- bleibt nichts zu setzen.
  if v_area is null then
    return new;
  end if;

  if new.service_area is not null and new.service_area is distinct from v_area then
    raise exception 'service area % does not match the catalog item (%)', new.service_area, v_area
      using errcode = '23514';
  end if;

  new.service_area := v_area;
  return new;
end;
$$;

comment on function app.billable_service_area_from_catalog() is
  'Setzt den Leistungsbereich einer erfassten Leistung aus ihrer Katalogposition (ABR-008, ADR-009 Punkt 16). Am Trigger, damit jeder Schreibweg ihn traegt; ein abweichend mitgegebener Bereich wird abgewiesen statt still ersetzt.';

create trigger billable_services_area_from_catalog
  before insert on public.billable_services
  for each row execute function app.billable_service_area_from_catalog();

-- -----------------------------------------------------------------------------
-- 6. Die Schreibwege des Katalogs fuehren den Bereich mit
--
-- Uebernommen aus 20260919100000_service_catalog.sql, Abschnitt 7, je um eine
-- Spalte ergaenzt - PostgreSQL kennt kein teilweises Ersetzen einer Funktion.
--
-- Die Vorbelegung `therapy` steht in derselben Zeile wie die von
-- `tax_treatment`: Die Oberflaeche schickt beides, und der Vorgabewert ist der
-- Normalfall dieser Praxis, nicht eine Vermutung ueber die Absicht.
-- -----------------------------------------------------------------------------
create or replace function public.create_service_catalog_version(
  p_label     text,
  p_valid_from date,
  p_copy_from uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'service_catalog.version_created', 'service_catalog_version', v_id, 'success',
    jsonb_build_object('surface', 'web', 'valid_from', p_valid_from, 'copied_from', p_copy_from)
  );

  return v_id;
end;
$$;

comment on function public.create_service_catalog_version(text, date, uuid) is
  'Legt eine Preisliste als Entwurf an, wahlweise als Kopie einer vorhandenen (ABR-001). Die Kopie nimmt seit ABR-008 den Leistungsbereich mit. Nur owner (ANN-071). Protokolliert service_catalog.version_created.';

create or replace function public.write_service_catalog_items(
  p_version_id uuid,
  p_items      jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_published timestamptz;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_service_catalog() then
    raise exception 'not allowed to manage the service catalog' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select v.published_at into v_published
  from public.service_catalog_versions v
  where v.id = p_version_id and v.organization_id = v_org;

  if not found then
    raise exception 'service catalog version not found' using errcode = '42501';
  end if;

  if v_published is not null then
    raise exception 'published service catalog version is immutable' using errcode = '23514';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  delete from public.service_catalog_items where catalog_version_id = p_version_id;

  insert into public.service_catalog_items (
    organization_id, catalog_version_id, sort_order, code, label,
    item_kind, remedy, unit_price_cents, currency, tax_treatment, tax_rate_permille,
    service_area, created_by
  )
  select
    v_org,
    p_version_id,
    (zeile.ordinalitaet)::smallint,
    btrim(zeile.eintrag ->> 'code'),
    btrim(zeile.eintrag ->> 'label'),
    coalesce(zeile.eintrag ->> 'item_kind', 'treatment'),
    nullif(btrim(coalesce(zeile.eintrag ->> 'remedy', '')), ''),
    (zeile.eintrag ->> 'unit_price_cents')::integer,
    'EUR',
    coalesce(zeile.eintrag ->> 'tax_treatment', 'exempt_healthcare'),
    coalesce((zeile.eintrag ->> 'tax_rate_permille')::smallint, 0::smallint),
    coalesce(zeile.eintrag ->> 'service_area', 'therapy'),
    v_actor
  from jsonb_array_elements(p_items) with ordinality as zeile(eintrag, ordinalitaet);

  select count(*) into v_anzahl
  from public.service_catalog_items where catalog_version_id = p_version_id;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'service_catalog.version_updated', 'service_catalog_version', p_version_id, 'success',
    jsonb_build_object('surface', 'web', 'item_count', v_anzahl)
  );

  return v_anzahl;
end;
$$;

comment on function public.write_service_catalog_items(uuid, jsonb) is
  'Ersetzt die Positionen eines Katalogentwurfs vollstaendig, alles oder nichts (ABR-001). Seit ABR-008 traegt jede Position ihren Leistungsbereich; ohne Angabe ist sie eine Behandlungsposition. Eine veroeffentlichte Version bleibt unveraenderlich.';
