import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type * as PlattformApi from './api';
import type { EigenePlaene, Nachricht, Nachrichten as Daten, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Reiter „Nachrichten" (KOM-001, DSN-001 4.1, IDEA-KOM-001, -002).
 *
 *   * Zusage und Notfallhinweis stehen an jedem Eingabefeld, für alle gleich.
 *   * Neue Nachricht in zwei Schritten; ohne Thema und Text kein Senden.
 *   * Im Training ohne Einwilligung nur Termin, Rechnung und Sonstiges.
 *   * In der Lesefrist nur lesen.
 */

const ladeNachrichten = vi.fn<(id: string) => Promise<Daten>>();
const ladePlaene = vi.fn<(id: string) => Promise<EigenePlaene>>();
const nachrichtStellen = vi.fn();
const nachrichtNachtragen = vi.fn();
const nachrichtErledigen = vi.fn();
const anhangSenden = vi.fn();
const anhangLoeschen = vi.fn();
const ladeAnhang = vi.fn();
const einwilligungSchreiben = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeNachrichten: (id: string) => ladeNachrichten(id),
  ladePlaene: (id: string) => ladePlaene(id),
  nachrichtStellen: (...a: unknown[]) => nachrichtStellen(...a) as Promise<string>,
  nachrichtNachtragen: (...a: unknown[]) => nachrichtNachtragen(...a) as Promise<void>,
  nachrichtErledigen: (...a: unknown[]) => nachrichtErledigen(...a) as Promise<void>,
  anhangSenden: (...a: unknown[]) => anhangSenden(...a) as Promise<void>,
  anhangLoeschen: (...a: unknown[]) => anhangLoeschen(...a) as Promise<void>,
  ladeAnhang: (...a: unknown[]) => ladeAnhang(...a) as Promise<Blob>,
  einwilligungSchreiben: (...a: unknown[]) => einwilligungSchreiben(...a) as Promise<void>,
}));

const { Nachrichten, NeueNachricht, NachrichtDetail } = await import('./Nachrichten');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  writable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: null,
};

const OFFEN: Nachricht = {
  id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
  topic: 'organisational',
  reference_label: null,
  status: 'open',
  due_on: '2026-10-13',
  created_at: '2026-10-09T08:00:00Z',
  last_entry_at: '2026-10-09T08:00:00Z',
  closed_at: null,
  closed_by_side: null,
  entries: [
    {
      id: 'eeeeeeee-dddd-4ddd-8ddd-000000000001',
      side: 'person',
      body: 'Kann ich den Termin am Freitag verschieben?',
      created_at: '2026-10-09T08:00:00Z',
      author: 'you',
      author_label: null,
    },
  ],
};

const BEANTWORTET: Nachricht = {
  ...OFFEN,
  id: 'dddddddd-dddd-4ddd-8ddd-000000000002',
  topic: 'exercise',
  reference_label: 'Kniebeuge am Geländer',
  status: 'answered',
  due_on: null,
  entries: [
    { ...OFFEN.entries[0]!, body: 'Wie tief soll ich gehen?' },
    {
      id: 'eeeeeeee-dddd-4ddd-8ddd-000000000002',
      side: 'practice',
      body: 'Nur so tief, wie es ohne Schmerz geht.',
      created_at: '2026-10-09T10:00:00Z',
      author: 'practice',
      author_label: null,
    },
    {
      id: 'eeeeeeee-dddd-4ddd-8ddd-000000000003',
      side: 'person',
      body: 'Danke!',
      created_at: '2026-10-09T11:00:00Z',
      author: 'representative',
      author_label: 'Paula Mustermann',
    },
  ],
};

const ERLEDIGT: Nachricht = {
  ...OFFEN,
  id: 'dddddddd-dddd-4ddd-8ddd-000000000003',
  topic: 'other',
  status: 'closed',
  due_on: null,
  closed_at: '2026-10-09T12:00:00Z',
  closed_by_side: 'practice',
};

