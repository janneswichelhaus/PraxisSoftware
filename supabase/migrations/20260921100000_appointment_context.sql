-- =============================================================================
-- CAL-024: Der dritte Terminkontext an der vorhandenen Spalte
--
-- ADR-022 Punkt 2: Der Kontext ist eine Eigenschaft des Termins - und zwar die
-- VORHANDENE. `kind` bekommt den dritten Wert; es entsteht kein zweites Feld.
-- Zwei Spalten ueber dieselbe Sache waeren zwei Wahrheiten, sobald eine von
-- beiden falsch gesetzt wird (ADR-022, "Verworfen").
--
-- ZWEI FESTLEGUNGEN, DIE ADR-022 AUSDRUECKLICH DEM SPEC UEBERLAESST
-- (Abschnitt "Bewusst nicht Bestandteil dieser Entscheidung", ADR-014: das
-- konkrete Schema ist nicht Gegenstand eines ADR):
--
--   1. **Der Wert heisst `training`.** Damit steht er in der Sprachregelung
--      aus ADR-021 Punkt 9, die die Bereiche `therapy` und `training` nennt.
--
--   2. **Die Bestandswerte `treatment` und `event` werden NICHT umbenannt.**
--      Die offene Folgefrage des ADR ist damit beantwortet, und zwar mit nein.
--      Begruendung: Die Umbenennung traegt keinen fachlichen Gehalt - sie
--      schriebe rund 2400 Zeilen Funktionsruempfe in acht Migrationen neu und
--      legte diesen mechanischen Massen-Diff ueber genau die Constraints,
--      Policies und Riegel, die hier geprueft werden muessen. Und sie loest
--      die Gefahr nicht, um die es geht: `where kind <> 'internal'` faengt den
--      Trainingstermin genauso falsch ein wie `where kind <> 'event'`. Was
--      davor schuetzt, sind die Constraints unten und die Filter in CAL-026,
--      nicht der Bezeichner. Die Umbenennung bleibt mechanisch und steht als
--      eigene Zeile in docs/development/ROADMAP.md.
--
-- WARUM DER TERMIN EINE ZWEITE VERKNUEPFUNG BEKOMMT UND KEINE GETEILTE.
-- `patient_id` zeigt auf das Behandlungsverhaeltnis, die neue Spalte auf das
-- Trainingsverhaeltnis (ADR-022 Punkt 3). Eine gemeinsame Spalte mit
-- wechselndem Ziel gaebe es nur als untypisierte Kennung ohne Fremdschluessel
-- - dann haelt die Datenbank nichts mehr, und ADR-021 Punkt 3 (die gemeinsame
-- Identitaet ist der einzige geteilte Punkt) waere eine Absprache statt einer
-- Zusicherung.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Mandantengrenze deklarativ statt per Trigger
--
-- Ein Termin der Organisation A darf nicht auf ein Trainingsverhaeltnis der
-- Organisation B zeigen (ADR-003). Durchgesetzt wird das mit einem
-- zusammengesetzten Fremdschluessel und nicht mit einem Trigger: Der
-- Fremdschluessel prueft bei jedem Schreibweg, auch bei einem, den es heute
-- noch nicht gibt, und er kann nicht vergessen werden.
--
-- Dafuer braucht die Zieltabelle einen passenden eindeutigen Schluessel. Er
-- ist fachlich redundant - `id` ist bereits Primaerschluessel -, aber genau
-- das macht ihn kostenlos: er fuegt keine Regel hinzu, er macht eine
-- vorhandene fuer den Fremdschluessel sichtbar.
-- -----------------------------------------------------------------------------
alter table public.training_relationships
  add constraint training_relationships_id_organization_key unique (id, organization_id);

comment on constraint training_relationships_id_organization_key on public.training_relationships is
  'Zielschluessel fuer zusammengesetzte Fremdschluessel, die die Mandantengrenze mittragen (ADR-003). Fachlich redundant zum Primaerschluessel.';

-- -----------------------------------------------------------------------------
-- 2. Die zweite personenseitige Verknuepfung am Termin (ADR-022 Punkt 3)
--
-- `on delete restrict` wie bei `patient_id`: Ein Verhaeltnis faellt nicht,
-- solange Termine daran haengen. Der Loeschlauf raeumt beides in der richtigen
-- Reihenfolge (CAL-026).
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column training_relationship_id uuid;

alter table public.appointments
  add constraint appointments_training_relationship_fkey
    foreign key (training_relationship_id, organization_id)
    references public.training_relationships (id, organization_id)
    on delete restrict;

comment on column public.appointments.training_relationship_id is
  'Das Trainingsverhaeltnis, an dem ein Trainingstermin haengt (ADR-022 Punkt 3). Genau bei kind = training gesetzt, sonst leer; die Mandantengrenze traegt der zusammengesetzte Fremdschluessel mit.';

create index appointments_training_relationship_idx
  on public.appointments (training_relationship_id)
  where training_relationship_id is not null;

