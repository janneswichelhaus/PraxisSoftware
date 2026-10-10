import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DokumentationApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const DOKU_ID = '99999999-9999-4999-8999-000000000001';
const NACHTRAG_ID = '99999999-9999-4999-8999-000000000002';

/** Praxistermin am 12.05.2027, 09:00-10:00 Ortszeit Europe/Berlin (CEST, +02:00). */
const termin = testAppointment({
  id: TERMIN_ID,
});

/** Synthetischer Inhalt - keine Zeile stammt aus einem realen Behandlungsfall. */
const INHALT = 'Synthetisch: Uebungen angeleitet, Belastung gesteigert.';
const NACHTRAG_INHALT = 'Synthetisch: Heimprogramm nachgereicht.';

const STAND = '2027-05-12T08:30:00.654321+00:00';

const doku: DokumentationApi.TreatmentNote = {
  id: DOKU_ID,
  appointment_id: TERMIN_ID,
  addendum_to_note_id: null,
  status: 'draft',
  content: INHALT,
  visit_without_treatment: false,
  // Format wie von PostgREST geliefert: ISO 8601 mit Mikrosekunden und Offset.
  created_at: '2027-05-12T08:10:00.123456+00:00',
  updated_at: STAND,
  finalized_at: null,
  finalisation_kind: null,
  version_count: 0,
  author_name: 'Anna Beispiel',
  last_editor_name: 'Tim Teamleitung',
  finalized_by_name: null,
};

const finalisiert: DokumentationApi.TreatmentNote = {
  ...doku,
  status: 'final',
  finalized_at: '2027-05-12T09:00:00.000000+00:00',
  finalisation_kind: 'manual',
  version_count: 1,
  finalized_by_name: 'Tim Teamleitung',
};

const nachtrag: DokumentationApi.TreatmentNote = {
  ...doku,
  id: NACHTRAG_ID,
  addendum_to_note_id: DOKU_ID,
  content: NACHTRAG_INHALT,
};

const fetchTreatmentDocumentation = vi.fn();
const finalizeTreatmentNote = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchTreatmentDocumentation: (id: string) =>
      fetchTreatmentDocumentation(id) as Promise<DokumentationApi.TreatmentDocumentation>,
    finalizeTreatmentNote: (noteId: string, stand: string) =>
      finalizeTreatmentNote(noteId, stand) as Promise<void>,
    // Ein Tag Frist: Der Entwurf vom 12.05. wird am 13.05. festgeschrieben.
    fetchDocumentationDeadline: () => Promise.resolve(1),
  };
});

const { TreatmentNoteSection } = await import('./TreatmentNoteSection');

