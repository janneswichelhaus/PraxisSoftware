import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusManager } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import type * as BerichtApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import type { RoleKey } from '@/features/session/types';

const fetchBericht = vi.fn();
const fetchBerichtQuellen = vi.fn();
const berichtSpeichern = vi.fn();
const berichtAbschliessen = vi.fn();
const berichtVerwerfen = vi.fn();
const druckVermerken = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BerichtApi>();
  return {
    ...actual,
    fetchBericht: (id: string) => fetchBericht(id) as Promise<BerichtApi.Bericht | null>,
    fetchBerichtQuellen: (id: string) =>
      fetchBerichtQuellen(id) as Promise<BerichtApi.Quellenzeile[]>,
    berichtSpeichern: (...args: unknown[]) => berichtSpeichern(...args) as Promise<string>,
    berichtAbschliessen: (...args: unknown[]) => berichtAbschliessen(...args) as Promise<void>,
    berichtVerwerfen: (id: string) => berichtVerwerfen(id) as Promise<void>,
    druckVermerken: (id: string) => druckVermerken(id) as Promise<void>,
  };
});

const { TherapieberichtPage } = await import('./TherapieberichtPage');
const { TherapieberichtDruckPage } = await import('./TherapieberichtDruckPage');

const PATIENT = 'p1';

function dokument(rest: Partial<BerichtApi.Berichtsdokument> = {}): BerichtApi.Berichtsdokument {
  return {
    schema_version: 1,
    praxis: {
      name: 'Physio Fiktiv',
      street: 'Musterweg',
      house_number: '1',
      postal_code: '72070',
      city: 'Tübingen',
    },
    empfaenger: {
      title: 'Dr. med.',
      given_name: 'Petra',
      family_name: 'Probst',
      practice_name: 'Orthopädische Praxis Fiktiv',
      street: 'Ärztegasse',
      house_number: '3',
      postal_code: '72070',
      city: 'Tübingen',
      fax: '+49 7071 0000402',
    },
    patient: { given_name: 'Max', family_name: 'Mustermann', date_of_birth: '1970-05-01' },
    verordnung: {
      treatment_basis_kind: 'follow_up',
      issued_on: '2026-06-18',
      diagnosis: 'Synthetisch: Schulter rechts.',
      items: [{ remedy: 'Krankengymnastik', prescribed_quantity: 10 }],
      termine_durchgefuehrt: 7,
      erster_termin: '2026-06-22',
      letzter_termin: '2026-08-03',
    },
    eintraege: [],
    koerperschema: null,
    text: null,
    empfehlung: null,
    ...rest,
  };
}

function bericht(rest: Partial<BerichtApi.Bericht> = {}): BerichtApi.Bericht {
  return {
    id: 'b1',
    patient_id: PATIENT,
    treatment_basis_id: 'v1',
    status: 'entwurf',
    report_text: null,
    recommendation: null,
    note_ids: [],
    body_chart_response_id: null,
    updated_at: '2026-09-26T10:00:00.123456+00:00',
    document: dokument(),
    ...rest,
  };
}

const quellen: BerichtApi.Quellenzeile[] = [
  {
    kind: 'eintrag',
    id: 'n1',
    occurred_on: '2026-06-22',
    author_name: 'Anna Beispiel',
    content: 'Synthetischer Befund: Abduktion rechts 90 Grad.',
    in_treatment_basis: true,
    is_addendum: false,
    body_chart: null,
  },
  {
    kind: 'eintrag',
    id: 'n0',
    occurred_on: '2026-03-01',
    author_name: 'Tim Teamleitung',
    content: 'Synthetisch: frühere Verordnung.',
    in_treatment_basis: false,
    is_addendum: false,
    body_chart: null,
  },
  {
    kind: 'koerperschema',
    id: 'q1',
    occurred_on: '2026-06-20',
    author_name: 'Anna Beispiel',
    content: null,
    in_treatment_basis: null,
    is_addendum: false,
    body_chart: [{ x: 0.3, y: 0.2, bereich: 'schulter_rechts' }],
  },
];

