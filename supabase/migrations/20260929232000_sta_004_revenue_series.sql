-- =============================================================================
-- STA-004: Umsatz der letzten Monate und umsatzstaerkste Leistungen
-- (STA-EPIC-001, Grafiken)
--
-- Zwei lesende Funktionen fuer die Grafiken der Statistikseite, beide allein
-- owner (app.can_read_practice_statistics), beide nur Summen ohne Person:
--
--   * list_practice_revenue_months: je Monat Umsatz (Rechnungsstellung, je
--     Bereich) und Zahlungseingang (Zufluss) - aus denselben beiden Regeln wie
--     die Kennzahlen (app.revenue_documents, app.payment_flows). Zwei Reihen,
--     nie verrechnet (ANN-151).
--   * list_top_services: Umsatz eines Monats je Leistung (Kuerzel und
--     Bezeichnung der Katalogposition), nach Rechnungsstellung.
--
-- Die Leistung steht an der Rechnungszeile im Snapshot (`items`: Kuerzel,
-- Bezeichnung, Zeilenbetrag) - eingefroren wie der Rest des Dokuments. Die
-- Leistungen werden deshalb aus dem Snapshot gerechnet
-- (app.revenue_snapshot_items); ein Test haelt die Summe der Zeilen gleich der
-- Summe der Steuergruppen.
--
-- Die behandelnde Person steht NICHT im Snapshot. app.revenue_staff_lines
-- liest sie ueber Rechnungsposten -> erfasste Leistung -> Termin. Diese Kette
-- ist nicht eingefroren: Wird eine Leistung nach einem Storno geloescht,
-- faellt ihr Posten weg. STA-006 fuehrt die Differenz zur Praxissumme deshalb
-- als "ohne Zuordnung", statt die Summen auseinanderlaufen zu lassen
-- (ANN-156).
-- =============================================================================

