import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router-dom';
import type * as Verlauf from './verlauf';
import type * as TermineApi from '@/features/appointments/api';
import type { Erhebung } from './api';
import { renderWithProviders } from '@/test-utils';
import { instrumentFuer } from './instrumente';
import { Messreihenbild } from './Messreihenbild';
import { messreihen, type Verlaufsereignis } from './verlauf';

/**
 * Der Messverlauf im Befund (FRB-002e; UXR-009: BEF-01, -13, -14, -16, -20,
 * RSP-09).
 */

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const fetchEreignisse = vi.fn();
const ereignisEntfernen = vi.fn();
const ereignisSetzen = vi.fn();
const fetchPatientAppointments = vi.fn();
const fetchEntfernteEreignisse = vi.fn();

vi.mock('./verlauf', async (importOriginal) => {
  const actual = await importOriginal<typeof Verlauf>();
  return {
    ...actual,
    fetchEreignisse: (id: string) => fetchEreignisse(id) as Promise<Verlauf.Verlaufsereignis[]>,
    ereignisEntfernen: (id: string) => ereignisEntfernen(id) as Promise<void>,
    ereignisSetzen: (eingabe: unknown) => ereignisSetzen(eingabe) as Promise<void>,
    fetchEntfernteEreignisse: (id: string) =>
      fetchEntfernteEreignisse(id) as Promise<Verlauf.EntferntesEreignis[]>,
  };
});
vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof TermineApi>();
  return {
    ...actual,
    fetchPatientAppointments: (id: string) => fetchPatientAppointments(id) as Promise<unknown[]>,
  };
});

const { VerlaufAbschnitt } = await import('./VerlaufAbschnitt');

const anamnese = instrumentFuer('anamnese_v8')!;

function erhebung(id: string, datum: string, wert: number): Erhebung {
  return {
    id,
    instrument_id: 'anamnese_v8',
    definition_version: '1.0.0',
    status: 'abgeschlossen',
    recorded_on: datum,
    answers: { schmerzstaerke: { wert } },
    supersedes_response_id: null,
    superseded_by_response_id: null,
    change_reason: null,
    created_at: '',
    updated_at: '',
    completed_at: `${datum}T08:00:00Z`,
    author_name: 'Anna Beispiel',
    completed_by_name: 'Anna Beispiel',
  };
}

function ereignis(rest: Partial<Verlaufsereignis> = {}): Verlaufsereignis {
  return {
    id: 'v1',
    occurred_on: '2026-09-05',
    kind: 'operation',
    note: null,
    created_at: '2026-09-05T08:00:00Z',
    author_name: 'Anna Beispiel',
    ...rest,
  };
}

const ERHEBUNGEN = [erhebung('a', '2026-09-01', 6), erhebung('b', '2026-09-20', 4)];

function abschnitt(darfSetzen = true) {
  return renderWithProviders(
    <>
      <Link to="/woanders">Zum Kalender</Link>
      <VerlaufAbschnitt
        patientId={PATIENT_ID}
        erhebungen={ERHEBUNGEN}
        instrumente={[anamnese]}
        darfSetzen={darfSetzen}
        zeitzone="Europe/Berlin"
      />
    </>,
    `/patienten/${PATIENT_ID}/befund`,
  );
}

