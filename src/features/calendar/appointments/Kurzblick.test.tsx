import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as KurzblickApi from './kurzblick-api';
import { renderWithProviders } from '@/test-utils';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';

const blick: KurzblickApi.Kurzblick = {
  appointment_id: TERMIN_ID,
  patient_id: '66666666-6666-4666-8666-000000000001',
  home_visit_access_note: 'Synthetisch: 2. OG, Klingel „Mustermann“.',
  special_note: 'Synthetisch: Hund im Flur.',
  take_along_items: ['Theraband', 'Kinesiotape'],
  primary_therapist_name: 'Anna Beispiel',
  treatment_basis_id: '88888888-8888-4888-8888-000000000002',
  treatment_basis_kind: 'follow_up',
  treatment_basis_issued_on: '2026-06-18',
  basis_appointment_count: 10,
  basis_used: 7,
  basis_planned: 9,
  basis_items: [{ remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 7 }],
  last_note_id: '99999999-9999-4999-8999-000000000001',
  last_note_appointment_start: '2026-09-21T08:00:00+00:00',
  last_note_status: 'draft',
  last_note_content: 'Synthetisch: Übungen im Stand angeleitet.',
  last_note_visit_without_treatment: false,
  last_note_author_name: 'Anna Beispiel',
  organization_time_zone: 'Europe/Berlin',
};

const fetchKurzblick = vi.fn();
vi.mock('./kurzblick-api', async (importOriginal) => {
  const actual = await importOriginal<typeof KurzblickApi>();
  return {
    ...actual,
    fetchKurzblick: (id: string) => fetchKurzblick(id) as Promise<KurzblickApi.Kurzblick | null>,
  };
});

const { Kurzblick } = await import('./Kurzblick');

describe('Vertretungs-Kurzblick (PRX-006)', () => {
  beforeEach(() => {
    fetchKurzblick.mockReset();
    fetchKurzblick.mockResolvedValue(blick);
  });

  it('liest nichts, solange er zugeklappt ist', () => {
    renderWithProviders(<Kurzblick appointmentId={TERMIN_ID} />);
    expect(screen.getByText('Vor der Tür')).toBeInTheDocument();
    // Dass gelesen protokolliert wird, steht schon vor dem Öffnen da.
    expect(screen.getByText('Lesen wird protokolliert')).toBeVisible();
    expect(fetchKurzblick).not.toHaveBeenCalled();
    expect(screen.queryByText(/Hund im Flur/)).toBeNull();
  });

  it('zeigt aufgeklappt Zugang, Grundlage und den letzten Eintrag im Wortlaut', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Kurzblick appointmentId={TERMIN_ID} />);

    await user.click(screen.getByText('Vor der Tür'));

    expect(await screen.findByText('Synthetisch: Übungen im Stand angeleitet.')).toBeVisible();
    expect(fetchKurzblick).toHaveBeenCalledWith(TERMIN_ID);
    expect(screen.getByText(/Klingel/)).toBeVisible();
    expect(screen.getByText('Synthetisch: Hund im Flur.')).toBeVisible();
    expect(screen.getByText('Theraband, Kinesiotape')).toBeVisible();
    expect(screen.getByText('Folgeverordnung vom 18.06.2026')).toBeVisible();
    expect(screen.getByText('7 von 10 Terminen genutzt, 9 geplant')).toBeVisible();
    expect(screen.getByText('Krankengymnastik: 7 von 10')).toBeVisible();
    // Ein Entwurf bleibt als Entwurf erkennbar.
    expect(screen.getByText('Entwurf')).toBeVisible();
    expect(screen.getByText('Lesen wird protokolliert')).toBeVisible();
  });

  it('liest beim erneuten Aufklappen neu - jedes Öffnen ist ein protokolliertes Lesen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Kurzblick appointmentId={TERMIN_ID} />);
    const kopf = screen.getByText('Vor der Tür');

    await user.click(kopf);
    await screen.findByText('Synthetisch: Übungen im Stand angeleitet.');
    await user.click(kopf);
    await user.click(kopf);

    await waitFor(() => expect(fetchKurzblick).toHaveBeenCalledTimes(2));
  });

  it('sagt es, wenn es noch keinen Eintrag und keine Grundlage gibt', async () => {
    fetchKurzblick.mockResolvedValue({
      ...blick,
      treatment_basis_id: null,
      treatment_basis_kind: null,
      treatment_basis_issued_on: null,
      basis_appointment_count: null,
      basis_used: null,
      basis_planned: null,
      basis_items: null,
      last_note_id: null,
      last_note_appointment_start: null,
      last_note_status: null,
      last_note_content: null,
      last_note_visit_without_treatment: null,
      last_note_author_name: null,
    });
    const user = userEvent.setup();
    renderWithProviders(<Kurzblick appointmentId={TERMIN_ID} />);

    await user.click(screen.getByText('Vor der Tür'));

    expect(await screen.findByText('Noch kein Eintrag vor diesem Termin.')).toBeVisible();
    expect(screen.getByText('Keine Behandlungsgrundlage zugeordnet.')).toBeVisible();
  });

  it('meldet einen Ladefehler mit erneutem Versuch', async () => {
    fetchKurzblick.mockRejectedValue(new Error('Netz'));
    const user = userEvent.setup();
    renderWithProviders(<Kurzblick appointmentId={TERMIN_ID} />);

    await user.click(screen.getByText('Vor der Tür'));

    expect(await screen.findByText('Der Kurzblick konnte nicht geladen werden.')).toBeVisible();
  });
});
