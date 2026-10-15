import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import * as api from './api';
import { CHECK_ITEMS } from './bike3d/zones';
import { CheckupPage } from './CheckupPage';
import { testDetail, testFlotte, testRad, testStelle } from './testdaten';
import { rendereSeite } from './testseite';

vi.mock('./bike3d/BikeModel3D', async () => ({
  BikeModel3D: (await import('./Testbausteine')).RadStellvertreter,
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchFleet: vi.fn(),
  fetchBike: vi.fn(),
  recordCheckup: vi.fn(),
}));

const fetchFleet = vi.mocked(api.fetchFleet);
const fetchBike = vi.mocked(api.fetchBike);
const recordCheckup = vi.mocked(api.recordCheckup);

const RAD = testRad();

function oeffne(pfad = `/betrieb/flotte/checkup?rad=${RAD.id}`) {
  return rendereSeite(
    '/betrieb/flotte/checkup',
    <CheckupPage user={testUser(['therapist'])} />,
    pfad,
  );
}

function bewertung(pruefpunkt: string) {
  return within(screen.getByRole('group', { name: pruefpunkt }));
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchFleet.mockResolvedValue(testFlotte());
  fetchBike.mockResolvedValue(
    testDetail({ bike: RAD, spots: [], checkups: [], breakdowns: [], blocks: [] }),
  );
  recordCheckup.mockResolvedValue({ checkupId: 'checkup-neu', spotIds: ['stelle-neu'] });
});

/**
 * Fahrrad-Check-Up (FLT-EPIC-001, Handoff Lastenrad 3D Abschnitt 4 und AC 1
 * bis 3): Antippen legt eine Stelle mit dem Bauteil an, derselbe Weg geht
 * über die Bauteil-Liste, eine Stelle hebt ihren Prüfpunkt an und nie ab,
 * gespeichert wird erst nach der Bestätigung.
 */
