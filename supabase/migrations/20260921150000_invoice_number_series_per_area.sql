-- =============================================================================
-- ABR-010: Je Leistungsbereich ein eigener Nummernkreis
--
-- ADR-009 Fassung 2 Punkt 17: "Punkt 8 gilt unveraendert; er wird nur je Kreis
-- gelesen. Jeder Kreis laeuft lueckenlos innerhalb seines Kalenderjahres, und
-- jede vergebene Nummer bleibt innerhalb der Organisation einmalig - mehrere
-- Zahlenreihen sind nach Par. 14 Abs. 4 Nr. 4 UStG ausdruecklich zulaessig,
-- doppelte Nummern nicht. Am ausgestellten Dokument muss erkennbar sein, aus
-- welchem Kreis seine Nummer stammt. Korrektur- und Stornodokumente (Punkt 9)
-- nehmen ihre Nummer aus dem Kreis der Rechnung, die sie betreffen."
--
-- Vier Festlegungen tragen das:
--
--   1. **Der dritte Schluesselteil** an `invoice_number_series`. ANN-075 wird
--      damit enger gelesen und nicht abgeloest: Format und Vergabeweg bleiben,
--      der Kreis bekommt eine Dimension. Ein Uebergangsproblem entsteht nicht -
--      produktiv ist noch keine Rechnung ausgestellt (B12); der vorhandene
--      Kreis wird der Kreis der Behandlung, der zweite beginnt bei 1.
--   2. **Ein Kuerzel je Bereich** in den Praxis-Stammdaten. ADR-009 laesst die
--      Bezeichner ausdruecklich dem SPEC (ADR-014); gewaehlt sind `RG` fuer die
--      Behandlung (Bestand) und `TR` fuer das Training. Eine Constraint haelt
--      fest, dass beide sich unterscheiden - **das** ist die technische Seite
--      von "einmalig ueber alle Kreise" und von "am Dokument erkennbar".
--   3. **Eine Stelle, die das Kuerzel zum Bereich liefert**
--      (`app.invoice_number_prefix`). Die Spaltennamen bleiben damit dort, wo
--      sie sind, und jeder Aufrufer fragt symmetrisch.
--   4. **Der Bereich steht im Snapshot** (`schema_version` 3). Die Nummer
--      zeigt ihn ueber ihr Kuerzel; der Snapshot nennt ihn ausserdem, weil ein
--      Kuerzel sich aendern darf und ein ausgestelltes Dokument nicht.
--
-- NICHT hier: die Auswertung "Einnahmen je Leistungsart" (ABR-EPIC-006) und
-- jeder Schreibweg fuer Training. Der Trainingskreis ist angelegt und wird
-- heute von nichts benutzt - eine Trainingsrechnung ist mangels Schreibweg
-- nicht baubar (E18 Schritt 7). Dass die Vergabe je Kreis trotzdem stimmt,
-- prueft `pnpm test:db` an der Funktion selbst.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Der dritte Schluesselteil am Nummernkreis
-- -----------------------------------------------------------------------------
alter table public.invoice_number_series
  add column service_area text not null default 'therapy'
    check (service_area in ('therapy', 'training'));

alter table public.invoice_number_series
  alter column service_area drop default;

alter table public.invoice_number_series
  drop constraint invoice_number_series_organization_id_year_key;

alter table public.invoice_number_series
  add constraint invoice_number_series_org_year_area_key
    unique (organization_id, year, service_area);

comment on table public.invoice_number_series is
  'Naechste freie Rechnungsnummer je Organisation, Kalenderjahr und Leistungsbereich (ABR-010, ADR-009 Punkte 8 und 17, ANN-075). Kein Personenbezug; sie ist der Nachweis, dass jeder Kreis lueckenlos laeuft und keine Nummer zweimal vergeben wurde. Datenklasse: Abrechnungsdaten, steuerliche Frist (ADR-008). Kein Tabellenrecht: erreichbar nur ueber app.next_invoice_number.';
