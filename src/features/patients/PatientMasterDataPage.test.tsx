import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';
import { roleLabel } from '@/components/ui/roleLabels';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const STAMMDATEN = `/patienten/${PATIENT_ID}/stammdaten`;

/** Ziel und mitgegebener Rückweg eines Links, getrennt geprüft. */
function linkZiel(link: HTMLElement): { pfad: string; zurueck: string | null } {
  const adresse = new URL(link.getAttribute('href') ?? '', 'http://akte.test');
  return { pfad: adresse.pathname, zurueck: adresse.searchParams.get('zurueck') };
}

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
const setTreatmentTableRequired = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    setPatientStatus: (id: string, status: string) => setPatientStatus(id, status) as Promise<void>,
    concludePatientCare: (id: string, tag?: string) =>
      concludePatientCare(id, tag) as Promise<void>,
    reopenPatientCare: (id: string) => reopenPatientCare(id) as Promise<void>,
    setTreatmentTableRequired: (id: string, wert: boolean) =>
      setTreatmentTableRequired(id, wert) as Promise<void>,
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

  // Mit Rückweg in die Stammdaten samt dem der Akte (PAT-08).
  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'bietet %s die Bearbeitung der Stammdaten an',
    (role) => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />, STAMMDATEN);

      expect(linkZiel(screen.getByRole('link', { name: 'Stammdaten bearbeiten' }))).toEqual({
        pfad: `/patienten/${PATIENT_ID}/bearbeiten`,
        zurueck: STAMMDATEN,
      });
    },
  );

  it('zeigt Anschrift, Versorgungsbeginn und Status', () => {
    renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

    expect(screen.getByText('Musterweg 12b, 72070 Tübingen')).toBeInTheDocument();
    expect(screen.getByText('05.01.2026')).toBeInTheDocument();
    expect(screen.getByText('Aktiv')).toBeInTheDocument();
  });

  describe('Hausbesuch und Praxisangaben (PAT-005)', () => {
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
      // Ein Name für das Feld, wie im Formular (PAT-07).
      expect(screen.getByText('Zugangshinweis')).toBeInTheDocument();
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

      expect(screen.queryByText('Hausbesuch und Praxisangaben')).not.toBeInTheDocument();
    });

    it('bietet die Mobilnummer als Anruf an', () => {
      renderWithProviders(
        <Stammdaten
          patient={testPatient({ id: PATIENT_ID, phone_mobile: '+49 160 0000005' })}
          user={testUser(['therapist'])}
        />,
      );

      const anruf = screen.getByRole('link', { name: '+49 160 0000005' });
      expect(anruf).toHaveAttribute('href', 'tel:+491600000005');
      // 44 px Tippziel und als Link erkennbar (PAT-11, RSP-05).
      expect(anruf).toHaveClass('min-h-11', 'underline');
    });

    it('bietet die E-Mail als Link mit Tippziel an', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);

      const mail = screen.getByRole('link', { name: 'max.mustermann@example.invalid' });
      expect(mail).toHaveAttribute('href', 'mailto:max.mustermann@example.invalid');
      expect(mail).toHaveClass('min-h-11', 'underline');
    });
  });

  describe('Betroffenenrechte', () => {
    it('zeigt owner den Weg zu Auskunft und Loeschverlangen', () => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['owner'])} />, STAMMDATEN);

      expect(linkZiel(screen.getByRole('link', { name: 'Auskunft und Löschverlangen' }))).toEqual({
        pfad: `/patienten/${aktiv.id}/auskunft`,
        zurueck: STAMMDATEN,
      });
    });

    // PAT-05: Statt einer Lücke erfahren die übrigen Praxisrollen, wer eine
    // Anfrage bearbeitet.
    it.each([['therapist'], ['team_lead'], ['office']] as const)(
      'blendet ihn fuer %s aus und sagt, wer die Auskunft erteilt',
      (role) => {
        renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />);

        expect(screen.queryByRole('link', { name: 'Auskunft und Löschverlangen' })).toBeNull();
        expect(
          screen.getByText(
            `Auskunft nach Art. 15 DSGVO und Löschverlangen sind der Rolle „${roleLabel('owner')}“ vorbehalten.`,
          ),
        ).toBeInTheDocument();
      },
    );

    it('sagt einem Patientenkonto dazu nichts', () => {
      renderWithProviders(
        <Stammdaten patient={testPatient({ id: PATIENT_ID })} user={testUser(['patient'])} />,
      );
      expect(screen.queryByText(/Löschverlangen/)).not.toBeInTheDocument();
    });
  });

  describe('Versorgungsstatus', () => {
    it.each([['owner'], ['team_lead'], ['office']] as const)('zeigt %s die Aktion', (role) => {
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser([role])} />);
      expect(screen.getByRole('button', { name: 'Als inaktiv markieren' })).toBeInTheDocument();
    });

    // PAT-05: Der Hinweis zählt, was die Rolle tatsächlich sieht.
    it('nennt beide Vorgänge nur, wenn beide zu sehen sind', () => {
      const { unmount } = renderWithProviders(
        <Stammdaten patient={aktiv} user={testUser(['owner'])} />,
      );
      expect(screen.getByText(/Beide sind rücknehmbar\./)).toBeInTheDocument();
      unmount();

      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['office'])} />);
      expect(screen.queryByText(/Beide sind rücknehmbar/)).not.toBeInTheDocument();
      expect(
        screen.getByText(
          'Ein Vorgang, der eine Akte aus dem laufenden Betrieb nimmt. Er ist rücknehmbar.',
        ),
      ).toBeInTheDocument();
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

      expect(screen.getByText(/12\.03\.2026 – Aufbewahrung bis 2036/)).toBeInTheDocument();
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

    // PAT-15: Der Wähler bietet keinen Tag vor dem Beginn der Versorgung an.
    it('begrenzt den letzten Behandlungstag auf die Zeit der Versorgung', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Versorgung abschließen' }));
      expect(screen.getByLabelText('Letzter Behandlungstag')).toHaveAttribute('min', '2026-01-05');
    });

    // WRT-10: Knopf und Laufanzeige nennen dieselbe Handlung.
    it('nennt beim Abschließen, was gerade geschieht', async () => {
      const user = userEvent.setup();
      concludePatientCare.mockImplementation(() => new Promise<void>(() => undefined));
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Versorgung abschließen' }));
      const kasten = screen.getByRole('group', { name: 'Versorgung abschließen' });
      await user.click(within(kasten).getByRole('button', { name: 'Versorgung abschließen' }));

      expect(await screen.findByRole('button', { name: 'Wird abgeschlossen …' })).toBeDisabled();
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

  describe('Behandlungsliege (UX-003a)', () => {
    beforeEach(() => {
      setTreatmentTableRequired.mockReset();
      setTreatmentTableRequired.mockResolvedValue(undefined);
    });

    it('setzt die Liege mit einem Tap, ohne Rueckfrage', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      expect(screen.getByText('Behandlungsliege')).toBeInTheDocument();
      expect(screen.getByText('Nicht nötig')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Liege mitnehmen' }));

      await waitFor(() => expect(setTreatmentTableRequired).toHaveBeenCalledWith(PATIENT_ID, true));
    });

    it('nimmt eine gesetzte Liege zurueck', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <Stammdaten
          patient={{ ...aktiv, treatment_table_required: true }}
          user={testUser(['office'])}
        />,
      );

      expect(screen.getByText('Mitnehmen')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Liege nicht mehr mitnehmen' }));

      await waitFor(() =>
        expect(setTreatmentTableRequired).toHaveBeenCalledWith(PATIENT_ID, false),
      );
    });

    it('meldet einen Fehler als Text', async () => {
      const user = userEvent.setup();
      setTreatmentTableRequired.mockRejectedValue(new Error('abgelehnt'));
      renderWithProviders(<Stammdaten patient={aktiv} user={testUser(['therapist'])} />);

      await user.click(screen.getByRole('button', { name: 'Liege mitnehmen' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/Behandlungsliege/);
    });

    it('zeigt einem Patientenkonto weder Angabe noch Knopf', () => {
      renderWithProviders(
        <Stammdaten patient={testPatient({ id: PATIENT_ID })} user={testUser(['patient'])} />,
      );
      expect(screen.queryByText('Behandlungsliege')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Liege/ })).not.toBeInTheDocument();
    });
  });
});
