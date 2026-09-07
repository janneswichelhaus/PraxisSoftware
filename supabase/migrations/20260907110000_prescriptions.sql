-- =============================================================================
-- Verordnungen: Datenmodell und Verordner:innen (VER-001)
--
-- Eine Verordnung ist der Auftrag, auf dem eine Behandlungsserie beruht. Sie
-- entsteht ausserhalb der Praxis, wird abgetippt und danach nur noch gelesen -
-- beim Planen einer Serie, beim Abrechnen und wenn das Kontingent zur Neige
-- geht.
--
-- Drei Tabellen:
--   prescribers          Verordner:innen. Berufliche Kontaktdaten Dritter,
--                        kein Patientenbezug (ANN-013).
--   prescriptions        die Verordnung selbst, an genau eine Patientin
--                        gebunden.
--   prescription_items   die Positionen: Heilmittel, verordnete und genutzte
--                        Menge.
--
-- Datenklasse (ANN-011): prescriptions und prescription_items gehoeren zur
-- klinischen Patientenakte - zehn Jahre nach Abschluss der Behandlung
-- (ADR-008). Sie tragen mit Diagnose und Leitsymptomatik Gesundheitsdaten.
--
-- Deshalb der wichtigste Teil dieser Migration: prescriptions und
-- prescription_items bekommen WEDER Policy NOCH Tabellenrecht. Sie sind ueber
-- den Anwendungspfad ausschliesslich durch die Lesefunktionen aus VER-002
-- erreichbar, und die liefern zwei verschiedene Projektionen - eine
-- organisatorische fuer alle Praxisrollen und eine klinische fuer die
-- therapeutischen Rollen (ADR-004: "Antworten der Anwendung sind
-- rollenabhaengige Projektionen"). Ein Tabellenrecht hier wuerde diese
-- Trennung an genau einer Stelle aushebeln - derselbe Grund wie bei
-- treatment_notes.
--
-- prescribers ist der Gegenfall: keine Patientendaten, keine Projektion noetig,
-- deshalb eine gewoehnliche Lesepolicy fuer die Praxisrollen. Geschrieben wird
-- auch dort nur ueber Funktionen.
--
-- Bewusst NICHT enthalten:
--   * Alles GKV: Heilmittelrichtlinie, Fristen- und Frequenzpruefung,
--     Kostentraeger, Zuzahlung, Blankoverordnung. Die Praxis rechnet privat ab
--     (PROJECT_PRINCIPLES.md 19, ADR-009).
--   * Der automatische Verbrauch des Kontingents aus durchgefuehrten Terminen.
--     Er gehoert an den Termin (CAL-007) und an die Leistungserfassung
--     (ABR-002); bis dahin wird die genutzte Menge von Hand gepflegt
--     (ANN-012).
--   * Der Verordnungsscan als Anhang (VER-004, braucht ADR-017).
--   * Ein Heilmittelkatalog. Das Heilmittel ist Freitext, bis ABR-001 den
--     versionierten Leistungskatalog bringt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- prescribers
--
-- ANN-013: Datenklasse und Frist. Berufliche Kontaktdaten Dritter, kein
-- Gesundheitsdatum und kein Patientenbezug - erst die Verordnung stellt ihn
-- her. Aufbewahrt, solange eine Verordnung darauf verweist; ueber
-- "on delete restrict" ist das strukturell erzwungen.
--
-- Datensparsam: nur was noetig ist, um die Person zu identifizieren und sie
-- fuer eine Folgeverordnung zu erreichen. Kein LANR, keine Betriebsstaetten-
-- nummer - das sind GKV-Merkmale und hier ohne Zweck.
-- -----------------------------------------------------------------------------
create table public.prescribers (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  title           text check (title is null or length(btrim(title)) between 1 and 60),
  given_name      text check (given_name is null or length(btrim(given_name)) between 1 and 100),
  family_name     text not null check (length(btrim(family_name)) between 1 and 100),
  practice_name   text check (practice_name is null or length(btrim(practice_name)) between 1 and 200),
  speciality      text check (speciality is null or length(btrim(speciality)) between 1 and 100),
  street          text check (street is null or length(btrim(street)) between 1 and 200),
  house_number    text check (house_number is null or length(btrim(house_number)) between 1 and 20),
  postal_code     text check (postal_code is null or length(btrim(postal_code)) between 2 and 12),
  city            text check (city is null or length(btrim(city)) between 1 and 100),
  phone           text check (phone is null or length(btrim(phone)) between 3 and 40),
  fax             text check (fax is null or length(btrim(fax)) between 3 and 40),
  email           text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

comment on table public.prescribers is
  'Verordner:innen (VER-001, ANN-013). Berufliche Kontaktdaten Dritter, kein Patientenbezug. Datenklasse: Stammdaten; aufbewahrt, solange eine Verordnung darauf verweist.';
comment on column public.prescribers.speciality is
  'Fachrichtung als Freitext, etwa "Orthopaedie". Bewusst kein Katalog: er waere Pflege ohne Nutzen.';

create index prescribers_organization_id_idx on public.prescribers (organization_id);

-- Dieselbe Person in derselben Praxis soll nicht zweimal entstehen. Name plus
-- Praxisname ist das praktikable Unterscheidungsmerkmal; zwei gleichnamige
-- Aerzt:innen in verschiedenen Praxen bleiben unterscheidbar.
create unique index prescribers_identity_idx on public.prescribers (
  organization_id,
  lower(btrim(family_name)),
  lower(btrim(coalesce(given_name, ''))),
  lower(btrim(coalesce(practice_name, '')))
);

revoke all on public.prescribers from anon, authenticated;
grant select on public.prescribers to authenticated;

alter table public.prescribers enable row level security;

-- Alle Praxisrollen lesen die Kartei. Office fordert Folgeverordnungen an und
-- braucht sie ebenso wie die therapeutischen Rollen (PROJECT_PRINCIPLES.md
-- 4.3). Patientenkonten bekommen nichts (4.6).
create policy prescribers_select_staff_only
  on public.prescribers for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.is_staff()
  );

-- -----------------------------------------------------------------------------
-- prescriptions
--
-- Klinische und organisatorische Felder stehen in einer Tabelle, aber die
-- Kommentare sagen bei jedem Feld, welcher Art es ist - die Lesefunktionen aus
-- VER-002 teilen genau entlang dieser Linie.
--
-- ANN-011: Die Bezeichnung des Heilmittels und die Mengen gelten als
-- organisatorisch; Diagnose, Leitsymptomatik, Therapieziel, Hinweise der
-- Verordner:in und die Empfehlung zum Verordnungsende gelten als klinisch.
-- -----------------------------------------------------------------------------
create table public.prescriptions (
  id                uuid primary key default extensions.gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  patient_id        uuid not null references public.patients (id) on delete restrict,
  prescriber_id     uuid not null references public.prescribers (id) on delete restrict,
  prescription_kind text not null
                      check (prescription_kind in ('first', 'follow_up')),
  issued_on         date not null,
  frequency_note    text check (frequency_note is null or length(btrim(frequency_note)) between 1 and 100),
  note              text check (note is null or length(btrim(note)) between 1 and 2000),
  diagnosis         text check (diagnosis is null or length(btrim(diagnosis)) between 1 and 2000),
  therapy_goal      text check (therapy_goal is null or length(btrim(therapy_goal)) between 1 and 2000),
  prescriber_note   text check (prescriber_note is null or length(btrim(prescriber_note)) between 1 and 2000),
  follow_up_recommendation text
                      check (follow_up_recommendation is null
                             or length(btrim(follow_up_recommendation)) between 1 and 2000),
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid
);

comment on table public.prescriptions is
  'Verordnung als Grundlage einer Behandlungsserie (VER-001, ANN-011). Enthaelt Gesundheitsdaten. Datenklasse: klinische Patientenakte, 10 Jahre nach Abschluss der Behandlung (ADR-008). Kein Tabellenrecht und keine Policy: erreichbar nur ueber die rollenabhaengigen Lesefunktionen (ADR-004).';
comment on column public.prescriptions.prescription_kind is
  'Erstverordnung oder Folgeverordnung. Bewusst nicht der GKV-Rezepttyp: die Praxis rechnet privat ab (ADR-009).';
comment on column public.prescriptions.frequency_note is
  'Verordnete Frequenz als Freitext, wie sie auf dem Papier steht ("2x pro Woche"). Organisatorisch. Bewusst keine Zahl: "1-2x" liesse sich sonst nicht erfassen.';
comment on column public.prescriptions.note is
  'Organisatorische Bemerkung zur Verordnung. Fuer alle Praxisrollen sichtbar - klinische Angaben gehoeren in die Felder darunter.';
comment on column public.prescriptions.diagnosis is
  'Diagnose beziehungsweise Leitsymptomatik der Verordnung. KLINISCH: nur owner, therapist, team_lead (PROJECT_PRINCIPLES.md 4.3).';
comment on column public.prescriptions.follow_up_recommendation is
  'Empfehlung der Therapeut:in zum Verordnungsende, von ihr selbst erfasst (ANN-014). KLINISCH. Ausdruecklich KEINE Systemempfehlung: die Anwendung erzeugt keine Therapieempfehlung (ADR-006 Punkt 4).';

create index prescriptions_patient_idx
  on public.prescriptions (organization_id, patient_id, issued_on desc, id desc);
create index prescriptions_prescriber_idx on public.prescriptions (prescriber_id);

-- Deny-by-default ohne jede Policy: der einzige Lesepfad sind die Funktionen
-- aus VER-002, der einzige Schreibpfad die Funktionen aus VER-003.
revoke all on public.prescriptions from anon, authenticated;
alter table public.prescriptions enable row level security;

-- -----------------------------------------------------------------------------
-- prescription_items
--
-- Eine Position je verordnetem Heilmittel. Die verordnete Menge steht auf dem
-- Papier; die genutzte pflegt die Praxis (ANN-012), bis CAL-007 den Termin und
-- ABR-002 die Leistung damit verknuepfen.
--
-- used_quantity <= prescribed_quantity ist eine Constraint und keine
-- Bildschirmpruefung: ein Kontingent, das ueber seine Verordnung hinaus
-- verbraucht wird, ist ein Abrechnungsfehler (PROJECT_PRINCIPLES.md 13).
-- -----------------------------------------------------------------------------
create table public.prescription_items (
  id                  uuid primary key default extensions.gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  prescription_id     uuid not null references public.prescriptions (id) on delete cascade,
  sort_order          smallint not null check (sort_order between 1 and 50),
  remedy              text not null check (length(btrim(remedy)) between 1 and 200),
  prescribed_quantity smallint not null check (prescribed_quantity between 1 and 500),
  used_quantity       smallint not null default 0 check (used_quantity >= 0),
  created_at          timestamptz not null default now(),
  created_by          uuid,
  unique (prescription_id, sort_order),
  constraint prescription_items_used_within_prescribed
    check (used_quantity <= prescribed_quantity)
);

comment on table public.prescription_items is
  'Positionen einer Verordnung: Heilmittel, verordnete und genutzte Menge (VER-001). Datenklasse wie die Verordnung. Kein Tabellenrecht und keine Policy.';
comment on column public.prescription_items.remedy is
  'Bezeichnung des Heilmittels als Freitext, etwa "Krankengymnastik". Ein versionierter Katalog kommt mit ABR-001; bis dahin waere eine Auswahlliste eine Erfindung ohne Preise.';
comment on column public.prescription_items.used_quantity is
  'Bereits genutzte Behandlungen dieser Position. ANN-012: bis CAL-007/ABR-002 von Hand gepflegt.';

create index prescription_items_prescription_idx
  on public.prescription_items (prescription_id, sort_order);

revoke all on public.prescription_items from anon, authenticated;
alter table public.prescription_items enable row level security;

-- -----------------------------------------------------------------------------
-- Wer darf was
--
-- Drei getrennte Funktionen statt einer, weil die drei Rechte fachlich
-- verschieden sind und sich auseinander entwickeln duerfen, ohne dass eine
-- Aenderung stillschweigend alle drei verschiebt.
-- -----------------------------------------------------------------------------

-- Die organisatorische Sicht: Kontingent, Verordner:in, Zeitraum. Alle vier
-- Praxisrollen. Office plant Termine und fordert Folgeverordnungen an (4.3).
create or replace function app.can_read_prescriptions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

-- Die klinische Sicht: Diagnose, Leitsymptomatik, Therapieziel, Empfehlung.
-- Dieselbe Rollenmenge wie bei der Behandlungsdokumentation - die Verordnung
-- oeffnet keinen zweiten Weg zu klinischem Freitext (4.3, 4.6).
create or replace function app.can_read_prescription_clinical()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead')
$$;

-- ANN-011: Schreiben duerfen nur die therapeutischen Rollen. Wer eine
-- Verordnung erfasst, tippt die Diagnose mit ab und sieht sie damit
-- zwangslaeufig; ein Schreibrecht fuer office waere ein Leserecht auf
-- klinischen Freitext durch die Hintertuer. Die datensparsamere Wahl (16).
create or replace function app.can_write_prescriptions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead')
$$;

-- Die Verordnerkartei ist keine Patientenakte: alle Praxisrollen duerfen sie
-- pflegen.
create or replace function app.can_manage_prescribers()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'therapist', 'team_lead', 'office')
$$;

