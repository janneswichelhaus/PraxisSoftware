import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderMitVorschau } from '@/test-utils';
import { ProtokollPage } from './ProtokollPage';
import { useVorschau } from './vorschauContext';

/** Löst in derselben Sitzung einen simulierten Vorgang aus. */
function Ausloeser() {
  const { simuliere } = useVorschau();
  return (
    <button
      type="button"
      onClick={() =>
        simuliere({
          bereich: 'Radflotte',
          vorgang: 'Schlüssel entnommen: Lastenrad 2',
          nichtGeschehen: ['Kein Zugang zu einem echten Schlüsseltresor erteilt'],
        })
      }
    >
      Vorgang auslösen
    </button>
  );
}

function oeffne() {
  return renderMitVorschau(
    <>
      <Ausloeser />
      <ProtokollPage />
    </>,
    '/vorschau/protokoll',
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Vorschau-Protokoll', () => {
  it('nennt die Uhrzeit in der Praxiszeitzone statt in UTC (VOR-06, UEB-19)', async () => {
    // Nur die Uhr ist gestellt; die Wartezeiten der Eingabe laufen echt.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-27T12:05:00Z'));
    const nutzer = userEvent.setup();
    oeffne();

    await nutzer.click(screen.getByRole('button', { name: 'Vorgang auslösen' }));

    // 12:05 UTC ist im Sommer 14:05 Uhr in Tübingen; das Jahr steht vierstellig.
    expect(screen.getByText('27.09.2026, 14:05')).toBeInTheDocument();
  });

  it('bietet das Zuruecksetzen erst an, wenn es etwas zu verwerfen gibt (VOR-10)', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    expect(screen.queryByRole('button', { name: 'Vorschau zurücksetzen' })).toBeNull();

    await nutzer.click(screen.getByRole('button', { name: 'Vorgang auslösen' }));
    expect(screen.getByRole('button', { name: 'Vorschau zurücksetzen' })).toBeInTheDocument();
  });

  it('setzt erst nach der Rueckfrage zurueck', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(screen.getByRole('button', { name: 'Vorgang auslösen' }));

    await nutzer.click(screen.getByRole('button', { name: 'Vorschau zurücksetzen' }));
    const rueckfrage = screen.getByRole('group', { name: 'Vorschau zurücksetzen' });
    expect(
      within(rueckfrage).getByText(/Echte Daten sind davon nicht betroffen/),
    ).toBeInTheDocument();
    // Noch nichts verworfen: Der Vorgang steht weiter im Protokoll.
    expect(screen.getByText('Schlüssel entnommen: Lastenrad 2')).toBeInTheDocument();

    await nutzer.click(within(rueckfrage).getByRole('button', { name: 'Ja, zurücksetzen' }));
    expect(screen.queryByText('Schlüssel entnommen: Lastenrad 2')).toBeNull();
    expect(screen.getByText('Noch nichts simuliert')).toBeInTheDocument();
  });

  it('laesst beim Abbrechen alles stehen', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(screen.getByRole('button', { name: 'Vorgang auslösen' }));

    await nutzer.click(screen.getByRole('button', { name: 'Vorschau zurücksetzen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(screen.getByText('Schlüssel entnommen: Lastenrad 2')).toBeInTheDocument();
  });
});
