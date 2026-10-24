import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import type * as PlattformApi from './api';
import type { EigenePlaene, EigenerPlan, Plattformzugang, Termin } from './api';
import { renderWithProviders } from '@/test-utils';
import { speicherImSpeicher, speicherSetzen } from '@/lib/geraeteablage';
import { eigenerPlan } from './testdaten';

/**
 * Reiter „Übungen" bzw. „Training" (UEB-009, DSN-001 4.1 und 5) in der
 * Fassung des Handoffs 2026-10-24 (Abschnitte 3 und 5.1 bis 5.6): Vorschau
 * der Einheit in allen Lagen, Plan mit Wochenleiste, Übungszeilen und „Zum
 * Plan“, Fenster „Übung zum Nachlesen“, ohne Antwort der Plan vom Gerät
 * (BEF-197) - und der Plan als Blatt auf der Plattform (ANN-303, D2).
 *
 * „Heute“ ist Donnerstag, der 8. Oktober 2026 (ISO-Wochentag 4); nur die Uhr
 * des Datums steht, alle anderen Zeitgeber laufen echt.
 */

const ladePlaene = vi.fn();
const ladeTermine = vi.fn();
const uebungstageSetzen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladePlaene: (...args: unknown[]) => ladePlaene(...args) as Promise<EigenePlaene>,
  ladeTermine: (...args: unknown[]) => ladeTermine(...args) as Promise<Termin[]>,
  uebungstageSetzen: (...args: unknown[]) => uebungstageSetzen(...args) as Promise<void>,
}));

const { Uebungen, PlanblattPlattform } = await import('./Uebungen');
const { DurchfuehrungKontext, ablageZuruecksetzen, plaeneAblegen } = await import('./ablage');

const HEUTE = '2026-10-08';
const KONTO = 'eeeeeeee-0000-4000-8000-000000000001';
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

/** Der nächste Termin mit Anna Beispiel - N1 für „{Name} sieht …“. */
const TERMIN: Termin = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  starts_at: '2026-10-12T09:30:00+02:00',
  ends_at: '2026-10-12T10:30:00+02:00',
  appointment_type: 'home_visit',
  status: 'confirmed',
  staff_name: 'Anna Beispiel',
  location_name: null,
  visit_street: 'Am Hang',
  visit_house_number: '3',
  visit_postal_code: '72072',
  visit_city: 'Tübingen',
  late_notice: false,
  open_request_kind: null,
};

const OFFEN = { id: 'cccccccc-0000-4000-8000-000000000001', sets: [] };
const ERSTE = 'bbbbbbbb-0000-4000-8000-000000000001';

/** Ein Plan mit zwei Übungen: die erste aus `eigenerPlan`, die zweite auf Zeit. */
function zweiUebungen(teil: Partial<EigenerPlan> = {}): EigenerPlan {
  const basis = eigenerPlan();
  return eigenerPlan({
    items: [
      basis.items[0]!,
      {
        ...basis.items[0]!,
        id: 'bbbbbbbb-0000-4000-8000-000000000002',
        position: 2,
        variant_lay_name: 'Auf einem Bein stehen',
        equipment: [],
        reps_min: null,
        reps_max: null,
        duration_seconds: 30,
        sets: 2,
        rest_seconds: null,
        load: 'Rucksack 3 kg',
        note: null,
      },
    ],
    ...teil,
  });
}

function zeige(ui: ReactElement, pfad = '/p/uebungen') {
  return renderWithProviders(
    <DurchfuehrungKontext.Provider value={{ besitzer: KONTO, anstossen: null }}>
      {ui}
    </DurchfuehrungKontext.Provider>,
    pfad,
  );
}

function setzeVerbindung(verbunden: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: verbunden, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(verbunden ? 'online' : 'offline'));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00'));
  speicherSetzen(speicherImSpeicher());
  ablageZuruecksetzen();
  for (const f of [ladePlaene, ladeTermine, uebungstageSetzen]) f.mockReset();
  uebungstageSetzen.mockResolvedValue(undefined);
  ladeTermine.mockResolvedValue([]);
  ladePlaene.mockResolvedValue({ today: HEUTE, plans: [eigenerPlan()] });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  onlineManager.setOnline(true);
});

