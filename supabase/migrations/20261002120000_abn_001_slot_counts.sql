-- ABN-001 (BEF-096): Das Kontingent zaehlt Behandlungstermine, und ein
-- Nichtantreffen belegt nichts.
--
-- Zwei Fehler in derselben Regel, beide von Jannes in der Abnahme der Annahmen
-- am 2026-10-02 entschieden (ANN-042, ANN-064, ANN-067, ANN-073):
--
--   * **Genutzt** war `max(used_quantity)` ueber die Positionen der Grundlage,
--     also eine Leistungsmenge. Werden je Termin verschiedene Heilmittel
--     abgerechnet (Termin 1 KG, Termin 2 MT), zaehlte das einen genutzten
--     Termin statt zwei. Jetzt zaehlt genutzt die **durchgefuehrten Termine**
--     der Grundlage (`completed`, `documented`, `invoiced`): Mehrere
--     Heilmittel oder eine Doppelbehandlung im selben Termin zaehlen einmal.
--     Terminzahl und Leistungsmenge bleiben getrennte Groessen; die
--     `used_quantity` je Position schreibt weiter die Abrechnung fort
--     (ANN-073) und wird hier nicht angefasst.
--   * **Verplant und gedeckt** zaehlten jeden nicht abgesagten Termin, also
--     auch einen mit `no_show`. Ein Nichtantreffen belegte damit das
--     Kontingent. Jetzt gilt `no_show` wie `cancelled`: Es belegt nichts,
--     verbraucht nichts und hat keine Position; das Ausfallhonorar bleibt
--     davon getrennt (`fee_basis`, ADR-018 Punkt 9).
--
-- Dieselbe Regel steht an jeder Stelle, die zaehlt: Kontingent, Position und
-- Deckung eines Termins, die bevorstehenden Termine der Akte und die
-- Verordnungen, die enden (Erinnerung und Kennzahl). Rueckgabetypen bleiben;
-- alles wird mit `create or replace` ersetzt, Rechte bleiben erhalten.
-- Ueberplanung bleibt als ungedeckt sichtbar (CAL-022). Ein `completed`
-- ohne finalisierte Dokumentation zaehlt als genutzt (ANN-210).

