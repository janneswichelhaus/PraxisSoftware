import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { Abfragezustand, type Abfrage } from './Abfragezustand';
import { STAND_VERALTET, VERBINDUNG_PRUEFEN } from './abfrageTexte';

function abfrage<T>(teil: Partial<Abfrage<T>>): Abfrage<T> {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...teil,
  };
}

function Liste({ zustand, inKarte }: { zustand: Abfrage<string[]>; inKarte?: boolean }) {
  return (
    <Abfragezustand
      abfrage={zustand}
      laden="Patientenliste wird geladen …"
      fehler="Die Patientenliste konnte nicht geladen werden."
      leer={{ wenn: (daten) => daten.length === 0, titel: 'Noch keine Patient:innen' }}
      inKarte={inKarte ?? false}
      kacheln={inKarte ? 2 : 0}
    >
      {(daten) => <p>{daten.join(', ')}</p>}
    </Abfragezustand>
  );
}

describe('Abfragezustand (Design-Fundament, ANN-406)', () => {
  it('lädt mit Satz, in der Karte mit Kacheln in Zielgröße', () => {
    const { container } = renderWithProviders(
      <Liste zustand={abfrage({ isPending: true })} inKarte />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Patientenliste wird geladen …');
    expect(container.querySelectorAll('[data-ladekacheln] > div')).toHaveLength(2);
  });

  it('nennt ohne Stand den Fehler mit dem einen Satz und „Erneut versuchen“', async () => {
    const user = userEvent.setup();
    const zustand = abfrage<string[]>({ isError: true });
    renderWithProviders(<Liste zustand={zustand} />);
    const meldung = screen.getByRole('alert');
    expect(meldung).toHaveTextContent('Die Patientenliste konnte nicht geladen werden.');
    expect(meldung).toHaveTextContent(VERBINDUNG_PRUEFEN);
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(zustand.refetch).toHaveBeenCalledTimes(1);
  });

  it('lässt den Stand nach gescheitertem Nachladen stehen und sagt, dass er veraltet sein kann', async () => {
    const user = userEvent.setup();
    const zustand = abfrage({ data: ['Max Mustermann'], isError: true });
    renderWithProviders(<Liste zustand={zustand} />);
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText(STAND_VERALTET)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(zustand.refetch).toHaveBeenCalledTimes(1);
  });

  it('zeigt leer den Leerzustand, in der Karte, wenn die Seite aus Karten besteht', () => {
    renderWithProviders(<Liste zustand={abfrage({ data: [] })} inKarte />);
    const titel = screen.getByText('Noch keine Patient:innen');
    expect(titel.parentElement).toHaveClass('rounded-card', 'border');
  });

  it('zeigt sonst den Inhalt und nichts weiter', () => {
    renderWithProviders(<Liste zustand={abfrage({ data: ['Max Mustermann', 'Berta Bestand'] })} />);
    expect(screen.getByText('Max Mustermann, Berta Bestand')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('zeigt bei einer abgeschalteten Abfrage nichts', () => {
    const { container } = renderWithProviders(<Liste zustand={abfrage({})} />);
    expect(container).toBeEmptyDOMElement();
  });
});