comment on function app.can_read_prescriptions() is
  'Rollen mit Zugriff auf die organisatorische Sicht einer Verordnung: Kontingent, Verordner:in, Zeitraum (VER-001, ANN-011).';
comment on function app.can_read_prescription_clinical() is
  'Rollen mit Zugriff auf die klinischen Felder einer Verordnung. Deckungsgleich mit app.can_read_treatment_note() (PROJECT_PRINCIPLES.md 4.3).';
comment on function app.can_write_prescriptions() is
  'Rollen, die Verordnungen anlegen, aendern und loeschen duerfen (ANN-011). Ohne office: Erfassen setzt Lesen der Diagnose voraus.';

grant execute on function app.can_read_prescriptions()         to authenticated;
grant execute on function app.can_read_prescription_clinical() to authenticated;
grant execute on function app.can_write_prescriptions()        to authenticated;
grant execute on function app.can_manage_prescribers()         to authenticated;

-- -----------------------------------------------------------------------------
-- create_prescriber / update_prescriber
--
-- Wie bei den Patientenstammdaten: SECURITY-DEFINER-RPCs statt direkter
-- Schreibrechte. Die Organisation kommt aus der Sitzung, nie vom Client
-- (ADR-003).
--
-- Kein Auditereignis: die Verordnerkartei enthaelt keine Patientendaten und
-- steht nicht im Katalog aus ADR-010. created_by und updated_by halten fest,
-- wer sie gepflegt hat.
-- -----------------------------------------------------------------------------
create or replace function public.create_prescriber(
  p_family_name   text,
  p_given_name    text default null,
  p_title         text default null,
  p_practice_name text default null,
  p_speciality    text default null,
  p_street        text default null,
  p_house_number  text default null,
  p_postal_code   text default null,
  p_city          text default null,
  p_phone         text default null,
  p_fax           text default null,
  p_email         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_family text;
  v_id     uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_manage_prescribers() then
    raise exception 'not allowed to manage prescribers' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage prescribers' using errcode = '42501';
  end if;

  v_family := nullif(btrim(p_family_name), '');
  if v_family is null then
    raise exception 'family_name is required' using errcode = '22023';
  end if;

  insert into public.prescribers (
    organization_id, title, given_name, family_name, practice_name, speciality,
    street, house_number, postal_code, city, phone, fax, email,
    created_by, updated_by
  )
  values (
    v_org,
    nullif(btrim(p_title), ''),
    nullif(btrim(p_given_name), ''),
    v_family,
    nullif(btrim(p_practice_name), ''),
    nullif(btrim(p_speciality), ''),
    nullif(btrim(p_street), ''),
    nullif(btrim(p_house_number), ''),
    nullif(btrim(p_postal_code), ''),
    nullif(btrim(p_city), ''),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_fax), ''),
    nullif(btrim(p_email), ''),
    v_actor, v_actor
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_prescriber(text, text, text, text, text, text, text, text, text, text, text, text) is
  'Legt eine Verordner:in in der Organisation des Aufrufers an (VER-001).';

