import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  planeEntfernen,
  resetDatabase,
} from './helpers/db';
import { KOERPERREGIONEN } from '@/features/exercises/types';

/**
 * Übung und Variante (UEB-001, IDEA-TRN-005, IDEA-QSN-002).
 *
 *   * Eine Bibliothek je Praxis für Behandlung und Training (ANN-292).
 *   * Lesen owner, therapist, team_lead, trainer und seit ABN-030 das Büro
 *     (BEF-137); pflegen nur owner; jedes Plattformkonto nichts (ANN-293).
 *   * Feste Körperregionen, Ausrüstung als Schlagworte (ANN-295).
 *   * Archivieren statt Löschen; Löschen nur ohne Abhängige (ANN-296).
 *   * Kein Tabellenrecht: erreichbar nur über die Funktionen (ADR-004).
 */

const { users, organizationId } = SEED;

const LISTE = 'select public.list_exercise_library() as bibliothek';
const UEBUNG = 'select public.save_exercise($1::uuid, $2, $3, $4) as id';
const VARIANTE =
  'select public.save_exercise_variant($1::uuid, $2::uuid, $3, $4, $5, $6::text[], $7, $8) as id';
const UEBUNG_ARCHIV = 'select public.set_exercise_archived($1::uuid, $2::boolean)';
const VARIANTE_ARCHIV = 'select public.set_exercise_variant_archived($1::uuid, $2::boolean)';
const UEBUNG_LOESCHEN = 'select public.delete_exercise($1::uuid)';
const VARIANTE_LOESCHEN = 'select public.delete_exercise_variant($1::uuid)';

interface Variante {
  id: string;
  name: string;
  lay_name: string;
  instruction: string | null;
  equipment: string[];
  common_faults: string | null;
  practice_notes: string | null;
  archived: boolean;
}

interface Uebung {
  id: string;
  name: string;
  lay_name: string;
  body_region: string;
  archived: boolean;
  variants: Variante[];
}

interface Bibliothek {
  can_manage: boolean;
  exercises: Uebung[];
}

async function bibliothek(konto: string): Promise<Bibliothek> {
  const { rows } = await asUser<{ bibliothek: Bibliothek }>(konto, LISTE);
  return rows[0]!.bibliothek;
}

async function uebungAnlegen(
  name = 'Kniebeuge',
  laie = 'In die Hocke gehen',
  region = 'knie',
  konto: string = users.ownerTherapist,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, UEBUNG, [null, name, laie, region]);
  return rows[0]!.id;
}

async function varianteAnlegen(
  uebung: string,
  name = 'Kniebeuge am Geländer, halbe Tiefe',
  ausruestung: string[] = ['Geländer'],
  konto: string = users.ownerTherapist,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, VARIANTE, [
    null,
    uebung,
    name,
    'Am Geländer halb in die Hocke gehen',
    'Mit beiden Händen festhalten. Langsam bis zur Hälfte runter, dann wieder hoch.',
    ausruestung,
    'Knie fallen nach innen.',
    'Nicht unter Schmerz über 5.',
  ]);
  return rows[0]!.id;
}

