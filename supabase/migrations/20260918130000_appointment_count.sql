-- VER-EPIC-002: Die Anzahl moeglicher Termine steht an der Grundlage
--
-- Bisher war das Kontingent die **Summe der Positionen**: eine Verordnung ueber
-- sechs Termine mit KG-Doppelbehandlung, MT-Doppelbehandlung und Hausbesuch bot
-- achtzehn Termine an. Das ist keine Rundungsfrage, sondern die falsche Groesse
-- - eine Terminzahl zaehlt Behandlungstermine, keine Heilmittel
-- (docs/development/VER-EPIC-002.md, "Mengen und Bestand erhalten").
--
-- Diese Migration trennt die beiden Zahlen (ANN-064):
--
--   * `treatment_bases.appointment_count` traegt die "Anzahl moeglicher
--     Termine" - verordnet beim Rezept, vereinbart beim Selbstzahler
--     (ADR-020 Punkt 5). Sie ist die Zahl, gegen die geplant wird.
--   * `treatment_base_items.prescribed_quantity` bleibt die **Leistungsmenge**
--     je Heilmittel. Sie wird fuer spaetere Leistungen gebraucht (ABR-EPIC-001)
--     und deshalb nicht angetastet.
--
-- Bestandswerte bleiben erhalten: Die Terminzahl einer vorhandenen Zeile wird
-- aus der groessten Positionsmenge abgeleitet - nie aus ihrer Summe. Damit
-- sinkt das Angebot der Serienplanung, es steigt nie, und keine Positionsmenge
-- geht verloren.
--
-- Dazu zwei Folgeaenderungen aus derselben Vorgabe:
--
--   * "Genutzt" entfaellt als manuelle Eingabe. Der Schreibpfad nimmt Mengen
--     nur noch entgegen, wenn sie ausdruecklich mitgeschickt werden; sonst
--     bleibt der Bestand, wie er ist (ANN-064 loest ANN-012 ab).
--   * Therapieziel, Hinweis der Verordner:in und Empfehlung zum
--     Verordnungsende verlassen das Formular. Der Schreibpfad nimmt sie nicht
--     mehr entgegen und ruehrt die Spalten nicht an - ausser beim Wechsel auf
--     "Selbstzahler", wo ADR-020 Punkt 4 sie leer verlangt. Das erzwingt ab
--     jetzt die Datenbank und nicht mehr der Aufrufer.

-- -----------------------------------------------------------------------------
-- 1. Die Terminzahl als eigene Spalte
-- -----------------------------------------------------------------------------

alter table public.treatment_bases
  add column appointment_count integer;

-- Ableitung fuer den Bestand: die groesste verordnete Positionsmenge. Bei der
-- einzelnen Position - dem heutigen Regelfall - ist das genau die bisherige
-- Zahl. Bei einer Kombination ist es die Zahl, die eine Praxis meint, wenn sie
-- "zehn Termine, davon sechs mit MT" sagt. Ohne Position bleibt 1: eine
-- Grundlage ohne Heilmittel kann es nach write_treatment_base_items nicht
-- geben, der Fallwert haelt die Spalte trotzdem gueltig.
update public.treatment_bases b
   set appointment_count = greatest(
     coalesce(
       (select max(i.prescribed_quantity)
          from public.treatment_base_items i
         where i.treatment_basis_id = b.id),
       1),
     1);

alter table public.treatment_bases
  alter column appointment_count set not null;

alter table public.treatment_bases
  add constraint treatment_bases_appointment_count_check
  check (appointment_count between 1 and 500);

comment on column public.treatment_bases.appointment_count is
  'Anzahl moeglicher Termine dieser Grundlage - verordnet beim Rezept, vereinbart beim Selbstzahler (ADR-020 Punkt 5, VER-EPIC-002, ANN-064). Eine Terminzahl, keine Summe von Heilmitteln: die Leistungsmenge steht an der Position.';

comment on column public.treatment_base_items.prescribed_quantity is
  'Leistungsmenge dieses Heilmittels (ANN-064). Seit VER-EPIC-002 ausdruecklich NICHT die Terminzahl - die steht in treatment_bases.appointment_count.';

