import { beforeEach, describe, expect, it } from 'vitest';
import { AUSKUNFT_KATEGORIEN } from '@/features/privacy/datenschutz/kategorien';
import {
  FREMDE_ORGANISATION,
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
  tagInTagen,
} from './helpers/db';

const { users, patients, platformAccesses } = SEED;

const AUSKUNFT = 'select public.export_patient_record($1::uuid) as daten';
const WUNSCH = `select public.request_platform_appointment($1::uuid, $2::date[], $3::text[], $4) as id`;
const AUFBEWAHRUNG = 'select public.patient_retention_status($1::uuid) as stand';

// Betroffenenrechte (ADR-007 Punkt 5): Die Auskunft ist eng - nur owner, nur die eigene
// Organisation, jeder Aufruf hinterlässt eine Spur. Dass sie vollständig ist, prüft das Register der
// Querschnittsfunktionen (supabase/tests/data-registry.test.ts, ANN-751).

describe('export_patient_record', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('gibt owner eine Kopie mit Name, Terminen und Dokumentation', async () => {
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.max],
    );

    const daten = rows[0]!.daten;
    expect(daten['rechtsgrundlage']).toBe('Art. 15 Abs. 3 DSGVO');
    expect(daten['patient_id']).toBe(patients.max);

    const tabellen = daten['tabellen'] as Record<string, unknown[]>;
    expect(tabellen['persons']).toHaveLength(1);
    expect(tabellen['persons']![0]).toMatchObject({
      given_name: 'Max',
      family_name: 'Mustermann',
    });
    expect(tabellen['patient_contact_details']![0]).toMatchObject({
      city: 'Tuebingen',
      date_of_birth: '1957-04-30',
    });
    // Zwei Termine im Seed, einer davon in der Praxis (CAL-001), dazu die
    // siebzehn durchgefuehrten Hausbesuche der beiden Verordnungen (ABN-001).
    expect(tabellen['appointments']).toHaveLength(19);
    expect(tabellen['appointment_notifications']).toHaveLength(1);
  });

  it('nennt die behandelnde Person mit Namen statt mit einer Kennung', async () => {
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.max],
    );

    const tabellen = rows[0]!.daten['tabellen'] as Record<string, Record<string, unknown>[]>;
    expect(tabellen['patient_care_details']![0]!['primary_therapist']).toBe('Anna Beispiel');
    expect(tabellen['appointments']![0]!['staff_member']).toBe('Anna Beispiel');
  });

  it('nennt die Einladungen zum Plattformzugang ohne Code, fremde Adressen nicht (Zweitreview BEF-146)', async () => {
    // Je eine eingeloeste Einladung per Mail an Erikas eigenen Zugang und an
    // Paulas Begleitung fuer Max.
    const code = 'f'.repeat(64);
    for (const [zugang, adresse, hash] of [
      [platformAccesses.erikaBehandlung, 'erika.e@patient.invalid', code],
      [platformAccesses.paulaBegleitungMax, 'paula.p@patient.invalid', 'e'.repeat(64)],
    ] as const) {
      await asPostgres(
        `insert into public.platform_access_invitations
           (organization_id, platform_access_id, purpose, channel, code_hash, email,
            address_confirmed_by, address_confirmed_at, status, expires_at, sent_at, redeemed_at,
            created_by)
         values ($1, $2, 'activate', 'email', $3, $4, $5, now(), 'redeemed',
                 now() + interval '7 days', now(), now(), $5)`,
        [SEED.organizationId, zugang, hash, adresse, users.office],
      );
    }
    async function einladungen(patient: string) {
      const { rows } = await asUser<{ daten: Record<string, unknown> }>(
        users.ownerTherapist,
        AUSKUNFT,
        [patient],
      );
      const zugaenge = (rows[0]!.daten['tabellen'] as Record<string, unknown[]>)[
        'platform_accesses'
      ] as { access_kind: string; invitations: Record<string, unknown>[] }[];
      return { text: JSON.stringify(rows[0]!.daten), zugaenge };
    }

    const erika = await einladungen(patients.erika);
    const eigene = erika.zugaenge.find((z) => z.access_kind === 'self')!;
    expect(eigene.invitations).toEqual([
      expect.objectContaining({
        purpose: 'activate',
        channel: 'email',
        email: 'erika.e@patient.invalid',
        status: 'redeemed',
      }),
    ]);
    expect(erika.text).not.toContain(code);
    expect(erika.text).not.toContain('code_hash');

    // Die Adresse der Begleitung ist ihr Datum; ihr Name steht am Zugang.
    const max = await einladungen(patients.max);
    const begleitung = max.zugaenge.find((z) => z.access_kind === 'companion')!;
    expect(begleitung.invitations).toEqual([
      expect.objectContaining({ channel: 'email', email: null, status: 'redeemed' }),
    ]);
    expect(max.text).not.toContain('paula.p@patient.invalid');
  });

  it('nennt die Fotos und Videos an Rueckfragen, ohne Inhalt und Schluessel (BEF-146)', async () => {
    // Die Anhaenge entstehen direkt in der Datenbank, als haette die Person
    // sie selbst hochgeladen: an Erikas Behandlung einer bestaetigt, einer noch
    // unbestaetigt und einer unter Legal Hold gesperrt - alle drei stehen in
    // ihrer Auskunft (Art. 15 erfasst, was gespeichert ist). Ihr Anhang am
    // Training und Tinas Anhang gehoeren nicht hinein (ADR-021).
    async function vorgangMitAnhaengen(
      konto: string,
      zugang: string,
      anhaenge: { status: 'ready' | 'pending'; gesperrt?: boolean }[],
    ): Promise<void> {
      const { rows } = await asUserCommitted<{ id: string }>(
        konto,
        'select public.start_platform_message($1::uuid, $2, $3, null, null) as id',
        [zugang, 'organisational', 'Ist das so richtig?'],
      );
      for (const anhang of anhaenge) {
        await asPostgres(
          `insert into public.platform_message_attachments
             (organization_id, message_id, media_kind, mime_type, byte_size, checksum_sha256, status,
              confirmed_at, locked_at, access_id, author_kind, created_by)
           values ($1, $2, 'photo', 'image/jpeg', 1000, $3, $4,
                   case when $4 = 'ready' then now() end, case when $5 then now() end,
                   $6, 'self', $7)`,
          [
            SEED.organizationId,
            rows[0]!.id,
            'a'.repeat(64),
            anhang.status,
            anhang.gesperrt ?? false,
            zugang,
            konto,
          ],
        );
      }
    }
    await vorgangMitAnhaengen(users.plattformErika, platformAccesses.erikaBehandlung, [
      { status: 'ready' },
      { status: 'pending' },
      { status: 'ready', gesperrt: true },
    ]);
    await vorgangMitAnhaengen(users.plattformErika, platformAccesses.erikaTraining, [
      { status: 'ready' },
    ]);
    await vorgangMitAnhaengen(users.plattformTina, platformAccesses.tinaTraining, [
      { status: 'ready' },
    ]);

    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.erika],
    );
    const vorgaenge = (rows[0]!.daten['tabellen'] as Record<string, unknown[]>)[
      'platform_messages'
    ] as { attachments: Record<string, unknown>[] }[];
    const anhaenge = vorgaenge.flatMap((v) => v.attachments);
    expect(anhaenge).toHaveLength(3);
    expect(anhaenge.map((a) => [a['status'], a['locked_at'] !== null]).sort()).toEqual([
      ['pending', false],
      ['ready', false],
      ['ready', true],
    ]);
    // Genau diese Angaben - kein Inhalt, kein Objektschluessel, keine
    // Pruefsumme, keine Kennung von Anhang, Zugang oder Konto.
    for (const anhang of anhaenge) {
      expect(Object.keys(anhang).sort()).toEqual([
        'author_kind',
        'author_label',
        'byte_size',
        'created_at',
        'duration_seconds',
        'locked_at',
        'media_kind',
        'mime_type',
        'status',
      ]);
    }
    // Was die Kopie nicht geben kann, sagt sie (Zweitreview): gesperrte
    // Anhaenge und die Benachrichtigungen je Zugang.
    const hinweise = rows[0]!.daten['nicht_enthalten'] as { was: string; grund: string }[];
    expect(hinweise).toEqual(
      expect.arrayContaining([
        {
          was: 'Inhalt der Fotos und Videos an Rueckfragen',
          grund: expect.stringContaining('BEF-188') as unknown,
        },
        {
          was: 'Benachrichtigungen je Zugang',
          grund: expect.stringContaining('BEF-189') as unknown,
        },
      ]),
    );
  });

  it('enthaelt die patientenbezogenen Abrechnungsdaten', async () => {
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.max],
    );
    const tabellen = Object.keys(rows[0]!.daten['tabellen'] as Record<string, unknown>);

    for (const name of [
      'billable_services',
      'invoice_cancellations',
      'invoice_items',
      'invoice_payment_reminders',
      'invoice_recipients',
      'invoices',
      'payments',
    ]) {
      expect(tabellen).toContain(name);
    }
  });

  it('nennt Datum und Zweck der Zugriffe, ohne Namen oder Kennung der Beschaeftigten (BEF-107, ANN-092)', async () => {
    // Ein Zugriff auf die Akte, der im Protokoll steht.
    await asUserCommitted(users.therapist, 'select * from public.get_patient($1::uuid)', [
      patients.max,
    ]).catch(() => undefined);
    await asUserCommitted(users.ownerTherapist, AUSKUNFT, [patients.max]);
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.max],
    );

    const tabellen = rows[0]!.daten['tabellen'] as Record<string, Record<string, unknown>[]>;
    expect(tabellen).not.toHaveProperty('audit_log');
    const zugriffe = tabellen['access_log']!;
    expect(zugriffe.length).toBeGreaterThan(0);
    expect(zugriffe.map((z) => z['aktion'])).toContain('patient_record.exported');
    for (const zeile of zugriffe) {
      expect(Object.keys(zeile).sort()).toEqual([
        'aktion',
        'durch',
        'ergebnis',
        'gegenstand',
        'zeitpunkt',
      ]);
    }
    const text = JSON.stringify(zugriffe);
    for (const kennung of Object.values(users)) expect(text).not.toContain(kennung);
    expect(text).not.toContain('Anna');

    const hinweise = rows[0]!.daten['nicht_enthalten'] as { was: string; grund: string }[];
    expect(hinweise.map((h) => h.was)).toContain('Namen der Beschaeftigten im Zugriffsprotokoll');
    expect(hinweise.some((h) => h.grund.includes('ANN-092'))).toBe(true);
  });

  it('nennt die Terminwuensche der Plattform mit Tagen, Zustand, Antwort und wer gewuenscht hat (BEF-144)', async () => {
    const wuensche = async (konto: string, zugang: string, notiz: string) =>
      (
        await asUserCommitted<{ id: string }>(konto, WUNSCH, [
          zugang,
          [tagInTagen(3), tagInTagen(5)],
          ['afternoon', 'morning'],
          notiz,
        ])
      ).rows[0]!.id;
    const erika = await wuensche(
      users.plattformErika,
      platformAccesses.erikaBehandlung,
      'Erika in der Behandlung',
    );
    await wuensche(users.plattformPaula, platformAccesses.paulaBegleitungMax, 'Paula fuer Max');
    // Wuensche eines Trainingsverhaeltnisses gehoeren in dessen eigene Auskunft (ADR-021).
    await wuensche(users.plattformErika, platformAccesses.erikaTraining, 'Erika im Training');
    await wuensche(users.plattformTina, platformAccesses.tinaTraining, 'Tina im Training');
    await asUserCommitted(
      users.ownerTherapist,
      'select public.resolve_platform_appointment_request($1::uuid, $2, $3)',
      [erika, 'declined', 'Diese Woche ist voll.'],
    );

    const auskunft = async (patient: string) => {
      const { rows } = await asUser<{ daten: { tabellen: Record<string, unknown[]> } }>(
        users.ownerTherapist,
        AUSKUNFT,
        [patient],
      );
      return rows[0]!.daten.tabellen['platform_appointment_requests'] as Record<string, unknown>[];
    };

    const beiErika = await auskunft(patients.erika);
    expect(beiErika).toHaveLength(1);
    expect(beiErika[0]).toMatchObject({
      kind: 'new',
      appointment_id: null,
      preferred_days: [tagInTagen(3), tagInTagen(5)],
      preferred_times: ['afternoon', 'morning'],
      note: 'Erika in der Behandlung',
      status: 'declined',
      requested_by: 'self',
      representative_name: null,
      answer: 'Diese Woche ist voll.',
      resulting_appointment_id: null,
    });
    expect(beiErika[0]!['resolved_at']).not.toBeNull();
    // Keine interne Kennung des Wunsches, des Zugangs oder eines Kontos.
    expect(Object.keys(beiErika[0]!)).not.toContain('id');
    const text = JSON.stringify(beiErika);
    for (const kennung of [...Object.values(users), ...Object.values(platformAccesses)]) {
      expect(text).not.toContain(kennung);
    }

    const beiMax = await auskunft(patients.max);
    expect(beiMax).toEqual([
      expect.objectContaining({
        note: 'Paula fuer Max',
        status: 'open',
        requested_by: 'companion',
        representative_name: 'Paula Mustermann',
        resolved_at: null,
        answer: null,
      }),
    ]);

    expect(await auskunft(patients.petra)).toEqual([]);
  });

  it('nennt die Zugaenge zur Plattform mit Zustand und Vertretung, ohne Kennungen (BEF-145)', async () => {
    const zugaenge = async (patient: string) => {
      const { rows } = await asUser<{ daten: { tabellen: Record<string, unknown[]> } }>(
        users.ownerTherapist,
        AUSKUNFT,
        [patient],
      );
      return rows[0]!.daten.tabellen['platform_accesses'] as Record<string, unknown>[];
    };

    // Erikas eigener Zugang zur Behandlung; der zum Training gehoert in
    // dessen eigene Auskunft (ADR-021).
    const beiErika = await zugaenge(patients.erika);
    expect(beiErika).toEqual([
      expect.objectContaining({
        access_kind: 'self',
        representative_name: null,
        status: 'active',
        revoked_at: null,
      }),
    ]);
    expect(beiErika[0]!['activated_at']).not.toBeNull();

    // Paula begleitet Max: Name und Einwilligung stehen in der Kopie.
    const beiMax = await zugaenge(patients.max);
    expect(beiMax).toEqual([
      expect.objectContaining({
        access_kind: 'companion',
        representative_name: 'Paula Mustermann',
        status: 'active',
      }),
    ]);
    expect(beiMax[0]!['consent_recorded_at']).not.toBeNull();

    // Keine Kennung von Zugang, Konto, Verhaeltnis oder Praxiskonto.
    for (const zeile of [...beiErika, ...beiMax]) {
      for (const feld of ['id', 'account_user_id', 'relationship_id', 'patient_id', 'created_by']) {
        expect(Object.keys(zeile)).not.toContain(feld);
      }
    }
    const text = JSON.stringify([...beiErika, ...beiMax]);
    for (const kennung of [
      ...Object.values(users),
      ...Object.values(platformAccesses),
      ...Object.values(patients),
    ]) {
      expect(text).not.toContain(kennung);
    }

    expect(await zugaenge(patients.petra)).toEqual([]);
  });

  it('nennt eine rechtliche Vertretung mit Grundlage, Nachweisarten, Zweifelvermerk und Ende (BEF-145, ANN-342)', async () => {
    // Betreuung fuer Petra mit Zweifel an der Einwilligungsfaehigkeit (ANN-207),
    // danach von der Praxis beendet.
    const { rows } = await asUserCommitted<{ access_id: string }>(
      users.therapist,
      `select * from public.invite_platform_representation(
         'treatment', $1::uuid, 'legal_representative', 'guardianship', 'Bernd Betreuer',
         array['identity_document', 'guardianship_certificate'], true, null, null, false, true)`,
      [patients.petra],
    );
    await asUserCommitted(users.ownerTherapist, 'select public.revoke_platform_access($1::uuid)', [
      rows[0]!.access_id,
    ]);

    const { rows: auskunft } = await asUser<{
      daten: { tabellen: Record<string, Record<string, unknown>[]> };
    }>(users.ownerTherapist, AUSKUNFT, [patients.petra]);
    const zugaenge = auskunft[0]!.daten.tabellen['platform_accesses']!;
    expect(zugaenge).toEqual([
      expect.objectContaining({
        access_kind: 'legal_representative',
        representative_name: 'Bernd Betreuer',
        legal_basis: 'guardianship',
        proof_documents: ['guardianship_certificate', 'identity_document'],
        health_scope: true,
        finance_scope: false,
        companion_declined_reason: 'capacity_doubt',
        status: 'revoked',
        revoked_reason: 'practice',
      }),
    ]);
    for (const feld of ['companion_declined_at', 'proof_recorded_at', 'revoked_at']) {
      expect(zugaenge[0]![feld]).not.toBeNull();
    }
    // Wer vermerkt, nachgewiesen oder beendet hat, steht nicht darin.
    for (const feld of ['companion_declined_by', 'proof_recorded_by', 'revoked_by', 'locked_by']) {
      expect(Object.keys(zugaenge[0]!)).not.toContain(feld);
    }
    const text = JSON.stringify(zugaenge);
    for (const kennung of [...Object.values(users), rows[0]!.access_id]) {
      expect(text).not.toContain(kennung);
    }
  });

  it('nennt das Trainingsverhaeltnis als eigene Auskunft, statt es mitzuliefern', async () => {
    // Erika hat beides zugleich (ADR-021 Punkt 1): Akte und Trainingsvertrag.
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.erika],
    );

    const tabellen = Object.keys(rows[0]!.daten['tabellen'] as Record<string, unknown>);
    expect(tabellen).not.toContain('training_relationships');
    expect(tabellen).not.toContain('training_bases');
    expect(tabellen).not.toContain('training_protocols');

    const hinweise = rows[0]!.daten['nicht_enthalten'] as { was: string }[];
    expect(hinweise.map((h) => h.was)).toContain('Daten eines Trainingsverhaeltnisses');
  });

  it('hat fuer jeden Abschnitt eine deutsche Beschriftung und umgekehrt', async () => {
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.max],
    );
    const tabellen = Object.keys(rows[0]!.daten['tabellen'] as Record<string, unknown>).sort();

    expect(Object.keys(AUSKUNFT_KATEGORIEN).sort()).toEqual(tabellen);
  });

  it('protokolliert jede Auskunft als patient_record.exported, ohne Inhalte', async () => {
    await asUserCommitted(users.ownerTherapist, AUSKUNFT, [patients.max]);

    const { rows } = await asPostgres<{
      subject_id: string;
      actor_user_id: string;
      outcome: string;
      context: Record<string, unknown>;
    }>(
      `select subject_id::text as subject_id, actor_user_id::text as actor_user_id, outcome, context
       from public.audit_log where action = 'patient_record.exported'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      subject_id: patients.max,
      actor_user_id: users.ownerTherapist,
      outcome: 'success',
    });
    expect(JSON.stringify(rows[0]?.context)).not.toContain('Mustermann');
  });

  it('weist alle Rollen ausser owner ab', async () => {
    for (const userId of [users.therapist, users.office, users.teamLead, users.patientMax]) {
      await expect(asUser(userId, AUSKUNFT, [patients.max])).rejects.toThrow(
        /data subject access denied/,
      );
    }
  });

  it('weist nicht angemeldete Aufrufe ab, bevor die Funktion ueberhaupt laeuft', async () => {
    // `anon` hat kein Ausfuehrungsrecht - die Abweisung kommt vom Recht, nicht
    // vom Rumpf der Funktion. Die Pruefung im Rumpf bleibt trotzdem stehen:
    // ein spaeter erteiltes Recht darf die Tuer nicht oeffnen.
    await expect(asAnon(AUSKUNFT, [patients.max])).rejects.toThrow(/permission denied/);
  });

  it('weist eine Akte einer fremden Organisation mit derselben Meldung ab', async () => {
    const fremd = await fremdeOrganisation();

    await expect(asUser(users.ownerTherapist, AUSKUNFT, [fremd.patient])).rejects.toThrow(
      /data subject access denied/,
    );
    await expect(asUser(FREMDE_ORGANISATION.owner, AUSKUNFT, [patients.max])).rejects.toThrow(
      /data subject access denied/,
    );
  });

  it('weist eine unbekannte Kennung ab, ohne ihre Abwesenheit zu bestaetigen', async () => {
    await expect(
      asUser(users.ownerTherapist, AUSKUNFT, ['66666666-6666-4666-8666-0000000000ff']),
    ).rejects.toThrow(/data subject access denied/);
  });

  it('schreibt keinen Auditeintrag, wenn der Aufruf abgewiesen wird', async () => {
    await expect(asUser(users.therapist, AUSKUNFT, [patients.max])).rejects.toThrow();

    const { rows } = await asPostgres(
      `select id from public.audit_log where action = 'patient_record.exported'`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe('patient_retention_status', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  // B1 (ANN-511): Solange ein Termin kommt, laeuft die Versorgung - und
  // keine Frist. Der kommende Termin steht hier ausdruecklich: Die Termine des
  // Seeds liegen auf festen Uhrzeiten des Tages und waeren abends vorbei.
  it('meldet waehrend laufender Versorgung eine Frist, die noch nicht laeuft', async () => {
    await asPostgres(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
         starts_at, ends_at
       ) values ($1, $2, '55555555-5555-4555-8555-000000000002',
                 '33333333-3333-4333-8333-000000000001', 'practice', 'confirmed',
                 date_trunc('hour', now()) + interval '50 hours',
                 date_trunc('hour', now()) + interval '51 hours')`,
      [SEED.organizationId, patients.max],
    );
    const { rows } = await asUser<{ stand: Record<string, unknown> }>(
      users.ownerTherapist,
      AUFBEWAHRUNG,
      [patients.max],
    );

    const stand = rows[0]!.stand;
    expect(stand['versorgung_abgeschlossen_am']).toBeNull();

    const klassen = stand['klassen'] as Record<string, unknown>[];
    const akte = klassen.find((k) => k['key'] === 'patientenakte')!;
    expect(akte['legal_reference']).toBe('Par. 630f Abs. 3 BGB');
    expect(akte['anker_datum']).toBeNull();
    expect(akte['frist_ende']).toBeNull();
  });

  /**
   * Legt die Termine der Akte so, dass der letzte am `letzter` endet - die
   * Versorgung ist dann vorbei (B1, ANN-511). Ein Termin wird abgehakt.
   */
  async function behandeltBis(letzter: string) {
    await asPostgres(
      `with verschiebung as (
         select timestamptz '${letzter} 09:00:00+01' - max(starts_at) as um
         from public.appointments where patient_id = $1
       )
       update public.appointments a
          set starts_at = a.starts_at + v.um,
              ends_at   = a.ends_at + v.um
         from verschiebung v
        where a.patient_id = $1`,
      [patients.max],
    );
    await asPostgres(
      `update public.appointments
          set status = 'completed', completed_at = ends_at, completed_by = $2::uuid
        where id = (select id from public.appointments
                     where patient_id = $1 and status = 'confirmed'
                     order by starts_at desc limit 1)`,
      [patients.max, users.therapist],
    );
  }

  it('rechnet nach dem Abschluss zehn Jahre ab dem Ankerdatum', async () => {
    await behandeltBis('2026-03-10');
    await asUserCommitted(
      users.ownerTherapist,
      'select public.conclude_patient_care($1::uuid, $2)',
      [patients.max, '2026-03-15'],
    );

    const { rows } = await asUser<{ stand: Record<string, unknown> }>(
      users.ownerTherapist,
      AUFBEWAHRUNG,
      [patients.max],
    );

    const klassen = rows[0]!.stand['klassen'] as Record<string, unknown>[];
    const akte = klassen.find((k) => k['key'] === 'patientenakte')!;
    expect(akte['anker_datum']).toBe('2026-03-15');
    expect(akte['frist_ende']).toBe('2036-03-15');
    // Geloescht werden darf erst am Tag danach, um Mitternacht der
    // Praxiszeitzone (app.retention_due_at, ADR-008 Punkt 2). Mitte Maerz gilt
    // in Europe/Berlin noch die Normalzeit, deshalb 23:00 UTC des Vortags.
    expect(new Date(String(akte['loeschbar_ab'])).toISOString()).toBe('2036-03-15T23:00:00.000Z');
  });

  // B1 (BEF-151, ANN-511): Ohne festgehaltenen Abschluss rechnet die Frist ab
  // der letzten Behandlung; liegt sie nach dem Abschluss, ab ihr.
  it('rechnet ohne Abschluss ab der letzten Behandlung', async () => {
    await behandeltBis('2026-05-10');

    const { rows } = await asUser<{ stand: Record<string, unknown> }>(
      users.ownerTherapist,
      AUFBEWAHRUNG,
      [patients.max],
    );

    const stand = rows[0]!.stand;
    expect(stand['versorgung_abgeschlossen_am']).toBeNull();
    const klassen = stand['klassen'] as Record<string, unknown>[];
    const akte = klassen.find((k) => k['key'] === 'patientenakte')!;
    expect(akte['anker_datum']).toBe('2026-05-10');
    expect(akte['frist_ende']).toBe('2036-05-10');
  });

  it('nimmt die spaetere Behandlung, wenn sie nach dem Abschluss liegt', async () => {
    await behandeltBis('2026-05-10');
    await asUserCommitted(
      users.ownerTherapist,
      'select public.conclude_patient_care($1::uuid, $2)',
      [patients.max, '2026-03-15'],
    );

    const { rows } = await asUser<{ stand: Record<string, unknown> }>(
      users.ownerTherapist,
      AUFBEWAHRUNG,
      [patients.max],
    );
    const klassen = rows[0]!.stand['klassen'] as Record<string, unknown>[];
    const akte = klassen.find((k) => k['key'] === 'patientenakte')!;
    expect(akte['anker_datum']).toBe('2026-05-10');
  });

  it('nennt eine laufende Loeschsperre als eigenen Grund', async () => {
    await asUserCommitted(users.ownerTherapist, 'select public.place_legal_hold($1::uuid, $2)', [
      patients.max,
      'Honorarstreit, Az. 4 C 12/26',
    ]);

    const { rows } = await asUser<{ stand: Record<string, unknown> }>(
      users.ownerTherapist,
      AUFBEWAHRUNG,
      [patients.max],
    );

    expect(rows[0]!.stand['loeschsperre']).toMatchObject({
      grund: 'Honorarstreit, Az. 4 C 12/26',
    });
  });

  it('meldet ohne ausgestellte Rechnung keine steuerliche Frist', async () => {
    const { rows } = await asUser<{ stand: Record<string, unknown> }>(
      users.ownerTherapist,
      AUFBEWAHRUNG,
      [patients.max],
    );

    const klassen = rows[0]!.stand['klassen'] as Record<string, unknown>[];
    const abrechnung = klassen.find((k) => k['key'] === 'abrechnungsdaten')!;
    expect(abrechnung['legal_reference']).toBe('Par. 147 Abs. 3 AO');
    expect(abrechnung['anker_datum']).toBeNull();
    expect(abrechnung['datensaetze']).toBe(0);
  });

  it('weist alle Rollen ausser owner ab', async () => {
    for (const userId of [users.therapist, users.office, users.teamLead, users.patientMax]) {
      await expect(asUser(userId, AUFBEWAHRUNG, [patients.max])).rejects.toThrow(
        /data subject access denied/,
      );
    }
  });

  it('protokolliert nichts - der Aufruf gibt keine Inhalte heraus', async () => {
    await asUserCommitted(users.ownerTherapist, AUFBEWAHRUNG, [patients.max]);

    const { rows } = await asPostgres(
      `select id from public.audit_log where action = 'patient_record.exported'`,
    );
    expect(rows).toHaveLength(0);
  });
});
