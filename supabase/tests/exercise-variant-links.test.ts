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
import { ACHSEN } from '@/features/exercises/types';

/**
 * Achsen und Nachbarschaften (UEB-002, IDEA-TRN-004, IDEA-TRN-005).
 *
 *   * Eine Verbindung führt von der leichteren zur schwereren Variante, entlang
 *     genau einer Achse; je Paar höchstens eine, kein Kreis (ANN-294).
 *   * Angelegt und gelöst nur von owner; gelesen wie die Bibliothek (ANN-293).
 *   * Keine Funktion wählt aus den Verbindungen etwas aus (ADR-006 Punkt 10) -
 *     sie stehen in der Antwort der Bibliothek und sonst nirgends.
 */

const { users } = SEED;

const LISTE = 'select public.list_exercise_library() as bibliothek';
const UEBUNG = 'select public.save_exercise(null, $1, $2, $3) as id';
const VARIANTE =
  'select public.save_exercise_variant(null, $1::uuid, $2, $2, null, null, null, null) as id';
const VERBINDEN = 'select public.link_exercise_variants($1::uuid, $2::uuid, $3) as id';
const LOESEN = 'select public.unlink_exercise_variants($1::uuid)';
const VARIANTE_LOESCHEN = 'select public.delete_exercise_variant($1::uuid)';
const VARIANTE_ARCHIV = 'select public.set_exercise_variant_archived($1::uuid, $2::boolean)';

interface Verbindung {
  id: string;
  easier_variant_id: string;
  harder_variant_id: string;
  axis: string;
}

async function verbindungen(konto: string): Promise<Verbindung[]> {
  const { rows } = await asUser<{ bibliothek: { links: Verbindung[] } }>(konto, LISTE);
  return rows[0]!.bibliothek.links;
}

async function anlegen(konto: string, sql: string, params: unknown[]): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, sql, params);
  return rows[0]!.id;
}

async function verbinden(
  leichter: string,
  schwerer: string,
  achse = 'unterstuetzung',
  konto: string = users.ownerTherapist,
): Promise<string> {
  return anlegen(konto, VERBINDEN, [leichter, schwerer, achse]);
}