comment on column public.invoice_number_series.service_area is
  'Der Kreis, den diese Zeile fuehrt (ADR-009 Punkt 17). Mehrere Zahlenreihen sind nach Par. 14 Abs. 4 Nr. 4 UStG zulaessig; dass keine Nummer zweimal vorkommt, tragen die unterschiedlichen Kuerzel und der Unique-Index an invoices.';

-- -----------------------------------------------------------------------------
-- 2. Ein Kuerzel je Bereich
--
-- Kein Umbenennen der vorhandenen Spalte: Sie fuehrt weiterhin das Kuerzel der
-- Behandlung, und ein Umbau haette jeden Aufrufer angefasst, ohne eine einzige
-- Aussage zu aendern. Symmetrisch wird der Zugriff stattdessen an der Stelle,
-- an der er stattfindet - ueber `app.invoice_number_prefix` (Abschnitt 3).
--
-- Die Constraint ist die eigentliche Zusage aus Punkt 17: Zwei Kreise mit
-- demselben Kuerzel erzeugten zweimal "RG-2026-0001" - lueckenlos je Kreis und
-- trotzdem doppelt ueber alle. Sie faengt das beim Speichern der Stammdaten ab
-- und nicht erst beim Ausstellen.
-- -----------------------------------------------------------------------------
alter table public.practice_billing_profiles
  add column training_invoice_number_prefix text not null default 'TR'
    check (training_invoice_number_prefix ~ '^[A-Z0-9-]{1,10}$');

alter table public.practice_billing_profiles
  add constraint practice_billing_profiles_prefixes_differ check (
    invoice_number_prefix <> training_invoice_number_prefix
  );

comment on column public.practice_billing_profiles.invoice_number_prefix is
  'Kuerzel vor der Rechnungsnummer im Bereich **Behandlung** (ADR-009 Punkt 17). Das Format der Nummer selbst legt app.next_invoice_number fest (ANN-075); hier steht nur, was die Praxis daran waehlen darf.';
comment on column public.practice_billing_profiles.training_invoice_number_prefix is
  'Kuerzel vor der Rechnungsnummer im Bereich **Training** (ABR-010, ADR-009 Punkt 17). Es muss sich vom Kuerzel der Behandlung unterscheiden - sonst waeren zwei lueckenlose Kreise ueber alle Kreise nicht mehr eindeutig, und am Dokument waere nicht erkennbar, aus welchem seine Nummer stammt.';
comment on constraint practice_billing_profiles_prefixes_differ on public.practice_billing_profiles is
  'Zwei Nummernkreise, zwei Kuerzel (ADR-009 Punkt 17): "jede vergebene Nummer bleibt innerhalb der Organisation einmalig".';

