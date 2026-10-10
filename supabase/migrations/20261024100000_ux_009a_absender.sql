-- =============================================================================
-- UX-009a: Absender auf Aufnahmeblatt und Terminzettel (BEF-052, ANN-323)
--
-- Beide Blaetter gehen an Patient:innen. Bisher trugen sie nur den Namen der
-- Organisation: Die Datenschutzinformation bat, sich "persoenlich,
-- telefonisch oder schriftlich" an die Praxis zu wenden, ohne Anschrift,
-- Telefon und E-Mail zu nennen (Art. 13 Abs. 1 lit. a DSGVO verlangt die
-- Kontaktdaten des Verantwortlichen), und der Terminzettel bat um eine
-- rechtzeitige Absage, ohne zu sagen, wo.
--
-- Zwei Teile:
--
--   1. `get_practice_sender()` - der Absender aus den Praxis-Stammdaten fuer
--      alle vier Praxisrollen, nach dem Muster von ANN-123 (Briefkopf des
--      Therapieberichts): Name, Anschrift, Telefon, E-Mail. Steuernummer,
--      USt-IdNr., Bankverbindung, Nummernkreis und Zahlungsziel liefert die
--      Funktion nicht (ADR-013 Punkt 9 Nr. 3). Das Leserecht auf die ganze
--      Zeile bleibt bei owner und office (`app.can_read_billing_profile`).
--      Fehlen die Stammdaten, steht nur der Name der Organisation da.
--      Kein Auditeintrag: Die Anschrift der eigenen Praxis ist kein
--      Personendatum (ADR-010 Punkt 15 und 16). Ein Patientenkonto wird
--      abgewiesen und protokolliert (G6b), wie jeder Lesepfad.
--
--   2. `list_patient_appointment_slip` liefert zum Praxistermin die Anschrift
--      des Standorts (`locations.street` ...): Der Zettel sagt dann, wohin
--      die Patient:in kommt. Die Rueckgabe waechst um vier Spalten, deshalb
--      drop und create; Rechte, Abweisung und Protokoll bleiben wie in
--      LOG-EPIC-001.
--
-- Keine neue Tabelle, keine neue Datenklasse, keine neue Auditaktion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Absender der Praxis
-- -----------------------------------------------------------------------------
create function public.get_practice_sender()
returns jsonb
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

  if not app.is_staff() then
    perform app.record_denied_read(auth.uid(), 'practice_sender.read',
                                   'not allowed to read the practice sender');
    return null;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read the practice sender' using errcode = '42501';
  end if;

  -- ANN-123/ANN-323: nur, was auf ein Blatt an Patient:innen gehoert.
  return coalesce(
    (select jsonb_build_object(
       'name', pb.legal_name,
       'street', pb.street,
       'house_number', pb.house_number,
       'postal_code', pb.postal_code,
       'city', pb.city,
       'phone', pb.phone,
       'email', pb.email)
     from public.practice_billing_profiles pb
     where pb.organization_id = v_org),
    (select jsonb_build_object('name', o.name)
     from public.organizations o
     where o.id = v_org)
  );
end;
$$;

-- STABLE genuegt nicht fuer die protokollierte Abweisung hinter PostgREST
-- (BEF-082): Eine lesende Transaktion verwirft das INSERT.
alter function public.get_practice_sender() volatile;

comment on function public.get_practice_sender() is
  'UX-009a, ANN-323 (nach ANN-123): Absender fuer Blaetter an Patient:innen (Aufnahmeblatt, Terminzettel) - Name, Anschrift, Telefon, E-Mail aus practice_billing_profiles, ohne Steuer- und Bankangaben; ohne Stammdaten nur der Name der Organisation. Alle vier Praxisrollen; kein Auditeintrag beim Lesen, Abweisung als access.denied.';

revoke all on function public.get_practice_sender() from public, anon;
grant execute on function public.get_practice_sender() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Terminzettel mit der Anschrift des Standorts
-- -----------------------------------------------------------------------------
drop function public.list_patient_appointment_slip(uuid, integer);

create function public.list_patient_appointment_slip(p_patient_id uuid, p_limit integer default 20)
returns table (
  id                     uuid,
  starts_at              timestamptz,
  ends_at                timestamptz,
  appointment_type       text,
  location_name          text,
  location_street        text,
  location_house_number  text,
  location_postal_code   text,
  location_city          text,
  staff_given_name       text,
  staff_family_name      text,
  organization_time_zone text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org   uuid;
  v_actor uuid;
  v_limit integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Wer den Kalender lesen darf, darf den Zettel drucken.
  if not app.can_read_appointments() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'patient_record.viewed', 'not allowed to read appointments');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  -- Eine unbekannte und eine fremde ID liefern dieselbe leere Antwort und
  -- erzeugen keinen Auditeintrag (PROJECT_PRINCIPLES.md 13).
  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.organization_id = v_org
  ) then
    return;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  -- Akte geoeffnet, hoechstens einmal je Tag (LOG-EPIC-001, ADR-010).
  perform app.log_record_access(v_org, v_actor, 'patient_record.viewed', 'patient', p_patient_id);

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      l.name,
      -- UX-009a: Anschrift des Standorts nur am Praxistermin - beim
      -- Hausbesuch ist es die eigene Wohnung, beim Video gibt es keinen Ort.
      case when a.appointment_type = 'practice' then l.street end,
      case when a.appointment_type = 'practice' then l.house_number end,
      case when a.appointment_type = 'practice' then l.postal_code end,
      case when a.appointment_type = 'practice' then l.city end,
      sp.given_name,
      sp.family_name,
      o.time_zone
    from public.appointments a
    join public.staff_members sm on sm.id = a.staff_member_id
    join public.persons sp       on sp.id = sm.person_id
    join public.organizations o  on o.id  = a.organization_id
    left join public.locations l on l.id  = a.location_id
    where a.organization_id = v_org
      and a.patient_id      = p_patient_id
      and a.starts_at > now()
      -- Nur bestaetigte Termine: ein abgesagter gehoert nicht auf einen Zettel,
      -- den jemand mitnimmt (ADR-018).
      and a.status = 'confirmed'
    order by a.starts_at, a.id
    limit v_limit;
end;
$function$;

comment on function public.list_patient_appointment_slip(uuid, integer) is
  'Terminzettel (CAL-011): bevorstehende bestaetigte Termine einer Patient:in mit Datum, Ort und behandelnder Person; seit UX-009a am Praxistermin mit der Anschrift des Standorts. Kein Status, keine Verordnung, kein Behandlungsinhalt. Akte geoeffnet hoechstens einmal je Tag (LOG-EPIC-001).';

revoke all on function public.list_patient_appointment_slip(uuid, integer) from public, anon;
grant execute on function public.list_patient_appointment_slip(uuid, integer) to authenticated;
