import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const aktiv: PatientsApi.Patient = testPatient({
  id: PATIENT_ID,
  status: 'active',
  care_started_on: '2026-01-05',
  date_of_birth: '1985-07-19',
  email: 'max.mustermann@example.invalid',
  phone: '0221 1234567',
  street: 'Musterweg',
  house_number: '12b',
  postal_code: '72070',
  city: 'Tübingen',
});

const setPatientStatus = vi.fn();
const concludePatientCare = vi.fn();
const reopenPatientCare = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    setPatientStatus: (id: string, status: string) => setPatientStatus(id, status) as Promise<void>,
    concludePatientCare: (id: string, tag?: string) =>
      concludePatientCare(id, tag) as Promise<void>,
    reopenPatientCare: (id: string) => reopenPatientCare(id) as Promise<void>,
  };
});

const { Stammdaten } = await import('./PatientMasterDataPage');

/**
 * Stammdaten und Verwaltung (AKTE-005).
 *
 * Inhaltlich derselbe Umfang wie vorher in der einseitigen Akte - geprüft wird
 * hier, dass er vollständig geblieben ist und dass die beiden Vorgänge mit
 * Rückfrage weiterhin nichts ohne zweiten Klick schreiben.
 */
describe('Stammdaten der Akte', () => {
  beforeEach(() => {
    setPatientStatus.mockReset();
    concludePatientCare.mockReset();
    reopenPatientCare.mockReset();
    setPatientStatus.mockResolvedValue(undefined);
    concludePatientCare.mockResolvedValue(undefined);
    reopenPatientCare.mockResolvedValue(undefined);
  });

  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'bietet %s die Bearbeitung der Stammdaten an',
    (role) => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />);

      expect(screen.getByRole('link', { name: 'Stammdaten bearbeiten' })).toHaveAttribute(
        'href',
        `/patienten/${PATIENT_ID}/bearbeiten`,
      );
    },
  );

  it('zeigt Anschrift, Versorgungsbeginn und Status', () => {
    renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

    expect(screen.getByText('Musterweg 12b, 72070 Tübingen')).toBeInTheDocument();
    expect(screen.getByText('05.01.2026')).toBeInTheDocument();
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
  });

  describe('Hausbesuch und Versorgung (PAT-005)', () => {
    it('zeigt Zugangshinweis, Besonderheit und feste Therapeut:in', () => {
      renderWithProviders(
        <Stammdaten
          patient={testPatient({
            id: PATIENT_ID,
            home_visit_access_note: '2. OG links, Klingel "Mustermann".',
            special_note: 'Hund im Flur.',
            primary_therapist_name: 'Anna Beispiel',
            remark: 'Bevorzugt Vormittage.',
          })}
          user={testUser(['office'])}
        />,
      );

      expect(screen.getByText('2. OG links, Klingel "Mustermann".')).toBeInTheDocument();
      expect(screen.getByText('Hund im Flur.')).toBeInTheDocument();
      expect(screen.getByText('Anna Beispiel')).toBeInTheDocument();
      expect(screen.getByText('Bevorzugt Vormittage.')).toBeInTheDocument();
    });

    it('laesst den Abschnitt weg, wenn die Sicht nichts liefert', () => {
      // Fuer ein Patientenkonto sind die internen Angaben serverseitig leer
      // (ANN-010). Die Oberflaeche zeigt dann keinen leeren Abschnitt.
      renderWithProviders(
        <Stammdaten patient={testPatient({ id: PATIENT_ID })} user={testUser(['patient'])} />,
      );

      expect(screen.queryByText('Hausbesuch und Versorgung')).not.toBeInTheDocument();
    });

    it('bietet die Mobilnummer als Anruf an', () => {
      renderWithProviders(
        <Stammdaten
          patient={testPatient({ id: PATIENT_ID, phone_mobile: '+49 160 0000005' })}
          user={testUser(['therapist'])}
        />,
      );

      expect(screen.getByRole('link', { name: '+49 160 0000005' })).toHaveAttribute(
        'href',
        'tel:+491600000005',
      );
    });
  });

  describe('Betroffenenrechte', () => {
    it('zeigt owner den Weg zu Auskunft und Loeschverlangen', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['owner'])} />);

      expect(screen.getByRole('link', { name: 'Auskunft und Löschverlangen' })).toHaveAttribute(
        'href',
        `/patienten/${aktiv.id}/auskunft`,
      );
    });

    it.each([['therapist'], ['team_lead'], ['office']] as const)(
      'blendet ihn fuer %s aus - die Auskunft erteilt die Praxisleitung',
      (role) => {
        renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />);

        expect(screen.queryByRole('link', { name: 'Auskunft und Löschverlangen' })).toBeNull();
      },
    );
  });

  describe('Versorgungsstatus', () => {
    it.each([['owner'], ['team_lead'], ['office']] as const)('zeigt %s die Aktion', (role) => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />);
      expect(screen.getByRole('button', { name: 'Als inaktiv markieren' })).toBeInTheDocument();
    });

    it('blendet die Aktion fuer therapist aus, obwohl die Akte lesbar ist', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      expect(screen.getByText('Kontakt')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Als inaktiv markieren' }),
      ).not.toBeInTheDocument();
    });

    it('schreibt erst nach der Rueckfrage', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      await user.click(screen.getByRole('button', { name: 'Als inaktiv markieren' }));
      expect(setPatientStatus).not.toHaveBeenCalled();

      const buttons = screen.getAllByRole('button', { name: 'Als inaktiv markieren' });
      await user.click(buttons[buttons.length - 1]!);

      await waitFor(() => expect(setPatientStatus).toHaveBeenCalledWith(PATIENT_ID, 'inactive'));
    });

    it('verwirft die Rueckfrage bei Abbrechen ohne Schreibvorgang', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      await user.click(screen.getByRole('button', { name: 'Als inaktiv markieren' }));
      await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

      expect(setPatientStatus).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Abbrechen' })).not.toBeInTheDocument();
    });

    it('bietet einem inaktiven Datensatz die Reaktivierung an', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Stammdaten patient={{ ...aktiv, status: 'inactive' }} user={testUser(['office'])} />,
      );

      await user.click(screen.getByRole('button', { name: 'Wieder als aktiv führen' }));
      const buttons = screen.getAllByRole('button', { name: 'Wieder als aktiv führen' });
      await user.click(buttons[buttons.length - 1]!);

      await waitFor(() => expect(setPatientStatus).toHaveBeenCalledWith(PATIENT_ID, 'active'));
    });

    it('loest bei doppeltem Klick nur einen Schreibvorgang aus', async () => {
      const user = userEvent.setup();
      let aufloesen: () => void = () => undefined;
      setPatientStatus.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            aufloesen = resolve;
          }),
      );

      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);
      await user.click(screen.getByRole('button', { name: 'Als inaktiv markieren' }));
      const buttons = screen.getAllByRole('button', { name: 'Als inaktiv markieren' });
      await user.click(buttons[buttons.length - 1]!);

      const laufend = await screen.findByRole('button', { name: 'Wird geändert …' });
      await user.click(laufend);

      expect(setPatientStatus).toHaveBeenCalledTimes(1);

      aufloesen();
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Wird geändert …' })).not.toBeInTheDocument(),
      );
      expect(setPatientStatus).toHaveBeenCalledTimes(1);
    });

    it('meldet einen fehlgeschlagenen Statuswechsel ohne interne Details', async () => {
      const user = userEvent.setup();
      setPatientStatus.mockRejectedValue(new Error('boom'));
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      await user.click(screen.getByRole('button', { name: 'Als inaktiv markieren' }));
      const buttons = screen.getAllByRole('button', { name: 'Als inaktiv markieren' });
      await user.click(buttons[buttons.length - 1]!);

      expect(
        await screen.findByText('Der Versorgungsstatus konnte nicht geändert werden.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('boom')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Abschluss der Versorgung (LOE-001b)
  //
  // Der Vorgang startet die zehnjaehrige Aufbewahrung nach ADR-008. Geprueft
  // wird deshalb dreierlei: der Rollenschnitt (ohne office), dass nichts ohne
  // Rueckfrage geschrieben wird, und dass der Zustand als Text dasteht - nicht
  // nur als Abwesenheit einer Schaltflaeche.
  // ---------------------------------------------------------------------------
  describe('Abschluss der Versorgung', () => {
    const abgeschlossen = { ...aktiv, care_concluded_on: '2026-03-12' };

    it.each([['owner'], ['therapist'], ['team_lead']] as const)(
      'bietet %s den Abschluss an',
      (role) => {
        renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />);
        expect(screen.getByRole('button', { name: 'Versorgung abschließen' })).toBeInTheDocument();
      },
    );

    it('bietet office den Abschluss nicht an', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      expect(
        screen.queryByRole('button', { name: 'Versorgung abschließen' }),
      ).not.toBeInTheDocument();
    });

    it('nennt die laufende Versorgung als Text', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);
      expect(screen.getByText('Laufende Versorgung')).toBeInTheDocument();
    });

    it('nennt Abschlusstag und Ende der Aufbewahrung als Text', () => {
      renderWithProviders(<Stammdaten patient={abgeschlossen} user={testUser(['therapist'])} />);

      expect(screen.getByText(/12\.03\.2026 — Aufbewahrung bis 2036/)).toBeInTheDocument();
    });

    it('schreibt erst nach der Rueckfrage und mit dem gewaehlten Tag', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Versorgung abschließen' }));
      expect(concludePatientCare).not.toHaveBeenCalled();

      const feld = screen.getByLabelText('Letzter Behandlungstag');
      await user.clear(feld);
      await user.type(feld, '2026-09-01');

      const buttons = screen.getAllByRole('button', { name: 'Versorgung abschließen' });
      await user.click(buttons[buttons.length - 1]!);

      await waitFor(() =>
        expect(concludePatientCare).toHaveBeenCalledWith(PATIENT_ID, '2026-09-01'),
      );
    });

    it('bietet einem abgeschlossenen Fall die Ruecknahme an', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={abgeschlossen} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Abschluss zurücknehmen' }));
      const buttons = screen.getAllByRole('button', { name: 'Abschluss zurücknehmen' });
      await user.click(buttons[buttons.length - 1]!);

      await waitFor(() => expect(reopenPatientCare).toHaveBeenCalledWith(PATIENT_ID));
      expect(concludePatientCare).not.toHaveBeenCalled();
    });

    it('meldet einen Fehler, ohne Erfolg vorzutaeuschen', async () => {
      const user = userEvent.setup();
      concludePatientCare.mockRejectedValue(new Error('abgelehnt'));
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Versorgung abschließen' }));
      const buttons = screen.getAllByRole('button', { name: 'Versorgung abschließen' });
      await user.click(buttons[buttons.length - 1]!);

      expect(await screen.findByRole('alert')).toHaveTextContent(/konnte nicht gespeichert werden/);
    });
  });
});
