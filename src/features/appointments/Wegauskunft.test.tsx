import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Wegauskunft } from './Wegauskunft';
import type { Seite, Wegfrage, Wegpruefung } from './wegpruefung';

/** UBK-012: Was „Passt es?“ sagt (ANN-238). Nur Auskunft. */

const ZONE = 'Europe/Berlin';

function geprueft(over: Partial<Extract<Seite, { stand: 'geprueft' }>>): Seite {
  return {
    stand: 'geprueft',
    luft: 12,
    stufe: 'passt',
    fruehester: '2027-05-12T07:45:00Z',
    fahrtMinuten: 18,
    nachbar: 'termin',
    nachbarZeit: '2027-05-12T07:30:00Z',
    ...over,
  };
}

describe('Wegauskunft', () => {
  it('sagt „passt · X Min. Luft“ bzw. „knapp · X Min. Luft“ mit Fahrzeit, ohne Namen', () => {
    render(
      <Wegauskunft
        zeitzone={ZONE}
        pruefung={{
          stand: 'bereit',
          an: geprueft({}),
          weiter: geprueft({
            luft: 3,
            stufe: 'knapp',
            fahrtMinuten: 0,
            nachbarZeit: '2027-05-12T10:00:00Z',
          }),
        }}
      />,
    );
    expect(screen.getByText('Passt es?')).toBeInTheDocument();
    const anfahrt = screen.getByText('Anfahrt: passt · 12 Min. Luft');
    expect(anfahrt).toHaveClass('text-positiv');
    expect(anfahrt).toHaveTextContent(/^✓/);
    expect(screen.getByText(/≈ 18 Min\. vom Termin davor \(bis 09:30 Uhr\)/)).toBeInTheDocument();
    // B2: Unter fünf Minuten Luft sagt das Wort, was das Zeichen sagt - nie
    // „! … passt“.
    const weiterfahrt = screen.getByText('Weiterfahrt: knapp · 3 Min. Luft');
    expect(weiterfahrt).toHaveClass('text-warnung');
    expect(weiterfahrt).toHaveTextContent(/^!/);
    expect(screen.queryByText(/passt · 3 Min\. Luft/)).toBeNull();
    expect(screen.getByText(/gleicher Ort/)).toBeInTheDocument();
    expect(screen.queryByText(/trotzdem anlegen/)).toBeNull();
  });

  it('sagt auch bei 0 Minuten Luft „knapp“, ab fünf Minuten „passt“', () => {
    render(
      <Wegauskunft
        zeitzone={ZONE}
        pruefung={{
          stand: 'bereit',
          an: geprueft({ luft: 0, stufe: 'knapp' }),
          weiter: geprueft({ luft: 5, stufe: 'passt', nachbar: 'tagesrand' }),
        }}
      />,
    );
    expect(screen.getByText('Anfahrt: knapp · 0 Min. Luft')).toHaveClass('text-warnung');
    expect(screen.getByText('Rückfahrt: passt · 5 Min. Luft')).toHaveClass('text-positiv');
  });

  it('sagt „zu knapp um X Min.“ mit fruehestem Beginn - und dass es nur Auskunft ist', () => {
    render(
      <Wegauskunft
        zeitzone={ZONE}
        pruefung={{
          stand: 'bereit',
          an: geprueft({ luft: -5, stufe: 'nicht', fruehester: '2027-05-12T08:20:00Z' }),
          weiter: geprueft({
            luft: -3,
            stufe: 'nicht',
            nachbar: 'tagesrand',
            fruehester: '2027-05-12T14:05:00Z',
            nachbarZeit: '2027-05-12T14:00:00Z',
          }),
        }}
      />,
    );
    expect(
      screen.getByText('Anfahrt: zu knapp um 5 Min., frühester Beginn 10:20 Uhr'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Rückfahrt: zu knapp um 3 Min., Ankunft frühestens 16:05 Uhr'),
    ).toBeInTheDocument();
    expect(screen.getByText(/zum Startort bis Arbeitsende 16:00 Uhr/)).toBeInTheDocument();
    expect(
      screen.getByText('Nur Auskunft – der Termin lässt sich trotzdem anlegen.'),
    ).toBeInTheDocument();
  });

  it.each([
    [
      { stand: 'nicht_verortet' } as const,
      'Die Adresse ist nicht verortet – Fahrzeit nicht geprüft.',
    ],
    [
      { stand: 'veraltet' } as const,
      'Die Anschrift am Termin ist veraltet – Fahrzeit nicht geprüft.',
    ],
    [{ stand: 'fehler' } as const, 'Der Fahrweg ließ sich gerade nicht prüfen.'],
  ])('sagt statt einer Zeit, warum es keine gibt (%o)', (pruefung, text) => {
    render(<Wegauskunft zeitzone={ZONE} pruefung={pruefung} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('nennt einen nicht verorteten Nachbarn und eine fehlende Fahrzeit', () => {
    render(
      <Wegauskunft
        zeitzone={ZONE}
        pruefung={{
          stand: 'bereit',
          an: { stand: 'nachbar_nicht_verortet' },
          weiter: { stand: 'nicht_geprueft' },
        }}
      />,
    );
    expect(
      screen.getByText('Anfahrt: Der Termin davor ist nicht verortet – nicht geprüft.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Weiterfahrt: Fahrzeit nicht verfügbar – nicht geprüft.'),
    ).toBeInTheDocument();
  });

  it('bleibt beim Videotermin stumm', () => {
    const { container } = render(<Wegauskunft zeitzone={ZONE} pruefung={{ stand: 'aus' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt in der Ziehvorschau nur die Zeilen', () => {
    render(
      <Wegauskunft
        zeitzone={ZONE}
        variante="ziehen"
        pruefung={{ stand: 'bereit', an: geprueft({}), weiter: { stand: 'offen' } }}
      />,
    );
    expect(screen.queryByText('Passt es?')).toBeNull();
    expect(screen.getByText('Anfahrt: passt · 12 Min. Luft')).toBeInTheDocument();
    expect(screen.getByTestId('wegauskunft')).not.toHaveAttribute('role');
  });

  /**
   * B2 (ANN-530): Unter einer zu knappen Zeile steht im Formular ein Knopf,
   * der den Beginn auf die früheste passende Zeit setzt - nur, wenn die
   * Gegenseite dabei hält. Anlegen zur alten Zeit bleibt möglich.
   */
  describe('B2: Auf die früheste passende Zeit verschieben', () => {
    /** Ein Termin am 12.05.2027 (Sommerzeit, UTC+2) mit Beginn `HH:MM` und 60 Minuten. */
    function frage(beginn: string, minuten = 60): Wegfrage {
      const [stunde, minute] = beginn.split(':').map(Number) as [number, number];
      const beginnMinute = stunde * 60 + minute;
      return {
        person: 'p1',
        datum: '2027-05-12',
        beginnMinute,
        endeMinute: beginnMinute + minuten,
        ort: { art: 'practice', standortId: 's1' },
        zeitzone: ZONE,
      };
    }

    function zeigen(
      pruefung: Wegpruefung,
      beginn: string,
      { raster = 5, variante }: { raster?: number; variante?: 'formular' | 'rueckfrage' } = {},
    ) {
      const onBeginn = vi.fn();
      render(
        <Wegauskunft
          zeitzone={ZONE}
          pruefung={pruefung}
          {...(variante ? { variante } : {})}
          verschieben={{ frage: frage(beginn), rasterMinuten: raster, onBeginn }}
        />,
      );
      return onBeginn;
    }

    /** Bild 1 aus B2: Anfahrt 10 Minuten zu knapp, Rückfahrt mit 20 Minuten Luft. */
    const anfahrtZuKnapp: Wegpruefung = {
      stand: 'bereit',
      an: geprueft({
        luft: -10,
        stufe: 'nicht',
        fruehester: '2027-05-12T14:25:00Z',
        fahrtMinuten: 17,
        nachbarZeit: '2027-05-12T14:05:00Z',
      }),
      weiter: geprueft({
        luft: 20,
        stufe: 'passt',
        nachbar: 'tagesrand',
        fruehester: '2027-05-12T15:40:00Z',
        fahrtMinuten: 25,
        nachbarZeit: '2027-05-12T16:00:00Z',
      }),
    };

    it('bietet bei zu knapper Anfahrt den frühesten Beginn an, unter der Zeile', async () => {
      const user = userEvent.setup();
      const onBeginn = zeigen(anfahrtZuKnapp, '16:15');

      const knopf = screen.getByRole('button', { name: 'Auf 16:25 verschieben' });
      // Sekundär und kompakt (44 px), am Telefon in voller Breite.
      expect(knopf).toHaveAttribute('type', 'button');
      expect(knopf).toHaveClass('min-h-11', 'w-full', 'sm:w-auto', 'border-line-strong');
      // Unter der Anfahrt, über der Rückfahrt.
      const anfahrt = screen.getByText(/^Anfahrt: zu knapp um 10 Min\./);
      const rueckfahrt = screen.getByText('Rückfahrt: passt · 20 Min. Luft');
      expect(anfahrt.compareDocumentPosition(knopf)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(knopf.compareDocumentPosition(rueckfahrt)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      // Nur Auskunft bleibt: Der Termin lässt sich zur alten Zeit anlegen.
      expect(
        screen.getByText('Nur Auskunft – der Termin lässt sich trotzdem anlegen.'),
      ).toBeInTheDocument();

      await user.click(knopf);
      expect(onBeginn).toHaveBeenCalledWith('16:25');
      // Der Knopf verschwindet mit der neuen Prüfung; der Fokus bleibt in der Auskunft.
      expect(screen.getByText('Passt es?')).toHaveFocus();
    });

    it.each([
      // Raster, Luft der Weiterfahrt, neuer Beginn (vorher 16:00)
      [5, -7, '15:50'],
      [10, -7, '15:50'],
      [15, -7, '15:45'],
      [5, -3, '15:55'],
      [10, -3, '15:50'],
      [15, -3, '15:45'],
      [5, -15, '15:45'],
      [15, -16, '15:30'],
    ])(
      'zieht bei zu knapper Weiterfahrt im Raster von %i Minuten um den Fehlbetrag vor (Luft %i → %s)',
      async (raster, luft, ziel) => {
        const user = userEvent.setup();
        const onBeginn = zeigen(
          {
            stand: 'bereit',
            an: geprueft({ luft: 30 }),
            weiter: geprueft({
              luft,
              stufe: 'nicht',
              fruehester: '2027-05-12T15:30:00Z',
              nachbarZeit: '2027-05-12T15:20:00Z',
            }),
          },
          '16:00',
          { raster },
        );

        const knopf = screen.getByRole('button', { name: `Auf ${ziel} vorziehen` });
        // Unter der Weiterfahrt.
        expect(screen.getByText(/^Weiterfahrt: zu knapp um/).compareDocumentPosition(knopf)).toBe(
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
        await user.click(knopf);
        expect(onBeginn).toHaveBeenCalledWith(ziel);
      },
    );

    it('bietet auch bei zu knapper Rückfahrt zum Arbeitsende das Vorziehen an', () => {
      zeigen(
        {
          stand: 'bereit',
          an: { stand: 'offen' },
          weiter: geprueft({
            luft: -5,
            stufe: 'nicht',
            nachbar: 'tagesrand',
            fruehester: '2027-05-12T16:05:00Z',
            nachbarZeit: '2027-05-12T16:00:00Z',
          }),
        },
        '17:00',
      );
      expect(screen.getByText(/^Rückfahrt: zu knapp um 5 Min\./)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Auf 16:55 vorziehen' })).toBeInTheDocument();
    });

    it('bietet nichts an, was die Weiterfahrt bräche, und sagt, dass keine Zeit passt', () => {
      // Zehn Minuten später, aber nur fünf Minuten Luft danach.
      zeigen({ ...anfahrtZuKnapp, weiter: geprueft({ luft: 5, stufe: 'passt' }) }, '16:15');
      expect(screen.queryByRole('button')).toBeNull();
      // B2: mit Zeichen und Wort wie die Zeilen darüber - in der Auskunft,
      // die schon vorliest, ohne eigene Meldung.
      const keineZeit = screen.getByText('Zwischen Termin davor und danach reicht die Zeit nicht.');
      expect(keineZeit).toHaveClass('text-warnung');
      expect(keineZeit).toHaveTextContent(/^!/);
      expect(keineZeit).not.toHaveAttribute('role');
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(
        screen.getByText('Nur Auskunft – der Termin lässt sich trotzdem anlegen.'),
      ).toBeInTheDocument();
    });

    it('bietet genau so viel an, wie die Gegenseite trägt (Luft 0 hält)', () => {
      zeigen({ ...anfahrtZuKnapp, weiter: geprueft({ luft: 10, stufe: 'passt' }) }, '16:15');
      expect(screen.getByRole('button', { name: 'Auf 16:25 verschieben' })).toBeInTheDocument();
    });

    it('zieht nicht vor den Arbeitsbeginn, wenn das die Gegenseite ist', () => {
      zeigen(
        {
          stand: 'bereit',
          an: geprueft({ luft: 5, nachbar: 'tagesrand' }),
          weiter: geprueft({ luft: -7, stufe: 'nicht' }),
        },
        '08:00',
      );
      expect(screen.queryByRole('button')).toBeNull();
      expect(
        screen.getByText('Zwischen Arbeitsbeginn und Termin danach reicht die Zeit nicht.'),
      ).toBeInTheDocument();
    });

    it('verschiebt nicht über das Arbeitsende hinaus, wenn das die Gegenseite ist', () => {
      zeigen(
        { ...anfahrtZuKnapp, weiter: geprueft({ luft: 4, stufe: 'knapp', nachbar: 'tagesrand' }) },
        '16:15',
      );
      expect(screen.queryByRole('button')).toBeNull();
      expect(
        screen.getByText('Zwischen Termin davor und Arbeitsende reicht die Zeit nicht.'),
      ).toBeInTheDocument();
    });

    it('bietet nichts an, wenn beide Seiten zu knapp sind', () => {
      zeigen(
        {
          stand: 'bereit',
          an: geprueft({ luft: -5, stufe: 'nicht', fruehester: '2027-05-12T14:20:00Z' }),
          weiter: geprueft({ luft: -3, stufe: 'nicht' }),
        },
        '16:15',
      );
      expect(screen.queryByRole('button')).toBeNull();
      // Eine Zeile, nicht zwei - unter der letzten zu knappen Seite.
      expect(
        screen.getAllByText('Zwischen Termin davor und danach reicht die Zeit nicht.'),
      ).toHaveLength(1);
    });

    it('bietet die Verschiebung an, wenn die Gegenseite nicht geprüft ist', () => {
      zeigen({ ...anfahrtZuKnapp, weiter: { stand: 'nicht_geprueft' } }, '16:15');
      expect(screen.getByRole('button', { name: 'Auf 16:25 verschieben' })).toBeInTheDocument();
    });

    it('bietet keinen Beginn an einem anderen Tag an', () => {
      zeigen(
        {
          stand: 'bereit',
          an: geprueft({ luft: -40, stufe: 'nicht', fruehester: '2027-05-12T22:05:00Z' }),
          weiter: { stand: 'offen' },
        },
        '23:25',
      );
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('bietet in der Rückfrage nach dem Ziehen nichts an', () => {
      zeigen(anfahrtZuKnapp, '16:15', { variante: 'rueckfrage' });
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByText(/reicht die Zeit nicht/)).toBeNull();
    });

    it('bietet ohne Rückruf nichts an', () => {
      render(<Wegauskunft zeitzone={ZONE} pruefung={anfahrtZuKnapp} />);
      expect(screen.getByText(/^Anfahrt: zu knapp um 10 Min\./)).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    });
  });
});