function daten(teil: Partial<Daten> = {}): Daten {
  return {
    response_workdays: 2,
    can_write: true,
    health_topics: true,
    messages: [OFFEN, BEANTWORTET, ERLEDIGT],
    ...teil,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeNachrichten.mockResolvedValue(daten());
  ladePlaene.mockResolvedValue({
    today: '2026-10-09',
    plans: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        service_area: 'therapy',
        title: 'Heimprogramm Knie',
        status: 'assigned',
        sessions_per_week: 3,
        assigned_on: '2026-10-01',
        runs_from: '2026-10-01',
        runs_until: '2026-11-12',
        ended_on: null,
        can_exercise: true,
        note_allowed: true,
        open_session: null,
        can_choose_days: true,
        weekdays: [],
        recent_sessions: [],
        items: [
          {
            id: 'bbbbbbbb-aaaa-4aaa-8aaa-000000000001',
            position: 1,
            variant_lay_name: 'Kniebeuge am Geländer',
            instruction: null,
            equipment: [],
            sets: 3,
            reps_min: 10,
            reps_max: 12,
            duration_seconds: null,
            hold_seconds: null,
            per_side: false,
            times_per_day: null,
            load: null,
            tempo: null,
            rest_seconds: 30,
            double_progression: false,
            note: null,
          },
        ],
      },
    ],
  });
  nachrichtStellen.mockResolvedValue('dddddddd-dddd-4ddd-8ddd-000000000009');
  nachrichtNachtragen.mockResolvedValue(undefined);
  nachrichtErledigen.mockResolvedValue(undefined);
});

function hinweisPruefen(container: HTMLElement) {
  const hinweis = within(container).getByRole('note', {
    name: 'Hinweis zu Antwortzeit und Notfällen',
  });
  expect(hinweis).toHaveTextContent('Antwort in der Regel innerhalb von zwei Werktagen.');
  expect(hinweis).toHaveTextContent('Nicht für akute Beschwerden.');
  expect(hinweis).toHaveTextContent('112');
  expect(hinweis).toHaveTextContent('116117');
  // Die Nummern zum Antippen, fest - nie aus dem Inhalt einer Nachricht (L2).
  expect(within(hinweis).getByRole('link', { name: '112 anrufen' })).toHaveAttribute(
    'href',
    'tel:112',
  );
  expect(within(hinweis).getByRole('link', { name: '116117 anrufen' })).toHaveAttribute(
    'href',
    'tel:116117',
  );
}

