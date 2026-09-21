-- =============================================================================
-- ABR-011: Einnahmen je Leistungsart
--
-- ADR-009 Fassung 2 Punkt 19: "Die Plattform fuehrt eine Auswertung 'Einnahmen
-- je Leistungsart'. Sie trennt die Erloese je Leistungsbereich und schluesselt
-- sie innerhalb des Bereichs je Steuerkennzeichen und Satz auf. Sie rechnet
-- ausschliesslich aus ausgestellten Rechnungen (Snapshot, Punkt 10),
-- Korrektur- und Stornodokumenten (Punkt 9) und gebuchten Zahlungen
-- (Punkt 12). Sie benennt ihre Grundlage ausdruecklich - Zufluss oder
-- Rechnungsstellung - und mischt beide nie in einer Zahl; welche Grundlage die
-- Gewinnermittlung verlangt, entscheidet die Steuerberatung (B9) und nicht die
-- Software. Sie ist deterministisch und ohne KI (Punkt 6, ADR-005) und kein
-- steuerlicher Abschluss: eine Summe, keine Bewertung."
--
-- Fuenf Festlegungen tragen das:
--
--   1. **Die Grundlage ist ein Pflichtargument.** `p_basis` hat keinen
--      Vorgabewert, ein unbekannter Wert wird abgewiesen, und jede gelieferte
--      Zeile traegt ihre Grundlage mit. Es gibt damit keinen Weg, eine Zahl zu
--      bekommen, ohne ihre Grundlage zu nennen - das ist die technische Seite
--      von "benennt ihre Grundlage ausdruecklich". Eine Vorgabe waere genau
--      die Wahl, die ADR-009 der Software verbietet.
--   2. **Zwei Grundlagen, zwei getrennte Rechenwege.** `accrual`
--      (Rechnungsstellung) liest ausgestellte Rechnungen und Stornodokumente,
--      `cash` (Zufluss) gebuchte Zahlungen. Die Wege teilen keinen
--      Zwischenwert; ein Aufruf liefert immer genau einen von beiden. "Mischt
--      beide nie in einer Zahl" ist damit keine Regel der Oberflaeche.
--   3. **Die Zahlen kommen aus dem Snapshot, nicht aus dem Katalog.** Der
--      Katalog von heute sagt nichts ueber eine Rechnung von vorgestern
--      (Punkt 5 und 10). Gelesen wird deshalb `invoices.snapshot`; ein Entwurf
--      traegt keinen und zaehlt nirgends mit - er ist kein Dokument.
--   4. **Das Storno kehrt um, es loescht nicht.** Eine ausgestellte Rechnung
--      steht mit ihrem Ausstellungstag in der Auswertung, ihr Stornodokument
--      mit seinem eigenen Tag und umgekehrtem Vorzeichen (Punkt 9). Wird im
--      Januar storniert, was im Dezember ausgestellt wurde, bleibt der Dezember
--      wie er war - alles andere waere eine nachtraegliche Aenderung an einem
--      abgeschlossenen Zeitraum. Die Korrekturrechnung ist eine eigene
--      ausgestellte Rechnung und zaehlt als solche.
--   5. **Eine Zahlung wird auf die Steuergruppen ihrer Rechnung verteilt**
--      (ANN-088): anteilig nach ihrem Bruttoanteil, centgenau, der
--      verbleibende Rest nach groesstem Bruchteil und bei Gleichstand in
--      fester Reihenfolge. Eine Vollzahlung ergibt damit exakt die Gruppen des
--      Dokuments, eine Teilzahlung ihren Anteil - und kein Cent verschwindet.
--
-- KEIN Personenbezug: Die Auswertung liefert Summen ueber Bereich,
-- Steuerkennzeichen und Satz. Sie nennt keine Patientin, keine Rechnung und
-- keinen Posten, und sie liest keine klinischen Inhalte (Punkt 10). Wer sie
-- sehen darf, folgt ADR-004 und Par. 4.3 und wird hier nicht neu entschieden:
-- `app.can_read_invoicing()`, also `owner` und `office` - dieselben, die jede
-- Rechnung ohnehin vollstaendig lesen duerfen.
--
-- Das Ausfallhonorar - offene Folgefrage der Fassung 2 - braucht keine eigene
-- Mechanik: Es haengt wie jeder Posten an einer Katalogposition, traegt von
-- dort `not_taxable` und ihren Leistungsbereich und erscheint damit im Bereich
-- seiner Position unter seinem eigenen Kennzeichen. Eine Sonderbehandlung
-- waere eine Bewertung, und die trifft diese Auswertung nicht.
--
-- NICHT hier: keine Gewinnermittlung, kein Abschluss, kein Export, keine
-- Bewertung und keine zweite Wahrheit neben dem Dokument. Kein Schreibweg -
-- die Migration legt zwei lesende Funktionen an und aendert keine Tabelle.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Welche Jahre ueberhaupt Zahlen tragen
--
-- Die Oberflaeche braucht die Jahre, bevor sie eines auswaehlen kann. Sie aus
-- der Uhr des Browsers zu raten waere falsch: Ein leeres Jahr saehe dann aus
-- wie ein Jahr ohne Einnahmen. Gefragt werden dieselben drei Quellen, aus
-- denen Punkt 19 rechnet - was kein Jahr liefert, gibt es nicht zur Auswahl.
-- -----------------------------------------------------------------------------
create or replace function public.list_revenue_years()
returns table (year integer)
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
    raise exception 'not allowed to read invoicing figures' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();

  return query
  select distinct j.jahr
  from (
    select extract(year from i.issued_on)::integer as jahr
    from public.invoices i
    where i.organization_id = v_org and i.status = 'issued' and i.issued_on is not null
    union all
    select extract(year from c.cancelled_on)::integer
    from public.invoice_cancellations c
    where c.organization_id = v_org
    union all
    select extract(year from p.paid_on)::integer
    from public.payments p
    where p.organization_id = v_org and p.voided_at is null
  ) j
  order by j.jahr desc;
