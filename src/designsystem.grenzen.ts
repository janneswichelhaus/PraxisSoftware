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
  'breiten' | 'details' | 'divideY' | 'knoepfe' | 'tabellen' | 'ueberschriften',
  Readonly<Record<string, number>>
> = {
  breiten: {
    'features/billing': 1,

    'features/tours': 3,
  },
  details: {
    'features/appointments': 3,

    'features/assessments': 2,

    'features/datenschutz': 1,

    'features/files': 1,

    'features/tours': 1,

    'features/treatment-bases': 1,
  },
  divideY: {
    app: 1,

    'features/appointments': 1,

    'features/datenschutz': 1,
  },
  knoepfe: {
    app: 2,

    'features/appointments': 9,

    'features/billing': 1,

    'features/datenschutz': 1,

    'features/documentation': 1,

    'features/files': 1,

    'features/platform': 1,

    'features/today': 1,

    'features/tours': 2,

    'features/treatment-bases': 4,
  },
  tabellen: {
    'features/statistics': 1,

    'features/training': 1,

    'features/vacation': 1,
  },
  ueberschriften: {
    app: 1,

    'features/appointments': 4,

    'features/documentation': 4,

    'features/patients': 1,

    'features/today': 3,

    'features/treatment-bases': 1,
  },
};
