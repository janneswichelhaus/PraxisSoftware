import { describe, expect, it } from 'vitest';
import { ANMELDEN_TITEL, MARKE, TAB_NAMEN, tabName, tabTitel } from './tabtitel';

/**
 * Tab-Titel je Route (BEF-050, Option 1; RAH-008).
 *
 * Zweierlei wird festgehalten: die Tabelle des Handoffs vom 2026-10-05 - und
 * dass kein Titel Daten trägt. Eine Kennung aus dem Pfad, ein Name, ein
 * klinisches Wort: nichts davon darf im Tab stehen (ADR-011, ADR-013 Punkt 9).
 */
describe('tabTitel', () => {
  it.each([
    ['/', 'Übersicht – Own Motion'],
    ['/offen', 'Übersicht – Own Motion'],
    ['/offen/anrufe', 'Übersicht – Own Motion'],
    ['/kalender', 'Kalender – Own Motion'],
    ['/kalender/tag-umplanen', 'Kalender – Own Motion'],
    ['/touren', 'Kalender – Own Motion'],
    ['/patienten', 'Patient:innen – Own Motion'],
    ['/patienten/neu', 'Akte – Own Motion'],
    ['/patienten/66666666-6666-4666-8666-000000000001', 'Akte – Own Motion'],
    ['/patienten/66666666-6666-4666-8666-000000000001/doku', 'Akte – Own Motion'],
    ['/patienten/66666666-6666-4666-8666-000000000001/bearbeiten', 'Akte – Own Motion'],
    ['/patienten/66666666-6666-4666-8666-000000000001/verordnungen/neu', 'Akte – Own Motion'],
    ['/termine/neu', 'Termin – Own Motion'],
    ['/termine/77777777-7777-4777-8777-000000000001', 'Termin – Own Motion'],
    ['/termine/77777777-7777-4777-8777-000000000001/bearbeiten', 'Termin – Own Motion'],
    ['/termine/77777777-7777-4777-8777-000000000001/abschluss', 'Dokumentation – Own Motion'],
    [
      '/termine/77777777-7777-4777-8777-000000000001/dokumentation/n1/bearbeiten',
      'Dokumentation – Own Motion',
    ],
    ['/warteliste', 'Warteliste – Own Motion'],
    ['/warteliste/neu', 'Warteliste – Own Motion'],
    ['/verordner', 'Verordner:innen – Own Motion'],
    ['/verordner/neu', 'Verordner:innen – Own Motion'],
    ['/verordner/p1/bearbeiten', 'Verordner:innen – Own Motion'],
    ['/abrechnung', 'Abrechnung – Own Motion'],
    ['/abrechnung/zahlungen', 'Abrechnung – Own Motion'],
    ['/abrechnung/rechnungen/0f0fede1-842c-4168-b66f-9004ff4c6516', 'Rechnung – Own Motion'],
    ['/abrechnung/rechnungen/0f0fede1-842c-4168-b66f-9004ff4c6516/druck', 'Rechnung – Own Motion'],
    ['/abrechnung/erinnerungen/e1', 'Rechnung – Own Motion'],
    ['/statistiken', 'Statistiken – Own Motion'],
    ['/praxis/team', 'Organisatorisches – Own Motion'],
    ['/praxis/sicherheit/audit', 'Organisatorisches – Own Motion'],
    ['/betrieb/flotte', 'Organisatorisches – Own Motion'],
    ['/team', 'Kommunikation – Own Motion'],
    ['/training', 'Training – Own Motion'],
    ['/training/r1', 'Training – Own Motion'],
    ['/mein-konto', 'Mein Konto – Own Motion'],
    ['/bereiche', 'Alle Bereiche – Own Motion'],
    ['/vorschau/protokoll', 'Vorschau-Protokoll – Own Motion'],
  ])('%s → %s', (pfad, titel) => {
    expect(tabTitel(pfad)).toBe(titel);
  });

  it('bleibt bei der Marke, wo keine Regel greift', () => {
    expect(tabTitel('/p')).toBe(MARKE);
    expect(tabTitel('/p/zugaenge')).toBe(MARKE);
    expect(tabTitel('/gibt-es-nicht')).toBe(MARKE);
    expect(tabName('/p')).toBeUndefined();
  });

  it('nennt die Türseiten „Anmelden"', () => {
    expect(ANMELDEN_TITEL).toBe('Anmelden – Own Motion');
  });

  it('trägt nie Daten: jeder Titel kommt aus der festen Menge, nichts aus dem Pfad', () => {
    // Pfade mit Kennungen, Namen und klinischen Wörtern, wie sie in der
    // Adresszeile stehen könnten - nichts davon darf durchschlagen.
    const pfade: [string, string[]][] = [
      ['/patienten/66666666-6666-4666-8666-000000000001/doku', ['66666666', '000000000001']],
      ['/patienten/Max-Mustermann', ['Max', 'Mustermann']],
      [
        '/termine/77777777-7777-4777-8777-000000000001/dokumentation/n1/nachtrag',
        ['77777777', 'n1', 'nachtrag'],
      ],
      ['/abrechnung/rechnungen/R-2026-0001', ['R-2026-0001', '2026']],
      ['/training/Erika', ['Erika']],
      ['/kalender/Erika', ['Erika']],
    ];
    for (const [pfad, daten] of pfade) {
      const titel = tabTitel(pfad);
      const name = titel.replace(` – ${MARKE}`, '');
      expect(TAB_NAMEN as readonly string[], pfad).toContain(name);
      for (const teil of daten) {
        expect(titel.toLowerCase(), `${pfad} → ${titel}`).not.toContain(teil.toLowerCase());
      }
    }
  });
});