-- -----------------------------------------------------------------------------
-- 3. Welches Kuerzel zu welchem Bereich gehoert
-- -----------------------------------------------------------------------------
create or replace function app.invoice_number_prefix(
  p_organization_id uuid,
  p_service_area    text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_service_area
           when 'training' then b.training_invoice_number_prefix
           else b.invoice_number_prefix
         end
  from public.practice_billing_profiles b
  where b.organization_id = p_organization_id
$$;

comment on function app.invoice_number_prefix(uuid, text) is
  'Das Kuerzel des Nummernkreises eines Leistungsbereichs (ABR-010, ADR-009 Punkt 17). Die eine Stelle, die die Zuordnung kennt; null heisst, dass keine Praxis-Stammdaten hinterlegt sind.';

revoke all on function app.invoice_number_prefix(uuid, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Die naechste Nummer - je Kreis
--
-- Uebernommen aus 20260919150000_invoices.sql, Abschnitt 6, um den Bereich
-- ergaenzt. Die alte Signatur wird entfernt und nicht daneben stehen gelassen:
-- Eine Vergabe ohne Bereich gaebe es sonst weiter, und sie schriebe in die
-- Zeile eines Kreises, den sie nicht meint.
-- -----------------------------------------------------------------------------
drop function app.next_invoice_number(uuid, smallint, text);

create or replace function app.next_invoice_number(
  p_organization_id uuid,
  p_year            smallint,
  p_service_area    text,
  p_prefix          text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  -- Beide Wege liefern dieselbe Aussage: `next_number` steht nach der
  -- Anweisung auf der naechsten freien Nummer, vergeben wird die davor.
  insert into public.invoice_number_series as s (organization_id, year, service_area, next_number)
  values (p_organization_id, p_year, p_service_area, 2)
  on conflict (organization_id, year, service_area) do update
    set next_number = s.next_number + 1
  returning s.next_number - 1 into v_number;

  -- Kuerzel, Jahr, vierstellige laufende Nummer: "RG-2026-0001". Vierstellig,
  -- weil eine Praxis dieser Groesse im Jahr keine zehntausend Rechnungen
  -- schreibt - und laenger wird die Nummer trotzdem, wenn doch. Das Kuerzel
  -- unterscheidet die Kreise; es kommt aus den Stammdaten und nicht von hier.
  return p_prefix || '-' || p_year::text || '-' || lpad(v_number::text, 4, '0');
end;
$$;

comment on function app.next_invoice_number(uuid, smallint, text, text) is
  'Vergibt die naechste Rechnungsnummer eines Kalenderjahres **in einem Leistungsbereich**, lueckenlos je Kreis und unter gleichzeitigen Zugriffen eindeutig (ADR-009 Punkte 8 und 17, ANN-075). Format: Kuerzel-Jahr-vierstellig; das Kuerzel unterscheidet die Kreise.';

revoke all on function app.next_invoice_number(uuid, smallint, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Das Dokument nennt seinen Bereich (schema_version 3)
--
-- Uebernommen aus 20260920120000_invoice_tax_exemption_reason.sql, Abschnitt 2,
-- mit zwei Aenderungen: Das Dokument traegt `service_area`, und die
-- `schema_version` steht auf 3. Aeltere Snapshots bleiben lesbar - das Feld ist
-- neu, keins faellt weg.
--
-- Warum ueberhaupt, wo die Nummer den Kreis schon ueber ihr Kuerzel zeigt: Ein
-- Kuerzel darf sich aendern, ein ausgestelltes Dokument nicht (Punkt 9). Der
-- Bereich im Snapshot bleibt damit auch dann lesbar, wenn die Praxis spaeter
-- andere Kuerzel waehlt - und die Auswertung aus Punkt 19 liest ihn, ohne
-- Kuerzel zu deuten (ABR-EPIC-006).
-- -----------------------------------------------------------------------------
create or replace function app.build_invoice_document(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
  if v_invoice.recipient_id is null then
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
  select jsonb_build_object(
           'name',          pe.given_name || ' ' || pe.family_name,
           'date_of_birth', pc.date_of_birth
         )
    into v_patient
  from public.patients p
  join public.persons pe on pe.id = p.person_id
  left join public.patient_contact_details pc on pc.patient_id = p.id
  where p.id = v_invoice.patient_id;

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
$$;

comment on function app.build_invoice_document(uuid) is
  'Baut das Rechnungsdokument aus Stammdaten, Empfaenger, Leistungen und Steuergruppen (ABR-003, ADR-009 Punkt 10). Dieselbe Funktion liefert die Entwurfsansicht und den Snapshot beim Ausstellen. Seit ABR-006 mit dem Grund der Steuerbefreiung je Gruppe, seit ABR-010 mit dem Leistungsbereich (schema_version 3). Ohne klinische Inhalte.';

revoke all on function app.build_invoice_document(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Ausstellen zieht aus dem Kreis der Rechnung
--
-- Uebernommen aus 20260920121000_invoice_tax_lock.sql, Abschnitt 2. Der
-- Par. 14c-Riegel bleibt, wo er ist: vor der Nummernvergabe. Neu ist allein,
-- **aus welchem Kreis** die Nummer kommt - aus dem Bereich der Rechnung, und
-- der steht seit ABR-009 an ihr.
-- -----------------------------------------------------------------------------
create or replace function public.issue_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
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
    jsonb_build_object('surface', 'web', 'patient_id', v_invoice.patient_id,
                       'invoice_number', v_nummer,
                       'service_area', v_invoice.service_area,
                       'total_cents', (v_dokument -> 'totals' ->> 'total_cents')::integer)
  );

  return v_nummer;
end;
$$;

comment on function public.issue_invoice(uuid) is
  'Stellt einen Rechnungsentwurf aus: Par. 14c-Riegel pruefen, Nummer aus dem Kreis des Leistungsbereichs vergeben, Snapshot schreiben, Leistungen auf "invoiced" setzen - in einer Transaktion (ADR-009 Punkte 8 bis 10, 17 und 18). Danach ist die Rechnung unveraenderlich.';

revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Das Storno nimmt die Nummer aus dem Kreis seiner Rechnung
--
-- Uebernommen aus 20260919170000_invoice_cancellations.sql, Abschnitt 7.
-- Punkt 17 sagt es woertlich: "Korrektur- und Stornodokumente nehmen ihre
-- Nummer aus dem Kreis der Rechnung, die sie betreffen." Nicht aus dem Kreis
-- des Tages, an dem storniert wird - ein Storno gehoert zu seiner Rechnung.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_invoice(
  p_invoice_id uuid,
  p_reason     text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_invoice  record;
  v_zeitzone text;
  v_heute    date;
  v_prefix   text;
  v_nummer   text;
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

  -- Ein Entwurf wird verworfen, nicht storniert: Er traegt keine Nummer und
  -- hinterlaesst keine Luecke (ADR-009, Konsequenz zu Punkt 8).
  if v_invoice.status <> 'issued' then
    raise exception 'only an issued invoice can be cancelled' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.invoice_cancellations c where c.invoice_id = p_invoice_id
  ) then
    raise exception 'invoice is already cancelled' using errcode = '23514';
  end if;

  -- Ein Storno ohne Grund waere ein Beleg ohne Aussage - dieselbe Zusage wie
  -- beim Zahlungsstorno (ABR-004).
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'a cancellation needs a reason' using errcode = '22023';
  end if;

  -- Zuerst das Geld, dann das Dokument: Eine stehende Zahlung an einer
  -- stornierten Rechnung waere ein Eingang ohne Forderung. Die Zahlung laesst
  -- sich mit Grund stornieren (ABR-004), danach geht das hier.
  if exists (
    select 1 from public.payments p
    where p.invoice_id = p_invoice_id and p.voided_at is null
  ) then
    raise exception 'void the payments of this invoice first' using errcode = '23514';
  end if;

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  v_prefix := app.invoice_number_prefix(v_org, v_invoice.service_area);

  if v_prefix is null then
    raise exception 'practice billing profile missing' using errcode = '22023';
  end if;

  v_nummer := app.next_invoice_number(
    v_org, extract(year from v_heute)::smallint, v_invoice.service_area, v_prefix);

  insert into public.invoice_cancellations (
    organization_id, invoice_id, cancellation_number, reason, cancelled_on, created_by
  )
  values (v_org, p_invoice_id, v_nummer, btrim(p_reason), v_heute, v_actor);

  -- Die Leistungen sind wieder abrechenbar. Beides gehoert zusammen: die
  -- Freigabe der Zeile und der Zustand der Leistung; nur eines von beiden
  -- liesse die Leistung entweder unsichtbar oder doppelt abrechenbar.
  update public.invoice_items it
     set released_at = now()
   where it.invoice_id = p_invoice_id
     and it.released_at is null;

  update public.billable_services b
     set status = 'billable'
   where b.id in (
     select it.billable_service_id
     from public.invoice_items it
     where it.invoice_id = p_invoice_id
   );

  -- Der Grund steht in der Zeile, nicht hier: Ein freier Text kann
  -- Patientenbezug tragen (ADR-011, ADR-010 Punkt 3).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'invoice.cancelled', 'invoice', p_invoice_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_invoice.patient_id,
                       'invoice_number', v_invoice.invoice_number,
                       'cancellation_number', v_nummer,
                       'service_area', v_invoice.service_area,
                       'total_cents', v_invoice.total_cents)
  );

  return v_nummer;
end;
$$;

comment on function public.cancel_invoice(uuid, text) is
  'Storniert eine ausgestellte Rechnung mit Grund und gibt ihre Leistungen wieder frei (ABR-003c, ADR-009 Punkt 9). Die Rechnung selbst bleibt unveraendert; das Stornodokument traegt eine eigene Nummer aus dem Kreis **ihres** Leistungsbereichs (ABR-010, Punkt 17).';

revoke all on function public.cancel_invoice(uuid, text) from public, anon;
grant execute on function public.cancel_invoice(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Die Stammdaten fuehren beide Kuerzel
--
-- Uebernommen aus 20260920103000_iban_checksum.sql, um einen Parameter
-- ergaenzt. Die alte Signatur wird entfernt: Ein Aufruf ohne das zweite
-- Kuerzel setzte es still auf den Vorgabewert zurueck.
-- -----------------------------------------------------------------------------
drop function public.save_practice_billing_profile(
  text, text, text, text, text, text, text, text, text, boolean,
  text, text, text, text, text, smallint);

create or replace function public.save_practice_billing_profile(
  p_legal_name                     text,
  p_street                         text,
  p_house_number                   text,
  p_postal_code                    text,
  p_city                           text,
  p_phone                          text,
  p_email                          text,
  p_tax_number                     text,
  p_vat_id                         text,
  p_small_business                 boolean,
  p_bank_name                      text,
  p_account_holder                 text,
  p_iban                           text,
  p_bic                            text,
  p_invoice_number_prefix          text,
  p_payment_term_days              smallint,
  p_training_invoice_number_prefix text default 'TR'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor    uuid;
  v_org      uuid;
  v_neu      boolean;
  v_prefix   text;
  v_training text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_billing_profile() then
    raise exception 'not allowed to manage the billing profile' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  if p_small_business is null then
    raise exception 'the vat status must be stated explicitly' using errcode = '22023';
  end if;

  -- Die IBAN wird geprueft, bevor sie in den Snapshot jeder spaeteren
  -- Rechnung wandert (ADR-009 Punkt 10). Die Tabelle haelt dieselbe Zusage;
  -- hier steht sie, damit die Meldung sagt, was zu tun ist.
  if not app.iban_checksum_ok(p_iban) then
    raise exception 'the iban checksum does not match' using errcode = '22023';
  end if;

  v_prefix   := coalesce(upper(nullif(btrim(p_invoice_number_prefix), '')), 'RG');
  v_training := coalesce(upper(nullif(btrim(p_training_invoice_number_prefix), '')), 'TR');

  -- Dieselbe Zusage wie die Constraint, nur mit einer Meldung, die sagt, was
  -- zu tun ist (ADR-009 Punkt 17).
  if v_prefix = v_training then
    raise exception 'the two invoice number prefixes must differ' using errcode = '22023';
  end if;

  v_neu := not exists (
    select 1 from public.practice_billing_profiles where organization_id = v_org
  );

  insert into public.practice_billing_profiles as b (
    organization_id, legal_name, street, house_number, postal_code, city,
    phone, email, tax_number, vat_id, small_business,
    bank_name, account_holder, iban, bic,
    invoice_number_prefix, training_invoice_number_prefix, payment_term_days,
    created_by, updated_by
  )
  values (
    v_org,
    btrim(p_legal_name), btrim(p_street), nullif(btrim(p_house_number), ''),
    btrim(p_postal_code), btrim(p_city),
    nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''),
    btrim(p_tax_number), nullif(btrim(p_vat_id), ''), p_small_business,
    nullif(btrim(p_bank_name), ''), nullif(btrim(p_account_holder), ''),
    -- Die IBAN steht auf dem Papier mit Leerzeichen und in der Datenbank ohne.
    upper(replace(btrim(p_iban), ' ', '')),
    upper(nullif(btrim(p_bic), '')),
    v_prefix, v_training,
    coalesce(p_payment_term_days, 14::smallint),
    v_actor, v_actor
  )
  on conflict (organization_id) do update set
    legal_name                    = excluded.legal_name,
    street                        = excluded.street,
    house_number                  = excluded.house_number,
    postal_code                   = excluded.postal_code,
    city                          = excluded.city,
    phone                         = excluded.phone,
    email                         = excluded.email,
    tax_number                    = excluded.tax_number,
    vat_id                        = excluded.vat_id,
    small_business                = excluded.small_business,
    bank_name                     = excluded.bank_name,
    account_holder                = excluded.account_holder,
    iban                          = excluded.iban,
    bic                           = excluded.bic,
    invoice_number_prefix         = excluded.invoice_number_prefix,
    training_invoice_number_prefix = excluded.training_invoice_number_prefix,
    payment_term_days             = excluded.payment_term_days,
    updated_at                    = now(),
    updated_by                    = v_actor
  where b.organization_id = v_org;

  -- Kein Inhalt im Kontext: Eine Steuernummer gehoert nicht ins Auditlog
  -- (ADR-011). Was sich geaendert hat, steht in der Zeile selbst.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'organization.billing_profile_changed', 'organization', v_org, 'success',
    jsonb_build_object('surface', 'web', 'created', v_neu)
  );
end;
$$;

comment on function public.save_practice_billing_profile(text, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, smallint, text) is
  'Legt die Praxis-Stammdaten fuer Rechnungen an oder aendert sie (ABR-000, R3-010). Nur owner (ANN-074). Prueft die IBAN nach ISO 13616 und seit ABR-010, dass die beiden Nummernkreis-Kuerzel sich unterscheiden (ADR-009 Punkt 17). Protokolliert organization.billing_profile_changed ohne Inhalte (ADR-011).';

revoke all on function public.save_practice_billing_profile(
  text, text, text, text, text, text, text, text, text, boolean,
  text, text, text, text, text, smallint, text) from public, anon;
grant execute on function public.save_practice_billing_profile(
  text, text, text, text, text, text, text, text, text, boolean,
  text, text, text, text, text, smallint, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Die Rechnungsliste nennt den Bereich
--
-- Uebernommen aus 20260920107000_invoice_lists_paid_join.sql, um eine Spalte
-- ergaenzt. Ein Entwurf traegt noch keine Nummer; ohne diese Spalte waere an
-- ihm nicht zu sehen, welche Rechnung er einmal wird.
-- -----------------------------------------------------------------------------
drop function public.list_invoices(integer);

create or replace function public.list_invoices(p_limit integer default 100)
returns table (
  id                uuid,
  status            text,
  invoice_number    text,
  period_month      date,
  service_area      text,
  issued_on         date,
  due_on            date,
  patient_id        uuid,
  patient_name      text,
  recipient_name    text,
  recipient_kind    text,
  total_cents       integer,
  currency          text,
  item_count        integer,
  paid_cents        integer,
  outstanding_cents integer,
  payment_state     text,
  overdue           boolean,
  cancelled         boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_zeitzone text;
  v_heute    date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    raise exception 'not allowed to read invoices' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_heute := (now() at time zone v_zeitzone)::date;

  return query
  with auswahl as (
    -- Erst begrenzen, dann anreichern: Reihenfolge und Auswahl haengen allein
    -- an Spalten der Rechnung. Alles Weitere - Name, Empfaenger, Zeilensumme,
    -- Zahlungsstand - wird nur noch fuer die gelieferten Zeilen geholt.
    select i.*
    from public.invoices i
    where i.organization_id = v_org
    order by i.status, i.period_month desc, i.invoice_number desc nulls first, i.id
    limit greatest(least(coalesce(p_limit, 100), 200), 1)
  )
  select i.id, i.status, i.invoice_number, i.period_month, i.service_area, i.issued_on, i.due_on,
         i.patient_id,
         pe.given_name || ' ' || pe.family_name,
         coalesce(r.name, pe.given_name || ' ' || pe.family_name),
         coalesce(r.recipient_kind, 'self'),
         -- Der Entwurf rechnet live, die ausgestellte Rechnung zeigt ihren
         -- festgeschriebenen Betrag (ADR-009 Punkt 10).
         coalesce(i.total_cents, summe.brutto)::integer,
         coalesce(i.currency, summe.currency),
         summe.anzahl::integer,
         -- Neu mit ABR-004: Der Zahlungsstand wird gerechnet, nicht gelesen.
         -- Am Entwurf gibt es keinen - an ihm kann niemand zahlen.
         case when i.status = 'issued' then coalesce(zahlung.bezahlt, 0) else 0 end,
         case when i.status = 'issued'
              then i.total_cents - coalesce(zahlung.bezahlt, 0) else 0 end,
         case when i.status = 'issued'
              then app.invoice_payment_state(i.total_cents, coalesce(zahlung.bezahlt, 0))
              else 'unpaid' end,
         -- Seit ABR-003c: Eine stornierte Rechnung wird nicht ueberfaellig.
         (i.status = 'issued' and i.due_on < v_heute
          and coalesce(zahlung.bezahlt, 0) < i.total_cents
          and not exists (
            select 1 from public.invoice_cancellations c where c.invoice_id = i.id
          )),
         exists (select 1 from public.invoice_cancellations c where c.invoice_id = i.id)
  from auswahl i
  join public.patients p  on p.id = i.patient_id
  join public.persons  pe on pe.id = p.person_id
  left join public.invoice_recipients r on r.id = i.recipient_id
  left join lateral (
    select sum(b.quantity * c.unit_price_cents) as brutto,
           max(c.currency) as currency,
           count(*) as anzahl
    from public.invoice_items it
    join public.billable_services b     on b.id = it.billable_service_id
    join public.service_catalog_items c on c.id = b.catalog_item_id
    where it.invoice_id = i.id
  ) summe on true
  -- Die Zahlungssumme einmal je Rechnung statt viermal je Zeile - und nur
  -- noch fuer die begrenzte Auswahl (R3-016).
  left join lateral (
    select sum(case when p.direction = 'incoming' then p.amount_cents
                    else -p.amount_cents end)::integer as bezahlt
    from public.payments p
    where p.invoice_id = i.id
      and p.voided_at is null
  ) zahlung on true
  order by i.status, i.period_month desc, i.invoice_number desc nulls first, i.id;
end;
$$;

comment on function public.list_invoices(integer) is
  'Rechnungen der Praxis mit Zustand, Nummer, Leistungsbereich, Empfaenger, Betrag, Zahlungsstand und Storno (ABR-003, ABR-004, ABR-003c, ABR-010). Ein Entwurf rechnet live, eine ausgestellte Rechnung zeigt ihren festgeschriebenen Betrag; Zahlungsstand und Storno sind abgeleitet und nirgends gepflegt (ADR-009 Punkt 12, ANN-079). Die Zahlungssumme entsteht einmal je Rechnung (R3-016).';

revoke all on function public.list_invoices(integer) from public, anon;
grant execute on function public.list_invoices(integer) to authenticated;
