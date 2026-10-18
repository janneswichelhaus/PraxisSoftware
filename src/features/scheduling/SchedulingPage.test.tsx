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
const saveWorkingWeek = vi.fn();
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
    saveWorkingWeek: (staff: string, tage: unknown) =>
      saveWorkingWeek(staff, tage) as Promise<void>,
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

const { ArbeitszeitJePerson } = await import('./SchedulingPage');

function rendern(rollen: Parameters<typeof testUser>[0] = ['office'], anzeigename?: string) {
  return renderWithProviders(
    <ArbeitszeitJePerson user={testUser(rollen, anzeigename)} />,
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

/** Öffnet einen Wochentag über „Bearbeiten“ in seiner Zeile (Wochenplan in einem Zug). */
async function bearbeiten(user: ReturnType<typeof userEvent.setup>, tag: string) {
  await user.click(within(tageszeile(tag)).getByRole('button', { name: `${tag} bearbeiten` }));
}

/** Eine Prüfseite mit einem Weg nach draußen, um den Schutz zu sehen. */
function MitWegHinaus() {
  const { pathname } = useLocation();
  return (
    <>
      <p>Adresse: {pathname}</p>
      <Link to="/woanders">Weggehen</Link>
      <ArbeitszeitJePerson user={testUser(['office'])} />
    </>
  );
}

describe('ArbeitszeitJePerson (ORG-003)', () => {
  beforeEach(() => {
    fetchWorkingHours.mockReset();
    fetchWorkingHourExceptions.mockReset();
    saveWorkingWeek.mockReset();
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
    saveWorkingWeek.mockResolvedValue(undefined);
    saveWorkingHourException.mockResolvedValue(undefined);
    saveAppointmentGrid.mockResolvedValue(undefined);
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

      await user.selectOptions(screen.getByLabelText('Person'), TIM);

      expect(await screen.findByText('10:00–16:00')).toBeInTheDocument();
      expect(screen.queryByText('08:00–12:00, 13:00–18:00')).not.toBeInTheDocument();
    });

    it('speichert die geänderten Wochentage in einem Zug und bestätigt es', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      // Ohne geöffneten Tag gibt es nichts zu speichern.
      expect(screen.queryByRole('button', { name: 'Wochenplan speichern' })).toBeNull();

      await bearbeiten(user, 'Montag');
      const beginn = screen.getByLabelText('Montag, Block 1 von');
      await user.clear(beginn);
      await user.type(beginn, '07:00');
      await bearbeiten(user, 'Mittwoch');
      await user.type(screen.getByLabelText('Mittwoch, Block 1 von'), '09:00');
      await user.type(screen.getByLabelText('Mittwoch, Block 1 bis'), '13:00');
      // Ein geöffneter, aber unveränderter Tag geht nicht mit hinaus.
      await bearbeiten(user, 'Freitag');

      expect(within(tageszeile('Montag')).getByText('Nicht gespeichert')).toBeInTheDocument();
      expect(within(tageszeile('Mittwoch')).getByText('09:00–13:00')).toBeInTheDocument();
      expect(within(tageszeile('Freitag')).queryByText('Nicht gespeichert')).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Wochenplan speichern' }));

      await waitFor(() =>
        expect(saveWorkingWeek).toHaveBeenCalledWith(ANNA, [
          {
            tag: 1,
            bloecke: [
              { von: '07:00', bis: '12:00' },
              { von: '13:00', bis: '18:00' },
            ],
          },
          { tag: 3, bloecke: [{ von: '09:00', bis: '13:00' }] },
        ]),
      );
      expect(saveWorkingWeek).toHaveBeenCalledTimes(1);
      expect(
        await screen.findByText('Wochenplan gespeichert: Montag und Mittwoch.'),
      ).toBeInTheDocument();
      // Gespeicherte Tage schließen sich wieder.
      expect(screen.queryByLabelText('Montag, Block 1 von')).toBeNull();
      expect(screen.queryByLabelText('Mittwoch, Block 1 von')).toBeNull();
    });

    it('verwirft die Änderungen aller geöffneten Tage und schließt sie (Design-Review)', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await bearbeiten(user, 'Montag');
      await user.clear(screen.getByLabelText('Montag, Block 1 von'));
      await user.type(screen.getByLabelText('Montag, Block 1 von'), '07:00');
      await bearbeiten(user, 'Dienstag');
      await user.click(screen.getByRole('button', { name: 'Änderungen verwerfen' }));

      expect(screen.queryByLabelText('Montag, Block 1 von')).toBeNull();
      expect(screen.queryByLabelText('Dienstag, Block 1 von')).toBeNull();
      expect(
        within(tageszeile('Montag')).getByText('08:00–12:00, 13:00–18:00'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Wochenplan speichern' })).toBeNull();
      expect(saveWorkingWeek).not.toHaveBeenCalled();
    });

    it('schließt einen unveränderten Tag wieder', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();
      await bearbeiten(user, 'Freitag');
      await user.click(screen.getByRole('button', { name: 'Schließen' }));
      expect(screen.queryByLabelText('Freitag, Block 1 von')).toBeNull();
    });

    it('lässt das Speichern gesperrt, solange nichts geändert ist', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await bearbeiten(user, 'Dienstag');
      expect(screen.getByRole('button', { name: 'Wochenplan speichern' })).toBeDisabled();
      expect(
        within(tageszeile('Dienstag')).queryByRole('button', { name: /bearbeiten/ }),
      ).toBeNull();
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

      await bearbeiten(user, 'Montag');
      const beginn = screen.getByLabelText('Montag, Block 1 von');
      await user.clear(beginn);
      await user.type(beginn, '09:00');
      await user.click(screen.getByRole('button', { name: 'Wochenplan speichern' }));

      await waitFor(() =>
        expect(saveWorkingWeek).toHaveBeenCalledWith(ANNA, [
          { tag: 1, bloecke: [{ von: '09:00', bis: '12:00' }] },
        ]),
      );
      // Das Nachladen liefert den neuen Stand ...
      await waitFor(() => expect(fetchWorkingHours).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('09:00–12:00')).toBeInTheDocument();
      // ... und die Bestaetigung steht trotzdem da.
      expect(screen.getByText('Wochenplan gespeichert: Montag.')).toBeInTheDocument();
    });

    it('beschriftet von und bis kurz und liest Tag, Block und Nummer vor (ANN-489, Design-Review T6)', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();
      await bearbeiten(user, 'Montag');

      const beginn = screen.getByLabelText('Montag, Block 1 von');
      // Sichtbar steht nur „von“ - die lange Beschriftung brach am Telefon um.
      const sichtbar = document.querySelector(`label[for="${beginn.id}"]`);
      expect(sichtbar).toHaveTextContent(/^von$/);
      expect(beginn).toHaveAccessibleName('Montag, Block 1 von');
      expect(screen.getByLabelText('Montag, Block 1 bis')).toHaveAccessibleName(
        'Montag, Block 1 bis',
      );
      // Nebeneinander erst ab 640 px (DESIGN.md, Formular): am Telefon „bis“
      // unter „von“, das Entfernen neben „von“; ab `sm:` eine Zeile.
      const block = beginn.closest('[data-testid="zeitblock"]');
      expect(block).toHaveClass(
        'grid-cols-[minmax(0,1fr)_auto]',
        'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]',
      );
      expect(screen.getByLabelText('Montag, Block 1 bis').closest('.row-start-2')).toHaveClass(
        'col-start-1',
        'sm:col-start-2',
        'sm:row-start-1',
      );
      expect(
        within(block as HTMLElement).getByRole('button', { name: 'Montag, Block 1 entfernen' })
          .parentElement,
      ).toHaveClass('col-start-2', 'row-start-1', 'sm:col-start-3');
    });

    it('speichert einen geleerten Wochentag erst nach der Rueckfrage als "keine Termine" (ORG-02)', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();
      await bearbeiten(user, 'Montag');

      // Geleert wird ein Tag, indem man seine Bloecke entfernt (seit dem
      // Design-Rollout B2 ohne eigenen Knopf „Blöcke leeren“).
      await user.click(screen.getByRole('button', { name: 'Montag, Block 2 entfernen' }));
      await user.click(screen.getByRole('button', { name: 'Montag, Block 1 entfernen' }));
      await user.click(screen.getByRole('button', { name: 'Wochenplan speichern' }));

      // Der Montag hatte Bloecke - geleert wird er nicht mit einem Tipp.
      const frage = screen.getByRole('group', { name: 'Montag ohne Arbeitszeit speichern' });
      expect(frage).toHaveTextContent('Montag ohne Arbeitszeit speichern?');
      expect(saveWorkingWeek).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Ohne Arbeitszeit speichern' }));

      await waitFor(() =>
        expect(saveWorkingWeek).toHaveBeenCalledWith(ANNA, [{ tag: 1, bloecke: [] }]),
      );
      expect(await screen.findByText('Wochenplan gespeichert: Montag.')).toBeInTheDocument();
    });

    it('meldet ueberschneidende Bloecke verstaendlich und mit dem Tag', async () => {
      saveWorkingWeek.mockRejectedValue(
        new Error('Montag: Die Zeitblöcke überschneiden sich. Bitte die Zeiten anpassen.'),
      );
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();
      await bearbeiten(user, 'Montag');

      await user.clear(screen.getByLabelText('Montag, Block 2 von'));
      await user.type(screen.getByLabelText('Montag, Block 2 von'), '11:00');
      await user.click(screen.getByRole('button', { name: 'Wochenplan speichern' }));
      expect(
        await screen.findByText(/Montag: Die Zeitblöcke überschneiden sich/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Wochenplan gespeichert/)).not.toBeInTheDocument();
      // Die Eingabe bleibt stehen.
      expect(screen.getByLabelText('Montag, Block 2 von')).toHaveValue('11:00');
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

      expect(screen.getByLabelText('Person')).toHaveValue(TIM);
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

      await bearbeiten(user, 'Montag');
      await user.clear(screen.getByLabelText('Montag, Block 1 von'));
      await user.type(screen.getByLabelText('Montag, Block 1 von'), '07:30');
      await user.click(screen.getByRole('button', { name: 'Wochenplan speichern' }));

      expect(
        await screen.findByText(/Der angezeigte Stand konnte nicht aktualisiert werden/),
      ).toBeInTheDocument();
      expect(screen.getByText('Wochenplan gespeichert: Montag.')).toBeInTheDocument();
      // Es gilt, was der Server bestätigt hat.
      expect(
        within(tageszeile('Montag')).getByText('07:30–12:00, 13:00–18:00'),
      ).toBeInTheDocument();
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
      await bearbeiten(user, 'Samstag');
      await user.type(screen.getByLabelText('Samstag, Block 1 von'), '08:00');
      await user.click(screen.getByRole('button', { name: 'Wochenplan speichern' }));

      expect(saveWorkingWeek).not.toHaveBeenCalled();
      expect(screen.getByText('Bitte das Ende eintragen.')).toBeInTheDocument();
      expect(screen.getByLabelText('Samstag, Block 1 bis')).toHaveFocus();
      expect(screen.getByLabelText('Samstag, Block 1 bis')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByText(/Wochenplan gespeichert/)).not.toBeInTheDocument();
    });

    it('speichert keinen Tag, solange ein anderer einen halben Block hat', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await bearbeiten(user, 'Dienstag');
      await user.type(screen.getByLabelText('Dienstag, Block 1 von'), '08:00');
      await user.type(screen.getByLabelText('Dienstag, Block 1 bis'), '12:00');
      await bearbeiten(user, 'Samstag');
      await user.type(screen.getByLabelText('Samstag, Block 1 von'), '08:00');
      await user.click(screen.getByRole('button', { name: 'Wochenplan speichern' }));

      expect(saveWorkingWeek).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Samstag, Block 1 bis')).toHaveFocus();
    });

    it('wirft einen halben zweiten Block nicht still weg', async () => {
      // Bis UXR-011 ging nur Block 1 hinaus - 13 bis 18 Uhr fiel weg, und die
      // Seite meldete „gespeichert".
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();
      await bearbeiten(user, 'Montag');

      await user.clear(screen.getByLabelText('Montag, Block 2 bis'));
      await user.click(screen.getByRole('button', { name: 'Wochenplan speichern' }));

      expect(saveWorkingWeek).not.toHaveBeenCalled();
      expect(screen.getByText('Bitte das Ende eintragen.')).toBeInTheDocument();

      // Ist der Block wieder vollstaendig, verschwindet der Hinweis.
      await user.type(screen.getByLabelText('Montag, Block 2 bis'), '17:00');
      expect(screen.queryByText('Bitte das Ende eintragen.')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Wochenplan speichern' }));
      await waitFor(() =>
        expect(saveWorkingWeek).toHaveBeenCalledWith(ANNA, [
          {
            tag: 1,
            bloecke: [
              { von: '08:00', bis: '12:00' },
              { von: '13:00', bis: '17:00' },
            ],
          },
        ]),
      );
    });

    it('meldet einen Block ohne Beginn am Feld "von"', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();
      await bearbeiten(user, 'Montag');

      await user.clear(screen.getByLabelText('Montag, Block 1 von'));
      await user.click(screen.getByRole('button', { name: 'Wochenplan speichern' }));

      expect(saveWorkingWeek).not.toHaveBeenCalled();
      expect(screen.getByText('Bitte den Beginn eintragen.')).toBeInTheDocument();
      expect(screen.getByLabelText('Montag, Block 1 von')).toHaveFocus();
    });

    it('entfernt einen einzelnen Block (ORG-05)', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();
      await bearbeiten(user, 'Montag');

      await user.click(screen.getByRole('button', { name: 'Montag, Block 2 entfernen' }));
      expect(screen.queryByLabelText('Montag, Block 2 von')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Wochenplan speichern' }));

      await waitFor(() =>
        expect(saveWorkingWeek).toHaveBeenCalledWith(ANNA, [
          { tag: 1, bloecke: [{ von: '08:00', bis: '12:00' }] },
        ]),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // ORG-03: ein Wechsel verwirft nichts ohne Rückfrage
  // ---------------------------------------------------------------------------
  describe('Ungespeicherte Bloecke (ORG-03)', () => {
    it('hält mehrere Tage zugleich offen und behält jede Eingabe (ORG-03)', async () => {
      // Bis zum Wochenplan in einem Zug galt ein Tag zur Zeit; ein Wechsel
      // fragte, ob die Eingabe verworfen werden soll. Jetzt bleibt jeder
      // geöffnete Tag mit seiner Eingabe stehen, bis er gespeichert ist.
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await bearbeiten(user, 'Montag');
      await user.clear(screen.getByLabelText('Montag, Block 1 von'));
      await user.type(screen.getByLabelText('Montag, Block 1 von'), '07:00');
      await bearbeiten(user, 'Dienstag');

      expect(screen.getByLabelText('Montag, Block 1 von')).toHaveValue('07:00');
      expect(screen.getByLabelText('Dienstag, Block 1 von')).toHaveValue('');
      expect(screen.queryByRole('group', { name: 'Ungespeicherte Arbeitszeiten' })).toBeNull();
      expect(saveWorkingWeek).not.toHaveBeenCalled();
    });

    it('öffnet den Tag der Zeile unter ihr (ORG-05)', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await bearbeiten(user, 'Freitag');

      const zeile = tageszeile('Freitag');
      expect(
        within(zeile).getByRole('group', { name: 'Zeitblöcke am Freitag' }),
      ).toBeInTheDocument();
      expect(within(zeile).queryByRole('button', { name: 'Freitag bearbeiten' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Wochenplan speichern' })).toBeInTheDocument();
    });

    it('fragt vor dem Personenwechsel', async () => {
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();

      await bearbeiten(user, 'Montag');
      await user.clear(screen.getByLabelText('Montag, Block 1 von'));
      await user.type(screen.getByLabelText('Montag, Block 1 von'), '07:00');
      await user.selectOptions(screen.getByLabelText('Person'), TIM);

      expect(
        screen.getByText(/Arbeitszeiten von Anna Beispiel sind noch nicht gespeichert/),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Person')).toHaveValue(ANNA);

      await user.click(screen.getByRole('button', { name: 'Verwerfen und wechseln' }));
      expect(screen.getByLabelText('Person')).toHaveValue(TIM);
      expect(await screen.findByText('10:00–16:00')).toBeInTheDocument();
    });

    it('haelt einen Seitenwechsel mit ungespeicherten Bloecken an', async () => {
      const user = userEvent.setup();
      renderWithProviders(<MitWegHinaus />, '/praxis/planung');
      await wochenplanAbwarten();

      await bearbeiten(user, 'Montag');
      await user.clear(screen.getByLabelText('Montag, Block 1 von'));
      await user.type(screen.getByLabelText('Montag, Block 1 von'), '07:00');
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
      expect(screen.getByLabelText('Montag, Block 1 von')).toHaveValue('07:00');
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
      const user = userEvent.setup();
      rendern();
      await wochenplanAbwarten();
      await bearbeiten(user, 'Montag');
      expect(screen.getByLabelText('Montag, Block 1 von')).toBeInTheDocument();
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
      // Die Rückfrage steht in einem Fenster - die Zeile ist zu schmal dafür.
      const fenster = screen.getByRole('dialog', { name: 'Abweichung am 01.06.2027 entfernen' });
      await user.click(within(fenster).getByRole('button', { name: 'Abweichung entfernen' }));

      // Dieselbe Serverfunktion, leere Bloecke.
      await waitFor(() =>
        expect(saveWorkingHourException).toHaveBeenCalledWith(ANNA, '2027-06-01', false, []),
      );
      const bestaetigung = await screen.findByText('Die Abweichung am 01.06.2027 ist entfernt.');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // Die Bestätigung nimmt den Fokus, nicht der Knopf hinter dem Fenster.
      await waitFor(() => expect(bestaetigung.closest('[tabindex="-1"]')).toHaveFocus());
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

  it('zeigt ohne Rückweg in der Adresse keinen', async () => {
    rendern();
    await wochenplanAbwarten();
    expect(screen.queryByRole('link', { name: /^← Zurück/ })).toBeNull();
  });
});
