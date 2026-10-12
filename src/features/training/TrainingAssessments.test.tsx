import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as Api from './assessments-api';
import type { Assessmentsicht } from './assessments-api';

/**
 * Assessments auf der Trainingsseite (OUT-002, IDEA-OUT-007, ANN-365):
 * Messungen über die Zeit, Bedingungen, Wiederholung – ohne Einordnung.
 */

const fetchAssessments = vi.fn();
const assessmentFesthalten = vi.fn();
const assessmentEntfernen = vi.fn();

vi.mock('./assessments-api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  fetchAssessments: (...a: unknown[]) => fetchAssessments(...a) as Promise<Assessmentsicht | null>,
  assessmentFesthalten: (...a: unknown[]) => assessmentFesthalten(...a) as Promise<void>,
  assessmentEntfernen: (...a: unknown[]) => assessmentEntfernen(...a) as Promise<void>,
}));

const { TrainingAssessments } = await import('./TrainingAssessments');

const TINA = 'eeeeeeee-eeee-4eee-8eee-000000000001';

function sicht(teil: Partial<Assessmentsicht> = {}): Assessmentsicht {
  return {
    today: '2026-10-12',
    can_write: true,
    relationship_open: true,
    health_consent: true,
    assessments: [
      {
        id: 'a2',
        title: 'Sprungtests Knie',
        performed_on: '2026-10-12',
        conditions: 'Halle, barfuß',
        next_due_on: '2026-11-23',
        created_by_name: 'Tom Trainingsbetreuung',
        results: [
          { label: 'Einbeinsprung weit', unit: 'cm', value: null, left: 120, right: 140 },
          { label: 'Kniebeugen in 30 s', unit: null, value: 18, left: null, right: null },
        ],
      },
      {
        id: 'a1',
        title: 'Sprungtests Knie',
        performed_on: '2026-09-01',
        conditions: 'Halle, Schuhe',
        next_due_on: '2026-10-12',
        created_by_name: 'Tom Trainingsbetreuung',
        results: [{ label: 'Einbeinsprung weit', unit: 'cm', value: null, left: 100, right: 140 }],
      },
    ],
    ...teil,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchAssessments.mockResolvedValue(sicht());
  assessmentFesthalten.mockResolvedValue(undefined);
  assessmentEntfernen.mockResolvedValue(undefined);
});

