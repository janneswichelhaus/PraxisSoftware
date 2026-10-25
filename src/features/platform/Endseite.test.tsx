import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Endseite } from './Endseite';

function zeige(fassung: 'uebertragen' | 'geraet', naechsterTag: string | null = '2026-10-26') {
  return render(
    <MemoryRouter>
      <Endseite
        fassung={fassung}
        tag="2026-10-24"
        wer="Anna Beispiel"
        naechsterTag={naechsterTag}
        zurUebersicht="/p"
        zuDenUebungen="/p/uebungen"
      />
    </MemoryRouter>,
  );
}

/**
 * Die Seite nach „Einheit beenden“ (Handoff 2026-10-24, Abschnitt 5.5;
 * ANN-706): wo die Einheit liegt, wer sie sieht, der nächste Übungstag - und
 * kein Lob.
 */
describe('Endseite', () => {
  it('sagt nach dem Übertragen, wer die Einheit sieht, und nennt den nächsten Übungstag', async () => {
    const { container } = zeige('uebertragen');
    expect(screen.getByRole('heading', { level: 1, name: 'Gespeichert' })).toBeInTheDocument();
    expect(
      screen.getByText('Ihre Einheit vom Samstag, 24. Oktober ist bei der Praxis.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Anna Beispiel sieht sie beim nächsten Termin.')).toBeInTheDocument();
    expect(screen.getByText('Nächster Übungstag: Montag, 26. Oktober')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Übersicht' })).toHaveAttribute('href', '/p');
    expect(screen.getByRole('link', { name: 'Zu den Übungen' })).toHaveAttribute(
      'href',
      '/p/uebungen',
    );
    await pruefeBarrierefreiheit(container);
  });

  it('sagt auf dem Gerät, dass die Einheit noch nicht bei der Praxis ist', () => {
    zeige('geraet', null);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Auf diesem Gerät gespeichert' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ihre Einheit ist noch nicht bei der Praxis. Sie wird übertragen, sobald Verbindung besteht.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Bis dahin liegt sie nur auf diesem Telefon.')).toBeInTheDocument();
    expect(screen.queryByText(/bei der Praxis\.$/)).toBeNull();
    expect(screen.queryByText(/Nächster Übungstag/)).toBeNull();
  });

  it('lässt den Satz weg, solange offen ist, wer die Einheit sieht (ANN-712)', () => {
    render(
      <MemoryRouter>
        <Endseite
          fassung="uebertragen"
          tag="2026-10-24"
          wer={null}
          zurUebersicht="/p"
          zuDenUebungen="/p/uebungen"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Gespeichert' })).toBeInTheDocument();
    expect(screen.queryByText(/sieht sie beim nächsten Termin/)).toBeNull();
  });

  it('lobt nicht und zählt nichts (DSN-001 4.1)', () => {
    const { container } = zeige('uebertragen');
    expect(container.textContent).not.toMatch(
      /super|toll|bravo|glückwunsch|geschafft|weiter so|serie|punkte|in folge|!/i,
    );
  });
});
