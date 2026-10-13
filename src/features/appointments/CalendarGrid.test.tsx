import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import type { CalendarEntry } from './api';
import { CalendarGrid } from './CalendarGrid';

/**
 * Kalender-Kacheln nach dem Design-Handoff vom 2026-10-01 (Abschnitt 3,
 * letzte Zeile): ohne Schatten, die Linie links trägt den Zustand statt einer
 * Farbe je Person. Das Wort steht weiter in der Kachel (KAL-23).
 */
function termin(teil: Partial<CalendarEntry>): CalendarEntry {
  return {
    id: 'ter-1',
    patient_id: 'pat-1',
    staff_member_id: 'st-1',
    location_id: null,
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: '2027-05-12T07:00:00.000Z',
    ends_at: '2027-05-12T08:00:00.000Z',
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    location_name: null,
    ...teil,
  };
}

const ZUSTAENDE: Array<[CalendarEntry['status'], string, string]> = [
  ['confirmed', 'Steht aus', 'border-l-accent'],
  ['completed', 'Abgeschlossen', 'border-l-line-strong'],
  ['documented', 'Dokumentiert', 'border-l-line-strong'],
  ['no_show', 'Nicht angetroffen', 'border-l-warnung'],
  ['cancelled', 'Abgesagt', 'border-l-danger'],
];

describe('Kalender-Kachel', () => {
  it.each(ZUSTAENDE)('zeigt %s mit 3-px-Linie in der Farbe des Zustands', (status, _, linie) => {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[{ id: 'st-1', titel: 'Anna Beispiel', baender: [] }]}
        eintraege={[
          {
            eintrag: termin({ status, patient_family_name: `Muster-${status}` }),
            spalteId: 'st-1',
            beginnMinute: 540,
            endeMinute: 600,
            ziehbar: status === 'confirmed',
          },
        ]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );

    const kachel = screen
      .getAllByRole('link')
      .find((link) => link.textContent?.includes(`Muster-${status}`))!;
    expect(kachel).toHaveClass('border-l-[3px]', linie);
    // Keine Farbe je Person mehr und kein Schatten.
    expect(kachel.style.borderLeftColor).toBe('');
    expect(kachel.className).not.toMatch(/shadow/);
  });

  it('nennt einen abweichenden Zustand weiter als Zeichen und Wort', () => {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[{ id: 'st-1', titel: 'Anna Beispiel', baender: [] }]}
        eintraege={[
          {
            eintrag: termin({ status: 'no_show' }),
            spalteId: 'st-1',
            beginnMinute: 540,
            endeMinute: 600,
            ziehbar: false,
          },
        ]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );
    expect(screen.getByTestId('kachel-status')).toHaveTextContent('! Nicht angetroffen');
  });
});

