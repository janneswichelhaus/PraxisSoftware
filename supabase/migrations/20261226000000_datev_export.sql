-- Export für die Steuerberatung im DATEV-Format: Einstellungen je Praxis, Exportläufe je Monat und
-- Bereich mit ihren Belegen. Jede Buchung geht genau einmal hinaus, Späteres als Nachtrag
-- (ANN-830); der Stapel trägt weder Namen noch Diagnosen (ANN-829).

create table public.datev_settings (
  organization_id        uuid primary key references public.organizations (id) on delete restrict,
  consultant_number      integer not null check (consultant_number between 1001 and 9999999),
  client_number_therapy  integer check (client_number_therapy between 1 and 99999),
  client_number_training integer check (client_number_training between 1 and 99999),
  chart_of_accounts      text not null check (chart_of_accounts in ('SKR03', 'SKR04')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint datev_settings_one_client check (
    client_number_therapy is not null or client_number_training is not null)
);

comment on table public.datev_settings is
  'Angaben der Praxis fuer den DATEV-Export (ADR-009): Beraternummer, Mandantennummer je Leistungsbereich und Kontenrahmen. Kein Personenbezug. Datenklasse: Abrechnungsdaten, faellt mit der Praxis. Lesbar fuer owner und office; geschrieben nur ueber save_datev_settings (owner).';

revoke all on public.datev_settings from public, anon, authenticated;
grant select on public.datev_settings to authenticated;
alter table public.datev_settings enable row level security;

create policy datev_settings_select_billing
  on public.datev_settings for select to authenticated
  using (organization_id = app.current_organization_id() and app.can_read_billing_profile());

create table public.datev_exports (
  id                uuid primary key default extensions.gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  service_area      text not null check (service_area in ('therapy', 'training')),
  period_month      date not null check (period_month = date_trunc('month', period_month)::date),
  sequence          smallint not null check (sequence >= 1),
  -- Die Angaben des Tages: Ein späterer Abruf liefert dieselbe Datei.
  consultant_number integer not null check (consultant_number between 1001 and 9999999),
  client_number     integer not null check (client_number between 1 and 99999),
  chart_of_accounts text not null check (chart_of_accounts in ('SKR03', 'SKR04')),
  created_at        timestamptz not null default now(),
  constraint datev_exports_sequence_key unique (organization_id, service_area, period_month, sequence)
);

comment on table public.datev_exports is
  'Ein Exportlauf fuer die Steuerberatung (ANN-830): Bereich, Monat, laufende Nummer (1 = erster Export, danach Nachtraege) und die DATEV-Angaben des Tages. Ohne Person: wer exportiert hat, haelt die Anwendung nicht fest (PROJECT_PRINCIPLES.md 20, ANN-829). Kein Personenbezug. Datenklasse: Abrechnungsdaten. Kein Tabellenrecht (ADR-004).';

revoke all on public.datev_exports from public, anon, authenticated;
alter table public.datev_exports enable row level security;

create table public.datev_export_documents (
  id              uuid primary key default extensions.gen_random_uuid(),
  export_id       uuid not null references public.datev_exports (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  invoice_id      uuid references public.invoices (id) on delete cascade,
  cancellation_id uuid references public.invoice_cancellations (id) on delete cascade,
  payment_id      uuid references public.payments (id) on delete cascade,
  -- true: das Storno der Zahlung, nicht die Zahlung selbst.
  payment_void    boolean not null default false,
  constraint datev_export_documents_one_document check (
    num_nonnulls(invoice_id, cancellation_id, payment_id) = 1
    and (not payment_void or payment_id is not null))
);

comment on table public.datev_export_documents is
  'Welche Rechnung, welches Storno, welche Zahlung und welches Zahlungsstorno ein Exportlauf getragen hat (ANN-830). Jedes Dokument hoechstens einmal; faellt mit seinem Dokument (cascade). Pseudonym: nur Kennungen. Datenklasse: Abrechnungsdaten. Kein Tabellenrecht (ADR-004).';

create index datev_export_documents_export_idx on public.datev_export_documents (export_id);
create unique index datev_export_documents_invoice_key
  on public.datev_export_documents (invoice_id) where invoice_id is not null;
create unique index datev_export_documents_cancellation_key
  on public.datev_export_documents (cancellation_id) where cancellation_id is not null;
create unique index datev_export_documents_payment_key
  on public.datev_export_documents (payment_id, payment_void) where payment_id is not null;

revoke all on public.datev_export_documents from public, anon, authenticated;
alter table public.datev_export_documents enable row level security;

insert into public.data_registry (
  table_name, subject_kind, export_mode, export_patient, export_training, export_parent,
  journal_mode, journal_key, journal_class, journal_class_training, journal_daily, journal_rank,
  merge_mode, decision_note
) values
  ('datev_settings', 'none', 'not_personal', '{}', '{}', null, 'none', 'id', null, null, false,
   null, 'not_applicable', null),
  ('datev_exports', 'none', 'not_personal', '{}', '{}', null, 'none', 'id', null, null, false,
   null, 'not_applicable', null),
  ('datev_export_documents', 'pseudonymous', 'excluded', '{}', '{}', null, 'via_parent', 'id',
   null, null, false, null, 'not_applicable',
   'Nur Kennungen, welches Dokument an die Steuerberatung ging; die Dokumente selbst stehen in der Auskunft. Ob Patienteninformation und Auskunft die Steuerberatung als Empfaengerin nennen, klaert B2 (ANN-829). Faellt mit dem Dokument (cascade), ein Restore zieht es mit.');

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('datev_settings', 'abrechnungsdaten', 'keine',
   'DATEV-Angaben der Praxis. Kein Personenbezug; sie gehoeren zur Praxis und fallen mit ihr.', 25),
  ('datev_exports', 'abrechnungsdaten', 'keine',
   'Exportlaeufe fuer die Steuerberatung. Kein Personenbezug und keine Person; Nachweis, welcher Monat wann ging.', 26),
  ('datev_export_documents', 'abrechnungsdaten', 'ueber_elterndatensatz',
   'Dokumente eines Exportlaufs. Fallen mit Rechnung, Storno oder Zahlung (cascade), also mit deren Frist.', 27);

-- Was ein Bereich noch nicht exportiert hat, ohne Monat aus allen Monaten. Ein Zahlungsstorno folgt
-- nur einer exportierten Zahlung; eine vorher stornierte Zahlung geht gar nicht hinaus (ANN-830).
create function app.datev_pending_documents(p_org uuid, p_area text, p_month date)
returns table (
  invoice_id      uuid,
  cancellation_id uuid,
  payment_id      uuid,
  payment_void    boolean,
  document_date   date
)
language sql stable
set search_path = ''
as $$
  with zeitraum as (
    select coalesce(p_month, date '2020-01-01') as von,
           coalesce((p_month + interval '1 month')::date, date '2201-01-01') as bis,
           o.time_zone as zeitzone
      from public.organizations o where o.id = p_org
  ),
  dokument as (
    select i.id as invoice_id, null::uuid as cancellation_id, null::uuid as payment_id,
           false as payment_void, i.issued_on as document_date
      from public.invoices i
     where i.organization_id = p_org and i.status = 'issued' and i.service_area = p_area
       and not exists (select 1 from public.datev_export_documents d where d.invoice_id = i.id)
    union all
    select null, c.id, null, false, c.cancelled_on
      from public.invoice_cancellations c
      join public.invoices i on i.id = c.invoice_id
     where c.organization_id = p_org and i.service_area = p_area
       and not exists (select 1 from public.datev_export_documents d where d.cancellation_id = c.id)
    union all
    select null, null, p.id, false, p.paid_on
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
     where p.organization_id = p_org and i.service_area = p_area and p.voided_at is null
       and not exists (select 1 from public.datev_export_documents d
                        where d.payment_id = p.id and not d.payment_void)
    union all
    select null, null, p.id, true, (p.voided_at at time zone o.time_zone)::date
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
      join public.organizations o on o.id = p.organization_id
     where p.organization_id = p_org and i.service_area = p_area and p.voided_at is not null
       and exists (select 1 from public.datev_export_documents d
                    where d.payment_id = p.id and not d.payment_void)
       and not exists (select 1 from public.datev_export_documents d
                        where d.payment_id = p.id and d.payment_void)
  )
  select d.invoice_id, d.cancellation_id, d.payment_id, d.payment_void, d.document_date
    from dokument d, zeitraum z
   where d.document_date >= z.von and d.document_date < z.bis
$$;

comment on function app.datev_pending_documents(uuid, text, date) is
  'Dokumente eines Bereichs, die noch kein Exportlauf getragen hat (ANN-830), mit Monat nur dessen: ausgestellte Rechnungen, Stornodokumente, nicht stornierte Zahlungen und Stornos exportierter Zahlungen, je mit Belegtag. Ohne Rollenpruefung; nur aus Funktionen mit eigener Pruefung.';

-- Je Dokument die Buchungszeilen: Rechnung und Storno je Steuergruppe aus dem Snapshot, Zahlung
-- und Zahlungsstorno je Betrag. Ohne Namen, Anschrift und Diagnose (ANN-829).
create function app.datev_bookings(p_org uuid, p_area text, p_month date, p_export_id uuid)
returns table (
  kind              text,
  document_date     date,
  invoice_number    text,
  document_number   text,
  tax_treatment     text,
  tax_rate_permille smallint,
  small_business    boolean,
  amount_cents      bigint,
  direction         text,
  method            text,
  currency          text
)
language sql stable
set search_path = ''
as $$
  with dok as (
    select d.invoice_id, d.cancellation_id, d.payment_id, d.payment_void
      from public.datev_export_documents d
     where p_export_id is not null and d.export_id = p_export_id and d.organization_id = p_org
    union all
    select v.invoice_id, v.cancellation_id, v.payment_id, v.payment_void
      from app.datev_pending_documents(p_org, p_area, p_month) v
     where p_export_id is null
  ),
  zeilen as (
    select 1 as rang, 'invoice'::text as kind, i.issued_on as document_date, i.invoice_number,
           null::text as document_number, g ->> 'tax_treatment' as tax_treatment,
           (g ->> 'tax_rate_permille')::smallint as tax_rate_permille,
           coalesce((i.snapshot -> 'issuer' ->> 'small_business')::boolean, false) as small_business,
           (g ->> 'gross_cents')::bigint as amount_cents, null::text as direction,
           null::text as method, i.currency
      from dok
      join public.invoices i on i.id = dok.invoice_id
     cross join lateral jsonb_array_elements(i.snapshot -> 'tax_groups') g
    union all
    select 2, 'cancellation', c.cancelled_on, i.invoice_number, c.cancellation_number,
           g ->> 'tax_treatment', (g ->> 'tax_rate_permille')::smallint,
           coalesce((i.snapshot -> 'issuer' ->> 'small_business')::boolean, false),
           (g ->> 'gross_cents')::bigint, null, null, i.currency
      from dok
      join public.invoice_cancellations c on c.id = dok.cancellation_id
      join public.invoices i on i.id = c.invoice_id
     cross join lateral jsonb_array_elements(i.snapshot -> 'tax_groups') g
    union all
    select 3, 'payment', p.paid_on, i.invoice_number, null, null, null, false,
           p.amount_cents::bigint, p.direction, p.method, p.currency
      from dok
      join public.payments p on p.id = dok.payment_id and not dok.payment_void
      join public.invoices i on i.id = p.invoice_id
    union all
    select 4, 'payment_void', (p.voided_at at time zone o.time_zone)::date, i.invoice_number,
           null, null, null, false, p.amount_cents::bigint, p.direction, p.method, p.currency
      from dok
      join public.payments p on p.id = dok.payment_id and dok.payment_void
      join public.invoices i on i.id = p.invoice_id
      join public.organizations o on o.id = p.organization_id
  )
  select z.kind, z.document_date, z.invoice_number, z.document_number, z.tax_treatment,
         z.tax_rate_permille, z.small_business, z.amount_cents, z.direction, z.method, z.currency
    from zeilen z
   where z.amount_cents <> 0
   order by z.document_date, z.rang, z.invoice_number, z.tax_treatment, z.tax_rate_permille,
            z.direction, z.method, z.amount_cents
$$;

comment on function app.datev_bookings(uuid, text, date, uuid) is
  'Buchungszeilen fuer den DATEV-Export (ANN-828, ANN-829): mit Exportlauf dessen Dokumente, ohne die noch offenen des Monats. Rechnung und Storno je Steuergruppe des Snapshots, Zahlung und Zahlungsstorno je Betrag; Rechnungsnummer statt Namen, keine Diagnose. Ohne Rollenpruefung.';

revoke all on function app.datev_pending_documents(uuid, text, date) from public, anon, authenticated;
revoke all on function app.datev_bookings(uuid, text, date, uuid) from public, anon, authenticated;

create function public.save_datev_settings(
  p_consultant_number      integer,
  p_client_number_therapy  integer,
  p_client_number_training integer,
  p_chart_of_accounts      text
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_billing_profile() then
    raise exception 'not allowed to manage the datev settings' using errcode = '42501';
  end if;

  if p_consultant_number is null or p_consultant_number not between 1001 and 9999999 then
    raise exception 'the consultant number has four to seven digits' using errcode = '22023';
  end if;

  if p_client_number_therapy is null and p_client_number_training is null then
    raise exception 'at least one client number is required' using errcode = '22023';
  end if;

  if p_client_number_therapy not between 1 and 99999
     or p_client_number_training not between 1 and 99999 then
    raise exception 'a client number has one to five digits' using errcode = '22023';
  end if;

  if p_chart_of_accounts is null or p_chart_of_accounts not in ('SKR03', 'SKR04') then
    raise exception 'unknown chart of accounts' using errcode = '22023';
  end if;

  v_org := app.current_organization_id();

  insert into public.datev_settings as s (
    organization_id, consultant_number, client_number_therapy, client_number_training,
    chart_of_accounts
  ) values (
    v_org, p_consultant_number, p_client_number_therapy, p_client_number_training,
    p_chart_of_accounts
  )
  on conflict (organization_id) do update set
    consultant_number      = excluded.consultant_number,
    client_number_therapy  = excluded.client_number_therapy,
    client_number_training = excluded.client_number_training,
    chart_of_accounts      = excluded.chart_of_accounts,
    updated_at             = now();
end;
$$;

comment on function public.save_datev_settings(integer, integer, integer, text) is
  'Legt die DATEV-Angaben der Praxis an oder aendert sie: Beraternummer, Mandantennummer je Bereich (mindestens eine), Kontenrahmen SKR03 oder SKR04 (ANN-828). Nur owner, wie die Praxis-Stammdaten (ANN-074). Kein Auditeintrag (ADR-010 Punkt 15); bestehende Exportlaeufe behalten ihre Angaben.';

-- Bereich und Monat prüfen alle drei Pfade gleich; ein Monat in der Zukunft hat nichts.
create function app.assert_datev_period(p_service_area text, p_month date)
returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if p_service_area is null or p_service_area not in ('therapy', 'training') then
    raise exception 'unknown service area' using errcode = '22023';
  end if;

  if p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_month < date '2020-01-01' or p_month > date '2200-01-01' then
    raise exception 'the period is a calendar month' using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.assert_datev_period(text, date) from public, anon, authenticated;

create function public.list_datev_pending(p_service_area text, p_month date)
returns table (
  kind              text,
  document_date     date,
  invoice_number    text,
  document_number   text,
  tax_treatment     text,
  tax_rate_permille smallint,
  small_business    boolean,
  amount_cents      bigint,
  direction         text,
  method            text,
  currency          text
)
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read bookings');
    return;
  end if;

  perform app.assert_datev_period(p_service_area, p_month);

  return query
  select * from app.datev_bookings(app.current_organization_id(), p_service_area, p_month, null);
end;
$$;

comment on function public.list_datev_pending(text, date) is
  'Buchungen eines Monats und Bereichs, die noch kein Exportlauf getragen hat (ANN-830), als Vorschau der Seite Steuerberatung. owner und office; sonst null Zeilen und access.denied. Ohne Personenbezug ausser der Rechnungsnummer.';

create function public.create_datev_export(p_service_area text, p_month date)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_zeitzone text;
  v_einst    public.datev_settings%rowtype;
  v_mandant  integer;
  v_folge    smallint;
  v_id       uuid;
  v_anzahl   integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_invoicing() then
    raise exception 'not allowed to export bookings' using errcode = '42501';
  end if;

  perform app.assert_datev_period(p_service_area, p_month);

  v_org := app.current_organization_id();
  select o.time_zone into v_zeitzone from public.organizations o where o.id = v_org;

  if p_month > (now() at time zone v_zeitzone)::date then
    raise exception 'the period lies in the future' using errcode = '22023';
  end if;

  -- Die Zeile der Einstellungen sperrt: Zwei Exporte derselben Praxis laufen nacheinander und
  -- greifen nie dasselbe Dokument.
  select * into v_einst from public.datev_settings s where s.organization_id = v_org for update;
  if not found then
    raise exception 'datev settings missing' using errcode = 'P0002';
  end if;

  v_mandant := case p_service_area
                 when 'therapy' then v_einst.client_number_therapy
                 else v_einst.client_number_training
               end;
  if v_mandant is null then
    raise exception 'datev client number missing' using errcode = 'P0002';
  end if;

  select coalesce(max(e.sequence), 0) + 1 into v_folge
    from public.datev_exports e
   where e.organization_id = v_org and e.service_area = p_service_area
     and e.period_month = p_month;

  insert into public.datev_exports (
    organization_id, service_area, period_month, sequence,
    consultant_number, client_number, chart_of_accounts
  ) values (
    v_org, p_service_area, p_month, v_folge,
    v_einst.consultant_number, v_mandant, v_einst.chart_of_accounts
  ) returning id into v_id;

  insert into public.datev_export_documents (
    export_id, organization_id, invoice_id, cancellation_id, payment_id, payment_void
  )
  select v_id, v_org, d.invoice_id, d.cancellation_id, d.payment_id, d.payment_void
    from app.datev_pending_documents(v_org, p_service_area, p_month) d;

  -- Geprüft wird genau, was der Lauf trägt; eine Ausnahme nimmt Lauf und Nummer zurück.
  get diagnostics v_anzahl = row_count;
  if v_anzahl = 0 then
    raise exception 'nothing new to export' using errcode = 'P0002';
  end if;

  if exists (select 1 from app.datev_bookings(v_org, p_service_area, p_month, v_id) b
              where b.currency <> 'EUR') then
    raise exception 'only euro amounts can be exported' using errcode = '22023';
  end if;

  return v_id;
end;
$$;

comment on function public.create_datev_export(text, date) is
  'Legt einen Exportlauf an (ANN-830): nimmt alle noch nicht exportierten Dokumente des Monats und Bereichs und haelt die DATEV-Angaben des Tages fest. Der erste Lauf eines Monats hat die Nummer 1, jeder weitere ist ein Nachtrag. owner und office; ohne Einstellungen, Mandantennummer oder Neues abgewiesen. Kein Auditeintrag (ADR-010 Punkt 15), keine Person am Lauf.';

create function public.list_datev_open_months(p_service_area text)
returns table (period_month date, document_count integer)
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read bookings');
    return;
  end if;

  perform app.assert_datev_period(p_service_area, date '2020-01-01');

  return query
  select date_trunc('month', d.document_date)::date, count(*)::integer
    from app.datev_pending_documents(app.current_organization_id(), p_service_area, null) d
   group by 1
   order by 1;
end;
$$;

comment on function public.list_datev_open_months(text) is
  'Monate eines Bereichs mit Dokumenten, die noch kein Exportlauf getragen hat (ANN-830), mit ihrer Zahl: So faellt Rueckdatiertes in einem schon exportierten Monat auf. owner und office; sonst null Zeilen und access.denied.';

create function public.list_datev_exports(p_service_area text, p_month date)
returns table (
  id                    uuid,
  sequence              smallint,
  created_at            timestamptz,
  document_count        integer,
  invoice_ids           uuid[],
  cancelled_invoice_ids uuid[]
)
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read exports');
    return;
  end if;

  perform app.assert_datev_period(p_service_area, p_month);

  return query
  select e.id, e.sequence, e.created_at,
         (select count(*)::integer from public.datev_export_documents d where d.export_id = e.id),
         coalesce((select array_agg(i.id order by i.invoice_number)
                     from public.datev_export_documents d
                     join public.invoices i on i.id = d.invoice_id
                    where d.export_id = e.id), '{}'),
         coalesce((select array_agg(c.invoice_id order by c.cancellation_number)
                     from public.datev_export_documents d
                     join public.invoice_cancellations c on c.id = d.cancellation_id
                    where d.export_id = e.id), '{}')
    from public.datev_exports e
   where e.organization_id = app.current_organization_id()
     and e.service_area = p_service_area and e.period_month = p_month
   order by e.sequence desc;
end;
$$;

comment on function public.list_datev_exports(text, date) is
  'Exportlaeufe eines Monats und Bereichs, der juengste zuerst, mit der Zahl ihrer Dokumente und den Kennungen der Rechnungen und stornierten Rechnungen fuer den Belegdruck. owner und office; sonst null Zeilen und access.denied.';

create function public.get_datev_export(p_export_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_export public.datev_exports%rowtype;
  v_zeit   text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_invoicing() then
    perform app.record_denied_read(auth.uid(), 'invoicing.read', 'not allowed to read exports');
    return null;
  end if;

  v_org := app.current_organization_id();

  select * into v_export from public.datev_exports e
   where e.id = p_export_id and e.organization_id = v_org;
  if not found then
    raise exception 'export not found' using errcode = '42501';
  end if;

  select to_char(v_export.created_at at time zone o.time_zone, 'YYYYMMDDHH24MISSMS')
    into v_zeit
    from public.organizations o where o.id = v_org;

  return jsonb_build_object(
    'id', v_export.id,
    'service_area', v_export.service_area,
    'period_month', v_export.period_month,
    'sequence', v_export.sequence,
    'consultant_number', v_export.consultant_number,
    'client_number', v_export.client_number,
    'chart_of_accounts', v_export.chart_of_accounts,
    'created_stamp', v_zeit,
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(b) - 'n' order by b.n)
        from app.datev_bookings(v_org, v_export.service_area, v_export.period_month,
                                v_export.id)
             with ordinality as b(kind, document_date, invoice_number, document_number,
                                  tax_treatment, tax_rate_permille, small_business,
                                  amount_cents, direction, method, currency, n)), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_datev_export(uuid) is
  'Ein Exportlauf mit seinen DATEV-Angaben und Buchungszeilen (ANN-828): Grundlage der Datei, bei jedem Abruf dieselbe. owner und office; fremde Laeufe wie nicht vorhanden, andere Rollen null und access.denied.';

revoke all on function public.save_datev_settings(integer, integer, integer, text) from public, anon;
revoke all on function public.list_datev_pending(text, date) from public, anon;
revoke all on function public.create_datev_export(text, date) from public, anon;
revoke all on function public.list_datev_open_months(text) from public, anon;
revoke all on function public.list_datev_exports(text, date) from public, anon;
revoke all on function public.get_datev_export(uuid) from public, anon;
grant execute on function public.save_datev_settings(integer, integer, integer, text) to authenticated;
grant execute on function public.list_datev_pending(text, date) to authenticated;
grant execute on function public.create_datev_export(text, date) to authenticated;
grant execute on function public.list_datev_open_months(text) to authenticated;
grant execute on function public.list_datev_exports(text, date) to authenticated;
grant execute on function public.get_datev_export(uuid) to authenticated;
