import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type * as PatientsApi from './api';
import type * as DokumentationApi from '@/features/documentation/api';
import type * as VerordnungenApi from '@/features/treatment-bases/api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as IntakeApi from '@/features/open-points/intake-api';
import type * as FilesApi from '@/features/files/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';
import type { RoleKey } from '@/features/session/types';
import { RUECKWEG_PARAM, rueckwegBeschriftung } from '@/lib/rueckweg';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const aktiv: PatientsApi.Patient = testPatient({
  id: PATIENT_ID,
  status: 'active',
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1985-07-19',
});

const fetchPatient = vi.fn();
const logPatientRecordView = vi.fn();
const fetchUpcomingAppointments = vi.fn();
const fetchPatientAppointments = vi.fn();
const fetchPatientTreatmentBases = vi.fn();
const fetchPatientTreatmentBasesClinical = vi.fn();
const fetchPatientTreatmentBasisSlots = vi.fn();
const fetchPatientTreatmentNotesPage = vi.fn();
const fetchIntakeChecklist = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
    logPatientRecordView: (id: string) => logPatientRecordView(id) as Promise<void>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchUpcomingAppointments: (patientId: string, limit?: number) =>
      fetchUpcomingAppointments(patientId, limit) as Promise<AppointmentsApi.UpcomingAppointment[]>,
    fetchPatientAppointments: (patientId: string, query: unknown) =>
      fetchPatientAppointments(patientId, query) as Promise<AppointmentsApi.PatientAppointment[]>,
  };
});

vi.mock('@/features/treatment-bases/api', async (importOriginal) => {
  const actual = await importOriginal<typeof VerordnungenApi>();
  return {
    ...actual,
    fetchPatientTreatmentBases: (id: string) =>
      fetchPatientTreatmentBases(id) as Promise<VerordnungenApi.TreatmentBasis[]>,
    fetchPatientTreatmentBasesClinical: (id: string) =>
      fetchPatientTreatmentBasesClinical(id) as Promise<VerordnungenApi.ClinicalTreatmentBasis[]>,
    fetchPatientTreatmentBasisSlots: (id: string) =>
      fetchPatientTreatmentBasisSlots(id) as Promise<VerordnungenApi.TreatmentBasisKontingent[]>,
  };
});

const ladeDateiHoch = vi.fn();
vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesApi>()),
  ladeDateiHoch: (auftrag: FilesApi.UploadAuftrag) => ladeDateiHoch(auftrag) as Promise<string>,
}));

vi.mock('@/features/open-points/intake-api', async (importOriginal) => {
  const actual = await importOriginal<typeof IntakeApi>();
  return {
    ...actual,
    fetchIntakeChecklist: (id: string) =>
      fetchIntakeChecklist(id) as Promise<IntakeApi.IntakeChecklist>,
  };
});

vi.mock('@/features/documentation/api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchPatientTreatmentNotesPage: (
      patientId: string,
      cursor: DokumentationApi.AkteCursor | null,
    ) =>
      fetchPatientTreatmentNotesPage(patientId, cursor) as Promise<
        DokumentationApi.PatientTreatmentNotesEntry[]
      >,
  };
});

const { AkteEinstieg, AlterAktenbereich, PatientRecordLayout } =
  await import('./PatientRecordLayout');
const { ALTE_AKTENBEREICHE } = await import('./akte');
const { PatientMasterDataPage } = await import('./PatientMasterDataPage');
const { PatientAppointmentsPage } = await import('@/features/appointments/PatientAppointmentsPage');
const { PatientTreatmentBasesPage } =
  await import('@/features/treatment-bases/PatientTreatmentBasesPage');
const { PatientDokuPage } = await import('@/features/documentation/PatientDokuPage');

/**
 * Die Akte wird als Routenbaum gerendert und nicht als einzelne Komponente:
 * Der Rahmen und seine Bereiche sind genau das - eine verschachtelte Route -,
 * und der Bereichswechsel ist das, was hier zu prüfen ist.
 */
/** Ziel und mitgegebener Rückweg eines Links, getrennt geprüft. */
function linkZiel(link: HTMLElement): { pfad: string; zurueck: string | null } {
  const adresse = new URL(link.getAttribute('href') ?? '', 'http://akte.test');
  return { pfad: adresse.pathname, zurueck: adresse.searchParams.get(RUECKWEG_PARAM) };
}

const STAMMDATEN = `/patienten/${PATIENT_ID}/stammdaten`;