end;
$$;

comment on function public.list_revenue_years() is
  'Kalenderjahre, in denen ein Dokument oder eine Zahlung liegt (ABR-011). Grundlage der Jahreswahl in der Auswertung; kein Personenbezug.';

revoke all on function public.list_revenue_years() from public, anon;
grant execute on function public.list_revenue_years() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Einnahmen je Leistungsart
--
-- `p_basis`: 'accrual' = Rechnungsstellung, 'cash' = Zufluss. Pflicht, ohne
-- Vorgabe (Festlegung 1). `p_year`: Kalenderjahr; null bedeutet das laufende
-- Jahr in der Zeitzone der Praxis - nicht in der des Browsers.
--
-- Die Auswertung liefert **alle** Zeilen und kennt keine Obergrenze: Ihre
-- Zeilenzahl ist das Produkt aus Bereich, Kennzeichen, Satz und Waehrung und
-- damit klein und beschraenkt. Eine Summe ueber die gelieferten Zeilen ist
-- deshalb hier dieselbe wie eine Summe ueber alle - anders als bei den offenen
-- Posten, wo der Server sie deshalb selbst rechnet.
--
-- Eine Zeile mit Summe null bleibt stehen. Sie sagt etwas anderes als eine
-- fehlende Zeile: In diesem Bereich ist etwas ausgestellt und wieder storniert
-- worden. Das zu verschweigen waere eine Bewertung.
-- -----------------------------------------------------------------------------
create or replace function public.list_revenue_by_service_area(
  p_basis text,
  p_year  integer default null
)
returns table (
  basis             text,
  year              integer,
  service_area      text,
  tax_treatment     text,
  tax_rate_permille smallint,
  currency          text,
  gross_cents       bigint,
  tax_cents         bigint,
  net_cents         bigint,
  document_count    integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_zeitzone text;
  v_jahr     integer;
  v_von      date;
  v_bis      date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    raise exception 'not allowed to read invoicing figures' using errcode = '42501';
  end if;

  -- Festlegung 1: ohne genannte Grundlage keine Zahl.
  if p_basis is null or p_basis not in ('accrual', 'cash') then
    raise exception 'unknown revenue basis' using errcode = '22023';
  end if;

  v_org := app.current_organization_id();

  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;
  v_jahr := coalesce(p_year, extract(year from (now() at time zone v_zeitzone))::integer);

  if v_jahr < 2020 or v_jahr > 2200 then
    raise exception 'year out of range' using errcode = '22023';
  end if;

  v_von := make_date(v_jahr, 1, 1);
  v_bis := make_date(v_jahr + 1, 1, 1);

  return query
  with dokument as (
    -- Grundlage Rechnungsstellung, Teil 1: die ausgestellte Rechnung mit
    -- ihrem Ausstellungstag. Der Bereich steht seit ABR-010 im Snapshot; die
    -- Spalte bleibt als Rueckfallweg fuer aeltere Snapshots (schema_version 1
    -- und 2), die es ausserhalb von Entwicklungsdatenbanken nicht gibt.
    select i.id                                                      as document_id,
           coalesce(i.snapshot ->> 'service_area', i.service_area)   as service_area,
           i.currency                                                as currency,
           i.snapshot -> 'tax_groups'                                as tax_groups,
           1                                                         as vorzeichen
    from public.invoices i
    where p_basis = 'accrual'
      and i.organization_id = v_org
      and i.status = 'issued'
      and i.issued_on >= v_von and i.issued_on < v_bis
    union all
    -- Teil 2: das Stornodokument mit seinem eigenen Tag und umgekehrtem
    -- Vorzeichen (Festlegung 4). Es traegt keine eigenen Betraege - es nimmt
    -- die seiner Rechnung zurueck, und genau das steht darin.
    select c.id,
           coalesce(i.snapshot ->> 'service_area', i.service_area),
           i.currency,
           i.snapshot -> 'tax_groups',
           -1
    from public.invoice_cancellations c
    join public.invoices i on i.id = c.invoice_id
    where p_basis = 'accrual'
      and c.organization_id = v_org
      and c.cancelled_on >= v_von and c.cancelled_on < v_bis
  ),
  nach_rechnungsstellung as (
    select d.service_area,
           g ->> 'tax_treatment'                            as tax_treatment,
           (g ->> 'tax_rate_permille')::smallint            as tax_rate_permille,
           d.currency,
           d.document_id,
           d.vorzeichen * (g ->> 'gross_cents')::bigint     as brutto,
           d.vorzeichen * (g ->> 'tax_cents')::bigint       as steuer,
           d.vorzeichen * (g ->> 'net_cents')::bigint       as netto
    from dokument d
    cross join lateral jsonb_array_elements(d.tax_groups) as g
  ),
  zahlung as (
    -- Grundlage Zufluss: gebuchte Zahlungen. Eine stornierte Zahlung ist aus
    -- jeder Summe heraus (`voided_at`), eine Rueckzahlung kehrt das Vorzeichen
    -- um. Der Bereich und die Steuergruppen kommen aus der Rechnung, zu der
    -- die Zahlung gehoert - eine Zahlung kennt sie nicht selbst.
    select p.id                                                    as document_id,
           case p.direction when 'incoming' then 1 else -1 end     as vorzeichen,
           p.amount_cents::bigint                                  as betrag,
           i.currency                                              as currency,
           coalesce(i.snapshot ->> 'service_area', i.service_area) as service_area,
           i.snapshot -> 'tax_groups'                              as tax_groups
    from public.payments p
    join public.invoices i on i.id = p.invoice_id
    where p_basis = 'cash'
      and p.organization_id = v_org
      and p.voided_at is null
      and p.paid_on >= v_von and p.paid_on < v_bis
  ),
  gruppe as (
    select z.document_id,
           z.vorzeichen,
           z.betrag,
           z.currency,
           z.service_area,
           g ->> 'tax_treatment'                 as tax_treatment,
           (g ->> 'tax_rate_permille')::smallint as tax_rate_permille,
           (g ->> 'gross_cents')::bigint         as gruppe_brutto,
           (g ->> 'tax_cents')::bigint           as gruppe_steuer,
           sum((g ->> 'gross_cents')::bigint) over (partition by z.document_id) as summe_brutto
    from zahlung z
    cross join lateral jsonb_array_elements(z.tax_groups) as g
  ),
  abgerundet as (
    -- ANN-088, Schritt 1: der ganzzahlige Anteil und sein Rest. Gerechnet wird
    -- in Cent und ohne Gleitkomma - eine Aufteilung, die von der Rundung des
    -- Prozessors abhinge, waere nicht deterministisch.
    select g.*,
           case when g.summe_brutto > 0
                then (g.betrag * g.gruppe_brutto) / g.summe_brutto else 0 end as anteil,
           case when g.summe_brutto > 0
                then (g.betrag * g.gruppe_brutto) % g.summe_brutto else 0 end as rest
    from gruppe g
  ),
  verteilt as (
    -- Schritt 2: die uebrigen Cent gehen an die groessten Reste; bei gleichem
    -- Rest entscheidet die feste Reihenfolge der Gruppe. Dieselbe Zahlung
    -- ergibt damit immer dieselbe Aufteilung.
    select a.*,
           row_number() over (partition by a.document_id
                              order by a.rest desc, a.tax_treatment, a.tax_rate_permille) as platz,
           a.betrag - sum(a.anteil) over (partition by a.document_id) as offene_cent
    from abgerundet a
  ),
  nach_zufluss as (
    select v.service_area,
           v.tax_treatment,
           v.tax_rate_permille,
           v.currency,
           v.document_id,
           v.vorzeichen * anteilig.brutto as brutto,
           v.vorzeichen * anteilig.steuer as steuer,
           v.vorzeichen * (anteilig.brutto - anteilig.steuer) as netto
    from verteilt v
    cross join lateral (
      select case
               -- Der Normalfall: anteilig plus ein Cent aus dem Rest.
               when v.summe_brutto > 0 then v.anteil + case when v.platz <= v.offene_cent then 1 else 0 end
               -- Eine Rechnung ueber null Cent laesst sich nicht anteilig
               -- aufteilen. Eine Zahlung darauf ist eine Ueberzahlung; sie
               -- geht vollstaendig an die erste Gruppe in fester Reihenfolge,
               -- damit sie in der Summe erscheint statt zu verschwinden.
               when v.platz = 1 then v.betrag
               else 0
             end as brutto
    ) roh
    cross join lateral (
      select roh.brutto,
             -- Die enthaltene Steuer wird mit derselben Formel gerechnet wie
             -- im Dokument (app.build_invoice_document). Wo das Dokument keine
             -- ausweist - steuerfrei, nicht steuerbar oder Par. 19 UStG -,
             -- weist auch die Auswertung keine aus: Sonst stuende in einer
             -- Summe Steuer, die auf keiner Rechnung steht (Punkt 18).
             case when v.gruppe_steuer = 0 then 0::bigint
                  else round(roh.brutto::numeric * v.tax_rate_permille
                             / (1000 + v.tax_rate_permille))::bigint
             end as steuer
    ) anteilig
  ),
  alles as (
    select * from nach_rechnungsstellung
    union all
    select * from nach_zufluss
  )
  select p_basis,
         v_jahr,
         a.service_area,
         a.tax_treatment,
         a.tax_rate_permille,
         a.currency,
         sum(a.brutto)::bigint,
         sum(a.steuer)::bigint,
         sum(a.netto)::bigint,
         count(distinct a.document_id)::integer
  from alles a
  group by a.service_area, a.tax_treatment, a.tax_rate_permille, a.currency
  order by a.service_area, a.tax_treatment, a.tax_rate_permille, a.currency;
end;
$$;

comment on function public.list_revenue_by_service_area(text, integer) is
  'Einnahmen je Leistungsart (ABR-011, ADR-009 Punkt 19): Erloese getrennt je Leistungsbereich, darin je Steuerkennzeichen und Satz. Grundlage ist Pflicht - accrual (Rechnungsstellung) oder cash (Zufluss) -, steht in jeder Zeile und wird nie gemischt. Rechnet ausschliesslich aus Snapshots ausgestellter Rechnungen, Stornodokumenten und gebuchten Zahlungen; deterministisch und ohne KI. Kein steuerlicher Abschluss und kein Personenbezug.';

revoke all on function public.list_revenue_by_service_area(text, integer) from public, anon;
grant execute on function public.list_revenue_by_service_area(text, integer) to authenticated;
