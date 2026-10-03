-- =============================================================================
-- Akte entschlacken: Der Anmeldebogen ist erledigt, sobald sein Foto da ist
-- (ANN-227 loest ANN-224 im Punkt registration_form ab)
--
-- Jannes 2026-10-03: "Wenn man auf Anmeldebogen tippt, soll man direkt ein
-- Foto machen koennen, aehnlich wie bei Verordnung. Datenschutzinformation und
-- Behandlungsvertrag kann also weg."
--
--   * ANMELDEBOGEN (registration_form): erledigt mit einer bestaetigten Datei
--     der Art 'vertrag' an der Person. Das Foto des unterschriebenen Blatts
--     ist der Nachweis fuer Datenschutzinformation und Behandlungsvertrag
--     (ANN-227). Keine neue Dokumentart: 'vertrag' ist organisatorisch (office
--     sieht sie) und traegt schon heute den Behandlungsvertrag; die Akte legt
--     das Foto als "Anmeldebogen, <Datum>" ab.
--   * BESTAND: Wer die beiden Vermerke schon hat, bleibt erledigt. Nichts
--     wird umgedeutet oder geloescht.
--   * VERORDNUNGSFOTO, WER, MANDANT, PROTOKOLL: unveraendert. Nur die eine
--     Regelstelle app.intake_checklist aendert sich; list_open_intakes liest
--     sie und bleibt, wie sie ist.
-- =============================================================================

create or replace function app.intake_checklist(p_org uuid, p_patient_id uuid)
returns table (item text, state text)
language sql
stable
security definer
set search_path = ''
as $$
  -- ANN-143 (unveraendert): Verordnungsfoto. Erledigt mit einem Scan an der
  -- Person (auch einem noch nicht zugeordneten). Entfaellt, wenn alle
  -- Grundlagen Selbstzahler sind - dann gibt es kein Blatt.
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
  -- ANN-227: Anmeldebogen - das Foto des unterschriebenen Blatts (Art
  -- 'vertrag'). Bestand: die beiden Vermerke aus ANN-224 genuegen weiter.
  select 'registration_form',
         case
           when exists (
             select 1 from public.patient_files f
             where f.patient_id = p_patient_id and f.organization_id = p_org
               and f.document_type = 'vertrag' and f.status = 'ready'
           ) then 'done'
           when exists (
             select 1 from public.patient_privacy_records v
             where v.patient_id = p_patient_id and v.organization_id = p_org
               and v.record_kind = 'privacy_notice_handed_out'
           ) and exists (
             select 1 from public.patient_privacy_records v
             where v.patient_id = p_patient_id and v.organization_id = p_org
               and v.record_kind = 'treatment_contract_signed'
           ) then 'done'
           else 'open'
         end
$$;

comment on function app.intake_checklist(uuid, uuid) is
  'Die zwei Punkte der Erstaufnahme einer Person, abgeleitet aus der Akte (AKTE-007, ANN-224, ANN-227): Verordnungsfoto und Anmeldebogen (Foto des Blatts als Datei der Art vertrag, im Bestand auch die beiden Vermerke); done, open oder not_needed. Keine Pruefung der Rolle - das tun die Aufrufer.';
