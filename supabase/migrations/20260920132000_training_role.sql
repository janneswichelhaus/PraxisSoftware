-- =============================================================================
-- LEI-003: Trainingsbetreuung - die Rolle, die "kein Durchgriff" besetzt
--
-- ADR-021 Punkt 6 zieht eine Grenze: Wer nur die Trainingsrolle hat, sieht
-- keine Befunde - und umgekehrt. Die Konsequenzen desselben ADR halten fest,
-- dass es diese Rolle bis jetzt nicht gibt und die Regel deshalb "ins Leere
-- laeuft, weil es nichts gibt, das nur das Training sieht".
-- PROJECT_PRINCIPLES.md §4.9 (Version 0.13) beschreibt sie und ueberlaesst
-- ihren Schluessel ausdruecklich dem SPEC dieses Loops.
--
-- DER SCHLUESSEL IST `trainer`. Kurz und englisch wie die fuenf vorhandenen
-- (`owner`, `therapist`, `team_lead`, `office`, `patient`); die Beschriftung
-- traegt das Wort der Prinzipien. "PT" kommt als Abkuerzung nirgends vor
-- (ADR-021 Punkt 9).
--
-- WAS DIESE MIGRATION NICHT TUT:
--
--   * Sie macht die Rolle NICHT ueber die Zugangsverwaltung zuweisbar.
--     `app.assert_staff_role_keys` bleibt unveraendert. Ein Konto mit dieser
--     Rolle und ohne Trainingsbereich faende eine leere Anwendung vor; die
--     Rolle wird zuweisbar, wenn es etwas zu bedienen gibt (E18 Schritt 7).
--     Dieselbe Trennung wie bei `patient`, das dort ebenfalls fehlt.
--   * Sie legt KEINE Schreibwege an. Anlegen, Aendern und Beenden eines
--     Trainingsverhaeltnisses (§4.9) gehoeren zum Trainingsbereich.
--   * Sie fuehrt KEINE neuen Auditereignisse ein. Ereignisse entstehen mit
--     den Vorgaengen, die sie ausloesen; ein Katalogwert ohne Vorgang waere
--     ein Filter, der ins Leere laeuft (ADR-010, ADR-014).
-- =============================================================================

insert into public.roles (key, label, description, sort_order) values
  ('trainer', 'Trainingsbetreuung',
   'Betreut Trainingsverhaeltnisse (PROJECT_PRINCIPLES.md 4.9). Kein Zugriff auf Patientenakten, Befunde, Behandlungsdokumentation oder Verordnungen.',
   45);

-- -----------------------------------------------------------------------------
-- Wer das Trainingsverhaeltnis liest
--
-- Drei Rollen, und jede aus einem anderen Grund (PROJECT_PRINCIPLES.md §4.8,
-- Tabelle):
--
--   owner    Vertragspartner beider Verhaeltnisse - die einzige Rolle, die
--            beide Bereiche aus sich heraus traegt.
--   trainer  Der Bereich selbst (§4.9).
--   office   Im Training ausdruecklich "nur organisatorisch": Termin,
--            Vertragsstatus, erbrachte Leistung, Rechnung, Zahlung. Genau das
--            steht in dieser Tabelle - Screening- und Gesundheitsangaben
--            stehen nicht darin und bleiben fuer office gesperrt, bis die
--            DSFA sie bewertet (Anfrage B2).
--
-- NICHT dabei: `therapist` und `team_lead`. Der offene Zugriff aller
-- Therapeut:innen auf alle Akten (§4.2, ADR-004 Punkt 2) gilt INNERHALB des
-- Behandlungsverhaeltnisses und begruendet keinen Zugriff auf Trainingsdaten
-- (ADR-021 Punkt 6). Und nicht `patient`: Wer beide Verhaeltnisse hat, sieht
-- sie auch in der eigenen Sicht getrennt (§4.8); die eigene Sicht auf das
-- Training gehoert zu §4.10 und damit zu einer Rolle, die es noch nicht gibt.
-- -----------------------------------------------------------------------------
create or replace function app.can_read_training_relationships()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_any_role('owner', 'trainer', 'office')
$$;

comment on function app.can_read_training_relationships() is
  'Rollen mit Lesezugriff auf Trainingsverhaeltnisse (PROJECT_PRINCIPLES.md 4.8/4.9, ADR-021 Punkt 6). Ohne die therapeutischen Rollen - das ist der Punkt.';

revoke all on function app.can_read_training_relationships() from public, anon;
grant execute on function app.can_read_training_relationships() to authenticated;

create policy training_relationships_select_scoped
  on public.training_relationships for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and app.can_read_training_relationships()
  );

-- -----------------------------------------------------------------------------
-- Die Identitaet: jetzt auch der Zweig der Trainingsseite
--
-- LEI-001 hat die Sicht der vier Behandlungsrollen auf die Personen ihres
-- Bereichs eingegrenzt und den zweiten Zweig offen gelassen, weil es
-- niemanden gab, dem er etwas gezeigt haette. Jetzt gibt es ihn.
--
-- Die Regel ist in beide Richtungen dieselbe: Sichtbar ist eine Person dort,
-- wo ein Verhaeltnis zu ihr besteht. `owner` und `office` stehen in beiden
-- Zweigen und sehen deshalb beides - das ist kein Durchgriff, sondern die
-- Haeufung zweier Zugehoerigkeiten an einer Rolle, die §4.8 ausdruecklich
-- erlaubt. Verboten ist der SCHLUSS von einer Rolle auf den anderen Bereich,
-- und den macht keine der beiden Bedingungen.
-- -----------------------------------------------------------------------------
drop policy persons_select_scoped on public.persons;

create policy persons_select_scoped
  on public.persons for select to authenticated
  using (
    organization_id = app.current_organization_id()
    and (
      id = app.current_person_id()
      or (
        app.is_staff()
        and (
          exists (select 1 from public.patients x      where x.person_id = persons.id)
          or exists (select 1 from public.staff_members x where x.person_id = persons.id)
        )
      )
      or (
        app.can_read_training_relationships()
        and exists (
          select 1 from public.training_relationships x where x.person_id = persons.id
        )
      )
    )
  );

comment on policy persons_select_scoped on public.persons is
  'Zugriff folgt dem Verhaeltnis, nicht der Person (PROJECT_PRINCIPLES.md 4.8, ADR-021 Punkt 6): Jede Rolle sieht die Personen ihres Leistungsbereichs, jede und jeder die eigene.';
