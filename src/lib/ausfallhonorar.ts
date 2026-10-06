/**
 * Die Regel zum Ausfallhonorar in einem Wortlaut (PROJECT_PRINCIPLES.md §8,
 * ADR-018 Punkt 8 und 9; DSN-001 4.1).
 *
 * Dieselben Sätze stehen in der Datenschutzinformation der Praxis und auf der
 * Plattform vor dem Absagewunsch (POR-010, ANN-244). Die Praxisstammdaten
 * haben kein Feld dafür; bis eine Praxis eigene Sätze pflegen kann, gilt
 * dieser eine Wortlaut. **Kein Betrag**: Die Höhe steht im Leistungskatalog
 * (ABR-001), der Text verweist auf die Preisliste.
 */
export const AUSFALLHONORAR_REGEL: readonly string[] = [
  'Einen Termin, den Sie nicht wahrnehmen können, sagen Sie bitte spätestens 24 Stunden vor Beginn ab. Maßgeblich ist, wann Ihre Absage bei uns eingeht — auch auf dem Anrufbeantworter.',
  'Geht die Absage weniger als 24 Stunden vor Beginn ein, berechnen wir ein Ausfallhonorar. Genau 24 Stunden vorher genügt.',
  'Bei einem Hausbesuch gilt dasselbe, wenn wir Sie nicht antreffen: Wir warten 15 Minuten, klingeln und rufen Sie an. Erreichen wir Sie so nicht, berechnen wir ein Ausfallhonorar.',
  'Sagen wir einen Termin ab, entsteht für Sie selbstverständlich keine Gebühr.',
  'Die Höhe des Ausfallhonorars steht in unserer aktuellen Preisliste.',
];

/** Der eine Satz vor dem Absagewunsch, wenn die Frist schon unterschritten ist. */
export const AUSFALLHONORAR_SPAET =
  'Ihr Termin beginnt in weniger als 24 Stunden. Für diese Absage berechnen wir ein Ausfallhonorar nach unserer Preisliste.';

/** Der Satz, wenn die Frist noch eingehalten ist. */
export const AUSFALLHONORAR_RECHTZEITIG =
  'Ihre Absage geht rechtzeitig ein: Ihr Termin beginnt in mehr als 24 Stunden, es entsteht kein Ausfallhonorar.';
