import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Plattformzugang, Termin, Terminwunsch } from './api';
import { renderWithProviders } from '@/test-utils';
import { AUSFALLHONORAR_SPAET } from '@/lib/ausfallhonorar';
import { RECHNER_ABFRAGE } from './geruestbreite';
import { tagInWorten } from './termintexte';
import { WUENSCHE_OHNE_NETZ } from './wunschtexte';

/**
 * Die Seite eines Termins je Lage: kommend, unter 24 Stunden, offener Wunsch, vergangen mit und
 * ohne Rufnummer, abgesagt, ohne Netz; dazu Laden, Fehler, nicht gefunden, Rückweg und Rechner.
 * Maße und axe prüft `tests/e2e/plattform-terminliste.spec.ts`.
 */

/** Ein Abschnitt (`Section`) über seine Überschrift. */
function abschnittNamens(name: string): HTMLElement {
  return screen.getByRole('heading', { level: 2, name }).closest('section')!;
}
async function findeAbschnitt(name: string): Promise<HTMLElement> {
  return (await screen.findByRole('heading', { level: 2, name })).closest('section')!;
}
function ohneAbschnitt(name: string) {
  expect(screen.queryByRole('heading', { level: 2, name })).not.toBeInTheDocument();
}

const ladeTermine = vi.fn();
const ladeWuensche = vi.fn();
const wunschZurueckziehen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeTermine: (...args: unknown[]) => ladeTermine(...args) as Promise<Termin[]>,
  ladeWuensche: (...args: unknown[]) => ladeWuensche(...args) as Promise<Terminwunsch[]>,
  wunschZurueckziehen: (...args: unknown[]) => wunschZurueckziehen(...args) as Promise<void>,
}));

const { Terminseite } = await import('./Terminseite');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: '+49 7071 0000000',
};

function inStunden(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

const TERMIN: Termin = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  starts_at: inStunden(72),
  ends_at: inStunden(73),
  appointment_type: 'home_visit',
  status: 'confirmed',
  staff_name: 'Anna Beispiel',
  location_name: null,
  visit_street: 'Testweg',
  visit_house_number: '7',
  visit_postal_code: '72072',
  visit_city: 'Tuebingen',
  late_notice: false,
  open_request_kind: null,
};

const WUNSCH: Terminwunsch = {
  id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
  kind: 'change',
  appointment_id: TERMIN.id,
  preferred_days: ['2026-10-26', '2026-10-27'],
  preferred_times: ['morning'],
  note: 'Lieber eine Woche später, wenn es geht.',
  status: 'open',
  created_at: inStunden(-20),
  resolved_at: null,
  answer: null,
};

