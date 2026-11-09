/**
 * Obergrenzen der Ratschen-Wächter (`src/designsystem.test.ts`, „Ratsche“;
 * Design-Fundament, ANN-400).
 *
 * Je Muster und Verzeichnis steht hier, wie oft es **höchstens** vorkommen
 * darf - Startwert ist der Stand nach dem Design-Fundament (2026-10-12). Die
 * Muster sind die, die `docs/design/DESIGN.md` durch Bausteine ersetzt:
 *
 *   * `breiten` - `max-w-xl`, `max-w-2xl`, `max-w-3xl` statt der Tokens
 *     `max-w-formular` und `max-w-spalte` (überall in `src/`);
 *   * `details` - ein eigenes `<details>` statt `Disclosure`;
 *   * `divideY` - eine handgebaute Liste mit `divide-y` statt `ListRows`,
 *     `Listenabschnitt` oder `Datenliste`;
 *   * `knoepfe` - ein rohes `<button className=…>` statt `Button`,
 *     `Symbolknopf`, `Chip` oder `Segment`;
 *   * `saetze` - ein satzförmiger Text in JSX statt Titel, Beschriftung und
 *     Knopf (Leitfaden L7, `scripts/saetze.mjs`; auch in Bausteinen);
 *   * `tabellen` - ein `<table>` statt `Datenliste` (ohne Druckblätter);
 *   * `ueberschriften` - ein `<h1>` bis `<h4>` mit eigenen Klassen statt
 *     `PageHeader`, `Objektkopf`, `Section` oder `Zwischentitel` (ohne
 *     Druckblätter).
 *
 * Außer `breiten` zählt nichts in `src/components/ui` - dort wohnen die
 * Bausteine selbst. Druckblätter sind Dateien mit `Druck`, `Print`, `blatt`
 * oder `Briefkopf` im Namen; sie folgen dem Profil „Druckblatt“.
 *
 * **Die Grenze sinkt nur.** Liegt ein Verzeichnis darüber, ist eine Seite
 * nach altem Muster entstanden: nach DESIGN.md bauen, nicht die Grenze
 * heben. Liegt es darunter, hat jemand umgebaut: dann die Zahl hier auf den
 * neuen Stand senken (bei 0 die Zeile löschen) - der Test sagt beides mit
 * der Zahl. Ein Verzeichnis ohne Zeile hat die Grenze 0.
 *
 * Ein Schlüssel je Zeile, alphabetisch, mit einer Leerzeile dazwischen:
 * Mehrere Umbauten nebeneinander ändern so verschiedene, nicht benachbarte
 * Zeilen, und die Zusammenführung der Zweige bleibt ohne Konflikt.
 */
export const GRENZEN: Record<
  'breiten' | 'details' | 'divideY' | 'knoepfe' | 'saetze' | 'tabellen' | 'ueberschriften',
  Readonly<Record<string, number>>
> = {
  breiten: {
    'features/billing': 1,

    'features/calendar/tours': 3,
  },
  details: {
    'features/calendar/appointments': 3,

    'features/clinical/assessments': 2,

    'features/patients/files': 1,

    'features/patients/treatment-bases': 1,

    'features/privacy/datenschutz': 1,
  },
  divideY: {
    app: 1,

    'features/calendar/appointments': 1,

    'features/privacy/datenschutz': 1,
  },
  knoepfe: {
    app: 2,

    'features/billing': 1,

    'features/calendar/appointments': 9,

    'features/calendar/today': 1,

    'features/calendar/tours': 2,

    'features/clinical/documentation': 1,

    'features/patients/files': 1,

    'features/patients/treatment-bases': 4,

    'features/privacy/datenschutz': 1,
  },
  saetze: {
    app: 13,

    'features/billing': 46,

    'features/billing/statistics': 9,

    'features/calendar/appointments': 91,

    'features/calendar/scheduling': 13,

    'features/calendar/slot-search': 4,

    'features/calendar/territories': 9,

    'features/calendar/today': 5,

    'features/calendar/tours': 22,

    'features/calendar/waitlist': 9,

    'features/clinical/assessments': 18,

    'features/clinical/documentation': 55,

    'features/clinical/therapy-reports': 9,

    'features/core/auth': 30,

    'features/core/preview': 3,

    'features/exercise/checkins': 6,

    'features/exercise/exercises': 18,

    'features/fleet': 42,

    'features/nutrition': 20,

    'features/patients': 18,

    'features/patients/files': 22,

    'features/patients/intake': 1,

    'features/patients/timeline': 2,

    'features/patients/training-offers': 6,

    'features/patients/treatment-bases': 10,

    'features/portal/messages': 14,

    'features/portal/platform': 178,

    'features/portal/platform-access': 27,

    'features/privacy/audit': 2,

    'features/privacy/datenschutz': 15,

    'features/privacy/retention': 23,

    'features/teamchat': 44,

    'features/training': 18,

    'features/workforce/reimbursements': 12,

    'features/workforce/staff': 39,

    'features/workforce/timeaccount': 10,

    'features/workforce/vacation': 13,

    'features/workforce/working-time': 9,

    'features/workplace/account': 25,

    'features/workplace/feedback': 9,

    'features/workplace/open-points': 12,

    'features/workplace/practice-settings': 1,
  },
  tabellen: {
    'features/billing/statistics': 1,

    'features/training': 1,
  },
  ueberschriften: {
    app: 1,

    'features/calendar/appointments': 4,

    'features/calendar/today': 3,

    'features/clinical/documentation': 4,

    'features/patients': 1,

    'features/patients/treatment-bases': 1,
  },
};
