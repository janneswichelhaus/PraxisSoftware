import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * VER-003: Verordnung anlegen, ändern und löschen.
 *
 * Zwei Dinge stehen hier im Mittelpunkt: dass Kopf und Positionen atomar
 * entstehen und dass die Positionen serverseitig geprüft werden — ein
 * Kontingent, das über seine Verordnung hinausläuft, wäre ein
 * Abrechnungsfehler (PROJECT_PRINCIPLES.md §13).
 */
const { users, patients } = SEED;

const ANLEGEN = `
  select public.create_treatment_basis(
    $1::uuid, $2::uuid, $3, $4::date, $5::integer, $6::jsonb, $7, $8, $9
  ) as id`;

const AENDERN = `
  select public.update_treatment_basis(
    $1::uuid, $2::uuid, $3, $4::date, $5::integer, $6::jsonb, $7, $8, $9
  ) as id`;

const LOESCHEN = 'select public.delete_treatment_basis($1::uuid)';
const HOLEN = 'select * from public.get_treatment_basis($1::uuid)';
const KLINISCH = 'select * from public.list_patient_treatment_bases_clinical($1::uuid)';
const ORGANISATORISCH = 'select * from public.list_patient_treatment_bases($1::uuid)';

const PROBST = '77777777-7777-4777-8777-000000000001';
const HAUSARZT = '77777777-7777-4777-8777-000000000002';
const FREMDE_ID = '99999999-9999-4999-8999-00000000000f';

const POSITIONEN = JSON.stringify([
  { remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 0 },
]);

/** Die Auswahl, wie sie das Formular seit VER-EPIC-002 schickt: ohne Mengen. */
const AUSWAHL = JSON.stringify([{ remedy: 'Krankengymnastik' }]);

const TERMINZAHL = 10;

interface Position {
  id: string;
  sort_order: number;
  remedy: string;
  prescribed_quantity: number;
  used_quantity: number;
  remaining_quantity: number;
}

/**
 * Die Argumente der beiden Schreibpfade als benanntes Objekt.
 *
 * Seit VER-EPIC-002 steht die **Anzahl moeglicher Termine** in der Signatur,
 * und Therapieziel, Verordnerhinweis und Empfehlung stehen nicht mehr darin
 * (ANN-064). Neun Stellen in einer Reihe von Nullwerten waren schon vorher
 * schwer zu lesen; als Objekt nennt jeder Test nur noch das, worum es ihm geht.
 */
interface Felder {
  prescriber?: string | null;
  kind?: string;
  issuedOn?: string;
  terminzahl?: number | null;
  items?: string;
  frequenz?: string | null;
  anmerkungen?: string | null;
  diagnose?: string | null;
}

function felder(f: Felder): unknown[] {
  return [
    'prescriber' in f ? f.prescriber : PROBST,
    f.kind ?? 'first',
    f.issuedOn ?? '2026-03-01',
    f.terminzahl === undefined ? TERMINZAHL : f.terminzahl,
    f.items ?? POSITIONEN,
    f.frequenz ?? null,
    f.anmerkungen ?? null,
    f.diagnose ?? null,
  ];
}

function argumente(f: Felder = {}, patientId: string = patients.max): unknown[] {
  return [patientId, ...felder(f)];
}

function aendernArgumente(grundlageId: string, f: Felder = {}): unknown[] {
  return [grundlageId, ...felder(f)];
}

async function anlegen(userId: string, f: Felder = {}) {
  const { rows } = await asUserCommitted<{ id: string }>(userId, ANLEGEN, argumente(f));
  return rows[0]!.id;
}

async function positionen(grundlageId: string): Promise<Position[]> {
  const { rows } = await asPostgres<{ items: Position[] }>(
    'select app.treatment_base_items_json($1::uuid) as items',
    [grundlageId],
  );
  return rows[0]!.items;
}