function zeigeFormular(rollen: RoleKey[] = ['therapist']) {
  renderWithProviders(
    <Routes>
      <Route
        path="/patienten/:patientId/berichte/:berichtId"
        element={<TherapieberichtPage user={testUser(rollen)} />}
      />
      <Route path="/patienten/:patientId/berichte/:berichtId/druck" element={<p>Druckblatt</p>} />
    </Routes>,
    `/patienten/${PATIENT}/berichte/b1`,
  );
}

function zeigeDruck(rollen: RoleKey[] = ['office']) {
  renderWithProviders(
    <Routes>
      <Route
        path="/patienten/:patientId/berichte/:berichtId/druck"
        element={<TherapieberichtDruckPage user={testUser(rollen)} />}
      />
    </Routes>,
    `/patienten/${PATIENT}/berichte/b1/druck`,
  );
}

describe('Therapiebericht schreiben', () => {
  beforeEach(() => {
    fetchBericht.mockReset();
    fetchBerichtQuellen.mockReset();
    berichtSpeichern.mockReset();
    berichtAbschliessen.mockReset();
    fetchBericht.mockResolvedValue(bericht());
    fetchBerichtQuellen.mockResolvedValue(quellen);
    berichtSpeichern.mockResolvedValue('2026-09-26T10:05:00.000000+00:00');
    berichtAbschliessen.mockResolvedValue(undefined);
  });

  it('wählt nichts vor - weder Eintrag noch Körperschema (ANN-122)', async () => {
    zeigeFormular();
    const eintrag = await screen.findByRole('checkbox', { name: /22\.06\.2026 · Anna Beispiel/ });
    expect(eintrag).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Kein Körperschema' })).toBeChecked();
    expect(screen.getByText('Zu dieser Verordnung')).toBeInTheDocument();
    expect(screen.getByText('Weitere Einträge der Akte (1)')).toBeInTheDocument();
  });

  it('speichert genau das Angekreuzte mit dem erwarteten Stand', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    await user.click(await screen.findByRole('checkbox', { name: /22\.06\.2026/ }));
    await user.click(screen.getByRole('radio', { name: /Angabe vom 20\.06\.2026/ }));
    await user.type(
      screen.getByLabelText('Empfehlung der Therapeut:in zum Verordnungsende'),
      'Synthetisch: Folgeverordnung.',
    );
    await user.click(screen.getByRole('button', { name: 'Entwurf speichern' }));

    await waitFor(() => expect(berichtSpeichern).toHaveBeenCalledTimes(1));
    expect(berichtSpeichern).toHaveBeenCalledWith(
      'b1',
      {
        text: '',
        empfehlung: 'Synthetisch: Folgeverordnung.',
        eintraege: ['n1'],
        koerperschema: 'q1',
      },
      '2026-09-26T10:00:00.123456+00:00',
    );
    expect(await screen.findByText('Entwurf gespeichert.')).toBeInTheDocument();
  });

  it('sichert den Entwurf nach einer Pause von selbst (BEF-056, ANN-319)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      zeigeFormular();
      await user.type(
        await screen.findByLabelText('Empfehlung der Therapeut:in zum Verordnungsende'),
        'Synthetisch.',
      );
      await act(() => vi.advanceTimersByTimeAsync(3100));
      await waitFor(() => expect(berichtSpeichern).toHaveBeenCalledTimes(1));
      expect(berichtAbschliessen).not.toHaveBeenCalled();
      expect(await screen.findByText(/Als Entwurf gesichert um/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('schließt mit dem Stand im Formular ab und führt auf das Druckblatt', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    await user.type(await screen.findByLabelText('Bericht der Therapeut:in'), 'Synthetisch.');
    await user.click(screen.getByRole('button', { name: 'Bericht abschließen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, Bericht abschließen' }));

    await waitFor(() =>
      expect(berichtAbschliessen).toHaveBeenCalledWith('b1', '2026-09-26T10:05:00.000000+00:00'),
    );
    expect(berichtSpeichern).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Druckblatt')).toBeInTheDocument();
  });

  it('lässt den eigenen Text stehen, wenn jemand anderes zwischenzeitlich gespeichert hat', async () => {
    const { BerichtVeraendertError } = await vi.importActual<typeof BerichtApi>('./api');
    berichtSpeichern.mockRejectedValue(new BerichtVeraendertError());
    const user = userEvent.setup();
    zeigeFormular();
    const feld = await screen.findByLabelText('Bericht der Therapeut:in');
    await user.type(feld, 'Mein Text');
    await user.click(screen.getByRole('button', { name: 'Entwurf speichern' }));

    expect(
      await screen.findByText(/zwischenzeitlich von einer anderen Person/),
    ).toBeInTheDocument();
    expect(feld).toHaveValue('Mein Text');
  });

  it('führt einen abgeschlossenen Bericht auf das Druckblatt statt ins Formular', async () => {
    fetchBericht.mockResolvedValue(bericht({ status: 'abgeschlossen' }));
    zeigeFormular();
    expect(await screen.findByText('Druckblatt')).toBeInTheDocument();
    expect(fetchBerichtQuellen).not.toHaveBeenCalled();
  });

  it('bestätigt Abschließen und Verwerfen mit „Ja, …“ (DOK-08, WRT-21)', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    await user.click(await screen.findByRole('button', { name: 'Bericht abschließen' }));
    expect(screen.getByRole('button', { name: 'Ja, Bericht abschließen' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    await user.click(screen.getByRole('button', { name: 'Entwurf verwerfen' }));
    expect(screen.getByRole('button', { name: 'Ja, Entwurf verwerfen' })).toBeInTheDocument();
    expect(berichtVerwerfen).not.toHaveBeenCalled();
  });
});

/**
 * Schutz vor Textverlust (UXR-008; DOK-03, ZST-02, NAV-01).
 *
 * Bis dahin verwarf „Druckansicht“ direkt neben „Entwurf speichern“ den
 * geschriebenen Bericht ohne Rückfrage, und „Weiter bearbeiten“ zeigte den
 * alten Stand. Jetzt fragt derselbe Schutz wie in der Dokumentation.
 */
describe('Therapiebericht: Schutz ungespeicherter Änderungen', () => {
  beforeEach(() => {
    fetchBericht.mockReset();
    fetchBerichtQuellen.mockReset();
    berichtSpeichern.mockReset();
    berichtAbschliessen.mockReset();
    fetchBericht.mockResolvedValue(bericht());
    fetchBerichtQuellen.mockResolvedValue(quellen);
    berichtSpeichern.mockResolvedValue('2026-09-26T10:05:00.000000+00:00');
    berichtAbschliessen.mockResolvedValue(undefined);
  });

  it('fragt vor der Druckansicht nach und behält den Text beim Bleiben', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    const feld = await screen.findByLabelText('Bericht der Therapeut:in');
    await user.type(feld, 'Mein Bericht');
    await user.click(screen.getByRole('link', { name: 'Druckansicht' }));

    const kasten = await screen.findByRole('group', { name: 'Ungespeicherter Bericht' });
    expect(kasten).toHaveTextContent(
      'Die Änderungen am Bericht sind noch nicht gespeichert. Beim Weitergehen gehen sie verloren.',
    );
    expect(screen.queryByText('Druckblatt')).not.toBeInTheDocument();

    await user.click(within(kasten).getByRole('button', { name: 'Hier bleiben' }));
    expect(feld).toHaveValue('Mein Bericht');
    expect(berichtSpeichern).not.toHaveBeenCalled();
  });

  it('speichert aus der Rückfrage nur den Entwurf - abgeschlossen wird nichts (ANN-046)', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    await user.type(await screen.findByLabelText('Bericht der Therapeut:in'), 'Mein Bericht');
    await user.click(screen.getByRole('link', { name: 'Druckansicht' }));
    await user.click(await screen.findByRole('button', { name: 'Speichern und weitergehen' }));

    await waitFor(() =>
      expect(berichtSpeichern).toHaveBeenCalledWith(
        'b1',
        { text: 'Mein Bericht', empfehlung: '', eintraege: [], koerperschema: null },
        '2026-09-26T10:00:00.123456+00:00',
      ),
    );
    expect(berichtAbschliessen).not.toHaveBeenCalled();
  });

  it('lässt ohne Änderung ohne Rückfrage zur Druckansicht', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    await user.click(await screen.findByRole('link', { name: 'Druckansicht' }));

    expect(screen.queryByRole('group', { name: 'Ungespeicherter Bericht' })).toBeNull();
  });

  it('fragt auch vor einer geänderten Auswahl ohne Text', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    await user.click(await screen.findByRole('checkbox', { name: /22\.06\.2026/ }));
    await user.click(screen.getByRole('link', { name: /Zurück zur Verordnung/ }));

    expect(
      await screen.findByRole('group', { name: 'Ungespeicherter Bericht' }),
    ).toBeInTheDocument();
  });

  it('warnt den Browser vor dem Neuladen, solange etwas ungespeichert ist', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    await user.type(await screen.findByLabelText('Bericht der Therapeut:in'), 'Mein Bericht');

    const ereignis = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ereignis);
    expect(ereignis.defaultPrevented).toBe(true);
  });

  it('sagt in der Vorschau, dass die neuen Änderungen darin noch fehlen', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    await user.type(await screen.findByLabelText('Bericht der Therapeut:in'), 'Mein Bericht');

    expect(
      screen.getByText(
        'Ihre letzten Änderungen sind noch nicht gespeichert und fehlen in der Vorschau.',
      ),
    ).toBeInTheDocument();
  });
});

