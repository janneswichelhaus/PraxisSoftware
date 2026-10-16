-- =============================================================================
-- BEF-124: Eine Verordnung bleibt mit ihrem Verlauf in der Akte
--
-- Seit LOG-EPIC-001 steht das Aendern, Loeschen und Umhaengen einer
-- Behandlungsgrundlage nicht mehr im Auditlog; das Datenmodell hielt nur den
-- letzten Stand (`updated_by`, `updated_at`). Eine Verordnung ist Teil der Akte:
-- Bei einer Aenderung muss neben dem urspruenglichen Inhalt erkennbar bleiben,
-- wann sie vorgenommen wurde (§ 630f Abs. 1 BGB). ADR-010 Punkt 15 legt den
-- Nachweis ins Datenmodell - wie die Versionstabelle der Dokumentation
-- (ADR-016 Punkt 5). Das Auditlog bekommt nichts Neues (ADR-010 Punkt 17).
--
-- DREI TEILE (ANN-562):
--
--   1. VERLAUF. `treatment_basis_versions` haelt je Aenderung den Inhalt VOR
--      ihr, mit Zeitpunkt und Person. Geschrieben wird er von Triggern an der
--      Grundlage und an ihren Positionen, nicht von den Schreibfunktionen:
--      Sechs Funktionen schreiben die Grundlage (update, Hinweis, ICD-10, ...),
--      und eine siebte, die den Verlauf vergaesse, waere die naechste Luecke.
--      Je Transaktion entsteht hoechstens eine Fassung - ein Speichern aendert
--      Grundlage und Positionen zugleich und ist trotzdem eine Aenderung.
--      Was nicht Inhalt ist, erzeugt keine Fassung: die genutzte Menge (sie
--      folgt den Leistungen), die Freigabe zur Abrechnung (sie hat eigene
--      Spalten, ADR-020 Punkt 9), die Patient:in beim Zusammenfuehren und die
--      Reihenfolge der Positionen.
--   2. LOESCHEN NUR OHNE TERMINE. Haengt ein Termin an der Grundlage - auch ein
--      abgesagter - oder wurde einer von ihr weg uebertragen, wird sie nicht
--      mehr geloescht. Aendern geht weiter, mit Verlauf. Der Fall "falsche
--      Akte" (Art. 16 DSGVO) bleibt, solange noch nichts an ihr haengt.
--   3. UMHAENGEN AM TERMIN. Der Termin traegt, von welcher Grundlage er zuletzt
--      uebertragen wurde, wann und durch wen - wie `reopened_by` (ADR-010
--      Fassung 3, Konsequenzen). Ohne das liesse sich die Loeschsperre
--      umgehen: erst alles uebertragen, dann die leere Grundlage loeschen.
--
-- BEWUSST NICHT HIER: keine weiche Loeschung (alle Lesepfade muessten sie
-- filtern; die Sperre genuegt), keine Begruendungspflicht wie bei der
-- Korrektur einer Dokumentation (ADR-016 Punkt 6 gilt fuer finalisierte
-- Eintraege; eine Verordnung wird abgetippt und berichtigt), kein Verlauf des
-- Umhaengens ueber die letzte Uebertragung hinaus.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Die Versionstabelle
-- -----------------------------------------------------------------------------
create table public.treatment_basis_versions (
  id                 uuid primary key default extensions.gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete restrict,
  treatment_basis_id uuid not null references public.treatment_bases (id) on delete cascade,
  version_no         integer not null check (version_no >= 1),
  content            jsonb not null check (jsonb_typeof(content) = 'object'),
  replaced_at        timestamptz not null default now(),
  replaced_by        uuid,
  constraint treatment_basis_versions_unique unique (treatment_basis_id, version_no)
);

create index treatment_basis_versions_organization_idx
  on public.treatment_basis_versions (organization_id);

alter table public.treatment_basis_versions enable row level security;
revoke all on table public.treatment_basis_versions from public, anon, authenticated;

comment on table public.treatment_basis_versions is
  'Fruehere Staende einer Behandlungsgrundlage (BEF-124, ANN-562, § 630f Abs. 1 BGB): je Aenderung der Inhalt VOR ihr, mit Zeitpunkt und Person. Geschrieben nur von Triggern, nie geaendert. Enthaelt Gesundheitsdaten. Datenklasse: klinische Patientenakte wie die Grundlage, faellt mit ihr (FK on delete cascade, ADR-008). Kein Tabellenrecht und keine Policy: gelesen nur ueber list_treatment_basis_versions.';
comment on column public.treatment_basis_versions.version_no is
  'Fortlaufend je Grundlage ab 1. Fassung 1 ist der erste ersetzte Stand; der aktuelle Stand steht in treatment_bases.';
comment on column public.treatment_basis_versions.content is
  'Der Inhalt bis zu dieser Aenderung, wie app.treatment_basis_content ihn bildet: Bauart, Verordner:in (Kennung und Name zu dem Zeitpunkt), Datum, Terminzahl, Frequenz, Anmerkung, die klinischen Felder und die Positionen (Heilmittel, Menge). KLINISCH.';
comment on column public.treatment_basis_versions.replaced_at is
  'Wann dieser Stand ersetzt wurde (Beginn der Transaktion). Gueltig war er ab der vorigen Fassung, bei Fassung 1 ab created_at der Grundlage.';
comment on column public.treatment_basis_versions.replaced_by is
  'Wer ihn ersetzt hat (auth.uid()); leer nur bei Aenderungen ausserhalb einer Anmeldung, etwa einer Migration. Bewusst ohne Fremdschluessel wie treatment_note_versions.author_id: Der Verlauf ueberdauert ein geloeschtes Konto.';

insert into public.retention_assignments (table_name, class_key, deletion_mode, scope_note, sort_order)
values (
  'treatment_basis_versions', 'patientenakte', 'ueber_elterndatensatz',
  'Fruehere Staende einer Behandlungsgrundlage. Fallen mit der Grundlage (FK on delete cascade).',
  35
);

