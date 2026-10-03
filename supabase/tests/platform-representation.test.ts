import { zugangsdienstLoescht } from './helpers/zugangsdienst';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { EINWILLIGUNG_BEGLEITUNG_FASSUNG } from '@/lib/vertretung';
import {
  SEED,
  asPostgres,
  asServiceRole,
  asUser,
  asUserCommitted,
  FREMDE_ORGANISATION,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import {
  erwarteAbgewiesenenLeseversuch,
  erwarteAbgewiesenenSchreibversuch,
} from './helpers/abgewiesen';

/**
 * Vertretung als eigener Zugang (POR-005, ADR-023 Punkte 13 bis 15, W3, W4).
 *
 * Die Praxis lädt eine rechtliche Vertretung oder eine Begleitung vor Ort ein
 * und vermerkt, was sie gesehen hat. Geprüft werden Art, Grundlage und Alter
 * an einer Stelle, der Nachweis ohne Dokument, die Einwilligung zur
 * Begleitung, der Riegel zwischen vertretener und vertretender Person und
 * das Ende des Sorgerechts am 18. Geburtstag. Negativfälle je Art.
 */

const { users, patients, trainingRelationships, platformAccesses, organizationId } = SEED;

const VERTRETUNG = `select * from public.invite_platform_representation(
  $1, $2::uuid, $3, $4, $5, $6::text[], $7::boolean, $8, $9::boolean, $10::boolean)`;
const LISTE = 'select * from public.list_platform_representations($1, $2::uuid)';
const NEUER_CODE = 'select * from public.renew_platform_representation_code($1::uuid)';
/** Mit Zweifel an der Einwilligungsfaehigkeit (LOG-EPIC-001, ANN-207 Fassung 2). */
const MIT_ZWEIFEL = `select * from public.invite_platform_representation(
  $1, $2::uuid, $3, $4, $5, $6::text[], $7::boolean, $8, $9::boolean, $10::boolean, true)`;
const EINLOESEN = 'select public.redeem_platform_invitation($1, $2::uuid) as access_id';
const KONTEXT = 'select * from public.platform_context()';

interface Einladung {
  access_id: string;
  invitation_id: string;
  purpose: string;
  code: string;
  expires_at: string;
}

interface Angaben {
  art: 'treatment' | 'training';
  verhaeltnis: string;
  zugangsart: string;
  grundlage: string | null;
  name: string;
  dokumente: string[];
  aufgabenkreis: boolean | null;
  fassung: string | null;
  fruehere: boolean | null;
  /** ABN-010: Bereich Rechnungen, nachgewiesen bzw. eingewilligt. */
  rechnungen: boolean | null;
}

const BEGLEITUNG_PETRA: Angaben = {
  art: 'treatment',
  verhaeltnis: patients.petra,
  zugangsart: 'companion',
  grundlage: null,
  name: 'Paula Platzhalter',
  dokumente: ['identity_document'],
  aufgabenkreis: null,
  fassung: EINWILLIGUNG_BEGLEITUNG_FASSUNG,
  fruehere: false,
  rechnungen: false,
};

const BETREUUNG_MAX: Angaben = {
  art: 'treatment',
  verhaeltnis: patients.max,
  zugangsart: 'legal_representative',
  grundlage: 'guardianship',
  name: 'Bernd Betreuer',
  dokumente: ['identity_document', 'guardianship_certificate'],
  aufgabenkreis: true,
  fassung: null,
  fruehere: null,
  rechnungen: false,
};

function parameter(a: Angaben): unknown[] {
  return [
    a.art,
    a.verhaeltnis,
    a.zugangsart,
    a.grundlage,
    a.name,
    a.dokumente,
    a.aufgabenkreis,
    a.fassung,
    a.fruehere,
    a.rechnungen,
  ];
}

async function vertretungEinladen(konto: string, a: Angaben): Promise<Einladung> {
  const { rows } = await asUserCommitted<Einladung>(konto, VERTRETUNG, parameter(a));
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

function h(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

async function neuesKonto(id: string, email: string): Promise<string> {
  await asPostgres(
    `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)`,
    [id, email],
  );
  return id;
}

/** Geburtsdatum der Akte, in Jahren und Tagen vor heute. */
async function geburtsdatum(patient: string, ausdruck: string | null) {
  await asPostgres(
    `update public.patient_contact_details set date_of_birth = ${ausdruck ?? 'null'} where patient_id = $1`,
    [patient],
  );
}

const KONTO_PAULA = '99999999-9999-4999-8999-0000000000b1';
const KONTO_BERND = '99999999-9999-4999-8999-0000000000b2';

describe('Vertretung einladen (ADR-023 Punkt 13)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('richtet eine Begleitung mit Einwilligung und Nachweis ein, ohne Dokument', async () => {
    const einladung = await vertretungEinladen(users.office, BEGLEITUNG_PETRA);
    expect(einladung.purpose).toBe('activate');
    expect(einladung.code).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const { rows } = await asPostgres<Record<string, unknown>>(
      `select access_kind, status, legal_basis, representative_name, proof_documents,
              proof_recorded_by, consent_text_version, consent_recorded_by,
              consent_earlier_messages, health_scope, finance_scope
         from public.platform_accesses where id = $1`,
      [einladung.access_id],
    );
    expect(rows[0]).toEqual({
      access_kind: 'companion',
      status: 'invited',
      legal_basis: null,
      representative_name: 'Paula Platzhalter',
      proof_documents: ['identity_document'],
      proof_recorded_by: users.office,
      consent_text_version: EINWILLIGUNG_BEGLEITUNG_FASSUNG,
      consent_recorded_by: users.office,
      consent_earlier_messages: false,
      health_scope: null,
      finance_scope: false,
    });

    // Vor Ort, ohne Adresse (ANN-204); der Code steht in keinem Auditeintrag.
    const einl = await asPostgres<{ channel: string; email: string | null }>(
      'select channel, email from public.platform_access_invitations where id = $1',
      [einladung.invitation_id],
    );
    expect(einl.rows).toEqual([{ channel: 'on_site', email: null }]);
    const audit = await asPostgres<{ context: unknown; subject_id: string }>(
      `select context, subject_id from public.audit_log where action = 'platform_access.invited'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.subject_id).toBe(einladung.access_id);
    expect(audit.rows[0]?.context).toMatchObject({
      access_kind: 'companion',
      channel: 'on_site',
    });
    expect(JSON.stringify(audit.rows)).not.toContain(einladung.code);
    expect(JSON.stringify(audit.rows)).not.toContain('Paula');
  });

  it('richtet eine rechtliche Vertretung je Grundlage mit ihrem Dokument ein', async () => {
    const betreuung = await vertretungEinladen(users.therapist, BETREUUNG_MAX);
    const vollmacht = await vertretungEinladen(users.teamLead, {
      ...BETREUUNG_MAX,
      grundlage: 'power_of_attorney',
      name: 'Vera Vollmacht',
      dokumente: ['identity_document', 'power_of_attorney', 'custody_proof'],
      aufgabenkreis: true,
      rechnungen: true,
    });
    const { rows } = await asPostgres<{
      id: string;
      legal_basis: string;
      proof_documents: string[];
      health_scope: boolean | null;
      finance_scope: boolean | null;
    }>(
      `select id, legal_basis, proof_documents, health_scope, finance_scope
         from public.platform_accesses where id in ($1, $2) order by legal_basis`,
      [betreuung.access_id, vollmacht.access_id],
    );
    expect(rows).toEqual([
      {
        id: betreuung.access_id,
        legal_basis: 'guardianship',
        proof_documents: ['guardianship_certificate', 'identity_document'],
        health_scope: true,
        finance_scope: false,
      },
      // Ein Dokument, das nicht zur Grundlage gehört, wird nicht vermerkt.
      {
        id: vollmacht.access_id,
        legal_basis: 'power_of_attorney',
        proof_documents: ['identity_document', 'power_of_attorney'],
        health_scope: true,
        finance_scope: true,
      },
    ]);
  });

  it.each([
    ['ohne Ausweis', { dokumente: [] as string[] }, 'identity document must be seen'],
    ['ohne Einwilligung', { fassung: null }, 'consent of the person required'],
    ['mit alter Fassung', { fassung: 'begleitung-alt' }, 'consent of the person required'],
    ['ohne Umfang', { fruehere: null }, 'consent scope required'],
    ['ohne Namen', { name: ' ' }, 'representative name required'],
    ['als eigener Zugang', { zugangsart: 'self' }, 'unknown representation kind'],
  ] as const)('Begleitung %s: abgewiesen', async (_fall, aenderung, meldung) => {
    await expect(
      asUser(users.office, VERTRETUNG, parameter({ ...BEGLEITUNG_PETRA, ...aenderung })),
    ).rejects.toThrow(meldung);
  });

  it.each([
    ['ohne Grundlage', { grundlage: null }, 'legal basis required'],
    [
      'ohne Betreuerausweis',
      { dokumente: ['identity_document'] as string[] },
      'authority document must be seen',
    ],
    ['ohne Gesundheitssorge', { aufgabenkreis: false }, 'guardianship must cover health care'],
    [
      'als Vollmacht ohne Gesundheitssorge',
      {
        grundlage: 'power_of_attorney',
        dokumente: ['identity_document', 'power_of_attorney'] as string[],
        aufgabenkreis: false,
      },
      'power of attorney must cover health care',
    ],
    ['ohne Angabe zu Rechnungen', { rechnungen: null }, 'finance scope must be stated'],
    [
      'mit Sorgerecht für eine Erwachsene',
      { grundlage: 'custody', dokumente: ['identity_document', 'custody_proof'] as string[] },
      'custody ends at majority',
    ],
  ] as const)('Rechtliche Vertretung %s: abgewiesen', async (_fall, aenderung, meldung) => {
    await expect(
      asUser(users.office, VERTRETUNG, parameter({ ...BETREUUNG_MAX, ...aenderung })),
    ).rejects.toThrow(meldung);
  });

  it('kennt fuer Minderjaehrige nur das Sorgerecht (Punkt 15, W4)', async () => {
    await geburtsdatum(patients.max, "current_date - interval '10 years'");
    await expect(asUser(users.office, VERTRETUNG, parameter(BETREUUNG_MAX))).rejects.toThrow(
      'minor needs custody',
    );
    await expect(
      asUser(
        users.office,
        VERTRETUNG,
        parameter({ ...BEGLEITUNG_PETRA, verhaeltnis: patients.max }),
      ),
    ).rejects.toThrow('minor needs custody');
    // Und kein eigener Zugang (POR-002).
    await expect(
      asUser(
        users.office,
        "select * from public.invite_platform_access('treatment', $1::uuid, 'on_site', false)",
        [patients.max],
      ),
    ).rejects.toThrow('under age');

    const sorge = await vertretungEinladen(users.office, {
      ...BETREUUNG_MAX,
      grundlage: 'custody',
      name: 'Sara Sorge',
      dokumente: ['identity_document', 'custody_proof'],
      aufgabenkreis: null,
    });
    expect(sorge.purpose).toBe('activate');
  });

  it('verlangt ein Geburtsdatum (ANN-208)', async () => {
    await geburtsdatum(patients.petra, null);
    await expect(asUser(users.office, VERTRETUNG, parameter(BEGLEITUNG_PETRA))).rejects.toThrow(
      'date of birth required',
    );
  });

  it('laesst nur die Rollen einladen, die das Verhaeltnis schreiben (Punkt 6)', async () => {
    // Die Trainingsbetreuung schreibt keine Akte, die Therapeutin kein Training.
    await erwarteAbgewiesenenSchreibversuch(
      users.trainer,
      VERTRETUNG,
      parameter(BEGLEITUNG_PETRA),
      'platform_access.invited',
    );
    await erwarteAbgewiesenenSchreibversuch(
      users.therapist,
      VERTRETUNG,
      parameter({ ...BEGLEITUNG_PETRA, art: 'training', verhaeltnis: trainingRelationships.tina }),
      'platform_access.invited',
    );
    expect(
      (
        await asPostgres(
          `select 1 from public.platform_accesses where access_kind <> 'self' and relationship_id in ($1, $2)`,
          [patients.petra, trainingRelationships.tina],
        )
      ).rows,
    ).toEqual([]);
  });

  it('kennt kein Verhaeltnis einer anderen Organisation', async () => {
    const fremd = await fremdeOrganisation();
    await expect(
      asUser(
        users.office,
        VERTRETUNG,
        parameter({ ...BEGLEITUNG_PETRA, verhaeltnis: fremd.patient }),
      ),
    ).rejects.toThrow('relationship not found');
  });

  it('haelt Art und Nachweis fest: geaendert wird nur durch eine neue Einladung', async () => {
    const einladung = await vertretungEinladen(users.office, BEGLEITUNG_PETRA);
    await expect(
      asPostgres(
        `update public.platform_accesses set representative_name = 'Jemand Anders' where id = $1`,
        [einladung.access_id],
      ),
    ).rejects.toThrow('platform access kind and proof are fixed');
    await expect(
      asPostgres(
        `update public.platform_accesses set access_kind = 'legal_representative' where id = $1`,
        [einladung.access_id],
      ),
    ).rejects.toThrow('platform access kind and proof are fixed');
  });

  it('weist Felder ab, die nicht zur Art gehoeren', async () => {
    await expect(
      asPostgres(`update public.platform_accesses set representative_name = 'Name' where id = $1`, [
        platformAccesses.tinaTraining,
      ]),
    ).rejects.toThrow();
    await expect(
      asPostgres(
        `insert into public.platform_accesses
           (organization_id, relationship_kind, relationship_id, patient_id, access_kind,
            representative_name, proof_documents, finance_scope, proof_recorded_by,
            proof_recorded_at, created_by)
         values ($1, 'treatment', $2, $2, 'companion', 'Ohne Einwilligung',
                 array['identity_document'], false, $3, now(), $3)`,
        [organizationId, patients.petra, users.office],
      ),
    ).rejects.toThrow(/platform_accesses_kind_fields/);
  });
});

describe('Vertretung einloesen (Punkte 4 und 13)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('bindet das eigene Konto der vertretenden Person', async () => {
    const einladung = await vertretungEinladen(users.office, BEGLEITUNG_PETRA);
    await neuesKonto(KONTO_PAULA, 'paula@patient.invalid');
    await asServiceRole(EINLOESEN, [h(einladung.code), KONTO_PAULA]);
    const { rows } = await asPostgres<{ status: string; account_user_id: string }>(
      'select status, account_user_id from public.platform_accesses where id = $1',
      [einladung.access_id],
    );
    expect(rows[0]).toEqual({ status: 'active', account_user_id: KONTO_PAULA });
  });

  it('erlaubt einem Konto, das selbst Patientin ist, eine andere Person zu begleiten', async () => {
    // Erika hat ihr eigenes Konto und begleitet Petra damit - ein Konto je
    // Person (Punkt 4), Erika braucht kein zweites.
    const einladung = await vertretungEinladen(users.office, BEGLEITUNG_PETRA);
    await asServiceRole(EINLOESEN, [h(einladung.code), users.plattformErika]);
    const erika = await asUser<{ access_kind: string }>(users.plattformErika, KONTEXT);
    expect(erika.rows.map((z) => z.access_kind).sort()).toEqual(['companion', 'self', 'self']);
  });

  it('bindet nie das Konto der vertretenen Person selbst', async () => {
    // Erika kann nicht ihre eigene Begleitung sein.
    const einladung = await vertretungEinladen(users.office, {
      ...BEGLEITUNG_PETRA,
      verhaeltnis: patients.erika,
    });
    await expect(
      asServiceRole(EINLOESEN, [h(einladung.code), users.plattformErika]),
    ).rejects.toThrow('account belongs to the represented person');
  });

  it('bindet keinen eigenen Zugang an das Konto einer Vertretung derselben Person', async () => {
    const begleitung = await vertretungEinladen(users.office, BEGLEITUNG_PETRA);
    await neuesKonto(KONTO_PAULA, 'paula@patient.invalid');
    await asServiceRole(EINLOESEN, [h(begleitung.code), KONTO_PAULA]);

    const eigen = await asUserCommitted<Einladung>(
      users.office,
      "select * from public.invite_platform_access('treatment', $1::uuid, 'on_site', false)",
      [patients.petra],
    );
    await expect(asServiceRole(EINLOESEN, [h(eigen.rows[0]!.code), KONTO_PAULA])).rejects.toThrow(
      'account represents this person',
    );
  });

  it('bindet kein Praxiskonto', async () => {
    const einladung = await vertretungEinladen(users.office, BEGLEITUNG_PETRA);
    await expect(asServiceRole(EINLOESEN, [h(einladung.code), users.therapist])).rejects.toThrow(
      'practice account cannot hold platform access',
    );
  });
});

describe('Sorgerecht endet am 18. Geburtstag (Punkt 15, ANN-208)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function sorgerecht(): Promise<string> {
    await geburtsdatum(patients.max, "current_date - interval '17 years'");
    const einladung = await vertretungEinladen(users.office, {
      ...BETREUUNG_MAX,
      grundlage: 'custody',
      name: 'Sara Sorge',
      dokumente: ['identity_document', 'custody_proof'],
      aufgabenkreis: null,
    });
    await neuesKonto(KONTO_BERND, 'sara@patient.invalid');
    await asServiceRole(EINLOESEN, [h(einladung.code), KONTO_BERND]);
    return einladung.access_id;
  }

  it('liest bis zum Tag vor dem 18. Geburtstag', async () => {
    await sorgerecht();
    const vorher = await asUser<{ readable: boolean; read_until: Date | null }>(
      KONTO_BERND,
      KONTEXT,
    );
    expect(vorher.rows).toEqual([
      expect.objectContaining({ readable: true, read_until: expect.any(Date) as unknown }),
    ]);
  });

  it('liest ab dem 18. Geburtstag nichts mehr, und das Konto faellt danach', async () => {
    const id = await sorgerecht();
    // Der 18. Geburtstag war gestern.
    await geburtsdatum(patients.max, "current_date - interval '18 years' - interval '1 day'");
    const nachher = await asUser<{ readable: boolean; status: string }>(KONTO_BERND, KONTEXT);
    expect(nachher.rows).toEqual([expect.objectContaining({ status: 'active', readable: false })]);

    // Die Praxis sieht das Ende; einen neuen Code gibt es nicht.
    const liste = await asUser<{ id: string; ended_at: Date | null }>(users.office, LISTE, [
      'treatment',
      patients.max,
    ]);
    expect(liste.rows.find((z) => z.id === id)?.ended_at?.getTime()).toBeLessThan(Date.now());
    await expect(asUser(users.office, NEUER_CODE, [id])).rejects.toThrow(
      'platform access has ended',
    );

    // 31 Tage nach dem Geburtstag faellt das Konto (ADR-023 Punkt 5).
    await geburtsdatum(patients.max, "current_date - interval '18 years' - interval '31 days'");
    await asPostgres('select public.apply_retention()');
    await zugangsdienstLoescht();
    expect(
      (await asPostgres('select 1 from auth.users where id = $1', [KONTO_BERND])).rows,
    ).toEqual([]);
  });
});

/**
 * ABN-009 (BEF-117, ANN-208): eine Altersrechnung. Volljährig um 0 Uhr am
 * 18. Geburtstag, wer am 29. Februar geboren ist, im Nichtschaltjahr am
 * 1. März (§§ 187 Abs. 2, 188 Abs. 2 BGB).
 */
describe('Volljährigkeit an einer Stelle (ABN-009)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it.each([
    ['2008-02-29', '2026-03-01'],
    ['2008-02-28', '2026-02-28'],
    ['2008-03-01', '2026-03-01'],
    ['2004-02-29', '2022-03-01'],
  ])('macht eine am %s geborene Person am %s volljährig', async (geboren, volljaehrig) => {
    const { rows } = await asPostgres<{ tag: string }>(
      `select to_char(app.majority_date($1::date), 'YYYY-MM-DD') as tag`,
      [geboren],
    );
    expect(rows[0]!.tag).toBe(volljaehrig);
  });

  it('rechnet „minderjährig“ mit demselben Tag wie das Ende des Sorgerechts', async () => {
    const { rows } = await asPostgres<{ gestern18: boolean; heute18: boolean; morgen18: boolean }>(
      `with heute as (select (now() at time zone 'Europe/Berlin')::date as tag)
       select app.platform_is_minor((tag - interval '18 years' - interval '1 day')::date, 'Europe/Berlin') as gestern18,
              app.platform_is_minor((tag - interval '18 years')::date, 'Europe/Berlin') as heute18,
              app.platform_is_minor((tag - interval '18 years' + interval '1 day')::date, 'Europe/Berlin') as morgen18
       from heute`,
    );
    expect(rows[0]).toEqual({ gestern18: false, heute18: false, morgen18: true });
  });

  it('beendet das Sorgerecht eines am 29. Februar geborenen Kindes am 1. März um 0 Uhr', async () => {
    await geburtsdatum(patients.max, "current_date - interval '17 years'");
    const einladung = await vertretungEinladen(users.office, {
      ...BETREUUNG_MAX,
      grundlage: 'custody',
      name: 'Sara Sorge',
      dokumente: ['identity_document', 'custody_proof'],
      aufgabenkreis: null,
    });
    await geburtsdatum(patients.max, "'2008-02-29'");
    const { rows } = await asPostgres<{ ende: string }>(
      `select to_char(app.platform_access_ended_at($1::uuid) at time zone 'Europe/Berlin',
                      'YYYY-MM-DD HH24:MI') as ende`,
      [einladung.access_id],
    );
    expect(rows[0]!.ende).toBe('2026-03-01 00:00');
  });
});

describe('Vertretungen in der Praxis lesen und verwalten', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('listet die Vertretungen mit Nachweis, ohne Konto und ohne Code', async () => {
    const einladung = await vertretungEinladen(users.office, BEGLEITUNG_PETRA);
    const { rows } = await asUser<Record<string, unknown>>(users.therapist, LISTE, [
      'treatment',
      patients.petra,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: einladung.access_id,
      access_kind: 'companion',
      representative_name: 'Paula Platzhalter',
      status: 'invited',
      proof_documents: ['identity_document'],
      proof_recorded_by_name: 'Olivia Office',
      consent_earlier_messages: false,
      invitation_purpose: 'activate',
    });
    expect(Object.keys(rows[0]!)).not.toContain('account_user_id');
    expect(JSON.stringify(rows)).not.toContain(einladung.code);
  });

  it('zeigt den eigenen Zugang nicht in der Liste der Vertretungen', async () => {
    const { rows } = await asUser(users.office, LISTE, ['treatment', patients.erika]);
    expect(rows).toEqual([]);
  });

  it('weist eine Rolle ab, die das Verhaeltnis nicht liest', async () => {
    await vertretungEinladen(users.office, BEGLEITUNG_PETRA);
    await erwarteAbgewiesenenLeseversuch(
      users.trainer,
      LISTE,
      ['treatment', patients.petra],
      'platform_accesses.read',
    );
  });

  it('sperrt, entsperrt und entzieht eine Vertretung ueber die bestehenden Wege', async () => {
    const einladung = await vertretungEinladen(users.office, BEGLEITUNG_PETRA);
    await neuesKonto(KONTO_PAULA, 'paula@patient.invalid');
    await asServiceRole(EINLOESEN, [h(einladung.code), KONTO_PAULA]);

    await asUserCommitted(
      users.office,
      'select public.set_platform_access_locked($1::uuid, true)',
      [einladung.access_id],
    );
    expect((await asUser<{ readable: boolean }>(KONTO_PAULA, KONTEXT)).rows[0]?.readable).toBe(
      false,
    );
    await asUserCommitted(users.office, 'select public.revoke_platform_access($1::uuid)', [
      einladung.access_id,
    ]);
    expect((await asUser(KONTO_PAULA, KONTEXT)).rows).toEqual([]);
  });

  it('stellt einen neuen Code aus: Einladung, solange eingeladen, sonst neues Kennwort', async () => {
    const erste = await vertretungEinladen(users.office, BEGLEITUNG_PETRA);
    const zweite = (await asUserCommitted<Einladung>(users.office, NEUER_CODE, [erste.access_id]))
      .rows[0]!;
    expect(zweite.purpose).toBe('activate');
    // Es gilt immer nur der jüngste Code.
    await expect(asServiceRole(EINLOESEN, [h(erste.code), KONTO_PAULA])).rejects.toThrow(
      'invitation not valid',
    );
    await neuesKonto(KONTO_PAULA, 'paula@patient.invalid');
    await asServiceRole(EINLOESEN, [h(zweite.code), KONTO_PAULA]);

    const dritte = (await asUserCommitted<Einladung>(users.office, NEUER_CODE, [erste.access_id]))
      .rows[0]!;
    expect(dritte.purpose).toBe('reset');
  });

  it('stellt ueber diesen Weg keinen Code fuer den eigenen Zugang aus', async () => {
    await expect(
      asUser(users.office, NEUER_CODE, [platformAccesses.erikaBehandlung]),
    ).rejects.toThrow('use invite_platform_access');
    await erwarteAbgewiesenenSchreibversuch(
      users.therapist,
      NEUER_CODE,
      [platformAccesses.tinaTraining],
      'platform_access.invited',
    );
  });

  it('vermerkt einen Zweifel an der Einwilligungsfaehigkeit am Zugang, ohne Grund (ANN-207)', async () => {
    const { rows } = await asUserCommitted<Einladung>(
      users.therapist,
      MIT_ZWEIFEL,
      parameter(BETREUUNG_MAX),
    );
    const { rows: zugang } = await asPostgres<Record<string, unknown>>(
      `select access_kind, companion_declined_by, companion_declined_reason,
              companion_declined_at is not null as vermerkt
         from public.platform_accesses where id = $1`,
      [rows[0]!.access_id],
    );
    expect(zugang).toEqual([
      {
        access_kind: 'legal_representative',
        companion_declined_by: users.therapist,
        companion_declined_reason: 'capacity_doubt',
        vermerkt: true,
      },
    ]);
    // LOG-EPIC-001: der Vermerk ist Teil des Datenmodells, kein Auditeintrag.
    expect(
      (await asPostgres("select 1 from public.audit_log where action like '%companion%'")).rows,
    ).toEqual([]);

    // Eine Begleitung mit Zweifel gibt es nicht.
    await expect(asUser(users.office, MIT_ZWEIFEL, parameter(BEGLEITUNG_PETRA))).rejects.toThrow(
      /capacity doubt allows only a legal representative/,
    );
  });
});

describe('Vertretung im Loeschlauf (ADR-023 Punkt 5, Konsequenzen)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('beendet die Vertretung mit dem Verhaeltnis; der Nachweis behaelt nur den Namen der Vertretung', async () => {
    await asPostgres(
      `update public.training_contact_details set date_of_birth = '1990-01-01'
        where training_relationship_id = $1`,
      [trainingRelationships.tina],
    );
    const einladung = await vertretungEinladen(users.office, {
      ...BEGLEITUNG_PETRA,
      art: 'training',
      verhaeltnis: trainingRelationships.tina,
    });
    await asPostgres(
      'select app.delete_training_relationship($1::uuid, extensions.gen_random_uuid(), now())',
      [trainingRelationships.tina],
    );
    const { rows } = await asPostgres<Record<string, unknown>>(
      `select status, revoked_reason, training_relationship_id, relationship_id, representative_name
         from public.platform_accesses where id = $1`,
      [einladung.access_id],
    );
    expect(rows[0]).toEqual({
      status: 'revoked',
      revoked_reason: 'relationship_deleted',
      training_relationship_id: null,
      relationship_id: trainingRelationships.tina,
      representative_name: 'Paula Platzhalter',
    });
    // Die Person der vertretenen Seite haelt der Nachweis nicht fest.
    expect(
      (await asPostgres('select 1 from public.persons where id = $1', [SEED.persons.tina])).rows,
    ).toEqual([]);
  });
});

describe('Zweifel-Vermerk im Loeschlauf (LOG-EPIC-001, ANN-207 Fassung 2)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  /** Beendet den Zugang vor vier Jahren - drei Jahre Frist sind damit um. */
  async function vorVierJahrenBeendet(id: string): Promise<void> {
    await asPostgres(
      `update public.platform_accesses
          set status = 'revoked', revoked_at = now() - interval '4 years', revoked_by = $2,
              revoked_reason = 'revoked'
        where id = $1`,
      [id, users.office],
    );
  }

  async function loeschlauf(): Promise<void> {
    await asPostgres(
      'select app.delete_due_platform_accesses($1::uuid, extensions.gen_random_uuid())',
      [organizationId],
    );
  }

  async function vorhanden(id: string): Promise<boolean> {
    return (
      (await asPostgres('select 1 from public.platform_accesses where id = $1', [id])).rows
        .length === 1
    );
  }

  it('haelt einen Zugang mit Zweifel-Vermerk so lange wie die Akte', async () => {
    const ohne = await vertretungEinladen(users.office, BETREUUNG_MAX);
    const { rows } = await asUserCommitted<Einladung>(users.office, MIT_ZWEIFEL, [
      ...parameter(BETREUUNG_MAX).slice(0, 4),
      'Berta Betreuerin',
      ...parameter(BETREUUNG_MAX).slice(5),
    ]);
    const mit = rows[0]!;
    await vorVierJahrenBeendet(ohne.access_id);
    await vorVierJahrenBeendet(mit.access_id);

    await loeschlauf();
    // Ohne Vermerk nach drei Jahren weg, mit Vermerk bleibt er bei der Akte.
    expect(await vorhanden(ohne.access_id)).toBe(false);
    expect(await vorhanden(mit.access_id)).toBe(true);

    // Faellt die Akte, setzt ihr Loeschen den Verweis auf null - dann faellt
    // auch der Vermerk.
    await asPostgres('update public.platform_accesses set patient_id = null where id = $1', [
      mit.access_id,
    ]);
    await loeschlauf();
    expect(await vorhanden(mit.access_id)).toBe(false);
  });
});

describe('Fassung der Einwilligung (ANN-206)', () => {
  it('ist in Datenbank und Oberflaeche dieselbe', async () => {
    const { rows } = await asPostgres<{ v: string }>(
      'select app.platform_companion_consent_version() as v',
    );
    expect(rows[0]?.v).toBe(EINWILLIGUNG_BEGLEITUNG_FASSUNG);
  });
});

describe('Zweitreview: Alter, Organisation, Widerruf, Riegel', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function aktiveBegleitungPetra(): Promise<string> {
    const einladung = await vertretungEinladen(users.office, BEGLEITUNG_PETRA);
    await neuesKonto(KONTO_PAULA, 'paula@patient.invalid');
    await asServiceRole(EINLOESEN, [h(einladung.code), KONTO_PAULA]);
    return einladung.access_id;
  }

  it.each([
    ['nachtraeglich minderjaehrig', "current_date - interval '10 years'"],
    ['ohne Geburtsdatum', null],
  ])('beendet eine Begleitung, wenn die Person %s ist (Punkt 15)', async (_fall, ausdruck) => {
    const id = await aktiveBegleitungPetra();
    expect((await asUser<{ readable: boolean }>(KONTO_PAULA, KONTEXT)).rows[0]?.readable).toBe(
      true,
    );
    await geburtsdatum(patients.petra, ausdruck);
    expect((await asUser<{ readable: boolean }>(KONTO_PAULA, KONTEXT)).rows[0]?.readable).toBe(
      false,
    );
    await expect(asUser(users.office, NEUER_CODE, [id])).rejects.toThrow(
      'platform access has ended',
    );
  });

  it('stellt einer offenen Sorgerechtseinladung nach dem 18. Geburtstag keinen neuen Code aus', async () => {
    await geburtsdatum(patients.max, "current_date - interval '17 years'");
    const einladung = await vertretungEinladen(users.office, {
      ...BETREUUNG_MAX,
      grundlage: 'custody',
      name: 'Sara Sorge',
      dokumente: ['identity_document', 'custody_proof'],
      aufgabenkreis: null,
    });
    await geburtsdatum(patients.max, "current_date - interval '18 years' - interval '1 day'");
    await expect(asUser(users.office, NEUER_CODE, [einladung.access_id])).rejects.toThrow(
      'platform access has ended',
    );
  });

  it('stellt kein neues Kennwort aus, wenn das Konto einen Zugang in einer anderen Praxis hat', async () => {
    const fremd = await fremdeOrganisation();
    await asPostgres(
      `update public.patient_contact_details set date_of_birth = '1950-01-01' where patient_id = $1`,
      [fremd.patient],
    );
    // Paula begleitet Petra hier und zugleich jemanden in der fremden Praxis.
    const id = await aktiveBegleitungPetra();
    await asPostgres(
      `insert into public.platform_accesses
         (organization_id, relationship_kind, relationship_id, patient_id, account_user_id, status,
          activated_at, access_kind, representative_name, proof_documents, proof_recorded_by,
          proof_recorded_at, consent_text_version, consent_recorded_by, consent_recorded_at,
          consent_earlier_messages, finance_scope, created_by)
       values ($1, 'treatment', $2, $2, $3, 'active', now(), 'companion', 'Paula Platzhalter',
               array['identity_document'], $4, now(), $5, $4, now(), false, false, $4)`,
      [
        fremd.organizationId,
        fremd.patient,
        KONTO_PAULA,
        fremd.owner,
        EINWILLIGUNG_BEGLEITUNG_FASSUNG,
      ],
    );
    await expect(asUser(users.ownerTherapist, NEUER_CODE, [id])).rejects.toThrow(
      'reset needs every area of this account',
    );
    // Derselbe Riegel am eigenen Zugang (POR-002): Erika mit einer
    // Begleitung in der fremden Praxis bekommt hier kein neues Kennwort.
    await asPostgres(
      `update public.platform_accesses set account_user_id = $1 where account_user_id = $2 and organization_id = $3`,
      [users.plattformErika, KONTO_PAULA, fremd.organizationId],
    );
    await expect(
      asUser(
        users.ownerTherapist,
        "select * from public.invite_platform_access('treatment', $1::uuid, 'on_site', false)",
        [patients.erika],
      ),
    ).rejects.toThrow('reset needs every area of this account');
  });

  it('vermerkt einen in der Praxis erklaerten Widerruf als Widerruf', async () => {
    const id = await aktiveBegleitungPetra();
    await asUserCommitted(
      users.office,
      'select public.record_companion_consent_withdrawn($1::uuid)',
      [id],
    );
    const { rows } = await asPostgres<{ status: string; revoked_reason: string }>(
      'select status, revoked_reason from public.platform_accesses where id = $1',
      [id],
    );
    expect(rows[0]).toEqual({ status: 'revoked', revoked_reason: 'consent_withdrawn' });
    const log = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log where action = 'platform_access.revoked' and subject_id = $1`,
      [id],
    );
    expect(log.rows[0]?.context).toMatchObject({ reason: 'consent_withdrawn', surface: 'web' });
    // Eine rechtliche Vertretung beruht nicht auf einer Einwilligung.
    const betreuung = await vertretungEinladen(users.office, BETREUUNG_MAX);
    await expect(
      asUser(users.office, 'select public.record_companion_consent_withdrawn($1::uuid)', [
        betreuung.access_id,
      ]),
    ).rejects.toThrow('only a companion rests on consent');
  });

  it('haelt auch Zeitpunkt und Urheber des Nachweises fest', async () => {
    const id = await aktiveBegleitungPetra();
    for (const aenderung of [
      "proof_recorded_at = now() - interval '1 day'",
      'consent_recorded_by = null',
      `organization_id = '${FREMDE_ORGANISATION.organizationId}'`,
    ]) {
      await expect(
        asPostgres(`update public.platform_accesses set ${aenderung} where id = $1`, [id]),
      ).rejects.toThrow();
    }
  });

  it('andere Organisation: keine Liste, kein Vermerk', async () => {
    const fremd = await fremdeOrganisation();
    expect((await asUser(users.office, LISTE, ['treatment', fremd.patient])).rows).toEqual([]);
    await expect(
      asUser(
        users.office,
        MIT_ZWEIFEL,
        parameter({ ...BETREUUNG_MAX, verhaeltnis: fremd.patient }),
      ),
    ).rejects.toThrow('relationship not found');
  });
});