function rendern(
  rollen: Parameters<typeof testUser>[0] = ['therapist'],
  ueberschreiben: Partial<AppointmentsApi.Appointment> = {},
  suche = '',
) {
  return renderWithProviders(
    <TreatmentNoteSection appointment={{ ...termin, ...ueberschreiben }} user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}${suche}`,
  );
}

describe('TreatmentNoteSection', () => {
  beforeEach(() => {
    fetchTreatmentDocumentation.mockReset();
    finalizeTreatmentNote.mockReset();
    finalizeTreatmentNote.mockResolvedValue(undefined);
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
  });

  it('zeigt den Entwurf mit Zustand, Urheberschaft und Aenderungszeitpunkt', async () => {
    rendern();

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    // Zustand und Frist im Kopf des Abschnitts (Design-Handoff 2026-10-01, Abschnitt 6).
    expect(await screen.findByText('Entwurf · Frist 13.05.')).toBeInTheDocument();
    // 08:30 UTC ist 10:30 Ortszeit in Europe/Berlin.
    expect(
      screen.getByText(
        /Verfasst von Anna Beispiel\. Zuletzt geändert am Mittwoch, 12\. Mai 2027, 10:30 Uhr von Tim Teamleitung\./,
      ),
    ).toBeInTheDocument();
  });

  /**
   * Hausbesuch-Szenario 1 (CAL-018, ADR-018 Fassung 3 Punkt 9). Der
   * Pflichtvermerk steht als eigenes Merkmal am Eintrag; ein Vermerk, den
   * niemand wiedersieht, waere keiner.
   */
  it('zeigt den Pflichtvermerk "ohne Behandlung" mit seiner Folge', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: { ...doku, visit_without_treatment: true },
      addenda: [],
    });
    rendern();

    expect(await screen.findByText('Ohne Behandlung')).toBeInTheDocument();
    // Das Kennzeichen trägt den Sachverhalt; der Satz nennt nur die Folge (UX-005g).
    expect(screen.getByText('Keine Ausfallgebühr.')).toBeInTheDocument();
  });

  it('zeigt ihn an einer gewoehnlichen Behandlung nicht', async () => {
    rendern();

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.queryByText('Ohne Behandlung')).not.toBeInTheDocument();
  });

  it('bietet therapeutischen Rollen das Bearbeiten an - als „Doku", wo oben keine Leiste steht', async () => {
    rendern(['therapist'], { status: 'completed' });

    const link = await screen.findByRole('link', { name: 'Doku' });
    expect(link).toHaveAttribute('href', `/termine/${TERMIN_ID}/abschluss`);
  });

  it('nennt den Weg am offenen Termin nicht zweimal - er steht oben in der Leiste (DOK-14)', async () => {
    rendern(['therapist']);

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Doku' })).toBeNull();
  });

  it('zeigt owner den Inhalt, aber keine Schaltflaeche zum Schreiben', async () => {
    rendern(['owner']);

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dokumentation bearbeiten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalisieren' })).toBeNull();
  });

  it('zeigt office den Inhalt, aber keine Schaltflaeche zum Schreiben (E15)', async () => {
    rendern(['office']);

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(fetchTreatmentDocumentation).toHaveBeenCalledWith(TERMIN_ID);
    expect(screen.queryByRole('link', { name: 'Dokumentation bearbeiten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalisieren' })).toBeNull();
  });

  it('bietet office an einem finalisierten Eintrag weder Korrektur noch Nachtrag an', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: finalisiert, addenda: [nachtrag] });
    rendern(['office']);

    expect(await screen.findByText(NACHTRAG_INHALT)).toBeInTheDocument();
    for (const name of [
      'Korrigieren',
      'Nachtrag hinzufügen',
      'Dokumentation bearbeiten',
      'Finalisieren',
    ]) {
      expect(screen.queryByRole('link', { name })).toBeNull();
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('zeigt office „Dokumentation fehlt", aber keinen Weg zum Anlegen (ABN-005)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    rendern(['office'], { status: 'completed' });

    // Der Stand ist Information fuer alle Leser (ANN-201 Fassung 2, ADR-004
    // Fassung 2); die Aufgabe bleibt bei den behandelnden Rollen.
    expect(await screen.findByText('Dokumentation fehlt')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Doku/ })).toBeNull();
  });

  it('sagt am offenen Termin ohne Eintrag nichts - dass nichts da ist, sieht man (UX-005g)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    rendern(['office']);

    await waitFor(() => expect(fetchTreatmentDocumentation).toHaveBeenCalledWith(TERMIN_ID));
    await waitFor(() =>
      expect(screen.queryByText('Dokumentation wird geladen …')).not.toBeInTheDocument(),
    );
    // Der Termin liegt in der Zukunft: Es ist nichts fällig, der Abschnitt schweigt.
    expect(screen.queryByRole('heading', { name: 'Dokumentation' })).toBeNull();
    expect(screen.queryByText('Dokumentation fehlt')).toBeNull();
  });

  it('zeigt Patientenkonten nichts an', async () => {
    const { container } = rendern(['patient']);

    await waitFor(() => {
      expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('bietet ohne vorhandene Dokumentation das Anlegen an, wo oben kein Hauptknopf steht', async () => {
    // Am abgeschlossenen Termin fehlt oben „Dokumentieren und abschließen";
    // der Weg steht dann hier. Am offenen Termin steht er nur oben (UX-005g).
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    rendern(['therapist'], { status: 'completed' });

    expect(await screen.findByText('Dokumentation fehlt')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Doku schreiben' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/abschluss`,
    );
  });

  it('bietet zu einem abgesagten Termin kein Anlegen an', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    rendern(['therapist'], { status: 'cancelled' });

    // Kein Erklärsatz mehr (Zyklus 3): Der Abschnitt steht gar nicht da.
    await waitFor(() => expect(fetchTreatmentDocumentation).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText('Dokumentation wird geladen …')).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('heading', { name: 'Dokumentation' })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Doku/ })).toBeNull();
  });

  it('zeigt eine vorhandene Dokumentation auch bei abgesagtem Termin weiter an', async () => {
    // Ein einmal geschriebener Text darf nicht verschwinden, nur weil der
    // Termin nachtraeglich abgesagt wurde (PROJECT_PRINCIPLES.md 13).
    rendern(['therapist'], { status: 'cancelled' });

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
  });

  it('meldet einen Ladefehler verstaendlich', async () => {
    fetchTreatmentDocumentation.mockRejectedValue(new Error('kaputt'));
    rendern(['therapist']);

    expect(
      await screen.findByText('Die Behandlungsdokumentation konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    // Was zu tun ist, und ein Weg dorthin (WRT-01).
    expect(
      screen.getByText('Bitte die Verbindung prüfen und erneut versuchen.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });

  it('steht als Abschnitt mit Überschrift da (UIK-20, TOK-05)', async () => {
    rendern();

    const ueberschrift = await screen.findByRole('heading', {
      level: 2,
      name: 'Dokumentation',
    });
    expect(ueberschrift).toHaveClass('tracking-label', 'text-xs');
  });

  it('nennt beim Entwurf die automatische Finalisierung (DOK-02)', async () => {
    rendern();

    expect(
      await screen.findByText(
        'Wird am 13.05. automatisch festgeschrieben, wenn niemand vorher finalisiert.',
      ),
    ).toBeInTheDocument();
  });

  it('bietet zu einem nicht angetroffenen Termin kein Anlegen an (TER-B01)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    rendern(['therapist'], { status: 'no_show' });

    await waitFor(() => expect(fetchTreatmentDocumentation).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText('Dokumentation wird geladen …')).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('heading', { name: 'Dokumentation' })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Doku/ })).toBeNull();
  });

  it('reicht den Rückweg des Termins an die Doku-Seiten weiter (DOK-01)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: finalisiert, addenda: [nachtrag] });
    rendern(['therapist'], {}, '?zurueck=%2Fkalender');

    const zurueck = `?zurueck=${encodeURIComponent('/kalender')}`;
    expect(await screen.findByRole('link', { name: 'Nachtrag hinzufügen' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/nachtrag${zurueck}`,
    );
    expect(screen.getByRole('link', { name: 'Korrigieren' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/korrektur${zurueck}`,
    );
    expect(screen.getByRole('link', { name: 'Änderungsverlauf' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/verlauf${zurueck}`,
    );
    expect(screen.getByRole('link', { name: 'Nachtrag bearbeiten' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${NACHTRAG_ID}/bearbeiten${zurueck}`,
    );
  });
});

/**
 * Ein Hauptknopf je Ansicht (DOK-14): Steht oben am offenen Termin schon
 * „Dokumentieren und abschließen“, sind die Schreibwege hier sekundär.
 */
describe('TreatmentNoteSection: Gewichtung der Knöpfe (DOK-14)', () => {
  beforeEach(() => {
    fetchTreatmentDocumentation.mockReset();
    finalizeTreatmentNote.mockReset();
  });

  it('zeigt „Dokumentation anlegen“ am offenen Termin gar nicht - der Weg steht oben', async () => {
    // Bis UX-005g stand er hier sekundär; ein zweiter Knopf für denselben
    // Weg war einer zu viel.
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    rendern(['therapist']);

    await waitFor(() => expect(fetchTreatmentDocumentation).toHaveBeenCalledWith(TERMIN_ID));
    await waitFor(() =>
      expect(screen.queryByText('Dokumentation wird geladen …')).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: 'Dokumentation anlegen' })).toBeNull();
  });

  it('lässt „Doku“ am abgeschlossenen Termin den Hauptknopf', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    rendern(['therapist'], { status: 'completed' });

    expect(await screen.findByRole('link', { name: 'Doku schreiben' })).toHaveClass('bg-accent');
  });

  it('bietet am offenen Hausbesuch kein „Finalisieren“ an, sondern verweist auf den Abschluss (BEF-055)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
    rendern(['therapist'], { appointment_type: 'home_visit', location_id: null });

    expect(await screen.findByTestId('eintragstext')).toHaveTextContent(INHALT);
    expect(screen.queryByRole('button', { name: 'Finalisieren' })).toBeNull();
    expect(
      screen.getByText(/Festgeschrieben wird über „Doku“ – oder oben über „Niemand öffnet\?“/),
    ).toBeInTheDocument();
  });

  it('bietet „Finalisieren“ am abgeschlossenen Hausbesuch wie sonst an', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
    rendern(['therapist'], {
      appointment_type: 'home_visit',
      location_id: null,
      status: 'completed',
    });

    expect(await screen.findByRole('button', { name: 'Finalisieren' })).toBeInTheDocument();
  });

  it('zeigt „Finalisieren“ am offenen Termin sekundär', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
    rendern(['therapist']);

    expect(await screen.findByRole('button', { name: 'Finalisieren' })).not.toHaveClass(
      'bg-accent',
    );
  });

  it('stellt am finalisierten Eintrag den Nachtrag vor die leise Korrektur', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: finalisiert, addenda: [] });
    rendern(['therapist'], { status: 'documented' });

    const nachtragLink = await screen.findByRole('link', { name: 'Nachtrag hinzufügen' });
    const korrigieren = screen.getByRole('link', { name: 'Korrigieren' });
    expect(
      nachtragLink.compareDocumentPosition(korrigieren) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Beide in derselben Aktionszeile des Eintrags.
    expect(nachtragLink.parentElement).toBe(korrigieren.parentElement);
    expect(korrigieren).not.toHaveClass('border');
  });
});