/**
 * Das Formular bleibt stehen, wenn sich der Bericht beim Nachladen geändert
 * hat (DOK-B01, ZST-03) - vorher baute es sich samt Text ab.
 */
describe('Therapiebericht: Nachladen', () => {
  beforeEach(() => {
    fetchBericht.mockReset();
    fetchBerichtQuellen.mockReset();
    fetchBericht.mockResolvedValue(bericht());
    fetchBerichtQuellen.mockResolvedValue(quellen);
  });

  afterEach(() => {
    focusManager.setFocused(undefined);
  });

  it('behält Formular und Text, wenn jemand den Bericht inzwischen abgeschlossen hat', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    const feld = await screen.findByLabelText('Bericht der Therapeut:in');
    await user.type(feld, 'Mein Bericht');

    fetchBericht.mockResolvedValue(bericht({ status: 'abgeschlossen' }));
    act(() => focusManager.setFocused(true));

    expect(
      await screen.findByText(
        'Der Bericht wurde inzwischen abgeschlossen – Ihre Änderungen stehen noch im Formular und sind nicht gespeichert.',
      ),
    ).toBeInTheDocument();
    expect(feld).toHaveValue('Mein Bericht');
    expect(screen.queryByText('Druckblatt')).not.toBeInTheDocument();
  });

  it('behält das Formular, wenn das Nachladen scheitert, und bietet einen neuen Versuch an', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    const feld = await screen.findByLabelText('Bericht der Therapeut:in');
    await user.type(feld, 'Mein Bericht');

    fetchBericht.mockRejectedValue(new Error('Funkloch'));
    act(() => focusManager.setFocused(true));

    expect(
      await screen.findByText(/Der Stand konnte nicht aktualisiert werden\./),
    ).toBeInTheDocument();
    expect(feld).toHaveValue('Mein Bericht');
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});

