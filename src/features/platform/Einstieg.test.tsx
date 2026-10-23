import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { renderWithProviders } from '@/test-utils';
import type * as PlattformApi from './api';
import type { Plattformzugang } from './api';

/**
 * Der Einstieg nach der ersten Anmeldung (POR-019; Handoff 2026-10-22,
 * Abschnitt 5.3; DRP-EPIC-005): ein geführter Ablauf im Fenster mit
 * „Später“, Balken je Schritt und einem Hauptknopf. Gerendert im Gerüst, wie
 * die Person ihn sieht. Synthetische Daten.
 */

const ladeEinstieg = vi.fn();
const einstiegBeenden = vi.fn();
const ladeEinwilligungen = vi.fn();
const ladeBenachrichtigungen = vi.fn();
const ladeTermine = vi.fn();
const ladeWuensche = vi.fn();
const ladeRechnungen = vi.fn();
const ladeBefundbogen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeEinstieg: (...args: unknown[]) => ladeEinstieg(...args) as Promise<unknown>,
  einstiegBeenden: (...args: unknown[]) => einstiegBeenden(...args) as Promise<void>,
  ladeEinwilligungen: (...args: unknown[]) => ladeEinwilligungen(...args) as Promise<unknown[]>,
  ladeBenachrichtigungen: (...args: unknown[]) =>
    ladeBenachrichtigungen(...args) as Promise<unknown>,
  ladeTermine: (...args: unknown[]) => ladeTermine(...args) as Promise<unknown[]>,
  ladeWuensche: (...args: unknown[]) => ladeWuensche(...args) as Promise<unknown[]>,
  ladeRechnungen: (...args: unknown[]) => ladeRechnungen(...args) as Promise<unknown[]>,
  ladeBefundbogen: (...args: unknown[]) => ladeBefundbogen(...args) as Promise<unknown[]>,
}));

const { PlattformApp } = await import('./PlattformApp');

/** Neue Vorlagen tragen `own_name` und `practice_phone`, hier ohne Wert. */
const BEHANDLUNG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: null,
};
const MIT_NAMEN: Plattformzugang = { ...BEHANDLUNG, own_name: 'Erika Beispiel' };
const BEGLEITUNG: Plattformzugang = {
  ...BEHANDLUNG,
  access_id: 'cafecafe-cafe-4afe-8afe-000000000004',
  access_kind: 'companion',
  represented_name: 'Max Mustermann',
  own_name: 'Paula Mustermann',
};

/** Zeigt die Adresse, wie der Router sie gerade hat. */
function Adresse() {
  const { pathname, search } = useLocation();
  return <p data-testid="adresse">{`${pathname}${search}`}</p>;
}

function zeige(zugang: Plattformzugang, pfad = '/p') {
  return renderWithProviders(
    <>
      <PlattformApp zugaenge={[zugang]} email="erika@patient.invalid" onAbmelden={vi.fn()} />
      <Adresse />
    </>,
    pfad,
  );
}

/** Nach jedem Seitenwechsel nimmt der Ablauf kurz keinen Tipp an (TIPPSPERRE_MS). */
async function tippe(nutzer: ReturnType<typeof userEvent.setup>, name: string | RegExp) {
  const knopf = await screen.findByRole('button', { name });
  await waitFor(() => expect(knopf.closest('.pointer-events-none')).toBeNull(), {
    timeout: 2000,
  });
  await nutzer.click(knopf);
}

beforeEach(() => {
  vi.clearAllMocks();
  document.title = 'Übersicht – Own Motion';
  ladeEinstieg.mockResolvedValue({ pending: true, finished_at: null, skipped_at: null });
  einstiegBeenden.mockResolvedValue(undefined);
  ladeEinwilligungen.mockResolvedValue([]);
  ladeBenachrichtigungen.mockResolvedValue({
    email_kinds: [],
    push_kinds: [],
    quiet_from: 20,
    quiet_until: 8,
    chosen_at: null,
    disabled_kinds: [],
    device_registered: false,
  });
  ladeTermine.mockResolvedValue([]);
  ladeWuensche.mockResolvedValue([]);
  ladeRechnungen.mockResolvedValue([]);
  ladeBefundbogen.mockResolvedValue([]);
});

