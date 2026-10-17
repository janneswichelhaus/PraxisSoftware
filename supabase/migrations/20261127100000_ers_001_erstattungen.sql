-- =============================================================================
-- ERS-001 (Überholung 10): Erstattungen - Ladestrom und Einkauf
--
-- Mitarbeitende beantragen geführt: Ladestrom für das Lastenrad (ein
-- Kalendermonat je Antrag) oder einen Einkauf mit Belegen. owner entscheidet
-- (genehmigen, ablehnen mit Grund) und vermerkt die Auszahlung - genehmigt
-- heißt nicht ausgezahlt. Die IBAN liegt je Person und erscheint maskiert;
-- voll nur beim Auszahlen für owner.
--
--   public.staff_payout_accounts                 die IBAN einer Person (ANN-601)
--   public.staff_reimbursements                  ein Antrag (ANN-598, ANN-599)
--   public.staff_reimbursement_receipts          ein Beleg mit Betrag und Zweck
--                                                (ANN-600, ADR-017 sinngemäß)
--   public.staff_reimbursement_receipt_access_grants
--                                                einmalige Lesefreigabe (ANN-052)
--
-- DATEIEN WIE DIE FOTOS AM RAD (ANN-552, ADR-017 Punkt 60): eigene
-- Datenklasse, eigener Bucket `erstattungsbelege`, zwei Phasen mit
-- Bestätigung, unveränderlich, Prüfsumme, einmalige Lesefreigabe,
-- Löschauftrag, Abgleich und die Prüfung am Server mit demselben Schalter.
-- Ein Beleg entsteht vor seinem Antrag (fotografieren, dann Betrag und
-- Zweck): Er liegt bis zum Absenden ohne Antrag bei der Person und fällt
-- nach einem Tag, wenn er keinem zugeordnet wurde.
--
-- WER (BEF-066 Option 2 mit Büro, ANN-598): beantragen jede Praxisrolle mit
-- Mitarbeiterdatensatz, nur für sich; owner trägt eigene ein, sie gelten als
-- genehmigt (wie beim Urlaub, ANN-576). Entscheiden und auszahlen owner, nie
-- den eigenen Antrag eines anderen Kontos. Lesen: jede Person ihre eigenen;
-- owner und Büro alle je Person mit Belegen, ohne Summe über alle (§20) und
-- mit maskierter IBAN.
--
-- KEINE NEUE AUDITAKTION (ADR-010 Fassung 3): Beantragt von/am, entschieden
-- von/am mit Grund, ausgezahlt von/am stehen am Antrag; wer einen Beleg
-- hochgeladen hat, an der Zeile; wer gelöscht hat, am Löschauftrag.
--
-- KEINE BUCHHALTUNG (ADR-009): keine Rechnung, keine Buchung, kein Export,
-- keine Überweisung - die Auszahlung macht owner bei der Bank und vermerkt sie.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rechte, Bucket und Konstanten - je eine Stelle
-- -----------------------------------------------------------------------------
-- Wer Erstattungen beantragt: jede Praxisrolle mit Mitarbeiterdatensatz.
create function app.can_request_reimbursements()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'team_lead', 'office', 'therapist', 'trainer')
$$;

-- Wer die Erstattungen aller sieht, je Person mit Belegen: owner und Büro.
create function app.can_read_all_reimbursements()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'office')
$$;

revoke all on function app.can_request_reimbursements() from public, anon;
revoke all on function app.can_read_all_reimbursements() from public, anon;
grant execute on function app.can_request_reimbursements() to authenticated;
grant execute on function app.can_read_all_reimbursements() to authenticated;

comment on function app.can_request_reimbursements() is
  'ERS-001 (ANN-598): Wer Erstattungen beantragt - jede Praxisrolle mit Mitarbeiterdatensatz, nie ein Patienten- oder Plattformkonto.';
comment on function app.can_read_all_reimbursements() is
  'ERS-001 (ANN-598, BEF-066 Option 2 mit Büro): Wer die Erstattungen aller je Person mit Belegen sieht - owner und Büro, die IBAN maskiert. Entscheiden und auszahlen: app.can_decide_staff_requests(). Die eine Stelle für die Regel.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('erstattungsbelege', 'erstattungsbelege', false, 10485760,
        array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

create function app.reimbursement_receipt_bucket()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'erstattungsbelege'::text
$$;

comment on function app.reimbursement_receipt_bucket() is
  'ERS-001 (ANN-600): Name des privaten Buckets der Belege. Die einzige Stelle, an der er steht.';

-- Höchstens zehn Belege je Antrag - und ebenso viele liegen höchstens
-- unzugeordnet bei einer Person.
create function app.reimbursement_receipt_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 10
$$;

-- Ladestrom (ANN-599): eine Akkuladung von 0,5 kWh je Arbeitstag zu 37 ct je
-- kWh - die Werte der Vorlage, eine betriebliche Regel, keine Vorgabe. Am
-- Antrag festgehalten; eine Änderung hier gilt für neue Anträge.
create function app.electricity_wh_per_day()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 500
$$;

create function app.electricity_cents_per_kwh()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 37
$$;

-- „DE89 •••• 3000“: Land und Prüfziffer, die letzten vier Stellen (ANN-601).
create function app.mask_iban(p_iban text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_iban is null then null
              else left(p_iban, 4) || ' •••• ' || right(p_iban, 4) end
$$;

revoke all on function app.reimbursement_receipt_bucket() from public, anon;
grant execute on function app.reimbursement_receipt_bucket() to authenticated;
revoke all on function app.reimbursement_receipt_limit() from public, anon, authenticated;
revoke all on function app.electricity_wh_per_day() from public, anon, authenticated;
revoke all on function app.electricity_cents_per_kwh() from public, anon, authenticated;
revoke all on function app.mask_iban(text) from public, anon, authenticated;

comment on function app.electricity_wh_per_day() is
  'ERS-001 (ANN-599): Ladung je Arbeitstag in Wh (500 = 0,5 kWh, Vorlage). Die einzige Stelle; der Antrag hält den Wert fest.';
comment on function app.electricity_cents_per_kwh() is
  'ERS-001 (ANN-599): Satz je kWh in Cent (37, Vorlage). Die einzige Stelle; der Antrag hält den Wert fest.';

-- -----------------------------------------------------------------------------
-- 2. Tabellen
--
-- Kein Tabellenrecht, keine Policy: erreichbar nur über die Funktionen.
-- -----------------------------------------------------------------------------
create table public.staff_payout_accounts (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  staff_member_id uuid not null references public.staff_members (id) on delete restrict,
  -- Ohne Leerzeichen, in Großbuchstaben, mit gültiger Prüfziffer (ISO 13616).
  iban            text not null
                    constraint staff_payout_accounts_iban
                    check (iban = upper(replace(iban, ' ', '')) and app.iban_checksum_ok(iban)),
  updated_by      uuid not null,
  updated_at      timestamptz not null default now(),
  constraint staff_payout_accounts_one_per_person unique (staff_member_id)
);

comment on table public.staff_payout_accounts is
  'ERS-001 (ANN-601): die IBAN, auf die eine Person ihre Erstattungen bekommt - eine je Person, von ihr selbst hinterlegt. Gelesen nur maskiert; voll nur in public.reimbursement_payout_details für owner. Datenklasse Beschäftigtendaten (ANN-030). Kein Tabellenrecht.';

alter table public.staff_payout_accounts enable row level security;
revoke all on public.staff_payout_accounts from public, anon, authenticated;

create table public.staff_reimbursements (
  id                 uuid primary key default extensions.gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  staff_member_id    uuid not null references public.staff_members (id) on delete restrict,
  -- 'electricity' Ladestrom für das Lastenrad, 'purchase' Einkauf mit Belegen.
  kind               text not null check (kind in ('electricity', 'purchase')),
  -- Ladestrom: der Monat (sein Erster), die Arbeitstage und - festgehalten -
  -- Ladung und Satz; die Erklärung als Haken (ANN-553, ANN-599).
  period_month       date,
  working_days       smallint,
  energy_wh_per_day  integer,
  rate_cents_per_kwh integer,
  declared_at        timestamptz,
  -- Der Betrag in Cent (ADR-014); beim Ladestrom aus Tagen, Ladung und Satz.
  amount_cents       integer not null check (amount_cents between 1 and 1000000),
  status             text not null default 'requested'
                       check (status in ('requested', 'approved', 'rejected', 'withdrawn', 'paid')),
  requested_by       uuid not null,
  requested_at       timestamptz not null default now(),
  -- Selbst eingetragen (owner, ANN-598): genehmigt ohne zweite Person.
  self_entered       boolean not null default false,
  decided_by         uuid,
  decided_at         timestamptz,
  decision_note      text check (decision_note is null or length(decision_note) between 1 and 500),
  withdrawn_at       timestamptz,
  paid_by            uuid,
  paid_at            timestamptz,
  -- Für die Belege: ein Beleg hängt nur am Antrag seiner Person.
  constraint staff_reimbursements_staff_unique unique (id, staff_member_id),
  constraint staff_reimbursements_kind_fields check (
    (kind = 'electricity'
       and period_month is not null and extract(day from period_month) = 1
       and working_days between 1 and 31
       and working_days <= extract(day from (period_month + interval '1 month' - interval '1 day'))
       and energy_wh_per_day between 1 and 10000
       and rate_cents_per_kwh between 1 and 1000
       and declared_at is not null
       and amount_cents = (working_days * energy_wh_per_day * rate_cents_per_kwh + 500) / 1000)
    or (kind = 'purchase'
       and period_month is null and working_days is null and energy_wh_per_day is null
       and rate_cents_per_kwh is null and declared_at is null)
  ),
  -- Genehmigt, abgelehnt und ausgezahlt tragen ihre Entscheidung.
  constraint staff_reimbursements_decided check (
    (status in ('approved', 'rejected', 'paid')) = (decided_at is not null and decided_by is not null)
  ),
  constraint staff_reimbursements_reject_reason check ((status = 'rejected') = (decision_note is not null)),
  constraint staff_reimbursements_withdrawn check ((status = 'withdrawn') = (withdrawn_at is not null)),
  constraint staff_reimbursements_paid check ((status = 'paid') = (paid_at is not null and paid_by is not null)),
  constraint staff_reimbursements_self_entered check (
    not self_entered or (decided_by = requested_by and status in ('approved', 'paid'))
  )
);

comment on table public.staff_reimbursements is
  'ERS-001 (ANN-598, ANN-599): Erstattungsanträge - Ladestrom je Monat oder Einkauf mit Belegen. Beantragt von/am, entschieden von/am mit Grund, ausgezahlt von/am sind der Nachweis (ADR-010 Punkt 15). Datenklassen erstattung (ausgezahlt: acht Jahre ab Ende des Jahres der Auszahlung, Par. 147 AO) und erstattung_kurz (abgelehnt, zurückgezogen: ein Jahr), ANN-602; beantragte und genehmigte bleiben. Kein Tabellenrecht.';

create index staff_reimbursements_staff_idx
  on public.staff_reimbursements (organization_id, staff_member_id, requested_at);
create index staff_reimbursements_open_idx
  on public.staff_reimbursements (organization_id) where status in ('requested', 'approved');
-- Ladestrom: je Person und Monat ein Antrag, der gilt oder gelten kann.
create unique index staff_reimbursements_one_electricity_per_month
  on public.staff_reimbursements (staff_member_id, period_month)
  where kind = 'electricity' and status in ('requested', 'approved', 'paid');

alter table public.staff_reimbursements enable row level security;
revoke all on public.staff_reimbursements from public, anon, authenticated;

create table public.staff_reimbursement_receipts (
  id                        uuid primary key default extensions.gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete restrict,
  -- Wessen Beleg: die Person, die ihn hochlädt.
  staff_member_id           uuid not null references public.staff_members (id) on delete restrict,
  -- Bis zum Absenden ohne Antrag; dann einmal mit Betrag und Zweck zugeordnet.
  reimbursement_id          uuid,
  amount_cents              integer check (amount_cents between 1 and 100000),
  purpose                   text check (
                              purpose is null
                              or (length(purpose) between 1 and 200 and purpose = btrim(purpose))
                            ),
  attached_at               timestamptz,
  mime_type                 text not null
                              check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  byte_size                 bigint not null check (byte_size > 0 and byte_size <= 10485760),
  checksum_sha256           text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  status                    text not null default 'pending' check (status in ('pending', 'ready')),
  confirmation_requested_at timestamptz,
  confirmed_at              timestamptz,
  verified_at               timestamptz,
  created_by                uuid not null,
  created_at                timestamptz not null default now(),

  -- ADR-017 Punkt 5: nur Kennungen, generiert.
  object_key                text not null generated always as (
                              organization_id::text || '/' || staff_member_id::text || '/' || id::text
                            ) stored,

  constraint staff_reimbursement_receipts_reimbursement_fk
    foreign key (reimbursement_id, staff_member_id)
    references public.staff_reimbursements (id, staff_member_id) on delete cascade,
  constraint staff_reimbursement_receipts_attached check (
    (reimbursement_id is null) = (attached_at is null)
    and (reimbursement_id is null) = (amount_cents is null)
    and (reimbursement_id is null) = (purpose is null)
    and (reimbursement_id is null or status = 'ready')
  ),
  constraint staff_reimbursement_receipts_ready_confirmed check ((status = 'ready') = (confirmed_at is not null))
);

comment on table public.staff_reimbursement_receipts is
  'ERS-001 (ANN-600): Beleg eines Einkaufs - Foto oder PDF mit Betrag und Zweck. Bis zum Absenden ohne Antrag bei der Person (nach einem Tag verworfen), danach am Antrag und mit ihm in der Datenklasse erstattung bzw. erstattung_kurz (cascade); das Objekt folgt über den Löschauftrag (ADR-017 Punkt 25). Unveränderlich bis auf Zustand, Prüfung und die eine Zuordnung. Kein Tabellenrecht.';
comment on column public.staff_reimbursement_receipts.checksum_sha256 is
  'SHA-256 der abgelegten Bytes, im Browser gerechnet; zum Nachweis des Servers erst mit verified_at (ADR-017 Punkte 9 und 49).';

create unique index staff_reimbursement_receipts_object_key_idx
  on public.staff_reimbursement_receipts (object_key);
create index staff_reimbursement_receipts_reimbursement_idx
  on public.staff_reimbursement_receipts (reimbursement_id) where reimbursement_id is not null;
create index staff_reimbursement_receipts_staged_idx
  on public.staff_reimbursement_receipts (staff_member_id, created_at) where reimbursement_id is null;

alter table public.staff_reimbursement_receipts enable row level security;
revoke all on public.staff_reimbursement_receipts from public, anon, authenticated;

create function app.staff_reimbursement_receipts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_veraenderlich text[] := array['status', 'confirmation_requested_at', 'confirmed_at',
                                  'verified_at', 'object_key', 'reimbursement_id',
                                  'amount_cents', 'purpose', 'attached_at'];
begin
  -- Was eine Datei ist, ändert sich nicht (ADR-017 Punkt 8): nur Zustand,
  -- Prüfung und - genau einmal - die Zuordnung zum Antrag mit Betrag und
  -- Zweck. Der Objektschlüssel ist generiert und im BEFORE-Trigger leer.
  if (to_jsonb(new) - v_veraenderlich) is distinct from (to_jsonb(old) - v_veraenderlich)
     or (old.reimbursement_id is not null
         and (new.reimbursement_id, new.amount_cents, new.purpose, new.attached_at)
             is distinct from (old.reimbursement_id, old.amount_cents, old.purpose, old.attached_at)) then
    raise exception 'reimbursement receipts are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.staff_reimbursement_receipts_guard() from public, anon, authenticated;

create trigger staff_reimbursement_receipts_guard
  before update on public.staff_reimbursement_receipts
  for each row execute function app.staff_reimbursement_receipts_guard();

-- Jede gelöschte Zeile hinterlässt einen Löschauftrag für ihr Objekt - auf
-- jedem Weg, auch über die Kaskade vom Antrag.
create function app.order_reimbursement_receipt_object_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = app.reimbursement_receipt_bucket() and o.name = old.object_key
  ) then
    insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
    values (old.organization_id, app.reimbursement_receipt_bucket(), old.object_key)
    on conflict do nothing;
  end if;
  return old;
