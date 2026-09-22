import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LocationErrorCode, MatrixResult } from '@/lib/location/contract';
import type { Matrixergebnis } from '@/lib/location/matrix';
import { Fahrzeitmatrix } from './Fahrzeitmatrix';

/**
 * Die Tabelle der Fahrzeiten (MAP-004c).
 *
 * Geprüft wird, was auf dem Bildschirm steht: die richtige Zahl in der
 * richtigen Zelle, die Markierung dort, wo die Zeit nicht reicht, und jeder
 * Fehlerzustand mit eigenem Satz. Abgerufen wird hier nichts.
 */

const STOPPS = [
  { position: { lat: 48.5216, lon: 9.0576 }, label: '1' },
  { position: { lat: 48.5305, lon: 9.049 }, label: '2' },
  { position: { lat: 48.5164, lon: 9.0349 }, label: '3' },
];

/**
 * Drei Stopps im erfundenen Raster: Termin 1 endet 8:30, Termin 2 beginnt
 * 8:45, Termin 2 endet 9:15, Termin 3 beginnt 9:30. Zwischen zwei benachbarten
 * Terminen liegen also 15 Minuten, davon 5 Minuten Puffer — 10 Minuten Fahrt
 * passen genau, 11 Minuten nicht mehr. Von 1 nach 3 liegt eine Stunde
 * dazwischen; dort passt auch eine lange Fahrt.
 */
const FAHRZEITEN: MatrixResult = {
  durationsSeconds: [
    [0, 600, 1500],
    [660, 0, 660],
    [1500, 660, 0],
  ],
};

const MATRIX: Matrixergebnis = {
  ok: true,
  value: { matrix: FAHRZEITEN, quelle: 'anbieter' },
};

function zelle(von: string, nach: string) {
  // Ein Vergleich statt eines gebauten Musters: Die Beschriftung steht im
  // Namen der Zelle, und ein `RegExp` aus Variablen ist hier weder noetig
  // noch erlaubt (eslint security/detect-non-literal-regexp).
  return screen.getByRole('cell', {
    name: (name: string) => name.includes(`von ${von} nach ${nach}`),
  });
}

function tabelle(ergebnis: Matrixergebnis = MATRIX, erneutVersuchen = () => {}) {
  return render(
    <Fahrzeitmatrix
      stopps={STOPPS}
      laedt={false}
      ergebnis={ergebnis}
      erneutVersuchen={erneutVersuchen}
    />,
  );
}