-- -----------------------------------------------------------------------------
-- 2. Der Inhalt einer Grundlage als ein Wert
--
-- Die Verordner:in steht mit Namen darin: Ihre Stammdaten koennen sich aendern,
-- der Verlauf soll zeigen, was damals auf der Grundlage stand.
-- -----------------------------------------------------------------------------
create function app.treatment_basis_content(p_treatment_basis_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'treatment_basis_kind',     b.treatment_basis_kind,
    'prescriber_id',            b.prescriber_id,
    'prescriber_name',          nullif(btrim(concat_ws(' ', v.title, v.given_name, v.family_name)), ''),
    'issued_on',                b.issued_on,
    'appointment_count',        b.appointment_count,
    'frequency_note',           b.frequency_note,
    'note',                     b.note,
    'diagnosis',                b.diagnosis,
    'diagnosis_icd10',          b.diagnosis_icd10,
    'therapy_goal',             b.therapy_goal,
    'prescriber_note',          b.prescriber_note,
    'follow_up_recommendation', b.follow_up_recommendation,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'remedy', i.remedy,
               'prescribed_quantity', i.prescribed_quantity
             ) order by i.sort_order, i.id)
      from public.treatment_base_items i
      where i.treatment_basis_id = b.id
    ), '[]'::jsonb)
  )
  from public.treatment_bases b
  left join public.prescribers v on v.id = b.prescriber_id
  where b.id = p_treatment_basis_id
$$;