// Bilder, Liste, Formular und Verlustschutz: unter voller Last der Testsuite
// reichen 5 s nicht immer (wie BausteinFeld.test.tsx).
describe('Messverlauf', { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchEreignisse.mockResolvedValue([]);
    fetchPatientAppointments.mockResolvedValue([]);
    ereignisEntfernen.mockResolvedValue(undefined);
    ereignisSetzen.mockResolvedValue(undefined);
  });

  it('heißt „Messverlauf", nicht wie der Behandlungsverlauf der Akte (BEF-16)', async () => {
    abschnitt();
    expect(await screen.findByRole('heading', { level: 2, name: 'Messverlauf' })).toBeVisible();
    expect(await screen.findByRole('heading', { level: 3, name: 'Ereignisse' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Ereignis vermerken' })).toBeVisible();
  });

  it('sagt beim Laden nicht „Noch kein Ereignis vermerkt." (BEF-13)', () => {
    fetchEreignisse.mockReturnValue(new Promise(() => undefined));
    abschnitt();
    expect(screen.getByRole('status')).toHaveTextContent('Ereignisse werden geladen …');
    expect(screen.queryByText('Noch kein Ereignis vermerkt.')).toBeNull();
  });

  it('meldet fehlende Termine, statt die Striche still wegzulassen (BEF-13)', async () => {
    fetchPatientAppointments.mockRejectedValue(new Error('synthetisch'));
    abschnitt();
    expect(
      await screen.findByText(
        'Die Termine konnten nicht geladen werden; die Striche an der Zeitachse fehlen.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Noch kein Ereignis vermerkt.')).toBeInTheDocument();
  });

  it('bietet nach einem Ladefehler der Ereignisse einen neuen Versuch an', async () => {
    const user = userEvent.setup();
    fetchEreignisse.mockRejectedValueOnce(new Error('synthetisch'));
    abschnitt();
    expect(
      await screen.findByText('Die Ereignisse im Verlauf konnten nicht geladen werden.'),
    ).toBeInTheDocument();

    fetchEreignisse.mockResolvedValue([ereignis()]);
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    // Die Liste steht wieder da - mit dem Ereignis und seiner Aktion.
    expect(await screen.findByRole('button', { name: 'Entfernen' })).toBeInTheDocument();
    expect(screen.getByText('05.09.2026')).toBeInTheDocument();
  });

  it('entfernt ein Ereignis erst nach einer Rückfrage mit Art und Tag (BEF-01)', async () => {
    const user = userEvent.setup();
    let fertig: () => void = () => undefined;
    ereignisEntfernen.mockReturnValue(new Promise<void>((erledigt) => (fertig = erledigt)));
    fetchEreignisse.mockResolvedValue([ereignis()]);
    abschnitt();

    await user.click(await screen.findByRole('button', { name: 'Entfernen' }));
    const kasten = screen.getByRole('group', { name: 'Ereignis 1 entfernen' });
    expect(kasten).toHaveTextContent('„Operation“ vom 05.09.2026 wird aus dem Verlauf entfernt.');
    expect(ereignisEntfernen).not.toHaveBeenCalled();

    await user.click(within(kasten).getByRole('button', { name: 'Ja, Ereignis entfernen' }));
    expect(ereignisEntfernen).toHaveBeenCalledWith('v1');
    // Solange es läuft, nimmt der Kasten keinen zweiten Tipp an (ZST-20).
    expect(within(kasten).getByRole('button', { name: 'Wird entfernt …' })).toBeDisabled();
    fertig();
    await waitFor(() => expect(ereignisEntfernen).toHaveBeenCalledTimes(1));
  });

  it('zeigt einen gescheiterten Versuch im offenen Kasten', async () => {
    const user = userEvent.setup();
    ereignisEntfernen.mockRejectedValue(new Error('Das Ereignis wurde nicht gefunden.'));
    fetchEreignisse.mockResolvedValue([ereignis()]);
    abschnitt();

    await user.click(await screen.findByRole('button', { name: 'Entfernen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, Ereignis entfernen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Das Ereignis wurde nicht gefunden.',
    );
  });

  it('wählt keine Art vor und sagt, was fehlt, statt stumm zu sperren (BEF-14)', async () => {
    const user = userEvent.setup();
    abschnitt();

    const art = await screen.findByLabelText('Art');
    expect(art).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Vermerken' }));

    expect(screen.getByText('Bitte die Art wählen.')).toBeInTheDocument();
    expect(screen.getByText('Bitte den Tag angeben.')).toBeInTheDocument();
    expect(art).toHaveAttribute('aria-invalid', 'true');
    expect(ereignisSetzen).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: '2026-09-15' } });
    await user.selectOptions(art, 'erkrankung');
    await user.type(screen.getByLabelText('Notiz (optional)'), 'zwei Wochen Grippe');
    await user.click(screen.getByRole('button', { name: 'Vermerken' }));
    await waitFor(() =>
      expect(ereignisSetzen).toHaveBeenCalledWith({
        patientId: PATIENT_ID,
        datum: '2026-09-15',
        art: 'erkrankung',
        notiz: 'zwei Wochen Grippe',
      }),
    );
  });

  it('fragt, bevor ein angefangenes Ereignis beim Weitergehen verloren geht', async () => {
    const user = userEvent.setup();
    abschnitt();

    await user.type(await screen.findByLabelText('Notiz (optional)'), 'Knie-TEP rechts');
    await user.click(screen.getByRole('link', { name: 'Zum Kalender' }));

    const kasten = await screen.findByRole('group', { name: 'Ungespeichertes Ereignis' });
    expect(within(kasten).getByRole('button', { name: 'Verwerfen und weitergehen' })).toBeVisible();
    expect(within(kasten).getByRole('button', { name: 'Hier bleiben' })).toBeVisible();
    expect(within(kasten).queryByRole('button', { name: /Speichern/ })).toBeNull();
  });

  it('lädt entfernte Ereignisse erst beim Aufklappen und nennt, wer wann entfernt hat (BEF-102)', async () => {
    fetchEntfernteEreignisse.mockResolvedValue([
      {
        ...ereignis({ id: 'x', note: 'Knie-TEP rechts' }),
        removed_at: '2026-09-10T09:00:00Z',
        removed_by_name: 'Jannes Beispiel',
      },
    ]);
    abschnitt(false);
    const kopf = await screen.findByText('Entfernte Ereignisse');
    // Jeder gelesene Eintrag wird protokolliert: zugeklappt kein Abruf.
    expect(fetchEntfernteEreignisse).not.toHaveBeenCalled();
    fireEvent.click(kopf);
    expect(await screen.findByText('Operation · Knie-TEP rechts')).toBeInTheDocument();
    expect(fetchEntfernteEreignisse).toHaveBeenCalledWith(PATIENT_ID);
    expect(
      screen.getByText(/Vermerkt von Anna Beispiel, entfernt am 10\.09\.2026 von Jannes Beispiel/),
    ).toBeInTheDocument();
  });

  it('bietet office weder Entfernen noch Vermerken an', async () => {
    fetchEreignisse.mockResolvedValue([ereignis()]);
    abschnitt(false);
    expect(await screen.findByText('05.09.2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entfernen' })).toBeNull();
    expect(screen.queryByText('Ereignis vermerken')).toBeNull();
  });
});