describe('Belegt-Block (ABN-021, BEF-112)', () => {
  it('zeigt eine belegte Zeit als „belegt“ mit Uhrzeit für Vorlesesoftware, ohne Link', () => {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[
          {
            id: 'st-1',
            titel: 'Tom Training',
            baender: [],
            belegt: [{ vonMinute: 540, bisMinute: 600 }],
          },
        ]}
        eintraege={[]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );
    const block = screen.getByTestId('belegt');
    expect(block).toHaveTextContent('belegt 09:00 bis 10:00');
    expect(block.closest('a')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('zeichnet Fahrwege als Bloecke unter den Kacheln, abgeschnitten am Fenster (UBK-005)', () => {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[
          {
            id: 'st-1',
            titel: 'Anna Beispiel',
            baender: [],
            fahrwege: [
              { vonMinute: 528, bisMinute: 540, minuten: 12 },
              // Beginnt vor dem Fenster: nur der sichtbare Teil.
              { vonMinute: 470, bisMinute: 485, minuten: 15 },
              // ANN-236: veraltete Anschrift - ein Warnblock, keine Zahl.
              { vonMinute: 585, bisMinute: 600, minuten: 0, veraltet: true },
              // UBK-015: der Rückweg nach dem letzten Besuch.
              { vonMinute: 660, bisMinute: 678, minuten: 18, rueckweg: true },
            ],
          },
        ]}
        eintraege={[]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );

    const [weg, frueh] = screen.getAllByTestId('fahrweg');
    expect(weg).toHaveTextContent('Weg ≈ 12 min');
    expect(weg).toHaveClass('pointer-events-none', 'border-dashed');
    expect(weg!.style.top).toBe('64px');
    expect(weg!.style.height).toBe('16px');
    // 5 Minuten sichtbar: zu niedrig für die Zahl, vorgelesen wird sie trotzdem.
    expect(frueh!.style.top).toBe('0px');
    const sichtbar = frueh!.querySelector('[aria-hidden="true"]')!;
    expect(sichtbar).toHaveTextContent('Weg ≈ 15 min');
    expect(sichtbar).toHaveClass('hidden');
    expect(frueh).toHaveTextContent('Fahrweg etwa 15 Minuten, 07:50 bis 08:05');

    const veraltet = screen.getByTestId('fahrweg-veraltet');
    expect(veraltet).toHaveTextContent('! Adresse veraltet');
    expect(veraltet).toHaveTextContent(
      'Fahrzeit nicht verfügbar: Die Adresse am Termin um 10:00 ist veraltet',
    );
    expect(veraltet).toHaveClass('border-warnung', 'pointer-events-none');
    expect(veraltet).not.toHaveTextContent('Weg ≈');

    const rueck = screen.getAllByTestId('fahrweg')[2]!;
    expect(rueck).toHaveTextContent('Rückweg ≈ 18 min');
    expect(rueck).toHaveTextContent('Rückweg etwa 18 Minuten, 11:00 bis 11:18');

    // Design-Review T5: In einer schmalen Spalte fällt das Wort, nicht die
    // Einheit - „≈ 18 min“ steht ganz da, das Wort erst ab Platz dafür.
    expect(rueck).toHaveClass('@container', 'whitespace-nowrap');
    const wort = within(rueck).getByText('Rückweg', { selector: 'span span' });
    expect(wort).toHaveClass('hidden', '@min-[6.75rem]:inline');
    expect(within(weg!).getByText('Weg', { selector: 'span span' })).toHaveClass(
      'hidden',
      '@min-[5rem]:inline',
    );
    expect(wort.parentElement).toHaveTextContent(/≈ 18 min$/);
  });
});

describe('Lückenfinder im Gitter (UBK-014)', () => {
  it('setzt das Wort der letzten Lücke unter den Rückweg, sonst läge es darunter', () => {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[
          {
            id: 'st-1',
            titel: 'Anna Beispiel',
            baender: [],
            fahrwege: [{ vonMinute: 600, bisMinute: 615, minuten: 15, rueckweg: true }],
            luecken: [
              { vonMinute: 540, bisMinute: 570, stufe: 'zu_kurz', ab: null },
              { vonMinute: 600, bisMinute: 660, stufe: 'nicht', ab: null },
            ],
          },
        ]}
        eintraege={[]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );

    const [frueh, letzte] = screen.getAllByTestId('luecke-wort');
    expect(frueh).toHaveTextContent('× zu kurz');
    expect(frueh!.style.marginTop).toBe('');
    // 15 Minuten Rückweg bei 80 px je Stunde.
    expect(letzte).toHaveTextContent('× passt nicht');
    expect(letzte!.style.marginTop).toBe('20px');
    expect(letzte).toHaveClass('block');
  });
});

describe('Lückenfinder: nur für 45 Minuten (ABN-033, BEF-136)', () => {
  it('kennzeichnet eine Lücke, die nur für den kürzeren Termin reicht, sichtbar und vorgelesen', () => {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[
          {
            id: 'st-1',
            titel: 'Anna Beispiel',
            baender: [],
            luecken: [
              { vonMinute: 540, bisMinute: 600, stufe: 'passt', ab: '09:10' },
              { vonMinute: 620, bisMinute: 680, stufe: 'passt', ab: '10:30', kuerzer: 45 },
            ],
          },
        ]}
        eintraege={[]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );
    const [voll, kurz] = screen.getAllByTestId('luecke');
    expect(voll).toHaveTextContent('✓ passt ab 09:10');
    expect(voll).not.toHaveTextContent('nur 45');
    expect(kurz).toHaveAttribute('data-kuerzer', '45');
    expect(kurz).toHaveTextContent('✓ passt ab 10:30 · nur 45 Min.');
    expect(kurz).toHaveTextContent('Lücke 10:20 bis 11:20: passt ab 10:30 · nur 45 Min.');
  });
});

