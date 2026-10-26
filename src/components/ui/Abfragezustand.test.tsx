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

/** Eine Abweisung des Servers - kein Netzfehler. */
class Abgewiesen extends Error {}

/** Eine Seite mit eigener Hülle um Laden und Fehler, etwa „Auszahlen“. */
function Vollbild({ zustand }: { zustand: Abfrage<string> }) {
  return (
    <Abfragezustand
      abfrage={zustand}
      laden="Die Auszahlung wird geladen …"
      fehler="Die Auszahlung konnte nicht geladen werden."
      endgueltig={{
        wenn: (fehler) => fehler instanceof Abgewiesen,
        titel: 'Diese Auszahlung ist nicht möglich.',
      }}
      ausweg={<a href="/">Zur Übersicht</a>}
      rahmen={(inhalt) => <main data-testid="rahmen">{inhalt}</main>}
    >
      {(daten) => <section aria-label="Inhalt">{daten}</section>}
    </Abfragezustand>
  );
}

describe('Abfragezustand mit eigener Hülle', () => {
  it('hüllt das Laden ein, ohne Ausweg', () => {
    renderWithProviders(<Vollbild zustand={abfrage({ isPending: true })} />);
    expect(screen.getByTestId('rahmen')).toContainElement(screen.getByRole('status'));
    expect(screen.queryByRole('link', { name: 'Zur Übersicht' })).toBeNull();
  });

  it('nennt einen endgültigen Fehler mit eigenem Titel, ohne Verbindungssatz und neuen Versuch', () => {
    renderWithProviders(
      <Vollbild zustand={abfrage<string>({ isError: true, error: new Abgewiesen() })} />,
    );
    const rahmen = screen.getByTestId('rahmen');
    const meldung = screen.getByRole('alert');
    expect(rahmen).toContainElement(meldung);
    expect(meldung).toHaveTextContent('Diese Auszahlung ist nicht möglich.');
    expect(meldung).not.toHaveTextContent(VERBINDUNG_PRUEFEN);
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).toBeNull();
    expect(rahmen).toContainElement(screen.getByRole('link', { name: 'Zur Übersicht' }));
  });

  it('lässt nach einer Abweisung keinen alten Stand stehen', () => {
    renderWithProviders(
      <Vollbild
        zustand={abfrage({ data: 'Erika Beispiel', isError: true, error: new Abgewiesen() })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Diese Auszahlung ist nicht möglich.');
    expect(screen.queryByRole('region', { name: 'Inhalt' })).toBeNull();
    expect(screen.queryByText(STAND_VERALTET)).toBeNull();
  });

  it('bietet beim Netzfehler den neuen Versuch und den Ausweg', async () => {
    const user = userEvent.setup();
    const zustand = abfrage<string>({ isError: true, error: new Error('Failed to fetch') });
    renderWithProviders(<Vollbild zustand={zustand} />);
    const rahmen = screen.getByTestId('rahmen');
    expect(screen.getByRole('alert')).toHaveTextContent(VERBINDUNG_PRUEFEN);
    expect(rahmen).toContainElement(screen.getByRole('link', { name: 'Zur Übersicht' }));
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(zustand.refetch).toHaveBeenCalledTimes(1);
  });

  it('zeigt den Inhalt ohne Rahmen und ohne Ausweg', () => {
    renderWithProviders(<Vollbild zustand={abfrage({ data: 'Erika Beispiel' })} />);
    expect(screen.getByRole('region', { name: 'Inhalt' })).toHaveTextContent('Erika Beispiel');
    expect(screen.queryByTestId('rahmen')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Zur Übersicht' })).toBeNull();
  });
});
