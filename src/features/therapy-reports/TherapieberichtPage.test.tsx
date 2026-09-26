import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type * as BerichtApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import type { RoleKey } from '@/features/session/types';

const fetchBericht = vi.fn();
const fetchBerichtQuellen = vi.fn();
const berichtSpeichern = vi.fn();
const berichtAbschliessen = vi.fn();
const druckVermerken = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BerichtApi>();
  return {
    ...actual,
    fetchBericht: (id: string) => fetchBericht(id) as Promise<BerichtApi.Bericht | null>,
    fetchBerichtQuellen: (id: string) =>
      fetchBerichtQuellen(id) as Promise<BerichtApi.Quellenzeile[]>,
    berichtSpeichern: (...args: unknown[]) => berichtSpeichern(...args) as Promise<string>,
    berichtAbschliessen: (...args: unknown[]) => berichtAbschliessen(...args) as Promise<void>,
    druckVermerken: (id: string) => druckVermerken(id) as Promise<void>,
  };
});

const { TherapieberichtPage } = await import('./TherapieberichtPage');
const { TherapieberichtDruckPage } = await import('./TherapieberichtDruckPage');

const PATIENT = 'p1';

function dokument(rest: Partial<BerichtApi.Berichtsdokument> = {}): BerichtApi.Berichtsdokument {
  return {
    schema_version: 1,
    praxis: {
      name: 'Physio Fiktiv',
      street: 'Musterweg',
      house_number: '1',
      postal_code: '72070',
      city: 'Tübingen',
    },
    empfaenger: {
      title: 'Dr. med.',
      given_name: 'Petra',
      family_name: 'Probst',
      practice_name: 'Orthopädische Praxis Fiktiv',
      street: 'Ärztegasse',
      house_number: '3',
      postal_code: '72070',
      city: 'Tübingen',
      fax: '+49 7071 0000402',
    },
    patient: { given_name: 'Max', family_name: 'Mustermann', date_of_birth: '1970-05-01' },
    verordnung: {
      treatment_basis_kind: 'follow_up',
      issued_on: '2026-06-18',
      diagnosis: 'Synthetisch: Schulter rechts.',
      items: [{ remedy: 'Krankengymnastik', prescribed_quantity: 10 }],
      termine_durchgefuehrt: 7,
      erster_termin: '2026-06-22',
      letzter_termin: '2026-08-03',
    },
    eintraege: [],
    koerperschema: null,
    text: null,
    empfehlung: null,
    ...rest,
  };
}

function bericht(rest: Partial<BerichtApi.Bericht> = {}): BerichtApi.Bericht {
  return {
    id: 'b1',
    patient_id: PATIENT,
    treatment_basis_id: 'v1',
    status: 'entwurf',
    report_text: null,
    recommendation: null,
    note_ids: [],
    body_chart_response_id: null,
    updated_at: '2026-09-26T10:00:00.123456+00:00',
    document: dokument(),
    ...rest,
  };
}

const quellen: BerichtApi.Quellenzeile[] = [
  {
    kind: 'eintrag',
    id: 'n1',
    occurred_on: '2026-06-22',
    author_name: 'Anna Beispiel',
    content: 'Synthetischer Befund: Abduktion rechts 90 Grad.',
    in_treatment_basis: true,
    is_addendum: false,
    body_chart: null,
  },
  {
    kind: 'eintrag',
    id: 'n0',
    occurred_on: '2026-03-01',
    author_name: 'Tim Teamleitung',
    content: 'Synthetisch: frühere Verordnung.',
    in_treatment_basis: false,
    is_addendum: false,
    body_chart: null,
  },
  {
    kind: 'koerperschema',
    id: 'q1',
    occurred_on: '2026-06-20',
    author_name: 'Anna Beispiel',
    content: null,
    in_treatment_basis: null,
    is_addendum: false,
    body_chart: [{ x: 0.3, y: 0.2, bereich: 'schulter_rechts' }],
  },
];

