-- =============================================================================
-- CAL-025: Die Trainingsgrundlage als eigene Klammer
--
-- ADR-022 Punkt 5: Die Trainingsgrundlage ist eine EIGENE Klammer, keine
-- dritte Bauart der Behandlungsgrundlage.
--
-- WARUM NICHT DIE DRITTE BAUART IN `treatment_bases`. ADR-020 hat die zweite
-- Tabelle mit gutem Grund verworfen - aber dieses Argument laeuft INNERHALB
-- eines Rechtsverhaeltnisses: Verordnung und Selbstzahler teilen Datenklasse,
-- Frist, Rollenschnitt und Planungsmechanik. Hier ist keines der vier gleich.
-- Eine dritte Bauart fuehrte Rechtsgrundlage, Datenklasse und Frist wieder an
-- derselben Zeile zusammen - genau der Fehler, den ADR-021 fuer das
-- Verhaeltnis bereits verworfen hat. ADR-020 bleibt unveraendert und gilt
-- fortan ausdruecklich fuer `therapy`.
--
-- KEINE KLINISCHEN FELDER. Keine Diagnose, keine Leitsymptomatik, kein
-- Therapieziel, keine Verordner:in (ADR-022 Punkt 5). Die Tabelle traegt die
-- Klammer und sonst nichts; dass sie es tut, haelt ein Test fest.
--
-- PFLICHT IST DAS VERHAELTNIS, NICHT DIE KLAMMER. Eine Einzelstunde ohne
-- vereinbarte Anzahl bleibt moeglich, und eine Klammer auf Vorrat wird nicht
-- verlangt (ADR-014). Deshalb ist `training_basis_id` am Termin nullbar,
-- `training_relationship_id` aber nicht.
--
-- DREI FESTLEGUNGEN, DIE ADR-022 DEM SPEC UEBERLAESST (ADR-014):
--
--   1. **Bezeichner** `training_bases` mit `training_basis_id`, gebaut wie das
--      Paar aus GRD-001. Die Klammer heisst nach dem, was sie ist.
--   2. **Die vereinbarte Anzahl heisst `agreed_quantity`** und ist NULLBAR -
--      anders als `prescribed_quantity` an der Behandlungsgrundlage, die
--      Pflicht ist. Das ist Punkt 5 woertlich: die Einzelstunde bleibt
--      moeglich. Ein Pflichtfeld mit Vorbelegung 1 haette aus jeder
--      Einzelstunde eine Vereinbarung ueber einen Termin gemacht, die niemand
--      getroffen hat.
--   3. **Kein `used_quantity` und keine Deckungsregel.** Die Constraint
--      `used_quantity <= prescribed_quantity` schuetzt an der
--      Behandlungsgrundlage die Abrechnung (ADR-020 Punkt 5, 13). Was im
--      Training abgerechnet wird, entscheidet ABR-EPIC-005; bis dahin waere
--      eine Zaehlung ohne Abrechnung ein Feature auf Vorrat (ADR-014).
-- =============================================================================

create table public.training_bases (
  id                       uuid primary key default extensions.gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete restrict,
  training_relationship_id uuid not null,
  status                   text not null default 'active'
                             check (status in ('active', 'concluded')),
  started_on               date not null,
  agreed_quantity          integer
                             check (agreed_quantity is null or agreed_quantity between 1 and 200),
  created_at               timestamptz not null default now(),
  created_by               uuid,
  updated_at               timestamptz not null default now(),
  updated_by               uuid,

  -- Die Mandantengrenze deklarativ, wie am Termin (ADR-003).
  constraint training_bases_relationship_fkey
    foreign key (training_relationship_id, organization_id)
    references public.training_relationships (id, organization_id)
    on delete restrict,

  -- Zielschluessel fuer den zusammengesetzten Fremdschluessel am Termin: Er
  -- traegt das Verhaeltnis mit und macht damit schemaseitig unmoeglich, dass
  -- ein Termin an einer Klammer eines FREMDEN Verhaeltnisses haengt.
  constraint training_bases_id_relationship_key
    unique (id, training_relationship_id)
);

comment on table public.training_bases is
  'Trainingsgrundlage: die Planungsklammer des Trainingsverhaeltnisses (ADR-022 Punkt 5). Eigene Klammer neben public.treatment_bases, ausdruecklich KEINE dritte Bauart davon. Enthaelt KEINE klinischen Felder. Datenklasse: Trainingsverhaeltnis, drei Jahre ab Vertragsende (ADR-021 Punkt 4, ADR-008).';
comment on column public.training_bases.training_relationship_id is
  'Das Verhaeltnis, zu dem die Klammer gehoert. Bewusst kein Verweis auf public.patients und keiner auf public.treatment_bases (ADR-021 Punkt 3).';