describe('Fahrrad-Check-Up', () => {
  it('hat die zwölf Prüfpunkte der Bauart, alle auf „In Ordnung“', async () => {
    const { container } = oeffne();
    expect(await screen.findByRole('heading', { name: 'Fahrrad-Check-Up' })).toBeInTheDocument();
    await screen.findByRole('group', { name: 'Reifen und Luftdruck' });
    for (const item of CHECK_ITEMS) {
      expect(bewertung(item.label).getByRole('radio', { name: 'In Ordnung' })).toBeChecked();
    }
    await pruefeBarrierefreiheit(container);
  });

  it('legt mit einem Tipp am Rad eine Stelle an und hebt den Prüfpunkt an (AC 1, 3)', async () => {
    const nutzer = userEvent.setup();
    const { container } = oeffne();
    await nutzer.click(await screen.findByRole('button', { name: 'Bremse vorne antippen' }));
    const stelle = screen.getByRole('group', { name: 'Bremse vorne' });
    expect(within(stelle).getByText('Gehört zum Prüfpunkt „Bremsen“.')).toBeInTheDocument();
    expect(screen.getByTestId('neue-nadel')).toHaveTextContent('1:bremse-vorne');
    // Ohne Stelle in der Pannenmeldung gibt es keine Einstufung - hier schon.
    expect(within(stelle).getByRole('radio', { name: 'Problem' })).toBeChecked();
    await pruefeBarrierefreiheit(container);

    await nutzer.type(within(stelle).getByLabelText('Notiz zur Stelle'), 'schleift');
    await nutzer.click(within(stelle).getByRole('button', { name: 'Stelle setzen' }));

    expect(bewertung('Bremsen').getByRole('radio', { name: 'Problem' })).toBeChecked();
    expect(screen.getByText('Am Rad markiert: Stelle 1')).toBeInTheDocument();
    expect(screen.getByTestId('nadeln')).toHaveTextContent('1:bremse-vorne:problem');
    // Nie abheben: „In Ordnung“ bei einer Stelle „Problem“ bleibt „Problem“.
    await nutzer.click(bewertung('Bremsen').getByText('In Ordnung'));
    expect(bewertung('Bremsen').getByRole('radio', { name: 'Problem' })).toBeChecked();
  });

  it('legt dieselbe Stelle ohne 3D-Rad über die Bauteil-Liste an (AC 1, AC 7)', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(await screen.findByRole('button', { name: 'Bauteil aus Liste wählen' }));
    const bauteil = screen.getByRole('combobox', { name: 'Bauteil' });
    expect(bauteil).toHaveFocus();
    await nutzer.selectOptions(bauteil, 'rahmen');
    const stelle = screen.getByRole('group', { name: 'Rahmen' });
    expect(
      within(stelle).getByText('Kein eigener Prüfpunkt. Wird als weitere Stelle festgehalten.'),
    ).toBeInTheDocument();
    await nutzer.click(within(stelle).getByText('Beobachten'));
    await nutzer.click(within(stelle).getByRole('button', { name: 'Stelle setzen' }));
    expect(screen.getByText(/weitere Stelle/)).toBeInTheDocument();
    expect(
      screen.getByText('0 Probleme · 1 zu beobachten · 1 Stelle am Rad markiert'),
    ).toBeInTheDocument();
  });

  it('zählt neue Stellen nach den schon offenen des Rads weiter (ANN-555)', async () => {
    const nutzer = userEvent.setup();
    fetchBike.mockResolvedValue(
      testDetail({ bike: RAD, spots: [testStelle({ id: 'alt', number: 1, zone: 'riemen' })] }),
    );
    oeffne();
    expect(await screen.findByTestId('nadeln')).toHaveTextContent('1:riemen:problem');
    await nutzer.click(screen.getByRole('button', { name: 'Bremse vorne antippen' }));
    expect(screen.getByTestId('neue-nadel')).toHaveTextContent('2:bremse-vorne');
    expect(screen.getByText('Schon offen am Rad')).toBeInTheDocument();
  });

  it('speichert erst nach der Bestätigung und nie mit einer offenen Stelle', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    const speichern = await screen.findByRole('button', { name: 'Check-Up speichern' });
    expect(speichern).toBeDisabled();
    expect(screen.getByText('Die Bestätigung fehlt noch.')).toBeInTheDocument();

    await nutzer.click(
      screen.getByRole('checkbox', { name: /Ich, Anna Beispiel, habe das ganze Rad/ }),
    );
    expect(speichern).toBeEnabled();

    await nutzer.click(screen.getByRole('button', { name: 'Bremse vorne antippen' }));
    expect(speichern).toBeDisabled();
    expect(
      screen.getByText('Eine Stelle ist noch offen. Setzen oder verwerfen Sie sie zuerst.'),
    ).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Stelle setzen' }));
    expect(speichern).toBeEnabled();

    await nutzer.click(speichern);
    expect(recordCheckup).toHaveBeenCalledTimes(1);
    const eingabe = recordCheckup.mock.calls[0]![0];
    expect(eingabe.bikeId).toBe(RAD.id);
    expect(eingabe.items).toHaveLength(12);
    expect(eingabe.items.find((item) => item.key === 'bremsen')?.rating).toBe('problem');
    expect(eingabe.spots).toEqual([
      { zone: 'bremse-vorne', severity: 'problem', point: [1.05, 0.31, -0.06], note: '' },
    ]);
    // Danach das Rad mit seinen Stellen und der Bestätigung.
    expect(await screen.findByTestId('ziel')).toHaveTextContent(
      `/betrieb/flotte/rad/${RAD.id}?bereich=stellen`,
    );
    expect(screen.getByTestId('ziel-meldung')).toHaveTextContent('Check-Up gespeichert.');
  });

  it('beginnt ohne Rad mit der Wahl, das eigene vorbelegt, nie übersprungen (VOR-18)', async () => {
    const nutzer = userEvent.setup();
    oeffne('/betrieb/flotte/checkup');
    const rad = await screen.findByRole('combobox', { name: 'Rad' });
    expect(rad).toHaveValue(RAD.id);
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(await screen.findByRole('group', { name: 'Bremsen' })).toBeInTheDocument();
  });
});
