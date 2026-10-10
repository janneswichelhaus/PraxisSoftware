import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusManager } from '@tanstack/react-query';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as LageApi from '@/features/appointments/abrechnungslage-api';
import type * as DokumentationApi from './api';
import type * as Bausteine from './textbausteine';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const NOTE_ID = '88888888-8888-4888-8888-000000000001';

const termin = testAppointment({
  id: TERMIN_ID,
  location_id: null,
  appointment_type: 'home_visit',
  visit_street: 'Beispielstrasse',
  visit_house_number: '12',
  visit_postal_code: '72070',
  visit_city: 'Tuebingen',
  patient_given_name: 'Max',
  patient_family_name: 'Mustermann',
  location_name: null,
});

const entwurf: DokumentationApi.TreatmentNote = {
  id: NOTE_ID,
  appointment_id: TERMIN_ID,
  addendum_to_note_id: null,
  status: 'draft',
  content: 'Bereits geschriebener Entwurf',
  visit_without_treatment: false,
  created_at: '2027-05-12T08:00:00.000Z',
  updated_at: '2027-05-12T08:05:00.000000+00',
  finalized_at: null,
  finalisation_kind: null,
  version_count: 0,
  author_name: 'Anna Beispiel',
  last_editor_name: 'Anna Beispiel',
  finalized_by_name: null,
};

const fetchAppointment = vi.fn();
const fetchTreatmentDocumentation = vi.fn();
const completeTreatment = vi.fn();
const createTreatmentNote = vi.fn();
const updateTreatmentNote = vi.fn();
const navigate = vi.fn();
const fetchTextSnippets = vi.fn();
const fetchAbrechnungslage = vi.fn();
const fetchPatientTreatmentNotesPage = vi.fn();
const fetchBefundangaben = vi.fn();
const befundangabenSichern = vi.fn();

vi.mock('@/features/appointments/abrechnungslage-api', async (importOriginal) => ({
  ...(await importOriginal<typeof LageApi>()),
  fetchAbrechnungslage: (id: string) =>
    fetchAbrechnungslage(id) as Promise<LageApi.Abrechnungslage | null>,
}));

vi.mock('./textbausteine', async (importOriginal) => {
  const actual = await importOriginal<typeof Bausteine>();
  return {
    ...actual,
    fetchTextSnippets: () => fetchTextSnippets() as Promise<Bausteine.TextSnippet[]>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointment: (id: string) =>
      fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
  };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchTreatmentDocumentation: (id: string) =>
      fetchTreatmentDocumentation(id) as Promise<DokumentationApi.TreatmentDocumentation>,
    completeTreatment: (...args: unknown[]) => completeTreatment(...args) as Promise<void>,
    createTreatmentNote: (...args: unknown[]) => createTreatmentNote(...args) as Promise<string>,
    updateTreatmentNote: (...args: unknown[]) => updateTreatmentNote(...args) as Promise<void>,
    fetchPatientTreatmentNotesPage: (...args: unknown[]) =>
      fetchPatientTreatmentNotesPage(...args) as Promise<
        DokumentationApi.PatientTreatmentNotesEntry[]
      >,
    fetchBefundangaben: (id: string) => fetchBefundangaben(id) as Promise<unknown>,
    befundangabenSichern: (...args: unknown[]) => befundangabenSichern(...args) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ appointmentId: TERMIN_ID }),
}));

