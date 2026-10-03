import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as VermerkeApi from './vermerke';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const DATENSCHUTZ = `/patienten/${PATIENT_ID}/datenschutz`;

const fetchDatenschutzvermerke = vi.fn();
const vermerkeSpeichern = vi.fn();

vi.mock('./vermerke', async (importOriginal) => {
  const actual = await importOriginal<typeof VermerkeApi>();
  return {
    ...actual,
    fetchDatenschutzvermerke: (id: string) =>
      fetchDatenschutzvermerke(id) as Promise<VermerkeApi.Datenschutzvermerk[]>,
    vermerkeSpeichern: (v: VermerkeApi.NeuerVermerk) => vermerkeSpeichern(v) as Promise<void>,
  };
});

const { Datenschutz } = await import('./Anmeldebogen');

function seite(vermerke: VermerkeApi.Datenschutzvermerk[] = []) {
  fetchDatenschutzvermerke.mockResolvedValue(vermerke);
  return renderWithProviders(
    <Datenschutz patient={testPatient({ id: PATIENT_ID })} user={testUser(['office'])} />,
    DATENSCHUTZ,
  );
}

type Nutzer = ReturnType<typeof userEvent.setup>;

const ZWECK = {
  email_contact: 'Kontakt per E-Mail',
  prescriber_report: 'Bericht an die verordnende Praxis',
  patient_photos: 'Fotos im Behandlungsverlauf',
} as const;

/** Öffnet das Fenster eines Zwecks über seine Zeile in der Karte. */
async function fensterOeffnen(user: Nutzer, zweck: keyof typeof ZWECK) {
  const zeile = await screen.findByRole('button', {
    name: (name) => name.startsWith(ZWECK[zweck]),
  });
  await user.click(zeile);
  return screen.getByRole('dialog', { name: ZWECK[zweck] });
}

/**
 * Wählt im Fenster einen Vorgang und tippt auf den Knopf (PAT-04). Gibt den
 * Kasten der Rückfrage zurück, damit ein Test ihn prüfen kann.
 */
async function waehlenUndFragen(
  user: Nutzer,
  zweck: keyof typeof ZWECK,
  vorgang: string,
  knopf = 'Speichern',
) {
  const fenster = await fensterOeffnen(user, zweck);
  await user.click(within(fenster).getByRole('radio', { name: vorgang }));
  await user.click(within(fenster).getByRole('button', { name: knopf }));
  return within(fenster).getByRole('group', { name: knopf });
}

async function vermerken(
  user: Nutzer,
  zweck: keyof typeof ZWECK,
  vorgang: string,
  knopf = 'Speichern',
) {
  const kasten = await waehlenUndFragen(user, zweck, vorgang, knopf);
  await user.click(within(kasten).getByRole('button', { name: knopf }));
  return kasten;
}

/**
 * Datenschutz in der Akte (PAT-006).
 *
 * Geprueft wird, was die Seite anbietet und was sie an den Server gibt. Ob der
 * Server es annimmt, pruefen die Datenbanktests
 * (`supabase/tests/datenschutzvermerke.test.ts`).
 */
