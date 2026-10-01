import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type * as LageApi from './abrechnungslage-api';
import { renderWithProviders, testAppointment } from '@/test-utils';
import { TileGrid } from '@/components/ui/Tile';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';

const lage: LageApi.Abrechnungslage = {
  appointment_id: TERMIN_ID,
  treatment_basis_id: '88888888-8888-4888-8888-000000000004',
  treatment_basis_kind: 'follow_up',
  treatment_basis_issued_on: '2026-09-08',
  basis_position: 8,
  basis_appointment_count: 10,
  billing_visible: true,
  recipient_kind: 'aid_authority',
  open_invoice_count: 2,
  open_outstanding_cents: 12345,
  open_overdue: true,
};

const fetchAbrechnungslage = vi.fn();
vi.mock('./abrechnungslage-api', async (importOriginal) => {
  const actual = await importOriginal<typeof LageApi>();
  return {
    ...actual,
    fetchAbrechnungslage: (id: string) =>
      fetchAbrechnungslage(id) as Promise<LageApi.Abrechnungslage | null>,
  };
});

const { AbrechnungAbschnitt, TreatmentBasisTile } = await import('./Abrechnungslage');

function rendern(gedeckt: boolean | null = true) {
  return renderWithProviders(
    <TileGrid>
      <TreatmentBasisTile
        appointment={testAppointment({ id: TERMIN_ID, treatment_basis_covered: gedeckt })}
        darfVerwalten
        zumTermin={`/termine/${TERMIN_ID}`}
      />
    </TileGrid>,
  );
}

/** Der eigene Abschnitt „Abrechnung" unter den Termindaten (BEF-081). */
function abschnittRendern() {
  return renderWithProviders(<AbrechnungAbschnitt appointmentId={TERMIN_ID} />);
}

describe('Verordnungszähler und Abrechnungslage (PRX-008)', () => {
  beforeEach(() => {
    fetchAbrechnungslage.mockReset();
    fetchAbrechnungslage.mockResolvedValue(lage);
  });

  it('nennt die Position in der Grundlage mit Bauart und Datum', async () => {
    rendern();
    expect(await screen.findByText('Termin 8 von 10')).toBeInTheDocument();
    expect(screen.getByText(/Folgeverordnung vom 08\.09\.2026/)).toBeInTheDocument();
    // Gedeckt ist der Regelfall: kein Zeichen, kein Weg zum Übertragen (CAL-022).
    expect(screen.queryByText('Ohne Deckung')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Auf andere Grundlage übertragen' })).toBeNull();
  });

  // CAL-022, UX-005a: Die fehlende Deckung steht in derselben Kachel wie die
  // Grundlage, die sie nicht trägt - mit dem Weg zur Abhilfe daneben.
  it('nennt einen ungedeckten Termin an seiner Grundlage, mit dem Weg zum Übertragen', async () => {
    rendern(false);
    expect(await screen.findByText('Ohne Deckung')).toBeInTheDocument();
    expect(
      screen.getByText('Die Behandlungsgrundlage deckt diesen Termin nicht.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Auf andere Grundlage übertragen' })).toHaveAttribute(
      'href',
      `/patienten/66666666-6666-4666-8666-000000000001/termine-uebertragen?zurueck=${encodeURIComponent(`/termine/${TERMIN_ID}`)}`,
    );
  });

  it('zeigt owner und office Empfänger und offene Rechnungen im Abschnitt „Abrechnung" (BEF-081)', async () => {
    abschnittRendern();
    expect(await screen.findByRole('heading', { name: 'Abrechnung' })).toBeInTheDocument();
    expect(screen.getByText('Beihilfestelle')).toBeInTheDocument();
    expect(
      screen.getByText(/2 Rechnungen, 123,45\s€ offen – davon überfällig/u),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zu den offenen Posten' })).toHaveAttribute(
      'href',
      '/abrechnung',
    );
  });

  it('sagt „keine", wenn nichts offen ist, und nennt die Person selbst als Empfänger', async () => {
    fetchAbrechnungslage.mockResolvedValue({
      ...lage,
      recipient_kind: 'self',
      open_invoice_count: 0,
      open_outstanding_cents: 0,
      open_overdue: false,
    });
    abschnittRendern();
    expect(await screen.findByText('Patient:in selbst')).toBeInTheDocument();
    expect(screen.getByText('keine')).toBeInTheDocument();
  });

  it('zeigt Behandelnden nur die Position - die Felder kommen leer vom Server', async () => {
    fetchAbrechnungslage.mockResolvedValue({
      ...lage,
      billing_visible: false,
      recipient_kind: null,
      open_invoice_count: null,
      open_outstanding_cents: null,
      open_overdue: null,
    });
    rendern();
    expect(await screen.findByText('Termin 8 von 10')).toBeInTheDocument();
    const { container } = abschnittRendern();
    await waitFor(() => expect(fetchAbrechnungslage).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Rechnung an')).toBeNull();
    expect(screen.queryByText('Offene Rechnungen')).toBeNull();
  });

  it('sagt es, wenn der Termin keine Grundlage hat', async () => {
    fetchAbrechnungslage.mockResolvedValue({
      ...lage,
      treatment_basis_id: null,
      treatment_basis_kind: null,
      treatment_basis_issued_on: null,
      basis_position: null,
      basis_appointment_count: null,
    });
    rendern();
    expect(await screen.findByText('Keine Behandlungsgrundlage zugeordnet')).toBeInTheDocument();
  });
});
