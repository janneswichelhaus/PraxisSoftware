import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as VermerkeApi from './vermerke';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const fetchDatenschutzvermerke = vi.fn();
const vermerkeSpeichern = vi.fn();

vi.mock('./vermerke', async (importOriginal) => {
  const actual = await importOriginal<typeof VermerkeApi>();
  return {
    ...actual,
    fetchDatenschutzvermerke: (id: string) =>
      fetchDatenschutzvermerke(id) as Promise<VermerkeApi.Datenschutzvermerk[]>,
    vermerkeSpeichern: (v: VermerkeApi.NeuerVermerk) => vermerkeSpeichern(v) as Promise<void>,
  };
});

const { Datenschutz } = await import('./PatientDatenschutzPage');

function seite(vermerke: VermerkeApi.Datenschutzvermerk[] = []) {
  fetchDatenschutzvermerke.mockResolvedValue(vermerke);
  return renderWithProviders(
    <Datenschutz patient={testPatient({ id: PATIENT_ID })} user={testUser(['office'])} />,
  );
}

/**
 * Datenschutz in der Akte (PAT-006).
 *
 * Geprueft wird, was die Seite anbietet und was sie an den Server gibt. Ob der
 * Server es annimmt, pruefen die Datenbanktests
 * (`supabase/tests/datenschutzvermerke.test.ts`).
 */