describe('Ort auf der Kachel (UBK-017, ANN-242)', () => {
  function kachel(teil: Partial<CalendarEntry>, hoeheMinuten = 60) {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[{ id: 'st-1', titel: 'Anna Beispiel', baender: [] }]}
        eintraege={[
          {
            eintrag: termin(teil),
            spalteId: 'st-1',
            beginnMinute: 540,
            endeMinute: 540 + hoeheMinuten,
            ziehbar: false,
          },
        ]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );
    return screen.getAllByRole('link')[0]!;
  }

  it('nennt am Hausbesuch Straße und Hausnummer in der dritten Zeile', () => {
    const link = kachel({ visit_street: 'Musterweg', visit_house_number: '12' });
    expect(within(link).getByTestId('kachel-ort')).toHaveTextContent('Musterweg 12');
    expect(link).toHaveAttribute('title', expect.stringContaining('Musterweg 12'));
  });

  it('nennt am Praxistermin den Standort', () => {
    const link = kachel({
      appointment_type: 'practice',
      location_name: 'Hauptstandort Tuebingen',
      visit_street: null,
    });
    expect(within(link).getByTestId('kachel-ort')).toHaveTextContent('Hauptstandort Tuebingen');
  });

  it('setzt den Ort unter den Zustand, wenn die Kachel vier Zeilen hat', () => {
    const link = kachel(
      { status: 'no_show', visit_street: 'Musterweg', visit_house_number: '12' },
      60,
    );
    expect(within(link).getByTestId('kachel-status')).toHaveTextContent('! Nicht angetroffen');
    expect(within(link).getByTestId('kachel-ort')).toHaveTextContent('Musterweg 12');
  });

  it('laesst den Ort weg, wo die Zeile nicht ganz passt', () => {
    // 30 Minuten bei 80 px je Stunde: 40 px, eine Zeile.
    const kurz = kachel({ visit_street: 'Musterweg', visit_house_number: '12' }, 30);
    expect(within(kurz).queryByTestId('kachel-ort')).toBeNull();
  });

  it('zeigt mit Zustand bei drei Zeilen keinen angeschnittenen Ort - der Tooltip nennt ihn', () => {
    // 45 Minuten: 60 px, drei Zeilen - die dritte trägt den Zustand (BEF-072).
    const link = kachel(
      { status: 'no_show', visit_street: 'Musterweg', visit_house_number: '12' },
      45,
    );
    expect(within(link).getByTestId('kachel-status')).toHaveTextContent('! Nicht angetroffen');
    expect(within(link).queryByTestId('kachel-ort')).toBeNull();
    expect(link).toHaveAttribute('title', expect.stringContaining('Musterweg 12'));
  });

  it('nennt ohne Straße am Hausbesuch keinen Ort', () => {
    const link = kachel({ visit_street: null, visit_house_number: null });
    expect(within(link).queryByTestId('kachel-ort')).toBeNull();
  });
});

describe('Spaltenbreite je Ansicht (Runde 3, Handoff Kalender und Tour 2026-10-06)', () => {
  function zeichne(spaltenart?: 'team' | 'woche') {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[{ id: 'st-1', titel: 'Anna Beispiel', baender: [] }]}
        eintraege={[]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Gitter"
        {...(spaltenart ? { spaltenart } : {})}
      />,
    );
    return screen.getByRole('region', { name: 'Gitter' }).style.gridTemplateColumns;
  }

  it('gibt der Woche 7.5rem je Tag, damit Montag bis Freitag am Tablet passen', () => {
    expect(zeichne('woche')).toContain('minmax(7.5rem, 1fr)');
  });

  it('lässt der Teamansicht 9rem je Person', () => {
    expect(zeichne('team')).toContain('minmax(9rem, 1fr)');
  });

  it('nimmt ohne Angabe die Breite der Teamansicht', () => {
    expect(zeichne()).toContain('minmax(9rem, 1fr)');
  });
});

