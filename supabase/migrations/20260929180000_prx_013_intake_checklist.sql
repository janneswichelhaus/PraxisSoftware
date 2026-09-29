-- =============================================================================
-- PRX-013: Erstaufnahme-Checkliste (PRX-EPIC-003, PROJECT_PRINCIPLES.md §5)
--
-- Zur Eroeffnung ist jede Patientin eine Neuaufnahme. Fuenf Dinge gehoeren
-- dazu, und keins soll liegen bleiben: das Foto der Verordnung, der
-- Anamnesebogen, Datenschutzinformation und Behandlungsvertrag, der Befund
-- und die Entscheidung ueber die Behandlungsliege. Offen stehen sie in der
-- Tagesansicht, im Aktenkopf und unter "Offene Punkte" - bis sie erledigt
-- sind.
--
--   * ABGELEITET, NICHT GEPFLEGT (ANN-143). Kein Haken, den jemand setzt: Jeder
--     Punkt folgt aus dem, was in der Akte steht. Eine eigene Tabelle waere ein
--     zweiter Wahrheitsort, der auseinanderlaeuft.
--   * ZAEHLT, BEWERTET NICHT (§17, ADR-006). Die Liste sagt, ob ein Bogen
--     abgeschlossen ist - nicht, was darin steht.
--   * WER: die vier Praxisrollen (app.can_read_patient_directory). Die Liste
--     nennt nur, dass es einen Befund gibt, nicht seinen Inhalt; office liest
--     ihn seit E15 ohnehin. Trainingsbetreuung und Patientenkonto nicht.
--   * DIE LIEGE bekommt einen dritten Zustand: "noch nicht entschieden" (leer).
--     Bisher war "nein" der Standard - und nicht von einer bewussten
--     Entscheidung zu unterscheiden. Bestandszeilen mit "nein" werden leer:
--     Die Datenbank traegt nur synthetische Daten, und niemand hat "nein"
--     bisher bewusst waehlen koennen (ANN-143).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Behandlungsliege: leer heisst "noch nicht entschieden"
-- -----------------------------------------------------------------------------
alter table public.patient_care_details
  alter column treatment_table_required drop not null,
  alter column treatment_table_required set default null;

update public.patient_care_details
   set treatment_table_required = null
 where treatment_table_required = false;

comment on column public.patient_care_details.treatment_table_required is
  'Behandlungsliege mitnehmen (UX-003a, ANN-116): ja, nein oder leer - noch nicht entschieden (PRX-013, ANN-143). Organisatorisches Merkmal der Person wie der Zugangshinweis; der klinische Grund steht im Befund, nicht hier.';