describe('TreatmentNoteSection: Finalisierung (DOK-002)', () => {
  beforeEach(() => {
    fetchTreatmentDocumentation.mockReset();
    finalizeTreatmentNote.mockReset();
    finalizeTreatmentNote.mockResolvedValue(undefined);
    fetchTreatmentDocumentation.mockResolvedValue({ primary: doku, addenda: [] });
  });

  it('finalisiert nicht auf den ersten Klick, sondern fragt nach', async () => {
    const user = userEvent.setup();
    rendern(['therapist']);

    await user.click(await screen.findByRole('button', { name: 'Finalisieren' }));

    expect(screen.getByRole('group', { name: 'Dokumentation finalisieren' })).toBeInTheDocument();
    expect(finalizeTreatmentNote).not.toHaveBeenCalled();
  });

  it('sagt am offenen Termin, dass er als durchgeführt geführt wird (BEF-055)', async () => {
    const user = userEvent.setup();
    rendern(['therapist']);

    await user.click(await screen.findByRole('button', { name: 'Finalisieren' }));

    expect(screen.getByRole('group', { name: 'Dokumentation finalisieren' })).toHaveTextContent(
      'Der Termin wird dabei als durchgeführt geführt',
    );
  });

  it('nennt die Folge für den Termin nicht, wenn er schon abgeschlossen ist', async () => {
    const user = userEvent.setup();
    rendern(['therapist'], { status: 'completed' });

    await user.click(await screen.findByRole('button', { name: 'Finalisieren' }));

    expect(screen.getByRole('group', { name: 'Dokumentation finalisieren' })).not.toHaveTextContent(
      'als durchgeführt geführt',
    );
  });

  it('uebergibt bei der Bestaetigung den gelesenen Stand (ADR-001)', async () => {
    const user = userEvent.setup();
    rendern(['therapist']);

    await user.click(await screen.findByRole('button', { name: 'Finalisieren' }));
    await user.click(screen.getByRole('button', { name: 'Ja, jetzt finalisieren' }));

    await waitFor(() => {
      expect(finalizeTreatmentNote).toHaveBeenCalledWith(DOKU_ID, STAND);
    });
  });

  it('meldet einen Konflikt, ohne den Eintrag zu veraendern', async () => {
    const user = userEvent.setup();
    finalizeTreatmentNote.mockRejectedValue(new Error('Zwischenzeitlich geändert.'));
    rendern(['therapist']);

    await user.click(await screen.findByRole('button', { name: 'Finalisieren' }));
    await user.click(screen.getByRole('button', { name: 'Ja, jetzt finalisieren' }));

    // Die Rückfrage bleibt offen und nennt den Fehler am Ort (ZST-16).
    const kasten = screen.getByRole('group', { name: 'Dokumentation finalisieren' });
    expect(await within(kasten).findByRole('alert')).toHaveTextContent(
      'Zwischenzeitlich geändert.',
    );
    expect(screen.getByText(/^Entwurf/)).toBeInTheDocument();
  });

  it('bestätigt die Finalisierung am Ort und setzt den Fokus dorthin (ZST-16)', async () => {
    const user = userEvent.setup();
    finalizeTreatmentNote.mockImplementation(() => {
      fetchTreatmentDocumentation.mockResolvedValue({ primary: finalisiert, addenda: [] });
      return Promise.resolve();
    });
    rendern(['therapist']);

    await user.click(await screen.findByRole('button', { name: 'Finalisieren' }));
    await user.click(screen.getByRole('button', { name: 'Ja, jetzt finalisieren' }));

    const bestaetigung = await screen.findByText(
      'Finalisiert – der Eintrag ist jetzt Bestandteil der Akte.',
    );
    await waitFor(() => expect(bestaetigung.closest('[tabindex="-1"]')).toHaveFocus());
  });

  it('kennzeichnet „Finalisiert“ mit Zeichen, nicht nur mit Farbe (UIK-18)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: finalisiert, addenda: [] });
    rendern(['therapist']);

    const etikett = await screen.findByText('Festgeschrieben · Version 1');
    expect(etikett).toHaveTextContent('✓');
  });

  it('bietet einem Entwurf noch keinen Aenderungsverlauf an', async () => {
    rendern(['therapist']);

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Änderungsverlauf' })).toBeNull();
  });
});