const { CompleteTreatmentPage } = await import('./CompleteTreatmentPage');

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist'], suche = '') {
  return renderWithProviders(
    <CompleteTreatmentPage user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}/abschluss${suche}`,
  );
}

/**
 * Der Abschluss in einem Schritt ist der Regelfall am Ende eines Besuchs
 * (UX-007). Geprüft wird, dass er genau ein Schreibvorgang ist, dass er seine
 * Folge nennt, bevor er ausgelöst wird (ADR-016 Punkt 4), und dass der Weg
 * „nur speichern" daneben bestehen bleibt.
 */
describe('CompleteTreatmentPage', () => {
  beforeEach(() => {
    fetchAppointment.mockReset();
    fetchTreatmentDocumentation.mockReset();
    completeTreatment.mockReset();
    createTreatmentNote.mockReset();
    updateTreatmentNote.mockReset();
    navigate.mockReset();
    fetchTextSnippets.mockReset();
    fetchAbrechnungslage.mockReset();
    fetchAbrechnungslage.mockResolvedValue(null);
    fetchPatientTreatmentNotesPage.mockReset();
    fetchPatientTreatmentNotesPage.mockResolvedValue([]);
    fetchBefundangaben.mockReset();
    fetchBefundangaben.mockResolvedValue(null);
    befundangabenSichern.mockReset();
    befundangabenSichern.mockResolvedValue(undefined);
    fetchTextSnippets.mockResolvedValue([
      {
        id: 'b1',
        title: 'Hausbesuch',
        body: 'Hausbesuch durchgefuehrt.',
        shared: true,
        editable: false,
      },
    ]);

    fetchAppointment.mockResolvedValue(termin);
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    completeTreatment.mockResolvedValue(undefined);
    createTreatmentNote.mockResolvedValue(NOTE_ID);
    updateTreatmentNote.mockResolvedValue(undefined);
  });

  it('ist eine Schreibfläche: Name im Kopf, Feld, Fußleiste mit Entwurf und Festschreiben (Handoff 6a)', async () => {
    rendern();
    expect(await screen.findByRole('heading', { level: 1, name: 'Max Mustermann' })).toBeVisible();
    expect(screen.getByText(/^Dokumentation · \S+ \d{2}\.\d{2}\. · /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entwurf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Festschreiben' })).toBeInTheDocument();
    // Keine Hinweise, keine Folgen-Kästen, kein „Abbrechen" neben dem Pfeil.
    expect(screen.queryByText(/geschieht zweierlei/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Abbrechen' })).toBeNull();
  });

  it('nennt „Termin n von m" im Kopf, wenn die Grundlage geladen ist', async () => {
    fetchAbrechnungslage.mockResolvedValue({
      appointment_id: TERMIN_ID,
      treatment_basis_id: null,
      treatment_basis_kind: null,
      treatment_basis_issued_on: null,
      basis_position: 2,
      basis_appointment_count: 6,
      billing_visible: false,
      recipient_kind: null,
    });
    rendern();
    expect(await screen.findByText(/Termin 2 von 6/)).toBeInTheDocument();
  });

  it('liest die bisherigen Einträge erst, wenn jemand den Verlauf öffnet (ANN-200)', async () => {
    const rahmen = {
      ends_at: '2027-05-12T09:00:00.000Z',
      appointment_type: 'home_visit',
      staff_given_name: 'Anna',
      staff_family_name: 'Beispiel',
      organization_time_zone: 'Europe/Berlin',
    };
    fetchPatientTreatmentNotesPage.mockResolvedValue([
      {
        ...rahmen,
        appointment_id: TERMIN_ID,
        starts_at: '2027-05-12T08:00:00.000Z',
        appointment_status: 'confirmed',
        notes: [entwurf],
      },
      {
        ...rahmen,
        appointment_id: 'vorher',
        starts_at: '2027-05-05T08:00:00.000Z',
        appointment_status: 'documented',
        notes: [
          {
            ...entwurf,
            id: 'n-vorher',
            appointment_id: 'vorher',
            status: 'final',
            version_count: 1,
            content: 'Letzte Woche: Gangschule.',
          },
        ],
      },
    ]);
    const user = userEvent.setup();
    rendern();
    const verlauf = await screen.findByRole('button', { name: /^Verlauf/ });
    expect(verlauf).toHaveAttribute('aria-expanded', 'false');
    expect(fetchPatientTreatmentNotesPage).not.toHaveBeenCalled();

    await user.click(verlauf);
    expect(await screen.findByText('Letzte Woche: Gangschule.')).toBeInTheDocument();
    expect(screen.getByText('Lesen protokolliert')).toBeInTheDocument();
    expect(screen.getByText('Version 1')).toBeInTheDocument();
    // Der Eintrag dieses Termins steht im Feld, nicht noch einmal im Verlauf.
    expect(screen.queryByText('Bereits geschriebener Entwurf')).toBeNull();
    expect(screen.getByRole('button', { name: /^Verlauf \(1\)/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('link', { name: /Verlauf in der Akte/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/patienten\/.+\/doku\?zurueck=/),
    );

    await user.click(screen.getByRole('button', { name: 'Bisherige Einträge schließen' }));
    expect(screen.queryByText('Letzte Woche: Gangschule.')).toBeNull();
  });

  it('schliesst Dokumentation und Termin mit einer einzigen Aktion ab', async () => {
    const user = userEvent.setup();
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
    await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

    await waitFor(() => expect(completeTreatment).toHaveBeenCalledTimes(1));
    expect(completeTreatment).toHaveBeenCalledWith(
      TERMIN_ID,
      'Heute geübt.',
      termin.updated_at,
      null,
      // Ohne den Weg aus dem geführten Ablauf kein Pflichtvermerk (CAL-018).
      false,
    );
    // Kein zweiter Schreibweg daneben.
    expect(createTreatmentNote).not.toHaveBeenCalled();
    expect(updateTreatmentNote).not.toHaveBeenCalled();
    // Zurück zum Termin, der erfährt, was geschehen ist (DOK-15, ZST-17).
    expect(navigate).toHaveBeenCalledWith(`/kalender?termin=${TERMIN_ID}`, {
      state: { meldung: 'Eintrag als Version 1 festgeschrieben. Der Termin ist abgeschlossen.' },
    });
  });

  it('behält den Rückweg aus der Übersicht für den Pfeil und den Weg danach (DOK-01, ZST-17)', async () => {
    const user = userEvent.setup();
    rendern(['therapist'], '?zurueck=%2F');

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
    expect(screen.getByRole('link', { name: 'Zurück' })).toHaveAttribute('href', '/');

    await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/', {
        state: { meldung: 'Eintrag als Version 1 festgeschrieben. Der Termin ist abgeschlossen.' },
      }),
    );
  });

  it('verbindet die Folge mit dem Knopf, damit sie auch vorgelesen wird (DOK-20)', async () => {
    rendern();

    expect(
      await screen.findByRole('button', { name: 'Festschreiben' }),
    ).toHaveAccessibleDescription(/als Version 1 fest; der Termin gilt damit als durchgeführt/);
  });

  it('uebergibt den Stand eines vorhandenen Entwurfs zur Konflikterkennung', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: entwurf, addenda: [] });
    const user = userEvent.setup();
    rendern();

    const feld = await screen.findByLabelText('Eintrag zur Behandlung');
    expect(feld).toHaveValue('Bereits geschriebener Entwurf');

    await user.clear(feld);
    await user.type(feld, 'Neuer Text');
    await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

    await waitFor(() =>
      expect(completeTreatment).toHaveBeenCalledWith(
        TERMIN_ID,
        'Neuer Text',
        termin.updated_at,
        entwurf.updated_at,
        false,
      ),
    );
  });

  it('laesst einen leeren Text nicht durch und schreibt nichts', async () => {
    const user = userEvent.setup();
    rendern();

    await user.click(await screen.findByRole('button', { name: 'Festschreiben' }));

    expect(
      await screen.findByText('Die Behandlungsdokumentation darf nicht leer sein.'),
    ).toBeInTheDocument();
    expect(completeTreatment).not.toHaveBeenCalled();
  });

  it('bietet daneben weiter den Weg "nur speichern"', async () => {
    const user = userEvent.setup();
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Nur ein Entwurf.');
    await user.click(screen.getByRole('button', { name: 'Entwurf' }));

    await waitFor(() => expect(createTreatmentNote).toHaveBeenCalledTimes(1));
    expect(completeTreatment).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/kalender?termin=${TERMIN_ID}`, {
        state: { meldung: 'Entwurf gespeichert – noch nicht finalisiert.' },
      }),
    );
  });

  it('schuetzt einen ungespeicherten Text beim Zurückgehen', async () => {
    const user = userEvent.setup();
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Ungespeichert');
    await user.click(screen.getByRole('link', { name: 'Zurück' }));

    // Seit FIX-011 stellt der Navigationsschutz die Rückfrage - für
    // „Abbrechen" wie für jeden anderen Weg aus dieser Seite heraus.
    expect(
      await screen.findByRole('group', { name: 'Ungespeicherte Dokumentation' }),
    ).toBeInTheDocument();

    // Als Zeile über der Fußleiste (Handoff 6a), mit denselben drei Wegen.
    expect(screen.getByText('Text noch nicht gespeichert.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Weiterschreiben' }));
    expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue('Ungespeichert');
  });

  /**
   * Der Kern der Zusicherung aus FIX-EPIC-003: „Speichern" aus der Rückfrage
   * heraus sichert den **Entwurf**. Ein Seitenwechsel schließt keinen Termin
   * ab und schreibt keine Dokumentation fest (ADR-016, ADR-018).
   */
  it('sichert aus der Rueckfrage nur den Entwurf und schliesst nichts ab', async () => {
    const user = userEvent.setup();
    createTreatmentNote.mockResolvedValue(NOTE_ID);
    rendern();

    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Ungespeichert');
    await user.click(screen.getByRole('link', { name: 'Zurück' }));
    await user.click(screen.getByRole('button', { name: 'Speichern und weiter' }));

    await waitFor(() =>
      expect(createTreatmentNote).toHaveBeenCalledWith(TERMIN_ID, 'Ungespeichert'),
    );
    expect(completeTreatment).not.toHaveBeenCalled();
  });

  it('schreibt am bereits abgeschlossenen Termin („Doku offen") mit demselben Knopf fest', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, status: 'completed' });
    const user = userEvent.setup();
    rendern();
    await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Nachgetragen.');
    await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
    await waitFor(() => expect(completeTreatment).toHaveBeenCalledTimes(1));
  });

  it('weist einen nicht angetroffenen Termin ohne Eintrag ruhig ab', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, status: 'no_show' });
    rendern();
    expect(await screen.findByText('Nicht angetroffen')).toBeInTheDocument();
    expect(screen.queryByLabelText('Eintrag zur Behandlung')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('weist einen abgesagten Termin ab', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, status: 'cancelled' });
    rendern();
    expect(await screen.findByText('Termin abgesagt')).toBeInTheDocument();
    expect(screen.queryByLabelText('Eintrag zur Behandlung')).toBeNull();
    // Ein erwartbarer Zustand, kein Alarm (DOK-12).
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('weist eine bereits finalisierte Dokumentation ab und nennt die Wege (DOK-08, DOK-12)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: { ...entwurf, status: 'final', version_count: 1 },
      addenda: [],
    });
    rendern();
    // Derselbe Zustand heißt überall gleich (DOK-08).
    expect(await screen.findByText('Bereits finalisiert')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: 'Nachtrag hinzufügen' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${NOTE_ID}/nachtrag`,
    );
    expect(screen.getByRole('link', { name: 'Korrigieren' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${NOTE_ID}/korrektur`,
    );
  });

  describe('Nachladen (DOK-B01)', () => {
    afterEach(() => {
      focusManager.setFocused(undefined);
    });

    it('behält Feld und Text, wenn der Eintrag inzwischen finalisiert wurde', async () => {
      fetchTreatmentDocumentation.mockResolvedValue({ primary: entwurf, addenda: [] });
      const user = userEvent.setup();
      rendern();

      const feld = await screen.findByLabelText('Eintrag zur Behandlung');
      await waitFor(() => expect(feld).toHaveValue('Bereits geschriebener Entwurf'));
      await user.type(feld, ' Und mehr.');

      fetchTreatmentDocumentation.mockResolvedValue({
        primary: { ...entwurf, status: 'final', version_count: 1 },
        addenda: [],
      });
      act(() => focusManager.setFocused(true));

      expect(
        await screen.findByText(
          'Der Eintrag wurde inzwischen finalisiert – Ihr Text steht noch im Feld und ist nicht gespeichert.',
        ),
      ).toBeInTheDocument();
      expect(feld).toHaveValue('Bereits geschriebener Entwurf Und mehr.');
      expect(screen.queryByText('Bereits finalisiert')).toBeNull();
    });

    it('meldet den eigenen Abschluss nicht als Änderung von außen', async () => {
      const user = userEvent.setup();
      rendern();

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Heute geübt.');
      // Nach dem Abschluss liefert der Server den Eintrag finalisiert.
      completeTreatment.mockImplementation(() => {
        fetchTreatmentDocumentation.mockResolvedValue({
          primary: { ...entwurf, content: 'Heute geübt.', status: 'final', version_count: 1 },
          addenda: [],
        });
        return Promise.resolve();
      });
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

      await waitFor(() => expect(navigate).toHaveBeenCalled());
      expect(screen.queryByText(/inzwischen finalisiert/)).toBeNull();
    });
  });

  describe('Baustein einfügen (DOK-10)', () => {
    it('meldet das Einfügen und nimmt es auf Wunsch zurück', async () => {
      const user = userEvent.setup();
      rendern();

      const feld = await screen.findByLabelText('Eintrag zur Behandlung');
      await user.type(feld, 'Eigener Satz.');
      await user.click(await screen.findByRole('button', { name: 'Hausbesuch' }));

      expect(feld).toHaveValue('Eigener Satz.\n\nHausbesuch durchgefuehrt.');
      expect(screen.getByText('„Hausbesuch“ am Ende eingefügt.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Rückgängig' }));
      expect(feld).toHaveValue('Eigener Satz.');
    });
  });

  it('ist fuer office gar nicht erst zu oeffnen und fragt nichts ab', async () => {
    rendern(['office']);
    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
  });

  describe('UX-008: Textbausteine', () => {
    it('fuegt einen Baustein mit einem Tap ein', async () => {
      const user = userEvent.setup();
      rendern();

      await user.click(await screen.findByRole('button', { name: 'Hausbesuch' }));
      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue(
        'Hausbesuch durchgefuehrt.',
      );
    });

    it('haengt an bereits Geschriebenes an, statt es zu ersetzen', async () => {
      const user = userEvent.setup();
      rendern();

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Eigener Satz.');
      await user.click(screen.getByRole('button', { name: 'Hausbesuch' }));

      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue(
        'Eigener Satz.\n\nHausbesuch durchgefuehrt.',
      );
    });

    it('blockiert die Dokumentation nicht, wenn die Bausteine nicht laden', async () => {
      fetchTextSnippets.mockRejectedValue(new Error('kaputt'));
      rendern();

      expect(await screen.findByLabelText('Eintrag zur Behandlung')).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Textbausteine' })).toBeNull();
    });
  });
  /**
   * Hausbesuch-Szenario 1 (CAL-018, ADR-018 Fassung 3 Punkt 9).
   *
   * Der Weg kommt aus dem gefuehrten Ablauf am Termin und traegt seine Wahl in
   * der Adresszeile. Geprueft wird, dass die Seite die Folge benennt und den
   * Pflichtvermerk genau dann uebergibt, wenn er gewaehlt wurde.
   */
  describe('CAL-018: Ohne Behandlung abschliessen', () => {
    it('nennt den Pflichtvermerk und seine Folge, bevor abgeschlossen wird', async () => {
      rendern(['therapist'], '?ohne-behandlung=1');

      expect(
        await screen.findByText(/Tür geöffnet, Behandlung auf Angabe der Patient:in nicht/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Kein\s+Ausfallhonorar/)).toBeInTheDocument();
      expect(screen.getByText(/^Ohne Behandlung · /)).toBeInTheDocument();
    });

    it('uebergibt den Vermerk an den Abschluss', async () => {
      const user = userEvent.setup();
      rendern(['therapist'], '?ohne-behandlung=1');

      await user.type(
        await screen.findByLabelText('Eintrag zur Behandlung'),
        'Tuer geoeffnet, Behandlung abgelehnt.',
      );
      await user.click(screen.getByRole('button', { name: 'Mit Vermerk festschreiben' }));

      await waitFor(() =>
        expect(completeTreatment).toHaveBeenCalledWith(
          TERMIN_ID,
          'Tuer geoeffnet, Behandlung abgelehnt.',
          termin.updated_at,
          null,
          true,
        ),
      );
    });

    it('nimmt den Vermerk an einem Praxistermin nicht an (ANN-055)', async () => {
      fetchAppointment.mockResolvedValue({
        ...termin,
        appointment_type: 'practice',
        location_id: '33333333-3333-4333-8333-000000000001',
        location_name: 'Hauptstandort Tuebingen',
        visit_street: null,
        visit_house_number: null,
        visit_postal_code: null,
        visit_city: null,
      });
      const user = userEvent.setup();
      rendern(['therapist'], '?ohne-behandlung=1');

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Behandelt.');
      // Ohne den Vermerk heisst die Schaltflaeche wieder wie sonst.
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

      await waitFor(() =>
        expect(completeTreatment).toHaveBeenCalledWith(
          TERMIN_ID,
          'Behandelt.',
          termin.updated_at,
          null,
          false,
        ),
      );
    });
  });

  /**
   * Befund aus Bausteinen (FRB-003b). Festgeschrieben wird nur, was im Feld
   * steht (ADR-016 Punkt 4); ein nicht übernommener Vorschlag hält den
   * Abschluss an. In einen Entwurf geht er nie mit - seine Angaben werden
   * daneben gesichert (ABN-015, BEF-103, §13).
   */
  describe('FRB-003b: Befund aus Bausteinen', () => {
    const VORSCHLAG = 'Knie rechts – Weiterführende Untersuchung\n❗ Lachman-Test: positiv';

    async function lachmannPositiv(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: /^\+ Befund/ }));
      await user.click(screen.getByRole('button', { name: 'Knie' }));
      const seite = screen.getByRole('group', { name: 'Seite Knie' });
      await user.click(within(seite).getByRole('button', { name: 'rechts' }));
      await user.click(screen.getByText('Weiterführende Untersuchung'));
      const lachmann = screen.getByRole('group', { name: 'Lachman-Test' });
      await user.click(within(lachmann).getByRole('button', { name: 'positiv' }));
    }

    it('übernimmt den Vorschlag in den Text und schließt genau diesen ab', async () => {
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Befund:');
      await lachmannPositiv(user);
      await user.click(screen.getByRole('button', { name: 'Übernehmen' }));

      const erwartet = `Befund:\n\n${VORSCHLAG}`;
      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue(erwartet);
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      await waitFor(() =>
        expect(completeTreatment).toHaveBeenCalledWith(
          TERMIN_ID,
          erwartet,
          termin.updated_at,
          null,
          false,
        ),
      );
    });

    it('schließt nicht ab, solange ein Vorschlag nicht im Text steht', async () => {
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Befund:');
      await lachmannPositiv(user);
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /Vorschlag aus den Bausteinen steht noch nicht im Text/,
      );
      expect(completeTreatment).not.toHaveBeenCalled();
    });

    it('sichert bei „Entwurf“ den Text ohne den Vorschlag und die Angaben daneben (BEF-103)', async () => {
      // Ungesehener Text im Entwurf käme über die automatische Finalisierung
      // (ADR-016 Punkt 7) in die Akte (Zweitreview S1).
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Befund:');
      await lachmannPositiv(user);
      await user.click(screen.getByRole('button', { name: 'Entwurf' }));

      await waitFor(() => expect(createTreatmentNote).toHaveBeenCalledWith(TERMIN_ID, 'Befund:'));
      expect(befundangabenSichern).toHaveBeenCalledWith(
        TERMIN_ID,
        expect.objectContaining({ seitenwahl: { knie: 'rechts' } }),
      );
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith(`/kalender?termin=${TERMIN_ID}`, {
          state: {
            meldung:
              'Entwurf gespeichert – noch nicht finalisiert. Der Vorschlag aus den Bausteinen ist nicht übernommen; seine Angaben bleiben gesichert.',
          },
        }),
      );
    });

    it('fragt beim Verlassen nach und sichert nur die Angaben, nicht den Vorschlag als Text', async () => {
      const user = userEvent.setup();
      rendern();
      await lachmannPositiv(user);
      await user.click(screen.getByRole('link', { name: 'Zurück' }));

      expect(
        await screen.findByRole('group', { name: 'Ungespeicherte Dokumentation' }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Speichern und weiter' }));
      await waitFor(() => expect(befundangabenSichern).toHaveBeenCalled());
      expect(createTreatmentNote).not.toHaveBeenCalled();
      expect(completeTreatment).not.toHaveBeenCalled();
    });

    // Region, Seite, Block, Ergebnis und die Rückfrage vor dem Verwerfen: mehr
    // Schritte als der Vorgabewert von 5 s unter voller Last trägt.
    it('schließt nach „Verwerfen“ wieder ab, ohne den Vorschlag', { timeout: 20_000 }, async () => {
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Befund:');
      await lachmannPositiv(user);
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      await screen.findByRole('alert');
      // Verwerfen fragt seit UXR-009 nach (BEF-01).
      await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
      await user.click(screen.getByRole('button', { name: 'Ja, alle Angaben verwerfen' }));
      expect(screen.queryByRole('alert')).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));
      await waitFor(() =>
        expect(completeTreatment).toHaveBeenCalledWith(
          TERMIN_ID,
          'Befund:',
          termin.updated_at,
          null,
          false,
        ),
      );
    });

    it('sperrt Bausteine und Textbausteine, solange der Abschluss läuft (Zweitreview B1)', async () => {
      let fertig: () => void = () => undefined;
      completeTreatment.mockReturnValue(new Promise<void>((resolve) => (fertig = resolve)));
      const user = userEvent.setup();
      rendern();
      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Befund:');
      await user.click(screen.getByRole('button', { name: /^\+ Befund/ }));
      await user.click(screen.getByRole('button', { name: 'Festschreiben' }));

      await waitFor(() => expect(completeTreatment).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('group', { name: 'Befund aus Bausteinen' })).toBeDisabled();
      // Ein Tap auf einen Textbaustein ändert das festgehaltene Feld nicht.
      await user.click(screen.getByRole('button', { name: 'Hausbesuch' }));
      expect(screen.getByLabelText('Eintrag zur Behandlung')).toHaveValue('Befund:');
      fertig();
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith(`/kalender?termin=${TERMIN_ID}`, {
          state: {
            meldung: 'Eintrag als Version 1 festgeschrieben. Der Termin ist abgeschlossen.',
          },
        }),
      );
    });

    it('bietet ohne Behandlung keine Bausteine an', async () => {
      rendern(['therapist'], '?ohne-behandlung=1');
      await screen.findByLabelText('Eintrag zur Behandlung');
      expect(screen.queryByRole('button', { name: /^\+ Befund/ })).toBeNull();
      expect(screen.queryByRole('group', { name: 'Befund aus Bausteinen' })).toBeNull();
    });
  });

  describe('Sicherung von selbst (BEF-056, ANN-319)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('sichert den Text nach einer Pause als Entwurf und schließt nichts ab', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      rendern();

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Synthetisch.');
      await act(() => vi.advanceTimersByTimeAsync(3100));

      await waitFor(() =>
        expect(createTreatmentNote).toHaveBeenCalledWith(TERMIN_ID, 'Synthetisch.'),
      );
      expect(completeTreatment).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(await screen.findByText(/Als Entwurf gesichert um/)).toBeInTheDocument();
    });

    it('sichert am Vermerk „ohne Behandlung“ nicht von selbst - der Entwurf trüge den Vermerk nicht', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      rendern(['therapist'], '?ohne-behandlung=1');

      await user.type(await screen.findByLabelText('Eintrag zur Behandlung'), 'Synthetisch.');
      await act(() => vi.advanceTimersByTimeAsync(3100 * 2));

      expect(createTreatmentNote).not.toHaveBeenCalled();
    });
  });

  it('bietet die Übernahme an, wenn der Entwurf inzwischen finalisiert ist (BEF-056)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: entwurf, addenda: [] });
    updateTreatmentNote.mockImplementation(() => {
      fetchTreatmentDocumentation.mockResolvedValue({
        primary: { ...entwurf, status: 'final', finalisation_kind: 'automatic', version_count: 1 },
        addenda: [],
      });
      return Promise.reject(new Error('Diese Dokumentation ist finalisiert.'));
    });
    const user = userEvent.setup();
    rendern();

    const feld = await screen.findByLabelText('Eintrag zur Behandlung');
    await user.type(feld, ' Zusatz.');
    await user.click(screen.getByRole('button', { name: 'Entwurf' }));

    const gruppe = await screen.findByRole('group', { name: 'Text übernehmen' });
    expect(within(gruppe).getByRole('button', { name: 'Als Nachtrag übernehmen' })).toBeEnabled();
    expect(within(gruppe).getByRole('button', { name: 'In Korrektur übernehmen' })).toBeEnabled();
    expect(feld).toHaveValue(`${entwurf.content} Zusatz.`);
  });
});