-- -----------------------------------------------------------------------------
-- 2. Die Regionen des Befunds - dieselben neun wie die Bausteine (FRB-EPIC-003)
--
-- Ein Test haelt diese Liste deckungsgleich mit
-- src/features/assessments/definitionen/bausteine/*.json.
-- -----------------------------------------------------------------------------
create function app.intake_finding_instruments()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['hws', 'lws', 'schulter', 'ellenbogen', 'hand', 'huefte', 'knie', 'fuss', 'kiefer']
$$;

comment on function app.intake_finding_instruments() is
  'Die Befundregionen aus den Bausteinen (FRB-EPIC-003). Ein abgeschlossener Bogen einer davon erledigt den Punkt "Befund" der Erstaufnahme (PRX-013).';

revoke all on function app.intake_finding_instruments() from public, anon;

-- -----------------------------------------------------------------------------
-- 3. Die Checkliste einer Person - die eine Stelle der Regeln (ANN-143)
--
-- item:  prescription_photo, anamnesis, privacy, finding, treatment_table
-- state: done, open, not_needed
-- -----------------------------------------------------------------------------
create function app.intake_checklist(p_org uuid, p_patient_id uuid)
returns table (item text, state text)
language sql
stable
security definer
set search_path = ''
as $$
  -- ANN-143: Verordnungsfoto. Erledigt mit einem Scan an der Person (auch
  -- einem noch nicht zugeordneten). Entfaellt, wenn alle Grundlagen
  -- Selbstzahler sind - dann gibt es kein Blatt.
  select 'prescription_photo',
         case
           when exists (
             select 1 from public.patient_files f
             where f.patient_id = p_patient_id and f.organization_id = p_org
               and f.document_type = 'verordnungsscan' and f.status = 'ready'
           ) then 'done'
           when exists (
             select 1 from public.treatment_bases tb
             where tb.patient_id = p_patient_id and tb.organization_id = p_org
           ) and not exists (
             select 1 from public.treatment_bases tb
             where tb.patient_id = p_patient_id and tb.organization_id = p_org
               and tb.treatment_basis_kind <> 'self_pay'
           ) then 'not_needed'
           else 'open'
         end
  union all
  -- Anamnesebogen V8 abgeschlossen (FRB-EPIC-002).
  select 'anamnesis',
         case when exists (
           select 1 from public.patient_questionnaire_responses r
           where r.patient_id = p_patient_id and r.organization_id = p_org
             and r.instrument_id = 'anamnese_v8' and r.status = 'abgeschlossen'
         ) then 'done' else 'open' end
  union all
  -- Datenschutzinformation ausgehaendigt und Behandlungsvertrag unterschrieben
  -- (PAT-006). Einwilligungen fuer Mail, Bericht und Fotos sind freiwillig
  -- und deshalb kein Punkt der Liste.
  select 'privacy',
         case when exists (
           select 1 from public.patient_privacy_records v
           where v.patient_id = p_patient_id and v.organization_id = p_org
             and v.record_kind = 'privacy_notice_handed_out'
         ) and exists (
           select 1 from public.patient_privacy_records v
           where v.patient_id = p_patient_id and v.organization_id = p_org
             and v.record_kind = 'treatment_contract_signed'
         ) then 'done' else 'open' end
  union all
  -- Befund: ein abgeschlossener Bogen einer der neun Regionen.
  select 'finding',
         case when exists (
           select 1 from public.patient_questionnaire_responses r
           where r.patient_id = p_patient_id and r.organization_id = p_org
             and r.instrument_id = any (app.intake_finding_instruments())
             and r.status = 'abgeschlossen'
         ) then 'done' else 'open' end
  union all
  -- Liege: entschieden, ja oder nein.
  select 'treatment_table',
         case when exists (
           select 1 from public.patient_care_details cd
           where cd.patient_id = p_patient_id and cd.organization_id = p_org
             and cd.treatment_table_required is not null
         ) then 'done' else 'open' end
$$;

comment on function app.intake_checklist(uuid, uuid) is
  'Die fuenf Punkte der Erstaufnahme einer Person, abgeleitet aus der Akte (PRX-013, ANN-143): done, open oder not_needed. Keine Pruefung der Rolle - das tun die Aufrufer.';

revoke all on function app.intake_checklist(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Lesen: je Person und als Liste
-- -----------------------------------------------------------------------------
create function public.get_intake_checklist(p_patient_id uuid)
returns table (item text, state text)
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
  if not app.can_read_patient_directory() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'patient_directory.read', 'not allowed to read the intake checklist');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read the intake checklist' using errcode = '42501';
  end if;

  -- Eine fremde Person ist von einer unbekannten nicht zu unterscheiden.
  if not exists (
    select 1 from public.patients pa where pa.id = p_patient_id and pa.organization_id = v_org
  ) then
    return;
  end if;

  return query select c.item, c.state from app.intake_checklist(v_org, p_patient_id) c;
end;
$$;

comment on function public.get_intake_checklist(uuid) is
  'Erstaufnahme-Checkliste einer Person (PRX-013): fuenf Punkte mit done, open oder not_needed. Die vier Praxisrollen; ein abgewiesener Versuch wird als patient_directory.read protokolliert. Nicht auditiert: Die Liste nennt, ob etwas vorliegt, nicht seinen Inhalt (ANN-143).';

revoke all on function public.get_intake_checklist(uuid) from public, anon;
grant execute on function public.get_intake_checklist(uuid) to authenticated;


-- Alle Personen in Versorgung mit mindestens einem offenen Punkt. Wer die
-- Versorgung abgeschlossen hat oder nicht mehr in Versorgung ist, steht nicht
-- darauf - die Erstaufnahme ist dann vorbei.
create function public.list_open_intakes()
returns table (
  patient_id          uuid,
  patient_given_name  text,
  patient_family_name text,
  open_items          text[]
)
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
  if not app.can_read_patient_directory() then
    perform app.record_denied_read(auth.uid(), 'patient_directory.read', 'not allowed to read open intakes');
    return;
  end if;
  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read open intakes' using errcode = '42501';
  end if;

  return query
  select pa.id,
         pe.given_name,
         pe.family_name,
         offen.items
  from public.patients pa
  join public.persons pe on pe.id = pa.person_id
  cross join lateral (
    select array_agg(c.item order by c.ord) as items
    from (
      select k.item, k.state,
             array_position(
               array['prescription_photo', 'anamnesis', 'privacy', 'finding', 'treatment_table'],
               k.item
             ) as ord
      from app.intake_checklist(v_org, pa.id) k
    ) c
    where c.state = 'open'
  ) offen
  where pa.organization_id = v_org
    and pa.status = 'active'
    and pa.care_concluded_on is null
    and offen.items is not null
  order by pe.family_name, pe.given_name, pa.id;
end;
$$;

comment on function public.list_open_intakes() is
  'Personen in Versorgung mit offenen Punkten der Erstaufnahme (PRX-013, ANN-143), je Person die offenen Punkte in fester Reihenfolge. Die vier Praxisrollen; ein abgewiesener Versuch wird als patient_directory.read protokolliert.';

revoke all on function public.list_open_intakes() from public, anon;
grant execute on function public.list_open_intakes() to authenticated;