comment on column public.treatment_base_items.used_quantity is
  'Genutzte Leistungsmenge. Seit VER-EPIC-002 keine Eingabe der Oberflaeche mehr; der Bestand bleibt stehen, fortgeschrieben wird sie mit ABR-002 (ANN-064 loest ANN-012 ab).';

-- Eigene Pruefung neben der Constraint, damit ein Tippfehler im Formular
-- dieselbe sprechende Meldung erzeugt wie jede andere Eingabepruefung des
-- Schreibpfads - und nicht einen rohen Constraint-Verstoss (vgl.
-- app.assert_treatment_basis_input).
create or replace function app.assert_appointment_count(p_appointment_count integer)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if p_appointment_count is null then
    raise exception 'appointment count is required' using errcode = '22023';
  end if;

  if p_appointment_count < 1 or p_appointment_count > 500 then
    raise exception 'appointment count out of range' using errcode = '22023';
  end if;
end;
$$;

comment on function app.assert_appointment_count(integer) is
  'Prueft die Anzahl moeglicher Termine einer Behandlungsgrundlage: Pflicht, zwischen 1 und 500 (VER-EPIC-002, ANN-064).';

revoke all on function app.assert_appointment_count(integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Klinische Felder beim Selbstzahler: von der Datenbank erzwungen
-- -----------------------------------------------------------------------------
--
-- ADR-020 Punkt 4 verlangt sie beim Selbstzahler leer. Bisher sorgte dafuer der
-- Aufrufer, indem er null mitschickte. Seit VER-EPIC-002 schickt das Formular
-- drei dieser Felder gar nicht mehr mit - dann darf die Regel nicht mehr am
-- Aufrufer haengen (PROJECT_PRINCIPLES.md 4.7).

update public.treatment_bases
   set diagnosis                = null,
       therapy_goal             = null,
       prescriber_note          = null,
       follow_up_recommendation = null
 where treatment_basis_kind = 'self_pay'
   and (diagnosis is not null or therapy_goal is not null
        or prescriber_note is not null or follow_up_recommendation is not null);

alter table public.treatment_bases
  add constraint treatment_bases_clinical_only_for_prescription
  check (
    treatment_basis_kind <> 'self_pay'
    or (diagnosis is null
        and therapy_goal is null
        and prescriber_note is null
        and follow_up_recommendation is null)
  );

comment on constraint treatment_bases_clinical_only_for_prescription on public.treatment_bases is
  'ADR-020 Punkt 4: Diagnose, Therapieziel, Verordnerhinweis und Empfehlung gehoeren zur Verordnung. Beim Selbstzahler bleiben sie leer - unabhaengig davon, welchen Schreibweg jemand nimmt.';

-- -----------------------------------------------------------------------------
-- 3. Das Kontingent zaehlt Termine
-- -----------------------------------------------------------------------------

create or replace function app.treatment_basis_slot_counts(
  p_treatment_basis_id uuid,
  p_organization_id uuid,
  OUT prescribed integer,
  OUT used integer,
  OUT planned integer,
  OUT remaining integer
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Die Terminzahl kommt jetzt aus der Grundlage selbst (ANN-064). Vorher war
  -- sie die Summe der Positionsmengen - und damit bei jeder Kombination aus
  -- mehreren Heilmitteln zu gross.
  select b.appointment_count
    into prescribed
  from public.treatment_bases b
  where b.id = p_treatment_basis_id
    and b.organization_id = p_organization_id;

  -- Auch "genutzt" ist eine Terminzahl: Ein Termin nutzt jedes Heilmittel der
  -- Grundlage einmal, deshalb zaehlt die am weitesten fortgeschrittene
  -- Position und nicht die Summe. Bei einer einzelnen Position - dem
  -- heutigen Bestand - ist das unveraendert ihre genutzte Menge.
  select coalesce(max(i.used_quantity), 0)
    into used
  from public.treatment_base_items i
  where i.treatment_basis_id = p_treatment_basis_id;

  select count(*)
    into planned
  from public.appointments a
  where a.treatment_basis_id = p_treatment_basis_id
    and a.organization_id = p_organization_id
    and a.status <> 'cancelled';

  remaining := greatest(coalesce(prescribed, 0) - greatest(coalesce(used, 0), planned), 0);
end;
$$;

comment on function app.treatment_basis_slot_counts(uuid, uuid) is
  'Kontingent einer Behandlungsgrundlage, gezaehlt in Terminen (VER-EPIC-002, ANN-064): moegliche Termine aus appointment_count, genutzte aus der groessten Positionsmenge, verplante aus den nicht abgesagten Terminen, offen ist die Differenz zum groesseren der beiden (ANN-038). Nur fuer die serverseitigen Lese- und Schreibpfade.';

revoke all on function app.treatment_basis_slot_counts(uuid, uuid) from public, anon, authenticated;

comment on function public.get_treatment_basis_slots(uuid) is
  'Terminzahl und Frequenz einer Behandlungsgrundlage fuer die Serienplanung (CAL-007, ANN-064). Ohne klinische Felder.';

comment on function public.list_patient_treatment_basis_slots(uuid) is
  'Terminzahlen je Behandlungsgrundlage einer Patient:in (AKTE-002, ANN-064): moeglich, genutzt, verplant, noch bevorstehend und offen. Rein organisatorisch - die klinischen Felder bleiben list_patient_treatment_bases_clinical vorbehalten.';

-- -----------------------------------------------------------------------------
-- 4. Positionen: Auswahl statt Mengeneingabe
-- -----------------------------------------------------------------------------

create or replace function app.write_treatment_base_items(
  p_treatment_basis_id uuid,
  p_organization_id uuid,
  p_actor uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eintrag       jsonb;
  v_position      smallint := 0;
  v_remedy        text;
  v_terminzahl    integer;
  v_verordnet_num numeric;
  v_genutzt_num   numeric;
  v_verordnet     integer;
  v_genutzt       integer;
  v_bestand       record;
  v_id            uuid;
  v_behalten      uuid[] := array[]::uuid[];
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'at least one treatment basis item is required' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many treatment basis items' using errcode = '22023';
  end if;

  select b.appointment_count into v_terminzahl
  from public.treatment_bases b
  where b.id = p_treatment_basis_id
    and b.organization_id = p_organization_id;

  if v_terminzahl is null then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  for v_eintrag in select * from jsonb_array_elements(p_items) loop
    v_position := v_position + 1;

    v_remedy := nullif(btrim(v_eintrag ->> 'remedy'), '');
    if v_remedy is null then
      raise exception 'remedy is required' using errcode = '22023';
    end if;

    -- Eine mitgelieferte id zaehlt nur, wenn sie zu dieser Grundlage gehoert.
    select i.id, i.prescribed_quantity, i.used_quantity
      into v_bestand
    from public.treatment_base_items i
    where i.treatment_basis_id = p_treatment_basis_id
      and i.id = nullif(v_eintrag ->> 'id', '')::uuid;

    -- Seit VER-EPIC-002 schickt die Oberflaeche nur noch die **Auswahl**: Ein
    -- Heilmittel ist angehakt oder nicht. Mengen sind damit optional, und ein
    -- fehlender Wert heisst ausdruecklich "unveraendert lassen" - nicht
    -- "null". Eine Bestandsmenge darf durch das vereinfachte Formular weder
    -- verloren gehen noch still umgedeutet werden (ANN-064). Eine **neue**
    -- Position erbt die Terminzahl als Leistungsmenge: Jeder moegliche Termin
    -- bringt dieses Heilmittel einmal mit.
    if v_eintrag ? 'prescribed_quantity' and jsonb_typeof(v_eintrag -> 'prescribed_quantity') <> 'null' then
      if jsonb_typeof(v_eintrag -> 'prescribed_quantity') <> 'number' then
        raise exception 'quantities must be numbers' using errcode = '22023';
      end if;
      -- Ueber numeric statt direkt ueber integer lesen: eine Kommazahl
      -- ("6.5") soll dieselbe sprechende Meldung wie ein Text ausloesen, statt
      -- eines rohen "invalid input syntax for type integer"-Fehlers, den der
      -- direkte Cast einer Dezimalzahl auf integer wirft.
      v_verordnet_num := (v_eintrag ->> 'prescribed_quantity')::numeric;
      if v_verordnet_num <> trunc(v_verordnet_num) then
        raise exception 'quantities must be whole numbers' using errcode = '22023';
      end if;
      v_verordnet := v_verordnet_num::integer;
    elsif v_bestand.id is not null then
      v_verordnet := v_bestand.prescribed_quantity;
    else
      v_verordnet := v_terminzahl;
    end if;

    if v_eintrag ? 'used_quantity' and jsonb_typeof(v_eintrag -> 'used_quantity') <> 'null' then
      if jsonb_typeof(v_eintrag -> 'used_quantity') <> 'number' then
        raise exception 'quantities must be numbers' using errcode = '22023';
      end if;
      v_genutzt_num := (v_eintrag ->> 'used_quantity')::numeric;
      if v_genutzt_num <> trunc(v_genutzt_num) then
        raise exception 'quantities must be whole numbers' using errcode = '22023';
      end if;
      v_genutzt := v_genutzt_num::integer;
    elsif v_bestand.id is not null then
      v_genutzt := v_bestand.used_quantity;
    else
      v_genutzt := 0;
    end if;

    if v_verordnet < 1 or v_verordnet > 500 then
      raise exception 'prescribed quantity out of range' using errcode = '22023';
    end if;

    if v_genutzt < 0 or v_genutzt > v_verordnet then
      raise exception 'used quantity out of range' using errcode = '22023';
    end if;

    v_id := v_bestand.id;

    if v_id is null then
      insert into public.treatment_base_items (
        organization_id, treatment_basis_id, sort_order, remedy,
        prescribed_quantity, used_quantity, created_by
      )
      values (
        p_organization_id, p_treatment_basis_id, v_position, v_remedy,
        v_verordnet, v_genutzt, p_actor
      )
      returning id into v_id;
    else
      update public.treatment_base_items
         set sort_order          = v_position,
             remedy              = v_remedy,
             prescribed_quantity = v_verordnet,
             used_quantity       = v_genutzt
       where id = v_id;
    end if;

    v_behalten := array_append(v_behalten, v_id);
  end loop;

  -- Was nicht mehr im Feld steht, ist entfernt worden.
  delete from public.treatment_base_items i
  where i.treatment_basis_id = p_treatment_basis_id
    and not (i.id = any (v_behalten));
end;
$$;

comment on function app.write_treatment_base_items(uuid, uuid, uuid, jsonb) is
  'Schreibt die Positionen einer Behandlungsgrundlage aus dem JSON-Feld: prueft die Bezeichnung, vergibt die Reihenfolge und entfernt weggefallene Positionen (VER-003, VER-EPIC-002). Mengen sind optional - fehlt eine, bleibt die des Bestands stehen, eine neue Position erbt die Terminzahl (ANN-064).';

revoke all on function app.write_treatment_base_items(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Schreibpfade: Terminzahl rein, drei Freitexte raus
-- -----------------------------------------------------------------------------
--
-- Signaturaenderung, deshalb drop und neu: `create or replace` legte sonst
-- eine zweite Ueberladung an, und PostgREST haette die Wahl.

drop function public.create_treatment_basis(uuid, uuid, text, date, jsonb, text, text, text, text, text, text);

create function public.create_treatment_basis(
  p_patient_id uuid,
  p_prescriber_id uuid,
  p_treatment_basis_kind text,
  p_issued_on date,
  p_appointment_count integer,
  p_items jsonb,
  p_frequency_note text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text,
  p_diagnosis text DEFAULT NULL::text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_org   uuid;
  v_id    uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. ANN-011: ohne office.
  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  -- Patient ausschliesslich in der eigenen Organisation suchen.
  if not exists (
    select 1 from public.patients pa
    where pa.id = p_patient_id and pa.organization_id = v_org
  ) then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  perform app.assert_treatment_basis_input(v_org, p_prescriber_id, p_treatment_basis_kind, p_issued_on);
  perform app.assert_appointment_count(p_appointment_count);

  insert into public.treatment_bases (
    organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on,
    appointment_count, frequency_note, note, diagnosis, created_by, updated_by
  )
  values (
    v_org, p_patient_id, p_prescriber_id, p_treatment_basis_kind, p_issued_on,
    p_appointment_count,
    nullif(btrim(p_frequency_note), ''),
    nullif(btrim(p_note), ''),
    -- ADR-020 Punkt 4: Die Diagnose gehoert zur Verordnung. Beim Selbstzahler
    -- bleibt sie leer, auch wenn ein Aufrufer sie mitschickt.
    case when p_treatment_basis_kind = 'self_pay'
         then null else nullif(btrim(p_diagnosis), '') end,
    v_actor, v_actor
  )
  returning id into v_id;

  perform app.write_treatment_base_items(v_id, v_org, v_actor, p_items);

  -- Auditeintrag ohne klinische Inhalte: Akteur, Organisation,
  -- Bezug zur Grundlage, Patientenbezug, Zeitpunkt und Ergebnis (ADR-010).
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.created', 'treatment_basis', v_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', p_patient_id)
  );

  return v_id;
end;
$$;

comment on function public.create_treatment_basis(uuid, uuid, text, date, integer, jsonb, text, text, text) is
  'Legt eine Behandlungsgrundlage samt Positionen atomar an und protokolliert treatment_basis.created (VER-003, ADR-010). Nur owner, therapist und team_lead (ANN-011). Seit VER-EPIC-002 mit der Anzahl moeglicher Termine und ohne Therapieziel, Verordnerhinweis und Empfehlung - eine neue Grundlage hat sie nicht (ANN-064).';

revoke all on function public.create_treatment_basis(uuid, uuid, text, date, integer, jsonb, text, text, text) from public, anon;
grant execute on function public.create_treatment_basis(uuid, uuid, text, date, integer, jsonb, text, text, text) to authenticated;


drop function public.update_treatment_basis(uuid, uuid, text, date, jsonb, text, text, text, text, text, text);

create function public.update_treatment_basis(
  p_treatment_basis_id uuid,
  p_prescriber_id uuid,
  p_treatment_basis_kind text,
  p_issued_on date,
  p_appointment_count integer,
  p_items jsonb,
  p_frequency_note text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text,
  p_diagnosis text DEFAULT NULL::text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
  v_selbstzahler boolean;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_write_treatment_bases() then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to write treatment_bases' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  perform app.assert_treatment_basis_input(v_org, p_prescriber_id, p_treatment_basis_kind, p_issued_on);
  perform app.assert_appointment_count(p_appointment_count);

  v_selbstzahler := p_treatment_basis_kind = 'self_pay';

  -- Therapieziel, Verordnerhinweis und Empfehlung stehen seit VER-EPIC-002
  -- nicht mehr im Formular. Sie kommen deshalb in dieser Anweisung nicht vor
  -- und bleiben unveraendert stehen - **ausser** beim Wechsel auf
  -- "Selbstzahler": Dort verlangt ADR-020 Punkt 4 sie leer, und das entscheidet
  -- der Server, nicht der Aufrufer.
  update public.treatment_bases
     set prescriber_id            = p_prescriber_id,
         treatment_basis_kind     = p_treatment_basis_kind,
         issued_on                = p_issued_on,
         appointment_count        = p_appointment_count,
         frequency_note           = nullif(btrim(p_frequency_note), ''),
         note                     = nullif(btrim(p_note), ''),
         diagnosis                = case when v_selbstzahler
                                         then null else nullif(btrim(p_diagnosis), '') end,
         therapy_goal             = case when v_selbstzahler then null else therapy_goal end,
         prescriber_note          = case when v_selbstzahler then null else prescriber_note end,
         follow_up_recommendation = case when v_selbstzahler
                                         then null else follow_up_recommendation end,
         updated_at               = now(),
         updated_by               = v_actor
   where id = p_treatment_basis_id;

  perform app.write_treatment_base_items(p_treatment_basis_id, v_org, v_actor, p_items);

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.updated', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );

  return p_treatment_basis_id;
end;
$$;

comment on function public.update_treatment_basis(uuid, uuid, text, date, integer, jsonb, text, text, text) is
  'Aendert eine Behandlungsgrundlage samt Positionen atomar und protokolliert treatment_basis.updated (VER-003, ADR-010). Die Patientin bleibt unveraendert. Seit VER-EPIC-002 ohne Therapieziel, Verordnerhinweis und Empfehlung: Bestandstexte bleiben unangetastet, beim Selbstzahler raeumt sie der Server ab (ADR-020 Punkt 4, ANN-064).';

revoke all on function public.update_treatment_basis(uuid, uuid, text, date, integer, jsonb, text, text, text) from public, anon;
grant execute on function public.update_treatment_basis(uuid, uuid, text, date, integer, jsonb, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Die Terminzahl in der Lesesicht des Formulars
-- -----------------------------------------------------------------------------

drop function public.get_treatment_basis(uuid);

create function public.get_treatment_basis(p_treatment_basis_id uuid)
returns TABLE(id uuid, patient_id uuid, prescriber_id uuid, prescriber_name text, prescriber_practice_name text, treatment_basis_kind text, issued_on date, appointment_count integer, frequency_note text, note text, items jsonb, updated_at timestamp with time zone, diagnosis text, therapy_goal text, prescriber_note text, follow_up_recommendation text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_org        uuid;
  v_patient_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_basis_clinical() then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  -- Eine fremde und eine unbekannte ID liefern beide nichts.
  if not found then
    return;
  end if;

  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'treatment_basis.viewed', 'treatment_basis', p_treatment_basis_id, 'success',
    jsonb_build_object('surface', 'web', 'patient_id', v_patient_id)
  );

  return query
    select
      p.id,
      p.patient_id,
      p.prescriber_id,
      -- nullif, damit beim Selbstzahler wirklich NICHTS dasteht: concat_ws
      -- ueberspringt Nullwerte und lieferte sonst den leeren String - eine
      -- Angabe, die es nicht gibt (GRD-001, ADR-020 Punkt 3).
      nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
      v.practice_name,
      p.treatment_basis_kind,
      p.issued_on,
      p.appointment_count,
      p.frequency_note,
      p.note,
      app.treatment_base_items_json(p.id),
      p.updated_at,
      p.diagnosis,
      -- Drei Bestandstexte: Das Formular bietet sie seit VER-EPIC-002 nicht
      -- mehr zur Eingabe an, zeigt sie aber weiter an - sonst waere ein
      -- vorhandener Text unsichtbar und damit faktisch verloren.
      p.therapy_goal,
      p.prescriber_note,
      p.follow_up_recommendation
    from public.treatment_bases p
    -- LEFT JOIN seit GRD-001: Ein Selbstzahler hat keine Verordner:in
    -- (ADR-020 Punkt 3). Ein innerer Verbund liesse ihn aus der Projektion
    -- fallen - die Zeile waere da, die Akte zeigte sie nicht.
    left join public.prescribers v on v.id = p.prescriber_id
    where p.id = p_treatment_basis_id;
end;
$$;

comment on function public.get_treatment_basis(uuid) is
  'Eine Behandlungsgrundlage mit allen Feldern (VER-003, ROL-002, ADR-020), seit VER-EPIC-002 mit der Anzahl moeglicher Termine. Protokolliert treatment_basis.viewed (ADR-010). Lesen alle vier Praxisrollen; aendern duerfen nur owner, therapist und team_lead (app.can_write_treatment_bases, ANN-011).';

revoke all on function public.get_treatment_basis(uuid) from public, anon;
grant execute on function public.get_treatment_basis(uuid) to authenticated;