describe('Übungsbibliothek: Übung und Variante (UEB-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
    await asPostgres('delete from public.exercise_variant_links');
    await asPostgres('delete from public.exercise_variants');
    await asPostgres('delete from public.exercises');
  });

  describe('Anlegen und Lesen', () => {
    it('legt Übung und Variante mit beiden Sprachebenen an (IDEA-QSN-002)', async () => {
      const uebung = await uebungAnlegen('  Kniebeuge  ', '  In die Hocke gehen ');
      const variante = await varianteAnlegen(uebung);

      const b = await bibliothek(users.ownerTherapist);
      expect(b.can_manage).toBe(true);
      expect(b.exercises).toEqual([
        {
          id: uebung,
          name: 'Kniebeuge',
          lay_name: 'In die Hocke gehen',
          body_region: 'knie',
          archived: false,
          variants: [
            {
              id: variante,
              name: 'Kniebeuge am Geländer, halbe Tiefe',
              lay_name: 'Am Geländer halb in die Hocke gehen',
              instruction:
                'Mit beiden Händen festhalten. Langsam bis zur Hälfte runter, dann wieder hoch.',
              equipment: ['Geländer'],
              common_faults: 'Knie fallen nach innen.',
              practice_notes: 'Nicht unter Schmerz über 5.',
              archived: false,
            },
          ],
        },
      ]);
    });

    it('stempelt Anlage und Änderung an der Zeile (ADR-010 Fassung 3)', async () => {
      const uebung = await uebungAnlegen();
      const { rows } = await asPostgres<{ created_by: string; updated_by: string }>(
        'select created_by, updated_by from public.exercises where id = $1',
        [uebung],
      );
      expect(rows[0]).toEqual({
        created_by: users.ownerTherapist,
        updated_by: users.ownerTherapist,
      });
    });

    it('sortiert nach Bezeichnung und nach nichts sonst (ADR-006 Punkt 10)', async () => {
      await uebungAnlegen('Zehenstand', 'Auf die Zehen', 'fuss');
      await uebungAnlegen('ausfallschritt', 'Großer Schritt', 'knie');
      await uebungAnlegen('Brücke', 'Becken heben', 'lws');
      const namen = (await bibliothek(users.therapist)).exercises.map((u) => u.name);
      expect(namen).toEqual(['ausfallschritt', 'Brücke', 'Zehenstand']);
    });

    it.each([
      ['Therapeut:in', users.therapist],
      ['Teamleitung', users.teamLead],
      ['Trainingsbetreuung', users.trainer],
      ['Büro (ABN-030, BEF-137)', users.office],
    ])('liest die Bibliothek und pflegt nicht: %s (ANN-293)', async (_rolle, konto) => {
      const uebung = await uebungAnlegen();
      const b = await bibliothek(konto);
      expect(b.can_manage).toBe(false);
      expect(b.exercises.map((u) => u.id)).toEqual([uebung]);

      await expect(
        asUserCommitted(konto, UEBUNG, [null, 'Brücke', 'Becken heben', 'lws']),
      ).rejects.toThrow(/not allowed to manage the exercise library/);
      await expect(
        asUserCommitted(konto, UEBUNG, [uebung, 'Anders', 'Anders', 'knie']),
      ).rejects.toThrow(/not allowed/);
      await expect(
        asUserCommitted(konto, VARIANTE, [null, uebung, 'V', 'V', null, [], null, null]),
      ).rejects.toThrow(/not allowed/);
      await expect(asUserCommitted(konto, UEBUNG_ARCHIV, [uebung, true])).rejects.toThrow(
        /not allowed/,
      );
      await expect(asUserCommitted(konto, UEBUNG_LOESCHEN, [uebung])).rejects.toThrow(
        /not allowed/,
      );
      expect((await bibliothek(users.ownerTherapist)).exercises[0]!.name).toBe('Kniebeuge');
    });
  });

  describe('Negativfälle (ADR-013 Punkt 9 Nr. 1)', () => {
    it.each([
      ['Profil ohne Praxisrolle', users.patientMax],
      ['Plattformkonto Kund:in', users.plattformTina],
      ['Plattformkonto Patient:in und Kund:in', users.plattformErika],
      ['Begleitung', users.plattformPaula],
    ])('weist %s beim Lesen und Schreiben ab', async (_wer, konto) => {
      const uebung = await uebungAnlegen();
      await expect(asUser(konto, LISTE)).rejects.toThrow(/not allowed|not authenticated/);
      await expect(
        asUserCommitted(konto, UEBUNG, [null, 'Brücke', 'Becken heben', 'lws']),
      ).rejects.toThrow(/not allowed/);
      await expect(asUserCommitted(konto, VARIANTE_LOESCHEN, [uebung])).rejects.toThrow(
        /not allowed/,
      );
    });

    it('zeigt der fremden Organisation nichts und lässt sie nichts ändern (ADR-003)', async () => {
      const uebung = await uebungAnlegen();
      const variante = await varianteAnlegen(uebung);
      const fremd = (await fremdeOrganisation()).owner;

      const b = await bibliothek(fremd);
      expect(b.can_manage).toBe(true);
      expect(b.exercises).toEqual([]);

      await expect(
        asUserCommitted(fremd, UEBUNG, [uebung, 'Gekapert', 'Gekapert', 'knie']),
      ).rejects.toThrow(/exercise not found/);
      await expect(
        asUserCommitted(fremd, VARIANTE, [null, uebung, 'Fremd', 'Fremd', null, [], null, null]),
      ).rejects.toThrow(/exercise not found/);
      await expect(
        asUserCommitted(fremd, VARIANTE, [
          variante,
          uebung,
          'Fremd',
          'Fremd',
          null,
          [],
          null,
          null,
        ]),
      ).rejects.toThrow(/exercise variant not found/);
      await expect(asUserCommitted(fremd, UEBUNG_ARCHIV, [uebung, true])).rejects.toThrow(
        /exercise not found/,
      );
      await expect(asUserCommitted(fremd, VARIANTE_ARCHIV, [variante, true])).rejects.toThrow(
        /exercise variant not found/,
      );
      await expect(asUserCommitted(fremd, VARIANTE_LOESCHEN, [variante])).rejects.toThrow(
        /exercise variant not found/,
      );
      await expect(asUserCommitted(fremd, UEBUNG_LOESCHEN, [uebung])).rejects.toThrow(
        /exercise not found/,
      );

      const eigen = (await bibliothek(users.ownerTherapist)).exercises;
      expect(eigen).toHaveLength(1);
      expect(eigen[0]!.name).toBe('Kniebeuge');
      expect(eigen[0]!.archived).toBe(false);
      expect(eigen[0]!.variants.map((v) => v.id)).toEqual([variante]);

      // Und umgekehrt: Was die fremde Praxis anlegt, sieht die eigene nicht.
      await uebungAnlegen('Fremde Übung', 'Fremd', 'hand', fremd);
      expect((await bibliothek(users.therapist)).exercises.map((u) => u.name)).toEqual([
        'Kniebeuge',
      ]);
    });

    it('gibt keiner Rolle Tabellenrecht - nur die Funktionen (ADR-004)', async () => {
      await uebungAnlegen();
      for (const tabelle of ['exercises', 'exercise_variants']) {
        await expect(
          asUser(users.ownerTherapist, `select * from public.${tabelle}`),
        ).rejects.toThrow(/permission denied/);
        await expect(asAnon(`select * from public.${tabelle}`)).rejects.toThrow(
          /permission denied/,
        );
      }
      await expect(asAnon(LISTE)).rejects.toThrow(/permission denied/);
    });

    it('verlangt eine Anmeldung', async () => {
      await expect(asUser(null, LISTE)).rejects.toThrow(/not authenticated/);
    });
  });

  describe('Eingaben', () => {
    it.each([
      ['leere Bezeichnung', ['  ', 'Laie', 'knie'], /name is required/],
      ['Bezeichnung nur aus Tabulator', ['\t', 'Laie', 'knie'], /name is required/],
      ['Alltagssprache nur aus Zeilenumbruch', ['Fach', '\n', 'knie'], /lay name is required/],
      ['leere Alltagssprache', ['Fach', '', 'knie'], /lay name is required/],
      ['zu lange Bezeichnung', ['x'.repeat(121), 'Laie', 'knie'], /name is too long/],
      ['unbekannte Region', ['Fach', 'Laie', 'knie_links'], /body region is invalid/],
      ['ohne Region', ['Fach', 'Laie', null], /body region is invalid/],
    ])('weist eine Übung ab: %s', async (_fall, [name, laie, region], meldung) => {
      await expect(
        asUserCommitted(users.ownerTherapist, UEBUNG, [null, name, laie, region]),
      ).rejects.toThrow(meldung);
    });

    it('lässt eine Bezeichnung je Praxis nur einmal zu, groß und klein gleich', async () => {
      await uebungAnlegen('Kniebeuge');
      await expect(uebungAnlegen(' kniebeuge ')).rejects.toThrow(
        /an exercise with this name already exists/,
      );
    });

    it('lässt eine Variantenbezeichnung je Übung nur einmal zu', async () => {
      const uebung = await uebungAnlegen();
      await varianteAnlegen(uebung, 'Am Geländer');
      await expect(varianteAnlegen(uebung, 'am geländer')).rejects.toThrow(
        /a variant with this name already exists/,
      );
      // An einer anderen Übung darf derselbe Name stehen.
      const andere = await uebungAnlegen('Ausfallschritt', 'Großer Schritt');
      await expect(varianteAnlegen(andere, 'Am Geländer')).resolves.toBeTruthy();
    });

    it('bereinigt die Ausrüstung: getrimmt, ohne leere und ohne doppelte (ANN-295)', async () => {
      const uebung = await uebungAnlegen();
      await varianteAnlegen(uebung, 'Mit Band', [
        ' Theraband gelb ',
        '',
        '\t',
        'Stuhl\n',
        'theraband gelb',
      ]);
      const v = (await bibliothek(users.therapist)).exercises[0]!.variants[0]!;
      expect(v.equipment).toEqual(['Theraband gelb', 'Stuhl']);
    });

    it.each([
      ['mehr als acht Schlagworte', Array.from({ length: 9 }, (_, i) => `Ding ${i}`), /too many/],
      ['ein Schlagwort über 40 Zeichen', ['x'.repeat(41)], /equipment tag is too long/],
    ])('weist die Ausrüstung ab: %s', async (_fall, ausruestung, meldung) => {
      const uebung = await uebungAnlegen();
      await expect(varianteAnlegen(uebung, 'V', ausruestung)).rejects.toThrow(meldung);
    });

    it('macht leere Freitexte zu leer und weist zu lange ab', async () => {
      const uebung = await uebungAnlegen();
      const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, VARIANTE, [
        null,
        uebung,
        'Ohne Text',
        'Ohne Text',
        '  \n ',
        [],
        '',
        null,
      ]);
      const v = (await bibliothek(users.therapist)).exercises[0]!.variants[0]!;
      expect(v.id).toBe(rows[0]!.id);
      expect(v).toMatchObject({ instruction: null, common_faults: null, practice_notes: null });

      await expect(
        asUserCommitted(users.ownerTherapist, VARIANTE, [
          null,
          uebung,
          'Zu lang',
          'Zu lang',
          'x'.repeat(1001),
          [],
          null,
          null,
        ]),
      ).rejects.toThrow(/instruction is too long/);
    });

    it('ändert eine Variante, ohne sie an eine andere Übung zu hängen', async () => {
      const uebung = await uebungAnlegen();
      const andere = await uebungAnlegen('Ausfallschritt', 'Großer Schritt');
      const variante = await varianteAnlegen(uebung);
      await asUserCommitted(users.ownerTherapist, VARIANTE, [
        variante,
        andere,
        'Neu benannt',
        'Neu',
        null,
        ['Stuhl'],
        null,
        null,
      ]);
      const b = await bibliothek(users.therapist);
      const knie = b.exercises.find((u) => u.id === uebung)!;
      expect(knie.variants.map((v) => v.name)).toEqual(['Neu benannt']);
      expect(b.exercises.find((u) => u.id === andere)!.variants).toEqual([]);
    });

    it('hält die Körperregionen in Datenbank und Oberfläche gleich (ANN-295)', async () => {
      const { rows } = await asPostgres<{ regionen: string[] }>(
        'select app.exercise_body_regions() as regionen',
      );
      expect(rows[0]!.regionen).toEqual([...KOERPERREGIONEN]);
    });
  });

  describe('Archivieren und Löschen (ANN-296)', () => {
    it('archiviert Übung und Variante und holt sie zurück', async () => {
      const uebung = await uebungAnlegen();
      const variante = await varianteAnlegen(uebung);

      await asUserCommitted(users.ownerTherapist, UEBUNG_ARCHIV, [uebung, true]);
      await asUserCommitted(users.ownerTherapist, VARIANTE_ARCHIV, [variante, true]);
      let u = (await bibliothek(users.trainer)).exercises[0]!;
      expect(u.archived).toBe(true);
      expect(u.variants[0]!.archived).toBe(true);
      const { rows } = await asPostgres<{ archived_by: string }>(
        'select archived_by from public.exercises where id = $1',
        [uebung],
      );
      expect(rows[0]!.archived_by).toBe(users.ownerTherapist);

      await asUserCommitted(users.ownerTherapist, UEBUNG_ARCHIV, [uebung, false]);
      await asUserCommitted(users.ownerTherapist, VARIANTE_ARCHIV, [variante, false]);
      u = (await bibliothek(users.trainer)).exercises[0]!;
      expect(u.archived).toBe(false);
      expect(u.variants[0]!.archived).toBe(false);
    });

    it('löscht eine Übung erst ohne Varianten, dann wirklich', async () => {
      const uebung = await uebungAnlegen();
      const variante = await varianteAnlegen(uebung);

      await expect(
        asUserCommitted(users.ownerTherapist, UEBUNG_LOESCHEN, [uebung]),
      ).rejects.toThrow(/exercise has variants/);

      await asUserCommitted(users.ownerTherapist, VARIANTE_LOESCHEN, [variante]);
      await asUserCommitted(users.ownerTherapist, UEBUNG_LOESCHEN, [uebung]);

      const { rows } = await asPostgres<{ n: number }>(
        `select (select count(*) from public.exercises)::int
              + (select count(*) from public.exercise_variants)::int as n`,
      );
      expect(rows[0]!.n).toBe(0);
      expect((await bibliothek(users.ownerTherapist)).exercises).toEqual([]);
    });

    it('meldet eine unbekannte Kennung als nicht gefunden', async () => {
      const unbekannt = '00000000-0000-4000-8000-00000000abcd';
      await expect(
        asUserCommitted(users.ownerTherapist, UEBUNG_LOESCHEN, [unbekannt]),
      ).rejects.toThrow(/exercise not found/);
      await expect(
        asUserCommitted(users.ownerTherapist, VARIANTE_LOESCHEN, [unbekannt]),
      ).rejects.toThrow(/exercise variant not found/);
    });
  });

  it('hängt jede Zeile an die Organisation der Testpraxis', async () => {
    const uebung = await uebungAnlegen();
    await varianteAnlegen(uebung);
    const { rows } = await asPostgres<{ org: string }>(
      `select organization_id as org from public.exercises
       union select organization_id from public.exercise_variants`,
    );
    expect(rows).toEqual([{ org: organizationId }]);
  });
});