describe('Nachrichten (KOM-001)', () => {
  it('zeigt Zusage und Notfallhinweis, laufende und erledigte Nachrichten', async () => {
    renderWithProviders(<Nachrichten zugang={ZUGANG} />, '/p/nachrichten');
    expect(await screen.findByRole('heading', { name: 'Nachrichten' })).toBeInTheDocument();
    // Der Titel steht schon beim Laden; Hinweis und Knopf kommen mit den Daten.
    expect(await screen.findByRole('link', { name: 'Neue Nachricht' })).toHaveAttribute(
      'href',
      '/p/nachrichten/neu',
    );
    hinweisPruefen(document.body);
    expect(screen.getByText('wartet auf Antwort')).toBeInTheDocument();
    expect(screen.getByText(/^Antwort bis 13\.10\.2026\./)).toBeInTheDocument();
    expect(screen.getByText('Übung · Kniebeuge am Geländer')).toBeInTheDocument();
    expect(screen.getByText('beantwortet')).toBeInTheDocument();
    // Jeder Zustand mit Zeichen und Wort (Regel 5, ANN-485).
    expect(screen.getByText('beantwortet')).toHaveTextContent('↩ beantwortet');
    expect(screen.getByText('wartet auf Antwort')).toHaveTextContent('… wartet auf Antwort');
    // Erledigtes steht auf Abruf, mit der Zahl im Kopf (DESIGN.md, Regel 6).
    expect(screen.getByText('Erledigt').closest('summary')).toHaveTextContent('Erledigt (1)');
  });

  it('die Frist kommt aus den Praxisstammdaten (ANN-309)', async () => {
    ladeNachrichten.mockResolvedValue(daten({ response_workdays: 1 }));
    renderWithProviders(<Nachrichten zugang={ZUGANG} />, '/p/nachrichten');
    expect(
      await screen.findByText('Antwort in der Regel innerhalb eines Werktags.'),
    ).toBeInTheDocument();
  });

  it('in der Lesefrist: lesen, kein neuer Knopf (ANN-313)', async () => {
    ladeNachrichten.mockResolvedValue(daten({ can_write: false }));
    renderWithProviders(<Nachrichten zugang={ZUGANG} />, '/p/nachrichten');
    expect(await screen.findByText(/hier noch lesen/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Neue Nachricht' })).not.toBeInTheDocument();
  });
});

describe('Neue Nachricht (KOM-001)', () => {
  it('verlangt Thema und Text; der Hinweis steht über dem Feld', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NeueNachricht zugang={ZUGANG} />, '/p/nachrichten/neu');
    await screen.findByRole('heading', { name: 'Neue Nachricht' });
    hinweisPruefen(document.body);
    for (const name of ['Übung', 'Beschwerden', 'Termin oder Rechnung', 'Sonstiges']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte wählen Sie, worum es geht.');
    await nutzer.click(screen.getByRole('radio', { name: 'Sonstiges' }));
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte schreiben Sie Ihre Frage.');
    expect(nachrichtStellen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
  });

  it('sendet Thema, Text und den Bezug auf eine Übung', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/p/nachrichten/neu" element={<NeueNachricht zugang={ZUGANG} />} />
        <Route path="/p/nachrichten" element={<p>Liste</p>} />
      </Routes>,
      '/p/nachrichten/neu',
    );
    await nutzer.click(await screen.findByRole('radio', { name: 'Übung' }));
    await nutzer.selectOptions(
      screen.getByLabelText('Zu welchem Plan? (freiwillig)'),
      'Heimprogramm Knie',
    );
    await nutzer.selectOptions(
      screen.getByLabelText('Zu welcher Übung? (freiwillig)'),
      'Kniebeuge am Geländer',
    );
    await nutzer.type(screen.getByLabelText('Text'), 'Wie tief soll ich gehen?');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() =>
      expect(nachrichtStellen).toHaveBeenCalledWith({
        zugangId: ZUGANG.access_id,
        thema: 'exercise',
        text: 'Wie tief soll ich gehen?',
        planId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        positionId: 'bbbbbbbb-aaaa-4aaa-8aaa-000000000001',
      }),
    );
    expect(await screen.findByText('Liste')).toBeInTheDocument();
  });

  it('ohne Bezug bei anderen Themen', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NeueNachricht zugang={ZUGANG} />, '/p/nachrichten/neu');
    await nutzer.click(await screen.findByRole('radio', { name: 'Termin oder Rechnung' }));
    expect(screen.queryByLabelText('Zu welchem Plan? (freiwillig)')).not.toBeInTheDocument();
    await nutzer.type(screen.getByLabelText('Text'), 'Rechnung doppelt?');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() =>
      expect(nachrichtStellen).toHaveBeenCalledWith(
        expect.objectContaining({ thema: 'organisational', planId: null, positionId: null }),
      ),
    );
  });

  it('im Training ohne Einwilligung nur zwei Themen, mit Grund (ANN-311)', async () => {
    ladeNachrichten.mockResolvedValue(daten({ health_topics: false }));
    renderWithProviders(
      <NeueNachricht zugang={{ ...ZUGANG, relationship_kind: 'training' }} />,
      '/p/nachrichten/neu',
    );
    expect(await screen.findByRole('radio', { name: 'Sonstiges' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Termin oder Rechnung' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Übung' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Beschwerden' })).not.toBeInTheDocument();
    expect(screen.getByText(/Angaben zu Ihrer Gesundheit/)).toBeInTheDocument();
  });

  it('zeigt die Meldung des Servers verständlich', async () => {
    const nutzer = userEvent.setup();
    nachrichtStellen.mockRejectedValue(new Error('Ihr Zugang erlaubt das gerade nicht.'));
    renderWithProviders(<NeueNachricht zugang={ZUGANG} />, '/p/nachrichten/neu');
    await nutzer.click(await screen.findByRole('radio', { name: 'Sonstiges' }));
    await nutzer.type(screen.getByLabelText('Text'), 'Frage');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ihr Zugang erlaubt das gerade nicht.',
    );
  });
});