async function vorschau(name: string | RegExp = /Ihre Übungen|Ihr Plan/) {
  return screen.findByRole('region', { name });
}

describe('Reiter Übungen (UEB-009, Handoff 5.1)', () => {
  it('zeigt die Vorschau, den Plan in Worten, die Übungen als Zeilen und „Zum Plan“', async () => {
    zeige(<Uebungen zugang={ZUGANG} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Übungen' })).toBeInTheDocument();
    // Ohne gewählte Tage: „Ihr Plan“, Umfang mit Dauer und was man braucht.
    const karte = await vorschau('Ihre Übungen');
    expect(within(karte).getByText('Ihr Plan')).toBeInTheDocument();
    expect(
      within(karte)
        .getAllByRole('listitem')
        .map((a) => a.textContent),
    ).toEqual(['Eine Übung · etwa 5 Minuten', 'Sie brauchen: Geländer']);
    expect(within(karte).getByRole('link', { name: 'Übungen beginnen' })).toHaveAttribute(
      'href',
      `/p/uebungen/einheit/${eigenerPlan().id}`,
    );
    // Der Plan: Laufzeit und Stand in Worten (Befund B9), die Häufigkeit im
    // Satz der Wochenleiste.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Heimprogramm Knie' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Bis 18. November · Stand 7. Oktober')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Wählen Sie die Tage, an denen Sie üben möchten. Empfohlen: 3-⁠mal pro Woche.',
      ),
    ).toBeInTheDocument();
    // Je Übung eine Zeile mit Nummer, Name und Dosierung kurz.
    expect(screen.getByRole('heading', { level: 3, name: 'Die Übungen' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: '1. Am Geländer in die Hocke 3 Durchgänge · je 10 bis 12 Wiederholungen',
      }),
    ).toBeInTheDocument();
    // Zum Plan: PDF und Frage, je eine Zeile.
    expect(screen.getByRole('heading', { level: 3, name: 'Zum Plan' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plan als PDF' })).toHaveAttribute(
      'href',
      `/p/uebungen/blatt/${eigenerPlan().id}`,
    );
    expect(screen.getByRole('link', { name: 'Frage zu diesem Plan' })).toHaveAttribute(
      'href',
      `/p/nachrichten/neu?plan=${eigenerPlan().id}`,
    );
    // Keine Punktzahl, keine Serie, kein Lob (DSN-001 4.1).
    expect(screen.queryByText(/Punkte|Serie|Super|Toll/)).not.toBeInTheDocument();
  });

  it('öffnet die Übung zum Nachlesen mit Bühne, Marken und Anleitung, ohne Durchgänge', async () => {
    const user = userEvent.setup();
    ladePlaene.mockResolvedValue({ today: HEUTE, plans: [zweiUebungen()] });
    zeige(<Uebungen zugang={ZUGANG} />);
    await user.click(await screen.findByRole('button', { name: /^1\. Am Geländer in die Hocke/ }));
    const fenster = screen.getByRole('dialog', { name: 'Am Geländer in die Hocke' });
    expect(within(fenster).getByText('Übung 1 von 2')).toBeInTheDocument();
    // Der Name steht auf der Bühne als h2, darunter die Hauptzahl.
    const buehne = within(fenster).getByRole('region', { name: 'Am Geländer in die Hocke' });
    expect(within(buehne).getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(buehne).toHaveTextContent('10 bis 12');
    expect(buehne).toHaveTextContent('Wiederholungen je Durchgang');
    const marken = within(fenster).getByRole('list', { name: 'Dosierung' });
    expect(
      within(marken)
        .getAllByRole('listitem')
        .map((m) => m.textContent),
    ).toEqual(['3 Durchgänge', '30 Sekunden Pause']);
    expect(
      within(fenster).getByRole('heading', { level: 3, name: 'So geht’s' }),
    ).toBeInTheDocument();
    expect(within(fenster).getByText('Festhalten.')).toBeInTheDocument();
    expect(within(fenster).getByText('Langsam ablassen.')).toBeInTheDocument();
    // Ohne Durchgänge, ohne Zeichnung (ANN-539).
    expect(within(fenster).queryByRole('button', { name: /Durchgang/ })).not.toBeInTheDocument();
    expect(within(fenster).queryByRole('img')).not.toBeInTheDocument();
    // Zwei Wege hinaus: oben und am Ende, beide „Schließen“.
    const schliessen = within(fenster).getAllByRole('button', { name: 'Schließen' });
    expect(schliessen).toHaveLength(2);
    await user.click(schliessen[1]!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Die zweite Übung auf Zeit: Sekunden je Durchgang und die Last als Marke.
    await user.click(screen.getByRole('button', { name: /^2\. Auf einem Bein stehen/ }));
    const zweite = screen.getByRole('dialog', { name: 'Auf einem Bein stehen' });
    expect(within(zweite).getByText('Übung 2 von 2')).toBeInTheDocument();
    expect(within(zweite).getByText('Sekunden je Durchgang')).toBeInTheDocument();
    expect(within(zweite).getByText('mit Rucksack 3 kg')).toBeInTheDocument();
    await user.click(within(zweite).getAllByRole('button', { name: 'Schließen' })[0]!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('heißt im Training „Training", die Vorschau „Ihr Plan für zu Hause"', async () => {
    ladePlaene.mockResolvedValue({
      today: HEUTE,
      plans: [eigenerPlan({ service_area: 'training', weekdays: [4] })],
    });
    zeige(<Uebungen zugang={{ ...ZUGANG, relationship_kind: 'training' }} />);
    const karte = await vorschau('Ihr Plan für zu Hause');
    expect(within(karte).getByText('Heute ist Übungstag')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument();
  });
});

describe('Vorschau der Einheit in ihren Lagen (Handoff, Abschnitt 3)', () => {
  it('heute Übungstag: „Ihre Übungen für heute“ mit „Übungen beginnen“', async () => {
    ladePlaene.mockResolvedValue({ today: HEUTE, plans: [zweiUebungen({ weekdays: [1, 4] })] });
    zeige(<Uebungen zugang={ZUGANG} />);
    const karte = await vorschau('Ihre Übungen für heute');
    expect(within(karte).getByText('Heute ist Übungstag')).toBeInTheDocument();
    // 234 s und 2 × 30 s × 1 + 30 s = 90 s: 5,4 Minuten.
    expect(within(karte).getByText('2 Übungen · etwa 5 Minuten')).toBeInTheDocument();
    expect(within(karte).getByText('Sie brauchen: Geländer, Rucksack 3 kg')).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: 'Übungen beginnen' })).toBeInTheDocument();
  });

  it('anderer Tag: nennt den nächsten Übungstag', async () => {
    ladePlaene.mockResolvedValue({ today: HEUTE, plans: [eigenerPlan({ weekdays: [1, 3] })] });
    zeige(<Uebungen zugang={ZUGANG} />);
    const karte = await vorschau('Ihre Übungen');
    expect(within(karte).getByText('Nächster Übungstag: Montag')).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: 'Übungen beginnen' })).toBeInTheDocument();
  });

  it('heute begonnen: „Weiter üben“ an der ersten Übung mit offenem Durchgang', async () => {
    ladePlaene.mockResolvedValue({
      today: HEUTE,
      plans: [
        zweiUebungen({
          weekdays: [4],
          open_session: {
            ...OFFEN,
            sets: [1, 2, 3].map((n) => ({ item_id: ERSTE, set_number: n })),
          },
          recent_sessions: [{ performed_on: HEUTE, finished: false }],
        }),
      ],
    });
    zeige(<Uebungen zugang={ZUGANG} />);
    const karte = await vorschau('Ihre Übungen für heute');
    expect(within(karte).getByText('Heute begonnen')).toBeInTheDocument();
    expect(
      within(karte).getByText('Weiter bei Übung 2: Auf einem Bein stehen'),
    ).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: 'Weiter üben' })).toHaveAttribute(
      'href',
      `/p/uebungen/einheit/${eigenerPlan().id}`,
    );
    // Die erste Übung ist heute erledigt - als Wort, nicht nur als Farbe.
    expect(screen.getByRole('button', { name: /^1\. Am Geländer/ })).toHaveTextContent(
      'Heute erledigt',
    );
    expect(screen.getByRole('button', { name: /^2\. Auf einem Bein/ })).not.toHaveTextContent(
      'Heute erledigt',
    );
  });

  it('heute geübt: wer die Einheit sieht, der nächste Tag und leise „Noch einmal üben“', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    ladePlaene.mockResolvedValue({
      today: HEUTE,
      plans: [
        eigenerPlan({
          weekdays: [1, 4],
          recent_sessions: [{ performed_on: HEUTE, finished: true }],
        }),
      ],
    });
    zeige(<Uebungen zugang={ZUGANG} />);
    const karte = await vorschau('Ihre Übungen für heute');
    expect(within(karte).getByText('Heute geübt')).toBeInTheDocument();
    expect(
      await within(karte).findByText(
        'Gespeichert. Anna Beispiel sieht Ihre Einheit beim nächsten Termin.',
      ),
    ).toBeInTheDocument();
    expect(within(karte).getByText('Nächster Übungstag: Montag')).toBeInTheDocument();
    const leise = within(karte).getByRole('link', { name: 'Noch einmal üben' });
    expect(leise.className).toContain('underline');
    expect(within(karte).queryByRole('link', { name: 'Übungen beginnen' })).not.toBeInTheDocument();
  });

  it('heute geübt ohne Termin: „Ihre Therapeut:in sieht …“', async () => {
    ladePlaene.mockResolvedValue({
      today: HEUTE,
      plans: [eigenerPlan({ recent_sessions: [{ performed_on: HEUTE, finished: true }] })],
    });
    zeige(<Uebungen zugang={ZUGANG} />);
    const karte = await vorschau('Ihre Übungen für heute');
    expect(
      within(karte).getByText(
        'Gespeichert. Ihre Therapeut:in sieht Ihre Einheit beim nächsten Termin.',
      ),
    ).toBeInTheDocument();
  });

  it('Lesefrist: Meldung oben, Plan zum Mitnehmen, nur die Übungen', async () => {
    ladePlaene.mockResolvedValue({
      today: HEUTE,
      plans: [
        eigenerPlan({
          status: 'ended',
          ended_on: '2026-10-01',
          can_exercise: false,
          can_choose_days: false,
        }),
      ],
    });
    zeige(<Uebungen zugang={{ ...ZUGANG, read_until: '2026-11-01T00:00:00+01:00' }} />);
    expect(
      await screen.findByText(
        'Ihre Behandlung ist beendet. Sie können hier noch bis 31.10.2026 lesen.',
      ),
    ).toBeInTheDocument();
    const karte = await vorschau('Ihr Plan zum Mitnehmen');
    expect(within(karte).getByText('Plan beendet')).toBeInTheDocument();
    expect(
      within(karte).getByText(
        'Heimprogramm Knie, beendet am 1. Oktober. Als PDF bleibt er bei Ihnen.',
      ),
    ).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: 'Plan als PDF sichern' })).toHaveAttribute(
      'href',
      `/p/uebungen/blatt/${eigenerPlan().id}`,
    );
    expect(screen.getByText('Beendet am 1. Oktober · zum Nachlesen')).toBeInTheDocument();
    // Nur die Übungen: keine Tage, kein „Zum Plan“, keine Frage, kein Üben.
    expect(screen.queryByRole('group', { name: 'Ihre Übungstage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Zum Plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Übungen beginnen' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^1\. Am Geländer/ })).toBeInTheDocument();
    // Der alte Satz am Plan entfällt; die Vorschau sagt es.
    expect(screen.queryByText(/Dieser Plan ist beendet/)).not.toBeInTheDocument();
  });

  it('mehrere Pläne: der mit heutigem Übungstag zuerst, der weitere mit Zweitknopf', async () => {
    const zweiter = eigenerPlan({
      id: 'aaaaaaaa-0000-4000-8000-000000000002',
      title: 'Schulter mobil',
      weekdays: [4],
    });
    ladePlaene.mockResolvedValue({
      today: HEUTE,
      plans: [eigenerPlan({ weekdays: [1] }), zweiter],
    });
    zeige(<Uebungen zugang={ZUGANG} />);
    const karte = await vorschau('Ihre Übungen für heute');
    expect(
      within(karte).getByText('Schulter mobil · Eine Übung · etwa 5 Minuten'),
    ).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: 'Übungen beginnen' })).toHaveAttribute(
      'href',
      `/p/uebungen/einheit/${zweiter.id}`,
    );
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Ihre Übungen für heute',
      'Schulter mobil',
      'Heimprogramm Knie',
    ]);
    // Der weitere Plan trägt seinen eigenen Zweitknopf.
    const knoepfe = screen.getAllByRole('link', { name: 'Übungen beginnen' });
    expect(knoepfe).toHaveLength(2);
    expect(knoepfe[1]).toHaveAttribute('href', `/p/uebungen/einheit/${eigenerPlan().id}`);
  });

  it('bietet ohne Recht zum Üben keinen Knopf (Begleitung, vor dem Beginn)', async () => {
    ladePlaene.mockResolvedValue({
      today: HEUTE,
      plans: [eigenerPlan({ can_exercise: false, runs_from: '2026-10-12' })],
    });
    zeige(<Uebungen zugang={ZUGANG} />);
    const karte = await vorschau('Ihre Übungen');
    expect(within(karte).getByText('Ab 12. Oktober')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Übungen beginnen' })).not.toBeInTheDocument();
    expect(screen.getByText('Ab 12. Oktober · Stand 7. Oktober')).toBeInTheDocument();
  });

  it('sagt ohne Netz, dass es trotzdem geht, und sperrt die Übungstage', async () => {
    ladePlaene.mockResolvedValue({ today: HEUTE, plans: [eigenerPlan({ weekdays: [4] })] });
    zeige(<Uebungen zugang={ZUGANG} />);
    const karte = await vorschau('Ihre Übungen für heute');
    setzeVerbindung(false);
    expect(within(karte).getByText('Geht auch ohne Netz.')).toBeInTheDocument();
    const gruppe = screen.getByRole('group', { name: 'Ihre Übungstage' });
    expect(within(gruppe).getByRole('button', { name: 'Donnerstag' })).toBeDisabled();
    expect(
      screen.getByText('Sie üben an einem Tag. Ändern geht wieder mit Verbindung.'),
    ).toBeInTheDocument();
  });
});