describe('VER-003: Verordnung anlegen, aendern und loeschen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    // Nur die im Test erzeugten Verordnungen entfernen; der Seed-Bestand
    // bleibt, damit die Reihenfolge-Tests etwas zum Einordnen haben.
    await asPostgres("delete from public.audit_log where subject_type = 'treatment_basis'");
  });

  it('legt Kopf und Positionen in einer Transaktion an', async () => {
    const id = await anlegen(users.therapist, {
      items: JSON.stringify([
        { remedy: 'Manuelle Therapie', prescribed_quantity: 6, used_quantity: 2 },
        { remedy: 'Waermetherapie', prescribed_quantity: 6, used_quantity: 0 },
      ]),
      frequenz: '1x pro Woche',
      anmerkungen: 'Synthetisch: Anmerkung.',
      diagnose: 'Synthetisch: Diagnose.',
    });

    const items = await positionen(id);
    expect(items.map((i) => [i.sort_order, i.remedy, i.remaining_quantity])).toEqual([
      [1, 'Manuelle Therapie', 4],
      [2, 'Waermetherapie', 6],
    ]);
  });

  it('protokolliert das Anlegen ohne klinische Inhalte (ADR-010)', async () => {
    const id = await anlegen(users.therapist, { diagnose: 'Synthetisch: Diagnose Schulter.' });

    const { rows } = await asPostgres<{ subject_id: string; context: Record<string, unknown> }>(
      `select subject_id, context from public.audit_log
        where action = 'treatment_basis.created'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject_id).toBe(id);
    expect(rows[0]?.context).toMatchObject({ surface: 'web', patient_id: patients.max });
    expect(JSON.stringify(rows[0]?.context)).not.toMatch(/Schulter/i);
  });

  it('laesst office weder anlegen noch aendern noch loeschen (ANN-011)', async () => {
    await expect(asUser(users.office, ANLEGEN, argumente())).rejects.toThrow(
      /not allowed to write treatment_bases/i,
    );
    await expect(asUser(users.patientMax, ANLEGEN, argumente())).rejects.toThrow(
      /not allowed to write treatment_bases/i,
    );

    const id = await anlegen(users.therapist);
    // E15 oeffnet office das Lesen der Verordnung samt Diagnose - Aendern und
    // Loeschen bleiben zu (ADR-004 Fassung 2 Punkt 3, ANN-011).
    await expect(asUser(users.office, AENDERN, aendernArgumente(id))).rejects.toThrow(
      /not allowed to write treatment_bases/i,
    );
    await expect(asUser(users.office, LOESCHEN, [id])).rejects.toThrow(
      /not allowed to write treatment_bases/i,
    );
  });

  it('verlangt mindestens eine Position', async () => {
    await expect(asUser(users.therapist, ANLEGEN, argumente({ items: '[]' }))).rejects.toThrow(
      /at least one treatment basis item/i,
    );
  });

  it('weist eine genutzte Menge ueber der verordneten ab', async () => {
    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente({
          items: JSON.stringify([
            { remedy: 'Krankengymnastik', prescribed_quantity: 6, used_quantity: 7 },
          ]),
        }),
      ),
    ).rejects.toThrow(/used quantity out of range/i);
  });

  it('weist eine leere Bezeichnung und unsinnige Mengen ab', async () => {
    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente({ items: JSON.stringify([{ remedy: '   ', prescribed_quantity: 6 }]) }),
      ),
    ).rejects.toThrow(/remedy is required/i);

    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente({
          items: JSON.stringify([{ remedy: 'Krankengymnastik', prescribed_quantity: 0 }]),
        }),
      ),
    ).rejects.toThrow(/prescribed quantity out of range/i);

    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente({
          items: JSON.stringify([{ remedy: 'Krankengymnastik', prescribed_quantity: 'viele' }]),
        }),
      ),
    ).rejects.toThrow(/quantities must be numbers/i);

    // Eine Kommazahl ist derselbe Eingabefehler wie ein Text und bekommt
    // dieselbe sprechende Meldung - nicht den rohen Postgres-Cast-Fehler
    // ("invalid input syntax for type integer"), den ein direkter
    // Integer-Cast einer Dezimalzahl wirft.
    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente({
          items: JSON.stringify([{ remedy: 'Krankengymnastik', prescribed_quantity: 6.5 }]),
        }),
      ),
    ).rejects.toThrow(/quantities must be whole numbers/i);

    await expect(
      asUser(
        users.therapist,
        ANLEGEN,
        argumente({
          items: JSON.stringify([
            { remedy: 'Krankengymnastik', prescribed_quantity: 6, used_quantity: 2.5 },
          ]),
        }),
      ),
    ).rejects.toThrow(/quantities must be whole numbers/i);
  });

  it('weist ein Ausstellungsdatum in der Zukunft ab', async () => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await expect(
      asUser(users.therapist, ANLEGEN, argumente({ issuedOn: morgen })),
    ).rejects.toThrow(/issued_on must not be in the future/i);
  });

  it('unterscheidet fremde nicht von unbekannten IDs', async () => {
    await expect(
      asUser(users.therapist, ANLEGEN, argumente({ prescriber: FREMDE_ID })),
    ).rejects.toThrow(/prescriber not found/i);

    await expect(asUser(users.therapist, ANLEGEN, argumente({}, FREMDE_ID))).rejects.toThrow(
      /patient not found/i,
    );
  });

  it('behaelt bestehende Positionen beim Aendern und entfernt weggefallene', async () => {
    const id = await anlegen(users.therapist, {
      items: JSON.stringify([
        { remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 3 },
        { remedy: 'Waermetherapie', prescribed_quantity: 10, used_quantity: 1 },
      ]),
    });
    const vorher = await positionen(id);

    // Erste Position behalten (mit id), zweite weglassen, dritte neu.
    await asUserCommitted(
      users.therapist,
      AENDERN,
      aendernArgumente(id, {
        prescriber: HAUSARZT,
        kind: 'follow_up',
        issuedOn: '2026-04-02',
        items: JSON.stringify([
          {
            id: vorher[0]!.id,
            remedy: 'Krankengymnastik',
            prescribed_quantity: 12,
            used_quantity: 3,
          },
          { remedy: 'Manuelle Therapie', prescribed_quantity: 4, used_quantity: 0 },
        ]),
      }),
    );

    const nachher = await positionen(id);
    expect(nachher).toHaveLength(2);
    // Dieselbe Zeile, nicht neu angelegt.
    expect(nachher[0]?.id).toBe(vorher[0]?.id);
    expect(nachher[0]?.prescribed_quantity).toBe(12);
    expect(nachher[1]?.remedy).toBe('Manuelle Therapie');
    expect(nachher.map((i) => i.sort_order)).toEqual([1, 2]);

    const { rows } = await asPostgres<{ prescriber_id: string; treatment_basis_kind: string }>(
      'select prescriber_id, treatment_basis_kind from public.treatment_bases where id = $1',
      [id],
    );
    expect(rows[0]?.prescriber_id).toBe(HAUSARZT);
    expect(rows[0]?.treatment_basis_kind).toBe('follow_up');
  });

  it('nimmt eine fremde Positions-ID nicht als Hebel auf andere Verordnungen', async () => {
    const eine = await anlegen(users.therapist);
    const andere = await anlegen(users.therapist);
    const fremdePosition = (await positionen(andere))[0]!;

    await asUserCommitted(
      users.therapist,
      AENDERN,
      aendernArgumente(eine, {
        items: JSON.stringify([
          {
            id: fremdePosition.id,
            remedy: 'Uebernommen',
            prescribed_quantity: 3,
            used_quantity: 0,
          },
        ]),
      }),
    );

    // Die fremde Position ist unveraendert; bei "eine" ist eine neue entstanden.
    const unveraendert = (await positionen(andere))[0]!;
    expect(unveraendert.remedy).toBe('Krankengymnastik');
    expect(unveraendert.prescribed_quantity).toBe(10);

    const neue = (await positionen(eine))[0]!;
    expect(neue.id).not.toBe(fremdePosition.id);
    expect(neue.remedy).toBe('Uebernommen');
  });

  it('nimmt die Patientin nicht als Parameter entgegen - eine Verordnung wechselt nicht die Akte', async () => {
    const { rows } = await asPostgres<{ args: string }>(`
      select pg_get_function_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'update_treatment_basis'
    `);
    expect(rows[0]?.args ?? '').not.toMatch(/patient/i);
    expect(rows[0]?.args ?? '').not.toMatch(/organization/i);
  });

  it('liefert get_treatment_basis allen Praxisrollen und protokolliert je Zugriff (E15)', async () => {
    const id = await anlegen(users.therapist);
    await asPostgres("delete from public.audit_log where subject_type = 'treatment_basis'");

    // ADR-004 Fassung 2 Punkt 3: office liest die Verordnung samt Diagnose -
    // anlegen, aendern und loeschen darf es weiterhin nicht (ANN-011, oben).
    for (const konto of [users.teamLead, users.office]) {
      const { rows } = await asUserCommitted<{ id: string; patient_id: string }>(konto, HOLEN, [
        id,
      ]);
      expect(rows[0]?.id).toBe(id);
      expect(rows[0]?.patient_id).toBe(patients.max);
    }

    const { rows: audit } = await asPostgres<{ actor_user_id: string }>(
      `select actor_user_id from public.audit_log where action = 'treatment_basis.viewed'`,
    );
    expect(audit.map((a) => a.actor_user_id).sort()).toEqual([users.teamLead, users.office].sort());

    await expect(asUser(users.patientMax, HOLEN, [id])).rejects.toThrow(
      /not allowed to read clinical treatment basis data/i,
    );
  });

  it('gibt fuer eine unbekannte Verordnung nichts zurueck und protokolliert nichts', async () => {
    const { rows } = await asUserCommitted(users.therapist, HOLEN, [FREMDE_ID]);
    expect(rows).toEqual([]);

    const { rows: audit } = await asPostgres(
      `select id from public.audit_log where action = 'treatment_basis.viewed'`,
    );
    expect(audit).toEqual([]);
  });

  it('loescht endgueltig samt Positionen und haelt den Vorgang im Auditlog fest', async () => {
    const id = await anlegen(users.therapist);
    await asPostgres("delete from public.audit_log where subject_type = 'treatment_basis'");

    await asUserCommitted(users.ownerTherapist, LOESCHEN, [id]);

    const { rows } = await asPostgres('select id from public.treatment_bases where id = $1', [id]);
    expect(rows).toEqual([]);
    // on delete cascade: kein verwaister Rest (ADR-008 Punkt 10).
    const { rows: reste } = await asPostgres(
      'select id from public.treatment_base_items where treatment_basis_id = $1',
      [id],
    );
    expect(reste).toEqual([]);

    const { rows: audit } = await asPostgres<{ subject_id: string }>(
      `select subject_id from public.audit_log where action = 'treatment_basis.deleted'`,
    );
    expect(audit[0]?.subject_id).toBe(id);
  });

  it('meldet eine unbekannte Verordnung beim Loeschen und beim Aendern gleich', async () => {
    await expect(asUser(users.therapist, LOESCHEN, [FREMDE_ID])).rejects.toThrow(
      /treatment basis not found/i,
    );
    await expect(asUser(users.therapist, AENDERN, aendernArgumente(FREMDE_ID))).rejects.toThrow(
      /treatment basis not found/i,
    );
  });

  it('erscheint eine neue Verordnung sofort in der Akte', async () => {
    const id = await anlegen(users.therapist, { diagnose: 'Synthetisch: Diagnose Nacken.' });

    const { rows } = await asUserCommitted<{ id: string; diagnosis: string }>(
      users.therapist,
      KLINISCH,
      [patients.max],
    );
    const gefunden = rows.find((r) => r.id === id);
    expect(gefunden?.diagnosis).toBe('Synthetisch: Diagnose Nacken.');
  });

  // ---------------------------------------------------------------------------
  // VER-EPIC-002: Die Terminzahl steht an der Grundlage, die Leistungsmenge an
  // der Position (ANN-064). Geprueft wird beides zugleich - eine Zahl, die
  // stimmt, und ein Bestand, der stehen bleibt.
  // ---------------------------------------------------------------------------
  describe('Anzahl moeglicher Termine (VER-EPIC-002)', () => {
    const KOMBINATION = JSON.stringify([
      { remedy: 'KG als Doppelbehandlung' },
      { remedy: 'MT als Doppelbehandlung' },
      { remedy: 'Hausbesuch' },
    ]);

    async function zahlen(grundlageId: string) {
      const { rows } = await asUserCommitted<{
        prescribed: number;
        used: number;
        planned: number;
        remaining: number;
      }>(users.therapist, 'select * from public.get_treatment_basis_slots($1::uuid)', [
        grundlageId,
      ]);
      return rows[0]!;
    }

    it('zaehlt Behandlungstermine und nicht die Summe der Heilmittel', async () => {
      // Das Abnahmebeispiel aus VER-EPIC-002: sechs moegliche Termine mit KG
      // Doppelbehandlung, MT Doppelbehandlung und Hausbesuch bieten sechs
      // Termine - weder zwoelf noch achtzehn.
      const id = await anlegen(users.therapist, { terminzahl: 6, items: KOMBINATION });

      expect(await zahlen(id)).toMatchObject({ prescribed: 6, used: 0, remaining: 6 });
    });

    it('gibt einer neuen Position die Terminzahl als Leistungsmenge', async () => {
      const id = await anlegen(users.therapist, { terminzahl: 6, items: KOMBINATION });

      const items = await positionen(id);
      expect(items.map((i) => [i.remedy, i.prescribed_quantity, i.used_quantity])).toEqual([
        ['KG als Doppelbehandlung', 6, 0],
        ['MT als Doppelbehandlung', 6, 0],
        ['Hausbesuch', 6, 0],
      ]);
    });

    it('laesst Bestandsmengen beim Speichern ohne Mengen unberuehrt', async () => {
      // Der Bestandsfall aus Abnahmefall 4: verschiedene Leistungsmengen, eine
      // davon teilweise genutzt. Das vereinfachte Formular schickt nur noch die
      // Auswahl - es darf dabei nichts umdeuten und nichts auf null setzen.
      const id = await anlegen(users.therapist, {
        terminzahl: 10,
        items: JSON.stringify([
          { remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 4 },
          { remedy: 'Waermetherapie', prescribed_quantity: 3, used_quantity: 1 },
        ]),
      });
      const vorher = await positionen(id);

      await asUserCommitted(
        users.therapist,
        AENDERN,
        aendernArgumente(id, {
          terminzahl: 4,
          items: JSON.stringify([
            { id: vorher[0]!.id, remedy: 'Krankengymnastik' },
            { id: vorher[1]!.id, remedy: 'Waermetherapie' },
          ]),
        }),
      );

      const nachher = await positionen(id);
      expect(nachher.map((i) => [i.remedy, i.prescribed_quantity, i.used_quantity])).toEqual([
        ['Krankengymnastik', 10, 4],
        ['Waermetherapie', 3, 1],
      ]);
      // Die Terminzahl folgt der Eingabe, die genutzte Menge der groessten
      // Position - beides bleibt unterscheidbar.
      expect(await zahlen(id)).toMatchObject({ prescribed: 4, used: 4, remaining: 0 });
    });

    it('verlangt eine Terminzahl zwischen 1 und 500', async () => {
      for (const terminzahl of [0, 501]) {
        await expect(asUser(users.therapist, ANLEGEN, argumente({ terminzahl }))).rejects.toThrow(
          /appointment count out of range/i,
        );
      }
      await expect(
        asUser(users.therapist, ANLEGEN, argumente({ terminzahl: null })),
      ).rejects.toThrow(/appointment count is required/i);
    });

    it('haelt die Grenze auch am Schreibpfad vorbei (Defense-in-Depth)', async () => {
      await expect(
        asPostgres(
          `insert into public.treatment_bases
             (organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on, appointment_count)
           values ($1, $2, $3, 'first', '2026-03-01', 0)`,
          [SEED.organizationId, patients.max, PROBST],
        ),
      ).rejects.toThrow(/treatment_bases_appointment_count_check/);
    });

    it('laesst Therapieziel, Verordnerhinweis und Empfehlung beim Speichern stehen', async () => {
      // Die drei Felder haben das Formular verlassen (VER-EPIC-002). Sie duerfen
      // dadurch nicht verschwinden: Der Schreibpfad nimmt sie nicht entgegen und
      // ruehrt die Spalten deshalb nicht an.
      const id = await anlegen(users.therapist, { diagnose: 'Synthetisch: Diagnose.' });
      await asPostgres(
        `update public.treatment_bases
            set therapy_goal = 'Synthetisch: Ziel.',
                prescriber_note = 'Synthetisch: Hinweis vom Rezept.',
                follow_up_recommendation = 'Synthetisch: Empfehlung.'
          where id = $1`,
        [id],
      );

      await asUserCommitted(
        users.therapist,
        AENDERN,
        aendernArgumente(id, { diagnose: 'Synthetisch: Diagnose, korrigiert.' }),
      );

      const { rows } = await asPostgres<{
        diagnosis: string;
        therapy_goal: string;
        prescriber_note: string;
        follow_up_recommendation: string;
      }>(
        `select diagnosis, therapy_goal, prescriber_note, follow_up_recommendation
           from public.treatment_bases where id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({
        diagnosis: 'Synthetisch: Diagnose, korrigiert.',
        therapy_goal: 'Synthetisch: Ziel.',
        prescriber_note: 'Synthetisch: Hinweis vom Rezept.',
        follow_up_recommendation: 'Synthetisch: Empfehlung.',
      });
    });

    it('raeumt die klinischen Felder beim Wechsel auf Selbstzahler ab (ADR-020 Punkt 4)', async () => {
      const id = await anlegen(users.therapist, { diagnose: 'Synthetisch: Diagnose.' });
      await asPostgres(
        `update public.treatment_bases
            set therapy_goal = 'Synthetisch: Ziel.',
                prescriber_note = 'Synthetisch: Hinweis.',
                follow_up_recommendation = 'Synthetisch: Empfehlung.'
          where id = $1`,
        [id],
      );

      // Der Aufrufer schickt die drei Felder gar nicht mehr mit - dass sie
      // trotzdem fallen, entscheidet der Server.
      await asUserCommitted(
        users.therapist,
        AENDERN,
        aendernArgumente(id, {
          prescriber: null,
          kind: 'self_pay',
          diagnose: 'Synthetisch: Diagnose.',
        }),
      );

      const { rows } = await asPostgres<Record<string, string | null>>(
        `select diagnosis, therapy_goal, prescriber_note, follow_up_recommendation
           from public.treatment_bases where id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({
        diagnosis: null,
        therapy_goal: null,
        prescriber_note: null,
        follow_up_recommendation: null,
      });
    });

    it('nennt die Terminzahl in der Lesesicht des Formulars', async () => {
      const id = await anlegen(users.therapist, { terminzahl: 7 });
      const { rows } = await asUserCommitted<{ appointment_count: number }>(
        users.therapist,
        HOLEN,
        [id],
      );
      expect(rows[0]?.appointment_count).toBe(7);
    });
  });

  // ---------------------------------------------------------------------------
  // GRD-001 / ADR-020: Die zweite Bauart.
  //
  // Was eine Verordnung braucht, verlangt die Datenbank weiter - aber nur von
  // ihr (Punkt 3). Beide Richtungen werden geprueft, und zwar zweimal: einmal
  // im Schreibpfad, einmal an der Constraint darunter. Eine Regel, die nur in
  // der Funktion steht, faellt beim ersten anderen Schreibweg um (ADR-004,
  // Defense-in-Depth).
  // ---------------------------------------------------------------------------
  describe('Die zweite Bauart: Selbstzahler (ADR-020)', () => {
    function selbstzahlerArgumente(prescriberId: string | null = null, f: Felder = {}) {
      return argumente({ ...f, prescriber: prescriberId, kind: 'self_pay' });
    }

    it('legt einen Selbstzahler ohne Verordner:in an', async () => {
      const { rows } = await asUserCommitted<{ id: string }>(
        users.therapist,
        ANLEGEN,
        selbstzahlerArgumente(),
      );
      const id = rows[0]!.id;

      const { rows: zeilen } = await asPostgres<{
        treatment_basis_kind: string;
        prescriber_id: string | null;
      }>('select treatment_basis_kind, prescriber_id from public.treatment_bases where id = $1', [
        id,
      ]);
      expect(zeilen[0]).toEqual({ treatment_basis_kind: 'self_pay', prescriber_id: null });

      // Die Klammer traegt ihr Kontingent wie jede Verordnung (ADR-020 Punkt 5).
      expect(await positionen(id)).toHaveLength(1);
    });

    it('weist einen Selbstzahler MIT Verordner:in ab', async () => {
      await expect(
        asUserCommitted(users.therapist, ANLEGEN, selbstzahlerArgumente(PROBST)),
      ).rejects.toThrow(/self_pay must not carry a prescriber/i);
    });

    it('weist eine Verordnung OHNE Verordner:in ab', async () => {
      await expect(
        asUserCommitted(users.therapist, ANLEGEN, argumente({ prescriber: null })),
      ).rejects.toThrow(/prescriber is required/i);
    });

    it('kennt keine dritte Bauart', async () => {
      await expect(
        asUserCommitted(
          users.therapist,
          ANLEGEN,
          argumente({ prescriber: null, kind: 'privatrezept' }),
        ),
      ).rejects.toThrow(/unknown treatment basis kind/i);
    });

    it('haelt die Constraint auch am Schreibpfad vorbei (Defense-in-Depth)', async () => {
      // Direkt als postgres, also ohne jede Funktion: Die Regel steht in der
      // Tabelle und nicht nur in create_treatment_basis.
      await expect(
        asPostgres(
          `insert into public.treatment_bases
             (organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on, appointment_count)
           values ($1, $2, $3, 'self_pay', '2026-03-01', 6)`,
          [SEED.organizationId, patients.max, PROBST],
        ),
      ).rejects.toThrow(/treatment_bases_prescriber_matches_kind/);

      await expect(
        asPostgres(
          `insert into public.treatment_bases
             (organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on, appointment_count)
           values ($1, $2, null, 'follow_up', '2026-03-01', 6)`,
          [SEED.organizationId, patients.max],
        ),
      ).rejects.toThrow(/treatment_bases_prescriber_matches_kind/);

      // ADR-020 Punkt 4, seit VER-EPIC-002 ebenfalls in der Tabelle: Ein
      // Selbstzahler traegt keine klinischen Felder - auf keinem Schreibweg.
      await expect(
        asPostgres(
          `insert into public.treatment_bases
             (organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on, appointment_count, diagnosis)
           values ($1, $2, null, 'self_pay', '2026-03-01', 6, 'Synthetisch: Diagnose.')`,
          [SEED.organizationId, patients.max],
        ),
      ).rejects.toThrow(/treatment_bases_clinical_only_for_prescription/);
    });

    it('schuetzt die Abrechnung beim Selbstzahler wie bei der Verordnung', async () => {
      // ADR-020 Punkt 5: used_quantity <= prescribed_quantity bleibt fuer BEIDE
      // Bauarten bestehen. Sie schuetzt die Abrechnung, nicht die Planung.
      await expect(
        asUserCommitted(
          users.therapist,
          ANLEGEN,
          selbstzahlerArgumente(null, {
            items: JSON.stringify([
              { remedy: 'Krankengymnastik', prescribed_quantity: 4, used_quantity: 5 },
            ]),
          }),
        ),
      ).rejects.toThrow();
    });

    it('protokolliert ihn unter dem neuen Wert und mit dem neuen Bezugstyp', async () => {
      const { rows } = await asUserCommitted<{ id: string }>(
        users.therapist,
        ANLEGEN,
        selbstzahlerArgumente(),
      );

      const { rows: audit } = await asPostgres<{ action: string; subject_type: string }>(
        `select action, subject_type from public.audit_log
          where subject_id = $1 and action like 'treatment_basis%'`,
        [rows[0]!.id],
      );
      expect(audit).toEqual([
        { action: 'treatment_basis.created', subject_type: 'treatment_basis' },
      ]);
    });

    it('laesst eine Verordnung zum Selbstzahler werden - und zurueck', async () => {
      const id = await anlegen(users.therapist, { diagnose: 'Synthetisch: Diagnose.' });

      // Verordner:in mitzuschicken waere jetzt ein Widerspruch.
      await expect(
        asUserCommitted(
          users.therapist,
          AENDERN,
          aendernArgumente(id, { prescriber: PROBST, kind: 'self_pay' }),
        ),
      ).rejects.toThrow(/self_pay must not carry a prescriber/i);

      await asUserCommitted(
        users.therapist,
        AENDERN,
        aendernArgumente(id, { prescriber: null, kind: 'self_pay' }),
      );
      const { rows: nachher } = await asPostgres<{
        treatment_basis_kind: string;
        prescriber_id: string | null;
      }>('select treatment_basis_kind, prescriber_id from public.treatment_bases where id = $1', [
        id,
      ]);
      expect(nachher[0]).toEqual({ treatment_basis_kind: 'self_pay', prescriber_id: null });

      // Und wieder zurueck: dann ist die Verordner:in wieder Pflicht.
      await asUserCommitted(
        users.therapist,
        AENDERN,
        aendernArgumente(id, { prescriber: HAUSARZT, kind: 'follow_up' }),
      );
      const { rows: zurueck } = await asPostgres<{ prescriber_id: string }>(
        'select prescriber_id from public.treatment_bases where id = $1',
        [id],
      );
      expect(zurueck[0]?.prescriber_id).toBe(HAUSARZT);
    });

    it('haelt die alten Auditwerte weiter im Wertebereich (ADR-010, ADR-020 Punkt 8)', async () => {
      // Auditzeilen werden niemals umgeschrieben. Was vor GRD-001 entstanden
      // ist, muss auch danach noch einfuegbar und damit lesbar sein.
      await expect(
        asPostgres(
          `insert into public.audit_log
             (organization_id, actor_user_id, action, subject_type, subject_id, outcome)
           values ($1, $2, 'prescription.viewed', 'prescription', $3, 'success')`,
          [SEED.organizationId, users.therapist, patients.max],
        ),
      ).resolves.toBeDefined();
    });
  });
});

/**
 * Mandantentrennung (ADR-003): die bisherigen "unbekannt vs. fremd"-Tests
 * oben verwenden ausschliesslich eine schlicht nicht existierende ID. Das
 * beweist nicht, dass eine echte fremde Organisation herausgefiltert wird -
 * nur dass eine ID, die es gar nicht gibt, abgewiesen wird. Dieser Block legt
 * eine zweite, real existierende Organisation samt eigener Verordner:in,
 * Patientin und Verordnung an (Muster aus rls.test.ts) und prueft, dass keine
 * der Schreibfunktionen ueber eine echte fremde ID hinweg schreibt oder liest.
 */
describe('VER-003: Mandantentrennung (ADR-003)', () => {
  const fremdeOrg = '33333333-3333-4333-8333-000000000001';
  const fremderAccount = '33333333-3333-4333-8333-000000000002';
  const fremdeTherapeutPerson = '33333333-3333-4333-8333-000000000003';
  const fremderPrescriber = '33333333-3333-4333-8333-000000000004';
  const fremdePatientPerson = '33333333-3333-4333-8333-000000000005';
  const fremderPatient = '33333333-3333-4333-8333-000000000006';
  const fremdeVerordnung = '33333333-3333-4333-8333-000000000007';

  beforeAll(async () => {
    await resetDatabase();
    await asPostgres(`
      insert into auth.users (id, email, aud, role)
        values ('${fremderAccount}', 'tessa.therapeutin@praxis-woanders.invalid', 'authenticated', 'authenticated');
      insert into public.organizations (id, name, time_zone)
        values ('${fremdeOrg}', 'Test Praxis Woanders', 'Europe/Berlin');
      insert into public.persons (id, organization_id, given_name, family_name) values
        ('${fremdeTherapeutPerson}', '${fremdeOrg}', 'Tessa', 'Therapeutin'),
        ('${fremdePatientPerson}', '${fremdeOrg}', 'Paul', 'Woandershin');
      insert into public.patients (id, organization_id, person_id)
        values ('${fremderPatient}', '${fremdeOrg}', '${fremdePatientPerson}');
      insert into public.user_profiles (id, organization_id, person_id, display_name)
        values ('${fremderAccount}', '${fremdeOrg}', '${fremdeTherapeutPerson}', 'Tessa Therapeutin');
      insert into public.user_roles (user_id, organization_id, role_key)
        values ('${fremderAccount}', '${fremdeOrg}', 'therapist');
      insert into public.prescribers (id, organization_id, family_name)
        values ('${fremderPrescriber}', '${fremdeOrg}', 'Fremdarzt');
      insert into public.treatment_bases (
        id, organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on,
        appointment_count, diagnosis
      ) values (
        '${fremdeVerordnung}', '${fremdeOrg}', '${fremderPatient}', '${fremderPrescriber}',
        'first', '2026-01-10', 6, 'Synthetisch: Diagnose der fremden Praxis.'
      );
      insert into public.treatment_base_items (
        organization_id, treatment_basis_id, sort_order, remedy, prescribed_quantity
      ) values (
        '${fremdeOrg}', '${fremdeVerordnung}', 1, 'Krankengymnastik', 6
      );
    `);
  }, 120_000);

  it('weist eine echte Verordner:in einer fremden Organisation ab wie eine unbekannte', async () => {
    await expect(
      asUser(users.therapist, ANLEGEN, argumente({ prescriber: fremderPrescriber })),
    ).rejects.toThrow(/prescriber not found/i);
  });

  it('weist eine echte Patientin einer fremden Organisation ab wie eine unbekannte', async () => {
    await expect(asUser(users.therapist, ANLEGEN, argumente({}, fremderPatient))).rejects.toThrow(
      /patient not found/i,
    );
  });

  it('aendert und loescht eine echte Verordnung einer fremden Organisation nicht', async () => {
    await expect(
      asUser(users.therapist, AENDERN, aendernArgumente(fremdeVerordnung)),
    ).rejects.toThrow(/treatment basis not found/i);

    await expect(asUser(users.therapist, LOESCHEN, [fremdeVerordnung])).rejects.toThrow(
      /treatment basis not found/i,
    );

    const { rows } = await asPostgres('select id from public.treatment_bases where id = $1', [
      fremdeVerordnung,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('liefert fuer eine echte Verordnung einer fremden Organisation kein Ergebnis statt eines Fehlers', async () => {
    const { rows } = await asUser(users.therapist, HOLEN, [fremdeVerordnung]);
    expect(rows).toEqual([]);
  });

  it('listet eine fremde Patientin ohne Verordnungen der eigenen Praxis', async () => {
    const { rows } = await asUser(users.office, ORGANISATORISCH, [fremderPatient]);
    expect(rows).toEqual([]);
  });

  it('endet auch fuer die klinische Sicht von office an der eigenen Praxis (E15)', async () => {
    await asPostgres("delete from public.audit_log where action = 'treatment_basis.viewed'");

    const { rows: liste } = await asUserCommitted(users.office, KLINISCH, [fremderPatient]);
    expect(liste).toEqual([]);
    const { rows: detail } = await asUserCommitted(users.office, HOLEN, [fremdeVerordnung]);
    expect(detail).toEqual([]);

    // Nichts gelesen, nichts protokolliert.
    const { rows: audit } = await asPostgres(
      "select id from public.audit_log where action = 'treatment_basis.viewed'",
    );
    expect(audit).toEqual([]);
  });

  it('sieht die eigene Verordnung nur innerhalb der fremden Organisation', async () => {
    const { rows } = await asUserCommitted<{ id: string; diagnosis: string }>(
      fremderAccount,
      KLINISCH,
      [fremderPatient],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fremdeVerordnung);
    expect(rows[0]?.diagnosis).toContain('fremden Praxis');
  });
});