describe('TreatmentNoteSection: finalisierter Eintrag (DOK-002)', () => {
  beforeEach(() => {
    fetchTreatmentDocumentation.mockReset();
    finalizeTreatmentNote.mockReset();
    fetchTreatmentDocumentation.mockResolvedValue({ primary: finalisiert, addenda: [] });
  });

  it('zeigt Zustand und Finalisierung statt der letzten Aenderung', async () => {
    rendern(['therapist']);

    expect(await screen.findByText('Festgeschrieben · Version 1')).toBeInTheDocument();
    expect(
      screen.getByText(/Finalisiert am Mittwoch, 12\. Mai 2027, 11:00 Uhr von Tim Teamleitung\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/noch nicht finalisiert/)).toBeNull();
  });

  it('nennt eine automatische Finalisierung als solche - ohne erfundene Person (DOK-004)', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: {
        ...finalisiert,
        finalisation_kind: 'automatic',
        finalized_by_name: null,
      },
      addenda: [],
    });
    rendern(['therapist']);

    expect(
      await screen.findByText(
        /Automatisch finalisiert am Mittwoch, 12\. Mai 2027, 11:00 Uhr nach Ablauf der Frist\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Uhr von /)).toBeNull();
    // Korrektur und Nachtrag stehen wie nach jeder Finalisierung offen.
    expect(screen.getByRole('link', { name: 'Korrigieren' })).toBeInTheDocument();
  });

  it('bietet statt des Entwurfsweges die Korrektur an', async () => {
    rendern(['therapist']);

    expect(await screen.findByRole('link', { name: 'Korrigieren' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/korrektur`,
    );
    expect(screen.queryByRole('link', { name: 'Dokumentation bearbeiten' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalisieren' })).toBeNull();
  });

  it('bietet den Nachtrag erst nach der Finalisierung an (ADR-016 Punkt 6)', async () => {
    rendern(['therapist']);

    expect(await screen.findByRole('link', { name: 'Nachtrag hinzufügen' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/nachtrag`,
    );
  });

  it('zeigt owner den Verlauf, aber weder Korrektur noch Nachtrag (Punkt 8)', async () => {
    rendern(['owner']);

    expect(await screen.findByRole('link', { name: 'Änderungsverlauf' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${DOKU_ID}/verlauf`,
    );
    expect(screen.queryByRole('link', { name: 'Korrigieren' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Nachtrag hinzufügen' })).toBeNull();
  });

  it('weist auf mehrere Versionen hin, sobald korrigiert wurde', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: { ...finalisiert, version_count: 2 },
      addenda: [],
    });
    rendern(['therapist']);

    expect(await screen.findByText(/2 Versionen/)).toBeInTheDocument();
  });

  it('zeigt einen Nachtrag als eigenen Eintrag neben dem Ursprung', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: finalisiert,
      addenda: [nachtrag],
    });
    rendern(['therapist']);

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.getByText(NACHTRAG_INHALT)).toBeInTheDocument();
    expect(screen.getByText('Nachtrag')).toBeInTheDocument();
    // Der Nachtrag ist selbst ein Entwurf und wird gesondert finalisiert.
    expect(screen.getByRole('button', { name: 'Finalisieren' })).toBeInTheDocument();
  });

  it('laesst einen Nachtrag im Entwurf noch bearbeiten', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: finalisiert,
      addenda: [nachtrag],
    });
    rendern(['therapist']);

    expect(await screen.findByRole('link', { name: 'Nachtrag bearbeiten' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/dokumentation/${NACHTRAG_ID}/bearbeiten`,
    );
  });
});