comment on column public.training_bases.started_on is
  'Tag der Vereinbarung. Gegenstueck zu treatment_bases.issued_on, das bei einem Selbstzahler dasselbe bedeutet (ADR-020 Punkt 3).';
comment on column public.training_bases.agreed_quantity is
  'Vereinbarte Anzahl moeglicher Termine. NULLBAR - die Einzelstunde ohne Vereinbarung bleibt moeglich (ADR-022 Punkt 5). Keine Deckungsregel und kein used_quantity: was im Training abgerechnet wird, entscheidet ABR-EPIC-005.';
comment on column public.training_bases.created_by is
  'auth.users.id des handelnden Accounts. Ohne FK wie ueberall im Fundament (ADR-014).';

create index training_bases_relationship_idx
  on public.training_bases (training_relationship_id);
create index training_bases_organization_idx
  on public.training_bases (organization_id);

-- -----------------------------------------------------------------------------
-- RLS: derselbe Rollenschnitt wie am Verhaeltnis
--
-- Die Klammer sagt nicht mehr ueber eine Person als das Verhaeltnis selbst -
-- sie sagt weniger. Wer das Verhaeltnis lesen darf, darf auch die Klammer
-- lesen: owner, trainer und office (LEI-003, PROJECT_PRINCIPLES.md §4.8/§4.9).
-- Die therapeutischen Rollen stehen ausdruecklich nicht dabei; der offene
-- Zugriff aller Therapeut:innen auf alle Akten gilt INNERHALB des
-- Behandlungsverhaeltnisses (ADR-021 Punkt 6).
--
-- Geschrieben wird hier von niemandem: Schreibwege entstehen mit dem
-- Trainingsbereich (E18 Schritt 7), nicht auf Vorrat.
-- -----------------------------------------------------------------------------
alter table public.training_bases enable row level security;
revoke all on public.training_bases from anon, authenticated;
grant select on public.training_bases to authenticated;

create policy training_bases_select_scoped
  on public.training_bases for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_training_relationships()
  );

comment on policy training_bases_select_scoped on public.training_bases is
  'Die Klammer folgt dem Verhaeltnis: wer das Trainingsverhaeltnis lesen darf, liest auch seine Grundlagen (ADR-021 Punkt 6, LEI-003).';

-- -----------------------------------------------------------------------------
-- Die Klammer am Termin (ADR-022 Punkt 5)
--
-- Nullbar, und ausschliesslich am Trainingstermin. Der zusammengesetzte
-- Fremdschluessel nimmt `training_relationship_id` mit: Damit kann ein Termin
-- nicht an der Klammer eines anderen Verhaeltnisses haengen - die Klammer
-- gehoert derselben Person wie der Termin, oder sie gehoert nicht dazu.
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column training_basis_id uuid;

alter table public.appointments
  add constraint appointments_training_basis_fkey
    foreign key (training_basis_id, training_relationship_id)
    references public.training_bases (id, training_relationship_id)
    on delete set null;

comment on column public.appointments.training_basis_id is
  'Optionale Trainingsgrundlage des Termins (ADR-022 Punkt 5). Pflicht ist das Verhaeltnis, nicht die Klammer - die Einzelstunde bleibt moeglich. Der zusammengesetzte Fremdschluessel bindet die Klammer an dasselbe Verhaeltnis wie den Termin.';

create index appointments_training_basis_idx
  on public.appointments (training_basis_id)
  where training_basis_id is not null;

-- Ausserhalb von `training` bleibt sie leer - dieselbe Aussage wie Punkt 4
-- fuer die Behandlungsgrundlage, nur in die andere Richtung. Eine eigene
-- Constraint statt eines vierten Zweiges in `appointments_kind_fields`: Die
-- Klammer ist optional, die Verhaeltnisse sind es nicht, und zwei Regeln in
-- einer Pruefung waeren bei einem Verstoss nicht mehr auseinanderzuhalten.
alter table public.appointments
  add constraint appointments_training_basis_scope check (
    training_basis_id is null or kind = 'training'
  );

-- -----------------------------------------------------------------------------
-- Aufbewahrung: dieselbe Klasse wie das Verhaeltnis (ADR-008)
--
-- Die Klammer traegt keinen eigenen Anker - sie faellt mit dem Verhaeltnis,
-- an dem sie haengt, und zwar vor ihm (FK restrict). Drei Jahre ab
-- Vertragsende, gesetzlich gepraegt ueber Par. 195 BGB; die Klasse steht seit
-- LEI-002.
-- -----------------------------------------------------------------------------
insert into public.retention_assignments
  (table_name, class_key, deletion_mode, scope_note, sort_order) values

  ('training_bases', 'trainingsverhaeltnis', 'ueber_elterndatensatz',
   'Planungsklammern des Trainingsverhaeltnisses. Fallen mit dem Verhaeltnis und werden im Lauf vor ihm geloescht (FK restrict, CAL-026).', 56);