function akteRendern(roles: RoleKey[], pfad = `/patienten/${PATIENT_ID}`) {
  return renderWithProviders(
    <Routes>
      <Route path="/patienten/:patientId" element={<PatientRecordLayout user={testUser(roles)} />}>
        <Route index element={<AkteEinstieg />} />
        <Route path="termine" element={<PatientAppointmentsPage />} />
        <Route path="verordnungen" element={<PatientTreatmentBasesPage />} />
        <Route path="doku" element={<PatientDokuPage />} />
        <Route path="stammdaten" element={<PatientMasterDataPage />} />
        {Object.keys(ALTE_AKTENBEREICHE).map((alt) => (
          <Route
            key={alt}
            path={alt}
            element={<AlterAktenbereich alt={alt as keyof typeof ALTE_AKTENBEREICHE} />}
          />
        ))}
      </Route>
    </Routes>,
    pfad,
  );
}

describe('Rahmen der Patientenakte (AKTE-000)', () => {
  beforeEach(() => {
    for (const mock of [
      fetchPatient,
      logPatientRecordView,
      fetchUpcomingAppointments,
      fetchPatientAppointments,
      fetchPatientTreatmentBases,
      fetchPatientTreatmentBasesClinical,
      fetchPatientTreatmentBasisSlots,
      fetchPatientTreatmentNotesPage,
      fetchIntakeChecklist,
    ]) {
      mock.mockReset();
    }
    fetchPatient.mockResolvedValue(aktiv);
    logPatientRecordView.mockResolvedValue(undefined);
    fetchUpcomingAppointments.mockResolvedValue([]);
    fetchPatientAppointments.mockResolvedValue([]);
    fetchPatientTreatmentBases.mockResolvedValue([]);
    fetchPatientTreatmentBasesClinical.mockResolvedValue([]);
    fetchPatientTreatmentBasisSlots.mockResolvedValue([]);
    fetchPatientTreatmentNotesPage.mockResolvedValue([]);
    fetchIntakeChecklist.mockResolvedValue([]);
  });

  describe('Kopf der Akte', () => {
    it('nennt Name und Geburtsdatum - und bei laufender Versorgung kein Etikett (UX-005e)', async () => {
      akteRendern(['office']);

      expect(await screen.findByRole('heading', { name: 'Max Mustermann' })).toBeInTheDocument();
      // Das Alter haengt am heutigen Tag - geprueft wird die Form, nicht die
      // Zahl, damit der Test nicht an einem Geburtstag rot wird.
      expect(screen.getByText(/^geb\. 19\.07\.1985 · \d+ Jahre$/)).toBeInTheDocument();
      // Der Regelfall traegt kein Etikett.
      expect(screen.queryByText('In Versorgung')).not.toBeInTheDocument();
      expect(screen.queryByText('Nicht in laufender Versorgung')).not.toBeInTheDocument();
    });

    it('kennzeichnet eine nicht laufende Versorgung', async () => {
      fetchPatient.mockResolvedValue({ ...aktiv, status: 'inactive' });
      akteRendern(['office']);

      expect(await screen.findByText('Nicht in laufender Versorgung')).toBeInTheDocument();
    });

    it('nennt den Abschluss der Versorgung im Kopf', async () => {
      fetchPatient.mockResolvedValue({ ...aktiv, care_concluded_on: '2026-03-12' });
      akteRendern(['therapist']);

      expect(await screen.findByText('Versorgung abgeschlossen am 12.03.2026')).toBeInTheDocument();
    });

    // Mit Rückweg in die Akte (PAT-08, TER-03): Ohne ihn fiel der neue Termin
    // auf „Zurück zur Patientenliste" zurück. Auf einem festen Bereich
    // gerendert, damit der Rückweg nicht an der Weiterleitung des Einstiegs
    // hängt.
    it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
      'bietet %s den Termin aus dem Kopf heraus an, mit Rückweg in die Akte',
      async (role) => {
        akteRendern([role], STAMMDATEN);

        const link = await screen.findByRole('link', { name: 'Termin anlegen' });
        expect(linkZiel(link)).toEqual({
          pfad: `/patienten/${PATIENT_ID}/termine/neu`,
          zurueck: STAMMDATEN,
        });
      },
    );

    it('reicht den Rückweg der Akte an die Formulare weiter (PAT-08)', async () => {
      const kalender = '/kalender?ansicht=tag';
      akteRendern(['therapist'], `${STAMMDATEN}?zurueck=${encodeURIComponent(kalender)}`);

      const link = await screen.findByRole('link', { name: 'Grundlage erfassen' });
      const { pfad, zurueck } = linkZiel(link);
      expect(pfad).toBe(`/patienten/${PATIENT_ID}/verordnungen/neu`);
      // Zurück geht es in die Akte - und von dort weiter in den Kalender.
      const akte = new URL(zurueck ?? '', 'http://akte.test');
      expect(akte.pathname).toBe(STAMMDATEN);
      expect(akte.searchParams.get(RUECKWEG_PARAM)).toBe(kalender);
    });

    it('bietet fuer eine:n inaktive:n Patient:in keinen Termin an', async () => {
      fetchPatient.mockResolvedValue({ ...aktiv, status: 'inactive' });
      akteRendern(['office']);

      await screen.findByRole('heading', { name: 'Max Mustermann' });
      expect(screen.queryByRole('link', { name: 'Termin anlegen' })).not.toBeInTheDocument();
    });

    // PAT-05: Der Knopf verschwand ohne ein Wort. Jetzt steht der Grund da -
    // und der Weg zurück, je nach Recht der Rolle.
    it('sagt bei einer inaktiven Person, warum es keinen Termin gibt und wo es weitergeht', async () => {
      fetchPatient.mockResolvedValue({ ...aktiv, status: 'inactive' });
      akteRendern(['office'], STAMMDATEN);

      expect(
        await screen.findByText(
          'Keine neuen Termine. Wieder als aktiv führen unter Stammdaten → Verwaltung.',
        ),
      ).toBeInTheDocument();
    });

    it('nennt Therapeut:innen, welche Rollen die Person wieder aktiv führen dürfen', async () => {
      fetchPatient.mockResolvedValue({ ...aktiv, status: 'inactive' });
      akteRendern(['therapist'], STAMMDATEN);

      expect(
        await screen.findByText(
          /Wieder als aktiv führen dürfen die Rollen Praxismanagement, Teamleitung und Praxisinhaber/,
        ),
      ).toBeInTheDocument();
      // Der Knopf, den die Rolle hat, bleibt.
      expect(screen.getByRole('link', { name: 'Grundlage erfassen' })).toBeInTheDocument();
    });

    it('sagt bei laufender Versorgung nichts dazu', async () => {
      akteRendern(['office'], STAMMDATEN);

      await screen.findByRole('link', { name: 'Termin anlegen' });
      expect(screen.queryByText(/Keine neuen Termine/)).not.toBeInTheDocument();
    });

    it('bietet das Erfassen einer Verordnung nur den therapeutischen Rollen an', async () => {
      akteRendern(['therapist'], STAMMDATEN);
      const link = await screen.findByRole('link', { name: 'Grundlage erfassen' });
      expect(linkZiel(link)).toEqual({
        pfad: `/patienten/${PATIENT_ID}/verordnungen/neu`,
        zurueck: STAMMDATEN,
      });
    });

    it('zeigt office im Kopf das Erfassen einer Grundlage (PRX-010, ANN-011)', async () => {
      akteRendern(['office']);
      await screen.findByRole('heading', { name: 'Max Mustermann' });
      expect(screen.getByRole('link', { name: 'Grundlage erfassen' })).toBeInTheDocument();
    });

    it('zeigt der Trainingsbetreuung kein Erfassen einer Grundlage', async () => {
      akteRendern(['trainer']);
      await screen.findByRole('heading', { name: 'Max Mustermann' }).catch(() => undefined);
      expect(screen.queryByRole('link', { name: 'Grundlage erfassen' })).not.toBeInTheDocument();
    });
  });

  describe('Bereichsnavigation', () => {
    // AKTE-007: genau vier Bereiche. Verlauf und Befund sind die Doku,
    // Datenschutz ist der Anmeldebogen in den Stammdaten, „Dateien" gibt es
    // nicht mehr.
    it.each([['therapist'], ['office'], ['owner'], ['team_lead']] as const)(
      'fuehrt fuer %s genau vier Bereiche in fester Reihenfolge',
      async (rolle) => {
        akteRendern([rolle]);

        const navigation = await screen.findByRole('navigation', { name: 'Bereiche der Akte' });
        const eintraege = screen.getAllByRole('link').filter((link) => navigation.contains(link));
        expect(eintraege.map((link) => link.textContent)).toEqual([
          'Termine',
          'Behandlungsgrundlagen',
          'Doku',
          'Stammdaten',
        ]);
      },
    );

    it.each([
      ['verlauf', '/doku', ''],
      ['befund', '/doku', ''],
      ['datenschutz', '/stammdaten', '#anmeldebogen'],
      ['dateien', '/stammdaten', ''],
    ])('leitet die alte Adresse /%s weiter - samt Rückweg (AKTE-007)', async (alt, ziel, anker) => {
      const zurueck = '/kalender?ansicht=tag';
      akteRendern(
        ['therapist'],
        `/patienten/${PATIENT_ID}/${alt}?${RUECKWEG_PARAM}=${encodeURIComponent(zurueck)}`,
      );

      const navigation = await screen.findByRole('navigation', { name: 'Bereiche der Akte' });
      const aktiv = await within(navigation).findByRole('link', { current: 'page' });
      expect(linkZiel(aktiv)).toEqual({
        pfad: `/patienten/${PATIENT_ID}${ziel}`,
        zurueck,
      });
      expect(ALTE_AKTENBEREICHE[alt as keyof typeof ALTE_AKTENBEREICHE]).toBe(
        `${ziel.slice(1)}${anker}`,
      );
    });

    // UI-002a: Der Bereich ist samt seiner Schaltflaeche weg - nicht nur
    // versteckt. Ein Auszug aus den vier anderen Bereichen kostete bei jedem
    // Aufruf der Akte einen Tap, bevor etwas zu tun war.
    it('fuehrt keinen Bereich "Uebersicht" mehr', async () => {
      akteRendern(['therapist']);

      const navigation = await screen.findByRole('navigation', { name: 'Bereiche der Akte' });
      expect(
        screen.queryAllByRole('link', { name: 'Übersicht' }).filter((l) => navigation.contains(l)),
      ).toEqual([]);
    });

    it('laesst einem Patientenkonto nur die Stammdaten', async () => {
      akteRendern(['patient']);

      const navigation = await screen.findByRole('navigation', { name: 'Bereiche der Akte' });
      const eintraege = screen.getAllByRole('link').filter((link) => navigation.contains(link));
      expect(eintraege.map((link) => link.textContent)).toEqual(['Stammdaten']);
    });

    it('wechselt den Bereich, ohne die Akte neu zu laden', async () => {
      const user = userEvent.setup();
      akteRendern(['office']);

      await screen.findByRole('heading', { name: 'Max Mustermann' });
      await user.click(screen.getByRole('link', { name: 'Stammdaten' }));

      expect(await screen.findByText('Kontakt')).toBeInTheDocument();
      // Der Kopf bleibt stehen - er gehoert dem Rahmen, nicht dem Bereich.
      expect(screen.getByRole('heading', { name: 'Max Mustermann' })).toBeInTheDocument();
      expect(fetchPatient).toHaveBeenCalledTimes(1);
    });

    it('protokolliert den Aktenzugriff einmal je geoeffneter Akte', async () => {
      const user = userEvent.setup();
      akteRendern(['office']);

      await screen.findByRole('heading', { name: 'Max Mustermann' });
      await user.click(screen.getByRole('link', { name: 'Stammdaten' }));
      await screen.findByText('Kontakt');

      expect(logPatientRecordView).toHaveBeenCalledTimes(1);
      expect(logPatientRecordView).toHaveBeenCalledWith(PATIENT_ID);
    });

    it('protokolliert erst bei sichtbarem Datensatz', async () => {
      fetchPatient.mockResolvedValue(null);
      akteRendern(['office']);

      expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
      expect(logPatientRecordView).not.toHaveBeenCalled();
    });

    /**
     * jsdom kennt kein Layout. Die Leiste bekommt deshalb eine Geometrie
     * untergeschoben wie im Test der SubNav: 300 px sichtbar, jeder Bereich
     * 120 px breit, und seine Lage verschiebt sich mit dem `scrollLeft`.
     */
    it('rollt den offenen Bereich am Telefon ins Bild, ohne die Seite zu rollen (PAT-01)', async () => {
      const bereiche = ['Termine', 'Behandlungsgrundlagen', 'Doku', 'Stammdaten'];
      vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (
        this: Element,
      ) {
        return this.tagName === 'UL' ? bereiche.length * 120 : 0;
      });
      vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (
        this: Element,
      ) {
        return this.tagName === 'UL' ? 300 : 0;
      });
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        const rechteck = (left: number, width: number) =>
          ({ left, right: left + width, width, top: 0, bottom: 44, height: 44 }) as DOMRect;
        if (this.tagName === 'UL') return rechteck(0, 300);
        const index = bereiche.indexOf(this.textContent ?? '');
        return rechteck(index * 120 - (this.closest('ul')?.scrollLeft ?? 0), 120);
      });
      const seiteRollen = vi.spyOn(Element.prototype, 'scrollIntoView');

      try {
        akteRendern(['therapist'], STAMMDATEN);
        const navigation = await screen.findByRole('navigation', { name: 'Bereiche der Akte' });

        // „Stammdaten" liegt bei 360-480 px, sichtbar sind 300: Die Leiste
        // rollt, bis der Bereich ganz und 24 px vom Nachbarn zu sehen sind.
        expect(within(navigation).getByRole('link', { name: 'Stammdaten' })).toHaveAttribute(
          'aria-current',
          'page',
        );
        expect(within(navigation).getByRole('list').scrollLeft).toBe(480 + 24 - 300);
        expect(seiteRollen).not.toHaveBeenCalled();
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('bricht die Leiste ab 640 px um, statt Bereiche seitlich zu verstecken (PAT-01)', async () => {
      akteRendern(['therapist'], STAMMDATEN);
      const navigation = await screen.findByRole('navigation', { name: 'Bereiche der Akte' });
      expect(within(navigation).getByRole('list')).toHaveClass('sm:flex-wrap');
    });
  });

  describe('Zustände des Rahmens (PAT-22, UIK-16)', () => {
    it('führt ohne Rückweg zur Patientenliste - mit dem Wort aller Rückwege dorthin', async () => {
      akteRendern(['office'], STAMMDATEN);
      await screen.findByRole('heading', { name: 'Max Mustermann' });

      const beschriftung = rueckwegBeschriftung('/patienten');
      expect(
        screen.getByRole('link', { name: (name) => name.includes(beschriftung) }),
      ).toHaveAttribute('href', '/patienten');
    });

    it('zeigt beim Ladefehler Überschrift, Handlung und einen neuen Versuch', async () => {
      const user = userEvent.setup();
      fetchPatient.mockRejectedValueOnce(new Error('offline'));
      akteRendern(['office'], STAMMDATEN);

      const meldung = await screen.findByRole('alert');
      expect(meldung).toHaveTextContent('Die Patientendaten konnten nicht geladen werden.');
      expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen');
      expect(meldung.textContent).not.toMatch(/angemeldet|offline/);
      expect(screen.getByRole('heading', { level: 1, name: 'Patientenakte' })).toBeInTheDocument();

      await user.click(within(meldung).getByRole('button', { name: 'Erneut versuchen' }));
      expect(await screen.findByRole('heading', { name: 'Max Mustermann' })).toBeInTheDocument();
      expect(fetchPatient).toHaveBeenCalledTimes(2);
    });

    it('nennt bei einer unbekannten Akte den Gegenstand statt eines Datensatzes (WRT-02)', async () => {
      fetchPatient.mockResolvedValue(null);
      akteRendern(['office'], STAMMDATEN);

      expect(
        await screen.findByText(
          'Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Patientenakte' })).toBeInTheDocument();
    });
  });

  describe('Einstieg in die Akte (UI-002a)', () => {
    it('fuehrt von /patienten/:id in die Termine', async () => {
      akteRendern(['office']);

      expect(await screen.findByRole('heading', { name: 'Kommende Termine' })).toBeInTheDocument();
      await waitFor(() => expect(fetchPatientAppointments).toHaveBeenCalled());
    });

    it('fuehrt ein Patientenkonto in die Stammdaten', async () => {
      akteRendern(['patient']);

      expect(await screen.findByText('Kontakt')).toBeInTheDocument();
    });

    // Der Rueckweg der Akte steht in den Suchparametern (UX-012). Ginge er
    // beim Weiterleiten verloren, waere er genau beim Oeffnen weg.
    it('nimmt den Rueckweg mit', async () => {
      akteRendern(['office'], `/patienten/${PATIENT_ID}?zurueck=%2Fkalender%3Fansicht%3Dtag`);

      const zurueck = await screen.findByRole('link', { name: /Zurück/ });
      expect(zurueck).toHaveAttribute('href', '/kalender?ansicht=tag');
    });
  });

  describe('Hinweise vor dem Hausbesuch im Kopf (UI-002a, AKTE-007)', () => {
    it('legt Zugang und Besonderheit unter „Hinweise", standardmäßig zu', async () => {
      fetchPatient.mockResolvedValue({
        ...aktiv,
        home_visit_access_note: 'Klingel defekt, bitte anrufen',
        special_note: 'Hund im Flur',
      });
      const user = userEvent.setup();
      akteRendern(['therapist']);

      const kopf = (await screen.findByText('Hinweise')).closest('summary')!;
      // Die Zeile sagt, was drinsteht - beides, als zwei Felder.
      expect(kopf).toHaveTextContent('Zugang · Besonderheit');
      const aufklapper = kopf.closest('details')!;
      expect(aufklapper).not.toHaveAttribute('open');
      await user.click(kopf);
      expect(aufklapper).toHaveAttribute('open');
      expect(within(aufklapper).getByText('Klingel defekt, bitte anrufen')).toBeVisible();
      expect(within(aufklapper).getByText('Hund im Flur')).toBeVisible();
    });

    it('nennt in der Zeile nur, was hinterlegt ist', async () => {
      fetchPatient.mockResolvedValue({
        ...aktiv,
        home_visit_access_note: null,
        special_note: 'Hund im Flur',
      });
      akteRendern(['therapist']);
      const kopf = (await screen.findByText('Hinweise')).closest('summary')!;
      expect(kopf).toHaveTextContent('Besonderheit');
      expect(kopf).not.toHaveTextContent('Zugang');
    });

    it('laesst den Kopf leer, wenn nichts hinterlegt ist', async () => {
      fetchPatient.mockResolvedValue({
        ...aktiv,
        home_visit_access_note: null,
        special_note: null,
      });
      akteRendern(['therapist']);

      await screen.findByRole('heading', { name: 'Max Mustermann' });
      // Ohne Angabe kein Aufklapper und kein Abzeichen.
      expect(screen.queryByText('Hinweise')).not.toBeInTheDocument();
      expect(screen.queryByText('Liege mitnehmen')).not.toBeInTheDocument();
    });

    it('heißt den Zugangshinweis wie das Feld und behält seine Absätze (PAT-07, PAT-13)', async () => {
      fetchPatient.mockResolvedValue({
        ...aktiv,
        home_visit_access_note: '2. OG\nKlingel Meier\nSchlüssel beim Nachbarn',
      });
      // Auf den Terminen und nicht auf den Stammdaten gerendert: Dort stünde
      // der Hinweis ein zweites Mal.
      akteRendern(['therapist'], `/patienten/${PATIENT_ID}/termine`);

      const beschriftung = await screen.findByText('Zugangshinweis');
      expect(beschriftung.tagName).toBe('DT');
      const wert = beschriftung.nextElementSibling!;
      expect(wert).toHaveTextContent('Klingel Meier');
      expect(wert.firstElementChild).toHaveClass('whitespace-pre-line');
      expect(wert).toHaveClass('wrap-anywhere');
    });

    it('nennt die Behandlungsliege als Abzeichen, wenn sie gebraucht wird (UX-003a)', async () => {
      fetchPatient.mockResolvedValue({ ...aktiv, treatment_table_required: true });
      akteRendern(['therapist']);

      expect(await screen.findByText('Liege mitnehmen')).toBeInTheDocument();
    });
  });

  // AKTE-007: Die Kachel „Erstaufnahme offen" ist einer Zeile gewichen, die
  // nur den Anmeldebogen kennt (ANN-224).
  describe('Hinweis „Anmeldebogen fehlt"', () => {
    // ANN-226: Ein Tipp im Kopf, ein Foto - kein Umweg über die Stammdaten.
    it('erscheint bei fehlendem Anmeldebogen und nimmt das Foto direkt auf', async () => {
      const user = userEvent.setup();
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
      ladeDateiHoch.mockReset().mockResolvedValue('neu');
      fetchIntakeChecklist.mockResolvedValue([
        { item: 'prescription_photo', state: 'done' },
        { item: 'registration_form', state: 'open' },
      ]);
      akteRendern(['office'], `/patienten/${PATIENT_ID}/termine`);

      const zeile = (await screen.findByText(/Anmeldebogen fehlt/)).parentElement!;
      expect(within(zeile).getByRole('button', { name: 'Fotografieren' })).toBeInTheDocument();
      expect(within(zeile).queryByRole('link')).toBeNull();
      expect(screen.queryByText('Erstaufnahme offen')).toBeNull();

      const aufrufeVorher = fetchIntakeChecklist.mock.calls.length;
      await user.upload(
        within(zeile).getByLabelText('Anmeldebogen als Datei'),
        new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'bogen.jpg', { type: 'image/jpeg' }),
      );

      await waitFor(() => expect(ladeDateiHoch).toHaveBeenCalledTimes(1));
      expect(ladeDateiHoch.mock.calls[0]![0]).toMatchObject({
        patientId: PATIENT_ID,
        grundlageId: null,
        documentType: 'vertrag',
      });
      // Die Erstaufnahme lädt neu - der Hinweis verschwindet ohne Neuladen.
      await waitFor(() =>
        expect(fetchIntakeChecklist.mock.calls.length).toBeGreaterThan(aufrufeVorher),
      );
    });

    it('erscheint nicht bei fehlendem Verordnungsfoto', async () => {
      fetchIntakeChecklist.mockResolvedValue([
        { item: 'prescription_photo', state: 'open' },
        { item: 'registration_form', state: 'done' },
      ]);
      akteRendern(['office'], `/patienten/${PATIENT_ID}/termine`);

      await waitFor(() => expect(fetchIntakeChecklist).toHaveBeenCalledWith(PATIENT_ID));
      await screen.findByRole('heading', { name: 'Max Mustermann' });
      expect(screen.queryByText(/Anmeldebogen fehlt/)).toBeNull();
    });

    it('erscheint nicht bei fehlendem Befund - der ist kein Punkt mehr', async () => {
      // Eine Antwort in der alten Form: Was die Liste nicht kennt, zählt nicht.
      fetchIntakeChecklist.mockResolvedValue([{ item: 'registration_form', state: 'done' }]);
      akteRendern(['therapist'], `/patienten/${PATIENT_ID}/termine`);

      await waitFor(() => expect(fetchIntakeChecklist).toHaveBeenCalled());
      await screen.findByRole('heading', { name: 'Max Mustermann' });
      expect(screen.queryByText(/Anmeldebogen fehlt/)).toBeNull();
    });

    it('fragt bei einer Person außerhalb der Versorgung nicht', async () => {
      fetchPatient.mockResolvedValue({ ...aktiv, status: 'inactive' });
      akteRendern(['office'], `/patienten/${PATIENT_ID}/termine`);
      await screen.findByRole('heading', { name: 'Max Mustermann' });
      expect(fetchIntakeChecklist).not.toHaveBeenCalled();
    });
  });

  describe('Abzeichen zur Abrechnungsart (AKTE-007)', () => {
    const basis: VerordnungenApi.TreatmentBasis = {
      id: '99999999-9999-4999-8999-000000000009',
      prescriber_id: null,
      prescriber_name: 'Dr. Synthetisch Roth',
      prescriber_practice_name: null,
      treatment_basis_kind: 'first',
      issued_on: '2026-09-20',
      frequency_note: null,
      note: null,
      items: [],
      updated_at: '2026-09-20T10:00:00.000000+00',
    };

    it('nennt „Privat · mit Verordnung" bei einer Verordnung', async () => {
      fetchPatientTreatmentBases.mockResolvedValue([basis]);
      akteRendern(['therapist'], `/patienten/${PATIENT_ID}/termine`);
      expect(await screen.findByText('Privat · mit Verordnung')).toBeInTheDocument();
    });

    it('nennt „Selbstzahler" nach der jüngsten Grundlage', async () => {
      fetchPatientTreatmentBases.mockResolvedValue([
        basis,
        { ...basis, id: 'neu', treatment_basis_kind: 'self_pay', issued_on: '2026-09-30' },
      ]);
      akteRendern(['therapist'], `/patienten/${PATIENT_ID}/termine`);
      const imKopf = (await screen.findAllByText('Selbstzahler')).filter((el) =>
        el.closest('header'),
      );
      expect(imKopf).toHaveLength(1);
      expect(screen.queryByText('Privat · mit Verordnung')).toBeNull();
    });

    it('zeigt ohne Grundlage kein Abzeichen', async () => {
      akteRendern(['therapist'], `/patienten/${PATIENT_ID}/termine`);
      await screen.findByRole('heading', { name: 'Max Mustermann' });
      await waitFor(() => expect(fetchPatientTreatmentBases).toHaveBeenCalled());
      expect(screen.queryByText('Selbstzahler')).toBeNull();
      expect(screen.queryByText('Privat · mit Verordnung')).toBeNull();
    });
  });

  describe('Bereiche hinter ihren Adressen', () => {
    it('zeigt office im Verlauf die Behandlungsdokumentation (E15, ROL-001)', async () => {
      akteRendern(['office'], `/patienten/${PATIENT_ID}/doku`);

      expect(
        await screen.findByRole('region', { name: 'Behandlungsdokumentation' }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(fetchPatientTreatmentNotesPage).toHaveBeenCalledWith(PATIENT_ID, null),
      );
    });

    it.each([['owner'], ['therapist'], ['team_lead']] as const)(
      'zeigt %s im Verlauf die Behandlungsdokumentation',
      async (role) => {
        akteRendern([role], `/patienten/${PATIENT_ID}/doku`);

        expect(
          await screen.findByRole('region', { name: 'Behandlungsdokumentation' }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('region', { name: 'Behandlungsnachweis' }),
        ).not.toBeInTheDocument();
      },
    );

    it('holt die Dokumentation erst, wenn der Verlauf geoeffnet ist', async () => {
      akteRendern(['therapist']);
      await screen.findByRole('heading', { name: 'Max Mustermann' });

      // Der Einstieg fuehrt in die Termine, nicht in den Verlauf: Jeder
      // gelesene Eintrag der klinischen Sicht wird protokolliert (ADR-010) -
      // ein Auditeintrag fuer etwas, das niemand sieht, waere falsch.
      expect(fetchPatientTreatmentNotesPage).not.toHaveBeenCalled();
    });
  });

  // UI-Redesign Schritt 5 (Design-Handoff 2026-10-01, Abschnitt 7).
  describe('Kacheln im Kopf, keine Kontextspalte', () => {
    const grundlage: VerordnungenApi.TreatmentBasis = {
      id: '99999999-9999-4999-8999-000000000001',
      prescriber_id: null,
      prescriber_name: 'Dr. Synthetisch Roth',
      prescriber_practice_name: null,
      treatment_basis_kind: 'first',
      issued_on: '2026-09-20',
      frequency_note: null,
      note: null,
      items: [],
      updated_at: '2026-09-20T10:00:00.000000+00',
    };
    const aeltere: VerordnungenApi.TreatmentBasis = {
      ...grundlage,
      id: '99999999-9999-4999-8999-000000000002',
      issued_on: '2026-03-01',
      prescriber_name: 'Dr. Synthetisch Alt',
    };
    const kontingent: VerordnungenApi.TreatmentBasisKontingent = {
      treatment_basis_id: grundlage.id,
      prescribed: 6,
      used: 1,
      planned: 4,
      upcoming: 3,
      remaining: 2,
      covered: 4,
      uncovered: 0,
    };

    it('führt keine Kontextspalte mehr - Kontakt steht in den Stammdaten', async () => {
      // Akte entschlacken (2026-10-03): Kontakt und Grundlage standen unter
      // jedem Bereich ein zweites Mal.
      fetchPatient.mockResolvedValue({ ...aktiv, phone_mobile: '+49 160 0000005' });
      fetchPatientTreatmentBases.mockResolvedValue([aeltere, grundlage]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent]);
      akteRendern(['therapist'], `/patienten/${PATIENT_ID}/doku`);

      await screen.findByRole('heading', { name: 'Max Mustermann' });
      await waitFor(() => expect(fetchPatientTreatmentBases).toHaveBeenCalled());
      expect(screen.queryByRole('complementary', { name: 'Zur Person' })).toBeNull();
      expect(screen.queryByRole('link', { name: '+49 160 0000005' })).toBeNull();
      expect(screen.queryByText('Dr. Synthetisch Roth')).toBeNull();
    });

    it('zeigt im Terminbereich den nächsten Termin und die Grundlage als Kacheln', async () => {
      fetchPatientTreatmentBases.mockResolvedValue([grundlage]);
      fetchPatientTreatmentBasisSlots.mockResolvedValue([kontingent]);
      fetchPatientAppointments.mockResolvedValue([
        {
          id: '77777777-7777-4777-8777-000000000001',
          starts_at: '2027-05-12T07:10:00.000Z',
          ends_at: '2027-05-12T08:10:00.000Z',
          appointment_type: 'home_visit',
          status: 'confirmed',
          staff_given_name: 'Anna',
          staff_family_name: 'Beispiel',
          notification_channels: [],
          organization_time_zone: 'Europe/Berlin',
          treatment_basis_id: grundlage.id,
          treatment_basis_kind: 'first',
          treatment_basis_issued_on: '2026-09-20',
          treatment_basis_covered: true,
        },
      ]);
      akteRendern(['office'], `/patienten/${PATIENT_ID}/termine`);

      const naechster = (await screen.findByText('Nächster Termin')).parentElement!;
      expect(naechster).toHaveTextContent('09:10–10:10 Uhr');
      expect(naechster).toHaveTextContent('Anna Beispiel');
      expect(naechster).not.toHaveTextContent('Hausbesuch');
      const kachel = (await screen.findByText('1 von 6 verbraucht')).closest('div')!;
      expect(kachel).toHaveTextContent('Erstverordnung vom 20.09.2026');
    });
  });
});