describe('Fahrzeitmatrix', () => {
  it('zeigt je Paar eine Fahrzeit', () => {
    tabelle();

    // Kopfzeile plus drei Stopps.
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(zelle('1', '2')).toHaveTextContent('10 Min.');
    expect(zelle('1', '3')).toHaveTextContent('25 Min.');
    expect(zelle('2', '3')).toHaveTextContent('11 Min.');
  });

  it('markiert das Paar, dessen Fahrzeit nicht mehr in die Luecke passt', () => {
    tabelle();

    // 10 Minuten plus 5 Minuten Puffer passen in 15 Minuten - genau.
    expect(zelle('1', '2').textContent).not.toContain('nicht erreichbar');
    expect(zelle('1', '2').textContent).toContain('erreichbar');
    // 11 Minuten passen nicht mehr.
    expect(zelle('2', '3').textContent).toContain('nicht erreichbar');
    // Eine Stunde Luecke traegt auch 25 Minuten Fahrt.
    expect(zelle('1', '3').textContent).not.toContain('nicht erreichbar');
  });

  it('haelt die Fahrt rueckwaerts durch den Tag fuer nicht erreichbar', () => {
    tabelle();

    // Termin 2 endet um 9:15, Termin 1 begann um 8:00: Die Luecke ist negativ,
    // und daran aendert auch eine kurze Fahrt nichts.
    expect(zelle('2', '1').textContent).toContain('nicht erreichbar');
  });

  it('haengt die Bedeutung nicht allein an der Farbe', () => {
    tabelle();

    // Das Zeichen steht sichtbar in der Zelle, das Wort fuer Vorlesesoftware
    // daneben (WCAG 1.4.1, Design System: Farbe traegt nie allein).
    expect(zelle('2', '3').textContent).toContain('×');
    expect(zelle('1', '2').textContent).not.toContain('×');
  });

  it('sagt bei einer Zelle ohne Fahrzeit nicht "erreichbar"', () => {
    tabelle({
      ok: true,
      value: {
        matrix: {
          durationsSeconds: [
            [0, null, null],
            [null, 0, null],
            [null, null, 0],
          ],
        },
        quelle: 'anbieter',
      },
    });

    expect(zelle('1', '2').textContent).toContain('keine Fahrzeit');
    expect(zelle('1', '2').textContent).not.toContain('erreichbar');
  });

  it('nennt die Diagonale als denselben Stopp und nicht als Fahrzeit null', () => {
    tabelle();

    expect(zelle('1', '1').textContent).toContain('derselbe Stopp');
    expect(zelle('1', '1')).not.toHaveTextContent('unter 1 Min.');
  });

  /**
   * Bis 2026-09-22 stand hier „Das Terminraster ist erfunden". Geprüft wird
   * seitdem die Rechengrundlage statt der Kennzeichnung: Ein Urteil
   * „passt nicht" ist ohne die 45 und die 5 Minuten nicht nachvollziehbar, und
   * genau das darf nicht stillschweigend verschwinden.
   */
  it('nennt die Rechengrundlage des Urteils und dass es keine Sperre ist', () => {
    tabelle();

    expect(screen.getByText(/alle 45 Minuten ein Termin/)).toBeInTheDocument();
    expect(screen.getByText(/5 Minuten neben der Fahrt/)).toBeInTheDocument();
    expect(screen.getByText(/keine Sperre/)).toBeInTheDocument();
  });

  /**
   * Die Tagesfolge ist seit BEF-031 das Erste auf dem Bildschirm: die Frage,
   * die auf dem Rad zaehlt, in sieben Zeilen statt 64 Zellen.
   */
  describe('Der Tag in Folge', () => {
    function folge() {
      return within(screen.getByRole('list', { name: 'Der Tag in Folge' })).getAllByRole(
        'listitem',
      );
    }

    it('nennt je Paar Fahrzeit, Luecke und den Rest', () => {
      tabelle();

      const zeilen = folge();
      // Drei Stopps ergeben zwei Uebergaenge - nicht drei.
      expect(zeilen).toHaveLength(2);
      expect(zeilen[0]!).toHaveTextContent('1 → 2');
      expect(zeilen[0]!).toHaveTextContent('8:30 bis 8:45');
      expect(zeilen[0]!).toHaveTextContent('10 Min. Fahrt');
    });

    it('sagt "passt genau", wenn die Luecke auf die Minute reicht', () => {
      tabelle();
      // 15 Minuten Luecke, 10 Minuten Fahrt, 5 Minuten daneben: nichts uebrig.
      expect(folge()[0]!).toHaveTextContent('passt genau');
    });

    it('nennt die fehlenden Minuten, wenn es nicht reicht', () => {
      tabelle();
      // 15 Minuten Luecke, 11 Minuten Fahrt, 5 Minuten daneben: eine zu wenig.
      expect(folge()[1]!).toHaveTextContent('1 Min. zu wenig');
    });

    it('nennt die uebrige Zeit, wenn die Luecke reicht', () => {
      tabelle({
        ok: true,
        value: {
          matrix: {
            durationsSeconds: [
              [0, 300, 1500],
              [660, 0, 660],
              [1500, 660, 0],
            ],
          },
          quelle: 'anbieter',
        },
      });
      // 15 Minuten Luecke, 5 Minuten Fahrt, 5 Minuten daneben: 5 uebrig.
      expect(folge()[0]!).toHaveTextContent('passt, 5 Min. übrig');
    });

    it('sagt bei fehlender Fahrzeit nichts ueber die Erreichbarkeit', () => {
      tabelle({
        ok: true,
        value: {
          matrix: {
            durationsSeconds: [
              [0, null, 1500],
              [660, 0, 660],
              [1500, 660, 0],
            ],
          },
          quelle: 'anbieter',
        },
      });

      expect(folge()[0]!).toHaveTextContent('keine Fahrzeit');
      expect(folge()[0]!).toHaveTextContent('nicht beurteilt');
      expect(folge()[0]!).not.toHaveTextContent('passt');
    });

    it('legt die vollstaendige Tabelle weg, ohne sie zu verstecken', async () => {
      tabelle();

      const aufklappen = screen.getByText(/Alle Paare als Tabelle/);
      expect(aufklappen).toBeInTheDocument();
      // Zugeklappt: Der Inhalt haengt an einem `details`, das nicht offen ist.
      expect(aufklappen.closest('details')!.open).toBe(false);

      await userEvent.click(aufklappen);
      expect(aufklappen.closest('details')!.open).toBe(true);
      expect(zelle('1', '2')).toBeInTheDocument();
    });
  });

  it('weist die Nachbildung als solche aus', () => {
    tabelle({ ok: true, value: { matrix: FAHRZEITEN, quelle: 'nachbildung' } });

    expect(screen.getByText(/Nachbildung ohne Kartendienst/)).toBeInTheDocument();
  });

  it('zeigt waehrend des Abrufs keine Tabelle', () => {
    render(
      <Fahrzeitmatrix stopps={STOPPS} laedt ergebnis={undefined} erneutVersuchen={() => {}} />,
    );

    expect(screen.getByText('Fahrzeiten werden berechnet …')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it.each([
    ['not_configured', 'Kein Kartendienst eingerichtet'],
    ['session_invalid', 'Anmeldung gilt nicht mehr'],
    ['rate_limited', 'Kontingent erschöpft'],
    ['timeout', 'Zeitüberschreitung'],
  ] as [LocationErrorCode, string][])('nennt die Fehlerklasse %s beim Namen', (code, titel) => {
    tabelle({ ok: false, error: { code, message: 'technische Meldung' } });

    expect(screen.getByText(titel)).toBeInTheDocument();
    // Die technische Meldung bleibt im Log und nicht auf dem Bildschirm.
    expect(screen.queryByText(/technische Meldung/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('laesst den Versuch wiederholen', async () => {
    const erneut = vi.fn();
    tabelle({ ok: false, error: { code: 'timeout', message: 'x' } }, erneut);

    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(erneut).toHaveBeenCalledTimes(1);
  });
});