describe('Eine Nachricht (KOM-001)', () => {
  function zeige(id: string, zugang: Plattformzugang = ZUGANG) {
    renderWithProviders(
      <Routes>
        <Route path="/p/nachrichten/:nachrichtId" element={<NachrichtDetail zugang={zugang} />} />
      </Routes>,
      `/p/nachrichten/${id}`,
    );
  }

  it('zeigt den Verlauf mit Verfasser; die Praxis ohne Namen', async () => {
    zeige(BEANTWORTET.id);
    const verlauf = await screen.findByRole('list', { name: 'Verlauf' });
    const eintraege = within(verlauf).getAllByRole('listitem');
    expect(eintraege[0]).toHaveTextContent('Sie');
    expect(eintraege[1]).toHaveTextContent('Praxis');
    expect(eintraege[1]).toHaveTextContent('Nur so tief, wie es ohne Schmerz geht.');
    expect(eintraege[2]).toHaveTextContent('Paula Mustermann für Sie');
    expect(screen.getByText('Zu: Kniebeuge am Geländer')).toBeInTheDocument();
  });

  it('nachtragen und erledigen', async () => {
    const nutzer = userEvent.setup();
    zeige(OFFEN.id);
    await screen.findByLabelText('Noch etwas ergänzen');
    hinweisPruefen(document.body);
    // Zustand und Frist als eine Zeile unter dem Titel, nicht als Abzeichen (L9).
    const zustand = screen.getByText('wartet auf Antwort').parentElement!;
    expect(zustand).toHaveTextContent('… wartet auf Antwort · Antwort bis 13.10.2026');
    expect(zustand.className).not.toContain('rounded-pill');
    await nutzer.type(screen.getByLabelText('Noch etwas ergänzen'), 'Oder Montag?');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() =>
      expect(nachrichtNachtragen).toHaveBeenCalledWith(ZUGANG.access_id, OFFEN.id, 'Oder Montag?'),
    );
    await nutzer.click(screen.getByRole('button', { name: 'Hat sich erledigt' }));
    await waitFor(() =>
      expect(nachrichtErledigen).toHaveBeenCalledWith(ZUGANG.access_id, OFFEN.id),
    );
  });

  it('erledigt: kein Eingabefeld, wer erledigt hat', async () => {
    zeige(ERLEDIGT.id);
    expect(
      await screen.findByText(/Die Praxis hat diese Nachricht als erledigt markiert/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Noch etwas ergänzen')).not.toBeInTheDocument();
  });

  it('eine Vertretung sieht den Namen der vertretenen Person', async () => {
    zeige(BEANTWORTET.id, {
      ...ZUGANG,
      access_kind: 'companion',
      represented_name: 'Max Mustermann',
    });
    const verlauf = await screen.findByRole('list', { name: 'Verlauf' });
    expect(within(verlauf).getAllByRole('listitem')[2]).toHaveTextContent('Paula Mustermann');
  });
});

describe('Foto und Video an der Nachricht (KOM-007, ADR-017 Abschnitt L)', () => {
  const VIDEO = {
    id: 'aaaaaaaa-dddd-4ddd-8ddd-000000000001',
    media_kind: 'video' as const,
    mime_type: 'video/webm',
    duration_seconds: 12,
    created_at: '2026-10-09T09:00:00Z',
    delete_on: '2026-11-08',
    author: 'you' as const,
    author_label: null,
    server_verified: false,
    malware_scanned: false,
  };
  const MIT_VIDEO: Nachricht = {
    ...BEANTWORTET,
    attachment_count: 1,
    attachments: [VIDEO],
    entries: [
      ...BEANTWORTET.entries,
      {
        id: 'eeeeeeee-dddd-4ddd-8ddd-000000000009',
        side: 'practice',
        body: 'Bei 0:07 kippt das Knie nach innen.',
        created_at: '2026-10-09T12:00:00Z',
        author: 'practice',
        author_label: null,
        attachment_id: VIDEO.id,
        attachment_mark_seconds: 7,
      },
    ],
  };

  function zeige(teil: Partial<Daten>, nachricht: Nachricht = MIT_VIDEO) {
    ladeNachrichten.mockResolvedValue(
      daten({
        can_attach: true,
        attachment_consent: 'granted',
        attachment_limit: 3,
        attachment_max_seconds: 30,
        messages: [nachricht],
        ...teil,
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/p/nachrichten/:nachrichtId" element={<NachrichtDetail zugang={ZUGANG} />} />
      </Routes>,
      `/p/nachrichten/${nachricht.id}`,
    );
  }

  beforeEach(() => {
    ladeAnhang.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'video/webm' }));
    anhangLoeschen.mockResolvedValue(undefined);
    einwilligungSchreiben.mockResolvedValue(undefined);
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
  });

  it('zeigt jeden Anhang mit Löschdatum, ohne Vorschaubild (Punkte 40, 65)', async () => {
    zeige({});
    const abschnitt = await screen.findByRole('region', { name: 'Fotos und Videos' });
    expect(abschnitt).toHaveTextContent('Video, 0:12');
    expect(abschnitt).toHaveTextContent('von Ihnen');
    expect(abschnitt).toHaveTextContent('wird am 08.11.2026 gelöscht');
    expect(abschnitt).toHaveTextContent('nicht auf Schadsoftware geprüft');
    expect(within(abschnitt).queryByRole('img')).not.toBeInTheDocument();
    expect(ladeAnhang).not.toHaveBeenCalled();
  });

  it('Ansehen lädt erst auf Tippen, Löschen löscht', async () => {
    const nutzer = userEvent.setup();
    zeige({});
    await nutzer.click(await screen.findByRole('button', { name: 'Ansehen' }));
    expect(await screen.findByLabelText(/Video vom/)).toBeInTheDocument();
    expect(ladeAnhang).toHaveBeenCalledWith(ZUGANG.access_id, VIDEO.id);
    await nutzer.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(anhangLoeschen).toHaveBeenCalledWith(ZUGANG.access_id, VIDEO.id));
  });

  it('die Zeitmarke der Praxis öffnet das Video an der Stelle (Punkt 68)', async () => {
    const nutzer = userEvent.setup();
    zeige({});
    await nutzer.click(await screen.findByRole('button', { name: 'Im Video bei 0:07 ansehen' }));
    expect(await screen.findByLabelText(/Video vom/)).toBeInTheDocument();
    expect(ladeAnhang).toHaveBeenCalledWith(ZUGANG.access_id, VIDEO.id);
  });

  it('ist das Video gelöscht, bleibt die Zeitmarke als Text', async () => {
    zeige({}, { ...MIT_VIDEO, attachment_count: 0, attachments: [] });
    expect(
      await screen.findByText(
        /Bezieht sich auf Ihr Video bei 0:07\. Das Video ist inzwischen gelöscht/,
      ),
    ).toBeInTheDocument();
  });

  it('beim ersten Mal steht die Einwilligung vor der Kamera (Punkt 61)', async () => {
    const nutzer = userEvent.setup();
    zeige({ attachment_consent: 'open' }, { ...OFFEN, attachment_count: 0, attachments: [] });
    await nutzer.click(await screen.findByRole('button', { name: 'Foto aufnehmen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Fotos und Videos an Ihren Fragen' });
    expect(dialog).toHaveTextContent('nach 30 Tagen gelöscht');
    expect(dialog).toHaveTextContent(
      'Ohne Einwilligung können Sie Ihre Frage weiter in Worten stellen.',
    );
    await nutzer.click(within(dialog).getByRole('button', { name: 'Einwilligen und aufnehmen' }));
    await waitFor(() =>
      expect(einwilligungSchreiben).toHaveBeenCalledWith(
        expect.objectContaining({ zweck: 'message_attachments', erteilen: true }),
      ),
    );
    expect(await screen.findByRole('dialog', { name: 'Foto aufnehmen' })).toBeInTheDocument();
  });

  it('„Nicht jetzt" lässt die Frage in Worten (Art. 7 Abs. 4 DSGVO)', async () => {
    const nutzer = userEvent.setup();
    zeige({ attachment_consent: 'withdrawn' }, { ...OFFEN, attachment_count: 0, attachments: [] });
    await nutzer.click(await screen.findByRole('button', { name: 'Video aufnehmen' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Nicht jetzt' }));
    expect(einwilligungSchreiben).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Noch etwas ergänzen')).toBeInTheDocument();
  });

  it('höchstens drei; ohne Abo keine Knöpfe; die Begleitung sieht nichts (Punkte 59, 67)', async () => {
    zeige({}, { ...MIT_VIDEO, attachment_count: 3 });
    expect(await screen.findByText(/höchstens 3 Fotos oder Videos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Foto aufnehmen' })).not.toBeInTheDocument();
  });

  it('ohne Stufe 2 keine Knöpfe zum Anhängen', async () => {
    zeige({ can_attach: false }, { ...OFFEN, attachment_count: 0, attachments: [] });
    await screen.findByLabelText('Noch etwas ergänzen');
    expect(screen.queryByRole('button', { name: 'Foto aufnehmen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fotos und Videos' })).not.toBeInTheDocument();
  });

  it('die Begleitung: kein Abschnitt, keine Zeitmarke', async () => {
    zeige(
      { can_attach: false, attachment_consent: null },
      {
        ...MIT_VIDEO,
        attachment_count: null,
        attachments: [],
        entries: MIT_VIDEO.entries.map((e) => ({
          ...e,
          attachment_id: null,
          attachment_mark_seconds: null,
        })),
      },
    );
    await screen.findByRole('list', { name: 'Verlauf' });
    expect(screen.queryByRole('region', { name: 'Fotos und Videos' })).not.toBeInTheDocument();
    expect(screen.queryByText(/bei 0:07 ansehen/)).not.toBeInTheDocument();
  });
});
