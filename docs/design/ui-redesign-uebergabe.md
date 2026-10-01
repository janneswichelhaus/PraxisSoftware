# UI-Redesign — Übergabe für die Fortsetzung

Stand 2026-10-01 · gilt, bis Schritt 6 gemergt ist; danach löschen.

Diese Datei ersetzt für eine neue Session das Gespräch, in dem die Schritte 0 bis 5 entstanden
sind, und den Download-Ordner des Design-Handoffs. Die Spezifikation steht in
[`handoff-2026-10-01-uebersicht-termin-akte.md`](handoff-2026-10-01-uebersicht-termin-akte.md);
die klickbaren Entwürfe (`entwuerfe/`) liegen bewusst nicht im Repository und sind für die
Schritte 4 bis 6 nicht nötig — die Maße stehen in der Spezifikation.

**Als Nächstes: Schritt 6 (Kalender-Kacheln).** Jannes hat ihn noch nicht freigegeben; die neue
Session beginnt ihn erst auf sein Wort („mach weiter mit Schritt 6").

## Auftrag (aus `AUFTRAG-CLAUDE-CODE.md` des Handoffs, wörtlich)

Geltungsbereich: Übersicht (`src/features/today`), Termin
(`src/features/appointments/AppointmentDetailPage.tsx`), Patientenakte
(`src/features/patients/PatientRecordLayout.tsx` + Bereiche) und die dafür nötigen Bausteine in
`src/components/ui`.

Regeln:

- Abläufe, Routen, Rückweg, Rollenprüfungen, Serverfunktionen, Audit-Verhalten und Begriffe aus
  `src/lib/begriffe.ts` bleiben unverändert. Es ändern sich Werte und Anordnung, dazu kommen neue
  Bausteine (README Abschnitt 3 und 5a).
- Farben, Radien, Schriftgrößen ausschließlich aus `src/index.css` `@theme`; neue Tokens nur die
  im README genannten (`text-h2-mobil`, Zweispalten-Schwelle, Kachel-Abstand,
  `--color-warnung-mittel`). Kontrast-Test für neue Paare ergänzen.
- Keine Schatten, keine Verläufe, keine Icon-Bibliothek. Status immer Zeichen + Wort. Bedienziele
  ≥ 44 px.
- Bestehende Tests bleiben grün; neue Bausteine bekommen Tests in
  `src/components/ui/bausteine.test.tsx`.
- Vor jeder PR: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm docs:check`.
  Jede PR mit Bildschirmfotos Desktop und 375 px.

Schritte, je Schritt eine PR, danach warten auf meine Sichtung:

0. Spezifikation ins Repository, in `docs/STATUS.md` verlinken.
1. Tokens und Gerüst (README 2, 3 „Geänderte Werte", 4). Kalender nicht anfassen.
2. Bausteine (README 3 und 5a).
3. Übersicht als Zeitstrahl (README 5 und 5a).
4. Termin (README 6).
5. Patientenakte (README 7).
6. Kalender-Kacheln ohne Schatten und ohne orangene Kante (README 3, letzte Tabellenzeile).

Nenne vor jedem Schritt die Dateien, die du änderst, und was sich sichtbar ändert; dann baue.
Weicht das Repo von der Spezifikation ab (fehlende Daten, andere Rollenlogik), sag es und schlag
die kleinste Lösung vor, statt die Spezifikation stillschweigend zu ändern.

## Stand der Branches

Die fünf Branches sind gepusht und **aufeinander gestapelt**; keiner liegt auf `main` (geprüft
2026-10-01, `main` bei PR #154, kein Branch liegt hinter `main`). Die Pull Requests öffnet Jannes.

| Schritt | Branch                               | Inhalt                                         |
| ------- | ------------------------------------ | ---------------------------------------------- |
| 0       | `claude/ui-redesign-0-handoff`       | Spezifikation abgelegt                         |
| 1       | `claude/ui-redesign-1-geruest`       | Tokens, Kopfzeile, Seitentitel, Karte, Badge   |
| 2       | `claude/ui-redesign-2-bausteine`     | `TravelBar`, `ListRow`, `StatusMark`, … `Tile` |
| 3       | `claude/ui-redesign-3-uebersicht`    | Übersicht als Zeitstrahl, diese Übergabe       |
| 4       | `claude/ui-redesign-step-3-4-vkmodh` | Termin (Abschnitt 6)                           |

**Schritt 6 zweigt vom Branch der Schritte 4 und 5 ab**, solange die Schritte davor nicht gemergt
sind; sind sie es, von `main`. Die Schritte 4 und 5 liegen auf dem Branch, den die Session vorgab
(`claude/ui-redesign-step-3-4-vkmodh`), je ein Commit. Vor dem Bauen
`git fetch origin --prune` und prüfen, ob `main` inzwischen weiter ist — dann `main` in den neuen
Branch hereinnehmen, nicht die alten Branches umschreiben.

## Entscheidungen von Jannes (2026-10-01)

- **Bausteine:** „Kachel" und „Aufklapper" aus dem README sind die erweiterten `Tile` und
  `Disclosure`, nicht neu gebaut. Neue Bausteine heißen englisch (`TravelBar`, `ListRow`,
  `StatusMark`, `ProgressDots`, `NowMarker`), die Props wie im README.
- **Schritt 4:** Der Ablauf am Termin bleibt der aus UX-EPIC-005 — Knopf „Niemand öffnet?" mit der
  Schrittfolge, Datum und Zeit im Kopf, keine Tabelle. Aus README Abschnitt 6 kommen nur Maße und
  Anordnung; wo Abschnitt 6 einen anderen Ablauf beschreibt (Karte „Was ist passiert?" mit drei
  Zeilen, Kachel „Wann"), gilt der Bestand.
- **ANN-194** (Route des Tages beim Öffnen der Übersicht): von Jannes entschieden, bleibt im
  Prüfpaket für die Datenschutzprüfung.
- **Offen bei Jannes:** ANN-195, ANN-196, ANN-197 und die Frage, ob „Liege heute: Nein" stehen
  bleibt (die Spezifikation verlangt die Zeile, UX-EPIC-005 hatte sie gestrichen).

- **Schritt 4 gebaut (2026-10-01):** Kicker „Termin"/„Fehlzeit" über dem Namen (`PageHeader`
  `kicker`), Kachelreihe 150 px, „Navigation starten →" als Textlink (`NavigationZumTermin`
  `textlink`), „Vor der Tür" als Karte, Karte „Nach dem Termin", Zustandskarte mit „Termin wieder
  öffnen", Absage leise am Ende, Abrechnung als Kontextspalte nur für owner/office.

- **Schritt 5 gebaut (2026-10-01):** Kopf der Akte mit Kacheln (`KopfKacheln`), Kontextspalte
  (`useAktuelleGrundlage`, `useOffeneErstaufnahme`, neuer Baustein `ProgressBar`), Kacheln im
  Terminbereich, „Vergangene Termine“ als `Disclosure`, Karte „Verwaltung“ in den Stammdaten.
  Prüfseite `tests/e2e/fixtures/akte.html` (`?bereich=stammdaten`, `?rolle=office`, `?leer=1`).

## Was bereits anders ist als die Spezifikation

Damit die Schritte 4 bis 6 dieselbe Linie halten:

- Zweispalten-Schwelle als Container-Query (`--container-zweispaltig: 900px`, Klasse
  `@zweispaltig:`), nicht als Breakpoint; zwei Kachel-Abstände (`--spacing-kachel-x`, `-y`).
- 13 px gibt es nicht als Token; wo das README 13 nennt, steht `text-sm` (14).
- Wegbalken-Legende ohne Farbpunkte; kein `ton="dunkel"`.
- Der Oberflächentext „Mein Tag" ist verboten (`src/lib/begriffe.test.ts`); die versteckte
  Überschrift des Zeitstrahls heißt „Tagesablauf".
- Termin: keine Karte „Angaben"/„Alle Angaben" (wiederholte den Kopf als Tabelle, die seit
  UX-005a weg ist); einspaltig, wenn die Abrechnung nicht sichtbar ist. „Vor der Tür" öffnet nie
  von selbst (jedes Öffnen ist ein protokolliertes Lesen, ANN-137). Die Grundlage bleibt neutral,
  die Akzentfläche trägt die Ausnahme Praxis-/Videotermin (ANN-192); das Kennzeichen steht dort
  auf Papier statt als Abzeichen.
- Akte: siehe [`../sichtung/ui-redesign.md`](../sichtung/ui-redesign.md), „Akte anders als im
  Handoff“. Wer neben der Kontextspalte steht, wählt seine Spalten über Container-Queries
  (`@container`, `@5xl`/`@2xl`), nie über die Fensterbreite.
- Nicht gebaut, im Ideenspeicher (`docs/product/ideen/10-praxisverwaltung.md`): Feld
  `home_visit_floor` (`IDEA-PRX-050`), Wochentakt der Liege (`IDEA-PRX-051`), Abschlussmeldung auf
  der Übersicht (`IDEA-PRX-052`).

## Arbeitsweise je Schritt

1. Klassifizieren (K1): reine Oberfläche ohne Auslöser nach ADR-013 Punkt 9 — außer der Schritt
   braucht einen neuen Lesepfad oder Datenfluss; dann ansagen, nicht bauen.
2. Dateien und sichtbare Änderung nennen, Abweichungen mit der kleinsten Lösung ansagen, bauen.
3. Vorhandene Bausteine verwenden, nicht neu bauen: `Tile`/`TileGrid` (`zusatz`, `aktion`,
   `spalte`), `Disclosure` (`anzahl`, `kopf`, `inKarte`, `offenAb`), `ListRow`/`ListRows`,
   `StatusMark`, `TravelBar`. Alle zeigt `tests/e2e/fixtures/ui-bausteine.html`.
4. Dokumente nachführen: `docs/STATUS.md` (höchstens 60 Zeilen — den vorhandenen Absatz ändern,
   keine Zeile anhängen), [`../sichtung/ui-redesign.md`](../sichtung/ui-redesign.md) um die
   Schritte des Abschnitts ergänzen (höchstens 15), neue Annahmen ab **ANN-198**, Ideen ab
   **IDEA-PRX-053** — beide Nummern vorher gegen `origin/main` prüfen.
5. Ein Commit je Schritt, pushen, Pull Request, berichten, auf die Sichtung warten.

## Prüfen

- Der vollständige Lauf auf Schritt 3 ist nachgeholt (Cloud, Node 22, 2026-10-01): `test` 4061
  grün, `test:e2e` 249 grün und einer übersprungen.
- Für `pnpm test:e2e` keinen eigenen `pnpm dev` ohne die Platzhalter offen lassen: Playwright nutzt
  einen laufenden Server mit, und `login.spec.ts` scheitert dann am Konfigurationsfehler.
- `pnpm test:e2e` ohne Anmeldung braucht in der Cloud die Platzhalter aus der CI
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) und läuft mit einem Worker. Stand Schritt 3
  lokal: 249 grün, einer übersprungen. Die angemeldeten Spezifikationen laufen in der Cloud nicht.
- `pnpm test:db` ist für die Schritte 4 bis 6 nicht nötig, solange kein Server berührt wird.
- **Bildschirmfotos** über die Prüfseiten ohne Anmeldung: `pnpm dev`, dann
  `pnpm screenshots /tests/e2e/fixtures/termin.html` (375 px) und mit `--breite=1280`. Die
  Übersicht hängt an der Uhrzeit: `tests/e2e/fixtures/uebersicht.html` mit `?ansicht=abend`,
  `?ansicht=doku` oder `?ansicht=akte` und gestellter Browseruhr (`page.clock.setFixedTime`, wie in
  `tests/e2e/uebersicht.spec.ts`). Vorher und nachher nebeneinander zeigen.

## Start einer neuen Session

Den Branch `claude/ui-redesign-step-3-4-vkmodh` wählen und schreiben:

> Lies `CLAUDE.md`, `docs/STATUS.md` und `docs/design/ui-redesign-uebergabe.md`. Nenne für
> Schritt 6 (Kalender-Kacheln) die Dateien und die sichtbaren Änderungen und baue ihn.