function zeige(
  termin: Termin,
  {
    zugang = ZUGANG,
    pfad = `/p/termine/${termin.id}?bereich=treatment`,
  }: { zugang?: Plattformzugang; pfad?: string } = {},
) {
  ladeTermine.mockResolvedValue([termin]);
  return renderWithProviders(<Terminseite zugang={zugang} />, pfad);
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeWuensche.mockResolvedValue([]);
  wunschZurueckziehen.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Seite des Termins (Schritt 3c)', () => {
  it('kommend: Kopf, „Wer und wo“, Ändern und Absagen als Wege in den Ablauf, Fragen', async () => {
    zeige(TERMIN);
    const titel = await screen.findByRole('heading', { level: 1 });
    // Der Tag trägt ein festes Leerzeichen; der Vergleich glättet es.
    expect(titel).toHaveTextContent(tagInWorten(TERMIN.starts_at).replace(/\s+/g, ' '));
    expect(titel.closest('header')).toHaveTextContent('Hausbesuch');
    expect(screen.getByRole('region', { name: 'Wer und wo' })).toHaveTextContent(
      'Anna Beispielkommt zu Ihnen',
    );
    const abschnitt = abschnittNamens('Passt der Termin nicht?');
    expect(abschnitt).toHaveTextContent(
      'Ändern und Absagen sind Wünsche an die Praxis. Sie meldet sich bei Ihnen.',
    );
    expect(within(abschnitt).getByRole('link', { name: 'Termin ändern' })).toHaveAttribute(
      'href',
      `/p/termine/${TERMIN.id}?bereich=treatment&art=change`,
    );
    expect(within(abschnitt).getByRole('link', { name: 'Termin absagen' })).toHaveAttribute(
      'href',
      `/p/termine/${TERMIN.id}?bereich=treatment&art=cancel`,
    );
    const fragen = abschnittNamens('Fragen zu diesem Termin?');
    expect(within(fragen).getAllByRole('listitem')).toHaveLength(2);
    expect(within(fragen).getByRole('link', { name: /Praxis anrufen/ })).toHaveAttribute(
      'href',
      'tel:+4970710000000',
    );
    expect(within(fragen).getByRole('link', { name: 'Der Praxis schreiben' })).toHaveAttribute(
      'href',
      '/p/nachrichten/neu?bereich=treatment',
    );
    // Der Rückweg führt zur Liste.
    expect(screen.getByRole('link', { name: 'Termine' })).toHaveAttribute(
      'href',
      '/p/termine?bereich=treatment',
    );
  });

  it('unter 24 Stunden: die Warnung zum Ausfallhonorar statt des Satzes, die Knöpfe bleiben', async () => {
    zeige({ ...TERMIN, starts_at: inStunden(5), ends_at: inStunden(6), late_notice: true });
    const abschnitt = await findeAbschnitt('Passt der Termin nicht?');
    expect(within(abschnitt).getByRole('status')).toHaveTextContent(AUSFALLHONORAR_SPAET);
    expect(abschnitt).not.toHaveTextContent('Ändern und Absagen sind Wünsche');
    expect(within(abschnitt).getAllByRole('link')).toHaveLength(2);
  });

  it('offener Wunsch: im Kopf „Änderung angefragt“, der Wunsch selbst und Zurückziehen', async () => {
    const nutzer = userEvent.setup();
    ladeWuensche.mockResolvedValue([WUNSCH]);
    zeige({ ...TERMIN, open_request_kind: 'change' });
    const wunsch = await findeAbschnitt('Ihr Änderungswunsch');
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveTextContent(
      'Änderung angefragt',
    );
    await waitFor(() => expect(wunsch).toHaveTextContent('Montag oder Dienstag, vormittags'));
    expect(wunsch).toHaveTextContent('„Lieber eine Woche später, wenn es geht.“');
    expect(wunsch).toHaveTextContent(
      'Die Praxis meldet sich bei Ihnen. Bis dahin gilt der Termin.',
    );
    ohneAbschnitt('Passt der Termin nicht?');
    await nutzer.click(within(wunsch).getByRole('button', { name: 'Wunsch zurückziehen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja, zurückziehen' }));
    await waitFor(() =>
      expect(wunschZurueckziehen).toHaveBeenCalledWith(ZUGANG.access_id, WUNSCH.id),
    );
  });

  it('vergangen mit Nummer: „Praxis anrufen“ als Hauptknopf, in der Liste nur „Schreiben“', async () => {
    zeige({
      ...TERMIN,
      starts_at: inStunden(-50),
      ends_at: inStunden(-49),
      status: 'completed',
      late_notice: null,
    });
    const fragen = await findeAbschnitt('Fragen zu diesem Termin?');
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveTextContent(
      'durchgeführt',
    );
    expect(screen.getByRole('region', { name: 'Wer und wo' })).toHaveTextContent('war bei Ihnen');
    const anrufen = within(fragen).getByRole('link', { name: /Praxis anrufen/ });
    expect(anrufen).toHaveClass('bg-accent');
    expect(within(within(fragen).getByRole('list')).getAllByRole('link')).toHaveLength(1);
    ohneAbschnitt('Passt der Termin nicht?');
  });

  it('vergangen ohne Nummer: nur „Der Praxis schreiben“, kein Satz, der zum Anruf auffordert', async () => {
    zeige(
      { ...TERMIN, starts_at: inStunden(-50), ends_at: inStunden(-49), status: 'no_show' },
      { zugang: { ...ZUGANG, practice_phone: null } },
    );
    const fragen = await findeAbschnitt('Fragen zu diesem Termin?');
    expect(within(fragen).queryByRole('link', { name: /Praxis anrufen/ })).not.toBeInTheDocument();
    expect(within(fragen).getByRole('link', { name: 'Der Praxis schreiben' })).toBeInTheDocument();
    expect(screen.queryByText(/rufen Sie bitte die Praxis an/)).not.toBeInTheDocument();
  });

  it('abgesagt: „Neuen Termin wünschen“ als Zweitknopf, Fragen als Liste', async () => {
    zeige({ ...TERMIN, status: 'cancelled', late_notice: null });
    const neu = await screen.findByRole('link', { name: 'Neuen Termin wünschen' });
    expect(neu).toHaveAttribute('href', '/p/termine/wunsch?bereich=treatment');
    expect(neu).not.toHaveClass('bg-accent');
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toHaveTextContent(
      'abgesagt',
    );
    const fragen = abschnittNamens('Fragen zu diesem Termin?');
    expect(within(within(fragen).getByRole('list')).getAllByRole('link')).toHaveLength(2);
  });

  it('ohne Netz: Ändern und Absagen gesperrt mit dem Satz der Liste; „Praxis anrufen“ bleibt', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    zeige(TERMIN);
    const abschnitt = await findeAbschnitt('Passt der Termin nicht?');
    for (const name of ['Termin ändern', 'Termin absagen']) {
      const knopf = within(abschnitt).getByRole('button', { name });
      expect(knopf).toBeDisabled();
      expect(knopf).toHaveAccessibleDescription(WUENSCHE_OHNE_NETZ);
    }
    expect(screen.getByRole('link', { name: /Praxis anrufen/ })).toBeInTheDocument();
  });

  it('ohne Netz: auch „Wunsch zurückziehen“ gesperrt, der Satz darunter (ANN-773)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    ladeWuensche.mockResolvedValue([WUNSCH]);
    zeige({ ...TERMIN, open_request_kind: 'change' });
    const wunsch = await findeAbschnitt('Ihr Änderungswunsch');
    const zurueck = await within(wunsch).findByRole('button', { name: 'Wunsch zurückziehen' });
    expect(zurueck).toBeDisabled();
    expect(zurueck).toHaveAccessibleDescription(WUENSCHE_OHNE_NETZ);
  });

  it('von der Übersicht heißt der Rückweg „Übersicht“', async () => {
    zeige(TERMIN, { pfad: `/p/termine/${TERMIN.id}?bereich=treatment&von=uebersicht` });
    expect(await screen.findByRole('link', { name: 'Übersicht' })).toHaveAttribute(
      'href',
      '/p?bereich=treatment',
    );
  });

  it('lädt als Skelett, sagt einen Fehler und einen fehlenden Termin', async () => {
    ladeTermine.mockReturnValue(new Promise<Termin[]>(() => undefined));
    const { unmount } = renderWithProviders(
      <Terminseite zugang={ZUGANG} />,
      `/p/termine/${TERMIN.id}`,
    );
    expect(screen.getByText('Termin wird geladen')).toHaveClass('sr-only');
    unmount();

    ladeTermine.mockRejectedValue(new Error('kaputt'));
    const zweite = renderWithProviders(<Terminseite zugang={ZUGANG} />, `/p/termine/${TERMIN.id}`);
    expect(
      await screen.findByText('Ihr Termin lässt sich gerade nicht laden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /erneut/i })).toBeInTheDocument();
    zweite.unmount();

    zeige(TERMIN, { pfad: '/p/termine/aaaaaaaa-aaaa-4aaa-8aaa-0000000000ff' });
    expect(await screen.findByText('Dieser Termin wurde nicht gefunden.')).toBeInTheDocument();
  });

  it('am Rechner stehen Ändern und Absagen nebeneinander, so breit wie ihr Text', async () => {
    vi.stubGlobal('matchMedia', (abfrage: string) => ({
      matches: abfrage === RECHNER_ABFRAGE,
      media: abfrage,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    zeige(TERMIN);
    const aendern = await screen.findByRole('link', { name: 'Termin ändern' });
    expect(aendern).not.toHaveClass('w-full');
    expect(aendern.parentElement).toHaveClass('flex-wrap');
  });
});