describe('Einstieg: Willkommen (DRP-016)', () => {
  it('begrüßt mit dem eigenen Namen in eigener Zeile, sagt wofür und wie viel noch kommt', async () => {
    zeige(MIT_NAMEN);
    const fenster = await screen.findByRole('dialog', { name: /^Willkommen,\s+Erika Beispiel$/ });
    expect(
      within(fenster).getByRole('heading', { name: /^Willkommen,\s+Erika Beispiel$/ }),
    ).toHaveClass('text-gruss');
    expect(
      within(fenster).getByText(
        'Schön, dass Sie da sind. Hier finden Sie alles zu Ihrer Behandlung bei Test Praxis Tuebingen.',
      ),
    ).toBeInTheDocument();
    expect(within(fenster).getByText('Noch zwei kurze Fragen, dann sind Sie fertig.')).toHaveClass(
      'text-ink-muted',
    );
    expect(within(fenster).getByText('Schritt 1 von 3')).toBeInTheDocument();
    // Oben nur „Später“, kein ✕ und auf der ersten Seite kein „Zurück“.
    expect(within(fenster).getByRole('button', { name: 'Später' })).toBeInTheDocument();
    expect(within(fenster).queryByRole('button', { name: '← Zurück' })).toBeNull();
    // Die Markenfläche statt eines Fotos - Schmuck, unsichtbar für Vorlesesoftware.
    expect(fenster.querySelector('[data-willkommensbild]')).toHaveAttribute('aria-hidden', 'true');
    // DR-108: keine Gebrauchsanweisung der Oberfläche mehr.
    expect(within(fenster).queryByText(/Unten finden Sie/)).toBeNull();
    expect(within(fenster).queryByText(/Dieser Zugang gilt für/)).toBeNull();
    // Der Tab nennt die Seite, nie den Namen (DR-115).
    expect(document.title).toBe('Willkommen – Own Motion');
    await pruefeBarrierefreiheit(document.body);
  });

  it('sagt ohne Namen nur „Willkommen“ und im Training „Ihrem Training“', async () => {
    zeige({ ...BEHANDLUNG, relationship_kind: 'training' });
    expect(await screen.findByRole('dialog', { name: 'Willkommen' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Schön, dass Sie da sind. Hier finden Sie alles zu Ihrem Training bei Test Praxis Tuebingen.',
      ),
    ).toBeInTheDocument();
  });

  it('zeigt „Anmeldung eingerichtet“ einmal oben und nimmt den Parameter aus der Adresse', async () => {
    const nutzer = userEvent.setup();
    zeige(MIT_NAMEN, '/p?bereich=treatment&eingerichtet=1');
    const meldung = await screen.findByText('Anmeldung eingerichtet');
    expect(meldung.closest('[role="status"]')).not.toBeNull();
    // Oben, über dem Bild und dem Gruß.
    const titel = screen.getByRole('heading', { name: /^Willkommen/ });
    expect(meldung.compareDocumentPosition(titel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('adresse')).toHaveTextContent(/^\/p\?bereich=treatment$/),
    );
    await tippe(nutzer, 'Weiter');
    await tippe(nutzer, '← Zurück');
    // Zurück auf „Willkommen“ steht sie nicht noch einmal.
    expect(await screen.findByRole('dialog', { name: /^Willkommen/ })).toBeInTheDocument();
    expect(screen.queryByText('Anmeldung eingerichtet')).toBeNull();
  });

  it('beendet mit „Später“ und gibt den Tab der Übersicht zurück', async () => {
    const nutzer = userEvent.setup();
    zeige(MIT_NAMEN);
    await screen.findByRole('dialog', { name: /^Willkommen/ });
    ladeEinstieg.mockResolvedValue({ pending: false, finished_at: '2026-10-23', skipped_at: null });
    await tippe(nutzer, 'Später');
    await waitFor(() => expect(einstiegBeenden).toHaveBeenCalledWith(MIT_NAMEN.access_id));
    expect(await screen.findByRole('heading', { level: 1, name: 'Guten Tag' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.title).toBe('Übersicht – Own Motion');
  });

  it('begrüßt eine Begleitung mit ihrem Namen und sagt, für wen sie liest (1 von 2)', async () => {
    zeige(BEGLEITUNG);
    const fenster = await screen.findByRole('dialog', { name: /^Willkommen,\s+Paula Mustermann$/ });
    expect(
      within(fenster).getByText(
        'Hier sehen Sie, was Test Praxis Tuebingen für Max Mustermann bereithält.',
      ),
    ).toBeInTheDocument();
    expect(
      within(fenster).getByText(
        'Einwilligungen gibt nur Max Mustermann selbst. Noch eine kurze Frage, dann sind Sie fertig.',
      ),
    ).toBeInTheDocument();
    expect(within(fenster).getByText('Schritt 1 von 2')).toBeInTheDocument();
    // Das Begleitband unter dem Fortschritt.
    expect(within(fenster).getByRole('status')).toHaveTextContent(
      'Sie handeln für Max Mustermann · Begleitung',
    );
  });
});