create function app.revenue_snapshot_items(p_organization_id uuid, p_from date, p_to date)
returns table (tag date, code text, label text, betrag bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with dokument as (
    select i.snapshot, i.issued_on as tag, 1 as vorzeichen
    from public.invoices i
    where i.organization_id = p_organization_id
      and i.status = 'issued'
      and i.issued_on >= p_from
      and i.issued_on < p_to
    union all
    select i.snapshot, c.cancelled_on, -1
    from public.invoice_cancellations c
    join public.invoices i on i.id = c.invoice_id
    where c.organization_id = p_organization_id
      and c.cancelled_on >= p_from
      and c.cancelled_on < p_to
  )
  select d.tag,
         z ->> 'code',
         z ->> 'label',
         (d.vorzeichen * (z ->> 'line_total_cents')::bigint)::bigint
  from dokument d
  cross join lateral jsonb_array_elements(coalesce(d.snapshot -> 'items', '[]'::jsonb)) as z
$$;

comment on function app.revenue_snapshot_items(uuid, date, date) is
  'STA-004: Umsatz nach Rechnungsstellung je Zeile des Snapshots im Zeitraum [p_from, p_to) mit Kuerzel und Bezeichnung; Storno am eigenen Tag mit umgekehrtem Vorzeichen. Eingefroren wie das Dokument. Ohne Rollenpruefung.';
revoke all on function app.revenue_snapshot_items(uuid, date, date) from public, anon, authenticated;

create function app.revenue_staff_lines(p_organization_id uuid, p_from date, p_to date)
returns table (tag date, invoice_id uuid, staff_member_id uuid, betrag bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with dokument as (
    select i.id, i.issued_on as tag, 1 as vorzeichen
    from public.invoices i
    where i.organization_id = p_organization_id
      and i.status = 'issued'
      and i.issued_on >= p_from
      and i.issued_on < p_to
    union all
    select c.invoice_id, c.cancelled_on, -1
    from public.invoice_cancellations c
    where c.organization_id = p_organization_id
      and c.cancelled_on >= p_from
      and c.cancelled_on < p_to
  )
  select d.tag,
         d.id,
         a.staff_member_id,
         (d.vorzeichen * b.quantity * ci.unit_price_cents)::bigint
  from dokument d
  join public.invoice_items it         on it.invoice_id = d.id
  join public.billable_services b      on b.id = it.billable_service_id
  join public.service_catalog_items ci on ci.id = b.catalog_item_id
  left join public.appointments a      on a.id = b.appointment_id
$$;

comment on function app.revenue_staff_lines(uuid, date, date) is
  'STA-004: Umsatz nach Rechnungsstellung je Rechnungsposten mit der behandelnden Person des Termins, Storno mit umgekehrtem Vorzeichen. Nicht eingefroren (ein geloeschter Posten faellt weg); STA-006 fuehrt die Differenz zur Praxissumme als ohne Zuordnung (ANN-156). Ohne Rollenpruefung.';
revoke all on function app.revenue_staff_lines(uuid, date, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Monatsreihe
-- -----------------------------------------------------------------------------
create function public.list_practice_revenue_months(p_months integer default 12)
returns table (
  month                  date,
  revenue_cents          bigint,
  revenue_therapy_cents  bigint,
  revenue_training_cents bigint,
  payments_cents         bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_tz    text;
  v_bis   date;
  v_von   date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_practice_statistics() then
    perform app.record_denied_read(auth.uid(), 'statistics.read', 'not allowed to read practice statistics');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read practice statistics' using errcode = '42501';
  end if;
  if p_months is null or p_months < 1 or p_months > 36 then
    raise exception 'months out of range' using errcode = '22023';
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  -- Bis einschliesslich des laufenden Monats in der Zeitzone der Praxis.
  v_bis := (date_trunc('month', (now() at time zone v_tz)::date) + interval '1 month')::date;
  v_von := (v_bis - make_interval(months => p_months))::date;

  return query
  with monate as (
    select g::date as monat
    from generate_series(v_von::timestamp, (v_bis - interval '1 month')::timestamp, interval '1 month') g
  ),
  umsatz as (
    select date_trunc('month', r.tag)::date as monat,
           sum(r.betrag)::bigint as gesamt,
           sum(r.betrag) filter (where r.bereich = 'therapy')::bigint as behandlung,
           sum(r.betrag) filter (where r.bereich = 'training')::bigint as training
    from app.revenue_documents(v_org, v_von, v_bis) r
    group by 1
  ),
  zufluss as (
    select date_trunc('month', z.tag)::date as monat, sum(z.betrag)::bigint as summe
    from app.payment_flows(v_org, v_von, v_bis) z
    group by 1
  )
  select m.monat,
         coalesce(u.gesamt, 0)::bigint,
         coalesce(u.behandlung, 0)::bigint,
         coalesce(u.training, 0)::bigint,
         coalesce(z.summe, 0)::bigint
  from monate m
  left join umsatz u  on u.monat = m.monat
  left join zufluss z on z.monat = m.monat
  order by m.monat;
end;
$$;

comment on function public.list_practice_revenue_months(integer) is
  'STA-004: je Monat (bis einschliesslich des laufenden) Umsatz nach Rechnungsstellung, getrennt je Bereich, und Zahlungseingang - zwei Grundlagen, nie verrechnet. Nur Summen, allein owner; abgewiesen als statistics.read.';
revoke all on function public.list_practice_revenue_months(integer) from public, anon;
grant execute on function public.list_practice_revenue_months(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Umsatzstaerkste Leistungen eines Monats
-- -----------------------------------------------------------------------------
create function public.list_top_services(p_month date default null, p_limit integer default 10)
returns table (
  code          text,
  label         text,
  revenue_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_tz    text;
  v_monat date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not app.can_read_practice_statistics() then
    perform app.record_denied_read(auth.uid(), 'statistics.read', 'not allowed to read practice statistics');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read practice statistics' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'limit out of range' using errcode = '22023';
  end if;

  select o.time_zone into v_tz from public.organizations o where o.id = v_org;
  v_monat := date_trunc('month', coalesce(p_month, (now() at time zone v_tz)::date))::date;
  if v_monat < date '2020-01-01' or v_monat > date '2200-01-01' then
    raise exception 'month out of range' using errcode = '22023';
  end if;

  return query
  select l.code, l.label, sum(l.betrag)::bigint
  from app.revenue_snapshot_items(v_org, v_monat, (v_monat + interval '1 month')::date) l
  -- Kuerzel und Bezeichnung zusammen: dasselbe Kuerzel in zwei Katalogen
  -- bleibt zwei Zeilen.
  group by l.code, l.label
  -- Eine Leistung, die im Monat nur storniert wurde, bleibt als negative Zeile
  -- sichtbar - verschweigen waere eine Bewertung (wie ABR-011).
  having sum(l.betrag) <> 0
  order by sum(l.betrag) desc, l.code, l.label
  limit p_limit;
end;
$$;

comment on function public.list_top_services(date, integer) is
  'STA-004: Umsatz eines Monats je Leistung (Kuerzel, Bezeichnung) nach Rechnungsstellung, absteigend. Nur Summen, keine Person; allein owner, abgewiesen als statistics.read.';
revoke all on function public.list_top_services(date, integer) from public, anon;
grant execute on function public.list_top_services(date, integer) to authenticated;