describe('Messreihenbild (BEF-20, RSP-09)', () => {
  const [reihe] = messreihen(ERHEBUNGEN, [anamnese]);

  it('beschriftet Ereignisse desselben Tages an einer Linie und nennt sie unter dem Bild', () => {
    const { container } = render(
      <Messreihenbild
        reihe={reihe!}
        ereignisse={[
          ereignis({ id: 'v1', kind: 'operation' }),
          ereignis({ id: 'v2', kind: 'medikation' }),
          ereignis({ id: 'v3', kind: 'urlaub', occurred_on: '2026-09-12' }),
        ]}
        termine={[]}
      />,
    );
    const nummern = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(nummern).toContain('1, 2');
    expect(nummern).toContain('3');
    expect(container.querySelectorAll('line[stroke-dasharray]')).toHaveLength(2);
    expect(
      screen.getByText('Ereignisse: 1 Operation · 2 Medikation geändert · 3 Urlaub, Pause'),
    ).toBeInTheDocument();
    // Weiterhin keine Verbindung der Punkte (ADR-006 Punkt 11).
    expect(container.querySelectorAll('polyline, path')).toHaveLength(0);
  });

  it('lässt eine Wertebeschriftung weg, die eine andere überdecken würde', () => {
    const [nah] = messreihen(
      [
        erhebung('a', '2026-09-01', 6),
        erhebung('b', '2026-09-02', 6),
        erhebung('c', '2026-09-30', 2),
      ],
      [anamnese],
    );
    const { container } = render(<Messreihenbild reihe={nah!} ereignisse={[]} termine={[]} />);
    const werte = Array.from(container.querySelectorAll('svg text'))
      .map((t) => t.textContent)
      .filter((text) => text === '6' || text === '2');
    expect(werte).toEqual(['6', '2']);
    // Der Text darunter nennt trotzdem jeden Wert.
    expect(screen.getByText('Werte: 01.09.2026: 6 · 02.09.2026: 6 · 30.09.2026: 2')).toBeVisible();
  });

  it('schreibt im Bild so groß, dass ab 300 px Breite mindestens 12 px entstehen', () => {
    const { container } = render(<Messreihenbild reihe={reihe!} ereignisse={[]} termine={[]} />);
    const breite = Number(container.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2]);
    for (const text of container.querySelectorAll('svg text')) {
      expect((Number(text.getAttribute('font-size')) * 300) / breite).toBeGreaterThanOrEqual(12);
    }
  });
});
