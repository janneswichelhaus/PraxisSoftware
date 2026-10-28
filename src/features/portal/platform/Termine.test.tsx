import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Nachsorgeabo, Plattformzugang, Termin, Terminwunsch } from './api';
import { renderWithProviders } from '@/test-utils';
import { RECHNER_ABFRAGE } from './geruestbreite';
import { eigenerPlan } from './testdaten';
import { tagInWorten } from './termintexte';
import { isoWochentag } from './uebungstage';
import { WUENSCHE_OHNE_NETZ } from './wunschtexte';
import { kalendertag } from './zeit';

/**
 * Reiter „Termine“: Hero, weitere Termine, Knopf, Wünsche, Woche und Vergangene, dazu leer, nur
 * Wunsch, Lesefrist, Laden, Fehler, ohne Netz und der Rechner. Die Wörter der Zeilen prüft
 * `termintexte.test.ts`, Maße und axe `tests/e2e/plattform-terminliste.spec.ts`.
 */

const ladeTermine = vi.fn();
const ladeWuensche = vi.fn();
const wunschZurueckziehen = vi.fn();
const ladePlaene = vi.fn();
const ladeAbo = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeTermine: (...args: unknown[]) => ladeTermine(...args) as Promise<Termin[]>,
  ladeWuensche: (...args: unknown[]) => ladeWuensche(...args) as Promise<Terminwunsch[]>,
  wunschZurueckziehen: (...args: unknown[]) => wunschZurueckziehen(...args) as Promise<void>,
  ladePlaene: (...args: unknown[]) => ladePlaene(...args) as Promise<PlattformApi.EigenePlaene>,
  ladeAbo: (...args: unknown[]) => ladeAbo(...args) as Promise<Nachsorgeabo | null>,
}));

const { Termine } = await import('./Termine');
const { terminBeschreibung } = await import('./terminbeschreibung');

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
  practice_phone: null,
};

function in_(tage: number, stunde: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  d.setHours(stunde, 30, 0, 0);
  return d.toISOString();
}