describe('Kurze Kachel (Design-Review T5)', () => {
  it('zeigt bei einer Zeile den Titel statt der Uhrzeit - die Uhrzeit bleibt vorgelesen', () => {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[{ id: 'st-1', titel: 'Anna Beispiel', baender: [] }]}
        eintraege={[
          {
            // 25 Minuten bei 96 px je Stunde: 40 px, eine Zeile.
            eintrag: termin({ kind: 'internal', title: 'Teambesprechung', patient_id: null }),
            spalteId: 'st-1',
            beginnMinute: 480,
            endeMinute: 505,
            ziehbar: false,
          },
        ]}
        fenster={{ vonMinute: 420, bisMinute: 720 }}
        raster={5}
        stundenHoehe={96}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );
    const kachel = screen.getAllByRole('link')[0]!;
    expect(within(kachel).getByText('Teambesprechung')).not.toHaveClass('sr-only');
    expect(within(kachel).getByTestId('kachel-zeit')).toHaveClass('sr-only');
    expect(within(kachel).getByTestId('kachel-zeit')).toHaveTextContent('08:00–08:25');
  });

  it('setzt die Uhrzeit über den Titel, sobald zwei Zeilen Platz haben', () => {
    renderWithProviders(
      <CalendarGrid
        spaltenModell={[{ id: 'st-1', titel: 'Anna Beispiel', baender: [] }]}
        eintraege={[
          {
            eintrag: termin({}),
            spalteId: 'st-1',
            beginnMinute: 540,
            endeMinute: 600,
            ziehbar: false,
          },
        ]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onAuswahl={() => {}}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />,
    );
    const zeit = screen.getByTestId('kachel-zeit');
    expect(zeit).not.toHaveClass('sr-only');
    expect(zeit).toHaveClass('order-first');
  });
});

describe('Gewählter Termin im Bild (Design-Review T5)', () => {
  const SPALTEN = ['st-1', 'st-2', 'st-3'];

  /**
   * jsdom kennt kein Layout: Das Gitter ist 300 px breit, die Zeitachse 52,
   * jede Spalte 160 - und alles verschiebt sich mit dem Bildlauf des Gitters.
   */
  function geometrie() {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('overflow-x-auto') ? 300 : 0;
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const rechteck = (left: number, width: number) =>
        ({ left, right: left + width, width, top: 0, bottom: 100, height: 100 }) as DOMRect;
      const gitter = this.closest('.overflow-x-auto');
      if (this === gitter) return rechteck(0, 300);
      const spalte = this.closest('[role="group"]');
      const name = spalte?.getAttribute('aria-label') ?? '';
      const index = SPALTEN.findIndex((id) => name.includes(`Person ${id}`));
      if (spalte && index >= 0) {
        return rechteck(52 + index * 160 - (gitter?.scrollLeft ?? 0), 160);
      }
      return rechteck(0, 0);
    });
  }

  function gitter(gewaehlt: string | null, spalteId = 'st-1') {
    return (
      <CalendarGrid
        spaltenModell={SPALTEN.map((id) => ({ id, titel: `Person ${id}`, baender: [] }))}
        eintraege={[
          {
            eintrag: termin({ id: 'ter-1', staff_member_id: spalteId }),
            spalteId,
            beginnMinute: 540,
            endeMinute: 600,
            ziehbar: false,
          },
        ]}
        fenster={{ vonMinute: 480, bisMinute: 720 }}
        raster={5}
        stundenHoehe={80}
        onVerschieben={() => {}}
        onWaehlen={() => {}}
        gewaehlt={gewaehlt}
        kontext="2027-05-12"
        ziehbarErlaubt
        beschriftung="Tagesansicht nach behandelnder Person"
      />
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rollt die Spalte des geöffneten Termins zurück ins Bild', () => {
    geometrie();
    const { rerender } = renderWithProviders(gitter(null));
    const kasten = document.querySelector<HTMLElement>('.overflow-x-auto')!;
    // Vom Bildlauf der Woche übrig: Die erste Spalte liegt links außer Sicht.
    kasten.scrollLeft = 200;
    rerender(gitter('ter-1'));
    // Die Spalte beginnt wieder an der Zeitachse.
    expect(kasten.scrollLeft).toBe(0);
  });

  it('lässt den Bildlauf stehen, wenn die Spalte schon ganz zu sehen ist', () => {
    geometrie();
    const { rerender } = renderWithProviders(gitter(null, 'st-2'));
    const kasten = document.querySelector<HTMLElement>('.overflow-x-auto')!;
    // Spalte 2 liegt ohne Bildlauf bei 212-372 px; bei 160 px Bildlauf bei
    // 52-212 - ganz zu sehen im 300 px breiten Gitter.
    kasten.scrollLeft = 160;
    rerender(gitter('ter-1', 'st-2'));
    expect(kasten.scrollLeft).toBe(160);
  });
});
