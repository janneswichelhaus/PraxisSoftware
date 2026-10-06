import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, useLocation } from 'react-router-dom';
import type * as SchedulingApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as DokumentationApi from '@/features/documentation/api';
import { renderWithProviders, testUser } from '@/test-utils';

const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';

const fetchWorkingHours = vi.fn();
const fetchWorkingHourExceptions = vi.fn();
const saveWorkingHours = vi.fn();
const saveWorkingHourException = vi.fn();
const saveAppointmentGrid = vi.fn();
const fetchAssignableTherapists = vi.fn();
const fetchDocumentationDeadline = vi.fn();
const saveDocumentationDeadline = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof SchedulingApi>();
  return {
    ...actual,
    fetchWorkingHours: () => fetchWorkingHours() as Promise<SchedulingApi.WorkingHour[]>,
    fetchWorkingHourExceptions: (von: string, bis: string) =>
      fetchWorkingHourExceptions(von, bis) as Promise<SchedulingApi.WorkingHourException[]>,
    saveWorkingHours: (staff: string, tag: number, bloecke: unknown) =>
      saveWorkingHours(staff, tag, bloecke) as Promise<void>,
    saveWorkingHourException: (staff: string, datum: string, abwesend: boolean, bloecke: unknown) =>
      saveWorkingHourException(staff, datum, abwesend, bloecke) as Promise<void>,
    saveAppointmentGrid: (minuten: number) => saveAppointmentGrid(minuten) as Promise<void>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
    // Der heutige Tag wird festgehalten, damit die Tests nicht mit der Uhr laufen.
    todayInTimeZone: () => '2027-05-12',
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

const { SchedulingPage } = await import('./SchedulingPage');

function rendern(rollen: Parameters<typeof testUser>[0] = ['office'], anzeigename?: string) {
  return renderWithProviders(
    <SchedulingPage user={testUser(rollen, anzeigename)} />,
    '/praxis/planung',
  );
}

/** Wartet, bis der Wochenplan gerendert ist. */
function wochenplanAbwarten() {
  return screen.findByRole('heading', { name: 'Wochenplan' });
}

/** Die Zeile eines Tages in der Wochenübersicht. */
function tageszeile(tag: string): HTMLElement {
  const zeile = screen
    .getAllByRole('listitem')
    .find((eintrag) => eintrag.textContent?.startsWith(tag));
  if (!zeile) throw new Error(`Keine Zeile fuer ${tag}`);
  return zeile;
}

/** Eine Prüfseite mit einem Weg nach draußen, um den Schutz zu sehen. */
function MitWegHinaus() {
  const { pathname } = useLocation();
  return (
    <>
      <p>Adresse: {pathname}</p>
      <Link to="/woanders">Weggehen</Link>
      <SchedulingPage user={testUser(['office'])} />
    </>
  );
}

describe('SchedulingPage', () => {
  beforeEach(() => {
    fetchWorkingHours.mockReset();
    fetchWorkingHourExceptions.mockReset();
    saveWorkingHours.mockReset();
    saveWorkingHourException.mockReset();
    saveAppointmentGrid.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchDocumentationDeadline.mockReset();
    saveDocumentationDeadline.mockReset();
    fetchDocumentationDeadline.mockResolvedValue(1);
    saveDocumentationDeadline.mockResolvedValue(undefined);

    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: ANNA, display_name: 'Anna Beispiel' },
      { staff_member_id: TIM, display_name: 'Tim Teamleitung' },
    ]);
    fetchWorkingHours.mockResolvedValue([
      { id: 'a1', staff_member_id: ANNA, weekday: 1, starts_at: '08:00', ends_at: '12:00' },
      { id: 'a2', staff_member_id: ANNA, weekday: 1, starts_at: '13:00', ends_at: '18:00' },
      { id: 't1', staff_member_id: TIM, weekday: 2, starts_at: '10:00', ends_at: '16:00' },
    ]);
    fetchWorkingHourExceptions.mockResolvedValue([]);
    saveWorkingHours.mockResolvedValue(undefined);
    saveWorkingHourException.mockResolvedValue(undefined);
    saveAppointmentGrid.mockResolvedValue(undefined);
  });

  it('heisst wie ihr Menuepunkt (ORG-07)', async () => {
    rendern();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Arbeitszeiten' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Planung' })).not.toBeInTheDocument();
    // Die Praxiseinstellungen sieht nur owner - die Beschreibung nennt sie
    // auch nur dort.
    expect(screen.queryByText(/Praxisraster, Dokumentationsfrist/)).not.toBeInTheDocument();
  });

  it('stellt die Praxiseinstellungen geschlossen unter den Wochenplan (RAH-006)', async () => {
    const user = userEvent.setup();
    rendern(['owner']);
    const wochenplan = await wochenplanAbwarten();

    // Ein Aufklapper in Karte, Kopf als Abschnittstitel, Zusatz rechts; zu
    // beim Oeffnen der Seite. Darin Raster, Frist, Startort, Garage und
    // Fahrzeitfaktor mit ihren bisherigen Formularen.
    const kopf = screen.getByText('Praxiseinstellungen');
    const aufklapper = kopf.closest('details')!;
    expect(aufklapper).not.toBeNull();
    expect(aufklapper.open).toBe(false);
    expect(aufklapper.className).toContain('rounded-card');
    expect(kopf.closest('summary')).toHaveTextContent('Raster · Frist · Startort');
    expect(within(aufklapper).getByLabelText('Minutenraster')).toBeInTheDocument();
    expect(within(aufklapper).getByLabelText('Frist')).toBeInTheDocument();
    expect(within(aufklapper).getByRole('heading', { name: 'Praxisraster' })).toBeInTheDocument();
    // Unter dem Wochenplan, nicht mehr darueber.
    expect(
      wochenplan.compareDocumentPosition(aufklapper) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(kopf);
    expect(aufklapper.open).toBe(true);
  });

  it('zeigt anderen Rollen keine Praxiseinstellungen', async () => {
    rendern(['office']);
    await wochenplanAbwarten();
    expect(screen.queryByText('Praxiseinstellungen')).not.toBeInTheDocument();
  });

  describe('Praxisraster', () => {
    it('bietet owner die drei zulaessigen Werte an', async () => {
      rendern(['owner']);
      const auswahl = await screen.findByLabelText('Minutenraster');
      const werte = Array.from(auswahl.querySelectorAll('option')).map((o) => o.textContent);
      expect(werte).toEqual(['5 Minuten', '10 Minuten', '15 Minuten']);
    });

    it('zeigt den aktuellen Wert der Praxis', async () => {
      rendern(['owner']);
      expect(await screen.findByLabelText('Minutenraster')).toHaveValue('5');
    });

    it('speichert den gewaehlten Wert', async () => {
      const user = userEvent.setup();
      rendern(['owner']);
      await screen.findByLabelText('Minutenraster');

      await user.selectOptions(screen.getByLabelText('Minutenraster'), '15');
      await user.click(screen.getByRole('button', { name: 'Raster speichern' }));

      await waitFor(() => expect(saveAppointmentGrid).toHaveBeenCalledWith(15));
      expect(await screen.findByText('Das Praxisraster ist gespeichert.')).toBeInTheDocument();
    });

    it.each([['therapist'], ['team_lead'], ['office']] as const)(
      'zeigt %s die Rastereinstellung nicht',
      async (rolle) => {
        rendern([rolle]);
        await wochenplanAbwarten();
        expect(screen.queryByLabelText('Minutenraster')).not.toBeInTheDocument();
      },
    );
  });

  describe('Dokumentationsfrist (DOK-004)', () => {
    it('zeigt owner die gespeicherte Frist mit den Stufen', async () => {
      fetchDocumentationDeadline.mockResolvedValue(3);
      rendern(['owner']);

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
      rendern(['owner']);

      const auswahl = await screen.findByLabelText('Frist');
      await waitFor(() => expect(auswahl).toHaveValue('5'));
      expect(auswahl).toHaveTextContent('Ende des 5. Tages nach der Behandlung');
    });

    it('speichert die gewaehlte Frist', async () => {
      const user = userEvent.setup();
      rendern(['owner']);
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
      rendern(['owner']);
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
      rendern(['owner']);

      expect(
        await screen.findByText(/Die Dokumentationsfrist konnte nicht geladen werden/),
      ).toBeInTheDocument();
      const auswahl = screen.getByLabelText('Frist');
      expect(auswahl).toBeDisabled();
      expect(auswahl).toHaveTextContent('Nicht geladen');
      expect(screen.getByRole('button', { name: 'Frist speichern' })).toBeDisabled();
    });

    it.each([['therapist'], ['team_lead'], ['office']] as const)(
      'zeigt %s die Frist nicht und fragt sie nicht ab',
      async (rolle) => {
        rendern([rolle]);
        await wochenplanAbwarten();
        expect(screen.queryByLabelText('Frist')).not.toBeInTheDocument();
        expect(fetchDocumentationDeadline).not.toHaveBeenCalled();
      },
    );
  });

  describe('Wochenplan', () => {
    it('zeigt alle sieben Wochentage der gewaehlten Person', async () => {
      rendern();
      await wochenplanAbwarten();

      for (const tag of [
        'Montag',
        'Dienstag',
        'Mittwoch',
        'Donnerstag',
        'Freitag',
        'Samstag',
        'Sonntag',
      ]) {
        expect(screen.getAllByText(tag).length).toBeGreaterThan(0);
      }
    });

    it('fasst mehrere Bloecke eines Tages zusammen', async () => {
      rendern();
      await wochenplanAbwarten();
      expect(await screen.findByText('08:00–12:00, 13:00–18:00')).toBeInTheDocument();
    });

    it('zeigt einen Tag ohne Arbeitszeit als solchen und nicht als Luecke', async () => {
      rendern();
      await wochenplanAbwarten();
      // Sechs Tage ohne Eintrag bei Anna.
      expect(screen.getAllByText('—')).toHaveLength(6);
    });

    it('wechselt mit der Person auch die angezeigten Zeiten', async () => {
      const user = userEvent.setup();
      rendern();
      await screen.findByText('08:00–12:00, 13:00–18:00');

      await user.selectOptions(screen.getByLabelText('Behandelnde Person'), TIM);

      expect(await screen.findByText('10:00–16:00')).toBeInTheDocument();
      expect(screen.queryByText('08:00–12:00, 13:00–18:00')).not.toBeInTheDocument();
    });

    it('speichert die Bloecke eines Wochentags vollstaendig und bestaetigt es', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));

      await waitFor(() =>
        expect(saveWorkingHours).toHaveBeenCalledWith(ANNA, 1, [
          { von: '08:00', bis: '12:00' },
          { von: '13:00', bis: '18:00' },
        ]),
      );
      expect(await screen.findByText('Der Montag ist gespeichert.')).toBeInTheDocument();
    });

    it('bestaetigt das Speichern auch, wenn das Nachladen einen geaenderten Stand bringt (ORG-04)', async () => {
      // Bis UXR-011 setzte ein Effekt auf die geladenen Zeiten die Meldung
      // zurueck - sie erschien nur, wenn sich nichts geaendert hatte.
      const user = userEvent.setup();
      fetchWorkingHours
        .mockResolvedValueOnce([
          { id: 'a1', staff_member_id: ANNA, weekday: 1, starts_at: '08:00', ends_at: '12:00' },
        ])
        .mockResolvedValue([
          { id: 'a9', staff_member_id: ANNA, weekday: 1, starts_at: '09:00', ends_at: '12:00' },
        ]);
      rendern();
      await wochenplanAbwarten();

      const beginn = screen.getByLabelText('Block 1 von');
      await user.clear(beginn);
      await user.type(beginn, '09:00');
      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));

      await waitFor(() =>
        expect(saveWorkingHours).toHaveBeenCalledWith(ANNA, 1, [{ von: '09:00', bis: '12:00' }]),
      );
      // Das Nachladen liefert den neuen Stand ...
      await waitFor(() => expect(fetchWorkingHours).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('09:00–12:00')).toBeInTheDocument();
      // ... und die Bestaetigung steht trotzdem da.
      expect(screen.getByText('Der Montag ist gespeichert.')).toBeInTheDocument();
    });

    it('speichert einen geleerten Wochentag erst nach der Rueckfrage als "keine Termine" (ORG-02)', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.click(screen.getByRole('button', { name: 'Blöcke leeren' }));
      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));

      // Der Montag hatte Bloecke - geleert wird er nicht mit einem Tipp.
      const frage = screen.getByRole('group', { name: 'Montag ohne Arbeitszeit speichern' });
      expect(frage).toHaveTextContent('Bisher: 08:00–12:00, 13:00–18:00');
      expect(saveWorkingHours).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Ohne Arbeitszeit speichern' }));

      await waitFor(() => expect(saveWorkingHours).toHaveBeenCalledWith(ANNA, 1, []));
      expect(
        await screen.findByText('Der Montag ist ohne Arbeitszeit gespeichert.'),
      ).toBeInTheDocument();
    });

    it('meldet ueberschneidende Bloecke verstaendlich', async () => {
      saveWorkingHours.mockRejectedValue(
        new Error('Die Zeitblöcke überschneiden sich. Bitte die Zeiten anpassen.'),
      );
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));
      expect(await screen.findByText(/überschneiden sich/)).toBeInTheDocument();
      expect(screen.queryByText('Der Montag ist gespeichert.')).not.toBeInTheDocument();
    });

    it('laesst therapist lesen, aber nicht pflegen', async () => {
      rendern(['therapist']);
      await wochenplanAbwarten();

      // Die Zeiten sind sichtbar ...
      expect(await screen.findByText('08:00–12:00, 13:00–18:00')).toBeInTheDocument();
      // ... die Pflege nicht.
      expect(screen.queryByRole('button', { name: /speichern/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /bearbeiten/ })).not.toBeInTheDocument();
      expect(screen.getByText(/fehlt Ihrem Zugang die Berechtigung/)).toBeInTheDocument();
    });

    it('waehlt die eigene Person vor, wenn sie selbst behandelt (ORG-30)', async () => {
      rendern(['therapist', 'team_lead'], 'Tim Teamleitung');
      await wochenplanAbwarten();

      expect(screen.getByLabelText('Behandelnde Person')).toHaveValue(TIM);
      expect(await screen.findByText('10:00–16:00')).toBeInTheDocument();
    });

    it('sagt ohne behandelnde Person, woran es liegt (ORG-30)', async () => {
      fetchAssignableTherapists.mockResolvedValue([]);
      rendern(['owner']);

      expect(await screen.findByText('Noch keine behandelnde Person')).toBeInTheDocument();
      expect(screen.getByText(/Rolle Therapeut:in oder Teamleitung/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Zu den Mitarbeitenden' })).toHaveAttribute(
        'href',
        '/praxis/team',
      );
    });

    it('bietet bei einem Ladefehler einen neuen Versuch an', async () => {
      const user = userEvent.setup();
      fetchWorkingHours.mockRejectedValueOnce(new Error('kaputt'));
      rendern();

      expect(
        await screen.findByText('Die Arbeitszeiten konnten nicht geladen werden.'),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

      expect(await screen.findByText('08:00–12:00, 13:00–18:00')).toBeInTheDocument();
    });

    it('laesst den Plan stehen, wenn nach dem Speichern das Nachladen scheitert (ZST-03)', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();
      fetchWorkingHours.mockRejectedValue(new Error('Funkloch'));

      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));

      expect(
        await screen.findByText(/Der angezeigte Stand konnte nicht aktualisiert werden/),
      ).toBeInTheDocument();
      expect(screen.getByText('Der Montag ist gespeichert.')).toBeInTheDocument();
      expect(screen.getByLabelText('Block 1 von')).toHaveValue('08:00');
      expect(
        screen.queryByText('Die Arbeitszeiten konnten nicht geladen werden.'),
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // ORG-02: halb ausgefüllte Blöcke verschwinden nicht still
  // ---------------------------------------------------------------------------
  describe('Halb ausgefuellte Bloecke (ORG-02)', () => {
    it('speichert einen Block ohne Ende nicht und sagt es am Feld', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      // Samstag ist leer; nur „von" wird eingetragen.
      await user.selectOptions(screen.getByLabelText('Wochentag'), '6');
      await user.type(screen.getByLabelText('Block 1 von'), '08:00');
      await user.click(screen.getByRole('button', { name: 'Samstag speichern' }));

      expect(saveWorkingHours).not.toHaveBeenCalled();
      expect(screen.getByText('Bitte das Ende eintragen.')).toBeInTheDocument();
      expect(screen.getByLabelText('Block 1 bis')).toHaveFocus();
      expect(screen.getByLabelText('Block 1 bis')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByText('Der Samstag ist gespeichert.')).not.toBeInTheDocument();
    });

    it('wirft einen halben zweiten Block nicht still weg', async () => {
      // Bis UXR-011 ging nur Block 1 hinaus - 13 bis 18 Uhr fiel weg, und die
      // Seite meldete „gespeichert".
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.clear(screen.getByLabelText('Block 2 bis'));
      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));

      expect(saveWorkingHours).not.toHaveBeenCalled();
      expect(screen.getByText('Bitte das Ende eintragen.')).toBeInTheDocument();

      // Ist der Block wieder vollstaendig, verschwindet der Hinweis.
      await user.type(screen.getByLabelText('Block 2 bis'), '17:00');
      expect(screen.queryByText('Bitte das Ende eintragen.')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));
      await waitFor(() =>
        expect(saveWorkingHours).toHaveBeenCalledWith(ANNA, 1, [
          { von: '08:00', bis: '12:00' },
          { von: '13:00', bis: '17:00' },
        ]),
      );
    });

    it('meldet einen Block ohne Beginn am Feld "von"', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.clear(screen.getByLabelText('Block 1 von'));
      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));

      expect(saveWorkingHours).not.toHaveBeenCalled();
      expect(screen.getByText('Bitte den Beginn eintragen.')).toBeInTheDocument();
      expect(screen.getByLabelText('Block 1 von')).toHaveFocus();
    });

    it('entfernt einen einzelnen Block (ORG-05)', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.click(screen.getByRole('button', { name: 'Block 2 entfernen' }));
      expect(screen.queryByLabelText('Block 2 von')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Montag speichern' }));

      await waitFor(() =>
        expect(saveWorkingHours).toHaveBeenCalledWith(ANNA, 1, [{ von: '08:00', bis: '12:00' }]),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // ORG-03: ein Wechsel verwirft nichts ohne Rückfrage
  // ---------------------------------------------------------------------------
  describe('Ungespeicherte Bloecke (ORG-03)', () => {
    it('fragt vor dem Tageswechsel und behaelt die Eingabe beim Bleiben', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      const beginn = screen.getByLabelText('Block 1 von');
      await user.clear(beginn);
      await user.type(beginn, '07:00');
      await user.selectOptions(screen.getByLabelText('Wochentag'), '2');

      const frage = screen.getByRole('group', { name: 'Ungespeicherte Arbeitszeiten' });
      expect(frage).toHaveTextContent('Die Änderungen am Montag sind noch nicht gespeichert');
      expect(screen.getByLabelText('Wochentag')).toHaveValue('1');

      await user.click(within(frage).getByRole('button', { name: 'Hier bleiben' }));
      expect(screen.getByLabelText('Block 1 von')).toHaveValue('07:00');
      expect(screen.getByLabelText('Wochentag')).toHaveFocus();
    });

    it('wechselt nach „Verwerfen und wechseln" und verwirft die Eingabe', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      const beginn = screen.getByLabelText('Block 1 von');
      await user.clear(beginn);
      await user.type(beginn, '07:00');
      // Der Weg ueber die Zeile der Uebersicht fragt genauso (ORG-05).
      await user.click(
        within(tageszeile('Dienstag')).getByRole('button', { name: 'Dienstag bearbeiten' }),
      );

      await user.click(screen.getByRole('button', { name: 'Verwerfen und wechseln' }));
      expect(screen.getByLabelText('Wochentag')).toHaveValue('2');

      // Zurueck am Montag steht wieder der gespeicherte Stand.
      await user.selectOptions(screen.getByLabelText('Wochentag'), '1');
      expect(screen.getByLabelText('Block 1 von')).toHaveValue('08:00');
      expect(saveWorkingHours).not.toHaveBeenCalled();
    });

    it('wechselt ohne Eingabe ohne Rueckfrage in den Tag der Zeile (ORG-05)', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.click(
        within(tageszeile('Freitag')).getByRole('button', { name: 'Freitag bearbeiten' }),
      );

      expect(screen.getByLabelText('Wochentag')).toHaveValue('5');
      expect(within(tageszeile('Freitag')).getByText('Wird bearbeitet')).toBeInTheDocument();
      expect(tageszeile('Freitag')).toHaveAttribute('aria-current', 'true');
      expect(screen.getByRole('button', { name: 'Freitag speichern' })).toBeInTheDocument();
    });

    it('fragt vor dem Personenwechsel', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.clear(screen.getByLabelText('Block 1 von'));
      await user.type(screen.getByLabelText('Block 1 von'), '07:00');
      await user.selectOptions(screen.getByLabelText('Behandelnde Person'), TIM);

      expect(
        screen.getByText(/Arbeitszeiten von Anna Beispiel sind noch nicht gespeichert/),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Behandelnde Person')).toHaveValue(ANNA);

      await user.click(screen.getByRole('button', { name: 'Verwerfen und wechseln' }));
      expect(screen.getByLabelText('Behandelnde Person')).toHaveValue(TIM);
      expect(await screen.findByText('10:00–16:00')).toBeInTheDocument();
    });

    it('haelt einen Seitenwechsel mit ungespeicherten Bloecken an', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MitWegHinaus />, '/praxis/planung');
      await wochenplanAbwarten();

      await user.clear(screen.getByLabelText('Block 1 von'));
      await user.type(screen.getByLabelText('Block 1 von'), '07:00');
      await user.click(screen.getByRole('link', { name: 'Weggehen' }));

      expect(screen.getByText('Adresse: /praxis/planung')).toBeInTheDocument();
      const frage = await screen.findByRole('group', { name: 'Ungespeicherte Arbeitszeiten' });
      expect(frage).toHaveTextContent('Die Eingaben sind noch nicht gespeichert.');
      expect(
        within(frage).getByRole('button', { name: 'Verwerfen und weitergehen' }),
      ).toBeInTheDocument();
      // Ohne Entwurf gibt es nur Verwerfen und Bleiben (ANN-046).
      expect(
        within(frage).queryByRole('button', { name: /Speichern und/ }),
      ).not.toBeInTheDocument();

      await user.click(within(frage).getByRole('button', { name: 'Hier bleiben' }));
      expect(
        screen.queryByRole('group', { name: 'Ungespeicherte Arbeitszeiten' }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Block 1 von')).toHaveValue('07:00');
    });

    it('warnt vor dem Neuladen nur mit ungespeicherten Bloecken', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      const sauber = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(sauber);
      expect(sauber.defaultPrevented).toBe(false);

      await user.clear(screen.getByLabelText('Abweichender Block 1 von'));
      await user.type(screen.getByLabelText('Abweichender Block 1 von'), '18:00');
      const geaendert = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(geaendert);
      expect(geaendert.defaultPrevented).toBe(true);
    });
  });

  describe('Abweichungen an einzelnen Tagen', () => {
    it('speichert eine vollstaendige Abwesenheit ohne Bloecke', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.type(screen.getByLabelText('Datum'), '2027-05-20');
      await user.click(screen.getByLabelText('An diesem Tag keine Termine'));
      await user.click(screen.getByRole('button', { name: 'Abweichung speichern' }));

      await waitFor(() =>
        expect(saveWorkingHourException).toHaveBeenCalledWith(ANNA, '2027-05-20', true, []),
      );
      expect(
        await screen.findByText('Die Abweichung am 20.05.2027 ist gespeichert.'),
      ).toBeInTheDocument();
    });

    it('nutzt fuer "keine Termine" den Baustein mit 44 px Trefferflaeche (ORG-17)', async () => {
      rendern();
      await wochenplanAbwarten();

      const kaestchen = screen.getByLabelText('An diesem Tag keine Termine');
      expect(kaestchen.closest('label')).toHaveClass('min-h-11');
    });

    it('blendet die Zeitfelder aus, wenn der ganze Tag entfaellt', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      expect(screen.getByText('Abweichende Zeitblöcke')).toBeInTheDocument();
      await user.click(screen.getByLabelText('An diesem Tag keine Termine'));
      expect(screen.queryByText('Abweichende Zeitblöcke')).not.toBeInTheDocument();
    });

    it('speichert abweichende Bloecke', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.type(screen.getByLabelText('Datum'), '2027-05-20');
      await user.type(screen.getByLabelText('Abweichender Block 1 von'), '18:00');
      await user.type(screen.getByLabelText('Abweichender Block 1 bis'), '20:00');
      await user.click(screen.getByRole('button', { name: 'Abweichung speichern' }));

      await waitFor(() =>
        expect(saveWorkingHourException).toHaveBeenCalledWith(ANNA, '2027-05-20', false, [
          { von: '18:00', bis: '20:00' },
        ]),
      );
    });

    it('speichert einen halben abweichenden Block nicht (ORG-02)', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.type(screen.getByLabelText('Datum'), '2027-05-20');
      await user.type(screen.getByLabelText('Abweichender Block 1 von'), '18:00');
      await user.click(screen.getByRole('button', { name: 'Abweichung speichern' }));

      expect(saveWorkingHourException).not.toHaveBeenCalled();
      expect(screen.getByText('Bitte das Ende eintragen.')).toBeInTheDocument();
      expect(screen.getByLabelText('Abweichender Block 1 bis')).toHaveFocus();
    });

    it('meldet nichts als gespeichert, wo nichts zu speichern ist (ORG-02)', async () => {
      // Bis UXR-011: ohne Haekchen und Bloecke an einem freien Datum
      // „Die Abweichung ist gespeichert." - der Server tat nichts.
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await user.type(screen.getByLabelText('Datum'), '2027-05-20');

      expect(screen.getByRole('button', { name: 'Abweichung speichern' })).toBeDisabled();
      expect(
        screen.getByText(/Für den 20.05.2027 ist keine Abweichung hinterlegt/),
      ).toBeInTheDocument();
    });

    it('entfernt eine bestehende Abweichung ueber das Formular erst nach Rueckfrage (ORG-02)', async () => {
      const user = userEvent.setup();
      fetchWorkingHourExceptions.mockResolvedValue([
        {
          id: 'x1',
          staff_member_id: ANNA,
          on_date: '2027-06-01',
          kind: 'unavailable',
          starts_at: null,
          ends_at: null,
        },
      ]);
      rendern();
      await screen.findByText('01.06.2027');

      await user.type(screen.getByLabelText('Datum'), '2027-06-01');
      await user.click(screen.getByRole('button', { name: 'Abweichung speichern' }));
      expect(saveWorkingHourException).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Abweichung entfernen' }));
      await waitFor(() =>
        expect(saveWorkingHourException).toHaveBeenCalledWith(ANNA, '2027-06-01', false, []),
      );
      expect(
        await screen.findByText('Die Abweichung am 01.06.2027 ist entfernt.'),
      ).toBeInTheDocument();
    });

    it('unterscheidet die Felder von Wochenplan und Abweichung', async () => {
      // Gleiche Beschriftung auf einer Seite waere fuer Screenreader nicht
      // aufloesbar.
      rendern();
      await wochenplanAbwarten();
      expect(screen.getByLabelText('Block 1 von')).toBeInTheDocument();
      expect(screen.getByLabelText('Abweichender Block 1 von')).toBeInTheDocument();
    });

    it('speichert nicht ohne Datum', async () => {
      rendern();
      await wochenplanAbwarten();
      expect(screen.getByRole('button', { name: 'Abweichung speichern' })).toBeDisabled();
    });

    it('begrenzt das Datum auf das Fenster der Liste (ORG-05)', async () => {
      rendern();
      await wochenplanAbwarten();
      const datum = screen.getByLabelText('Datum');
      expect(datum).toHaveAttribute('min', '2027-05-12');
      expect(datum).toHaveAttribute('max', '2028-05-12');
    });

    it('zeigt eine hinterlegte Abwesenheit', async () => {
      fetchWorkingHourExceptions.mockResolvedValue([
        {
          id: 'x1',
          staff_member_id: ANNA,
          on_date: '2027-06-01',
          kind: 'unavailable',
          starts_at: null,
          ends_at: null,
        },
      ]);
      rendern();
      await wochenplanAbwarten();

      // Als Datum der Oberflaeche, nicht im Format der Datenbank (ORG-28).
      expect(await screen.findByText('01.06.2027')).toBeInTheDocument();
      expect(screen.queryByText('2027-06-01')).not.toBeInTheDocument();
      expect(screen.getByText('Keine Termine')).toBeInTheDocument();
    });

    it('fasst zwei Bloecke eines Datums in einer Zeile zusammen (ORG-05)', async () => {
      fetchWorkingHourExceptions.mockResolvedValue([
        {
          id: 'x1',
          staff_member_id: ANNA,
          on_date: '2027-06-01',
          kind: 'block',
          starts_at: '08:00',
          ends_at: '11:00',
        },
        {
          id: 'x2',
          staff_member_id: ANNA,
          on_date: '2027-06-01',
          kind: 'block',
          starts_at: '14:00',
          ends_at: '16:00',
        },
      ]);
      rendern();
      await wochenplanAbwarten();

      expect(await screen.findByText('08:00–11:00, 14:00–16:00')).toBeInTheDocument();
      expect(screen.getAllByText('01.06.2027')).toHaveLength(1);
    });

    it('laedt eine Abweichung zum Aendern ins Formular (ORG-05)', async () => {
      const user = userEvent.setup();
      fetchWorkingHourExceptions.mockResolvedValue([
        {
          id: 'x1',
          staff_member_id: ANNA,
          on_date: '2027-06-01',
          kind: 'block',
          starts_at: '08:00',
          ends_at: '11:00',
        },
      ]);
      rendern();
      const gruppe = await screen.findByRole('group', { name: 'Abweichung am 01.06.2027' });

      await user.click(within(gruppe).getByRole('button', { name: 'Ändern' }));

      expect(screen.getByLabelText('Datum')).toHaveValue('2027-06-01');
      expect(screen.getByLabelText('Abweichender Block 1 von')).toHaveValue('08:00');
      expect(screen.getByLabelText('Abweichender Block 1 bis')).toHaveValue('11:00');
      expect(screen.getByRole('group', { name: 'Abweichung eintragen' })).toHaveFocus();
    });

    it('entfernt eine Abweichung aus der Liste erst nach Rueckfrage (ORG-05)', async () => {
      const user = userEvent.setup();
      fetchWorkingHourExceptions.mockResolvedValue([
        {
          id: 'x1',
          staff_member_id: ANNA,
          on_date: '2027-06-01',
          kind: 'unavailable',
          starts_at: null,
          ends_at: null,
        },
      ]);
      rendern();
      const gruppe = await screen.findByRole('group', { name: 'Abweichung am 01.06.2027' });

      await user.click(within(gruppe).getByRole('button', { name: 'Entfernen' }));
      expect(saveWorkingHourException).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Abweichung entfernen' }));

      // Dieselbe Serverfunktion, leere Bloecke.
      await waitFor(() =>
        expect(saveWorkingHourException).toHaveBeenCalledWith(ANNA, '2027-06-01', false, []),
      );
      expect(
        await screen.findByText('Die Abweichung am 01.06.2027 ist entfernt.'),
      ).toBeInTheDocument();
    });

    it('zeigt nur die Abweichungen der gewaehlten Person', async () => {
      fetchWorkingHourExceptions.mockResolvedValue([
        {
          id: 'x2',
          staff_member_id: TIM,
          on_date: '2027-06-02',
          kind: 'unavailable',
          starts_at: null,
          ends_at: null,
        },
      ]);
      rendern();
      await wochenplanAbwarten();

      expect(await screen.findByText(/keine Abweichung hinterlegt/)).toBeInTheDocument();
      expect(screen.queryByText('02.06.2027')).not.toBeInTheDocument();
    });

    it('meldet einen Ladefehler als Fehler und nicht als "keine Abweichung" (ORG-14)', async () => {
      const user = userEvent.setup();
      fetchWorkingHourExceptions.mockRejectedValueOnce(new Error('kaputt'));
      rendern();
      await wochenplanAbwarten();

      expect(
        await screen.findByText('Die Abweichungen konnten nicht geladen werden.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/keine Abweichung hinterlegt/)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
      expect(await screen.findByText(/keine Abweichung hinterlegt/)).toBeInTheDocument();
    });
  });

  it('nennt die Zeitzone und grenzt gegen Arbeitszeiterfassung ab', async () => {
    rendern();
    await wochenplanAbwarten();
    expect(screen.getByText(/Europe\/Berlin/)).toBeInTheDocument();
    expect(screen.getByText(/keine Arbeitszeiterfassung/)).toBeInTheDocument();
  });
});