const HAUSBESUCH: Termin = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  starts_at: in_(3, 9),
  ends_at: in_(3, 10),
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
const PRAXIS: Termin = {
  ...HAUSBESUCH,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
  starts_at: in_(10, 14),
  ends_at: in_(10, 15),
  appointment_type: 'practice',
  staff_name: 'Jannes Test',
  location_name: 'Hauptstandort Tuebingen',
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  open_request_kind: 'change',
};
const PRAXIS_VERGANGEN: Termin = {
  ...PRAXIS,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  starts_at: in_(-7, 14),
  ends_at: in_(-7, 15),
  status: 'completed',
  staff_name: 'Anna Beispiel',
  late_notice: null,
  open_request_kind: null,
};
const ABGESAGT: Termin = {
  ...HAUSBESUCH,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
  starts_at: in_(5, 11),
  ends_at: in_(5, 12),
  status: 'cancelled',
};
const WUNSCH: Terminwunsch = {
  id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
  kind: 'new',
  appointment_id: null,
  preferred_days: ['2026-10-20', '2026-10-22'],
  preferred_times: ['morning'],
  note: 'Bitte nicht vor 9 Uhr.',
  status: 'open',
  created_at: new Date().toISOString(),
  resolved_at: null,
  answer: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  ladeWuensche.mockResolvedValue([]);
  wunschZurueckziehen.mockResolvedValue(undefined);
  ladePlaene.mockResolvedValue({ today: '2026-10-08', plans: [] });
  ladeAbo.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Termine (POR-008, Schritt 3b)', () => {
  it('zeigt den nächsten Termin als Karte, die ganz zur Seite des Termins führt', async () => {
    // Mit einem vergangenen davor ist es nicht der erste („Ihr erster Besuch“).
    ladeTermine.mockResolvedValue([PRAXIS_VERGANGEN, PRAXIS, HAUSBESUCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine?bereich=treatment');
    const karte = await screen.findByRole('region', { name: /^Besuch / });
    expect(ladeTermine).toHaveBeenCalledWith(ZUGANG.access_id);
    expect(karte).toHaveTextContent('Ihr nächster Besuch');
    expect(karte).toHaveTextContent('Anna Beispiel kommt zu Ihnen');
    expect(karte).toHaveTextContent('Testweg 7, 72072 Tuebingen');
    const ziel = within(karte).getByRole('link');
    expect(ziel).toHaveAttribute('href', `/p/termine/${HAUSBESUCH.id}?bereich=treatment`);
    expect(within(karte).queryByRole('button')).not.toBeInTheDocument();
    expect(karte).not.toHaveTextContent('angefragt');
    // Ohne Abo und Lesefrist fragt die Seite nicht nach dem Abo.
    expect(ladeAbo).not.toHaveBeenCalled();
  });

  it('listet die übrigen kommenden als „Weitere Termine“, je Zeile mit Ziel und Zustand', async () => {
    ladeTermine.mockResolvedValue([PRAXIS, ABGESAGT, HAUSBESUCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine?bereich=treatment');
    const liste = await screen.findByRole('list', { name: 'Weitere Termine' });
    const zeilen = within(liste).getAllByRole('link');
    // Nach Beginn: die Absage in fünf Tagen vor der Praxis in zehn.
    expect(zeilen.map((z) => z.getAttribute('href'))).toEqual([
      `/p/termine/${ABGESAGT.id}?bereich=treatment`,
      `/p/termine/${PRAXIS.id}?bereich=treatment`,
    ]);
    expect(zeilen[0]).toHaveAccessibleName(/, Hausbesuch · Anna Beispiel, abgesagt$/);
    expect(zeilen[1]).toHaveAccessibleName(/, Praxis · Jannes Test, Änderung angefragt$/);
    expect(screen.queryByRole('heading', { name: 'Kommende Termine' })).not.toBeInTheDocument();
  });

  it('sind alle kommenden abgesagt, heißen sie „Abgesagte Termine“, nicht „Weitere“', async () => {
    ladeTermine.mockResolvedValue([ABGESAGT, PRAXIS_VERGANGEN]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    expect(await screen.findByText('Zurzeit ist kein Termin vereinbart.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Abgesagte Termine' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Abgesagte Termine' })).toHaveTextContent('abgesagt');
    expect(screen.queryByRole('heading', { name: 'Weitere Termine' })).not.toBeInTheDocument();
  });

  it('ohne weitere kommende Termine kein Abschnitt dafür', async () => {
    ladeTermine.mockResolvedValue([HAUSBESUCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    await screen.findByRole('region', { name: /^Besuch / });
    expect(screen.queryByRole('heading', { name: 'Weitere Termine' })).not.toBeInTheDocument();
  });

  it('stellt Vergangenes auf Abruf, gedämpft, jede Zeile mit Ziel (DESIGN.md, Regel 6)', async () => {
    ladeTermine.mockResolvedValue([PRAXIS_VERGANGEN, HAUSBESUCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine?bereich=treatment');
    const kopf = (await screen.findByText('Vergangene Termine')).closest('summary');
    expect(kopf).toHaveTextContent('Vergangene Termine (1)');
    const liste = screen.getByRole('list', { name: 'Vergangene Termine', hidden: true });
    const zeile = within(liste).getByRole('link', { hidden: true });
    expect(zeile).toHaveAttribute('href', `/p/termine/${PRAXIS_VERGANGEN.id}?bereich=treatment`);
    expect(zeile).toHaveAccessibleName(/, Praxis · Anna Beispiel, durchgeführt$/);
  });

  it('der Hauptknopf steht am Telefon unter den kommenden Terminen (L7)', async () => {
    ladeTermine.mockResolvedValue([PRAXIS, HAUSBESUCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine?bereich=treatment');
    const weitere = await screen.findByRole('heading', { name: 'Weitere Termine' });
    const wunsch = screen.getByRole('link', { name: 'Termin wünschen' });
    expect(wunsch).toHaveAttribute('href', '/p/termine/wunsch?bereich=treatment');
    expect(weitere.compareDocumentPosition(wunsch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sagt ohne kommende Termine, wie es weitergeht (Leerzustand)', async () => {
    ladeTermine.mockResolvedValue([PRAXIS_VERGANGEN]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    expect(await screen.findByText('Zurzeit ist kein Termin vereinbart.')).toBeInTheDocument();
    expect(
      screen.getByText('Über „Termin wünschen“ sagen Sie der Praxis, wann es Ihnen passt.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Termin wünschen' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Besuch / })).not.toBeInTheDocument();
  });

  it('nur ein Wunsch: Karte statt Leerzustand, darunter der Wunsch und „Noch einen Termin wünschen“', async () => {
    ladeTermine.mockResolvedValue([]);
    ladeWuensche.mockResolvedValue([WUNSCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine?bereich=treatment');
    expect(await screen.findByText('Ihr Wunsch ist bei der Praxis.')).toBeInTheDocument();
    expect(
      screen.getByText('Sie meldet sich bei Ihnen. Danach steht Ihr Termin hier.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Zurzeit ist kein Termin vereinbart.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Termin wünschen' })).not.toBeInTheDocument();
    const noch = screen.getByRole('link', { name: 'Noch einen Termin wünschen' });
    expect(noch).toHaveAttribute('href', '/p/termine/wunsch?bereich=treatment');
    const wuensche = screen.getByRole('list', { name: 'Ihre Wünsche' });
    expect(wuensche.compareDocumentPosition(noch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('zeigt Wünsche mit einem Satz darüber, in Worten, und zieht einen zurück (POR-009)', async () => {
    const nutzer = userEvent.setup();
    ladeTermine.mockResolvedValue([HAUSBESUCH]);
    const alt: Terminwunsch = {
      ...WUNSCH,
      id: 'dddddddd-dddd-4ddd-8ddd-000000000002',
      status: 'declined',
      resolved_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      answer: 'Leider voll.',
    };
    ladeWuensche.mockResolvedValue([WUNSCH, alt]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine?bereich=treatment');

    const abschnitt = (await screen.findByRole('heading', { name: 'Ihre Wünsche' })).closest(
      'section',
    )!;
    // Ein Satz über der Liste statt eines je Wunsch (§8).
    expect(abschnitt).toHaveTextContent(
      'Ein Wunsch ist noch kein Termin. Die Praxis meldet sich bei Ihnen.',
    );
    expect(
      screen.queryByText(/Ein vereinbarter Termin ist das noch nicht/),
    ).not.toBeInTheDocument();
    const zeile = within(screen.getByRole('list', { name: 'Ihre Wünsche' })).getByRole('listitem');
    expect(zeile).toHaveTextContent('Terminwunsch');
    expect(zeile).toHaveTextContent('angefragt');
    expect(zeile).toHaveTextContent('Dienstag oder Donnerstag, vormittags');
    expect(zeile).toHaveTextContent('„Bitte nicht vor 9 Uhr.“');
    expect(zeile).toHaveTextContent(/Gesendet am /);
    // Ein vor 30 Tagen beantworteter Wunsch ist keine Auskunft mehr.
    expect(screen.queryByText('Leider voll.')).not.toBeInTheDocument();

    ladeTermine.mockClear();
    await nutzer.click(within(zeile).getByRole('button', { name: 'Wunsch zurückziehen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja, zurückziehen' }));
    await waitFor(() =>
      expect(wunschZurueckziehen).toHaveBeenCalledWith(ZUGANG.access_id, WUNSCH.id),
    );
    // Auch die Termine laden neu: Das Statuszeichen eines Änderungswunschs geht mit.
    await waitFor(() => expect(ladeTermine).toHaveBeenCalled());
  });

  it('nennt die Rückmeldung nach dem Senden genau einmal', async () => {
    ladeTermine.mockResolvedValue([HAUSBESUCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine?bereich=treatment&gesendet=1');
    expect(
      await screen.findByText(
        'Ihr Wunsch ist bei der Praxis angekommen. Sie meldet sich bei Ihnen.',
      ),
    ).toBeInTheDocument();
  });

  it('beschreibt einen Videotermin ohne Ort und einen Hausbesuch mit Anschrift', () => {
    expect(terminBeschreibung({ ...HAUSBESUCH, appointment_type: 'video' })).toEqual({
      titel: 'Videotermin mit Anna Beispiel',
      ort: null,
    });
    expect(terminBeschreibung({ ...HAUSBESUCH, staff_name: null })).toEqual({
      titel: 'Hausbesuch · Ihre Praxis kommt zu Ihnen',
      ort: 'Testweg 7, 72072 Tuebingen',
    });
  });
});

describe('Hero je Lage (Handoff, Abschnitt 3)', () => {
  it('ein offener Absagewunsch steht als Statuszeichen an der Karte (ANN-772)', async () => {
    ladeTermine.mockResolvedValue([{ ...HAUSBESUCH, open_request_kind: 'cancel' }]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    const karte = await screen.findByRole('region', { name: /^Besuch / });
    expect(within(karte).getByText('Absage angefragt')).toBeInTheDocument();
  });

  it('heute: „Besuch heute“, der erste Termin heißt „Ihr erster Besuch“', async () => {
    const heute: Termin = { ...HAUSBESUCH, starts_at: in_(0, 23), ends_at: in_(1, 0) };
    ladeTermine.mockResolvedValue([heute]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    const karte = await screen.findByRole('region', { name: 'Besuch heute' });
    expect(karte).toHaveTextContent('Ihr erster Besuch');
  });

  it('Begleitung: „Nächster Besuch“, bei der Person, mit Wochentag und „kommt“', async () => {
    ladeTermine.mockResolvedValue([PRAXIS_VERGANGEN, HAUSBESUCH]);
    renderWithProviders(
      <Termine
        zugang={{
          ...ZUGANG,
          access_kind: 'legal_representative',
          represented_name: 'Maximilian Mustermann-Langenscheidt',
        }}
      />,
      '/p/termine',
    );
    const karte = await screen.findByRole('region', {
      name: 'Besuch bei Maximilian Mustermann-Langenscheidt',
    });
    expect(karte).toHaveTextContent('Nächster Besuch');
    expect(karte).not.toHaveTextContent('Ihr nächster');
    expect(karte).toHaveTextContent(
      /^.*(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), /,
    );
    expect(karte).toHaveTextContent('Anna Beispiel kommt');
    expect(karte).not.toHaveTextContent('kommt zu Ihnen');
  });

  it('Training: „Ihr nächstes Training“, „Training am …“, in der Praxis mit Standort', async () => {
    ladeTermine.mockResolvedValue([PRAXIS_VERGANGEN, { ...PRAXIS, open_request_kind: null }]);
    renderWithProviders(
      <Termine zugang={{ ...ZUGANG, relationship_kind: 'training' }} />,
      '/p/termine',
    );
    const karte = await screen.findByRole('region', { name: /^Training am / });
    expect(karte).toHaveTextContent('Ihr nächstes Training');
    expect(karte).toHaveTextContent('In der Praxis bei Jannes Test');
    expect(karte).toHaveTextContent('Hauptstandort Tuebingen');
  });
});

describe('Laden, Fehler, ohne Netz (Handoff 5.6)', () => {
  it('lädt als Skelett ohne bedienbaren Knopf (DR-136)', () => {
    ladeTermine.mockReturnValue(new Promise<Termin[]>(() => undefined));
    const { container } = renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    expect(screen.getByRole('heading', { level: 1, name: 'Termine' })).toBeInTheDocument();
    expect(screen.getByText('Termine werden geladen')).toHaveClass('sr-only');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('[data-skelett="hero-termin"]')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Termin wünschen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('beim Fehler bleibt „Termin wünschen“, der Satz sagt es', async () => {
    ladeTermine.mockRejectedValue(new Error('Ihre Termine konnten nicht geladen werden.'));
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine?bereich=treatment');
    expect(
      await screen.findByText('Ihre Termine lassen sich gerade nicht laden.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Versuchen Sie es gleich noch einmal. Einen Termin wünschen können Sie trotzdem.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /erneut/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Termin wünschen' })).toHaveAttribute(
      'href',
      '/p/termine/wunsch?bereich=treatment',
    );
  });

  it('ohne Netz bleibt alles lesbar, „Termin wünschen“ ist gesperrt, mit Satz (Frage 4)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    ladeTermine.mockResolvedValue([PRAXIS, HAUSBESUCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    await screen.findByRole('region', { name: /^Besuch / });
    expect(screen.queryByRole('link', { name: 'Termin wünschen' })).not.toBeInTheDocument();
    const knopf = screen.getByRole('button', { name: 'Termin wünschen' });
    expect(knopf).toBeDisabled();
    expect(knopf).toHaveAccessibleDescription(WUENSCHE_OHNE_NETZ);
    expect(screen.getByRole('list', { name: 'Weitere Termine' })).toBeInTheDocument();
  });

  it('ohne Netz ist auch „Wunsch zurückziehen“ gesperrt, mit demselben Satz (ANN-773)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    ladeTermine.mockResolvedValue([HAUSBESUCH]);
    ladeWuensche.mockResolvedValue([WUNSCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    const zurueck = await screen.findByRole('button', { name: 'Wunsch zurückziehen' });
    expect(zurueck).toBeDisabled();
    expect(zurueck).toHaveAccessibleDescription(WUENSCHE_OHNE_NETZ);
    // Der Satz steht einmal, unter dem gesperrten Knopf.
    expect(screen.getAllByText(WUENSCHE_OHNE_NETZ)).toHaveLength(1);
  });
});

describe('Lesefrist (Frage 5)', () => {
  const ENDE: Plattformzugang = { ...ZUGANG, read_until: '2027-01-16T00:00:00+01:00' };

  it('sagt das Ende über dem Titel, wünschen geht nicht, Vergangenes ist offen', async () => {
    ladeTermine.mockResolvedValue([PRAXIS_VERGANGEN]);
    ladePlaene.mockResolvedValue({
      today: kalendertag(new Date()),
      plans: [
        eigenerPlan({
          runs_from: '2000-01-01',
          runs_until: '2999-12-31',
          weekdays: [1, 2, 3, 4, 5, 6, 7],
        }),
      ],
    });
    renderWithProviders(<Termine zugang={ENDE} />, '/p/termine');
    const vergangen = await screen.findByRole('heading', { level: 2, name: 'Vergangene Termine' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ihre Behandlung ist beendet. Sie können hier noch bis 15.01.2027 lesen.',
    );
    const titel = screen.getByRole('heading', { level: 1, name: 'Termine' });
    expect(
      screen.getByRole('status').compareDocumentPosition(titel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Der Satz zu neuen Terminen steht in der Meldung, der Kopf trägt nur den Titel.
    expect(screen.getByRole('status')).toHaveTextContent(
      'Neue Termine vereinbaren Sie bei Bedarf direkt mit der Praxis.',
    );
    expect(screen.queryByRole('link', { name: /Termin wünschen/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Zurzeit ist kein Termin vereinbart.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Diese Woche' })).not.toBeInTheDocument();
    expect(vergangen.closest('summary')).toBeNull();
    expect(screen.getByRole('list', { name: 'Vergangene Termine' })).toBeVisible();
  });

  it('mit laufendem Nachsorge-Abo ist noch keine Lesefrist (ANN-274)', async () => {
    ladeTermine.mockResolvedValue([HAUSBESUCH]);
    ladeAbo.mockResolvedValue({ state: 'running', ends_on: null });
    renderWithProviders(<Termine zugang={ENDE} />, '/p/termine');
    expect(await screen.findByRole('link', { name: 'Termin wünschen' })).toBeInTheDocument();
    expect(ladeAbo).toHaveBeenCalledWith(ENDE.access_id);
    expect(screen.queryByText(/Sie können hier noch bis/)).not.toBeInTheDocument();
  });

  it('nach einem Nachsorge-Abo nennt der Satz dessen Ende', async () => {
    ladeTermine.mockResolvedValue([PRAXIS_VERGANGEN]);
    ladeAbo.mockResolvedValue({ state: 'ended', ends_on: '2026-12-16' });
    renderWithProviders(<Termine zugang={ENDE} />, '/p/termine');
    expect(
      await screen.findByText(
        'Ihr Nachsorge-Abo endete am 16.12.2026. Sie können hier noch bis 15.01.2027 lesen.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Rechner (ANN-775)', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (abfrage: string) => ({
      matches: abfrage === RECHNER_ABFRAGE,
      media: abfrage,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });

  it('im Baum zuerst Hero und Knopf, dann die Listen', async () => {
    ladeTermine.mockResolvedValue([PRAXIS, HAUSBESUCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    const weitere = await screen.findByRole('heading', { name: 'Weitere Termine' });
    const karte = screen.getByRole('region', { name: /^Besuch / });
    const knopf = screen.getByRole('link', { name: 'Termin wünschen' });
    expect(karte.compareDocumentPosition(knopf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(knopf.compareDocumentPosition(weitere) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(knopf).toHaveClass('w-full');
  });

  it('ohne etwas für links eine Spalte: die Karte allein, darunter der Knopf (H1)', async () => {
    ladeTermine.mockResolvedValue([HAUSBESUCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine?gesendet=1');
    const karte = await screen.findByRole('region', { name: /^Besuch / });
    expect(karte.closest('.max-w-spalte')).not.toBeNull();
    expect(karte.closest('[data-spalten="zwei"]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Termin wünschen' })).not.toHaveClass('w-full');
    // Die Rückmeldung so breit wie die Spalte darunter.
    expect(
      screen
        .getByText('Ihr Wunsch ist bei der Praxis angekommen. Sie meldet sich bei Ihnen.')
        .closest('.max-w-spalte'),
    ).not.toBeNull();
  });

  it('über zwei Spalten reicht die Rückmeldung über beide (H8)', async () => {
    ladeTermine.mockResolvedValue([PRAXIS, HAUSBESUCH]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine?gesendet=1');
    const karte = await screen.findByRole('region', { name: /^Besuch / });
    expect(karte.closest('[data-spalten="zwei"]')).not.toBeNull();
    // Gekappt nur, wenn die zwei Spalten nicht passen (Maße: E2E).
    expect(
      screen
        .getByText('Ihr Wunsch ist bei der Praxis angekommen. Sie meldet sich bei Ihnen.')
        .closest('.max-w-spalte'),
    ).toHaveClass('@terminspalten:max-w-none');
  });

  it('ohne Termin eine Spalte, der Knopf so breit wie sein Text', async () => {
    ladeTermine.mockResolvedValue([]);
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    const knopf = await screen.findByRole('link', { name: 'Termin wünschen' });
    expect(knopf).not.toHaveClass('w-full');
    expect(knopf.closest('.max-w-spalte')).not.toBeNull();
  });
});

describe('Diese Woche (UEB-011, Handoff Abschnitt 3)', () => {
  it('nur Tage mit etwas, Zeichen und Text in einer Zeile; die leeren Tage zusammen', async () => {
    const heute = kalendertag(new Date());
    const heuteTermin: Termin = { ...HAUSBESUCH, starts_at: in_(0, 23), ends_at: in_(1, 0) };
    ladeTermine.mockResolvedValue([heuteTermin]);
    ladePlaene.mockResolvedValue({
      today: heute,
      plans: [
        eigenerPlan({
          runs_from: '2000-01-01',
          runs_until: '2999-12-31',
          weekdays: [isoWochentag(heute)],
          recent_sessions: [{ performed_on: heute, finished: true }],
        }),
      ],
    });
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    const woche = await screen.findByRole('list', { name: 'Die nächsten sieben Tage' });
    const zeilen = within(woche).getAllByRole('listitem');
    // Heute mit Besuch und Übungstag, die übrigen sechs Tage in einer Zeile.
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]).toHaveTextContent('Heute');
    expect(zeilen[0]).toHaveTextContent('23:30 Hausbesuch · Anna Beispiel');
    expect(zeilen[0]).toHaveTextContent('Übungstag · Heimprogramm Knie · geübt');
    expect(zeilen[1]).toHaveTextContent(/ bis .*nichts geplant$/);
    expect(woche).not.toHaveTextContent('Nichts geplant.');
    expect(tagInWorten(heuteTermin.starts_at)).toMatch(/^Heute, /);
  });

  it('zeigt die Woche nicht, solange keine Übungstage gewählt sind', async () => {
    ladeTermine.mockResolvedValue([HAUSBESUCH]);
    ladePlaene.mockResolvedValue({ today: '2026-10-08', plans: [eigenerPlan()] });
    renderWithProviders(<Termine zugang={ZUGANG} />, '/p/termine');
    await screen.findByRole('region', { name: /^Besuch / });
    expect(screen.queryByRole('heading', { name: 'Diese Woche' })).not.toBeInTheDocument();
  });
});