describe('Datenschutz der Akte', () => {
  beforeEach(() => {
    fetchDatenschutzvermerke.mockReset();
    vermerkeSpeichern.mockReset();
    vermerkeSpeichern.mockResolvedValue(undefined);
  });

  it('zeigt ohne Vermerk, dass nichts vorliegt', async () => {
    seite();

    expect(await screen.findByText('Datenschutzinformation')).toBeInTheDocument();
    expect(screen.getAllByText('nicht vermerkt')).toHaveLength(2);
    expect(screen.getAllByText('nicht erteilt')).toHaveLength(3);
    expect(screen.getByText('Fotos im Behandlungsverlauf')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Blätter zum Ausdrucken' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}/aufnahmeblaetter`,
    );
  });

  it('bietet nach einer Erteilung den Widerruf an und nicht die zweite Erteilung', async () => {
    seite([
      {
        id: 'v1',
        record_kind: 'consent_granted',
        purpose: 'email_contact',
        notice_version: null,
        occurred_on: '2026-09-01',
        recorded_at: '2026-09-01T08:00:00Z',
      },
    ]);

    const auswahl = await screen.findByLabelText('Was ist geschehen?');
    const optionen = [...(auswahl as HTMLSelectElement).options].map((o) => o.textContent);
    expect(optionen).toContain('Einwilligung widerrufen: Kontakt per E-Mail');
    expect(optionen).not.toContain('Einwilligung erteilt: Kontakt per E-Mail');
    expect(optionen).toContain('Einwilligung erteilt: Bericht an die verordnende Praxis');
    expect(screen.getByText('erteilt am 01.09.2026')).toBeInTheDocument();
  });

  it('vermerkt die Datenschutzinformation mit der aktuellen Fassung', async () => {
    const user = userEvent.setup();
    seite();

    const datum = await screen.findByLabelText('Datum auf dem Papier');
    await user.clear(datum);
    await user.type(datum, '2026-09-15');
    await user.click(screen.getByRole('button', { name: 'Vermerken' }));

    await waitFor(() =>
      expect(vermerkeSpeichern).toHaveBeenCalledWith({
        patientId: PATIENT_ID,
        art: 'privacy_notice_handed_out',
        fassung: '2026-09',
        datum: '2026-09-15',
      }),
    );
    expect(
      await screen.findByText('Vermerkt: Datenschutzinformation ausgehändigt.'),
    ).toBeInTheDocument();
  });

  it('gibt einen Widerruf mit Zweck und ohne Fassung weiter', async () => {
    const user = userEvent.setup();
    seite([
      {
        id: 'v1',
        record_kind: 'consent_granted',
        purpose: 'prescriber_report',
        notice_version: null,
        occurred_on: '2026-09-01',
        recorded_at: '2026-09-01T08:00:00Z',
      },
    ]);

    await user.selectOptions(
      await screen.findByLabelText('Was ist geschehen?'),
      'consent_withdrawn:prescriber_report',
    );
    await user.click(screen.getByRole('button', { name: 'Vermerken' }));

    await waitFor(() =>
      expect(vermerkeSpeichern).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'consent_withdrawn', zweck: 'prescriber_report' }),
      ),
    );
    expect(vermerkeSpeichern.mock.calls[0]![0]).not.toHaveProperty('fassung');
  });

  it('vermerkt eine Ablehnung und bietet sie danach nicht noch einmal an (ADR-017 Punkt 35)', async () => {
    const user = userEvent.setup();
    const { unmount } = seite();

    await user.selectOptions(
      await screen.findByLabelText('Was ist geschehen?'),
      'consent_refused:patient_photos',
    );
    await user.click(screen.getByRole('button', { name: 'Vermerken' }));
    await waitFor(() =>
      expect(vermerkeSpeichern).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'consent_refused', zweck: 'patient_photos' }),
      ),
    );
    unmount();

    seite([
      {
        id: 'v1',
        record_kind: 'consent_refused',
        purpose: 'patient_photos',
        notice_version: null,
        occurred_on: '2026-09-01',
        recorded_at: '2026-09-01T08:00:00Z',
      },
    ]);
    expect(await screen.findByText('abgelehnt am 01.09.2026')).toBeInTheDocument();
    const auswahl: HTMLSelectElement = screen.getByLabelText('Was ist geschehen?');
    const optionen = [...auswahl.options].map((o) => o.value);
    expect(optionen).not.toContain('consent_refused:patient_photos');
    expect(optionen).toContain('consent_granted:patient_photos');
  });

  it('sagt vor dem Widerruf der Fotoeinwilligung, dass die Fotos sofort geloescht werden', async () => {
    const user = userEvent.setup();
    seite([
      {
        id: 'v1',
        record_kind: 'consent_granted',
        purpose: 'patient_photos',
        notice_version: null,
        occurred_on: '2026-09-01',
        recorded_at: '2026-09-01T08:00:00Z',
      },
    ]);

    await user.selectOptions(
      await screen.findByLabelText('Was ist geschehen?'),
      'consent_withdrawn:patient_photos',
    );
    expect(screen.getByText(/alle Fotos dieser Person sofort gelöscht/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Widerruf vermerken und Fotos löschen' }));

    await waitFor(() =>
      expect(vermerkeSpeichern).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'consent_withdrawn', zweck: 'patient_photos' }),
      ),
    );
  });

  it('zeigt die Abweisung des Servers verstaendlich', async () => {
    const user = userEvent.setup();
    vermerkeSpeichern.mockRejectedValue(new Error('Das Datum darf nicht in der Zukunft liegen.'));
    seite();

    await user.click(await screen.findByRole('button', { name: 'Vermerken' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Das Datum darf nicht in der Zukunft liegen.',
    );
  });

  it('weist auf eine veraltete Fassung hin', async () => {
    seite([
      {
        id: 'v1',
        record_kind: 'privacy_notice_handed_out',
        purpose: null,
        notice_version: '2025-01',
        occurred_on: '2025-01-10',
        recorded_at: '2025-01-10T08:00:00Z',
      },
    ]);

    expect(await screen.findByText('Inzwischen gilt Fassung 2026-09.')).toBeInTheDocument();
  });

  it('besteht die Barrierefreiheitspruefung', async () => {
    const { container } = seite();
    await screen.findByText('Datenschutzinformation');
    await pruefeBarrierefreiheit(container);
  });
});