function zeigeFormular(rollen: RoleKey[] = ['therapist']) {
  renderWithProviders(
    <Routes>
      <Route
        path="/patienten/:patientId/berichte/:berichtId"
        element={<TherapieberichtPage user={testUser(rollen)} />}
      />
      <Route path="/patienten/:patientId/berichte/:berichtId/druck" element={<p>Druckblatt</p>} />
    </Routes>,
    `/patienten/${PATIENT}/berichte/b1`,
  );
}

function zeigeDruck(rollen: RoleKey[] = ['office']) {
  renderWithProviders(
    <Routes>
      <Route
        path="/patienten/:patientId/berichte/:berichtId/druck"
        element={<TherapieberichtDruckPage user={testUser(rollen)} />}
      />
    </Routes>,
    `/patienten/${PATIENT}/berichte/b1/druck`,
  );
}

describe('Therapiebericht schreiben', () => {
  beforeEach(() => {
    fetchBericht.mockReset();
    fetchBerichtQuellen.mockReset();
    berichtSpeichern.mockReset();
    berichtAbschliessen.mockReset();
    fetchBericht.mockResolvedValue(bericht());
    fetchBerichtQuellen.mockResolvedValue(quellen);
    berichtSpeichern.mockResolvedValue('2026-09-26T10:05:00.000000+00:00');
    berichtAbschliessen.mockResolvedValue(undefined);
  });

  it('wählt nichts vor - weder Eintrag noch Körperschema (ANN-122)', async () => {
    zeigeFormular();
    const eintrag = await screen.findByRole('checkbox', { name: /22\.06\.2026 · Anna Beispiel/ });
    expect(eintrag).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Kein Körperschema' })).toBeChecked();
    expect(screen.getByText('Zu dieser Verordnung')).toBeInTheDocument();
    expect(screen.getByText('Weitere Einträge der Akte (1)')).toBeInTheDocument();
  });

  it('speichert genau das Angekreuzte mit dem erwarteten Stand', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    await user.click(await screen.findByRole('checkbox', { name: /22\.06\.2026/ }));
    await user.click(screen.getByRole('radio', { name: /Angabe vom 20\.06\.2026/ }));
    await user.type(
      screen.getByLabelText('Empfehlung der Therapeut:in zum Verordnungsende'),
      'Synthetisch: Folgeverordnung.',
    );
    await user.click(screen.getByRole('button', { name: 'Entwurf speichern' }));

    await waitFor(() => expect(berichtSpeichern).toHaveBeenCalledTimes(1));
    expect(berichtSpeichern).toHaveBeenCalledWith(
      'b1',
      {
        text: '',
        empfehlung: 'Synthetisch: Folgeverordnung.',
        eintraege: ['n1'],
        koerperschema: 'q1',
      },
      '2026-09-26T10:00:00.123456+00:00',
    );
    expect(await screen.findByText('Entwurf gespeichert.')).toBeInTheDocument();
  });

  it('schließt mit dem Stand im Formular ab und führt auf das Druckblatt', async () => {
    const user = userEvent.setup();
    zeigeFormular();
    await user.type(await screen.findByLabelText('Bericht der Therapeut:in'), 'Synthetisch.');
    await user.click(screen.getByRole('button', { name: 'Bericht abschließen' }));
    await user.click(screen.getByRole('button', { name: 'Abschließen' }));

    await waitFor(() =>
      expect(berichtAbschliessen).toHaveBeenCalledWith('b1', '2026-09-26T10:05:00.000000+00:00'),
    );
    expect(berichtSpeichern).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Druckblatt')).toBeInTheDocument();
  });

  it('lässt den eigenen Text stehen, wenn jemand anderes zwischenzeitlich gespeichert hat', async () => {
    const { BerichtVeraendertError } = await vi.importActual<typeof BerichtApi>('./api');
    berichtSpeichern.mockRejectedValue(new BerichtVeraendertError());
    const user = userEvent.setup();
    zeigeFormular();
    const feld = await screen.findByLabelText('Bericht der Therapeut:in');
    await user.type(feld, 'Mein Text');
    await user.click(screen.getByRole('button', { name: 'Entwurf speichern' }));

    expect(
      await screen.findByText(/zwischenzeitlich von einer anderen Person/),
    ).toBeInTheDocument();
    expect(feld).toHaveValue('Mein Text');
  });

  it('führt einen abgeschlossenen Bericht auf das Druckblatt statt ins Formular', async () => {
    fetchBericht.mockResolvedValue(bericht({ status: 'abgeschlossen' }));
    zeigeFormular();
    expect(await screen.findByText('Druckblatt')).toBeInTheDocument();
    expect(fetchBerichtQuellen).not.toHaveBeenCalled();
  });
});

