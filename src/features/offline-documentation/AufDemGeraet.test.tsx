import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import {
  dauerfachAendern,
  fachAendern,
  speicherImSpeicher,
  speicherSetzen,
} from '@/lib/geraeteablage';
import { AufDemGeraet, type Serverwege } from './AufDemGeraet';
import {
  entwuerfeLesen,
  entwuerfeUebertragen,
  entwuerfeZuruecksetzen,
  entwurfSchreiben,
  type EntwurfSender,
} from './entwuerfe';
import { einrichten } from './servicePhone';
import { tagesplanAblegen } from './tagesplan';
import type { DayPlanEntry } from '@/features/today/api';

/** OFF-002: Schreiben auf dem Gerät, Zustände und Wege im Konflikt (ADR-024 Punkte 6 bis 8). */

const ANNA = 'konto-anna';
const ZONE = 'Europe/Berlin';
const HEUTE = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());
const KOPF = {
  beginn: `${HEUTE}T08:00:00Z`,
  ende: `${HEUTE}T08:45:00Z`,
  zeitzone: ZONE,
  name: 'Erika Beispiel',
  terminart: 'home_visit',
};

function eintrag(teil: Partial<DayPlanEntry>): DayPlanEntry {
  return {
    id: 't1',
    patient_id: 'p1',
    staff_member_id: 's1',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: `${HEUTE}T08:00:00Z`,
    ends_at: `${HEUTE}T08:45:00Z`,
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: null,
    visit_street: 'Musterweg',
    visit_house_number: '3',
    visit_postal_code: '72070',
    visit_city: 'Tübingen',
    patient_phone: '07071 000000',
    patient_phone_mobile: null,
    home_visit_access_note: null,
    special_note: null,
    documentation_status: null,
    organization_time_zone: ZONE,
    ...teil,
  };
}

/** Übertragen in einer Sitzung dieses Kontos (Zweitreview B2). */
function uebertragenAls(senden: EntwurfSender) {
  return entwuerfeUebertragen(ANNA, senden, () => Promise.resolve(ANNA));
}

beforeEach(async () => {
  speicherSetzen(speicherImSpeicher());
  entwuerfeZuruecksetzen();
  await einrichten(ANNA);
  await tagesplanAblegen(ANNA, ZONE, HEUTE, [
    eintrag({}),
    eintrag({ id: 't2', status: 'cancelled', patient_given_name: 'Max' }),
  ]);
});