-- -----------------------------------------------------------------------------
-- 3. Drei Kontexte an einer Spalte (ADR-022 Punkt 2)
-- -----------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_kind_values;
alter table public.appointments
  add constraint appointments_kind_values check (kind in ('treatment', 'event', 'training'));

comment on column public.appointments.kind is
  'Terminkontext (ADR-022 Punkt 2): treatment = Behandlungstermin mit Patient:in; event = internes Ereignis des Praxisbetriebs ohne Gegenueber; training = Trainingstermin an einem Trainingsverhaeltnis. Genau ein Kontext je Termin, unveraenderlich ab Anlage (Punkt 10). Die Bezeichner treatment und event sind Bestandswerte und bewusst nicht umbenannt.';

-- -----------------------------------------------------------------------------
-- 4. Die Fallunterscheidung ueber drei Zweige
--
-- Das ist die Constraint aus CAL-015b, um den dritten Zweig erweitert. Sie
-- traegt ADR-022 Punkt 3 UND Punkt 4 in einer Pruefung, weil beide dasselbe
-- sagen: An welchem Verhaeltnis ein Termin haengt, entscheidet der Kontext -
-- und die Behandlungsgrundlage ist eine klinische Tabelle (ADR-020 Punkt 4),
-- an der ein Trainingstermin nichts zu suchen hat (ADR-021 Punkt 5).
--
-- Schemaseitig unmoeglich sind damit:
--   - ein Behandlungstermin ohne Patient:in
--   - ein Trainingstermin mit Patient:in
--   - ein Termin, der BEIDE Verhaeltnisse traegt
--   - ein interner Termin mit einem Gegenueber
--   - ein Trainingstermin an einer Behandlungsgrundlage
-- -----------------------------------------------------------------------------
alter table public.appointments drop constraint appointments_kind_fields;
alter table public.appointments
  add constraint appointments_kind_fields check (
    (kind = 'treatment'
      and patient_id               is not null
      and training_relationship_id is null
      and title                    is null)
    or (kind = 'event'
      and patient_id               is null
      and training_relationship_id is null
      and treatment_basis_id       is null
      and title                    is not null
      and length(btrim(title)) between 1 and 120)
    or (kind = 'training'
      and patient_id               is null
      and training_relationship_id is not null
      and treatment_basis_id       is null
      and title                    is null)
  );

comment on constraint appointments_kind_fields on public.appointments is
  'Je Kontext genau ein Verhaeltnis, beim internen Termin keines (ADR-022 Punkt 3); die Behandlungsgrundlage bleibt ausserhalb von therapy leer (Punkt 4).';

-- -----------------------------------------------------------------------------
-- 5. Der Kanal bleibt eine eigene Dimension (ADR-022 Punkt 9)
--
-- Hier steht bewusst KEINE Aenderung. `appointments_event_type` schraenkt
-- allein den internen Termin auf practice und video ein; fuer `training` sind
-- damit alle drei Kanaele zulaessig - Online Coaching ist ein Trainingstermin
-- ueber Video, Personal Training zu Hause einer als Hausbesuch. Dass das gilt,
-- haelt ein Test fest und nicht dieser Kommentar.
--
-- Ebenfalls unveraendert: `appointments_fee_basis_values` bindet den
-- Gebuehrenanlass weiter an kind = 'treatment'. Ob der Anlass aus ADR-018
-- Punkt 8 auch im Dienstvertrag ueber Training entsteht, ist eine Vertrags-
-- und AGB-Frage des Projektinhabers (offene Folgefrage in ADR-022); bis sie
-- beantwortet ist, gilt die Regel unveraendert nur fuer die Behandlung. Der
-- Schreibweg zieht in CAL-026 nach, die Constraint sagt es schon heute.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 6. Der Kontext steht mit dem Anlegen fest (ADR-022 Punkt 10)
--
-- Kein freier Wechsel ueber die Tabelle, dieselbe Regel wie fuer den Status
-- (ADR-018 Punkt 2). Ein Kontextwechsel waere ein Wechsel des
-- Rechtsverhaeltnisses, der Rechtsgrundlage, der Aufbewahrungsfrist und der
-- Rolle, die den Termin sehen darf; ein falsch angelegter Termin wird abgesagt
-- und neu angelegt.
--
-- Heute aendert kein Schreibweg `kind` - der Riegel haelt also nichts auf, was
-- es gibt. Genau darum steht er jetzt: Er haelt den naechsten Schreibweg auf,
-- der es versehentlich taete, und er kostet nichts.
-- -----------------------------------------------------------------------------
create function public.appointments_context_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'appointment context cannot be changed' using errcode = '22023';
  end if;

  if new.training_relationship_id is distinct from old.training_relationship_id then
    raise exception 'training relationship cannot be changed' using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.appointments_context_guard() is
  'Der Terminkontext und das Verhaeltnis dahinter stehen mit dem Anlegen fest (ADR-022 Punkt 10). Ein falsch angelegter Termin wird abgesagt und neu angelegt, nicht umgedeutet.';

create trigger appointments_context_guard
  before update on public.appointments
  for each row execute function public.appointments_context_guard();