describe('Therapiebericht als Blatt', () => {
  beforeEach(() => {
    fetchBericht.mockReset();
    druckVermerken.mockReset();
    druckVermerken.mockResolvedValue(undefined);
  });

  it('übernimmt wörtlich, mit Quelle und Datum, und kennzeichnet keinen Entwurf', async () => {
    fetchBericht.mockResolvedValue(
      bericht({
        status: 'abgeschlossen',
        document: dokument({
          eintraege: [
            {
              note_id: 'n1',
              datum: '2026-06-22',
              verfasser: 'Anna Beispiel',
              inhalt: 'Synthetischer Befund: Abduktion rechts 90 Grad.',
              ergaenzung: false,
            },
          ],
          empfehlung: {
            inhalt: 'Synthetisch: Folgeverordnung.',
            verfasser: 'Anna Beispiel',
            datum: '2026-09-21',
          },
          abgeschlossen: { datum: '2026-09-21', von: 'Anna Beispiel' },
        }),
      }),
    );
    zeigeDruck();

    expect(await screen.findByRole('heading', { name: 'Therapiebericht' })).toBeInTheDocument();
    expect(screen.getByText('Synthetischer Befund: Abduktion rechts 90 Grad.')).toBeInTheDocument();
    expect(screen.getByText('Synthetisch: Folgeverordnung.')).toBeInTheDocument();
    expect(screen.getByText('Anna Beispiel, 21.09.2026')).toBeInTheDocument();
    expect(screen.getByText('7 Termine, 22.06.2026 bis 03.08.2026')).toBeInTheDocument();
    expect(screen.getByText('Fax +49 7071 0000402')).toBeInTheDocument();
    expect(screen.queryByText(/Entwurf — noch nicht abgeschlossen/)).not.toBeInTheDocument();
    // Office druckt, bearbeitet aber nicht.
    expect(screen.queryByRole('link', { name: 'Weiter bearbeiten' })).not.toBeInTheDocument();
  });

  it('druckt einen Entwurf nur mit Vermerk', async () => {
    fetchBericht.mockResolvedValue(bericht());
    zeigeDruck(['therapist']);
    expect(await screen.findByText(/Entwurf — noch nicht abgeschlossen/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Weiter bearbeiten' })).toBeInTheDocument();
  });

  it('vermerkt den Druck, bevor der Druckdialog aufgeht', async () => {
    const reihenfolge: string[] = [];
    druckVermerken.mockImplementation(() => {
      reihenfolge.push('vermerkt');
      return Promise.resolve();
    });
    const drucken = vi.spyOn(window, 'print').mockImplementation(() => {
      reihenfolge.push('gedruckt');
    });
    fetchBericht.mockResolvedValue(bericht({ status: 'abgeschlossen' }));
    const user = userEvent.setup();
    zeigeDruck();
    await user.click(await screen.findByRole('button', { name: 'Bericht drucken' }));

    await waitFor(() => expect(reihenfolge).toEqual(['vermerkt', 'gedruckt']));
    drucken.mockRestore();
  });

  it('öffnet keinen Druckdialog, wenn der Vermerk scheitert', async () => {
    druckVermerken.mockRejectedValue(new Error('Für diesen Schritt fehlt die Berechtigung.'));
    const drucken = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    fetchBericht.mockResolvedValue(bericht({ status: 'abgeschlossen' }));
    const user = userEvent.setup();
    zeigeDruck();
    await user.click(await screen.findByRole('button', { name: 'Bericht drucken' }));

    expect(
      await screen.findByText('Für diesen Schritt fehlt die Berechtigung.'),
    ).toBeInTheDocument();
    expect(drucken).not.toHaveBeenCalled();
    drucken.mockRestore();
  });
});