describe('Assessments (OUT-002)', () => {
  it('zeigt Messungen je Tag, Seitenvergleich, Bedingungen und Wiederholung – ohne Wertung', async () => {
    const { container } = renderWithProviders(<TrainingAssessments verhaeltnisId={TINA} />);
    const tabelle = await screen.findByRole('table', { name: /Messungen Sprungtests Knie/ });
    const kopf = within(tabelle).getAllByRole('columnheader');
    expect(kopf.map((k) => k.textContent)).toEqual(['Messung', '12.10.2026', '01.09.2026']);
    const sprung = within(tabelle).getByRole('row', { name: /Einbeinsprung weit/ });
    expect(
      within(sprung)
        .getAllByRole('cell')
        .map((z) => z.textContent),
    ).toEqual([
      'L 120 · R 140 cmkleinere Seite 86 % der größeren',
      'L 100 · R 140 cmkleinere Seite 71 % der größeren',
    ]);
    const beugen = within(tabelle).getByRole('row', { name: /Kniebeugen/ });
    expect(within(beugen).getAllByRole('cell')[1]).toHaveTextContent('–');
    expect(
      screen.getByText(/Bedingungen: Halle, barfuß \(andere als am 01\.09\.2026\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/geplant am 23\.11\.2026/)).toBeInTheDocument();
    // Weder Einordnung noch Farbe (ADR-006 Punkte 11 und 13).
    expect(
      screen.queryByText(/ausreichend|Freigabe|Defizit|besser|schlechter|Verbesser/i),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[class*="danger"], [class*="warn"], [class*="success"]'),
    ).toBeNull();
    await pruefeBarrierefreiheit(container);
  });

  it('hält eine Wiederholung fest: Test, Bedingungen und Messungen vom vorigen Mal, Werte nicht', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<TrainingAssessments verhaeltnisId={TINA} />);
    await nutzer.click(
      await screen.findByRole('button', { name: 'Wiederholen wie am 12.10.2026' }),
    );
    const formular = screen.getByRole('form', { name: 'Assessment festhalten' });
    expect(within(formular).getByLabelText(/^Test/)).toHaveValue('Sprungtests Knie');
    expect(within(formular).getByLabelText(/Messbedingungen/)).toHaveValue('Halle, barfuß');
    const erste = within(formular).getByRole('group', { name: 'Messung 1' });
    expect(within(erste).getByLabelText(/^Messung 1/)).toHaveValue('Einbeinsprung weit');
    expect(within(erste).getByLabelText('Links')).toHaveValue('');
    await nutzer.type(within(erste).getByLabelText('Links'), '125,5');
    await nutzer.type(within(erste).getByLabelText('Rechts'), '141');
    // Die zweite Messung ohne Wert: Die Anwendung sagt, was fehlt.
    await nutzer.click(within(formular).getByRole('button', { name: 'Festhalten' }));
    expect(
      await within(formular).findByText('Messung 2: Bitte eine Zahl eintragen.'),
    ).toBeInTheDocument();
    const zweite = within(formular).getByRole('group', { name: 'Messung 2' });
    await nutzer.type(within(zweite).getByLabelText(/^Wert/), '19');
    await nutzer.click(within(formular).getByRole('button', { name: 'Festhalten' }));
    await waitFor(() =>
      expect(assessmentFesthalten).toHaveBeenCalledWith({
        verhaeltnisId: TINA,
        titel: 'Sprungtests Knie',
        tag: '2026-10-12',
        bedingungen: 'Halle, barfuß',
        wiederholung: null,
        messungen: [
          { label: 'Einbeinsprung weit', unit: 'cm', left: 125.5, right: 141 },
          { label: 'Kniebeugen in 30 s', unit: null, value: 19 },
        ],
      }),
    );
  });

  it('ohne Einwilligung kein Festhalten, sondern der Grund; das Büro liest nur', async () => {
    fetchAssessments.mockResolvedValue(sicht({ health_consent: false }));
    renderWithProviders(<TrainingAssessments verhaeltnisId={TINA} />);
    expect(await screen.findByText(/erst mit der Einwilligung/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /festhalten|Wiederholen/ }),
    ).not.toBeInTheDocument();
  });

  it('ohne Schreibrecht weder Festhalten noch Entfernen', async () => {
    fetchAssessments.mockResolvedValue(sicht({ can_write: false }));
    renderWithProviders(<TrainingAssessments verhaeltnisId={TINA} />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Einwilligung/)).not.toBeInTheDocument();
  });

  it('entfernt erst nach Rückfrage', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<TrainingAssessments verhaeltnisId={TINA} />);
    const knoepfe = await screen.findAllByRole('button', { name: 'Entfernen' });
    await nutzer.click(knoepfe[1]!);
    expect(
      screen.getByRole('group', { name: 'Sprungtests Knie vom 01.09.2026 entfernen' }),
    ).toBeInTheDocument();
    expect(assessmentEntfernen).not.toHaveBeenCalled();
    await nutzer.click(screen.getByRole('button', { name: 'Ja, entfernen' }));
    await waitFor(() => expect(assessmentEntfernen).toHaveBeenCalledWith('a1'));
  });

  it('ohne Leserecht kein Abschnitt', async () => {
    fetchAssessments.mockResolvedValue(null);
    const { container } = renderWithProviders(<TrainingAssessments verhaeltnisId={TINA} />);
    await waitFor(() => expect(fetchAssessments).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
