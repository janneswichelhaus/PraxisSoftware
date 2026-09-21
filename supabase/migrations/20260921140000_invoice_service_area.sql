-- =============================================================================
-- ABR-009: Eine Rechnung traegt genau einen Leistungsbereich
--
-- ADR-009 Fassung 2 Punkt 16: "Gemischte Rechnungen ueber Heilbehandlung und
-- Trainingsleistung sind ausgeschlossen ... Die Regel ist eine Invariante des
-- Datenmodells, keine Regel der Oberflaeche." Der ADR laesst dazu eine Frage
-- offen: "reicht eine Constraint ueber die Posten einer Rechnung, oder braucht
-- es die Pruefung schon bei der Buendelung?"
--
-- **Die Antwort dieses SPEC: keins von beidem allein - ein Fremdschluessel.**
-- Eine Constraint ueber die Posten muesste eine Unterabfrage fahren und liefe
-- damit auf einen Trigger hinaus; eine Pruefung bei der Buendelung haelte nur
-- den einen Weg, den es heute gibt. Der Bereich steht deshalb an der Rechnung
-- **und** an der Zeile, und zwei zusammengesetzte Fremdschluessel binden die
-- Zeile an beides: an ihre Rechnung und an ihre Leistung. Eine gemischte
-- Rechnung ist damit **schemaseitig unmoeglich** - bei jedem Schreibweg, auch
-- bei einem, den es noch nicht gibt (dieselbe Bauart wie die Mandantengrenze
-- am Termin, CAL-024).
--
-- Dazu gehoert der zweite Satz aus Punkt 16: "Widerspricht er dem Kontext des
-- Termins, an dem sie entstanden ist (ADR-022), ist das ein **Fehler bei der
-- Erfassung** und keine stille Korrektur." Auch das haengt hier - am Trigger,
-- nicht im Schreibweg.
--
-- Und der dritte Schluessel der Sammelrechnung: **ANN-077** buendelt bisher
-- Person und Kalendermonat, kuenftig Person, Kalendermonat **und** Bereich.
-- Eine Person mit beiden Verhaeltnissen bekommt in einem Monat damit zwei
-- Rechnungen. Das ist gewollt (ADR-009, Konsequenz zu Punkt 16): Es ist der
-- Preis dafuer, dass keine Summe ueber zwei Steuerregime laeuft.
--
-- NICHT hier: die getrennten Nummernkreise (ABR-010) und jeder Schreibweg fuer
-- Training. `invoices.patient_id` bleibt Pflicht, `billable_services` bleiben
-- patientengebunden - eine Trainingsrechnung ist damit heute nicht baubar und
-- soll es auch nicht sein (E18 Schritt 7, ADR-014 "nicht prophylaktisch"). Was
-- hier entsteht, ist die Invariante, nicht der zweite Bereich.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Welcher Bereich zu welchem Terminkontext gehoert
--
-- Eine Stelle, an der die Zuordnung steht - dieselbe Zurueckhaltung wie bei
-- `app.may_read_appointment_context` (CAL-026). ADR-022 Punkt 2 kennt drei
-- Kontexte; nur zwei von ihnen erzeugen eine Leistung:
--
--   * `treatment` -> `therapy` (Behandlungsvertrag, Par. 630a BGB)
--   * `training`  -> `training` (Dienstvertrag ueber Training, Par. 611 BGB)
--   * `event`     -> keiner: ein interner Termin hat kein Gegenueber und
--                   erzeugt nichts, was abzurechnen waere.
-- -----------------------------------------------------------------------------
create or replace function app.service_area_of_appointment_kind(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
           when 'treatment' then 'therapy'
           when 'training'  then 'training'
           else null
         end;
$$;

comment on function app.service_area_of_appointment_kind(text) is
  'Der Leistungsbereich zu einem Terminkontext (ADR-009 Punkt 16, ADR-022 Punkt 2): treatment -> therapy, training -> training. null fuer den internen Termin - er erzeugt keine Leistung.';

revoke all on function app.service_area_of_appointment_kind(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Der Widerspruch zum Terminkontext ist ein Erfassungsfehler
--
-- Punkt 16 sagt ausdruecklich, was NICHT passieren soll: keine stille
-- Korrektur. Deshalb weist der Trigger ab, statt den Bereich der Leistung an
-- den Termin anzupassen - eine Trainingsposition an einem Behandlungstermin
-- ist eine falsch gewaehlte Position und kein falsch gesetztes Feld.
--
-- Am Trigger und nicht im Schreibweg: Der Vorschlag (Abschnitt 3) bietet
-- ohnehin nur die Positionen des richtigen Bereichs an, aber die Oberflaeche
-- ist nicht die Stelle, an der eine Invariante haengt (ADR-004).
-- -----------------------------------------------------------------------------
create or replace function app.billable_service_matches_appointment_context()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind     text;
  v_erwartet text;
begin
  select a.kind into v_kind
  from public.appointments a
  where a.id = new.appointment_id;

  v_erwartet := app.service_area_of_appointment_kind(v_kind);

  if v_erwartet is null then
    raise exception 'an appointment of kind % cannot carry billable services', v_kind
      using errcode = '23514';
  end if;

  if new.service_area is distinct from v_erwartet then
    raise exception 'service area % does not match the appointment context % (expected %)',
      new.service_area, v_kind, v_erwartet
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.billable_service_matches_appointment_context() is
  'Weist eine Leistung ab, deren Leistungsbereich dem Kontext ihres Termins widerspricht (ADR-009 Punkt 16, ADR-022 Punkt 2). Abweisen und nicht anpassen: Punkt 16 nennt den Widerspruch einen Erfassungsfehler und schliesst die stille Korrektur aus.';

-- Der Name entscheidet die Reihenfolge: `..._area_from_catalog` setzt den
-- Bereich (ABR-008), `..._area_matches_context` prueft ihn. Alphabetisch
-- laeuft "from" vor "matches" - gewollt, damit die Pruefung den gesetzten Wert
-- sieht und nicht den leeren.
create trigger billable_services_area_matches_context
  before insert or update of appointment_id, catalog_item_id, service_area
  on public.billable_services
  for each row execute function app.billable_service_matches_appointment_context();

-- -----------------------------------------------------------------------------
-- 3. Der Vorschlag bietet nur den Bereich des Termins an
--
-- Uebernommen aus 20260919110000_billable_services.sql, Abschnitt 5, um den
-- Bereich ergaenzt - PostgreSQL kennt kein teilweises Ersetzen einer Funktion.
--
-- Der Grund steht schon dort: "die Oberflaeche kann keine Position anbieten,
-- die der Schreibpfad anschliessend abweist." Ohne diesen Filter stuende eine
-- Trainingsposition in der Auswahl eines Behandlungstermins, und der Trigger
-- aus Abschnitt 2 wiese sie erst nach dem Klick ab.
-- -----------------------------------------------------------------------------
drop function public.get_billable_service_draft(uuid);

create or replace function public.get_billable_service_draft(p_appointment_id uuid)
returns table (
  catalog_item_id   uuid,
  code              text,
  label             text,
  item_kind         text,
  unit_price_cents  integer,
  currency          text,
  tax_treatment     text,
  tax_rate_permille smallint,
  service_area      text,
  suggested         boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org          uuid;
  v_status       text;
  v_fee_basis    text;
  v_basis        uuid;
  v_kind         text;
  v_bereich      text;
  v_performed_on date;
  v_version      uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_record_billable_services() then
    raise exception 'not allowed to record billable services' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select a.status, a.fee_basis, a.treatment_basis_id, a.kind
    into v_status, v_fee_basis, v_basis, v_kind
  from public.appointments a
  where a.id = p_appointment_id and a.organization_id = v_org;

  if not found then
    raise exception 'appointment not found' using errcode = '42501';
  end if;

  v_bereich := app.service_area_of_appointment_kind(v_kind);
  if v_bereich is null then
    raise exception 'an appointment of kind % cannot carry billable services', v_kind
      using errcode = '22023';
  end if;

  v_performed_on := app.appointment_performed_on(p_appointment_id);
  v_version := app.active_service_catalog_version(v_org, v_performed_on);

  if v_version is null then
    raise exception 'no published service catalog for %', v_performed_on using errcode = '22023';
  end if;

  -- Die Reihenfolge der Preisliste bleibt die Reihenfolge des Vorschlags.
  return query
  select i.id, i.code, i.label, i.item_kind, i.unit_price_cents, i.currency,
         i.tax_treatment, i.tax_rate_permille, i.service_area,
         case
           when v_fee_basis is not null then i.item_kind = 'absence_fee'
           else i.remedy is not null
                and exists (
                  select 1 from public.treatment_base_items p
                  where p.treatment_basis_id = v_basis and p.remedy = i.remedy
                )
         end as suggested
  from public.service_catalog_items i
  where i.catalog_version_id = v_version
    and i.item_kind = case when v_fee_basis is not null then 'absence_fee' else 'treatment' end
    and i.service_area = v_bereich
  order by i.sort_order;
end;
$$;

comment on function public.get_billable_service_draft(uuid) is
  'Waehlbare und vorgeschlagene Katalogpositionen fuer einen Termin (ABR-002). Vorgeschlagen sind die Heilmittel seiner Grundlage beziehungsweise das Ausfallhonorar; waehlbar ist seit ABR-009 nur, was zum Leistungsbereich seines Kontexts gehoert (ADR-009 Punkt 16).';

revoke all on function public.get_billable_service_draft(uuid) from public, anon;
grant execute on function public.get_billable_service_draft(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Der Bereich an der Rechnung und an ihrer Zeile
--
-- Der Bestand ist durchweg Behandlung: Gebaut ist nur sie, und produktiv ist
-- noch keine Rechnung ausgestellt (B12). Der Vorgabewert traegt ihn beim
-- Einzug und faellt danach weg - eine Rechnung soll ihren Bereich nennen.
-- -----------------------------------------------------------------------------
alter table public.billable_services
  add constraint billable_services_id_service_area_key unique (id, service_area);

comment on constraint billable_services_id_service_area_key on public.billable_services is
  'Zielschluessel fuer den zusammengesetzten Fremdschluessel der Rechnungszeile (ABR-009). Fachlich redundant zum Primaerschluessel.';

alter table public.invoices
  add column service_area text not null default 'therapy'
    check (service_area in ('therapy', 'training'));

alter table public.invoices
  alter column service_area drop default;

comment on column public.invoices.service_area is
  'Der eine Leistungsbereich dieser Rechnung (ADR-009 Punkt 16). Gemischte Rechnungen sind ausgeschlossen - nicht durch eine Regel der Oberflaeche, sondern durch die Fremdschluessel der Rechnungszeile.';

alter table public.invoices
  add constraint invoices_id_service_area_key unique (id, service_area);

alter table public.invoice_items
  add column service_area text;

update public.invoice_items it
   set service_area = b.service_area
  from public.billable_services b
 where b.id = it.billable_service_id;

alter table public.invoice_items
  alter column service_area set not null;

-- Die beiden Fremdschluessel, die Punkt 16 tragen: Die Zeile haengt an einer
-- Rechnung DIESES Bereichs und an einer Leistung DIESES Bereichs. Zusammen
-- lassen sie eine gemischte Rechnung nicht entstehen.
alter table public.invoice_items
  add constraint invoice_items_invoice_area_fkey
    foreign key (invoice_id, service_area)
    references public.invoices (id, service_area)
    on delete cascade;

alter table public.invoice_items
  add constraint invoice_items_service_area_fkey
    foreign key (billable_service_id, service_area)
    references public.billable_services (id, service_area)
    on delete restrict;

comment on column public.invoice_items.service_area is
  'Leistungsbereich dieser Zeile (ADR-009 Punkt 16). Abgeleitet aus der Leistung; die beiden zusammengesetzten Fremdschluessel binden ihn an Rechnung und Leistung zugleich und machen die gemischte Rechnung schemaseitig unmoeglich.';

create or replace function app.invoice_item_area_from_service()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_area text;
begin
  select b.service_area into v_area
  from public.billable_services b
  where b.id = new.billable_service_id;

  if v_area is null then
    return new;
  end if;

  if new.service_area is not null and new.service_area is distinct from v_area then
    raise exception 'service area % does not match the billable service (%)', new.service_area, v_area
      using errcode = '23514';
  end if;

  new.service_area := v_area;
  return new;
end;
$$;

comment on function app.invoice_item_area_from_service() is
  'Setzt den Leistungsbereich einer Rechnungszeile aus ihrer Leistung (ABR-009). Am Trigger, damit jeder Schreibweg ihn traegt; ob er zur Rechnung passt, entscheidet danach der Fremdschluessel.';

-- `a_` im Namen, damit dieser Trigger vor `invoice_items_frozen` laeuft:
-- Er setzt nur einen Wert, die Sperre urteilt ueber die fertige Zeile.
create trigger a_invoice_items_area_from_service
  before insert on public.invoice_items
  for each row execute function app.invoice_item_area_from_service();

-- -----------------------------------------------------------------------------
-- 5. Die Freigabe durch das Storno bewegt den Bereich nicht mit
--
-- Uebernommen aus 20260919170000_invoice_cancellations.sql, Abschnitt 2, um
-- eine Spalte ergaenzt. Die eine Ausnahme von der Unveraenderlichkeit prueft
-- Feld fuer Feld, dass ausser `released_at` nichts wandert; eine neue Spalte,
-- die dort fehlt, waere genau die Ausweitung, die der Kommentar dort
-- ausschliesst.
-- -----------------------------------------------------------------------------
create or replace function app.invoice_items_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select i.status into v_status
  from public.invoices i
  where i.id = new.invoice_id;

  if v_status = 'issued' then
    -- Die Freigabe durch das Storno: nur beim Aendern, nur in eine Richtung,
    -- und nur wenn keine andere Spalte sich bewegt.
    if tg_op = 'UPDATE'
       and old.released_at is null
       and new.released_at is not null
       and new.id = old.id
       and new.organization_id = old.organization_id
       and new.invoice_id = old.invoice_id
       and new.billable_service_id = old.billable_service_id
       and new.sort_order = old.sort_order
       and new.service_area = old.service_area then
      return new;
    end if;

    raise exception 'the items of an issued invoice cannot be changed' using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function app.invoice_items_frozen() is
  'Haelt die Zeilen einer ausgestellten Rechnung unveraenderlich (ADR-009 Punkt 9). Einzige Ausnahme seit ABR-003c: Das Storno setzt released_at und loest damit die Sperre gegen Doppelabrechnung; die Zeile selbst aendert sich dabei nicht - seit ABR-009 auch ihr Leistungsbereich nicht. Das Loeschen bleibt dem Loeschlauf moeglich (ADR-008).';

-- -----------------------------------------------------------------------------
-- 6. Der dritte Schluessel der Sammelrechnung (ANN-077)
--
-- Je Person, Monat und Bereich hoechstens ein Entwurf. Ohne den dritten
-- Schluessel koennte eine Person mit beiden Verhaeltnissen im selben Monat nur
-- eine Rechnung haben - und die muesste gemischt sein.
-- -----------------------------------------------------------------------------
drop index public.invoices_draft_period_key;

create unique index invoices_draft_period_key
  on public.invoices (patient_id, period_month, service_area)
  where status = 'draft';

-- -----------------------------------------------------------------------------
-- 7. Die Buendelung kennt den Bereich
--
-- Uebernommen aus 20260919170000_invoice_cancellations.sql, Abschnitt 9, und
-- 20260920102000_reminder_and_correction_lock.sql - je um den Bereich
-- ergaenzt.
-- -----------------------------------------------------------------------------
drop function public.list_invoice_candidates(integer);

create or replace function public.list_invoice_candidates(p_limit integer default 100)
returns table (
  patient_id    uuid,
  patient_name  text,
  period_month  date,
  service_area  text,
  service_count integer,
  total_cents   integer,
  currency      text,
  has_draft     boolean,
  draft_id      uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    raise exception 'not allowed to read invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  -- Erst buendeln, dann den Entwurf dazusuchen (BEF-018). Der Bereich steht
  -- seit ABR-009 in beiden Schritten: Er ist der dritte Schluessel der
  -- Klammer und nicht eine Spalte, die nebenher mitlaeuft.
  return query
  select k.patient_id,
         k.patient_name,
         k.period_month,
         k.service_area,
         k.service_count,
         k.total_cents,
         k.currency,
         (entwurf.id is not null),
         entwurf.id
  from (
    select b.patient_id,
           max(pe.given_name || ' ' || pe.family_name) as patient_name,
           max(pe.family_name) as family_name,
           date_trunc('month', b.performed_on)::date as period_month,
           b.service_area,
           count(*)::integer as service_count,
           sum(b.quantity * c.unit_price_cents)::integer as total_cents,
           max(c.currency) as currency
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    join public.patients p  on p.id = b.patient_id
    join public.persons  pe on pe.id = p.person_id
    where b.organization_id = v_org
      and b.status = 'billable'
      -- Seit ABR-003c zaehlt nur eine Zeile, die nicht freigegeben ist: Nach
      -- einem Storno ist die Leistung wieder abzurechnen.
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
    group by b.patient_id, date_trunc('month', b.performed_on)::date, b.service_area
  ) k
  left join lateral (
    select i.id
    from public.invoices i
    where i.patient_id = k.patient_id
      and i.period_month = k.period_month
      and i.service_area = k.service_area
      and i.status = 'draft'
    limit 1
  ) entwurf on true
  order by k.period_month desc, k.family_name, k.service_area
  limit greatest(least(coalesce(p_limit, 100), 200), 1);
end;
$$;

comment on function public.list_invoice_candidates(integer) is
  'Erfasste Leistungen ohne Rechnung, gebuendelt nach Person, Kalendermonat und Leistungsbereich (ABR-003, ABR-009, ANN-077). Die Arbeitsliste des Rechnungsbereichs. Ohne Leistungen, die auf einer stornierten Rechnung standen - die stehen wieder hier; mit der Kennung des vorhandenen Entwurfs (BEF-018).';

revoke all on function public.list_invoice_candidates(integer) from public, anon;
grant execute on function public.list_invoice_candidates(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Der Entwurf entsteht je Bereich
--
-- Der Bereich ist ein **Argument** und keine Ableitung aus dem Bestand: Der
-- Aufruf sagt, welche Rechnung er meint, und nimmt dann alles auf, was dazu
-- gehoert. Eine Ableitung ("nimm den Bereich der ersten Leistung") wuerde bei
-- zwei Bereichen still einen von beiden waehlen - und der Rest bliebe
-- unsichtbar liegen, genau der Fehler, den Punkt 4 ausschliesst.
-- -----------------------------------------------------------------------------
drop function public.create_invoice_draft(uuid, date);

create or replace function public.create_invoice_draft(
  p_patient_id   uuid,
  p_period_month date,
  p_service_area text default 'therapy'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid;
  v_org     uuid;
  v_monat   date;
  v_bereich text;
  v_id      uuid;
  v_empf    uuid;
  v_anzahl  integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  v_monat := date_trunc('month', p_period_month)::date;
  v_bereich := coalesce(nullif(btrim(p_service_area), ''), 'therapy');

  if v_bereich not in ('therapy', 'training') then
    raise exception 'unknown service area %', p_service_area using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = '42501';
  end if;

  -- Die Vorgabe aus den Stammdaten; ohne sie geht die Rechnung an die
  -- Patientin selbst (ANN-076).
  select r.id into v_empf
  from public.invoice_recipients r
  where r.patient_id = p_patient_id and r.is_default;

  insert into public.invoices (
    organization_id, patient_id, recipient_id, period_month, service_area, created_by
  )
  values (v_org, p_patient_id, v_empf, v_monat, v_bereich, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.organization_id = v_org
      and b.patient_id = p_patient_id
      and b.status = 'billable'
      and b.service_area = v_bereich
      and date_trunc('month', b.performed_on)::date = v_monat
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient, month and service area'
      using errcode = '22023';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.draft_created', 'invoice', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', p_patient_id,
                       'period_month', v_monat, 'service_area', v_bereich,
                       'item_count', v_anzahl)
  );

  return v_id;
end;
$$;

comment on function public.create_invoice_draft(uuid, date, text) is
  'Legt den Rechnungsentwurf einer Patientin fuer einen Kalendermonat und einen Leistungsbereich an und nimmt alle noch nicht abgerechneten Leistungen dieses Bereichs auf (ABR-003, ABR-009, ANN-077). Je Patientin, Monat und Bereich hoechstens ein Entwurf; eine Person mit beiden Verhaeltnissen bekommt zwei Rechnungen.';

revoke all on function public.create_invoice_draft(uuid, date, text) from public, anon;
grant execute on function public.create_invoice_draft(uuid, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Die Korrekturrechnung bleibt im Bereich ihrer Vorgaengerin
--
-- Uebernommen aus 20260920102000_reminder_and_correction_lock.sql, um den
-- Bereich ergaenzt. Sie nimmt ihn nicht als Argument: Eine Korrektur ersetzt
-- genau eine Rechnung, und deren Bereich steht fest.
-- -----------------------------------------------------------------------------
create or replace function public.create_correction_draft(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_alt    record;
  v_id     uuid;
  v_anzahl integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to manage invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select i.* into v_alt
  from public.invoices i
  where i.id = p_invoice_id and i.organization_id = v_org
  for update;

  if not found then
    raise exception 'invoice not found' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'only a cancelled invoice can be corrected' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoices i
    where i.patient_id = v_alt.patient_id
      and i.period_month = v_alt.period_month
      and i.service_area = v_alt.service_area
      and i.status = 'draft'
  ) then
    raise exception 'a draft for this patient, month and service area already exists'
      using errcode = '23505';
  end if;

  insert into public.invoices (
    organization_id, patient_id, recipient_id, period_month, service_area,
    replaces_invoice_id, created_by
  )
  values (v_org, v_alt.patient_id, v_alt.recipient_id, v_alt.period_month, v_alt.service_area,
          p_invoice_id, v_actor)
  returning id into v_id;

  insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
  select v_org, v_id, z.id, z.nummer
  from (
    select b.id,
           row_number() over (order by b.performed_on, c.code, b.id)::smallint as nummer
    from public.billable_services b
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where b.organization_id = v_org
      and b.patient_id = v_alt.patient_id
      and b.status = 'billable'
      and b.service_area = v_alt.service_area
      and date_trunc('month', b.performed_on)::date = v_alt.period_month
      and not exists (
        select 1 from public.invoice_items it
        where it.billable_service_id = b.id and it.released_at is null
      )
  ) z;

  get diagnostics v_anzahl = row_count;

  if v_anzahl = 0 then
    raise exception 'no billable services for this patient, month and service area'
      using errcode = '22023';
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.draft_created', 'invoice', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_alt.patient_id,
                       'period_month', v_alt.period_month, 'service_area', v_alt.service_area,
                       'item_count', v_anzahl, 'replaces_invoice_id', p_invoice_id)
  );

  return v_id;
end;
$$;

comment on function public.create_correction_draft(uuid) is
  'Legt zu einer stornierten Rechnung den Entwurf der Korrekturrechnung an und verweist von ihm auf die ersetzte Rechnung (ABR-003c, ADR-009 Punkt 9, R3-009). Nimmt alle wieder freien Leistungen des Monats **im Bereich der stornierten Rechnung** auf (ANN-077, ABR-009); sperrt die Rechnung, damit zwei gleichzeitige Aufrufe nicht im Unique-Index enden.';