end;
$$;

revoke all on function app.order_reimbursement_receipt_object_deletion() from public, anon, authenticated;

create trigger staff_reimbursement_receipts_order_object_deletion
  after delete on public.staff_reimbursement_receipts
  for each row execute function app.order_reimbursement_receipt_object_deletion();

create table public.staff_reimbursement_receipt_access_grants (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id         uuid not null,
  receipt_id      uuid not null references public.staff_reimbursement_receipts (id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  constraint staff_reimbursement_receipt_access_grants_short_lived check (
    expires_at > created_at and expires_at <= created_at + interval '5 minutes'
  )
);

comment on table public.staff_reimbursement_receipt_access_grants is
  'ERS-001: einmalige, personengebundene Freigabe für genau einen Verweis auf einen Beleg (ANN-052). Verbraucht beim ersten Zugriff, verfällt nach 30 Sekunden; abgelaufene löscht public.discard_stale_reimbursement_receipts täglich. Fällt spätestens mit dem Beleg (cascade).';

create index staff_reimbursement_receipt_access_grants_receipt_idx
  on public.staff_reimbursement_receipt_access_grants (receipt_id);
create index staff_reimbursement_receipt_access_grants_expiry_idx
  on public.staff_reimbursement_receipt_access_grants (organization_id, expires_at);

alter table public.staff_reimbursement_receipt_access_grants enable row level security;
revoke all on public.staff_reimbursement_receipt_access_grants from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Datenklassen und Fristen (ADR-008, ANN-602)
-- -----------------------------------------------------------------------------
insert into public.retention_classes
  (key, basis, legal_reference, anchor, retention_interval, assumption_key, note, sort_order)
values
  ('erstattung', 'gesetzlich', 'Par. 147 Abs. 1 Nr. 4, Abs. 3 AO', 'calendar_year_end',
   interval '8 years', 'ANN-602',
   'Ausgezahlte Erstattungen mit ihren Belegen: acht Jahre ab Ende des Kalenderjahres der Auszahlung - Buchungsbelege der Praxis. Beantragte und genehmigte, noch nicht ausgezahlte bleiben.',
   99),
  ('erstattung_kurz', 'intern', null, 'case_closed', interval '1 year', 'ANN-602',
   'Abgelehnte und zurückgezogene Erstattungen mit ihren Belegen: ein Jahr nach Entscheidung bzw. Zurückziehen. Genug für Rückfragen, ohne Verlauf über die Person (PROJECT_PRINCIPLES.md 20).',
   100);

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values
  ('staff_reimbursements', 'erstattung', 'automatisch',
   'Ausgezahlte Erstattungen (ERS-001): acht Jahre ab Ende des Jahres der Auszahlung; beantragte und genehmigte nie (ANN-602).',
   232),
  ('staff_reimbursements', 'erstattung_kurz', 'automatisch',
   'Abgelehnte und zurückgezogene Erstattungen (ERS-001): ein Jahr nach ihrem Ende (ANN-602).',
   233),
  ('staff_reimbursement_receipts', 'erstattung', 'ueber_elterndatensatz',
   'Belege (ERS-001): fallen mit ihrem Antrag (cascade) und damit nach dessen Frist; das Objekt folgt über den Löschauftrag (ADR-017 Punkt 25). Nicht zugeordnete verwirft public.discard_stale_reimbursement_receipts nach einem Tag (Aufräumen, keine Frist).',
   234),
  ('staff_reimbursement_receipt_access_grants', 'erstattung', 'ueber_elterndatensatz',
   'Einmalige Lesefreigabe an einem Beleg (ANN-052): beim ersten Zugriff verbraucht, nach 30 Sekunden verfallen; fällt spätestens mit dem Beleg (cascade).',
   235),
  ('staff_payout_accounts', 'beschaeftigtendaten', 'keine',
   'IBAN je Person für Erstattungen (ERS-001, ANN-601): solange die Person sie hinterlegt hat; Frist offen wie die übrigen Beschäftigtendaten (ANN-030).',
   236);

-- -----------------------------------------------------------------------------
-- 4. Hilfen: Monat, Arbeitstage, Konto, Ansicht
-- -----------------------------------------------------------------------------
-- Ob ein Monat für Ladestrom wählbar ist: einer der zwölf abgeschlossenen
-- Monate vor dem laufenden, in der Zeitzone der Praxis (ANN-599).
create function app.assert_electricity_month(p_org uuid, p_month date)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_laufend date;
begin
  select date_trunc('month', now() at time zone o.time_zone)::date into v_laufend
  from public.organizations o where o.id = p_org;
  if p_month is null or p_month <> date_trunc('month', p_month)::date
     or p_month >= v_laufend or p_month < (v_laufend - interval '12 months')::date then
    raise exception 'month not allowed' using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.assert_electricity_month(uuid, date) from public, anon, authenticated;

-- Der Vorschlag der Arbeitstage eines Monats: Tage nach dem an ihnen
-- geltenden Wochenplan ohne Feiertage (app.leave_days) und ohne ganztägige
-- Abwesenheit - Urlaub, Freizeitausgleich, eingetragene Abwesenheit. Kein
-- Bezug auf Touren oder Termine (PROJECT_PRINCIPLES.md 20).
create function app.reimbursement_working_days(p_org uuid, p_staff_member_id uuid, p_month date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from generate_series(p_month, (p_month + interval '1 month' - interval '1 day')::date,
                       interval '1 day') as d
  where app.leave_days(p_org, p_staff_member_id, d::date, d::date) = 1
    and not exists (
      select 1 from public.staff_working_hour_exceptions x
      where x.organization_id = p_org and x.staff_member_id = p_staff_member_id
        and x.on_date = d::date and x.kind = 'unavailable'
    )
$$;

revoke all on function app.reimbursement_working_days(uuid, uuid, date) from public, anon, authenticated;

-- Hinterlegt oder ersetzt die IBAN einer Person - geprüft und ohne
-- Leerzeichen. Unverändert bleibt auch der Zeitpunkt.
create function app.store_payout_account(p_org uuid, p_staff_member_id uuid, p_iban text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_iban text := upper(replace(btrim(coalesce(p_iban, '')), ' ', ''));
begin
  if not app.iban_checksum_ok(v_iban) then
    raise exception 'invalid iban' using errcode = '22023';
  end if;
  insert into public.staff_payout_accounts (organization_id, staff_member_id, iban, updated_by)
  values (p_org, p_staff_member_id, v_iban, auth.uid())
  on conflict (staff_member_id) do update
    set iban = excluded.iban, updated_by = excluded.updated_by, updated_at = now()
    where public.staff_payout_accounts.iban is distinct from excluded.iban;
end;
$$;

revoke all on function app.store_payout_account(uuid, uuid, text) from public, anon, authenticated;

-- Das Konto einer Person, maskiert - für die Person, owner und Büro.
create function app.payout_account_view(p_staff_member_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('iban_masked', app.mask_iban(a.iban), 'since', a.updated_at)
  from public.staff_payout_accounts a
  where a.staff_member_id = p_staff_member_id
$$;

revoke all on function app.payout_account_view(uuid) from public, anon, authenticated;

-- Ein Antrag, wie ihn Liste und Entscheiden zeigen: ohne IBAN, mit Belegen
-- (Kennung, Betrag, Zweck, Art - nie Objektschlüssel oder Verweis).
create function app.reimbursement_view(p_reimbursement public.staff_reimbursements)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_reimbursement.id,
    'staff_member_id', p_reimbursement.staff_member_id,
    'name', app.staff_display_name(p_reimbursement.staff_member_id),
    'kind', p_reimbursement.kind,
    'period_month', p_reimbursement.period_month,
    'working_days', p_reimbursement.working_days,
    'energy_wh_per_day', p_reimbursement.energy_wh_per_day,
    'rate_cents_per_kwh', p_reimbursement.rate_cents_per_kwh,
    'amount_cents', p_reimbursement.amount_cents,
    'status', p_reimbursement.status,
    'self_entered', p_reimbursement.self_entered,
    'requested_at', p_reimbursement.requested_at,
    'decided_at', p_reimbursement.decided_at,
    'decided_by_name', app.account_display_name(p_reimbursement.decided_by),
    'decision_note', p_reimbursement.decision_note,
    'withdrawn_at', p_reimbursement.withdrawn_at,
    'paid_at', p_reimbursement.paid_at,
    'paid_by_name', app.account_display_name(p_reimbursement.paid_by),
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'amount_cents', b.amount_cents, 'purpose', b.purpose,
               'mime_type', b.mime_type, 'verified', b.verified_at is not null
             ) order by b.attached_at, b.id)
      from public.staff_reimbursement_receipts b
      where b.reimbursement_id = p_reimbursement.id
    ), '[]'::jsonb)
  )