describe('Kein Plan, Laden, Fehler (Handoff 5.1 und 5.6)', () => {
  it('nennt ohne Plan die Person des nächsten Termins (N1)', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    ladePlaene.mockResolvedValue({ today: HEUTE, plans: [] });
    zeige(<Uebungen zugang={ZUGANG} />);
    expect(await screen.findByText('Noch kein Plan')).toBeInTheDocument();
    expect(
      await screen.findByText('Anna Beispiel stellt Ihnen hier Übungen zusammen.'),
    ).toBeInTheDocument();
  });

  it('sagt ohne Plan und ohne Termin, dass die Therapeut:in ihn zusammenstellt', async () => {
    ladePlaene.mockResolvedValue({ today: HEUTE, plans: [] });
    zeige(<Uebungen zugang={ZUGANG} />);
    expect(
      await screen.findByText('Ihre Therapeut:in stellt Ihnen hier Übungen zusammen.'),
    ).toBeInTheDocument();
  });

  it('sagt im Training, wer den Plan macht', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    ladePlaene.mockResolvedValue({ today: HEUTE, plans: [] });
    zeige(<Uebungen zugang={{ ...ZUGANG, relationship_kind: 'training' }} />);
    expect(
      await screen.findByText('Ihre Trainingsbetreuung stellt Ihnen hier Ihren Plan zusammen.'),
    ).toBeInTheDocument();
  });

  it('zeigt beim Laden das Skelett mit Satz für Vorlesesoftware', () => {
    ladePlaene.mockReturnValue(new Promise(() => undefined));
    const { container } = zeige(<Uebungen zugang={ZUGANG} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Übungen' })).toBeInTheDocument();
    const bereich = container.querySelector('[aria-busy="true"]')!;
    expect(bereich).toHaveTextContent('Übungen werden geladen');
    expect(bereich.querySelector('[data-skelett="vorschau"]')).not.toBeNull();
    expect(bereich.querySelector('[data-skelett="leiste"]')).not.toBeNull();
  });

  it('meldet einen Ladefehler ohne Plan auf dem Gerät mit erneutem Versuch', async () => {
    ladePlaene.mockRejectedValue(new Error('kaputt'));
    const user = userEvent.setup();
    zeige(<Uebungen zugang={ZUGANG} />);
    expect(
      await screen.findByText('Ihre Übungen lassen sich gerade nicht laden.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Prüfen Sie die Verbindung oder versuchen Sie es gleich noch einmal.'),
    ).toBeInTheDocument();
    ladePlaene.mockResolvedValue({ today: HEUTE, plans: [eigenerPlan()] });
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await vorschau('Ihre Übungen')).toBeInTheDocument();
  });
});