revoke all on function app.treatment_basis_content(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Eine Fassung festhalten
--
-- Aufgerufen aus BEFORE-Triggern: Die Grundlage und ihre Positionen stehen dann
-- noch auf dem alten Stand - jedenfalls bei der ersten Aenderung der
-- Transaktion, und nur die zaehlt.
--
-- * Eine in dieser Transaktion angelegte Grundlage (`created_at = now()`) hat
--   keinen frueheren Stand: create_treatment_basis legt erst die Grundlage,
--   dann die Positionen an.
-- * Hat die Transaktion schon eine Fassung geschrieben, bleibt es dabei.
-- * Gibt es die Grundlage nicht mehr, wird sie gerade geloescht und nimmt ihre
--   Positionen mit (cascade) - dann ist nichts festzuhalten.
-- -----------------------------------------------------------------------------
create function app.record_treatment_basis_version(p_treatment_basis_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_basis record;
  v_nr    integer;
begin
  select b.id, b.organization_id, b.created_at
    into v_basis
  from public.treatment_bases b
  where b.id = p_treatment_basis_id;

  if not found or v_basis.created_at = now() then
    return;
  end if;

  if exists (
    select 1 from public.treatment_basis_versions v
    where v.treatment_basis_id = p_treatment_basis_id
      and v.replaced_at = now()
  ) then
    return;
  end if;

  select coalesce(max(v.version_no), 0) + 1 into v_nr
  from public.treatment_basis_versions v
  where v.treatment_basis_id = p_treatment_basis_id;

  insert into public.treatment_basis_versions (
    organization_id, treatment_basis_id, version_no, content, replaced_by
  )
  values (
    v_basis.organization_id, p_treatment_basis_id, v_nr,
    app.treatment_basis_content(p_treatment_basis_id), auth.uid()
  );
end;
$$;

revoke all on function app.record_treatment_basis_version(uuid) from public, anon, authenticated;

create function app.treatment_basis_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'treatment_bases' then
    perform app.record_treatment_basis_version(old.id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform app.record_treatment_basis_version(old.treatment_basis_id);
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform app.record_treatment_basis_version(new.treatment_basis_id);
  else
    perform app.record_treatment_basis_version(old.treatment_basis_id);
  end if;
  return new;
end;
$$;

revoke all on function app.treatment_basis_version_trigger() from public, anon, authenticated;

-- Am Ende der Transaktion: Steht danach derselbe Inhalt da wie in der
-- Fassung, war es keine Aenderung - etwa ein Speichern, das die Heilmittel neu
-- anlegt statt sie zu behalten, oder ein Hin und Zurueck. Die Fassung faellt
-- dann wieder weg; sie ist die juengste, es entsteht keine Luecke.
create function app.drop_unchanged_treatment_basis_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.treatment_basis_versions v
  where v.id = new.id
    and v.content = app.treatment_basis_content(new.treatment_basis_id);
  return null;
end;
$$;

revoke all on function app.drop_unchanged_treatment_basis_version() from public, anon, authenticated;

create constraint trigger treatment_basis_versions_drop_unchanged
  after insert on public.treatment_basis_versions
  deferrable initially deferred
  for each row
  execute function app.drop_unchanged_treatment_basis_version();

-- Nur Inhaltsspalten. Die Freigabe zur Abrechnung, die Patient:in (beim
-- Zusammenfuehren) und `updated_at` allein sind keine Aenderung des Inhalts.
create trigger treatment_bases_version
  before update on public.treatment_bases
  for each row
  when (
    (old.treatment_basis_kind, old.prescriber_id, old.issued_on, old.appointment_count,
     old.frequency_note, old.note, old.diagnosis, old.diagnosis_icd10, old.therapy_goal,
     old.prescriber_note, old.follow_up_recommendation)
    is distinct from
    (new.treatment_basis_kind, new.prescriber_id, new.issued_on, new.appointment_count,
     new.frequency_note, new.note, new.diagnosis, new.diagnosis_icd10, new.therapy_goal,
     new.prescriber_note, new.follow_up_recommendation)
  )
  execute function app.treatment_basis_version_trigger();

-- Die genutzte Menge folgt den Leistungen und die Reihenfolge der Anzeige;
-- beides ist kein Inhalt der Verordnung.
create trigger treatment_base_items_version_change
  before update on public.treatment_base_items
  for each row
  when (
    (old.remedy, old.prescribed_quantity) is distinct from (new.remedy, new.prescribed_quantity)
  )
  execute function app.treatment_basis_version_trigger();

create trigger treatment_base_items_version_add_remove
  before insert or delete on public.treatment_base_items
  for each row
  execute function app.treatment_basis_version_trigger();

-- -----------------------------------------------------------------------------
-- 4. Umhaengen am Termin
-- -----------------------------------------------------------------------------
alter table public.appointments
  add column previous_treatment_basis_id uuid
    references public.treatment_bases (id) on delete set null,
  add column treatment_basis_transferred_at timestamptz,
  add column treatment_basis_transferred_by uuid,
  add constraint appointments_treatment_basis_transfer_complete
    check ((treatment_basis_transferred_at is null) = (treatment_basis_transferred_by is null)),
  add constraint appointments_previous_basis_only_after_transfer
    check (previous_treatment_basis_id is null or treatment_basis_transferred_at is not null);

create index appointments_previous_treatment_basis_idx
  on public.appointments (previous_treatment_basis_id)
  where previous_treatment_basis_id is not null;

comment on column public.appointments.previous_treatment_basis_id is
  'Die Grundlage, von der dieser Termin zuletzt uebertragen wurde (BEF-124, ANN-562). Solange sie hier steht, wird jene Grundlage nicht geloescht. Faellt beim Loeschen der Akte mit (on delete set null).';
comment on column public.appointments.treatment_basis_transferred_at is
  'Wann der Termin zuletzt auf eine andere Grundlage uebertragen wurde (BEF-124). Nachweis im Datenmodell statt Auditeintrag (ADR-010 Punkt 15).';
comment on column public.appointments.treatment_basis_transferred_by is
  'Wer ihn uebertragen hat (auth.uid()). Zweck nur der Nachweis zur Akte, nie eine Leistungskontrolle (ADR-010 Punkt 20).';

-- -----------------------------------------------------------------------------
-- 5. Uebertragen: Rumpf aus 20261006110100_log_001b_schreibpfade.sql, neu ist
--    allein der Vermerk am Termin im letzten Update.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_appointments_to_treatment_basis(p_treatment_basis_id uuid, p_appointment_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org        uuid;
  v_actor      uuid := auth.uid();
  v_patient    uuid;
  v_anzahl     integer;
  v_geschickt  integer;
  v_quellen    uuid[];
  v_fehlend    text;
  v_leistungen integer := 0;
  v_mengen     jsonb   := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Uebertragen aendert einen Termin, nicht die Grundlage: Es ist dasselbe
  -- Recht wie das Umplanen (ADR-004). Wer eine Verordnung schreiben darf, hat
  -- es ohnehin; das Office plant Termine und darf deshalb auch uebertragen.
  if not app.can_update_appointment() then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to update appointments' using errcode = '42501';
  end if;

  if p_treatment_basis_id is null then
    raise exception 'treatment basis is required' using errcode = '22023';
  end if;

  if p_appointment_ids is null or cardinality(p_appointment_ids) = 0 then
    raise exception 'appointments must be a non-empty array' using errcode = '22023';
  end if;

  -- Die Zielgrundlage bestimmt die Patient:in. Sie wird hier gelesen und nicht
  -- vom Aufrufer entgegengenommen: Eine mitgeschickte Patientenkennung waere
  -- eine zweite Wahrheit, die auseinanderlaufen kann.
  select p.patient_id
    into v_patient
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

  -- Alles oder nichts: Erst wird gezaehlt, was die Bedingungen erfuellt, dann
  -- geschrieben. Eine Kennung, die durchfaellt - fremde Organisation, andere
  -- Patient:in, abgesagt, abgerechnet oder ein Ereignis ohne Patient:in -,
  -- laesst den ganzen Vorgang scheitern.
  v_geschickt := cardinality(array(select distinct unnest(p_appointment_ids)));

  select count(*), array_agg(distinct a.treatment_basis_id)
    into v_anzahl, v_quellen
  from public.appointments a
  where a.id = any(p_appointment_ids)
    and a.organization_id = v_org
    and a.patient_id      = v_patient
    and a.status not in ('cancelled', 'invoiced')
    -- Abgerechnet ist die Leistung, nicht der Termin (ANN-081): Der Zustand
    -- 'invoiced' an appointments entsteht im Betrieb nicht, issue_invoice
    -- setzt ihn nicht. Geprueft wird deshalb der Zustand, den es wirklich
    -- gibt. Die Bedingung oben bleibt daneben stehen - sie kostet nichts und
    -- traegt weiter, falls ADR-018 spaeter vollstaendig umgesetzt wird.
    and not exists (
      select 1 from public.billable_services b
      where b.appointment_id = a.id
        and b.status = 'invoiced'
    );

  if v_anzahl <> v_geschickt then
    raise exception 'appointments are not transferable' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------------------
  -- ABN-002: Die erfassten Leistungen, die eine Position tragen und noch nicht
  -- am Ziel haengen. Je alter Position die Zielposition mit demselben
  -- Heilmittel; fehlt eine, ist der ganze Vorgang abzuweisen - bevor
  -- irgendetwas geschrieben wurde.
  -- ---------------------------------------------------------------------------
  create temp table abn_umzug on commit drop as
    select b.id              as leistung_id,
           b.quantity        as menge,
           alt.id            as alte_position,
           alt.remedy        as remedy,
           neu.id            as neue_position
    from public.billable_services b
    join public.treatment_base_items alt on alt.id = b.treatment_base_item_id
    left join public.treatment_base_items neu
           on neu.treatment_basis_id = p_treatment_basis_id
          and neu.remedy = alt.remedy
    where b.appointment_id = any(p_appointment_ids)
      and b.organization_id = v_org
      and b.status = 'billable'
      and alt.treatment_basis_id <> p_treatment_basis_id;

  select string_agg(distinct u.remedy, ', ' order by u.remedy)
    into v_fehlend
  from abn_umzug u
  where u.neue_position is null;

  if v_fehlend is not null then
    raise exception 'target basis has no position for remedy %', v_fehlend
      using errcode = '22023';
  end if;

  select count(*) into v_leistungen from abn_umzug;

  if v_leistungen > 0 then
    -- Genau das zuruecknehmen, was das Erfassen gesetzt hat (wie
    -- delete_billable_services) ...
    update public.treatment_base_items p
       set used_quantity = greatest(p.used_quantity - s.menge, 0)
    from (select alte_position, sum(menge)::smallint as menge from abn_umzug group by alte_position) s
    where p.id = s.alte_position;

    -- ... und am Ziel neu verbrauchen. Die Constraint
    -- used_quantity <= prescribed_quantity schuetzt die Abrechnung (ADR-020
    -- Punkt 5); sie bekommt hier nur eine verstaendliche Meldung.
    begin
      update public.treatment_base_items p
         set used_quantity = p.used_quantity + s.menge
      from (select neue_position, sum(menge)::smallint as menge from abn_umzug group by neue_position) s
      where p.id = s.neue_position;
    exception
      when check_violation then
        raise exception 'target basis quantity exhausted' using errcode = '23514';
    end;

    update public.billable_services b
       set treatment_base_item_id = u.neue_position
    from abn_umzug u
    where b.id = u.leistung_id;

    select coalesce(jsonb_agg(jsonb_build_object('remedy', remedy, 'quantity', menge) order by remedy), '[]'::jsonb)
      into v_mengen
    from (select remedy, sum(menge) as menge from abn_umzug group by remedy) m;
  end if;

  -- Der Termin behaelt Tag, Zeit, Person und Ort. `updated_at` bleibt deshalb
  -- unberuehrt: Der Mitteilungsvermerk haengt daran (CAL-012) und gilt weiter -
  -- mitgeteilt wurde ein Zeitpunkt, keine Grundlage.
  --
  -- BEF-124: Wer von wo uebertragen hat, steht am Termin. Ein Termin, der
  -- schon am Ziel haengt, wird nicht umgehaengt und bekommt keinen Vermerk.
  update public.appointments a
     set treatment_basis_id             = p_treatment_basis_id,
         previous_treatment_basis_id    = case
                                            when a.treatment_basis_id is distinct from p_treatment_basis_id
                                            then a.treatment_basis_id
                                            else a.previous_treatment_basis_id
                                          end,
         treatment_basis_transferred_at = case
                                            when a.treatment_basis_id is distinct from p_treatment_basis_id
                                            then now()
                                            else a.treatment_basis_transferred_at
                                          end,
         treatment_basis_transferred_by = case
                                            when a.treatment_basis_id is distinct from p_treatment_basis_id
                                            then v_actor
                                            else a.treatment_basis_transferred_by
                                          end
   where a.id = any(p_appointment_ids)
     and a.organization_id = v_org;


  return v_anzahl;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 6. Loeschen: Rumpf aus 20261112160000_a_007_leistung_nur_mit_haken.sql, neu
--    ist allein die Sperre bei Terminen.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_treatment_basis(p_treatment_basis_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor        uuid;
  v_org          uuid;
  v_patient_id   uuid;
  v_freigegeben  timestamptz;
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

  -- Zweitreview A (Nachtrag): erst die Termine und Positionen der Grundlage,
  -- dann die Grundlage - dieselbe Reihenfolge wie jeder Schreiber (Termin,
  -- Position, Grundlage). Mit der Grundlage zuerst warteten das Loeschen
  -- (Termine auf null, Positionen fort) und eine laufende Terminaenderung
  -- (Sperrpruefung an der Grundlage) aufeinander (40P01). Die Termine nur
  -- `for no key update`, wie das Loeschen sie ohnehin aendert: Ein neuer
  -- Eintrag zu einem Termin bleibt so moeglich.
  perform 1
  from public.appointments a
  where a.treatment_basis_id = p_treatment_basis_id
    and a.organization_id = v_org
  order by a.id
  for no key update;

  perform 1
  from public.treatment_base_items i
  where i.treatment_basis_id = p_treatment_basis_id
    and i.organization_id = v_org
  order by i.id
  for update;

  -- B7 (ANN-515): In der Abrechnung erst zurueckholen. Die Zeile wird vor
  -- der Pruefung gesperrt: Eine gleichzeitige Freigabe wartet dann, statt
  -- dass das Loeschen die eben freigegebene Grundlage mitnimmt.
  select b.billing_released_at into v_freigegeben
  from public.treatment_bases b
  where b.id = p_treatment_basis_id
    and b.organization_id = v_org
  for update;

  if v_freigegeben is not null then
    raise exception 'treatment basis is in billing' using errcode = '55000';
  end if;

  -- BEF-124 (ANN-562): Haengt ein Termin an der Grundlage oder wurde einer
  -- von ihr weg uebertragen, gehoert sie zur Akte und bleibt (§ 630f BGB).
  -- Nach der Zeilensperre geprueft: Ein Termin, der gleichzeitig an die
  -- Grundlage gehaengt wird, wartet auf sie (Fremdschluessel) und sieht danach
  -- entweder die Grundlage oder ihr Fehlen.
  if exists (
    select 1 from public.appointments a
    where a.organization_id = v_org
      and (a.treatment_basis_id = p_treatment_basis_id
           or a.previous_treatment_basis_id = p_treatment_basis_id)
  ) then
    raise exception 'treatment basis has appointments' using errcode = '23503';
  end if;

  -- PRX-010 (Zweitreview): Mit der Grundlage fielen ihre klinischen Texte;
  -- das bleibt den therapeutischen Rollen vorbehalten.
  if not app.can_clear_treatment_basis_clinical_texts()
     and app.treatment_basis_has_clinical_texts(p_treatment_basis_id, v_org) then
    raise exception 'clinical texts on this treatment basis can only be cleared by treating roles'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.therapy_reports r
    where r.treatment_basis_id = p_treatment_basis_id and r.organization_id = v_org
  ) then
    raise exception 'treatment basis has therapy reports' using errcode = '23503';
  end if;

  delete from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org
  returning p.patient_id into v_patient_id;

  if not found then
    raise exception 'treatment basis not found' using errcode = 'P0002';
  end if;

end;
$function$;

-- -----------------------------------------------------------------------------
-- 7. Der Verlauf lesen
--
-- Dieselbe Projektion wie die Grundlage selbst (ADR-016 Punkt 8 sinngemaess):
-- wer ihre klinischen Felder liest, liest auch ihre frueheren Staende. Eine
-- fremde und eine unbekannte Kennung liefern beide nichts.
-- -----------------------------------------------------------------------------
create function public.list_treatment_basis_versions(p_treatment_basis_id uuid)
returns table (
  version_no       integer,
  content          jsonb,
  replaced_at      timestamptz,
  replaced_by_name text
)
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
    -- G6a: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(v_actor, 'treatment_basis.viewed', 'not allowed to read clinical treatment basis data');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read clinical treatment basis data' using errcode = '42501';
  end if;

  select p.patient_id into v_patient_id
  from public.treatment_bases p
  where p.id = p_treatment_basis_id
    and p.organization_id = v_org;

  if not found then
    return;
  end if;

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', v_patient_id);

  return query
    select v.version_no,
           v.content,
           v.replaced_at,
           person.display_name
    from public.treatment_basis_versions v
    left join public.user_profiles person on person.id = v.replaced_by
    where v.treatment_basis_id = p_treatment_basis_id
      and v.organization_id = v_org
    order by v.version_no desc;
end;
$$;

revoke all on function public.list_treatment_basis_versions(uuid) from public, anon;
grant execute on function public.list_treatment_basis_versions(uuid) to authenticated;

comment on function public.list_treatment_basis_versions(uuid) is
  'BEF-124: Die frueheren Staende einer Behandlungsgrundlage, juengster zuerst, mit Zeitpunkt und Person der Aenderung. Recht wie get_treatment_basis (klinisch lesen); Abweisung mit null Zeilen und access.denied.';

-- -----------------------------------------------------------------------------
-- 8. Auskunft (Art. 15 DSGVO): Rumpf aus 20261110120000_alt_003_habits.sql
--    (laufende Datenbank, pg_get_functiondef), neu ist allein der Abschnitt
--    treatment_basis_versions.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_patient_record(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org    uuid;
  v_actor  uuid;
  v_daten  jsonb;
begin
  v_actor := auth.uid();
  v_org   := app.auskunft_organisation(p_patient_id);

  select jsonb_build_object(
    'persons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'given_name', pe.given_name,
        'family_name', pe.family_name,
        'created_at', pe.created_at
      ) order by pe.created_at)
      from public.persons pe
      join public.patients pa on pa.person_id = pe.id
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id,
        'status', pa.status,
        'care_started_on', pa.care_started_on,
        'care_concluded_on', pa.care_concluded_on,
        'care_concluded_at', pa.care_concluded_at,
        'created_at', pa.created_at
      ))
      from public.patients pa
      where pa.id = p_patient_id
    ), '[]'::jsonb),

    'patient_contact_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date_of_birth', k.date_of_birth,
        'email', k.email,
        'phone', k.phone,
        'phone_mobile', k.phone_mobile,
        'phone_work', k.phone_work,
        'institution', k.institution,
        'street', k.street,
        'house_number', k.house_number,
        'postal_code', k.postal_code,
        'city', k.city,
        -- MAP-006a: die Koordinate ist ein Personendatum wie die Adresse (Art. 15 DSGVO).
        'lat', k.lat,
        'lon', k.lon,
        'geocode_precision', k.geocode_precision,
        'created_at', k.created_at
      ))
      from public.patient_contact_details k
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_care_details', coalesce((
      select jsonb_agg(jsonb_build_object(
        'primary_therapist', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = v.primary_therapist_staff_member_id
        ),
        'home_visit_access_note', v.home_visit_access_note,
        'special_note', v.special_note,
        'remark', v.remark,
        -- UX-003a: Behandlungsliege (ANN-116).
        'treatment_table_required', v.treatment_table_required,
        'take_along_items', v.take_along_items,
        'created_at', v.created_at
      ))
      from public.patient_care_details v
      where v.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', t.kind,
        'appointment_type', t.appointment_type,
        'status', t.status,
        'title', t.title,
        'starts_at', t.starts_at,
        'ends_at', t.ends_at,
        'staff_member', (
          select btrim(tp.given_name || ' ' || tp.family_name)
          from public.staff_members sm
          join public.persons tp on tp.id = sm.person_id
          where sm.id = t.staff_member_id
        ),
        'visit_street', t.visit_street,
        'visit_house_number', t.visit_house_number,
        'visit_postal_code', t.visit_postal_code,
        'visit_city', t.visit_city,
        'visit_lat', t.visit_lat,
        'visit_lon', t.visit_lon,
        'cancellation_reason', t.cancellation_reason,
        'cancellation_received_at', t.cancellation_received_at,
        'fee_basis', t.fee_basis,
        'fee_waived_at', t.fee_waived_at,
        'no_show_recorded_at', t.no_show_recorded_at,
        'completed_at', t.completed_at,
        'created_at', t.created_at
      ) order by t.starts_at)
      from public.appointments t
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'appointment_notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'appointment_id', n.appointment_id,
        'channel', n.channel,
        'notified_at', n.notified_at
      ) order by n.notified_at)
      from public.appointment_notifications n
      join public.appointments t on t.id = n.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_bases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'treatment_basis_kind', g.treatment_basis_kind,
        'issued_on', g.issued_on,
        'prescriber', (
          select btrim(coalesce(vo.title || ' ', '') || vo.given_name || ' ' || vo.family_name)
          from public.prescribers vo
          where vo.id = g.prescriber_id
        ),
        'diagnosis', g.diagnosis,
        'therapy_goal', g.therapy_goal,
        'frequency_note', g.frequency_note,
        'prescriber_note', g.prescriber_note,
        'follow_up_recommendation', g.follow_up_recommendation,
        'note', g.note,
        'appointment_count', g.appointment_count,
        'created_at', g.created_at
      ) order by g.issued_on, g.created_at)
      from public.treatment_bases g
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_base_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'treatment_basis_id', i.treatment_basis_id,
        'sort_order', i.sort_order,
        'remedy', i.remedy,
        'prescribed_quantity', i.prescribed_quantity,
        'used_quantity', i.used_quantity
      ) order by i.sort_order)
      from public.treatment_base_items i
      join public.treatment_bases g on g.id = i.treatment_basis_id
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- BEF-124: fruehere Staende der Grundlagen gehoeren zur Auskunft wie die
    -- Versionen der Dokumentation (Art. 15 DSGVO).
    'treatment_basis_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'treatment_basis_id', gv.treatment_basis_id,
        'version_no', gv.version_no,
        'content', gv.content,
        'replaced_at', gv.replaced_at,
        'replaced_by', (
          select up.display_name from public.user_profiles up where up.id = gv.replaced_by
        )
      ) order by gv.replaced_at, gv.version_no)
      from public.treatment_basis_versions gv
      join public.treatment_bases g on g.id = gv.treatment_basis_id
      where g.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'appointment_id', d.appointment_id,
        'status', d.status,
        'content', d.content,
        'visit_without_treatment', d.visit_without_treatment,
        'addendum_to_note_id', d.addendum_to_note_id,
        'finalisation_kind', d.finalisation_kind,
        'finalized_at', d.finalized_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = d.created_by
        ),
        'created_at', d.created_at,
        'updated_at', d.updated_at,
        -- OFF-002: Uhr des Geraets bei einem ohne Verbindung geschriebenen Entwurf.
        'reported_written_at', d.reported_written_at
      ) order by d.created_at)
      from public.treatment_notes d
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'treatment_note_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'note_id', f.note_id,
        'version_no', f.version_no,
        'content', f.content,
        'change_reason', f.change_reason,
        'recorded_at', f.recorded_at,
        'author', (
          select up.display_name from public.user_profiles up where up.id = f.author_id
        )
      ) order by f.recorded_at, f.version_no)
      from public.treatment_note_versions f
      join public.treatment_notes d on d.id = f.note_id
      join public.appointments t on t.id = d.appointment_id
      where t.patient_id = p_patient_id
    ), '[]'::jsonb),

    'patient_files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', da.id,
        'document_type', da.document_type,
        'display_name', da.display_name,
        'mime_type', da.mime_type,
        'byte_size', da.byte_size,
        'checksum_sha256', da.checksum_sha256,
        'status', da.status,
        'treatment_basis_id', da.treatment_basis_id,
        'created_at', da.created_at,
        'confirmed_at', da.confirmed_at,
        'photo_locked_at', da.photo_locked_at
      ) order by da.created_at)
      from public.patient_files da
      where da.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Die Fotos gehoeren zur vollstaendigen Kopie, auch
    -- gesperrte, solange sie vorhanden sind. Die Datei selbst gibt owner je
    -- Foto heraus (hand_out_patient_photo, protokolliert); dieser Abschnitt
    -- ist die Liste dazu.
    'patient_photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fo.id,
        'display_name', fo.display_name,
        'art', fo.document_type,
        'aufgenommen_am', fo.created_at,
        'gesperrt', not app.patient_photo_usable(fo.document_type, fo.patient_id, fo.created_at, fo.photo_locked_at),
        'datei_vorhanden', exists (
          select 1 from storage.objects o
          where o.bucket_id = app.patient_file_bucket_for(fo.document_type) and o.name = fo.object_key)
      ) order by fo.created_at)
      from public.patient_files fo
      where fo.patient_id = p_patient_id
        and app.is_patient_photo_type(fo.document_type)
        and fo.status = 'ready'
    ), '[]'::jsonb),

    -- ABN-017 (BEF-107): Datum und Zweck der Zugriffe aus dem Auditlog -
    -- ohne Namen und ohne Kennung der Beschaeftigten (Art. 15 Abs. 4 DSGVO);
    -- eine begruendete Ausnahme prueft owner im Einzelfall (ANN-092).
    'access_log', coalesce((
      select jsonb_agg(jsonb_build_object(
        'zeitpunkt', al.occurred_at,
        'aktion', al.action,
        'gegenstand', al.subject_type,
        'ergebnis', al.outcome,
        'durch', case al.actor_kind
                   when 'user' then 'praxis'
                   when 'system' then 'system'
                   when 'platform' then 'person_selbst'
                   when 'representative' then 'vertretung'
                 end
      ) order by al.occurred_at)
      from public.audit_log al
      where al.organization_id = v_org
        -- LOG-EPIC-001: Zugriffe, keine Abweisungen. Die Aktionen sind seit
        -- ADR-010 Fassung 3 ohnehin nur noch, was die Daten nicht zeigen.
        and al.outcome = 'success'
        -- Auch die Zugriffe auf zusammengefuehrte Doppelanlagen gehoeren
        -- zu dieser Person (ABN-018, BEF-108).
        and ((al.subject_type = 'patient' and al.subject_id = any(array(
                select p_patient_id
                union all
                select mr2.source_patient_id from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
             or al.context ->> 'patient_id' = any(array(
                select p_patient_id::text
                union all
                select mr2.source_patient_id::text from public.patient_merge_records mr2
                where mr2.target_patient_id = p_patient_id and mr2.organization_id = v_org)))
    ), '[]'::jsonb),

    -- ABN-018 (BEF-108): Nachweise des Zusammenfuehrens an dieser Akte.
    'patient_merge_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'merged_at', mr.merged_at,
        'source_patient_id', mr.source_patient_id,
        'counts', mr.counts
      ) order by mr.merged_at)
      from public.patient_merge_records mr
      where mr.target_patient_id = p_patient_id
    ), '[]'::jsonb),

    'legal_holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'reason', s.reason,
        'placed_at', s.placed_at,
        'released_at', s.released_at
      ) order by s.placed_at)
      from public.legal_holds s
      where s.subject_type = 'patient' and s.subject_id = p_patient_id
    ), '[]'::jsonb),

    'billable_services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'appointment_id', l.appointment_id,
        'performed_on', l.performed_on,
        'quantity', l.quantity,
        'status', l.status,
        'service_area', l.service_area,
        'service', (
          select btrim(k.code || ' ' || k.label)
          from public.service_catalog_items k
          where k.id = l.catalog_item_id
        )
      ) order by l.performed_on)
      from public.billable_services l
      where l.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ANG-001: das Nachsorge-Abo mit Beginn, Ende und Kuendigung (Art. 15).
    'aftercare_subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'starts_on', s.starts_on,
        'ends_on', s.ends_on,
        'created_at', s.created_at,
        'cancelled_on', s.cancelled_on,
        'cancelled_via', s.cancelled_via,
        'cancelled_access_kind', s.cancelled_access_kind,
        'cancelled_representative_name', s.cancelled_representative_name
      ) order by s.starts_on)
      from public.aftercare_subscriptions s
      where s.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- KND-002: die Trainingsangebote aus der Akte mit Uebergabeangaben (Art. 15).
    'training_offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', c.label,
        'starts_on', o.starts_on,
        'valid_until', o.valid_until,
        'handover_items', o.handover_items,
        'offers_contact', o.offers_contact,
        'created_at', o.created_at,
        'withdrawn_at', o.withdrawn_at
      ) order by o.created_at)
      from public.training_offers o
      join public.service_catalog_items c on c.id = o.catalog_item_id
      where o.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- UEB-005: die Uebungsplaene der Behandlung mit Positionen (Art. 15).
    'exercise_plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', x.title,
        'status', x.status,
        'sessions_per_week', x.sessions_per_week,
        'created_at', x.created_at,
        'assigned_at', x.assigned_at,
        'runs_from', x.runs_from,
        'runs_until', x.runs_until,
        'ended_at', x.ended_at,
        'items', coalesce((
          select jsonb_agg(app.exercise_plan_item_json(xi) - 'id' - 'variant_id'
                           - 'previous_item_id' - 'variant_archived' order by xi.position)
          from public.exercise_plan_items xi where xi.plan_id = x.id
        ), '[]'::jsonb),
        -- UEB-011: die Uebungstage, die die Person an diesem Plan gewaehlt hat.
        'weekdays', (select to_jsonb(d.weekdays) from public.exercise_plan_days d
                     where d.plan_id = x.id),
        -- UEB-010: die durchgefuehrten Einheiten, ohne interne Kennung.
        'sessions', (
          select coalesce(jsonb_agg(z - 'id'), '[]'::jsonb)
          from jsonb_array_elements(app.exercise_plan_sessions_json(x.id)) z
        )
      ) order by x.created_at)
      from public.exercise_plans x
      where x.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- KOM-004: die Rueckfragen ueber die Plattform mit allen Eintraegen
    -- (Art. 15), zugeordnete und nicht zugeordnete.
    'platform_messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'topic', m.topic,
        'reference_label', m.reference_label,
        'status', m.status,
        'created_at', m.created_at,
        'closed_at', m.closed_at,
        'record_assigned_at', m.record_assigned_at,
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'side', e.side,
            'author_kind', e.author_kind,
            'author_label', e.author_label,
            'body', e.body,
            'created_at', e.created_at
          ) order by e.created_at, e.id)
          from public.platform_message_entries e where e.message_id = m.id
        ), '[]'::jsonb)
      ) order by m.created_at)
      from public.platform_messages m
      where m.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- BEF-144: die Terminwuensche ueber die Plattform (POR-009) mit Tagen,
    -- Tageszeiten, Notiz, Zustand und Antwort der Praxis (Art. 15), offene wie
    -- beantwortete. Wer gewuenscht hat, steht wie in der Praxisliste (POR-011):
    -- die Person selbst oder die Vertretung mit Namen.
    'platform_appointment_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', w.kind,
        'appointment_id', w.appointment_id,
        'preferred_days', to_jsonb(w.preferred_days),
        'preferred_times', to_jsonb(w.preferred_times),
        'note', w.note,
        'status', w.status,
        'requested_by', z.access_kind,
        'representative_name', case when z.access_kind <> 'self' then z.representative_name end,
        'created_at', w.created_at,
        'resolved_at', w.resolved_at,
        'answer', w.answer,
        'resulting_appointment_id', w.resulting_appointment_id
      ) order by w.created_at, w.id)
      from public.platform_appointment_requests w
      join public.platform_accesses z on z.id = w.created_by_access_id
      where w.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- TRK-002: Takt und Fragen des Check-ins (Art. 15), ohne bearbeitendes
    -- Praxiskonto.
    'checkin_schedules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'interval_days', s.interval_days,
        'parameter_keys', to_jsonb(s.parameter_keys),
        'starts_on', s.starts_on,
        'created_at', s.created_at,
        'updated_at', s.updated_at
      ))
      from public.checkin_schedules s
      where s.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- TRK-002: die beantworteten Check-ins mit ihren Angaben, unveraendert.
    'checkins', app.checkins_json('treatment', p_patient_id),

    -- ALT-003: Gewohnheiten mit den vermerkten Tagen (Art. 15), ohne
    -- Praxiskonto und Zugang.
    'habits', app.habits_json('treatment', p_patient_id),

    -- BEF-145: die Zugaenge zur Plattform an dieser Akte (Art. 15) - der
    -- eigene und die einer Vertretung oder Begleitung, mit Zustand und
    -- Zeitpunkten, Grundlage, Umfang und Art der angesehenen Nachweise
    -- (ANN-342). Keine Kennung von Zugang, Konto, Verhaeltnis oder
    -- bearbeitendem Praxiskonto.
    'platform_accesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'access_kind', z.access_kind,
        'representative_name', z.representative_name,
        'legal_basis', z.legal_basis,
        'proof_documents', to_jsonb(z.proof_documents),
        'proof_recorded_at', z.proof_recorded_at,
        'health_scope', z.health_scope,
        'finance_scope', z.finance_scope,
        'consent_text_version', z.consent_text_version,
        'consent_recorded_at', z.consent_recorded_at,
        'consent_earlier_messages', z.consent_earlier_messages,
        'companion_declined_at', z.companion_declined_at,
        'companion_declined_reason', z.companion_declined_reason,
        'status', z.status,
        'created_at', z.created_at,
        'activated_at', z.activated_at,
        'locked_at', z.locked_at,
        'revoked_at', z.revoked_at,
        'revoked_reason', z.revoked_reason,
        'onboarding_finished_at', z.onboarding_finished_at,
        'onboarding_skipped_at', z.onboarding_skipped_at
      ) order by z.created_at, z.id)
      from public.platform_accesses z
      where z.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABR-030: Honorarvereinbarungen sind Daten zur Person (Art. 15 DSGVO).
    -- ABR-031: das festgeschriebene Terminhonorar je Termin (Art. 15 DSGVO).
    'session_fees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', f.appointment_id,
        'performed_on', f.performed_on,
        'amount_cents', f.amount_cents,
        'source', f.source,
        'created_at', f.created_at
      ) order by f.performed_on)
      from public.appointment_session_fees f
      join public.appointments a on a.id = f.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb),

    'fee_agreements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'valid_from', f.valid_from,
        'session_fee_cents', f.session_fee_cents,
        'created_at', f.created_at
      ) order by f.valid_from)
      from public.patient_fee_agreements f
      where f.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'recipient_kind', e.recipient_kind,
        'name', e.name,
        'street', e.street,
        'house_number', e.house_number,
        'postal_code', e.postal_code,
        'city', e.city,
        'reference', e.reference,
        'is_default', e.is_default,
        'created_at', e.created_at
      ) order by e.created_at)
      from public.invoice_recipients e
      where e.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'invoice_number', r.invoice_number,
        'period_month', r.period_month,
        'issued_on', r.issued_on,
        'due_on', r.due_on,
        'total_cents', r.total_cents,
        'tax_total_cents', r.tax_total_cents,
        'currency', r.currency,
        'service_area', r.service_area,
        'snapshot', r.snapshot,
        'created_at', r.created_at
      ) order by r.created_at)
      from public.invoices r
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'invoice_id', ri.invoice_id,
        'billable_service_id', ri.billable_service_id,
        'sort_order', ri.sort_order,
        'service_area', ri.service_area
      ) order by ri.sort_order)
      from public.invoice_items ri
      join public.invoices r on r.id = ri.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_cancellations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'invoice_id', st.invoice_id,
        'cancellation_number', st.cancellation_number,
        'reason', st.reason,
        'cancelled_on', st.cancelled_on
      ) order by st.cancelled_on)
      from public.invoice_cancellations st
      join public.invoices r on r.id = st.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'invoice_payment_reminders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'invoice_id', m.invoice_id,
        'reminder_on', m.reminder_on,
        'due_on', m.due_on,
        'outstanding_cents', m.outstanding_cents,
        'currency', m.currency
      ) order by m.reminder_on)
      from public.invoice_payment_reminders m
      join public.invoices r on r.id = m.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', z.id,
        'invoice_id', z.invoice_id,
        'direction', z.direction,
        'amount_cents', z.amount_cents,
        'currency', z.currency,
        'paid_on', z.paid_on,
        'method', z.method,
        'note', z.note,
        'voided_at', z.voided_at,
        'void_reason', z.void_reason
      ) order by z.paid_on)
      from public.payments z
      join public.invoices r on r.id = z.invoice_id
      where r.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PAT-006: Vermerke zu Datenschutzinformation, Vertrag und Einwilligungen.
    'patient_privacy_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'record_kind', pr.record_kind,
        'purpose', pr.purpose,
        'notice_version', pr.notice_version,
        'occurred_on', pr.occurred_on,
        'recorded_at', pr.recorded_at,
        -- POR-016: Herkunft, Vertretung und Textfassung (Zweitreview).
        'source', pr.source,
        'platform_access_kind', pr.platform_access_kind,
        'representative_name', pr.representative_name,
        'wording_version', pr.wording_version
      ) order by pr.recorded_at)
      from public.patient_privacy_records pr
      where pr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002b: erhobene Fragebögen samt Korrekturen, mit Antworten.
    'patient_questionnaire_responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qr.id,
        'instrument_id', qr.instrument_id,
        'definition_version', qr.definition_version,
        'status', qr.status,
        'recorded_on', qr.recorded_on,
        'answers', qr.answers,
        'supersedes_response_id', qr.supersedes_response_id,
        'change_reason', qr.change_reason,
        'author', (
          select up.display_name from public.user_profiles up where up.id = qr.created_by
        ),
        'created_at', qr.created_at,
        'completed_at', qr.completed_at
      ) order by qr.recorded_on, qr.created_at)
      from public.patient_questionnaire_responses qr
      where qr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- FRB-002e: Ereignisse im Verlauf.
    'patient_course_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'occurred_on', ce.occurred_on,
        'kind', ce.kind,
        'note', ce.note,
        'created_at', ce.created_at,
        -- ABN-013 (BEF-102): Ein entferntes Ereignis bleibt Teil der Akte.
        'removed_at', ce.removed_at
      ) order by ce.occurred_on, ce.created_at)
      from public.patient_course_events ce
      where ce.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- ABN-015: gesicherte, noch nicht uebernommene Befundangaben.
    'treatment_draft_findings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', df.appointment_id,
        'findings', df.findings,
        'updated_at', df.updated_at
      ) order by df.updated_at)
      from public.treatment_draft_findings df
      join public.appointments a on a.id = df.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- DOK-005a: Therapieberichte an die Verordner:in.
    'therapy_reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id,
        'treatment_basis_id', tr.treatment_basis_id,
        'status', tr.status,
        'report_text', tr.report_text,
        'recommendation', tr.recommendation,
        'note_ids', to_jsonb(tr.note_ids),
        'body_chart_response_id', tr.body_chart_response_id,
        'snapshot', tr.snapshot,
        'author', (
          select up.display_name from public.user_profiles up where up.id = tr.created_by
        ),
        'created_at', tr.created_at,
        'completed_at', tr.completed_at
      ) order by tr.created_at)
      from public.therapy_reports tr
      where tr.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-001: Wartelisteneintraege mit Wunschfenstern.
    'waitlist_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'treatment_basis_id', w.treatment_basis_id,
        'appointment_type', w.appointment_type,
        'duration_minutes', w.duration_minutes,
        'time_windows', w.time_windows,
        'earliest_on', w.earliest_on,
        'needed_by', w.needed_by,
        'priority_reason', w.priority_reason,
        'note', w.note,
        'status', w.status,
        'placed_appointment_id', w.placed_appointment_id,
        'created_at', w.created_at,
        'closed_at', w.closed_at
      ) order by w.created_at)
      from public.waitlist_entries w
      where w.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-012: Aufgaben und Wiedervorlagen mit Bezug auf diese Person.
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id,
        'title', k.title,
        'note', k.note,
        'due_on', k.due_on,
        'status', k.status,
        'assigned_to', nullif(btrim(concat_ws(' ', ape.given_name, ape.family_name)), ''),
        'created_at', k.created_at,
        'done_at', k.done_at
      ) order by k.created_at)
      from public.tasks k
      left join public.staff_members asm on asm.id = k.assigned_staff_member_id
      left join public.persons ape on ape.id = asm.person_id
      where k.patient_id = p_patient_id
    ), '[]'::jsonb),

    -- PRX-014: Anrufstand der Termine (nicht erreicht, Nachricht hinterlassen).
    'appointment_call_states', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', c.appointment_id,
        'outcome', c.outcome,
        'attempts', c.attempts,
        'recorded_at', c.recorded_at
      ) order by c.recorded_at)
      from public.appointment_call_states c
      join public.appointments a on a.id = c.appointment_id
      where a.patient_id = p_patient_id
    ), '[]'::jsonb)
  )
  into v_daten;

  -- Der Auditeintrag traegt nur Metadaten: wer, wann, welche Akte (ADR-010
  -- Punkt 3). Keine Zahl ueber den Inhalt, kein Name.
  insert into public.audit_log (
    organization_id, actor_user_id, action, subject_type, subject_id, outcome, context
  )
  values (
    v_org, v_actor, 'patient_record.exported', 'patient', p_patient_id, 'success',
    jsonb_build_object('surface', 'web', 'purpose', 'auskunft_art_15')
  );

  return jsonb_build_object(
    'erstellt_am', now(),
    'organisation', (select o.name from public.organizations o where o.id = v_org),
    'patient_id', p_patient_id,
    'rechtsgrundlage', 'Art. 15 Abs. 3 DSGVO',
    'tabellen', v_daten,
    'nicht_enthalten', jsonb_build_array(
      jsonb_build_object(
        'was', 'Inhalt hochgeladener Dateien und Fotos',
        'grund', 'Die Kopie nennt jede Datei mit Name, Art und Pruefsumme und jedes Foto, auch gesperrte; die Datei selbst wird je Datei herausgegeben (ADR-017, ANN-128).'
      ),
      jsonb_build_object(
        'was', 'Namen der Beschaeftigten im Zugriffsprotokoll',
        'grund', 'Das Protokoll nennt Zeitpunkt und Zweck jedes Zugriffs; wer zugegriffen hat, steht nur auf begruendetes Verlangen nach Pruefung im Einzelfall darin (Art. 15 Abs. 4 DSGVO, ANN-092).'
      ),
      jsonb_build_object(
        'was', 'Daten eines Trainingsverhaeltnisses',
        'grund', 'Training ist ein eigenes Rechtsverhaeltnis mit eigener Akte und eigener Frist (ADR-021); die Auskunft dazu wird getrennt erteilt.'
      ),
      jsonb_build_object(
        'was', 'Interne Kennungen bearbeitender Konten',
        'grund', 'Wo eine Person die Angabe traegt, steht ihr Name; die technische Kennung des Kontos sagt nichts aus.'
      )
    )
  );
end;
$function$;