-- -----------------------------------------------------------------------------
-- 1. Die Zahlen der Grundlage
-- -----------------------------------------------------------------------------
create or replace function app.treatment_basis_slot_counts(
  p_treatment_basis_id uuid,
  p_organization_id uuid,
  OUT prescribed integer,
  OUT used integer,
  OUT planned integer,
  OUT remaining integer,
  OUT covered integer,
  OUT uncovered integer
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Die Terminzahl kommt aus der Grundlage selbst (ANN-064).
  select b.appointment_count
    into prescribed
  from public.treatment_bases b
  where b.id = p_treatment_basis_id
    and b.organization_id = p_organization_id;

  -- Genutzt ist eine Terminzahl: die durchgefuehrten Termine der Grundlage
  -- (ABN-001, ANN-210). Nicht die Leistungsmenge - die steht an der Position.
  select count(*)
    into used
  from public.appointments a
  where a.treatment_basis_id = p_treatment_basis_id
    and a.organization_id = p_organization_id
    and a.status in ('completed', 'documented', 'invoiced');

  -- Verplant ist jeder Termin, der stattfindet oder stattgefunden hat.
  -- Abgesagt und nicht angetroffen geben den Platz zurueck.
  select count(*)
    into planned
  from public.appointments a
  where a.treatment_basis_id = p_treatment_basis_id
    and a.organization_id = p_organization_id
    and a.status not in ('cancelled', 'no_show');

  remaining := greatest(coalesce(prescribed, 0) - greatest(coalesce(used, 0), planned), 0);

  -- CAL-022: Gedeckt sind hoechstens so viele Termine, wie die Grundlage
  -- moeglich macht; alles darueber ist geplant, aber ungedeckt.
  covered   := least(coalesce(prescribed, 0), planned);
  uncovered := greatest(planned - coalesce(prescribed, 0), 0);
end;
$$;

comment on function app.treatment_basis_slot_counts(uuid, uuid) is
  'Kontingent einer Behandlungsgrundlage, gezaehlt in Terminen (VER-EPIC-002, ANN-064): moegliche Termine aus appointment_count, genutzte aus den durchgefuehrten Terminen (completed, documented, invoiced; ABN-001, ANN-210), verplante aus den Terminen ohne cancelled und no_show (ANN-038, ANN-067), offen ist die Differenz zum groesseren der beiden. Seit CAL-022 dazu gedeckt und ungedeckt. Nur fuer die serverseitigen Lese- und Schreibpfade.';

-- -----------------------------------------------------------------------------
-- 2. Position und Deckung eines Termins
--
-- `app.appointment_is_covered` fragt die Position (PRX-008); es genuegt, die
-- Position zu aendern.
-- -----------------------------------------------------------------------------
create or replace function app.appointment_basis_position(p_appointment_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Abgesagt oder nicht angetroffen: verbraucht nichts, hat keine Position.
    when a.status in ('cancelled', 'no_show') then null
    else (
      select count(*)::integer
      from public.appointments frueher
      where frueher.treatment_basis_id  = a.treatment_basis_id
        and frueher.organization_id     = a.organization_id
        and frueher.status not in ('cancelled', 'no_show')
        and (frueher.starts_at, frueher.id) <= (a.starts_at, a.id)
    )
  end
  from public.appointments a
  where a.id = p_appointment_id
    and a.treatment_basis_id is not null
$$;

comment on function app.appointment_basis_position(uuid) is
  'PRX-008: der wievielte Termin seiner Grundlage dieser ist, geordnet nach Beginn und Kennung; abgesagte und nicht angetroffene Termine zaehlen nicht (ABN-001, ANN-067). null ohne Grundlage, bei Absage und bei Nichtantreffen. Einzige Stelle der Reihenfolge; app.appointment_is_covered fragt sie.';

comment on function app.appointment_is_covered(uuid) is
  'Deckt die Behandlungsgrundlage diesen Termin? (CAL-022, ANN-067) Gedeckt ist, wessen Position in der Grundlage (app.appointment_basis_position) hoechstens die Terminzahl ist. null heisst: keine Grundlage, abgesagt oder nicht angetroffen - dann gibt es keine Aussage.';

-- -----------------------------------------------------------------------------
-- 3. Die bevorstehenden Termine der Akte
-- (Rumpf aus 20260923120000_abgewiesene_lesezugriffe_rest.sql, nur die
-- Zaehlbedingung geaendert.)
-- -----------------------------------------------------------------------------
create or replace function public.list_patient_treatment_basis_slots(p_patient_id uuid)
 RETURNS TABLE(treatment_basis_id uuid, prescribed integer, used integer, planned integer, upcoming integer, remaining integer, covered integer, uncovered integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not app.can_read_treatment_bases() then
    -- G6b: abgewiesen wird mit null Zeilen und einem denied-Eintrag.
    perform app.record_denied_read(auth.uid(), 'treatment_bases.read', 'not allowed to read treatment_bases');
    return;
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read treatment_bases' using errcode = '42501';
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
        where a.treatment_basis_id = p.id
          and a.organization_id = v_org
          and a.status not in ('cancelled', 'no_show')
          and a.starts_at > now()
      ),
      zahlen.remaining,
      zahlen.covered,
      zahlen.uncovered
    from public.treatment_bases p
    cross join lateral app.treatment_basis_slot_counts(p.id, v_org) zahlen
    where p.organization_id = v_org
      and p.patient_id = p_patient_id
    order by p.issued_on desc, p.id desc;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 4. Verordnungen, die enden - der letzte Termin ist einer, der stattfindet
-- (Rumpf aus 20260929230000_sta_001_practice_statistics.sql; `used` und
-- `planned` kommen aus Abschnitt 1.)
-- -----------------------------------------------------------------------------
create or replace function app.ending_treatment_bases(p_organization_id uuid)
returns table (
  treatment_basis_id        uuid,
  patient_id                uuid,
  prescriber_id             uuid,
  treatment_basis_kind      text,
  issued_on                 date,
  follow_up_recommendation  text,
  prescribed                integer,
  used                      integer,
  planned                   integer,
  last_appointment_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with kandidaten as (
    select tb.id, tb.patient_id, tb.prescriber_id, tb.treatment_basis_kind, tb.issued_on,
           tb.follow_up_recommendation,
           z.prescribed, z.used, z.planned,
           (select max(a.starts_at)
              from public.appointments a
             where a.treatment_basis_id = tb.id
               and a.organization_id = p_organization_id
               and a.status not in ('cancelled', 'no_show')) as letzter
    from public.treatment_bases tb
    join public.patients pa on pa.id = tb.patient_id
    cross join lateral app.treatment_basis_slot_counts(tb.id, p_organization_id) z
    where tb.organization_id = p_organization_id
      and tb.treatment_basis_kind <> 'self_pay'
      and pa.status = 'active'
      and pa.care_concluded_on is null
      -- Ohne Anschluss: keine juengere Grundlage derselben Person.
      and not exists (
        select 1 from public.treatment_bases neu
        where neu.patient_id = tb.patient_id
          and neu.organization_id = p_organization_id
          and (neu.issued_on, neu.created_at) > (tb.issued_on, tb.created_at)
      )
  )
  select k.id, k.patient_id, k.prescriber_id, k.treatment_basis_kind, k.issued_on,
         k.follow_up_recommendation, k.prescribed, k.used, k.planned, k.letzter
  from kandidaten k
  where k.prescribed is not null
    and (
      k.used >= k.prescribed
      or (
        greatest(k.used, k.planned) >= k.prescribed
        and k.letzter is not null
        and k.letzter <= now() + app.reminder_prescription_horizon()
      )
    )
$$;