describe('Datenschutz der Akte', () => {
  beforeEach(() => {
    fetchDatenschutzvermerke.mockReset();
    vermerkeSpeichern.mockReset();
    vermerkeSpeichern.mockResolvedValue(undefined);
  });

  it('zeigt ohne Vermerk, dass nichts erteilt ist', async () => {
    seite();

    // Etiketten beginnen groß (WRT-16).
    expect(await screen.findAllByText('Nicht erteilt')).toHaveLength(3);
    expect(screen.getByText('Fotos im Behandlungsverlauf')).toBeInTheDocument();
  });

  // ANN-227: Datenschutzinformation und Behandlungsvertrag belegt das Foto
  // des Anmeldebogens - als Vermerk stehen sie nicht mehr zur Wahl.
  it('bietet nur noch Einwilligungen zum Vermerken an', async () => {
    seite();

    const user = userEvent.setup();
    expect(await screen.findAllByRole('button', { name: /Nicht erteilt/ })).toHaveLength(3);
    const fenster = await fensterOeffnen(user, 'email_contact');
    expect(
      within(fenster)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent),
    ).toEqual(['Einwilligung erteilt', 'Einwilligung abgelehnt']);
    expect(screen.queryByText('Datenschutzinformation')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Blätter zum Ausdrucken' })).toBeNull();
  });

  it('bietet nach einer Erteilung den Widerruf an und nicht die zweite Erteilung', async () => {
    seite([
      {
        id: 'v1',
        record_kind: 'consent_granted',
        purpose: 'email_contact',
        notice_version: null,
        occurred_on: '2026-09-01',
        recorded_at: '2026-09-01T08:00:00Z',
      },
    ]);

    const user = userEvent.setup();
    expect(await screen.findByText('Erteilt am 01.09.2026')).toBeInTheDocument();
    const fenster = await fensterOeffnen(user, 'email_contact');
    expect(
      within(fenster).getByRole('radio', { name: 'Einwilligung widerrufen' }),
    ).toBeInTheDocument();
    expect(within(fenster).queryByRole('radio', { name: 'Einwilligung erteilt' })).toBeNull();
  });

  // PAT-04: Beim Öffnen ist nichts gewählt - ein Tipp auf „Vermerken" schrieb
  // vorher eine Angabe, die sich nie mehr ändern lässt.
  it('belegt nichts vor und sperrt das Speichern bis zur Wahl', async () => {
    const user = userEvent.setup();
    seite();

    const fenster = await fensterOeffnen(user, 'email_contact');
    for (const radio of within(fenster).getAllByRole('radio')) expect(radio).not.toBeChecked();
    expect(within(fenster).getByRole('button', { name: 'Speichern' })).toBeDisabled();

    await user.click(within(fenster).getByRole('radio', { name: 'Einwilligung erteilt' }));
    expect(within(fenster).getByRole('button', { name: 'Speichern' })).toBeEnabled();
    expect(vermerkeSpeichern).not.toHaveBeenCalled();
  });

  it('vermerkt erst nach der Rückfrage, die Vorgang und Datum nennt', async () => {
    const user = userEvent.setup();
    seite();

    const fenster = await fensterOeffnen(user, 'email_contact');
    const datum = within(fenster).getByLabelText('Datum auf dem Papier');
    await user.clear(datum);
    await user.type(datum, '2026-09-15');
    await user.click(within(fenster).getByRole('radio', { name: 'Einwilligung erteilt' }));
    await user.click(within(fenster).getByRole('button', { name: 'Speichern' }));
    const kasten = within(fenster).getByRole('group', { name: 'Speichern' });

    expect(kasten).toHaveTextContent(
      'Vermerken: Einwilligung erteilt – Kontakt per E-Mail, 15.09.2026. Vermerke lassen sich nicht ändern.',
    );
    expect(vermerkeSpeichern).not.toHaveBeenCalled();

    // Abbrechen schreibt nichts.
    await user.click(within(kasten).getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('group', { name: 'Speichern' })).not.toBeInTheDocument();
    expect(vermerkeSpeichern).not.toHaveBeenCalled();
  });

  it('vermerkt eine Einwilligung mit Datum und ohne Fassung', async () => {
    const user = userEvent.setup();
    seite();

    const fenster = await fensterOeffnen(user, 'email_contact');
    const datum = within(fenster).getByLabelText('Datum auf dem Papier');
    await user.clear(datum);
    await user.type(datum, '2026-09-15');
    await user.click(within(fenster).getByRole('radio', { name: 'Einwilligung erteilt' }));
    await user.click(within(fenster).getByRole('button', { name: 'Speichern' }));
    await user.click(
      within(within(fenster).getByRole('group', { name: 'Speichern' })).getByRole('button', {
        name: 'Speichern',
      }),
    );

    await waitFor(() =>
      expect(vermerkeSpeichern).toHaveBeenCalledWith({
        patientId: PATIENT_ID,
        art: 'consent_granted',
        zweck: 'email_contact',
        datum: '2026-09-15',
      }),
    );
    // Eine Bestätigung als Erfolg mit Zeichen (UIK-21).
    const meldung = await screen.findByRole('status', {
      name: (_name, element) =>
        element.textContent?.includes('Vermerkt: Einwilligung erteilt.') ?? false,
    });
    expect(meldung).toHaveTextContent('✓');
    // Danach ist das Fenster zu - kein zweiter Tipp schreibt denselben Vermerk.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gibt einen Widerruf mit Zweck und ohne Fassung weiter', async () => {
    const user = userEvent.setup();
    seite([
      {
        id: 'v1',
        record_kind: 'consent_granted',
        purpose: 'prescriber_report',
        notice_version: null,
        occurred_on: '2026-09-01',
        recorded_at: '2026-09-01T08:00:00Z',
      },
    ]);

    await vermerken(user, 'prescriber_report', 'Einwilligung widerrufen');

    await waitFor(() =>
      expect(vermerkeSpeichern).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'consent_withdrawn', zweck: 'prescriber_report' }),
      ),
    );
    expect(vermerkeSpeichern.mock.calls[0]![0]).not.toHaveProperty('fassung');
  });

  it('vermerkt eine Ablehnung und bietet sie danach nicht noch einmal an (ADR-017 Punkt 35)', async () => {
    const user = userEvent.setup();
    const { unmount } = seite();

    await vermerken(user, 'patient_photos', 'Einwilligung abgelehnt');
    await waitFor(() =>
      expect(vermerkeSpeichern).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'consent_refused', zweck: 'patient_photos' }),
      ),
    );
    unmount();

    seite([
      {
        id: 'v1',
        record_kind: 'consent_refused',
        purpose: 'patient_photos',
        notice_version: null,
        occurred_on: '2026-09-01',
        recorded_at: '2026-09-01T08:00:00Z',
      },
    ]);
    expect(await screen.findByText('Abgelehnt am 01.09.2026')).toBeInTheDocument();
    const fenster = await fensterOeffnen(userEvent.setup(), 'patient_photos');
    expect(within(fenster).queryByRole('radio', { name: 'Einwilligung abgelehnt' })).toBeNull();
    expect(
      within(fenster).getByRole('radio', { name: 'Einwilligung erteilt' }),
    ).toBeInTheDocument();
  });

  it('fragt vor dem Widerruf der Fotoeinwilligung und sagt, dass die Fotos sofort geloescht werden', async () => {
    const user = userEvent.setup();
    seite([
      {
        id: 'v1',
        record_kind: 'consent_granted',
        purpose: 'patient_photos',
        notice_version: null,
        occurred_on: '2026-09-01',
        recorded_at: '2026-09-01T08:00:00Z',
      },
    ]);

    const fenster = await fensterOeffnen(user, 'patient_photos');
    await user.click(within(fenster).getByRole('radio', { name: 'Einwilligung widerrufen' }));
    // Der Hinweis im Fenster nennt dieselbe Sache wie die übrige Anwendung und
    // steht im richtigen Numerus (PAT-17, WRT-19).
    const hinweis = screen.getByText(/alle Fotos dieser Person sofort gelöscht/);
    expect(hinweis).toHaveTextContent('außer eine Löschsperre hält sie');
    expect(hinweis).toHaveTextContent('Neue Fotos brauchen eine neue Einwilligung.');

    await user.click(screen.getByRole('button', { name: 'Widerruf vermerken und Fotos löschen' }));
    const kasten = screen.getByRole('group', { name: 'Widerruf vermerken und Fotos löschen' });
    // Erst die Rückfrage, dann der Widerruf (PAT-04).
    expect(vermerkeSpeichern).not.toHaveBeenCalled();
    expect(kasten).toHaveTextContent('Alle Fotos dieser Person werden sofort gelöscht');

    await user.click(
      within(kasten).getByRole('button', { name: 'Widerruf vermerken und Fotos löschen' }),
    );
    await waitFor(() =>
      expect(vermerkeSpeichern).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'consent_withdrawn', zweck: 'patient_photos' }),
      ),
    );
  });

  it('zeigt die Abweisung des Servers verstaendlich in der Rückfrage', async () => {
    const user = userEvent.setup();
    vermerkeSpeichern.mockRejectedValue(new Error('Das Datum darf nicht in der Zukunft liegen.'));
    seite();

    const kasten = await vermerken(user, 'email_contact', 'Einwilligung erteilt');

    expect(await within(kasten).findByRole('alert')).toHaveTextContent(
      'Das Datum darf nicht in der Zukunft liegen.',
    );
    // Der Kasten bleibt offen, nichts ist vermerkt.
    expect(screen.getByRole('group', { name: 'Speichern' })).toBeInTheDocument();
    expect(screen.queryByText(/^Vermerkt:/)).not.toBeInTheDocument();
  });

  it('bietet nach einem Ladefehler einen neuen Versuch an', async () => {
    const user = userEvent.setup();
    fetchDatenschutzvermerke.mockRejectedValueOnce(new Error('offline'));
    fetchDatenschutzvermerke.mockResolvedValueOnce([]);
    renderWithProviders(
      <Datenschutz patient={testPatient({ id: PATIENT_ID })} user={testUser(['office'])} />,
    );

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Die Datenschutzvermerke konnten nicht geladen werden.');
    expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen');
    await user.click(within(meldung).getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findAllByText('Nicht erteilt')).toHaveLength(3);
  });

  it('klappt den Verlauf mit Anzahl ein und zeigt die Beschreibung erst im Fenster', async () => {
    const user = userEvent.setup();
    seite([
      {
        id: 'v1',
        record_kind: 'consent_granted',
        purpose: 'email_contact',
        notice_version: null,
        occurred_on: '2026-09-01',
        recorded_at: '2026-09-01T08:00:00Z',
      },
    ]);

    const verlauf = (await screen.findByText('Verlauf (1)')).closest('details')!;
    expect(verlauf).not.toHaveAttribute('open');
    expect(screen.queryByText(/nach Hinweis auf das Risiko/)).toBeNull();

    const fenster = await fensterOeffnen(user, 'email_contact');
    expect(within(fenster).getByText(/nach Hinweis auf das Risiko/)).toBeInTheDocument();
  });

  it('besteht die Barrierefreiheitspruefung', async () => {
    const { container } = seite();
    await screen.findByText('Fotos im Behandlungsverlauf');
    await pruefeBarrierefreiheit(container);
  });
});
