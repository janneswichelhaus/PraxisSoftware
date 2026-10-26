import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as SchedulingApi from '@/features/scheduling/api';
import type * as DokumentationApi from '@/features/documentation/api';
import { renderWithProviders, testUser } from '@/test-utils';

const saveAppointmentGrid = vi.fn();
const fetchDocumentationDeadline = vi.fn();
const saveDocumentationDeadline = vi.fn();

vi.mock('@/features/scheduling/api', async (importOriginal) => {
  const actual = await importOriginal<typeof SchedulingApi>();
  return {
    ...actual,
    saveAppointmentGrid: (minuten: number) => saveAppointmentGrid(minuten) as Promise<void>,
  };
});

vi.mock('@/features/documentation/api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchDocumentationDeadline: (organizationId: string) =>
      fetchDocumentationDeadline(organizationId) as Promise<number>,
    saveDocumentationDeadline: (tage: number) => saveDocumentationDeadline(tage) as Promise<void>,
  };
});

const { PraxisEinstellungenPage } = await import('./PraxisEinstellungenPage');

function rendern() {
  return renderWithProviders(
    <PraxisEinstellungenPage user={testUser(['owner'])} />,
    '/praxis/einstellungen',
  );
}

describe('PraxisEinstellungenPage (ORG-002)', () => {
  beforeEach(() => {
    saveAppointmentGrid.mockReset();
    fetchDocumentationDeadline.mockReset();
    saveDocumentationDeadline.mockReset();
    fetchDocumentationDeadline.mockResolvedValue(1);
    saveDocumentationDeadline.mockResolvedValue(undefined);
    saveAppointmentGrid.mockResolvedValue(undefined);
  });

  it('heißt wie ihre Ansicht und gliedert die Einstellungen in drei eingeklappte Gruppen', async () => {
    rendern();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Einstellungen' }),
    ).toBeInTheDocument();
    const gruppen = Array.from(document.querySelectorAll('details'));
    expect(gruppen.map((gruppe) => gruppe.querySelector('summary')?.textContent)).toEqual([
      'Termine und Dokumentation',
      'Touren',
      'Benachrichtigungen an Patient:innen',
    ]);
    expect(gruppen.every((gruppe) => !gruppe.open)).toBe(true);
    expect(screen.getByLabelText('Minutenraster').closest('details')).toBe(gruppen[0]);
  });

  describe('Praxisraster', () => {
    it('bietet owner die drei zulaessigen Werte an', async () => {
      rendern();
      const auswahl = await screen.findByLabelText('Minutenraster');
      const werte = Array.from(auswahl.querySelectorAll('option')).map((o) => o.textContent);
      expect(werte).toEqual(['5 Minuten', '10 Minuten', '15 Minuten']);
    });

    it('zeigt den aktuellen Wert der Praxis', async () => {
      rendern();
      expect(await screen.findByLabelText('Minutenraster')).toHaveValue('5');
    });

    it('speichert den gewaehlten Wert', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByLabelText('Minutenraster');

      await user.selectOptions(screen.getByLabelText('Minutenraster'), '15');
      await user.click(screen.getByRole('button', { name: 'Raster speichern' }));

      await waitFor(() => expect(saveAppointmentGrid).toHaveBeenCalledWith(15));
      expect(await screen.findByText('Das Praxisraster ist gespeichert.')).toBeInTheDocument();
    });
  });

  describe('Dokumentationsfrist (DOK-004)', () => {
    it('zeigt owner die gespeicherte Frist mit den Stufen', async () => {
      fetchDocumentationDeadline.mockResolvedValue(3);
      rendern();

      const auswahl = await screen.findByLabelText('Frist');
      await waitFor(() => expect(auswahl).toHaveValue('3'));
      const werte = Array.from(auswahl.querySelectorAll('option')).map((o) => o.textContent);
      expect(werte).toEqual([
        'Ende des Behandlungstages',
        'Ende des Folgetages',
        'Ende des 2. Tages nach der Behandlung',
        'Ende des 3. Tages nach der Behandlung',
        'Ende des 7. Tages nach der Behandlung',
        'Ende des 14. Tages nach der Behandlung',
      ]);
      expect(fetchDocumentationDeadline).toHaveBeenCalledWith(
        '22222222-2222-4222-8222-000000000001',
      );
    });

    it('zeigt einen gespeicherten Wert ausserhalb der Stufen trotzdem an', async () => {
      fetchDocumentationDeadline.mockResolvedValue(5);
      rendern();

      const auswahl = await screen.findByLabelText('Frist');
      await waitFor(() => expect(auswahl).toHaveValue('5'));
      expect(auswahl).toHaveTextContent('Ende des 5. Tages nach der Behandlung');
    });

    it('speichert die gewaehlte Frist', async () => {
      const user = userEvent.setup();
      rendern();
      const auswahl = await screen.findByLabelText('Frist');
      await waitFor(() => expect(auswahl).toHaveValue('1'));

      await user.selectOptions(auswahl, '0');
      await user.click(screen.getByRole('button', { name: 'Frist speichern' }));

      await waitFor(() => expect(saveDocumentationDeadline).toHaveBeenCalledWith(0));
      expect(await screen.findByRole('status')).toHaveTextContent('Die Frist ist gespeichert.');
    });

    it('meldet einen Fehler beim Speichern ohne interne Details, mit dem naechsten Schritt', async () => {
      const user = userEvent.setup();
      saveDocumentationDeadline.mockRejectedValue(
        new Error('Die Dokumentationsfrist konnte nicht gespeichert werden.'),
      );
      rendern();
      await waitFor(() => expect(screen.getByLabelText('Frist')).toHaveValue('1'));

      await user.click(screen.getByRole('button', { name: 'Frist speichern' }));

      const meldung = await screen.findByText(
        /Die Dokumentationsfrist konnte nicht gespeichert werden\./,
      );
      expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen und erneut speichern.');
    });

    it('sperrt Auswahl und Speichern, solange die Frist nicht geladen ist (ORG-14)', async () => {
      // Bis UXR-011 stand nach einem Ladefehler die Voreinstellung im Feld,
      // und ein Tipp auf „Frist speichern" haette die Frist der Praxis damit
      // ueberschrieben.
      fetchDocumentationDeadline.mockRejectedValue(new Error('kaputt'));
      rendern();

      expect(
        await screen.findByText(/Die Dokumentationsfrist konnte nicht geladen werden/),
      ).toBeInTheDocument();
      const auswahl = screen.getByLabelText('Frist');
      expect(auswahl).toBeDisabled();
      expect(auswahl).toHaveTextContent('Nicht geladen');
      expect(screen.getByRole('button', { name: 'Frist speichern' })).toBeDisabled();
    });
  });
});