$$;

revoke all on function app.reimbursement_view(public.staff_reimbursements) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Konto und Ladestrom
-- -----------------------------------------------------------------------------
create function public.set_own_payout_account(p_iban text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to request reimbursements');
  v_staff := app.own_staff_member(v_org);
  if v_staff is null then
    raise exception 'no staff member for this account' using errcode = 'P0002';
  end if;
  perform app.store_payout_account(v_org, v_staff, p_iban);
  return app.payout_account_view(v_staff);
end;
$$;

revoke all on function public.set_own_payout_account(text) from public, anon;
grant execute on function public.set_own_payout_account(text) to authenticated;

comment on function public.set_own_payout_account(text) is
  'ERS-001 (ANN-601): hinterlegt oder ersetzt die eigene IBAN für Erstattungen, mit Prüfziffer am Server. Liefert sie maskiert.';

create function public.preview_electricity_reimbursement(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to request reimbursements');
  v_staff := app.own_staff_member(v_org);
  if v_staff is null then
    raise exception 'no staff member for this account' using errcode = 'P0002';
  end if;
  perform app.assert_electricity_month(v_org, p_month);
  return jsonb_build_object(
    'month', p_month,
    'days_in_month', extract(day from (p_month + interval '1 month' - interval '1 day'))::integer,
    'suggested_days', app.reimbursement_working_days(v_org, v_staff, p_month),
    'wh_per_day', app.electricity_wh_per_day(),
    'cents_per_kwh', app.electricity_cents_per_kwh(),
    'already_requested', exists (
      select 1 from public.staff_reimbursements r
      where r.staff_member_id = v_staff and r.kind = 'electricity' and r.period_month = p_month
        and r.status in ('requested', 'approved', 'paid')
    )
  );
end;
$$;

revoke all on function public.preview_electricity_reimbursement(date) from public, anon;
grant execute on function public.preview_electricity_reimbursement(date) to authenticated;

comment on function public.preview_electricity_reimbursement(date) is
  'ERS-001 (ANN-599): Vorschlag für Ladestrom eines Monats - Arbeitstage nach Wochenplan ohne Feiertage und ganztägige Abwesenheit, Ladung und Satz, ob der Monat schon beantragt ist. Nur für sich, nur die zwölf abgeschlossenen Monate vor dem laufenden.';

-- Gemeinsamer Abschluss des Beantragens: Konto, Zustand je nach Rolle.
create function app.reimbursement_start(p_iban text)
returns table (organization_id uuid, staff_member_id uuid, self_entered boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to request reimbursements');
  v_staff := app.own_staff_member(v_org);
  if v_staff is null then
    raise exception 'no staff member for this account' using errcode = 'P0002';
  end if;
  if p_iban is not null then
    perform app.store_payout_account(v_org, v_staff, p_iban);
  end if;
  if not exists (select 1 from public.staff_payout_accounts a where a.staff_member_id = v_staff) then
    raise exception 'payout account missing' using errcode = '22023';
  end if;
  return query select v_org, v_staff, app.can_decide_staff_requests();
end;
$$;

revoke all on function app.reimbursement_start(text) from public, anon, authenticated;

create function public.submit_electricity_reimbursement(
  p_month        date,
  p_working_days integer,
  p_declared     boolean,
  p_iban         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start  record;
  v_tage   integer;
  v_wh     integer := app.electricity_wh_per_day();
  v_satz   integer := app.electricity_cents_per_kwh();
  v_id     uuid;
  v_status text;
begin
  select * into v_start from app.reimbursement_start(p_iban);
  perform app.assert_electricity_month(v_start.organization_id, p_month);
  v_tage := extract(day from (p_month + interval '1 month' - interval '1 day'))::integer;
  if p_working_days is null or p_working_days < 1 or p_working_days > v_tage then
    raise exception 'working days out of range' using errcode = '22023';
  end if;
  if p_declared is distinct from true then
    raise exception 'declaration missing' using errcode = '22023';
  end if;

  v_status := case when v_start.self_entered then 'approved' else 'requested' end;
  begin
    insert into public.staff_reimbursements (
      organization_id, staff_member_id, kind, period_month, working_days, energy_wh_per_day,
      rate_cents_per_kwh, declared_at, amount_cents, status, requested_by, self_entered,
      decided_by, decided_at
    )
    values (
      v_start.organization_id, v_start.staff_member_id, 'electricity', p_month, p_working_days,
      v_wh, v_satz, now(), (p_working_days * v_wh * v_satz + 500) / 1000, v_status, auth.uid(),
      v_start.self_entered,
      case when v_start.self_entered then auth.uid() end,
      case when v_start.self_entered then now() end
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'month already requested' using errcode = '23505';
  end;

  return jsonb_build_object(
    'id', v_id, 'status', v_status,
    'amount_cents', (p_working_days * v_wh * v_satz + 500) / 1000
  );
end;
$$;

revoke all on function public.submit_electricity_reimbursement(date, integer, boolean, text) from public, anon;
grant execute on function public.submit_electricity_reimbursement(date, integer, boolean, text) to authenticated;

comment on function public.submit_electricity_reimbursement(date, integer, boolean, text) is
  'ERS-001 (ANN-598, ANN-599): Ladestrom eines abgeschlossenen Monats beantragen - Arbeitstage bis zur Zahl der Tage des Monats, die Erklärung als Haken, Ladung und Satz festgehalten, je Person und Monat einmal. Optional die IBAN dazu. owner trägt ein (gilt als genehmigt).';

-- -----------------------------------------------------------------------------
-- 6. Belege hochladen - Phase (a), (c) und der Rückweg (ADR-017 Punkt 7)
-- -----------------------------------------------------------------------------
create function public.prepare_reimbursement_receipt_upload(
  p_mime_type       text,
  p_byte_size       bigint,
  p_checksum_sha256 text
)
returns table (receipt_id uuid, bucket_id text, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_staff uuid;
  v_id    uuid;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to request reimbursements');
  v_staff := app.own_staff_member(v_org);
  if v_staff is null then
    raise exception 'no staff member for this account' using errcode = 'P0002';
  end if;
  -- Die Person ist gesperrt, damit die Zahl auch gleichzeitig stimmt.
  perform 1 from public.staff_members s where s.id = v_staff for no key update;

  if p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png', 'application/pdf') then
    raise exception 'unsupported media type' using errcode = '22023';
  end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > app.patient_file_max_bytes() then
    raise exception 'file too large or empty' using errcode = '22023';
  end if;
  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid checksum' using errcode = '22023';
  end if;
  if (select count(*) from public.staff_reimbursement_receipts b
       where b.staff_member_id = v_staff and b.reimbursement_id is null
         and b.created_at > now() - interval '24 hours')
     >= app.reimbursement_receipt_limit() then
    raise exception 'too many receipts' using errcode = '23514';
  end if;

  insert into public.staff_reimbursement_receipts (
    organization_id, staff_member_id, mime_type, byte_size, checksum_sha256, created_by
  )
  values (v_org, v_staff, p_mime_type, p_byte_size, p_checksum_sha256, auth.uid())
  returning id into v_id;

  return query
    select b.id, app.reimbursement_receipt_bucket(), b.object_key
    from public.staff_reimbursement_receipts b where b.id = v_id;
end;
$$;

revoke all on function public.prepare_reimbursement_receipt_upload(text, bigint, text) from public, anon;
grant execute on function public.prepare_reimbursement_receipt_upload(text, bigint, text) to authenticated;

comment on function public.prepare_reimbursement_receipt_upload(text, bigint, text) is
  'ERS-001 (ANN-600, ADR-017 Punkt 7a): Phase (a) - ein Beleg der eigenen Person, JPEG, PNG oder PDF bis 10 MB, höchstens zehn unzugeordnet; liefert den Objektschlüssel, bevor Bytes fließen.';

-- Die eigene vorbereitete Zeile des Kontos.
create function app.own_pending_reimbursement_receipt(p_receipt_id uuid)
returns public.staff_reimbursement_receipts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_beleg public.staff_reimbursement_receipts%rowtype;
begin
  select b.* into v_beleg
  from public.staff_reimbursement_receipts b
  where b.id = p_receipt_id
    and b.organization_id = app.current_organization_id()
    and b.created_by = auth.uid()
    and b.status = 'pending'
    and b.confirmation_requested_at is null;
  if v_beleg.id is null then
    raise exception 'receipt not found' using errcode = 'P0002';
  end if;
  return v_beleg;
end;
$$;

revoke all on function app.own_pending_reimbursement_receipt(uuid) from public, anon, authenticated;

create function public.confirm_reimbursement_receipt_upload(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_beleg    public.staff_reimbursement_receipts%rowtype;
  v_metadata jsonb;
begin
  perform app.staff_request_org(app.can_request_reimbursements(), 'not allowed to request reimbursements');
  v_beleg := app.own_pending_reimbursement_receipt(p_receipt_id);
  perform 1 from public.staff_reimbursement_receipts b where b.id = v_beleg.id for update;

  select o.metadata into v_metadata
  from storage.objects o
  where o.bucket_id = app.reimbursement_receipt_bucket() and o.name = v_beleg.object_key;
  if not found then
    raise exception 'object was not uploaded' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'size', '')::bigint is distinct from v_beleg.byte_size then
    raise exception 'uploaded size does not match the announced size' using errcode = '22023';
  end if;
  if nullif(v_metadata ->> 'mimetype', '') is distinct from v_beleg.mime_type then
    raise exception 'uploaded media type does not match the announced media type'
      using errcode = '22023';
  end if;

  -- ADR-017 Punkt 51: Ist die Prüfung am Server scharf, wird der Beleg erst
  -- mit ihrem Ergebnis ready - derselbe Schalter wie für die Akte.
  if app.patient_file_verification_required() then
    update public.staff_reimbursement_receipts set confirmation_requested_at = now()
     where id = v_beleg.id;
  else
    update public.staff_reimbursement_receipts set status = 'ready', confirmed_at = now()
     where id = v_beleg.id;
  end if;
end;
$$;

revoke all on function public.confirm_reimbursement_receipt_upload(uuid) from public, anon;
grant execute on function public.confirm_reimbursement_receipt_upload(uuid) to authenticated;

comment on function public.confirm_reimbursement_receipt_upload(uuid) is
  'ERS-001 (ADR-017 Punkt 7c): Phase (c) - prüft Größe und Typ gegen storage.objects; ready, solange die Prüfung am Server nicht scharf ist (Punkt 51).';

-- Verwirft einen eigenen Beleg, der noch keinem Antrag gehört - nach einem
-- abgebrochenen Upload oder wenn die Person ihn im Ablauf wieder entfernt.
create function public.discard_reimbursement_receipt(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to request reimbursements');
  -- Der Trigger schreibt den Löschauftrag, falls schon ein Objekt liegt.
  delete from public.staff_reimbursement_receipts b
   where b.id = p_receipt_id and b.organization_id = v_org and b.created_by = auth.uid()
     and b.reimbursement_id is null
  returning b.id into v_id;
  if v_id is null then
    raise exception 'receipt not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.discard_reimbursement_receipt(uuid) from public, anon;
grant execute on function public.discard_reimbursement_receipt(uuid) to authenticated;

comment on function public.discard_reimbursement_receipt(uuid) is
  'ERS-001 (ADR-017 Punkt 7): verwirft einen eigenen Beleg, der noch keinem Antrag zugeordnet ist.';

-- Nach einem Tag ohne Antrag verworfen (ANN-600), dazu die abgelaufenen
-- Lesefreigaben. Aufräumen, keine Frist.
create function public.discard_stale_reimbursement_receipts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  delete from public.staff_reimbursement_receipts
   where reimbursement_id is null
     and created_at < now() - interval '24 hours';
  get diagnostics v_anzahl = row_count;
  -- Abgelaufene, nicht verbrauchte Lesefreigaben hielten sonst fest, wer
  -- wann welchen Beleg öffnen wollte (PROJECT_PRINCIPLES.md 20).
  delete from public.staff_reimbursement_receipt_access_grants where expires_at <= now();
  return v_anzahl;
end;
$$;

revoke all on function public.discard_stale_reimbursement_receipts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute format(
      'select cron.schedule(%L, %L, %L)',
      'discard-stale-reimbursement-receipts',
      '50 3 * * *',
      'select public.discard_stale_reimbursement_receipts()'
    );
  else
    raise notice 'pg_cron ist nicht verfuegbar - nicht zugeordnete Belege (ERS-001) werden nicht automatisch verworfen.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 7. Einkauf beantragen, zurückziehen, entscheiden, auszahlen
-- -----------------------------------------------------------------------------
create function public.submit_purchase_reimbursement(p_items jsonb, p_iban text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start  record;
  v_posten record;
  v_ids    uuid[];
  v_summe  integer;
  v_id     uuid;
  v_status text;
begin
  select * into v_start from app.reimbursement_start(p_iban);
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and app.reimbursement_receipt_limit() then
    raise exception 'one to ten receipts' using errcode = '22023';
  end if;

  -- Die Posten in Spalten; was sich nicht lesen lässt, ist ungültig.
  begin
    create temporary table if not exists erstattung_posten (
      receipt_id uuid, amount_cents integer, purpose text
    ) on commit drop;
    delete from erstattung_posten;
    insert into erstattung_posten (receipt_id, amount_cents, purpose)
    select (p ->> 'receipt_id')::uuid, (p ->> 'amount_cents')::integer,
           nullif(btrim(p ->> 'purpose'), '')
    from jsonb_array_elements(p_items) as p;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'receipt item is invalid' using errcode = '22023';
  end;
  if exists (
       select 1 from erstattung_posten
       where receipt_id is null or amount_cents is null or amount_cents not between 1 and 100000
          or purpose is null or length(purpose) > 200
     )
     or (select count(distinct receipt_id) from erstattung_posten) <> jsonb_array_length(p_items) then
    raise exception 'receipt item is invalid' using errcode = '22023';
  end if;

  -- Nur eigene, fertige, noch nicht zugeordnete Belege - gesperrt, damit
  -- keiner zweimal zugeordnet wird. Fremde und verworfene sehen gleich aus.
  select array_agg(b.id) into v_ids
  from public.staff_reimbursement_receipts b
  where b.id in (select receipt_id from erstattung_posten)
    and b.organization_id = v_start.organization_id
    and b.staff_member_id = v_start.staff_member_id
    and b.created_by = auth.uid()
    and b.reimbursement_id is null
    and b.status = 'ready'
    and b.created_at > now() - interval '24 hours';
  perform 1 from public.staff_reimbursement_receipts b where b.id = any (v_ids) for update;
  if coalesce(array_length(v_ids, 1), 0) <> jsonb_array_length(p_items)
     or exists (
       select 1 from public.staff_reimbursement_receipts b
       where b.id = any (v_ids) and b.reimbursement_id is not null
     ) then
    raise exception 'receipt not found' using errcode = 'P0002';
  end if;

  select sum(amount_cents)::integer into v_summe from erstattung_posten;
  v_status := case when v_start.self_entered then 'approved' else 'requested' end;
  insert into public.staff_reimbursements (
    organization_id, staff_member_id, kind, amount_cents, status, requested_by, self_entered,
    decided_by, decided_at
  )
  values (
    v_start.organization_id, v_start.staff_member_id, 'purchase', v_summe, v_status, auth.uid(),
    v_start.self_entered,
    case when v_start.self_entered then auth.uid() end,
    case when v_start.self_entered then now() end
  )
  returning id into v_id;

  for v_posten in select * from erstattung_posten loop
    update public.staff_reimbursement_receipts
       set reimbursement_id = v_id, amount_cents = v_posten.amount_cents,
           purpose = v_posten.purpose, attached_at = now()
     where id = v_posten.receipt_id;
  end loop;

  return jsonb_build_object('id', v_id, 'status', v_status, 'amount_cents', v_summe);
end;
$$;

revoke all on function public.submit_purchase_reimbursement(jsonb, text) from public, anon;
grant execute on function public.submit_purchase_reimbursement(jsonb, text) to authenticated;

comment on function public.submit_purchase_reimbursement(jsonb, text) is
  'ERS-001 (ANN-598, ANN-600): Einkauf beantragen - ein bis zehn eigene, fertige Belege, je Beleg Betrag (0,01 bis 1 000 Euro) und Zweck (bis 200 Zeichen); der Betrag ist ihre Summe. Optional die IBAN dazu. owner trägt ein (gilt als genehmigt).';

create function public.withdraw_reimbursement(p_reimbursement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_staff   uuid;
  v_antrag  public.staff_reimbursements%rowtype;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to request reimbursements');
  v_staff := app.own_staff_member(v_org);
  select r.* into v_antrag
  from public.staff_reimbursements r
  where r.id = p_reimbursement_id and r.organization_id = v_org
    and r.staff_member_id is not distinct from v_staff
  for update;
  if v_antrag.id is null then
    raise exception 'reimbursement not found' using errcode = 'P0002';
  end if;
  if v_antrag.status <> 'requested' then
    raise exception 'reimbursement is not open' using errcode = '55000';
  end if;
  update public.staff_reimbursements
     set status = 'withdrawn', withdrawn_at = now()
   where id = v_antrag.id;
end;
$$;

revoke all on function public.withdraw_reimbursement(uuid) from public, anon;
grant execute on function public.withdraw_reimbursement(uuid) to authenticated;

comment on function public.withdraw_reimbursement(uuid) is
  'ERS-001 (ANN-598): den eigenen Antrag zurückziehen, solange er beantragt ist. Er bleibt ein Jahr sichtbar (erstattung_kurz).';

create function public.decide_reimbursement(p_reimbursement_id uuid, p_approve boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_antrag public.staff_reimbursements%rowtype;
  v_grund  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_org := app.staff_request_org(app.can_decide_staff_requests(), 'not allowed to decide reimbursements');
  select r.* into v_antrag
  from public.staff_reimbursements r
  where r.id = p_reimbursement_id and r.organization_id = v_org
  for update;
  if v_antrag.id is null then
    raise exception 'reimbursement not found' using errcode = 'P0002';
  end if;
  if v_antrag.staff_member_id is not distinct from app.own_staff_member(v_org) then
    raise exception 'not allowed to decide own request' using errcode = '42501';
  end if;
  if v_antrag.status <> 'requested' then
    raise exception 'reimbursement is not open' using errcode = '55000';
  end if;
  if p_approve is null then
    raise exception 'decision missing' using errcode = '22023';
  end if;
  if not p_approve and v_grund is null then
    raise exception 'rejection needs a reason' using errcode = '22023';
  end if;
  if length(v_grund) > 500 then
    raise exception 'reason is too long' using errcode = '22023';
  end if;

  update public.staff_reimbursements
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = case when p_approve then null else v_grund end
   where id = v_antrag.id;
  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;

revoke all on function public.decide_reimbursement(uuid, boolean, text) from public, anon;
grant execute on function public.decide_reimbursement(uuid, boolean, text) to authenticated;

comment on function public.decide_reimbursement(uuid, boolean, text) is
  'ERS-001 (ANN-598): owner genehmigt oder lehnt mit Grund ab - nie den eigenen Antrag, nur beantragte. Genehmigt heißt nicht ausgezahlt.';

-- Ob die anfragende Person diesen Antrag auszahlen darf: owner, ein
-- genehmigter Antrag, nicht der eigene - außer selbst eingetragen.
create function app.may_pay_reimbursement(p_org uuid, p_reimbursement public.staff_reimbursements)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_decide_staff_requests()
         and p_reimbursement.status = 'approved'
         and (p_reimbursement.self_entered
              or p_reimbursement.staff_member_id is distinct from app.own_staff_member(p_org))
$$;

revoke all on function app.may_pay_reimbursement(uuid, public.staff_reimbursements) from public, anon, authenticated;

create function public.reimbursement_payout_details(p_reimbursement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_antrag public.staff_reimbursements%rowtype;
  v_konto  public.staff_payout_accounts%rowtype;
begin
  v_org := app.staff_request_org(app.can_decide_staff_requests(), 'not allowed to pay reimbursements');
  select r.* into v_antrag
  from public.staff_reimbursements r
  where r.id = p_reimbursement_id and r.organization_id = v_org;
  if v_antrag.id is null then
    raise exception 'reimbursement not found' using errcode = 'P0002';
  end if;
  if not app.may_pay_reimbursement(v_org, v_antrag) then
    raise exception 'reimbursement is not approved' using errcode = '55000';
  end if;
  select a.* into v_konto from public.staff_payout_accounts a
   where a.staff_member_id = v_antrag.staff_member_id;
  return app.reimbursement_view(v_antrag) || jsonb_build_object(
    'iban', v_konto.iban,
    'account_since', v_konto.updated_at
  );
end;
$$;

revoke all on function public.reimbursement_payout_details(uuid) from public, anon;
grant execute on function public.reimbursement_payout_details(uuid) to authenticated;

comment on function public.reimbursement_payout_details(uuid) is
  'ERS-001 (ANN-601): die volle IBAN und seit wann sie hinterlegt ist - nur für owner, nur zu einem genehmigten Antrag, den er auszahlen darf. Die einzige Stelle, an der die IBAN die Datenbank verlässt.';

create function public.mark_reimbursement_paid(p_reimbursement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_antrag public.staff_reimbursements%rowtype;
begin
  v_org := app.staff_request_org(app.can_decide_staff_requests(), 'not allowed to pay reimbursements');
  select r.* into v_antrag
  from public.staff_reimbursements r
  where r.id = p_reimbursement_id and r.organization_id = v_org
  for update;
  if v_antrag.id is null then
    raise exception 'reimbursement not found' using errcode = 'P0002';
  end if;
  if v_antrag.status = 'approved' and not app.may_pay_reimbursement(v_org, v_antrag) then
    raise exception 'not allowed to decide own request' using errcode = '42501';
  end if;
  if v_antrag.status <> 'approved' then
    raise exception 'reimbursement is not approved' using errcode = '55000';
  end if;
  update public.staff_reimbursements
     set status = 'paid', paid_by = auth.uid(), paid_at = now()
   where id = v_antrag.id;
  return jsonb_build_object('status', 'paid', 'paid_at', now());
end;
$$;

revoke all on function public.mark_reimbursement_paid(uuid) from public, anon;
grant execute on function public.mark_reimbursement_paid(uuid) to authenticated;

comment on function public.mark_reimbursement_paid(uuid) is
  'ERS-001 (ANN-598): owner vermerkt die Auszahlung eines genehmigten Antrags - nicht den eigenen eines anderen Kontos, den selbst eingetragenen schon. Ausgezahlt von/am ist der Nachweis; überwiesen wird bei der Bank.';

-- -----------------------------------------------------------------------------
-- 8. Lesen
-- -----------------------------------------------------------------------------
create function public.list_reimbursements(p_staff_member_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_eigene uuid;
  v_person uuid;
  v_alle   boolean;
  v_entsch boolean;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to read reimbursements');
  v_eigene := app.own_staff_member(v_org);
  v_alle := app.can_read_all_reimbursements();
  v_entsch := app.can_decide_staff_requests();
  v_person := coalesce(p_staff_member_id, v_eigene);
  -- Eine fremde Person nur für owner und Büro; sonst sieht sie aus wie
  -- eine, die es nicht gibt.
  if p_staff_member_id is not null and p_staff_member_id is distinct from v_eigene
     and (not v_alle or not exists (
       select 1 from public.staff_members s
       where s.id = p_staff_member_id and s.organization_id = v_org
     )) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'my_staff_member_id', v_eigene,
    'can_decide', v_entsch,
    'can_read_all', v_alle,
    'wh_per_day', app.electricity_wh_per_day(),
    'cents_per_kwh', app.electricity_cents_per_kwh(),
    'person', case when v_person is null then null else jsonb_build_object(
      'staff_member_id', v_person,
      'name', app.staff_display_name(v_person),
      'account', app.payout_account_view(v_person),
      'reimbursements', coalesce((
        select jsonb_agg(app.reimbursement_view(r) order by r.requested_at desc, r.id)
        from public.staff_reimbursements r
        where r.organization_id = v_org and r.staff_member_id = v_person
      ), '[]'::jsonb)
    ) end,
    -- owner: was zu entscheiden und was auszuzahlen ist, je Antrag mit Namen.
    'to_decide', case when not v_entsch then '[]'::jsonb else coalesce((
      select jsonb_agg(app.reimbursement_view(r) order by r.requested_at, r.id)
      from public.staff_reimbursements r
      where r.organization_id = v_org and r.status = 'requested'
        and r.staff_member_id is distinct from v_eigene
    ), '[]'::jsonb) end,
    'to_pay', case when not v_entsch then '[]'::jsonb else coalesce((
      select jsonb_agg(app.reimbursement_view(r)
                       || jsonb_build_object('iban_masked',
                            app.mask_iban((select a.iban from public.staff_payout_accounts a
                                            where a.staff_member_id = r.staff_member_id)))
                       order by r.decided_at, r.id)
      from public.staff_reimbursements r
      where r.organization_id = v_org and app.may_pay_reimbursement(v_org, r)
    ), '[]'::jsonb) end,
    -- owner und Büro: die Personen mit Erstattungen, je Person die offenen -
    -- keine Summe über alle (PROJECT_PRINCIPLES.md 20).
    'people', case when not v_alle then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'staff_member_id', x.staff_member_id,
               'name', app.staff_display_name(x.staff_member_id),
               'open', x.offen
             ) order by app.staff_display_name(x.staff_member_id), x.staff_member_id)
      from (
        select r.staff_member_id,
               count(*) filter (where r.status in ('requested', 'approved'))::integer as offen
        from public.staff_reimbursements r
        where r.organization_id = v_org and r.staff_member_id is distinct from v_eigene
        group by r.staff_member_id
      ) x
    ), '[]'::jsonb) end
  );
end;
$$;

revoke all on function public.list_reimbursements(uuid) from public, anon;
grant execute on function public.list_reimbursements(uuid) to authenticated;

comment on function public.list_reimbursements(uuid) is
  'ERS-001 (ANN-598, ANN-601): die eigenen Erstattungen mit Belegen und maskierter IBAN; für owner und Büro auf Wunsch die einer anderen Person und die Personen mit Erstattungen (ohne Summe über alle); für owner zu entscheiden und auszuzahlen. Nie die volle IBAN, nie ein Objektschlüssel.';

-- -----------------------------------------------------------------------------
-- 9. Ansehen - gegen eine einmalige Freigabe (ADR-017 Punkt 15, ANN-052)
--
-- Die eigenen Belege - auch vor dem Absenden -, und für owner und Büro die
-- zugeordneten aller. Der Objektschlüssel verlässt die Datenbank nur hier.
-- -----------------------------------------------------------------------------
create function public.issue_reimbursement_receipt_link(p_receipt_id uuid)
returns table (bucket_id text, object_key text, mime_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_beleg public.staff_reimbursement_receipts%rowtype;
begin
  v_org := app.staff_request_org(app.can_request_reimbursements(), 'not allowed to read reimbursements');
  select b.* into v_beleg
  from public.staff_reimbursement_receipts b
  where b.id = p_receipt_id and b.organization_id = v_org and b.status = 'ready'
    and (b.staff_member_id is not distinct from app.own_staff_member(v_org)
         or (b.reimbursement_id is not null and app.can_read_all_reimbursements()));
  if v_beleg.id is null then
    raise exception 'receipt not found' using errcode = 'P0002';
  end if;

  delete from public.staff_reimbursement_receipt_access_grants g
   where g.organization_id = v_org and g.expires_at <= now();
  insert into public.staff_reimbursement_receipt_access_grants
    (organization_id, user_id, receipt_id, expires_at)
  values (v_org, auth.uid(), v_beleg.id, now() + app.patient_file_access_grant_ttl());

  return query select app.reimbursement_receipt_bucket(), v_beleg.object_key, v_beleg.mime_type;
end;
$$;

revoke all on function public.issue_reimbursement_receipt_link(uuid) from public, anon;
grant execute on function public.issue_reimbursement_receipt_link(uuid) to authenticated;

comment on function public.issue_reimbursement_receipt_link(uuid) is
  'ERS-001 (ADR-017 Punkt 15, ANN-052): einmalige Freigabe für genau einen Verweis auf einen Beleg - die eigenen, für owner und Büro die zugeordneten aller. Kein Auditeintrag.';

-- -----------------------------------------------------------------------------
-- 10. RLS auf storage.objects für den neuen Bucket (ADR-017 Punkt 11)
-- -----------------------------------------------------------------------------
create function app.may_upload_reimbursement_receipt_object(p_object_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_reimbursement_receipts b
    where b.object_key = p_object_key
      and b.status = 'pending'
      and b.confirmation_requested_at is null
      and b.created_by = auth.uid()
      and b.organization_id = app.current_organization_id()
      and b.created_at > now() - interval '24 hours'
      and app.can_request_reimbursements()
  )
$$;

create function app.may_read_reimbursement_receipt_object(p_object_key text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org   uuid;
  v_grant uuid;
begin
  if v_actor is null or not app.can_request_reimbursements() then
    return false;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    return false;
  end if;

  select g.id into v_grant
  from public.staff_reimbursement_receipt_access_grants g
  join public.staff_reimbursement_receipts b on b.id = g.receipt_id
  where b.object_key = p_object_key
    and b.status = 'ready'
    and b.organization_id = v_org
    and g.organization_id = v_org
    and g.user_id = v_actor
    and g.expires_at > now()
  order by g.created_at
  limit 1
  for update of g skip locked;

  if v_grant is null then
    return false;
  end if;
  delete from public.staff_reimbursement_receipt_access_grants where id = v_grant;
  return true;
end;
$$;

revoke all on function app.may_upload_reimbursement_receipt_object(text) from public, anon;
revoke all on function app.may_read_reimbursement_receipt_object(text) from public, anon;
grant execute on function app.may_upload_reimbursement_receipt_object(text) to authenticated;
grant execute on function app.may_read_reimbursement_receipt_object(text) to authenticated;

create policy reimbursement_receipts_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = app.reimbursement_receipt_bucket()
    and app.may_upload_reimbursement_receipt_object(name)
  );

create policy reimbursement_receipts_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = app.reimbursement_receipt_bucket()
    and app.may_read_reimbursement_receipt_object(name)
  );

create policy reimbursement_receipts_objects_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = app.reimbursement_receipt_bucket()
    and app.may_delete_storage_object(bucket_id, name)
  );

create policy reimbursement_receipts_objects_select_for_deletion
  on storage.objects for select to authenticated
  using (
    bucket_id = app.reimbursement_receipt_bucket()
    and app.may_read_storage_object_for_deletion(bucket_id, name)
  );

-- -----------------------------------------------------------------------------
-- 11. Prüfung am Server (ADR-017 Punkte 49 bis 52) - nur für den Dienst
--
-- Dieselbe Edge Function wie für Akte, Anhänge und Fotos am Rad
-- (patient-file-verify), mit `receipt_id`. Geprüft wird vor dem Absenden:
-- nur ein Beleg ohne Antrag. Ein Befund heißt verwerfen (Punkt 52).
-- -----------------------------------------------------------------------------
create function public.reimbursement_receipt_for_verification(p_receipt_id uuid, p_user_id uuid)
returns table (
  bucket_id        text,
  object_key       text,
  mime_type        text,
  byte_size        bigint,
  checksum_sha256  text,
  already_verified boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select app.reimbursement_receipt_bucket(), b.object_key, b.mime_type, b.byte_size,
         b.checksum_sha256, b.verified_at is not null
  from public.staff_reimbursement_receipts b
  where b.id = p_receipt_id
    and b.created_by = p_user_id
    and b.reimbursement_id is null
    and b.created_at > now() - interval '24 hours'
    and (b.status = 'ready' or b.confirmation_requested_at is not null)
$$;

create function public.record_reimbursement_receipt_verification(
  p_receipt_id      uuid,
  p_content_type_ok boolean,
  p_checksum_ok     boolean,
  p_metadata_ok     boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_beleg public.staff_reimbursement_receipts%rowtype;
begin
  if p_content_type_ok is null or p_checksum_ok is null then
    raise exception 'incomplete verification result' using errcode = '22023';
  end if;

  select b.* into v_beleg from public.staff_reimbursement_receipts b
   where b.id = p_receipt_id for update;
  -- Ein zugeordneter Beleg wird nicht mehr geprüft: Er hängt an einem Antrag.
  if not found or v_beleg.reimbursement_id is not null then
    return 'not_found';
  end if;
  if v_beleg.verified_at is not null then
    return 'already_verified';
  end if;
  if v_beleg.status <> 'ready' and v_beleg.confirmation_requested_at is null then
    return 'not_confirmed';
  end if;
  -- Bilder bekommen ein Metadatenergebnis, PDF nicht (Punkt 49).
  if (v_beleg.mime_type in ('image/jpeg', 'image/png')) <> (p_metadata_ok is not null) then
    raise exception 'metadata result does not match the media type' using errcode = '22023';
  end if;

  if p_content_type_ok and p_checksum_ok and coalesce(p_metadata_ok, true) then
    update public.staff_reimbursement_receipts
       set verified_at = now(),
           status = 'ready',
           confirmed_at = coalesce(confirmed_at, now())
     where id = p_receipt_id;
    return 'passed';
  end if;

  -- Punkt 52: Befund heißt verwerfen; der Trigger schreibt den Löschauftrag.
  -- Kein Journal: Ein Beleg ohne Antrag fällt nach einer Wiederherstellung
  -- ohnehin nach einem Tag (public.discard_stale_reimbursement_receipts).
  delete from public.staff_reimbursement_receipts where id = p_receipt_id;
  return 'rejected';
end;
$$;

revoke all on function public.reimbursement_receipt_for_verification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_reimbursement_receipt_verification(uuid, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.reimbursement_receipt_for_verification(uuid, uuid) to service_role;
grant execute on function public.record_reimbursement_receipt_verification(uuid, boolean, boolean, boolean)
  to service_role;

comment on function public.record_reimbursement_receipt_verification(uuid, boolean, boolean, boolean) is
  'ERS-001 (ADR-017 Punkte 49 bis 52, ANN-600): Ergebnis der Prüfung am Inhalt eines Belegs ohne Antrag - Typ an der Signatur, Prüfsumme, bei Bildern keine Metadaten. Bestanden: geprüft und ready. Befund: verworfen mit Löschauftrag. Nur für den Dienst.';

-- -----------------------------------------------------------------------------
-- 12. Löschlauf (ADR-008, ANN-602)
-- -----------------------------------------------------------------------------
create function app.delete_due_reimbursements(p_org uuid, p_time_zone text, p_run uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer := 0;
  v_teil   integer;
begin
  -- Ausgezahlt: acht Jahre ab Ende des Jahres der Auszahlung (Par. 147 AO).
  -- Die Belege fallen mit (cascade), ihre Objekte über den Löschauftrag.
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             make_date(extract(year from (r.paid_at at time zone p_time_zone))::integer, 12, 31),
             app.retention_interval('erstattung'),
             p_time_zone
           ) as due_at
    from public.staff_reimbursements r
    where r.organization_id = p_org and r.status = 'paid'
  ),
  geloescht as (
    -- Erneut geprüft wie beim Zeitkonto: nur, was noch ausgezahlt ist.
    delete from public.staff_reimbursements r
    using faellig f
    where r.id = f.id and f.due_at <= now() and r.status = 'paid'
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_reimbursements', g.id, 'erstattung', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  -- Abgelehnt und zurückgezogen: ein Jahr nach ihrem Ende.
  with faellig as (
    select r.id, r.organization_id,
           app.retention_due_at(
             (coalesce(r.decided_at, r.withdrawn_at) at time zone p_time_zone)::date,
             app.retention_interval('erstattung_kurz'),
             p_time_zone
           ) as due_at
    from public.staff_reimbursements r
    where r.organization_id = p_org and r.status in ('rejected', 'withdrawn')
  ),
  geloescht as (
    delete from public.staff_reimbursements r
    using faellig f
    where r.id = f.id and f.due_at <= now() and r.status in ('rejected', 'withdrawn')
    returning r.id, r.organization_id
  )
  insert into public.deletion_journal
    (organization_id, run_id, target_table, target_id, retention_class, due_at)
  select g.organization_id, p_run, 'staff_reimbursements', g.id, 'erstattung_kurz', f.due_at
  from geloescht g join faellig f on f.id = g.id;
  get diagnostics v_teil = row_count;
  v_anzahl := v_anzahl + v_teil;

  return v_anzahl;
end;
$$;

revoke all on function app.delete_due_reimbursements(uuid, text, uuid) from public, anon, authenticated;

comment on function app.delete_due_reimbursements(uuid, text, uuid) is
  'ERS-001 (ANN-602): löscht ausgezahlte Erstattungen mit ihren Belegen acht Jahre ab Ende des Jahres der Auszahlung, abgelehnte und zurückgezogene ein Jahr nach ihrem Ende - mit Eintrag im Löschjournal. Aufgerufen aus public.apply_retention().';

-- -----------------------------------------------------------------------------
-- 13. Der Lauf ruft die Erstattungen mit auf - sonst unverändert (Stand ZK-001)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_retention()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run       uuid := extensions.gen_random_uuid();
  v_org       record;
  v_akte      record;
  v_akten     integer;
  v_gehalten  integer;
  v_steuer    integer;
  v_verhaelt  record;
  v_training  integer;
  v_termine   integer;
  v_audit     integer;
  v_auftraege integer;
  v_journal   integer;
  v_zugang    integer;
  v_fotos     integer;
  v_warte     integer;
  v_aufgaben  integer;
  v_anrufe    integer;
  v_konten    integer;
  v_plattform integer;
  v_wuensche  integer;
  v_nachrichten integer;
  v_anhaenge  integer;
  v_radflotte integer;
  v_urlaub integer;
  v_arbeitszeit integer;
  v_zeitkonto integer;
  v_erstattung integer;
  v_gesamt    integer := 0;
begin
  for v_org in select o.id, o.time_zone from public.organizations o order by o.id
  loop
    v_akten    := 0;
    v_gehalten := 0;
    v_steuer   := 0;
    v_training := 0;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 1 (POR-002, ADR-023 Punkt 5, ANN-189): Konten beim
    -- Anmeldedienst, 30 Tage nach dem Ende des letzten Zugangs. VOR den
    -- Verhaeltnissen: Solange das Verhaeltnis steht, ist das Ende seines
    -- Zugangs das Ende der Lesefrist (DSN-001 D2) und nicht der Tag, an dem
    -- der Lauf das Verhaeltnis loescht.
    -- -------------------------------------------------------------------
    v_konten := app.delete_due_platform_accounts(v_org.id, v_run);

    -- -------------------------------------------------------------------
    -- Patientenfotos: zwoelf Monate ab Aufnahme, spaetestens drei Monate
    -- nach dem festgehaltenen Abschluss, Widerruf (ADR-017 Punkt 38).
    -- Ein Legal Hold haelt an.
    -- -------------------------------------------------------------------
    v_fotos := app.delete_due_patient_photos(v_org.id, null, v_run, null, 'retention');

    -- -------------------------------------------------------------------
    -- Klinische Patientenakte: zehn Jahre nach Abschluss der Behandlung.
    --
    -- B1 (BEF-151, ADR-008 Fassung 3): Der Anker ist nicht mehr allein der
    -- ausdrueckliche Abschluss, sondern app.patient_retention_anchor - das
    -- spaeteste Datum aus letzter Behandlung, erfasster Leistung und einem
    -- etwaigen ausdruecklichen Abschluss. Eine Akte mit kuenftigem Termin
    -- faellt nie, und ohne jede Behandlung laeuft weiter keine Frist.
    -- -------------------------------------------------------------------
    for v_akte in
      select k.id, k.due_at
      from (
        select p.id,
               app.retention_due_at(
                 app.patient_retention_anchor(p.id),
                 app.retention_interval('patientenakte'),
                 v_org.time_zone
               ) as due_at
        from public.patients p
        where p.organization_id = v_org.id
      ) k
      join public.patients p on p.id = k.id
      where k.due_at is not null
        and k.due_at <= now()
        and not app.patient_has_upcoming_care(k.id)
      order by k.due_at
      for update of p skip locked
    loop
      if app.under_legal_hold(v_org.id, 'patient', v_akte.id) then
        v_gehalten := v_gehalten + 1;
        continue;
      end if;

      -- Neu mit ABR-003: Die steuerliche Frist einer ausgestellten Rechnung
      -- kann die zehn Jahre der Akte ueberdauern. Gesetzliche Aufbewahrung
      -- hat Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2).
      if app.billing_retention_due_at(v_akte.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        continue;
      end if;

      v_akten := v_akten + app.delete_patient_record(v_akte.id, v_run, v_akte.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Trainingsverhaeltnis: drei Jahre ab Vertragsende (ADR-021 Punkt 4)
    --
    -- Eigene Schleife und nicht ein Zweig der Akte: Die Frist ist kuerzer,
    -- der Anker ein anderer, und die Rechtsgrundlage traegt die
    -- Heilbehandlungs-Ausnahme nicht. Ohne Vertragsende laeuft keine Frist -
    -- ein laufendes Training wird nie geloescht.
    --
    -- KEIN LEGAL HOLD, UND ZWAR ABSICHTLICH: Loeschsperren stehen heute auf
    -- Patientenebene (ANN-033); ein Hold auf ein Trainingsverhaeltnis ist
    -- nicht darstellbar und waere hier eine Pruefung ohne Gegenstand. Wer
    -- eine Loeschung anhalten muss, raeumt bis dahin contract_ended_on - der
    -- Anker ist genau dafuer ruecknehmbar gebaut (LEI-001). Eine Sperre in
    -- der Behandlung wirkt nicht hierher: Der Hold haengt am Verhaeltnis
    -- (ADR-021), und die gemeinsame Person haelt sie ueber die Akte.
    --
    -- SKIP LOCKED wie bei der Akte: ein Verhaeltnis, an dem gerade jemand
    -- arbeitet, kommt im naechsten Lauf erneut dran.
    -- -------------------------------------------------------------------
    for v_verhaelt in
      select t.id,
             app.retention_due_at(
               t.contract_ended_on,
               app.retention_interval('trainingsverhaeltnis'),
               v_org.time_zone
             ) as due_at
      from public.training_relationships t
      where t.organization_id = v_org.id
        and t.contract_ended_on is not null
        and app.retention_due_at(
              t.contract_ended_on,
              app.retention_interval('trainingsverhaeltnis'),
              v_org.time_zone
            ) <= now()
      order by t.contract_ended_on
      for update of t skip locked
    loop
      -- TRN-008 (ANN-183): Die steuerliche Frist der Belege kann die drei
      -- Jahre des Verhaeltnisses ueberdauern. Gesetzliche Aufbewahrung hat
      -- Vorrang vor der regulaeren Loeschung (ADR-008 Punkt 2) - dieselbe
      -- Regel wie an der Akte.
      if app.training_billing_retention_due_at(v_verhaelt.id, v_org.time_zone) > now() then
        v_steuer := v_steuer + 1;
        -- Zweitreview: gehalten werden nur die Belege und was sie tragen;
        -- der Rest faellt nach den drei Jahren aus ADR-021 Punkt 4.
        v_training := v_training
          + app.reduce_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
        continue;
      end if;

      v_training := v_training
        + app.delete_training_relationship(v_verhaelt.id, v_run, v_verhaelt.due_at);
    end loop;

    -- -------------------------------------------------------------------
    -- Abgesagte Termine und No-shows ohne Behandlungsnachweis: drei Jahre
    -- ab Ende des Kalenderjahres der Absage beziehungsweise des Vermerks.
    --
    -- Haengt Dokumentation am Termin, gilt die Frist der Akte - der Termin
    -- ist dann Teil des Behandlungsnachweises (ADR-008 Punkt 2). Ein
    -- Vorgang mit Gebuehrenanlass bleibt stehen: er ist die Grundlage
    -- einer Forderung (ANN-035, CAL-014b). Die mit der Abrechnung
    -- angekuendigte Bedingung "ohne Rechnung" ist damit erfuellt: Eine
    -- Rechnung kann nur an einem dokumentierten Termin oder an einem
    -- Gebuehrenanlass haengen, und beide nimmt die Abfrage bereits aus.
    -- -------------------------------------------------------------------
    with faellig as (
      select a.id,
             a.organization_id,
             app.retention_due_at(
               (date_trunc(
                  'year',
                  coalesce(a.cancelled_at, a.no_show_recorded_at) at time zone v_org.time_zone
                ) + interval '1 year' - interval '1 day')::date,
               app.retention_interval('termin_ohne_nachweis'),
               v_org.time_zone
             ) as due_at
      from public.appointments a
      where a.organization_id = v_org.id
        and a.fee_basis is null
        -- CAL-026: NUR Praxistermine. Ein Trainingstermin faellt mit seinem
        -- Verhaeltnis (oben) und nach dessen Frist - nicht hier. Zwei Gruende,
        -- und beide sind hart: Diese Frist rechnet ab Kalenderjahresende statt
        -- ab Vertragsende, und die Sperrpruefung darunter laeuft ueber
        -- a.patient_id, der am Trainingstermin leer ist - eine Sperre am
        -- Verhaeltnis haette die Zeile nicht gehalten (ADR-022, Konsequenzen).
        and a.kind <> 'training'
        and (
          (a.status = 'cancelled' and a.cancelled_at is not null)
          or (a.status = 'no_show' and a.no_show_recorded_at is not null)
        )
        and not exists (
          select 1 from public.treatment_notes t where t.appointment_id = a.id
        )
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointments a
      using faellig f
      where a.id = f.id
        and f.due_at <= now()
      returning a.id, a.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointments', g.id, 'termin_ohne_nachweis', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_termine = row_count;

    -- -------------------------------------------------------------------
    -- Auditlog: drei Jahre ab dem Ereignis (ANN-029)
    -- -------------------------------------------------------------------
    -- LOG-EPIC-001: zwei Klassen (app.audit_retention_class), und ein Legal
    -- Hold haelt jede Zeile seiner Akte - ueber den Gegenstand oder
    -- context.patient_id, auch fuer zusammengefuehrte Doppelanlagen.
    with geloescht as (
      delete from public.audit_log a
      where a.organization_id = v_org.id
        and a.occurred_at < now() - app.retention_interval(app.audit_retention_class(a.action))
        and not app.audit_entry_held(v_org.id, a.subject_type, a.subject_id, a.context)
      returning a.id, a.organization_id, a.occurred_at, app.audit_retention_class(a.action) as klasse
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'audit_log', g.id, g.klasse,
           g.occurred_at + app.retention_interval(g.klasse)
    from geloescht g;
    get diagnostics v_audit = row_count;

    -- -------------------------------------------------------------------
    -- Quittierte Loeschauftraege der Ablage: drei Jahre ab der Quittung
    -- (LOG-EPIC-001). Offene Auftraege bleiben. Nicht im Journal: Ein
    -- Auftrag ist selbst der Nachweis einer Loeschung, kein Fachdatensatz.
    -- -------------------------------------------------------------------
    delete from public.storage_deletion_orders o
    where o.organization_id = v_org.id
      and o.receipted_at is not null
      and o.receipted_at < now() - app.retention_interval('loeschauftrag');
    get diagnostics v_auftraege = row_count;

    -- -------------------------------------------------------------------
    -- Loeschjournal: 60 Tage ab der Loeschung (ADR-012: Backups 30 Tage,
    -- dazu 30 Tage Puffer). Zuletzt, damit die Eintraege dieses Laufs nicht
    -- mitfallen.
    -- -------------------------------------------------------------------
    delete from public.deletion_journal j
    where j.organization_id = v_org.id
      and j.deleted_at < now() - app.retention_interval('loeschjournal');
    get diagnostics v_journal = row_count;

    -- -------------------------------------------------------------------
    -- Einladungen: zwoelf Monate nach Abschluss des Vorgangs (ANN-026)
    -- -------------------------------------------------------------------
    with faellig as (
      select i.id,
             i.organization_id,
             coalesce(
               i.accepted_at,
               i.revoked_at,
               case when i.status = 'pending' and i.expires_at <= now() then i.expires_at end
             ) + app.retention_interval('zugangseinladung') as due_at
      from public.staff_account_invitations i
      where i.organization_id = v_org.id
    ),
    geloescht as (
      delete from public.staff_account_invitations i
      using faellig f
      where i.id = f.id
        and f.due_at is not null
        and f.due_at <= now()
      returning i.id, i.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'staff_account_invitations', g.id, 'zugangseinladung', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_zugang = row_count;

    -- -------------------------------------------------------------------
    -- Warteliste: zwoelf Monate nach dem Schliessen (ANN-133). Offene
    -- Eintraege fallen nur mit der Akte. Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.closed_at + app.retention_interval('warteliste') as due_at
      from public.waitlist_entries w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.closed_at is not null
        and not app.under_legal_hold(v_org.id, 'patient', w.patient_id)
    ),
    geloescht as (
      delete from public.waitlist_entries w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'waitlist_entries', g.id, 'warteliste', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_warte = row_count;

    -- -------------------------------------------------------------------
    -- Aufgaben: zwoelf Monate nach dem Erledigen (ANN-142). Offene
    -- Aufgaben bleiben; mit Personenbezug fallen sie mit der Akte. Ein
    -- Legal Hold an der Akte haelt auch die erledigte Aufgabe.
    -- -------------------------------------------------------------------
    with faellig as (
      select k.id,
             k.organization_id,
             k.done_at + app.retention_interval('aufgabe') as due_at
      from public.tasks k
      where k.organization_id = v_org.id
        and k.status = 'done'
        and k.done_at is not null
        and (k.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', k.patient_id))
    ),
    geloescht as (
      delete from public.tasks k
      using faellig f
      where k.id = f.id
        and f.due_at <= now()
      returning k.id, k.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'tasks', g.id, 'aufgabe', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_aufgaben = row_count;

    -- -------------------------------------------------------------------
    -- Anrufstand: vierzehn Tage nach dem Termin (ANN-144). Ein "nicht
    -- erreicht" soll kein Merkmal der Person werden (§20, IDEA-PRX-041).
    -- -------------------------------------------------------------------
    with faellig as (
      select c.id,
             c.organization_id,
             a.starts_at + app.retention_interval('anrufstand') as due_at
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where c.organization_id = v_org.id
        -- Ein Legal Hold an der Akte haelt auch den Anrufstand (ADR-008
        -- Punkt 7, Zweitreview).
        and not app.under_legal_hold(v_org.id, 'patient', a.patient_id)
    ),
    geloescht as (
      delete from public.appointment_call_states c
      using faellig f
      where c.id = f.id
        and f.due_at <= now()
      returning c.id, c.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'appointment_call_states', g.id, 'anrufstand', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_anrufe = row_count;

    -- -------------------------------------------------------------------
    -- Terminwuensche der Plattform (POR-009, ANN-246): zwoelf Monate nach
    -- der Antwort der Praxis bzw. dem Zurueckziehen. Offene Wuensche
    -- bleiben; mit dem Verhaeltnis fallen sie ohnehin (cascade). Ein Legal
    -- Hold an der Akte haelt auch den beantworteten Wunsch.
    -- -------------------------------------------------------------------
    with faellig as (
      select w.id,
             w.organization_id,
             w.resolved_at + app.retention_interval('terminwunsch') as due_at
      from public.platform_appointment_requests w
      where w.organization_id = v_org.id
        and w.status <> 'open'
        and w.resolved_at is not null
        and (w.patient_id is null or not app.under_legal_hold(v_org.id, 'patient', w.patient_id))
    ),
    geloescht as (
      delete from public.platform_appointment_requests w
      using faellig f
      where w.id = f.id
        and f.due_at <= now()
      returning w.id, w.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_appointment_requests', g.id, 'terminwunsch', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_wuensche = row_count;

    -- -------------------------------------------------------------------
    -- KOM-005 (ADR-017 Punkt 65): Anhaenge an Rueckfragen, 30 Tage ab der
    -- Aufnahme oder ab ihrer Sperre. Vor den Vorgaengen: ein Anhang, der mit
    -- seinem Vorgang faellt, steht nicht doppelt im Journal. Ein Legal Hold
    -- an der Akte haelt (gesperrt, ANN-335).
    -- -------------------------------------------------------------------
    v_anhaenge := app.remove_message_attachments(v_org.id, 'due', null, v_run);

    -- -------------------------------------------------------------------
    -- FLT-001 (ANN-551): Radflotte - Schluessel 30 Tage nach der Rueckgabe,
    -- Sperren, Check-Ups und Pannen drei Jahre ab Ende des Kalenderjahres;
    -- offene nie. Ohne Patientenbezug, deshalb ohne Legal Hold der Akte.
    -- -------------------------------------------------------------------
    v_radflotte := app.delete_due_fleet_records(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- URL-001 (ANN-579): Urlaub - genehmigte und stornierte Antraege und
    -- Ansprueche drei Jahre ab Ende des Urlaubsjahres, abgelehnte und
    -- zurueckgezogene ein Jahr nach ihrem Ende; offene nie. Ohne
    -- Patientenbezug, deshalb ohne Legal Hold der Akte.
    -- -------------------------------------------------------------------
    v_urlaub := app.delete_due_staff_leave(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- AZ-001 (ANN-591): Arbeitszeitaenderungen - genehmigte drei Jahre ab
    -- Ende des Jahres ihrer Wirkung, abgelehnte und zurueckgezogene ein Jahr
    -- nach ihrem Ende; offene nie. Ohne Patientenbezug, ohne Legal Hold.
    -- -------------------------------------------------------------------
    v_arbeitszeit := app.delete_due_working_time_requests(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- ZK-001 (ANN-597): Zeitkonto - gültige Einträge drei Jahre ab Ende
    -- ihres Jahres, ihr Saldo bleibt als Übertrag; zurückgewiesene und
    -- zurückgenommene ein Jahr nach ihrem Ende. Ohne Patientenbezug.
    -- -------------------------------------------------------------------
    v_zeitkonto := app.delete_due_time_account_entries(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- ERS-001 (ANN-602): Erstattungen - ausgezahlte acht Jahre ab Ende des
    -- Jahres der Auszahlung (Par. 147 AO), abgelehnte und zurückgezogene ein
    -- Jahr; die Belege fallen mit, ihre Objekte über den Löschauftrag.
    -- -------------------------------------------------------------------
    v_erstattung := app.delete_due_reimbursements(v_org.id, v_org.time_zone, v_run);

    -- -------------------------------------------------------------------
    -- Nachrichten der Behandlung (KOM-001, ADR-008 "Organisatorische
    -- Patientenkommunikation", ANN-001): drei Jahre ab Ende des
    -- Kalenderjahres, in dem der Vorgang abgeschlossen wurde: erledigt, oder
    -- beantwortet und danach nichts mehr von der Person (Anker: die letzte
    -- Antwort; Zweitreview S1, ANN-308). Offene bleiben; der Akte
    -- zugeordnete (KOM-004, ANN-312) fallen erst mit ihr; im Training fallen
    -- sie mit dem Verhaeltnis (cascade). Ein Legal Hold an der Akte haelt.
    -- -------------------------------------------------------------------
    with faellig as (
      select m.id,
             m.organization_id,
             app.retention_due_at(
               (date_trunc('year', coalesce(m.closed_at, m.last_entry_at)
                                     at time zone v_org.time_zone)
                 + interval '1 year' - interval '1 day')::date,
               app.retention_interval('patientenkommunikation'),
               v_org.time_zone
             ) as due_at
      from public.platform_messages m
      where m.organization_id = v_org.id
        and m.relationship_kind = 'treatment'
        and m.status in ('closed', 'answered')
        and m.record_assigned_at is null
        and not app.under_legal_hold(v_org.id, 'patient', m.patient_id)
    ),
    geloescht as (
      delete from public.platform_messages m
      using faellig f
      where m.id = f.id
        and f.due_at <= now()
      returning m.id, m.organization_id
    )
    insert into public.deletion_journal
      (organization_id, run_id, target_table, target_id, retention_class, due_at)
    select g.organization_id, v_run, 'platform_messages', g.id, 'patientenkommunikation', f.due_at
    from geloescht g
    join faellig f on f.id = g.id;
    get diagnostics v_nachrichten = row_count;

    -- -------------------------------------------------------------------
    -- Plattform, Teil 2 (POR-002, ANN-189): Zugaenge mit ihren Einladungen,
    -- drei Jahre nach ihrem Ende. Nach den Verhaeltnissen oben: Ein im
    -- selben Lauf geloeschtes Verhaeltnis hat seinen Zugang da schon beendet.
    -- -------------------------------------------------------------------
    v_plattform := app.delete_due_platform_accesses(v_org.id, v_run);

    v_gesamt := v_gesamt + v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte
                + v_aufgaben + v_anrufe + v_konten + v_plattform + v_wuensche + v_nachrichten + v_anhaenge
                + v_radflotte + v_urlaub + v_arbeitszeit + v_zeitkonto + v_erstattung;

    if v_fotos + v_akten + v_training + v_termine + v_audit + v_zugang + v_warte + v_aufgaben + v_anrufe
       + v_konten + v_plattform + v_auftraege + v_journal + v_wuensche + v_nachrichten + v_anhaenge
       + v_radflotte + v_urlaub + v_arbeitszeit + v_zeitkonto + v_erstattung > 0
       or v_gehalten > 0 or v_steuer > 0 then
      insert into public.audit_log (
        organization_id, actor_user_id, actor_kind, action, subject_type, subject_id, outcome, context
      )
      values (
        v_org.id, null, 'system', 'retention.applied', 'organization', v_org.id, 'success',
        jsonb_build_object(
          'surface', 'scheduler',
          'run_id', v_run,
          'patientenfoto', v_fotos,
          'patientenakte', v_akten,
          'trainingsverhaeltnis', v_training,
          'termin_ohne_nachweis', v_termine,
          'auditlog', v_audit,
          'loeschauftrag', v_auftraege,
          'loeschjournal', v_journal,
          'zugangseinladung', v_zugang,
          'warteliste', v_warte,
          'aufgabe', v_aufgaben,
          'anrufstand', v_anrufe,
          'plattformkonto', v_konten,
          'plattformzugang', v_plattform,
          'terminwunsch', v_wuensche,
          'patientenkommunikation', v_nachrichten,
          'rueckfrageanhang', v_anhaenge,
          'radflotte', v_radflotte,
          'urlaub', v_urlaub,
          'arbeitszeit', v_arbeitszeit,
          'zeitkonto', v_zeitkonto,
          'erstattung', v_erstattung,
          'legal_hold_gehalten', v_gehalten,
          'steuerfrist_gehalten', v_steuer
        )
      );
    end if;
  end loop;

  return v_gesamt;
end;
$function$;

-- Nach einem Restore werden Erstattungen wie alle anderen erneut gelöscht.
CREATE OR REPLACE FUNCTION public.reapply_deletion_journal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reihenfolge text[] := array[
    'invoice_payment_reminders',
    'invoice_cancellations',
    'payments',
    'invoice_items',
    'invoices',
    'invoice_recipients',
    'billable_services',
    'treatment_note_versions',
    'treatment_notes',
    'patient_files',
    -- Vor Grundlage und Termin: ein Eintrag zeigt auf beide (on delete set
    -- null) - geloescht wird er vorher, damit nichts umgeschrieben wird
    -- (PRX-001, Zweitreview 5).
    'waitlist_entries',
    -- PRX-012: eine Aufgabe zeigt auf Person und Mitarbeitende (cascade
    -- beziehungsweise set null) - geloescht wird sie vorher.
    'tasks',
    -- TRN-009: das Trainingsprotokoll haengt am Termin (restrict) und faellt
    -- vor ihm - dieselbe Reihenfolge wie im Lauf.
    'training_protocols',
    -- PRX-014: der Anrufstand haengt am Termin und faellt vor ihm.
    'appointment_call_states',
    -- POR-009: ein Terminwunsch zeigt auf Termin (set null) und Verhaeltnis
    -- (cascade) - geloescht wird er vorher.
    'platform_appointment_requests',
    -- KOM-005: ein Anhang haengt am Vorgang (cascade) und faellt vor ihm.
    'platform_message_attachments',
    -- KOM-001: ein Vorgang zeigt auf Plan, Uebung (set null) und Akte
    -- (cascade); seine Eintraege fallen mit ihm.
    'platform_messages',
    -- FLT-001: die Radflotte haengt an keiner Akte. Schluessel und Sperren
    -- vor den Pannen (eine Sperre zeigt auf ihre Panne, set null); einzeln
    -- geloeschte Fotos vor Check-Up und Panne, deren Stellen und uebrige
    -- Fotos mit ihnen fallen (cascade); das ausgemusterte Rad zuletzt.
    'fleet_key_handovers',
    'fleet_blocks',
    'fleet_photos',
    'fleet_checkups',
    'fleet_breakdowns',
    'fleet_bikes',
    -- URL-001: Storno und Abwesenheiten in den Arbeitszeiten fallen mit ihrem
    -- Urlaub (cascade).
    'staff_leave_requests',
    'staff_leave_entitlements',
    -- AZ-001: Arbeitszeitaenderungen haengen an keiner anderen Zeile.
    'staff_working_time_requests',
    -- ZK-001: ein Eintrag im Zeitkonto; seine Abweichung faellt mit ihm
    -- (cascade).
    'staff_time_account_entries',
    -- ERS-001: eine Erstattung; ihre Belege fallen mit ihr (cascade), deren
    -- Objekte über den Löschauftrag.
    'staff_reimbursements',
    'treatment_base_items',
    'treatment_bases',
    'appointments',
    'legal_holds',
    'patient_contact_details',
    'patient_care_details',
    'patients',
    -- TRN-EPIC-003 (Zweitreview): Kontaktdaten des Trainings aus der
    -- Teilloeschung. Ihr Schluessel ist das Verhaeltnis, nicht `id`.
    'training_contact_details',
    -- TRN-005: die Vereinbarung nach ihren Terminen (on delete set null) und
    -- vor ihrem Verhaeltnis (restrict) - dieselbe Reihenfolge wie im Lauf
    -- (app.delete_training_relationship). Fehlte seit CAL-026.
    'training_bases',
    -- Vor persons: die Person faellt erst, wenn kein Verhaeltnis mehr auf
    -- sie zeigt - nach einem Restore genauso wie im Lauf (LEI-002).
    'training_relationships',
    'persons',
    'audit_log',
    'staff_account_invitations',
    -- POR-002: der Zugang mit seinen Einladungen (on delete cascade) und das
    -- Konto beim Anmeldedienst. `auth_users` ist kein Tabellenname in
    -- public, sondern die eine Ausnahme unten.
    'platform_accesses',
    'auth_users'
  ];
  v_tabelle   text;
  v_ids       uuid[];
  v_geloescht uuid[];
  v_unbekannt text[];
  v_gesamt    integer := 0;
begin
  select array_agg(distinct j.target_table)
    into v_unbekannt
  from public.deletion_journal j
  where not (j.target_table = any (v_reihenfolge));

  if v_unbekannt is not null then
    raise exception 'deletion journal references tables without a reapply order: %', v_unbekannt
      using errcode = '22023';
  end if;

  foreach v_tabelle in array v_reihenfolge
  loop
    select array_agg(j.target_id)
      into v_ids
    from public.deletion_journal j
    where j.target_table = v_tabelle;

    continue when v_ids is null;

    -- Das Konto einer Plattform liegt beim Anmeldedienst (ADR-023 Punkt 5).
    -- ABN-011 (BEF-115): auch hier ueber die Admin-API. Was nach dem Restore
    -- wieder da ist, verliert sofort jeden Zugang und bekommt einen
    -- Loeschauftrag. Als erneut angewandt gilt der Journaleintrag erst mit
    -- der Bestaetigung (confirm_platform_account_deletion, Zweitreview B1).
    if v_tabelle = 'auth_users' then
      update public.platform_accesses a
         set status = 'revoked',
             revoked_at = coalesce(a.revoked_at, now()),
             revoked_by = null,
             revoked_reason = 'account_deleted',
             locked_at = null,
             locked_by = null
       where a.account_user_id = any (v_ids) and a.status <> 'revoked';

      perform app.order_platform_account_deletion(
        j.target_id, j.organization_id, null, j.due_at, 'reapply')
      from public.deletion_journal j
      join auth.users u on u.id = j.target_id
      where j.target_table = 'auth_users'
        and j.target_id = any (v_ids);
      v_geloescht := null;
    else
    -- Tabellenname aus der festen Liste oben, nie aus Benutzereingabe;
    -- die Kennungen gehen als Parameter, nicht als Text.
    execute format(
      'with g as (delete from public.%I where %I = any($1) returning %I as id) select array_agg(id) from g',
      v_tabelle,
      app.deletion_key_column(v_tabelle),
      app.deletion_key_column(v_tabelle)
    )
    into v_geloescht
    using v_ids;
    end if;

    if v_geloescht is not null then
      update public.deletion_journal
         set reapplied_at = now()
       where target_table = v_tabelle
         and target_id = any (v_geloescht);

      v_gesamt := v_gesamt + array_length(v_geloescht, 1);
    end if;
  end loop;

  -- Die Wiederanwendung weist deletion_journal.reapplied_at nach (LOG-EPIC-001).

  return v_gesamt;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 14. Abgleich (ADR-017 Punkt 27): verwaiste Objekte auch im Bucket der Belege.
--     Rumpf sonst unverändert aus 20261119110000_flt_002_fotos_am_rad.sql.
-- -----------------------------------------------------------------------------
create or replace function public.count_orphaned_patient_file_objects()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if not app.can_execute_storage_deletion() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'storage_deletion.read', 'not allowed to read the storage reconciliation');
    return null;
  end if;

  if v_org is null or not app.can_execute_storage_deletion() then
    raise exception 'not allowed to read the storage reconciliation' using errcode = '42501';
  end if;

  select count(*)
    into v_anzahl
  from storage.objects o
  where o.bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket(),
                        app.message_attachment_bucket(), app.fleet_photo_bucket(),
                        app.reimbursement_receipt_bucket())
    and o.name like v_org::text || '/%'
    and not exists (
      select 1
      from public.patient_files f
      where f.object_key = o.name
        and app.patient_file_bucket_for(f.document_type) = o.bucket_id
    )
    and not exists (
      select 1
      from public.platform_message_attachments x
      where x.object_key = o.name
        and o.bucket_id = app.message_attachment_bucket()
    )
    and not exists (
      select 1
      from public.fleet_photos x
      where x.object_key = o.name
        and o.bucket_id = app.fleet_photo_bucket()
    )
    and not exists (
      select 1
      from public.staff_reimbursement_receipts x
      where x.object_key = o.name
        and o.bucket_id = app.reimbursement_receipt_bucket()
    )
    and not exists (
      select 1
      from public.storage_deletion_orders d
      where d.bucket_id = o.bucket_id
        and d.object_key = o.name
        and d.receipted_at is null
    );

  return v_anzahl;
end;
$$;

create or replace function public.order_orphaned_object_deletion()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org    uuid;
  v_anzahl integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_execute_storage_deletion() then
    perform app.record_denied_write(auth.uid(), 'storage_deletion.ordered', 'not allowed to order deletions');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to order deletions' using errcode = '42501';
  end if;

  insert into public.storage_deletion_orders (organization_id, bucket_id, object_key)
  select v_org, o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in (app.patient_file_bucket(), app.patient_photo_bucket(),
                        app.message_attachment_bucket(), app.fleet_photo_bucket(),
                        app.reimbursement_receipt_bucket())
    and o.name like v_org::text || '/%'
    and not exists (
      select 1
      from public.patient_files f
      where f.object_key = o.name
        and app.patient_file_bucket_for(f.document_type) = o.bucket_id
    )
    and not exists (
      select 1
      from public.platform_message_attachments x
      where x.object_key = o.name
        and o.bucket_id = app.message_attachment_bucket()
    )
    and not exists (
      select 1
      from public.fleet_photos x
      where x.object_key = o.name
        and o.bucket_id = app.fleet_photo_bucket()
    )
    and not exists (
      select 1
      from public.staff_reimbursement_receipts x
      where x.object_key = o.name
        and o.bucket_id = app.reimbursement_receipt_bucket()
    )
  on conflict do nothing;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;
