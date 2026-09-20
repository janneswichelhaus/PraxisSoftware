import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type * as RouterModul from 'react-router-dom';
import { morgenOrtszeit, renderWithProviders } from '@/test-utils';

const createPatient = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    createPatient: (values: unknown) => createPatient(values) as Promise<string>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

const { NewPatientPage } = await import('./NewPatientPage');

async function ausfuellen(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Vorname *'), '  Nora  ');
  await user.type(screen.getByLabelText('Nachname *'), 'Neuzugang');
  await user.type(screen.getByLabelText('Geburtsdatum *'), '1980-03-14');
}

describe('NewPatientPage', () => {
  beforeEach(() => {
    createPatient.mockReset();
    navigate.mockReset();
  });

  it('markiert Pflichtfelder und zeigt fehlende Angaben inline', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    expect(screen.getByLabelText('Vorname *')).toBeRequired();
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));

    expect(await screen.findByText('Vorname ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Nachname ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Geburtsdatum ist erforderlich.')).toBeInTheDocument();
    expect(createPatient).not.toHaveBeenCalled();
  });

  it('verbindet Fehlermeldung und Feld ueber aria-describedby', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));

    const feld = screen.getByLabelText('Vorname *');
    await waitFor(() => expect(feld).toHaveAttribute('aria-invalid', 'true'));
    const beschreibung = feld.getAttribute('aria-describedby');
    expect(beschreibung).toBeTruthy();
    expect(document.getElementById(beschreibung!)).toHaveTextContent('Vorname ist erforderlich.');
  });

  it('fuehrt aus der Fehlerzusammenfassung direkt ins Feld', async () => {
    // Die Stammdaten sind das laengste Formular der Anwendung: Ein Fehler im
    // Vornamen steht beim Absenden ausserhalb des Bildes (UX-012).
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveFocus();
    expect(kasten).toHaveTextContent('Vorname: Vorname ist erforderlich.');
    expect(kasten).toHaveTextContent('Geburtsdatum: Geburtsdatum ist erforderlich.');

    await user.click(
      screen.getByRole('link', { name: 'Geburtsdatum: Geburtsdatum ist erforderlich.' }),
    );
    expect(screen.getByLabelText('Geburtsdatum *')).toHaveFocus();
  });

  it('nimmt die korrigierte Angabe aus der Fehlerzusammenfassung heraus', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));
    await screen.findByRole('alert');

    await user.type(screen.getByLabelText('Vorname *'), 'Nora');

    await waitFor(() =>
      expect(screen.getByRole('alert')).not.toHaveTextContent('Vorname ist erforderlich.'),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Nachname ist erforderlich.');
  });

  it('lehnt ein Geburtsdatum in der Zukunft ab', async () => {
    const user = userEvent.setup();
    const morgen = morgenOrtszeit();
    renderWithProviders(<NewPatientPage />);

    await user.type(screen.getByLabelText('Vorname *'), 'Nora');
    await user.type(screen.getByLabelText('Nachname *'), 'Neuzugang');
    await user.type(screen.getByLabelText('Geburtsdatum *'), morgen);
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));

    expect(
      await screen.findByText('Das Geburtsdatum darf nicht in der Zukunft liegen.'),
    ).toBeInTheDocument();
    expect(createPatient).not.toHaveBeenCalled();
  });

  it('prueft die E-Mail nur, wenn sie angegeben ist', async () => {
    createPatient.mockResolvedValue('66666666-6666-4666-8666-0000000000aa');
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    await user.type(screen.getByLabelText('E-Mail'), 'kein-at-zeichen');
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));
    expect(await screen.findByText('Keine gültige E-Mail-Adresse.')).toBeInTheDocument();
    expect(createPatient).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('E-Mail'));
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));
    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
  });

  it('trimmt Texte und sendet leere Optionalfelder als null', async () => {
    createPatient.mockResolvedValue('66666666-6666-4666-8666-0000000000bb');
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    await user.type(screen.getByLabelText('Ort'), '  Tuebingen  ');
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));

    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
    // Vollstaendig aufgezaehlt: ein neues Stammdatenfeld soll diesen Test
    // brechen, damit es nicht unbemerkt am Formular vorbeigeht.
    expect(createPatient).toHaveBeenCalledWith({
      given_name: 'Nora',
      family_name: 'Neuzugang',
      date_of_birth: '1980-03-14',
      email: null,
      phone: null,
      phone_work: null,
      phone_mobile: null,
      fax: null,
      institution: null,
      street: null,
      house_number: null,
      postal_code: null,
      city: 'Tuebingen',
      primary_therapist_staff_member_id: null,
      home_visit_access_note: null,
      special_note: null,
      remark: null,
    });
  });

  it('sendet weder Status noch Organisation noch IDs mit', async () => {
    createPatient.mockResolvedValue('66666666-6666-4666-8666-0000000000cc');
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));

    await waitFor(() => expect(createPatient).toHaveBeenCalledTimes(1));
    const gesendet = Object.keys(createPatient.mock.calls[0]![0] as object);
    for (const verboten of ['status', 'organization_id', 'id', 'person_id', 'patient_id']) {
      expect(gesendet).not.toContain(verboten);
    }
  });

  // ---------------------------------------------------------------------------
  // UX-012: Aus einem laufenden Vorgang heraus anlegen - die Anlage fuehrt
  // dorthin zurueck und nimmt die neue Kennung mit.
  // ---------------------------------------------------------------------------
  it('kehrt mit der neuen Kennung in den laufenden Vorgang zurueck', async () => {
    createPatient.mockResolvedValue('66666666-6666-4666-8666-0000000000ee');
    const user = userEvent.setup();
    const vorgang = '/termine/neu?datum=2027-05-12&beginn=09%3A00';
    renderWithProviders(
      <NewPatientPage />,
      `/patienten/neu?zurueck=${encodeURIComponent(vorgang)}`,
    );

    await ausfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        `${vorgang}&patient=66666666-6666-4666-8666-0000000000ee`,
        { replace: true },
      ),
    );
  });

  it('bricht in den laufenden Vorgang ab, ohne etwas anzulegen', async () => {
    const user = userEvent.setup();
    const vorgang = '/termine/neu?datum=2027-05-12';
    renderWithProviders(
      <NewPatientPage />,
      `/patienten/neu?zurueck=${encodeURIComponent(vorgang)}`,
    );

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(navigate).toHaveBeenCalledWith(vorgang);
    expect(createPatient).not.toHaveBeenCalled();
  });

  it('navigiert nach erfolgreicher Anlage zur neuen Patientenakte', async () => {
    createPatient.mockResolvedValue('66666666-6666-4666-8666-0000000000dd');
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/patienten/66666666-6666-4666-8666-0000000000dd', {
        replace: true,
      }),
    );
  });

  it('legt bei doppeltem Absenden nur einen Patienten an', async () => {
    let aufloesen: ((id: string) => void) | undefined;
    createPatient.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          aufloesen = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    const knopf = screen.getByRole('button', { name: 'Patient anlegen' });
    await user.click(knopf);

    // Waehrend der Vorgang laeuft, ist die Aktion gesperrt.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Wird angelegt …' })).toBeDisabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Wird angelegt …' }));
    await user.click(screen.getByRole('button', { name: 'Wird angelegt …' }));

    expect(createPatient).toHaveBeenCalledTimes(1);
    aufloesen?.('66666666-6666-4666-8666-0000000000ee');
  });

  it('zeigt bei einem Serverfehler eine verstaendliche Meldung ohne Details', async () => {
    createPatient.mockRejectedValue(new Error('not allowed to create patients'));
    const user = userEvent.setup();
    renderWithProviders(<NewPatientPage />);

    await ausfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Patient anlegen' }));

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Der Patient konnte nicht angelegt werden.');
    expect(meldung.textContent).not.toMatch(/not allowed/i);
  });
});
