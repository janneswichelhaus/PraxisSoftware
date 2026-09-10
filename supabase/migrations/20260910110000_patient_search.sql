-- =============================================================================
-- Serverseitige Patientensuche (UX-004)
--
-- Die Kartei filtert bisher im Browser: die Liste laedt alle Datensaetze und
-- sucht darin. Das ist zweifach ungut - jede Seite mit Suchfeld muesste den
-- gesamten Bestand ausliefern (das Gegenteil von Datenminimierung), und von
-- Kalender oder "Mein Tag" fuehrt ohne Umweg ueber die Liste gar kein Weg zu
-- einer Akte.
--
-- Diese Funktion ist die Suche, die von jeder Seite aus erreichbar sein darf:
--
--   * **Mindestens drei Zeichen.** Eine kuerzere Anfrage liefert eine leere
--     Liste, keinen Fehler. Damit gibt es ueber diesen Weg keine Moeglichkeit,
--     sich den gesamten Bestand anzeigen zu lassen (PROJECT_PRINCIPLES.md 16).
--   * **Harte Obergrenze.** Hoechstens 25 Treffer je Aufruf; die Oberflaeche
--     fragt zehn. Wer mehr braucht, geht in die Kartei.
--   * **Nur Name, Geburtsdatum und Versorgungsstatus.** Keine Adresse, keine
--     Rufnummer, kein Zugangshinweis - fuer die Trefferliste ist beides nicht
--     erforderlich, und das Geburtsdatum ist das Merkmal, an dem sich zwei
--     Namensgleiche unterscheiden lassen. Dieselbe Projektion, die die Kartei
--     ohnehin liefert (ADR-004).
--   * **Umlautunempfindlich und deterministisch**, ohne Erweiterung: siehe
--     app.suchform.
--
-- Kein eigener Auditeintrag. Das Oeffnen einer Akte wird als
-- patient_record.viewed protokolliert (ADR-010); ob auch eine Trefferliste
-- auditpflichtig ist, ist als C4 offen (ADR-004, "Offene Folgefragen"). Diese
-- Funktion legt dazu bewusst nichts fest - sie verhaelt sich wie die
-- bestehende Kartei, die ebenfalls kein Ereignis schreibt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Suchform eines Namens
--
-- Beide Seiten - Name und Suchbegriff - werden durch dieselbe Abbildung
-- geschickt. Weil die Abbildung auf BEIDEN Seiten laeuft, muss sie nicht
-- "richtig" sein, sondern nur gleich: sie darf Unterschiede einebnen, aber
-- keine erfinden.
--
--   Mueller -> muller      Müller -> muller      Muller -> muller
--   Baecker -> backer      Bäcker -> backer
--   Strauß  -> strauss     Strauss -> strauss
--
-- Der Preis ist bekannt und in Kauf genommen: "Neu" und "Nu" fallen zusammen.
-- Fuer eine Praxis mit einigen hundert Akten ist das folgenlos; der Gewinn
-- ist, dass niemand ueberlegen muss, wie ein Name geschrieben wird.
--
-- IMMUTABLE, damit die Funktion spaeter in einem Ausdrucksindex verwendet
-- werden kann, falls der Bestand das je noetig macht.
-- -----------------------------------------------------------------------------
create or replace function app.suchform(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(
           replace(
             replace(
               replace(
                 translate(
                   lower(coalesce(p_text, '')),
                   'äöüàáâãåèéêëìíîïòóôõùúûýñç',
                   'aouaaaaaeeeeiiiioooouuuync'
                 ),
                 'ß', 'ss'
               ),
               'ae', 'a'
             ),
             'oe', 'o'
           ),
           'ue', 'u'
         )
$$;

comment on function app.suchform(text) is
  'Vergleichsform eines Namens fuer die Suche (UX-004): Kleinschreibung, Umlaute und Akzente auf Grundbuchstaben, ae/oe/ue/ss eingeebnet. Wird auf Name UND Suchbegriff angewendet.';

-- -----------------------------------------------------------------------------
-- Mindestlaenge des Suchbegriffs
--
-- Eine Zahl an genau einer Stelle. Sie ist die Grenze zwischen "suchen" und
-- "sich den Bestand anzeigen lassen".
-- -----------------------------------------------------------------------------
create or replace function app.patient_search_min_length()
returns integer
language sql
immutable
set search_path = ''
as $$ select 3 $$;

create or replace function public.search_patients(
  p_query text,
  p_limit integer default 10
)
returns table (
  id            uuid,
  given_name    text,
  family_name   text,
  date_of_birth date,
  status        text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_such  text;
  v_limit integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- SECURITY DEFINER umgeht RLS, deshalb wird die Berechtigung hier selbst
  -- geprueft. Derselbe Schnitt wie die Kartei: wer sie lesen darf, darf in ihr
  -- suchen - die Suche ist kein zweites Recht (ADR-004 Punkt 6).
  if not app.can_read_patient_directory() then
    raise exception 'not allowed to read patient directory' using errcode = '42501';
  end if;

  v_org := app.current_organization_id();
  if v_org is null then
    raise exception 'not allowed to read patient directory' using errcode = '42501';
  end if;

  v_such := app.suchform(btrim(coalesce(p_query, '')));

  -- Zu kurz ist kein Fehler, sondern schlicht kein Treffer. Eine Meldung
  -- taugte hier als Existenz-Orakel und hilft niemandem beim Tippen.
  if length(v_such) < app.patient_search_min_length() then
    return;
  end if;

  v_limit := least(greatest(coalesce(p_limit, 10), 1), 25);

  return query
    select
      p.id,
      pe.given_name,
      pe.family_name,
      pc.date_of_birth,
      p.status
    from public.patients p
    join public.persons pe on pe.id = p.person_id
    left join public.patient_contact_details pc on pc.patient_id = p.id
    where p.organization_id = v_org
      and (
        -- Beide Schreibrichtungen: "Mustermann Max" und "Max Mustermann"
        -- fuehren zum selben Treffer.
        position(v_such in app.suchform(pe.given_name || ' ' || pe.family_name)) > 0
        or position(v_such in app.suchform(pe.family_name || ' ' || pe.given_name)) > 0
      )
    -- Laufende Versorgung zuerst: wer heute behandelt wird, wird oefter
    -- gesucht als ein abgeschlossener Fall.
    order by (p.status = 'active') desc, pe.family_name, pe.given_name, p.id
    limit v_limit;
end;
$$;

comment on function public.search_patients(text, integer) is
  'Serverseitige Patientensuche fuer das Suchfeld auf jeder Seite (UX-004). Mindestens drei Zeichen, hoechstens 25 Treffer, nur Name, Geburtsdatum und Versorgungsstatus.';

revoke all on function public.search_patients(text, integer) from public, anon;
grant execute on function public.search_patients(text, integer) to authenticated;
