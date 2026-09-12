-- =============================================================================
-- Die Patientenakte als Arbeitsplatz: zwei Lesepfade (AKTE-001, AKTE-002)
--
-- Die Akte zeigte bisher zwei Ausschnitte ihrer Termine: die naechsten fuenf
-- (list_patient_upcoming_appointments, UX-006) und die begonnenen oder
-- dokumentierten aus der Seitenregel der Akte (app.patient_record_page,
-- DOK-003). Beides beantwortet die Frage "was ist mit dieser Person noch zu
-- tun" nur halb: Der Blick nach vorn bricht nach fuenf Zeilen ab, der Blick
-- zurueck kommt ausschliesslich als Dokumentationssicht und kennt weder den
-- Mitteilungsvermerk noch die Verordnung, aus der ein Termin stammt.
--
-- Zwei neue Funktionen, beide rein organisatorisch:
--
--   * list_patient_appointments - die Termine einer Person in beide
--     Richtungen, geblaettert. Mit Verordnungsbezug, damit Verordnung und
--     Termine sich gegenseitig finden.
--   * list_patient_prescription_slots - je Verordnung Leistungseinheiten UND
--     Terminzahlen, sauber getrennt. Bisher rechnete die Oberflaeche die
--     Einheiten selbst aus den Positionen und nannte das Ergebnis
--     "Kontingent", waehrend die Serienseite unter demselben Wort die um die
--     verplanten TERMINE verminderte Zahl zeigte (ANN-038). Zwei verschiedene
--     Zahlen unter einem Wort - hier bekommen sie getrennte Namen.
--
-- KEINE NEUEN RECHTE. Beide Funktionen pruefen dieselben Rollenschnitte wie
-- die Pfade, die sie ergaenzen: app.can_read_appointments() und
-- app.can_read_prescriptions() (ADR-004). Keine klinischen Felder - weder
-- Diagnose noch Therapieziel noch Dokumentationsinhalt; die bleiben ihren
-- eigenen, eigens protokollierten Sichten vorbehalten (ANN-011, DOK-003).
--
-- KEIN EIGENER AUDITEINTRAG. Gelesen wird, was die Akte ohnehin zeigt; das
-- Oeffnen der Akte selbst ist als patient_record.viewed protokolliert
-- (ADR-010) - wie bei get_prescription_slots und beim Behandlungsnachweis.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- list_patient_appointments: die Termine einer Person, in beide Richtungen
--
-- Eine Funktion statt zweier: Kommende und vergangene Termine unterscheiden
-- sich nur in der Grenze (starts_at gegen now()) und in der Richtung der
-- Sortierung. Zwei Funktionen mit identischem Rumpf waeren zwei Stellen, an
-- denen dieselbe Rechteprufung gepflegt werden muesste.
--
-- ALLE ZUSTAENDE, auch abgesagte. Die Terminliste der Akte ist der Ort, an dem
-- "der Termin am Dienstag wurde abgesagt" nachlesbar sein muss - fuer den
-- organisatorischen Streitfall zaehlt gerade das (PROJECT_PRINCIPLES.md 4.4).
-- Der Blick nach vorn in der Uebersicht bleibt davon unberuehrt: dort zeigt
-- list_patient_upcoming_appointments weiterhin nur, was noch ansteht.
--
-- KEYSET-CURSOR (starts_at, id) wie in app.patient_record_page: ein Offset
-- liefert bei einem zwischenzeitlich verschobenen Termin Zeilen doppelt oder
-- gar nicht. Der Vergleich dreht sich mit der Richtung mit.
--
-- OHNE ANSCHRIFT. Die Akte braucht sie nicht; der Tagesplan hat dafuer seinen
-- eigenen Pfad (UX-001, Datenminimierung nach PROJECT_PRINCIPLES.md 16).
-- -----------------------------------------------------------------------------
create function public.list_patient_appointments(
  p_patient_id      uuid,
  p_upcoming        boolean     default false,
  p_limit           integer     default 20,
  p_after_starts_at timestamptz default null,
  p_after_id        uuid        default null,
  p_prescription_id uuid        default null
)
returns table (
  id                      uuid,
  starts_at               timestamptz,
  ends_at                 timestamptz,
  appointment_type        text,
  status                  text,
  staff_given_name        text,
  staff_family_name       text,
  notification_channels   text[],
  prescription_id         uuid,
  prescription_issued_on  date,
  organization_time_zone  text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org      uuid;
  v_upcoming boolean := coalesce(p_upcoming, false);
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft.
  if not app.can_read_appointments() then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read appointments' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'limit out of range' using errcode = '22023';
  end if;

  -- Der Cursor besteht aus beiden Teilen oder gar nicht.
  if (p_after_starts_at is null) <> (p_after_id is null) then
    raise exception 'cursor is incomplete' using errcode = '22023';
  end if;

  return query
    select
      a.id,
      a.starts_at,
      a.ends_at,
      a.appointment_type,
      a.status,
      sp.given_name,
      sp.family_name,
      app.appointment_notification_channels(a.id),
      a.prescription_id,
      pr.issued_on,
      o.time_zone
    from public.appointments a
    join public.staff_members sm  on sm.id = a.staff_member_id
    join public.persons sp        on sp.id = sm.person_id
    join public.organizations o   on o.id  = a.organization_id
    left join public.prescriptions pr on pr.id = a.prescription_id
    where a.organization_id = v_org
      and a.patient_id      = p_patient_id
      and (p_prescription_id is null or a.prescription_id = p_prescription_id)
      and (
        case when v_upcoming then a.starts_at > now() else a.starts_at <= now() end
      )
      and (
        p_after_starts_at is null
        or (
          case
            when v_upcoming then (a.starts_at, a.id) > (p_after_starts_at, p_after_id)
            else (a.starts_at, a.id) < (p_after_starts_at, p_after_id)
          end
        )
      )
    -- Die Richtung steckt in der Sortierung: In jedem Lauf sind zwei der vier
    -- Ausdruecke fuer JEDE Zeile null und damit wirkungslos - uebrig bleibt
    -- genau das Paar der gewaehlten Richtung. Das ist billiger als zwei
    -- Rumpfvarianten derselben Abfrage, die getrennt gepflegt werden muessten.
    order by
      case when v_upcoming then a.starts_at end asc,
      case when v_upcoming then a.id end asc,
      case when not v_upcoming then a.starts_at end desc,
      case when not v_upcoming then a.id end desc
    limit p_limit;
end;
$$;

comment on function public.list_patient_appointments(uuid, boolean, integer, timestamptz, uuid, uuid) is
  'Termine einer Patient:in fuer die Akte (AKTE-001): kommend oder vergangen, alle Zustaende, mit Mitteilungsvermerk und Verordnungsbezug, geblaettert ueber einen Keyset-Cursor. Rein organisatorisch, ohne Anschrift und ohne klinische Inhalte.';

revoke all on function public.list_patient_appointments(uuid, boolean, integer, timestamptz, uuid, uuid)
  from public, anon;
grant execute on function public.list_patient_appointments(uuid, boolean, integer, timestamptz, uuid, uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- list_patient_prescription_slots: Einheiten und Termine je Verordnung
--
-- Dieselben Zahlen, die get_prescription_slots fuer eine einzelne Verordnung
-- liefert (CAL-007) - fuer alle Verordnungen einer Person in einem Aufruf.
-- Ohne sie muesste die Akte je Verordnung einen eigenen Aufruf abschicken.
--
-- 'upcoming' kommt hinzu: wie viele der zugeordneten Termine noch bevorstehen.
-- Das ist die Zahl, die in der Akte ueber "hier ist noch etwas zu tun"
-- entscheidet - und sie ist etwas anderes als das offene Kontingent.
--
-- Die Wortwahl der Oberflaeche haengt daran:
--   prescribed/used  - LEISTUNGSEINHEITEN aus den Positionen (ANN-012, bis
--                      ABR-002 von Hand gepflegt)
--   planned/upcoming - TERMINE, gezaehlt auf den Terminen selbst
--   remaining        - was sich noch planen laesst: verordnet abzueglich des
--                      GROESSEREN von genutzt und verplant (ANN-038)
-- -----------------------------------------------------------------------------
create function public.list_patient_prescription_slots(p_patient_id uuid)
returns table (
  prescription_id uuid,
  prescribed      integer,
  used            integer,
  planned         integer,
  upcoming        integer,
  remaining       integer
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

  if not app.can_read_prescriptions() then
    raise exception 'not allowed to read prescriptions' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read prescriptions' using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  return query
    select
      p.id,
      zahlen.prescribed,
      zahlen.used,
      zahlen.planned,
      (
        select count(*)::integer
        from public.appointments a
        where a.prescription_id = p.id
          and a.organization_id = v_org
          and a.status <> 'cancelled'
          and a.starts_at > now()
      ),
      zahlen.remaining
    from public.prescriptions p
    cross join lateral app.prescription_slot_counts(p.id, v_org) zahlen
    where p.organization_id = v_org
      and p.patient_id = p_patient_id
    order by p.issued_on desc, p.id desc;
end;
$$;

comment on function public.list_patient_prescription_slots(uuid) is
  'Leistungseinheiten und Terminzahlen je Verordnung einer Patient:in (AKTE-002): verordnet, genutzt, verplant, noch bevorstehend und offen. Rein organisatorisch - die klinischen Felder bleiben list_patient_prescriptions_clinical vorbehalten.';

revoke all on function public.list_patient_prescription_slots(uuid) from public, anon;
grant execute on function public.list_patient_prescription_slots(uuid) to authenticated;