/** Zustände ohne Formular tragen den Rückweg und sagen, was zu tun ist (DOK-12, WRT-01). */
describe('Therapiebericht: Zustände', () => {
  beforeEach(() => {
    fetchBericht.mockReset();
    fetchBerichtQuellen.mockReset();
    fetchBerichtQuellen.mockResolvedValue(quellen);
  });

  it('zeigt bei einem Ladefehler den Rückweg und „Erneut versuchen“, ohne Ratefrage', async () => {
    fetchBericht.mockRejectedValue(new Error('kaputt'));
    const user = userEvent.setup();
    zeigeFormular();

    expect(await screen.findByText('Der Bericht konnte nicht geladen werden.')).toBeInTheDocument();
    expect(
      screen.getByText('Bitte die Verbindung prüfen und erneut versuchen.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/angemeldet/)).toBeNull();
    expect(screen.getByRole('link', { name: /Zurück zu den Verordnungen/ })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/verordnungen`,
    );

    fetchBericht.mockResolvedValue(bericht());
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByLabelText('Bericht der Therapeut:in')).toBeInTheDocument();
  });

  it('meldet einen verworfenen Bericht als nicht gefunden', async () => {
    fetchBericht.mockResolvedValue(null);
    zeigeFormular();

    expect(await screen.findByText('Bericht nicht gefunden')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zurück zu den Verordnungen/ })).toBeInTheDocument();
  });
});

/** Aufklapper und Obergrenze der Einträge (DOK-21). */
describe('Therapiebericht: Auswahl der Einträge', () => {
  beforeEach(() => {
    fetchBericht.mockReset();
    fetchBerichtQuellen.mockReset();
    fetchBerichtQuellen.mockResolvedValue(quellen);
  });

  it('klappt „Weitere Einträge der Akte“ beim Abwählen nicht unter dem Finger zu', async () => {
    fetchBericht.mockResolvedValue(bericht({ note_ids: ['n0'] }));
    const user = userEvent.setup();
    zeigeFormular();

    const eintrag = await screen.findByRole('checkbox', { name: /01\.03\.2026 · Tim Teamleitung/ });
    const aufklapper = eintrag.closest('details')!;
    expect(aufklapper).toHaveAttribute('open');

    await user.click(eintrag);
    expect(eintrag).not.toBeChecked();
    expect(aufklapper).toHaveAttribute('open');
  });

  it('sperrt Speichern und Abschließen bei mehr als 50 Einträgen und sagt, warum', async () => {
    const viele = Array.from({ length: 51 }, (_, i) => `n${i + 10}`);
    fetchBericht.mockResolvedValue(bericht({ note_ids: viele }));
    zeigeFormular();

    const abschliessen = await screen.findByRole('button', { name: 'Bericht abschließen' });
    expect(abschliessen).toBeDisabled();
    expect(abschliessen).toHaveAccessibleDescription(
      'Höchstens 50 Einträge – ein Bericht ist keine Kopie der Akte.',
    );
    expect(screen.getByRole('button', { name: 'Entwurf speichern' })).toBeDisabled();
  });

  it('zählt beim Auswählen mit und sperrt bei 50 jeden weiteren Haken (BEF-104)', async () => {
    const fuenfzig = Array.from({ length: 50 }, (_, i) => `n${i + 10}`);
    fetchBericht.mockResolvedValue(bericht({ note_ids: fuenfzig }));
    zeigeFormular();

    expect(await screen.findByText(/50 von 50 Einträgen gewählt/)).toBeInTheDocument();
    // Ein weiterer, nicht gewählter Eintrag lässt sich nicht ankreuzen.
    expect(screen.getByRole('checkbox', { name: /22\.06\.2026 · Anna Beispiel/ })).toBeDisabled();
  });
});

describe('Therapiebericht als Blatt', () => {
  beforeEach(() => {
    fetchBericht.mockReset();
    druckVermerken.mockReset();
    druckVermerken.mockResolvedValue(undefined);
  });

  it('übernimmt wörtlich, mit Quelle und Datum, und kennzeichnet keinen Entwurf', async () => {
    fetchBericht.mockResolvedValue(
      bericht({
        status: 'abgeschlossen',
        document: dokument({
          eintraege: [
            {
              note_id: 'n1',
              datum: '2026-06-22',
              verfasser: 'Anna Beispiel',
              inhalt: 'Synthetischer Befund: Abduktion rechts 90 Grad.',
              ergaenzung: false,
            },
          ],
          empfehlung: {
            inhalt: 'Synthetisch: Folgeverordnung.',
            verfasser: 'Anna Beispiel',
            datum: '2026-09-21',
          },
          abgeschlossen: { datum: '2026-09-21', von: 'Anna Beispiel' },
        }),
      }),
    );
    zeigeDruck();

    expect(await screen.findByRole('heading', { name: 'Therapiebericht' })).toBeInTheDocument();
    expect(screen.getByText('Synthetischer Befund: Abduktion rechts 90 Grad.')).toBeInTheDocument();
    expect(screen.getByText('Synthetisch: Folgeverordnung.')).toBeInTheDocument();
    expect(screen.getByText('Anna Beispiel, 21.09.2026')).toBeInTheDocument();
    expect(screen.getByText('7 Termine, 22.06.2026 bis 03.08.2026')).toBeInTheDocument();
    expect(screen.getByText('Fax +49 7071 0000402')).toBeInTheDocument();
    expect(screen.queryByText(/Entwurf – noch nicht abgeschlossen/)).not.toBeInTheDocument();
    // Office druckt, bearbeitet aber nicht.
    expect(screen.queryByRole('link', { name: 'Weiter bearbeiten' })).not.toBeInTheDocument();
  });

  it('druckt einen Entwurf nur mit Vermerk', async () => {
    fetchBericht.mockResolvedValue(bericht());
    zeigeDruck(['therapist']);
    expect(await screen.findByText(/Entwurf – noch nicht abgeschlossen/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Weiter bearbeiten' })).toBeInTheDocument();
  });

  it('lässt Abschnitte auf Papier umbrechen, nicht als Ganzes springen (DOK-22)', async () => {
    fetchBericht.mockResolvedValue(bericht({ status: 'abgeschlossen' }));
    zeigeDruck();
    const abschnitt = (await screen.findByRole('heading', { name: 'Verordnung' })).closest(
      'section',
    )!;
    expect(abschnitt).toHaveClass('break-inside-auto!');
  });

  it('zeigt bei einem Ladefehler den Rückweg und „Erneut versuchen“ (DOK-12, WRT-01)', async () => {
    fetchBericht.mockRejectedValue(new Error('kaputt'));
    zeigeDruck();

    expect(await screen.findByText('Der Bericht konnte nicht geladen werden.')).toBeInTheDocument();
    expect(screen.queryByText(/angemeldet/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zurück zu den Verordnungen/ })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/verordnungen`,
    );
  });

  it('meldet einen verworfenen Bericht als nicht gefunden, mit Rückweg', async () => {
    fetchBericht.mockResolvedValue(null);
    zeigeDruck();

    expect(await screen.findByText('Bericht nicht gefunden')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zurück zu den Verordnungen/ })).toBeInTheDocument();
  });

  it('vermerkt den Druck, bevor der Druckdialog aufgeht', async () => {
    const reihenfolge: string[] = [];
    druckVermerken.mockImplementation(() => {
      reihenfolge.push('vermerkt');
      return Promise.resolve();
    });
    const drucken = vi.spyOn(window, 'print').mockImplementation(() => {
      reihenfolge.push('gedruckt');
    });
    fetchBericht.mockResolvedValue(bericht({ status: 'abgeschlossen' }));
    const user = userEvent.setup();
    zeigeDruck();
    await user.click(await screen.findByRole('button', { name: 'Bericht drucken' }));

    await waitFor(() => expect(reihenfolge).toEqual(['vermerkt', 'gedruckt']));
    drucken.mockRestore();
  });

  it('öffnet keinen Druckdialog, wenn der Vermerk scheitert', async () => {
    druckVermerken.mockRejectedValue(new Error('Für diesen Schritt fehlt die Berechtigung.'));
    const drucken = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    fetchBericht.mockResolvedValue(bericht({ status: 'abgeschlossen' }));
    const user = userEvent.setup();
    zeigeDruck();
    await user.click(await screen.findByRole('button', { name: 'Bericht drucken' }));

    expect(
      await screen.findByText('Für diesen Schritt fehlt die Berechtigung.'),
    ).toBeInTheDocument();
    expect(drucken).not.toHaveBeenCalled();
    drucken.mockRestore();
  });
});
