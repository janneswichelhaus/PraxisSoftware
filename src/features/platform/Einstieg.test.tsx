import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { renderWithProviders } from '@/test-utils';
import type * as PlattformApi from './api';
import type { Einwilligung, Plattformzugang } from './api';
import { EINWILLIGUNGSFASSUNG, FREIWILLIG } from './einwilligungstexte';

/**
 * Der Einstieg nach der ersten Anmeldung (POR-019; Handoff 2026-10-22,
 * Abschnitt 5.3; DRP-EPIC-005): ein geführter Ablauf im Fenster mit
 * „Später“, Balken je Schritt und einem Hauptknopf. Gerendert im Gerüst, wie
 * die Person ihn sieht. Synthetische Daten.
 */

const ladeEinstieg = vi.fn();
const einstiegBeenden = vi.fn();
const ladeEinwilligungen = vi.fn();
const einwilligungSchreiben = vi.fn();
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
  einwilligungSchreiben: (...args: unknown[]) => einwilligungSchreiben(...args) as Promise<void>,
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

/** Der Stand je Zweck, wie `platform_consents` ihn liefert. */
function einwilligung(
  purpose: Einwilligung['purpose'],
  state: Einwilligung['state'] = 'open',
): Einwilligung {
  return { purpose, state, occurred_on: null, source: null, can_grant: true };
}

/** Zwei offene Einwilligungen der Behandlung; Fotos in der Praxis abgelehnt. */
const OFFEN = [
  einwilligung('email_contact'),
  einwilligung('prescriber_report'),
  einwilligung('patient_photos', 'refused'),
];

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
  ladeEinwilligungen.mockResolvedValue(OFFEN);
  einwilligungSchreiben.mockResolvedValue(undefined);
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

describe('Einstieg: Einwilligungen (DRP-017)', () => {
  async function zuDenEinwilligungen(nutzer: ReturnType<typeof userEvent.setup>) {
    zeige(MIT_NAMEN);
    await screen.findByRole('dialog', { name: /^Willkommen/ });
    await tippe(nutzer, 'Weiter');
    return screen.findByRole('dialog', { name: 'Zwei Fragen zu Ihren Daten' });
  }

  it('fragt je offene Einwilligung in einer Karte, gleich gewichtet und nichts vorgewählt', async () => {
    const nutzer = userEvent.setup();
    const fenster = await zuDenEinwilligungen(nutzer);
    expect(within(fenster).getByText('Schritt 2 von 3')).toBeInTheDocument();
    expect(
      within(fenster).getByText('Beides ist freiwillig. Ihre Behandlung hängt nicht davon ab.'),
    ).toBeInTheDocument();
    // Abgelehnt ist entschieden: keine Karte zu den Fotos.
    expect(
      within(fenster)
        .getAllByRole('heading', { level: 3 })
        .map((titel) => titel.textContent),
    ).toEqual(['Nachrichten per E-Mail', 'Bericht an Ihre Ärztin oder Ihren Arzt']);
    for (const gruppe of within(fenster).getAllByRole('group')) {
      expect(within(gruppe).getByRole('radio', { name: 'Ja, erlauben' })).not.toBeChecked();
      expect(within(gruppe).getByRole('radio', { name: 'Nein' })).not.toBeChecked();
    }
    // Keine eigenen Knöpfe je Einwilligung mehr, keine zweite Knopfebene.
    expect(within(fenster).queryByRole('button', { name: /Einwilligen|Widerrufen/ })).toBeNull();
    expect(within(fenster).getByText(FREIWILLIG)).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
  });

  it('speichert ein Ja sofort mit der Fassung des Texts und nimmt es mit Nein zurück', async () => {
    const nutzer = userEvent.setup();
    const fenster = await zuDenEinwilligungen(nutzer);
    const mail = within(fenster).getByRole('group', { name: 'Nachrichten per E-Mail' });
    ladeEinwilligungen.mockResolvedValue([
      einwilligung('email_contact', 'granted'),
      ...OFFEN.slice(1),
    ]);
    await nutzer.click(within(mail).getByText('Ja, erlauben'));
    expect(einwilligungSchreiben).toHaveBeenCalledWith({
      zugangId: MIT_NAMEN.access_id,
      zweck: 'email_contact',
      erteilen: true,
      fassung: EINWILLIGUNGSFASSUNG,
    });
    expect(await within(mail).findByText('Gespeichert.')).toBeInTheDocument();
    // Die Karte bleibt, auch wenn die Einwilligung jetzt erteilt ist.
    expect(within(mail).getByRole('radio', { name: 'Ja, erlauben' })).toBeChecked();
    await nutzer.click(within(mail).getByText('Nein'));
    await waitFor(() =>
      expect(einwilligungSchreiben).toHaveBeenLastCalledWith(
        expect.objectContaining({ zweck: 'email_contact', erteilen: false }),
      ),
    );
    expect(within(mail).getByRole('radio', { name: 'Nein' })).toBeChecked();
  });

  it('speichert ein Nein zu einer offenen Einwilligung nicht und behält es über „Zurück“', async () => {
    const nutzer = userEvent.setup();
    const fenster = await zuDenEinwilligungen(nutzer);
    const bericht = within(fenster).getByRole('group', {
      name: 'Bericht an Ihre Ärztin oder Ihren Arzt',
    });
    await nutzer.click(within(bericht).getByText('Nein'));
    expect(einwilligungSchreiben).not.toHaveBeenCalled();
    await tippe(nutzer, 'Weiter');
    await tippe(nutzer, '← Zurück');
    const wieder = await screen.findByRole('group', {
      name: 'Bericht an Ihre Ärztin oder Ihren Arzt',
    });
    expect(within(wieder).getByRole('radio', { name: 'Nein' })).toBeChecked();
  });

  it('nimmt die Wahl zurück und sagt es, wenn das Speichern scheitert', async () => {
    const nutzer = userEvent.setup();
    einwilligungSchreiben.mockRejectedValue(
      new Error('Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.'),
    );
    const fenster = await zuDenEinwilligungen(nutzer);
    const mail = within(fenster).getByRole('group', { name: 'Nachrichten per E-Mail' });
    await nutzer.click(within(mail).getByText('Ja, erlauben'));
    expect(
      await within(mail).findByText('Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.'),
    ).toBeInTheDocument();
    expect(within(mail).getByRole('radio', { name: 'Ja, erlauben' })).not.toBeChecked();
  });

  it('lässt die Seite weg, wenn nichts offen ist - dann noch eine Frage', async () => {
    ladeEinwilligungen.mockResolvedValue([
      einwilligung('email_contact', 'granted'),
      einwilligung('prescriber_report', 'refused'),
    ]);
    zeige(MIT_NAMEN);
    const fenster = await screen.findByRole('dialog', { name: /^Willkommen/ });
    expect(within(fenster).getByText('Schritt 1 von 2')).toBeInTheDocument();
    expect(
      within(fenster).getByText('Noch eine kurze Frage, dann sind Sie fertig.'),
    ).toBeInTheDocument();
  });
});