revoke all on function public.create_prescriber(text, text, text, text, text, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.create_prescriber(text, text, text, text, text, text, text, text, text, text, text, text)
  to authenticated;

create or replace function public.update_prescriber(
  p_prescriber_id uuid,
  p_family_name   text,
  p_given_name    text default null,
  p_title         text default null,
  p_practice_name text default null,
  p_speciality    text default null,
  p_street        text default null,
  p_house_number  text default null,
  p_postal_code   text default null,
  p_city          text default null,
  p_phone         text default null,
  p_fax           text default null,
  p_email         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_org    uuid;
  v_family text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_manage_prescribers() then
    raise exception 'not allowed to manage prescribers' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to manage prescribers' using errcode = '42501';
  end if;

  v_family := nullif(btrim(p_family_name), '');
  if v_family is null then
    raise exception 'family_name is required' using errcode = '22023';
  end if;

  -- Ziel ausschliesslich in der eigenen Organisation suchen: eine fremde und
  -- eine unbekannte ID sind nicht zu unterscheiden (PROJECT_PRINCIPLES.md 13).
  update public.prescribers
     set title         = nullif(btrim(p_title), ''),
         given_name    = nullif(btrim(p_given_name), ''),
         family_name   = v_family,
         practice_name = nullif(btrim(p_practice_name), ''),
         speciality    = nullif(btrim(p_speciality), ''),
         street        = nullif(btrim(p_street), ''),
         house_number  = nullif(btrim(p_house_number), ''),
         postal_code   = nullif(btrim(p_postal_code), ''),
         city          = nullif(btrim(p_city), ''),
         phone         = nullif(btrim(p_phone), ''),
         fax           = nullif(btrim(p_fax), ''),
         email         = nullif(btrim(p_email), ''),
         updated_at    = now(),
         updated_by    = v_actor
   where id = p_prescriber_id
     and organization_id = v_org;

  if not found then
    raise exception 'prescriber not found' using errcode = 'P0002';
  end if;

  return p_prescriber_id;
end;
$$;

comment on function public.update_prescriber(uuid, text, text, text, text, text, text, text, text, text, text, text, text) is
  'Aendert eine Verordner:in der eigenen Organisation (VER-001).';

revoke all on function public.update_prescriber(uuid, text, text, text, text, text, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.update_prescriber(uuid, text, text, text, text, text, text, text, text, text, text, text, text)
  to authenticated;
