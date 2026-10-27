import { describe, expect, it } from 'vitest';
import { eigenerPlan } from './testdaten';
import { naechsterUebungstag, wochenleisteSatz } from './uebungstage';

/** Der Satz unter der Wochenleiste (Handoff 2026-10-24, Abschnitt 3). */
describe('wochenleisteSatz', () => {
  it.each([
    [3, 3, 'Sie üben an 3 Tagen. Empfohlen: 3-\u2060mal pro Woche. Die Tage sehen nur Sie.'],
    [1, 1, 'Sie üben an einem Tag. Empfohlen: einmal pro Woche. Die Tage sehen nur Sie.'],
    [2, null, 'Sie üben an 2 Tagen. Die Tage sehen nur Sie.'],
    [0, 3, 'Wählen Sie die Tage, an denen Sie üben möchten. Empfohlen: 3-\u2060mal pro Woche.'],
    [0, null, 'Wählen Sie die Tage, an denen Sie üben möchten.'],
  ] as const)('sagt bei %s Tagen und %s empfohlen: „%s“', (anzahl, empfohlen, satz) => {
    expect(wochenleisteSatz(anzahl, empfohlen)).toBe(satz);
  });

  it('sagt ohne Netz, wann Ändern wieder geht', () => {
    expect(wochenleisteSatz(3, 3, true)).toBe(
      'Sie üben an 3 Tagen. Ändern geht wieder mit Verbindung.',
    );
    expect(wochenleisteSatz(1, null, true)).toBe(
      'Sie üben an einem Tag. Ändern geht wieder mit Verbindung.',
    );
    expect(wochenleisteSatz(0, 3, true)).toBe(
      'Noch keine Tage gewählt. Wählen geht wieder mit Verbindung.',
    );
  });
});

describe('naechsterUebungstag (Endseite, Handoff 5.5)', () => {
  // 2026-10-24 ist ein Samstag.
  it('nennt den nächsten gewählten Tag nach heute, nicht heute selbst', () => {
    const plan = eigenerPlan({ weekdays: [1, 6], runs_until: '2026-12-31' });
    expect(naechsterUebungstag(plan, '2026-10-24')).toBe('2026-10-26');
    expect(
      naechsterUebungstag(eigenerPlan({ weekdays: [6], runs_until: null }), '2026-10-24'),
    ).toBe('2026-10-31');
  });

  it('ohne gewählte Tage, nach dem Ende oder bei beendetem Plan keinen', () => {
    expect(naechsterUebungstag(eigenerPlan({ weekdays: [] }), '2026-10-24')).toBeNull();
    expect(
      naechsterUebungstag(eigenerPlan({ weekdays: [1], runs_until: '2026-10-25' }), '2026-10-24'),
    ).toBeNull();
    expect(
      naechsterUebungstag(eigenerPlan({ weekdays: [1], status: 'ended' }), '2026-10-24'),
    ).toBeNull();
  });
});
