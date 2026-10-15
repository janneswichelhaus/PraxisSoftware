import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import * as api from './api';
import { BreakdownPage } from './BreakdownPage';
import { testDetail, testFlotte, testRad } from './testdaten';
import { rendereSeite } from './testseite';

vi.mock('./bike3d/BikeModel3D', async () => ({
  BikeModel3D: (await import('./Testbausteine')).RadStellvertreter,
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchFleet: vi.fn(),
  fetchBike: vi.fn(),
  recordBreakdown: vi.fn(),
}));

const fetchFleet = vi.mocked(api.fetchFleet);
const fetchBike = vi.mocked(api.fetchBike);
const recordBreakdown = vi.mocked(api.recordBreakdown);

const RAD = testRad();

function oeffne(pfad = `/betrieb/flotte/panne?rad=${RAD.id}`) {
  return rendereSeite(
    '/betrieb/flotte/panne',
    <BreakdownPage user={testUser(['therapist'])} />,
    pfad,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchFleet.mockResolvedValue(testFlotte());
  fetchBike.mockResolvedValue(
    testDetail({ bike: RAD, spots: [], checkups: [], breakdowns: [], blocks: [] }),
  );
  recordBreakdown.mockResolvedValue({
    breakdownId: 'panne-neu',
    spotIds: ['stelle-neu'],
    blocked: false,
  });
});

/**
 * Panne melden (FLT-EPIC-001, Handoff Abschnitt 4 und AC 4): zuerst „Wo ist
 * der Schaden?“, „Weiter“ auch ohne Stelle, danach der Ablauf der Vorlage
 * (`pannenablauf.ts`, eigene Tests); die Stellen stehen in der Meldung.
 */
describe('Panne melden', () => {
  it('beginnt mit „Wo ist der Schaden?“ und geht auch ohne Stelle weiter', async () => {
    const nutzer = userEvent.setup();
    const { container } = oeffne();
    expect(await screen.findByRole('heading', { name: 'Wo ist der Schaden?' })).toBeInTheDocument();
    expect(screen.getByText('Panne melden · Lastenrad 1')).toBeInTheDocument();
    await screen.findByTestId('rad3d');
    await pruefeBarrierefreiheit(container);
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(
      await screen.findByRole('heading', { name: 'Ist die Weiterfahrt gehindert?' }),
    ).toBeInTheDocument();
    // Zurück führt vor die erste Frage der Vorlage.
    await nutzer.click(screen.getByRole('button', { name: '← Zurück' }));
    expect(screen.getByRole('heading', { name: 'Wo ist der Schaden?' })).toBeInTheDocument();
  });

  it('sperrt „Weiter“, solange eine Stelle offen ist; jede Stelle ist ein Schaden', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(await screen.findByRole('button', { name: 'Bremse vorne antippen' }));
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeDisabled();
    expect(
      screen.getByText('Setzen oder verwerfen Sie zuerst die offene Stelle.'),
    ).toBeInTheDocument();
    // Keine Einstufung in der Pannenmeldung (Handoff, Vorschlag 4).
    expect(screen.queryByRole('group', { name: 'Bewertung der Stelle' })).toBeNull();
    await nutzer.type(screen.getByLabelText('Was ist passiert?'), 'schleift');
    await nutzer.click(screen.getByRole('button', { name: 'Stelle setzen' }));
    expect(screen.getByTestId('nadeln')).toHaveTextContent('1:bremse-vorne:problem');
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeEnabled();
  });

  it('füllt „Was ist auffällig?“ aus den Stellen vor und meldet ohne Sperre', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(await screen.findByRole('button', { name: 'Bremse vorne antippen' }));
    await nutzer.type(screen.getByLabelText('Was ist passiert?'), 'schleift');
    await nutzer.click(screen.getByRole('button', { name: 'Stelle setzen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Nein' }));

    expect(screen.getByLabelText('Was ist auffällig?')).toHaveValue('Bremse vorne: schleift');
    expect(
      screen.getByText('Diese Meldung sperrt das Rad nicht. Es bleibt in der Planung verfügbar.'),
    ).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Melden' }));

    expect(recordBreakdown).toHaveBeenCalledWith({
      bikeId: RAD.id,
      outcome: 'meldungOhneSperre',
      summary: 'Weiterfahrt möglich: Bremse vorne: schleift',
      remark: '',
      locationNote: '',
      transport: null,
      spots: [
        { zone: 'bremse-vorne', severity: 'problem', point: [1.05, 0.31, -0.06], note: 'schleift' },
      ],
    });
    expect(await screen.findByTestId('ziel-meldung')).toHaveTextContent(
      'Panne gemeldet. Lastenrad 1 bleibt in der Planung.',
    );
  });

  it('nennt beim Load 60 den Riemenriss, nicht den Kettenriss (Vorschlag 8)', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.click(await screen.findByRole('button', { name: 'Weiter' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Ja' }));
    expect(
      screen.getByText(
        'Klein: Reifen, Gangschaltung. Groß: Elektronik, Riemenriss, Ausfall beider Bremsen.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Kettenriss/)).toBeNull();
  });

  it('hält den Ort des zurückgelassenen Rads aus dem Abschluss heraus (ANN-558)', async () => {
    const nutzer = userEvent.setup();
    recordBreakdown.mockResolvedValue({ breakdownId: 'p', spotIds: [], blocked: true });
    oeffne();
    await nutzer.click(await screen.findByRole('button', { name: 'Weiter' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Ja' })); // gehindert
    await nutzer.click(screen.getByRole('button', { name: 'Groß' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja' })); // Ruhetag
    await nutzer.click(screen.getByRole('button', { name: 'Nein' })); // Depot nicht erreichbar
    await nutzer.type(screen.getByLabelText('Standort / Adresse'), 'Hinterhof Beispielweg 3');
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    await nutzer.click(screen.getByRole('button', { name: 'Nein' })); // kein Führerschein
    // Die Zusammenfassung zeigt den Ort - zum Prüfen vor dem Bestätigen.
    expect(screen.getByText('Standort: Hinterhof Beispielweg 3')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: /Bestätigen/ }));

    const eingabe = recordBreakdown.mock.calls[0]![0];
    expect(eingabe.outcome).toBe('transportFortsetzung');
    expect(eingabe.summary).not.toContain('Hinterhof');
    expect(eingabe.locationNote).toBe('Hinterhof Beispielweg 3');
    expect(eingabe.transport).toBe('fahrdienst');
    expect(await screen.findByTestId('ziel-meldung')).toHaveTextContent(
      'Panne gemeldet. Lastenrad 1 ist in Reparatur und steht nicht mehr in der Planung.',
    );
  });

  it('beginnt ohne Rad mit der Wahl - das eigene vorbelegt, nie übersprungen', async () => {
    const nutzer = userEvent.setup();
    oeffne('/betrieb/flotte/panne');
    expect(
      await screen.findByRole('heading', { name: 'Welches Rad betrifft es?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rad' })).toHaveValue(RAD.id);
    expect(screen.getByText('Panne melden · Rad noch nicht ausgewählt')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(await screen.findByRole('heading', { name: 'Wo ist der Schaden?' })).toBeInTheDocument();
  });
});