describe('Plan vom Gerät (BEF-197, ADR-024 Punkt 5)', () => {
  beforeEach(async () => {
    await plaeneAblegen(KONTO, ZUGANG.access_id, null, {
      today: HEUTE,
      plans: [zweiUebungen({ weekdays: [4] })],
    });
  });

  it('sagt bei Verbindung, dass die Praxis nicht antwortet - geübt wird vom Gerät', async () => {
    ladePlaene.mockRejectedValue(new Error('Ihre Übungen konnten nicht geladen werden.'));
    zeige(<Uebungen zugang={ZUGANG} />);
    expect(
      await screen.findByText(
        'Die Praxis antwortet gerade nicht. Üben können Sie trotzdem – mit Ihrem Plan vom 8. Oktober.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Ohne Verbindung/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    const karte = await vorschau('Ihre Übungen');
    expect(within(karte).getByText('Ihr Plan auf diesem Gerät')).toBeInTheDocument();
    expect(within(karte).getByText('2 Übungen · etwa 5 Minuten')).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: 'Übungen beginnen' })).toHaveAttribute(
      'href',
      `/p/uebungen/einheit/${eigenerPlan().id}`,
    );
    expect(
      screen.getByText('Übungstage und Laufzeit sehen Sie wieder, sobald die Praxis antwortet.'),
    ).toBeInTheDocument();
    // Die Ablage trägt nur die Felder der Durchführung: keine Tage, kein PDF.
    expect(screen.queryByRole('group', { name: 'Ihre Übungstage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Plan als PDF' })).not.toBeInTheDocument();
    // Die Übungen lassen sich trotzdem nachlesen.
    expect(screen.getByRole('button', { name: /^2\. Auf einem Bein stehen/ })).toBeInTheDocument();
  });

  it('lässt ohne Netz die Verbindungszeile sprechen', async () => {
    setzeVerbindung(false);
    // Die Abfragen pausieren ohne Netz, statt zu scheitern.
    onlineManager.setOnline(false);
    zeige(<Uebungen zugang={ZUGANG} />);
    expect(
      await screen.findByText('Übungstage und Laufzeit sehen Sie wieder mit Verbindung.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Die Praxis antwortet gerade nicht/)).not.toBeInTheDocument();
    expect(ladePlaene).not.toHaveBeenCalled();
    expect(await vorschau('Ihre Übungen')).toHaveTextContent('Ihr Plan auf diesem Gerät');
  });
});

describe('Ihre Übungstage (UEB-011, Wochenleiste)', () => {
  it('wählt Tage und speichert sofort; der Satz zählt mit', async () => {
    ladePlaene.mockResolvedValue({ today: HEUTE, plans: [eigenerPlan({ weekdays: [1] })] });
    const user = userEvent.setup();
    zeige(<Uebungen zugang={ZUGANG} />);
    const gruppe = await screen.findByRole('group', { name: 'Ihre Übungstage' });
    expect(within(gruppe).getByRole('button', { name: 'Montag' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByText(
        'Sie üben an einem Tag. Empfohlen: 3-⁠mal pro Woche. Die Tage sehen nur Sie.',
      ),
    ).toBeInTheDocument();
    await user.click(within(gruppe).getByRole('button', { name: 'Donnerstag' }));
    await waitFor(() =>
      expect(uebungstageSetzen).toHaveBeenCalledWith(ZUGANG.access_id, eigenerPlan().id, [1, 4]),
    );
    expect(within(gruppe).getByRole('button', { name: 'Donnerstag' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByText('Sie üben an 2 Tagen. Empfohlen: 3-⁠mal pro Woche. Die Tage sehen nur Sie.'),
    ).toBeInTheDocument();
  });

  it('nimmt die Wahl bei einem Fehler zurück und sagt es', async () => {
    uebungstageSetzen.mockRejectedValue(
      new Error('Nicht gespeichert. Bitte die Verbindung prüfen und erneut tippen.'),
    );
    const user = userEvent.setup();
    zeige(<Uebungen zugang={ZUGANG} />);
    const gruppe = await screen.findByRole('group', { name: 'Ihre Übungstage' });
    await user.click(within(gruppe).getByRole('button', { name: 'Freitag' }));
    expect(
      await screen.findByText('Nicht gespeichert. Bitte die Verbindung prüfen und erneut tippen.'),
    ).toBeInTheDocument();
    expect(within(gruppe).getByRole('button', { name: 'Freitag' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('zeigt ohne Recht zum Wählen nur die Tage, die Häufigkeit in der Zeile', async () => {
    ladePlaene.mockResolvedValue({
      today: HEUTE,
      plans: [eigenerPlan({ can_exercise: false, can_choose_days: false, weekdays: [1, 3] })],
    });
    zeige(<Uebungen zugang={ZUGANG} />);
    expect(await screen.findByText('Ihre Übungstage: Mo, Mi')).toBeInTheDocument();
    expect(
      screen.getByText('Bis 18. November · Stand 7. Oktober · 3-mal pro Woche'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ihre Übungstage' })).not.toBeInTheDocument();
  });
});

describe('Rückmeldung nach dem Speichern', () => {
  it('bestätigt eine gespeicherte Einheit ohne Lob', async () => {
    zeige(<Uebungen zugang={ZUGANG} />, '/p/uebungen?gespeichert=1');
    expect(await screen.findByText('Ihre Einheit ist gespeichert.')).toBeInTheDocument();
  });
});

describe('Plan als Blatt auf der Plattform (ANN-303)', () => {
  it('druckt den eigenen Plan ohne Namen', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <PlanblattPlattform zugang={ZUGANG} praxis="Test Praxis Tuebingen" />,
      `/p/uebungen/blatt/${eigenerPlan().id}`,
    );
    const blatt = await screen.findByRole('article', { name: 'Planblatt' });
    expect(blatt).toHaveTextContent('Test Praxis Tuebingen');
    expect(blatt).toHaveTextContent('Ihr Übungsplan');
    expect(blatt).not.toHaveTextContent(' für ');
    expect(blatt).toHaveTextContent('Hinweis: Langsam ablassen.');
    // Das Blatt beginnt mit h2; die Seite trägt die h1 (DR-158).
    expect(screen.getByRole('heading', { level: 1, name: 'Ihr Plan' })).toBeInTheDocument();
    expect(within(blatt).getByRole('heading', { level: 2 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Drucken oder als PDF sichern' }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('kennt einen fremden Plan nicht', async () => {
    renderWithProviders(
      <PlanblattPlattform zugang={ZUGANG} praxis="Test Praxis Tuebingen" />,
      '/p/uebungen/blatt/ffffffff-0000-4000-8000-000000000009',
    );
    expect(await screen.findByText('Diesen Plan gibt es hier nicht.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Drucken oder als PDF sichern' }),
    ).not.toBeInTheDocument();
  });
});