describe('AufDemGeraet', () => {
  it('ohne Verbindung: Tagesplan lesen, am Termin schreiben, liegt danach auf dem Gerät', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AufDemGeraet besitzer={ANNA} ohneVerbindung />);
    expect(await screen.findAllByText(/Musterweg 3, 72070 Tübingen/)).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: '07071 000000' })[0]).toHaveAttribute(
      'href',
      'tel:07071000000',
    );
    // Am abgesagten Termin entsteht keine Dokumentation (wie online).
    expect(screen.getAllByRole('button', { name: 'Ohne Verbindung schreiben' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Ohne Verbindung schreiben' }));
    await user.type(
      await screen.findByLabelText('Behandlungsdokumentation'),
      'Synthetisch: Gangschule.',
    );
    await user.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(await screen.findByText(/Noch nicht übertragen: ein Entwurf/)).toBeInTheDocument();
    expect((await entwuerfeLesen(ANNA))[0]).toMatchObject({
      terminId: 't1',
      text: 'Synthetisch: Gangschule.',
      kopf: { name: 'Erika Beispiel' },
    });
    expect(screen.getAllByRole('button', { name: 'Weiterschreiben' }).length).toBeGreaterThan(0);
  });

  it('mit Verbindung führt der Termin zur gewohnten Schreibseite', async () => {
    const wege: Serverwege = {
      zurDokumentation: (t) => `/termine/${t}/dokumentation`,
      alsNachtrag: vi.fn(),
      inKorrektur: vi.fn(),
      fassungLesen: vi.fn(),
    };
    renderWithProviders(<AufDemGeraet besitzer={ANNA} ohneVerbindung={false} serverwege={wege} />);
    expect(await screen.findByRole('link', { name: 'Zur Dokumentation' })).toHaveAttribute(
      'href',
      '/termine/t1/dokumentation',
    );
    expect(screen.queryByRole('button', { name: 'Ohne Verbindung schreiben' })).toBeNull();
  });

  it('Konflikt an finalisierter Dokumentation: Nachtrag übernimmt und lässt den Entwurf fallen', async () => {
    const user = userEvent.setup();
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: offline.');
    await uebertragenAls(() =>
      Promise.resolve({ status: 'conflict', note_id: 'n1', note_status: 'final' }),
    );
    const alsNachtrag = vi.fn(() => Promise.resolve());
    const inKorrektur = vi.fn();
    renderWithProviders(
      <AufDemGeraet
        besitzer={ANNA}
        ohneVerbindung={false}
        serverwege={{
          zurDokumentation: (t) => `/x/${t}`,
          alsNachtrag,
          inKorrektur,
          fassungLesen: () => Promise.resolve('Synthetisch: Fassung der Praxis.'),
        }}
      />,
    );
    const karte = (await screen.findByText(/finalisierte Dokumentation/)).closest('article')!;
    expect(within(karte).getByText('Synthetisch: offline.')).toBeInTheDocument();
    // Beide Fassungen (ADR-024 Punkt 7): die der Praxis erst auf Tipp.
    await user.click(within(karte).getByRole('button', { name: 'Fassung der Praxis zeigen' }));
    expect(await within(karte).findByText('Synthetisch: Fassung der Praxis.')).toBeInTheDocument();
    await user.click(within(karte).getByRole('button', { name: 'In Korrektur übernehmen' }));
    expect(inKorrektur).toHaveBeenCalledWith('t1', 'n1', 'Synthetisch: offline.');
    // Die Korrektur nimmt ihn nicht vom Gerät - erst ausdrücklich oder per Nachtrag.
    expect(await entwuerfeLesen(ANNA)).toHaveLength(1);
    await user.click(within(karte).getByRole('button', { name: 'Als Nachtrag übernehmen' }));
    expect(alsNachtrag).toHaveBeenCalledWith('t1', 'n1', 'Synthetisch: offline.');
    await waitFor(async () => expect(await entwuerfeLesen(ANNA)).toHaveLength(0));
  });

  it('abgewiesen: Grund und Text bleiben, Verwerfen nur nach Rückfrage', async () => {
    const user = userEvent.setup();
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: abgesagt.');
    const { EntwurfAbgewiesen, ENTWURF_ABWEISUNG } = await import('./api');
    await uebertragenAls(() => Promise.reject(new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.abgesagt)));
    renderWithProviders(<AufDemGeraet besitzer={ANNA} ohneVerbindung />);
    expect(await screen.findByText(/Der Termin wurde abgesagt/)).toBeInTheDocument();
    expect(screen.getByText('Synthetisch: abgesagt.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(await entwuerfeLesen(ANNA)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Endgültig verwerfen' }));
    await waitFor(async () => expect(await entwuerfeLesen(ANNA)).toHaveLength(0));
  });

  it('abgewiesen: mit Verbindung erneut senden, ohne Verbindung nicht (BEF-150)', async () => {
    const user = userEvent.setup();
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: abgesagt.');
    const { EntwurfAbgewiesen, ENTWURF_ABWEISUNG } = await import('./api');
    await uebertragenAls(() => Promise.reject(new EntwurfAbgewiesen(ENTWURF_ABWEISUNG.abgesagt)));
    const { unmount } = renderWithProviders(<AufDemGeraet besitzer={ANNA} ohneVerbindung />);
    expect(await screen.findByText(/Der Termin wurde abgesagt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Erneut senden' })).toBeNull();
    unmount();
    const wege: Serverwege = {
      zurDokumentation: (t) => `/termine/${t}/dokumentation`,
      alsNachtrag: vi.fn(),
      inKorrektur: vi.fn(),
      fassungLesen: vi.fn(),
    };
    renderWithProviders(<AufDemGeraet besitzer={ANNA} ohneVerbindung={false} serverwege={wege} />);
    await user.click(await screen.findByRole('button', { name: 'Erneut senden' }));
    await waitFor(async () =>
      expect((await entwuerfeLesen(ANNA))[0]).toMatchObject({ zustand: 'wartet', grund: null }),
    );
    // Wieder wartend: der Grund der Abweisung ist weg, der Text bleibt.
    await waitFor(() => expect(screen.queryByText(/Der Termin wurde abgesagt/)).toBeNull());
    expect(screen.getByText('Synthetisch: abgesagt.')).toBeInTheDocument();
  });

  it('nennt Einträge, die diese Fassung nicht lesen kann (BEF-150)', async () => {
    await dauerfachAendern(ANNA, 'entwuerfe', () => ({ entwuerfe: [], unlesbar: [{ x: 1 }, {}] }));
    renderWithProviders(<AufDemGeraet besitzer={ANNA} ohneVerbindung />);
    expect(
      await screen.findByText(/2 Einträge, die diese Fassung der Anwendung nicht lesen kann/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Nicht alles ist übertragen. Bitte unten ansehen.'),
    ).toBeInTheDocument();
  });

  it('ohne Tagesplan bleiben Entwürfe lesbar (Kopf am Entwurf)', async () => {
    await fachAendern(ANNA, 'tagesplan', () => undefined);
    await entwurfSchreiben(ANNA, 't1', KOPF, 'Synthetisch: gestern.');
    renderWithProviders(<AufDemGeraet besitzer={ANNA} ohneVerbindung />);
    expect(await screen.findByText(/Erika Beispiel/)).toBeInTheDocument();
    expect(
      screen.getByText('Auf diesem Gerät liegt kein Tagesplan von heute.'),
    ).toBeInTheDocument();
  });
});