describe('Übungsbibliothek: Verbindungen (UEB-002)', () => {
  let kniebeuge: string;
  let gelaender: string;
  let frei: string;
  let einbeinig: string;
  let ausfallschritt: string;

  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
    await asPostgres('delete from public.exercise_variant_links');
    await asPostgres('delete from public.exercise_variants');
    await asPostgres('delete from public.exercises');
    const o = users.ownerTherapist;
    kniebeuge = await anlegen(o, UEBUNG, ['Kniebeuge', 'In die Hocke', 'knie']);
    gelaender = await anlegen(o, VARIANTE, [kniebeuge, 'Am Geländer']);
    frei = await anlegen(o, VARIANTE, [kniebeuge, 'Freistehend']);
    einbeinig = await anlegen(o, VARIANTE, [kniebeuge, 'Einbeinig']);
    const schritt = await anlegen(o, UEBUNG, ['Ausfallschritt', 'Großer Schritt', 'knie']);
    ausfallschritt = await anlegen(o, VARIANTE, [schritt, 'Ausfallschritt vorwärts']);
  });

  describe('Anlegen und Lesen', () => {
    it('verbindet zwei Varianten von leichter nach schwerer entlang einer Achse', async () => {
      const id = await verbinden(gelaender, frei, 'unterstuetzung');
      expect(await verbindungen(users.trainer)).toEqual([
        { id, easier_variant_id: gelaender, harder_variant_id: frei, axis: 'unterstuetzung' },
      ]);
      const { rows } = await asPostgres<{ created_by: string }>(
        'select created_by from public.exercise_variant_links where id = $1',
        [id],
      );
      expect(rows[0]!.created_by).toBe(users.ownerTherapist);
    });

    it('verbindet auch über Übungen hinweg und baut Ketten', async () => {
      await verbinden(gelaender, frei, 'unterstuetzung');
      await verbinden(frei, einbeinig, 'unterstuetzungsflaeche');
      await verbinden(einbeinig, ausfallschritt, 'komplexitaet');
      expect(await verbindungen(users.therapist)).toHaveLength(3);
    });

    it.each([
      ['Therapeut:in', users.therapist],
      ['Teamleitung', users.teamLead],
      ['Trainingsbetreuung', users.trainer],
      ['Büro (ABN-030, BEF-137)', users.office],
    ])('liest die Verbindungen und legt keine an: %s (ANN-293)', async (_rolle, konto) => {
      const id = await verbinden(gelaender, frei);
      expect((await verbindungen(konto)).map((v) => v.id)).toEqual([id]);
      await expect(verbinden(frei, einbeinig, 'hebel', konto)).rejects.toThrow(/not allowed/);
      await expect(asUserCommitted(konto, LOESEN, [id])).rejects.toThrow(/not allowed/);
      expect(await verbindungen(users.ownerTherapist)).toHaveLength(1);
    });
  });

  describe('Regeln (ANN-294)', () => {
    it('kennt genau die Achsen der Oberfläche', async () => {
      const { rows } = await asPostgres<{ achsen: string[] }>(
        'select app.exercise_axes() as achsen',
      );
      expect(rows[0]!.achsen).toEqual([...ACHSEN]);
      await expect(verbinden(gelaender, frei, 'gewicht')).rejects.toThrow(/axis is invalid/);
      await expect(verbinden(gelaender, frei, null as unknown as string)).rejects.toThrow(
        /axis is invalid/,
      );
    });

    it('verbindet keine Variante mit sich selbst', async () => {
      await expect(verbinden(gelaender, gelaender)).rejects.toThrow(
        /variant cannot be linked to itself/,
      );
    });

    it('lässt je Paar nur eine Verbindung zu - gleich welche Achse und Richtung', async () => {
      await verbinden(gelaender, frei, 'unterstuetzung');
      await expect(verbinden(gelaender, frei, 'hebel')).rejects.toThrow(
        /variants are already linked/,
      );
      await expect(verbinden(frei, gelaender, 'hebel')).rejects.toThrow(
        /variants are already linked/,
      );
    });

    it('schließt keinen Kreis, auch nicht über mehrere Schritte', async () => {
      await verbinden(gelaender, frei, 'unterstuetzung');
      await verbinden(frei, einbeinig, 'unterstuetzungsflaeche');
      await expect(verbinden(einbeinig, gelaender, 'hebel')).rejects.toThrow(
        /link would form a cycle/,
      );
      expect(await verbindungen(users.ownerTherapist)).toHaveLength(2);
    });

    it('verbindet keine Variante einer archivierten Übung', async () => {
      await asUserCommitted(
        users.ownerTherapist,
        'select public.set_exercise_archived($1::uuid, true)',
        [kniebeuge],
      );
      await expect(verbinden(einbeinig, ausfallschritt, 'komplexitaet')).rejects.toThrow(
        /archived variant cannot be linked/,
      );
    });

    it('verbindet keine archivierte Variante', async () => {
      await asUserCommitted(users.ownerTherapist, VARIANTE_ARCHIV, [frei, true]);
      await expect(verbinden(gelaender, frei)).rejects.toThrow(/archived variant cannot be linked/);
    });

    it('löst eine Verbindung und gibt die Variante zum Löschen frei (ANN-296)', async () => {
      const id = await verbinden(gelaender, frei);
      await expect(
        asUserCommitted(users.ownerTherapist, VARIANTE_LOESCHEN, [frei]),
      ).rejects.toThrow(/exercise variant is in use/);

      await asUserCommitted(users.ownerTherapist, LOESEN, [id]);
      expect(await verbindungen(users.ownerTherapist)).toEqual([]);
      await asUserCommitted(users.ownerTherapist, VARIANTE_LOESCHEN, [frei]);
      const { rows } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.exercise_variants where id = $1',
        [frei],
      );
      expect(rows[0]!.n).toBe(0);
    });

    it('meldet eine unbekannte Verbindung als nicht gefunden', async () => {
      await expect(
        asUserCommitted(users.ownerTherapist, LOESEN, ['00000000-0000-4000-8000-00000000abcd']),
      ).rejects.toThrow(/exercise variant link not found/);
    });
  });

  describe('Negativfälle (ADR-013 Punkt 9 Nr. 1)', () => {
    it.each([
      ['Profil ohne Praxisrolle', users.patientMax],
      ['Plattformkonto Kund:in', users.plattformTina],
      ['Plattformkonto Patient:in und Kund:in', users.plattformErika],
      ['Begleitung', users.plattformPaula],
    ])('weist %s ab', async (_wer, konto) => {
      const id = await verbinden(gelaender, frei);
      await expect(asUser(konto, LISTE)).rejects.toThrow(/not allowed/);
      await expect(verbinden(frei, einbeinig, 'hebel', konto)).rejects.toThrow(/not allowed/);
      await expect(asUserCommitted(konto, LOESEN, [id])).rejects.toThrow(/not allowed/);
    });

    it('lässt die fremde Organisation nichts sehen, verbinden oder lösen (ADR-003)', async () => {
      const id = await verbinden(gelaender, frei);
      const fremd = (await fremdeOrganisation()).owner;

      expect(await verbindungen(fremd)).toEqual([]);
      await expect(verbinden(frei, einbeinig, 'hebel', fremd)).rejects.toThrow(
        /exercise variant not found/,
      );
      await expect(asUserCommitted(fremd, LOESEN, [id])).rejects.toThrow(
        /exercise variant link not found/,
      );

      // Auch nicht über eine eigene Variante zu einer fremden.
      const eigeneUebung = await anlegen(fremd, UEBUNG, ['Fremde Übung', 'Fremd', 'hand']);
      const eigene = await anlegen(fremd, VARIANTE, [eigeneUebung, 'Fremde Variante']);
      await expect(verbinden(eigene, frei, 'hebel', fremd)).rejects.toThrow(
        /exercise variant not found/,
      );
      await expect(verbinden(gelaender, eigene, 'hebel')).rejects.toThrow(
        /exercise variant not found/,
      );
      expect(await verbindungen(users.ownerTherapist)).toHaveLength(1);
    });

    it('gibt keiner Rolle Tabellenrecht (ADR-004)', async () => {
      await verbinden(gelaender, frei);
      await expect(
        asUser(users.ownerTherapist, 'select * from public.exercise_variant_links'),
      ).rejects.toThrow(/permission denied/);
      await expect(asAnon('select * from public.exercise_variant_links')).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});

describe('Übungsbibliothek im Seed (UEB-003)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('bringt Übungen, Varianten und Ketten mit, eine Kette über zwei Übungen', async () => {
    const { rows } = await asUser<{
      bibliothek: {
        exercises: Array<{ name: string; archived: boolean; variants: Array<{ id: string }> }>;
        links: Verbindung[];
      };
    }>(users.trainer, LISTE);
    const b = rows[0]!.bibliothek;
    expect(b.exercises).toHaveLength(9);
    expect(b.exercises.filter((u) => u.archived).map((u) => u.name)).toEqual(['Beinpresse']);
    expect(b.links).toHaveLength(8);

    const uebungDerVariante = new Map(
      b.exercises.flatMap((u) => u.variants.map((v) => [v.id, u.name] as const)),
    );
    const ueberUebungen = b.links.filter(
      (l) =>
        uebungDerVariante.get(l.easier_variant_id) !== uebungDerVariante.get(l.harder_variant_id),
    );
    expect(ueberUebungen).toHaveLength(1);
  });
});
