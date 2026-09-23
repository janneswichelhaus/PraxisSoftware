import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

const { users, organizationId } = SEED;

const LISTE = 'select * from public.list_text_snippets()';
const ANLEGEN = 'select public.create_text_snippet($1, $2, $3::boolean)';
const AENDERN = 'select public.update_text_snippet($1::uuid, $2, $3)';
const LOESCHEN = 'select public.delete_text_snippet($1::uuid)';

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const STAFF_TIM = '55555555-5555-4555-8555-000000000004';

interface Baustein {
  id: string;
  title: string;
  body: string;
  shared: boolean;
  editable: boolean;
}

function liste(userId: string) {
  return asUser<Baustein>(userId, LISTE);
}

function titel(rows: Baustein[]): string[] {
  return rows.map((zeile) => zeile.title);
}

/**
 * Textbausteine sind Betriebsdaten ohne Patientenbezug (UX-008) - ihre
 * Sichtbarkeit ist trotzdem eine Berechtigungsfrage: ein persoenlicher
 * Baustein gehoert genau einer Person, ein praxisweiter steuert, was bei allen
 * in der Dokumentation landet. Genau das wird hier geprueft.
 */
describe('Textbausteine', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.treatment_text_snippets');
    await asPostgres('delete from public.audit_log');
  });

  /** Legt einen Baustein unmittelbar an - fuer Lesetests. */
  async function baustein(opts: { titel: string; staff?: string | null; text?: string }) {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.treatment_text_snippets
         (organization_id, staff_member_id, title, body, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $5) returning id`,
      [
        organizationId,
        opts.staff === undefined ? null : opts.staff,
        opts.titel,
        opts.text ?? 'Synthetischer Bausteintext.',
        users.ownerTherapist,
      ],
    );
    return rows[0]!.id;
  }

  describe('Lesen', () => {
    it('ist fuer anon nicht ausfuehrbar', async () => {
      await expect(asAnon(LISTE)).rejects.toThrow(/permission denied/);
    });

    it('weist ein Patientenkonto ab', async () => {
      expect((await liste(users.patientMax)).rows).toEqual([]);
    });

    it('weist office ab - wer nicht dokumentiert, braucht keine Bausteine', async () => {
      expect((await liste(users.office)).rows).toEqual([]);
    });

    it('liefert praxisweite Bausteine allen dokumentierenden Rollen', async () => {
      await baustein({ titel: 'Praxisweit' });
      expect(titel((await liste(users.therapist)).rows)).toContain('Praxisweit');
      expect(titel((await liste(users.teamLead)).rows)).toContain('Praxisweit');
      expect(titel((await liste(users.ownerTherapist)).rows)).toContain('Praxisweit');
    });

    it('zeigt einen fremden persoenlichen Baustein nicht', async () => {
      await baustein({ titel: 'Nur Tim', staff: STAFF_TIM });
      expect(titel((await liste(users.therapist)).rows)).not.toContain('Nur Tim');
      expect(titel((await liste(users.teamLead)).rows)).toContain('Nur Tim');
    });

    it('stellt praxisweite Bausteine vor die eigenen', async () => {
      await baustein({ titel: 'Zzz Praxis' });
      await baustein({ titel: 'Aaa Eigen', staff: STAFF_ANNA });
      expect(titel((await liste(users.therapist)).rows)).toEqual(['Zzz Praxis', 'Aaa Eigen']);
    });

    it('sagt je Baustein, ob die Rolle ihn aendern darf', async () => {
      await baustein({ titel: 'Praxisweit' });
      await baustein({ titel: 'Eigen', staff: STAFF_ANNA });

      const anna = (await liste(users.therapist)).rows;
      expect(anna.find((b) => b.title === 'Praxisweit')!.editable).toBe(false);
      expect(anna.find((b) => b.title === 'Eigen')!.editable).toBe(true);

      const owner = (await liste(users.ownerTherapist)).rows;
      expect(owner.find((b) => b.title === 'Praxisweit')!.editable).toBe(true);
    });

    it('gibt die Tabelle nicht ueber einen direkten Select frei', async () => {
      await baustein({ titel: 'Nur Tim', staff: STAFF_TIM });
      const { rows } = await asUser<Baustein>(
        users.therapist,
        'select title from public.treatment_text_snippets',
      );
      expect(titel(rows)).not.toContain('Nur Tim');
    });

    it('haelt die Tabelle fuer authenticated schreibgeschuetzt', async () => {
      await expect(
        asUser(
          users.therapist,
          `insert into public.treatment_text_snippets
             (organization_id, title, body, created_by, updated_by)
           values ($1, 'Direkt', 'Text', $2, $2)`,
          [organizationId, users.therapist],
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe('Anlegen', () => {
    it('legt einen persoenlichen Baustein an', async () => {
      await asUserCommitted(users.therapist, ANLEGEN, ['Mein Baustein', 'Mein Text', false]);

      const anna = (await liste(users.therapist)).rows;
      expect(anna).toEqual([
        expect.objectContaining({ title: 'Mein Baustein', shared: false, editable: true }),
      ]);
      // Und niemand sonst sieht ihn.
      expect(titel((await liste(users.teamLead)).rows)).not.toContain('Mein Baustein');
    });

    it('laesst einen praxisweiten Baustein nur durch owner anlegen', async () => {
      await expect(asUser(users.therapist, ANLEGEN, ['Praxis', 'Text', true])).rejects.toThrow(
        /not allowed to manage shared text snippets/,
      );
      await expect(asUser(users.teamLead, ANLEGEN, ['Praxis', 'Text', true])).rejects.toThrow(
        /not allowed to manage shared text snippets/,
      );

      await asUserCommitted(users.ownerTherapist, ANLEGEN, ['Praxis', 'Text', true]);
      expect(titel((await liste(users.therapist)).rows)).toContain('Praxis');
    });

    it('weist leeren Titel und leeren Text ab', async () => {
      await expect(asUser(users.therapist, ANLEGEN, ['   ', 'Text', false])).rejects.toThrow(
        /title must not be empty/,
      );
      await expect(asUser(users.therapist, ANLEGEN, ['Titel', ' \n ', false])).rejects.toThrow(
        /snippet must not be empty/,
      );
    });

    it('weist einen doppelten Titel im selben Geltungsbereich ab', async () => {
      await asUserCommitted(users.therapist, ANLEGEN, ['Doppelt', 'Text', false]);
      await expect(asUser(users.therapist, ANLEGEN, ['doppelt', 'Anderer', false])).rejects.toThrow(
        /already exists/,
      );
    });

    it('erlaubt denselben Titel in verschiedenen Geltungsbereichen', async () => {
      await asUserCommitted(users.therapist, ANLEGEN, ['Gleich', 'Eigen', false]);
      await asUserCommitted(users.teamLead, ANLEGEN, ['Gleich', 'Auch eigen', false]);
      await asUserCommitted(users.ownerTherapist, ANLEGEN, ['Gleich', 'Praxis', true]);

      expect(titel((await liste(users.therapist)).rows).filter((t) => t === 'Gleich')).toHaveLength(
        2,
      );
    });

    it('protokolliert Titel und Geltungsbereich, nie den Text', async () => {
      await asUserCommitted(users.therapist, ANLEGEN, ['Mein Baustein', 'Geheimer Text', false]);

      const { rows } = await asPostgres<{ action: string; context: Record<string, unknown> }>(
        'select action, context from public.audit_log',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.action).toBe('text_snippet.created');
      expect(rows[0]!.context).toMatchObject({ shared: false, title: 'Mein Baustein' });
      expect(JSON.stringify(rows[0]!.context)).not.toContain('Geheimer Text');
    });

    it('schreibt bei einem abgewiesenen Aufruf keinen Auditeintrag', async () => {
      await expect(
        asUserCommitted(users.therapist, ANLEGEN, ['Praxis', 'Text', true]),
      ).rejects.toThrow();
      const { rows } = await asPostgres<{ anzahl: string }>(
        'select count(*)::text as anzahl from public.audit_log',
      );
      expect(rows[0]!.anzahl).toBe('0');
    });
  });

  describe('Aendern und Loeschen', () => {
    it('aendert einen eigenen Baustein', async () => {
      const id = await baustein({ titel: 'Alt', staff: STAFF_ANNA });
      await asUserCommitted(users.therapist, AENDERN, [id, 'Neu', 'Neuer Text']);

      const anna = (await liste(users.therapist)).rows;
      expect(anna[0]).toMatchObject({ title: 'Neu', body: 'Neuer Text' });
    });

    it('findet einen fremden persoenlichen Baustein nicht', async () => {
      const id = await baustein({ titel: 'Nur Tim', staff: STAFF_TIM });
      await expect(asUser(users.therapist, AENDERN, [id, 'Geklaut', 'Text'])).rejects.toThrow(
        /text snippet not found/,
      );
      await expect(asUser(users.therapist, LOESCHEN, [id])).rejects.toThrow(
        /text snippet not found/,
      );
    });

    it('meldet fuer eine unbekannte und eine fremde ID dasselbe', async () => {
      const fremd = await baustein({ titel: 'Nur Tim', staff: STAFF_TIM });
      const unbekannt = '00000000-0000-4000-8000-0000000000ff';

      const a = await asUser(users.therapist, LOESCHEN, [fremd]).catch((e: Error) => e.message);
      const b = await asUser(users.therapist, LOESCHEN, [unbekannt]).catch((e: Error) => e.message);
      expect(a).toBe(b);
    });

    it('laesst einen praxisweiten Baustein nur durch owner aendern und loeschen', async () => {
      const id = await baustein({ titel: 'Praxis' });

      await expect(asUser(users.therapist, AENDERN, [id, 'Neu', 'Text'])).rejects.toThrow(
        /not allowed to manage shared text snippets/,
      );
      await expect(asUser(users.therapist, LOESCHEN, [id])).rejects.toThrow(
        /not allowed to manage shared text snippets/,
      );

      await asUserCommitted(users.ownerTherapist, AENDERN, [id, 'Neu', 'Text']);
      await asUserCommitted(users.ownerTherapist, LOESCHEN, [id]);
      expect((await liste(users.therapist)).rows).toEqual([]);
    });

    it('protokolliert das Loeschen mit Titel und Geltungsbereich', async () => {
      const id = await baustein({ titel: 'Weg damit', staff: STAFF_ANNA });
      await asUserCommitted(users.therapist, LOESCHEN, [id]);

      const { rows } = await asPostgres<{ action: string; context: Record<string, unknown> }>(
        'select action, context from public.audit_log',
      );
      expect(rows[0]!.action).toBe('text_snippet.deleted');
      expect(rows[0]!.context).toMatchObject({ shared: false, title: 'Weg damit' });
    });
  });

  describe('Datenschutz', () => {
    it('hat keinen Patienten- und keinen Terminbezug', async () => {
      const { rows } = await asPostgres<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'treatment_text_snippets'`,
      );
      const spalten = rows.map((zeile) => zeile.column_name);
      expect(spalten).not.toContain('patient_id');
      expect(spalten).not.toContain('appointment_id');
    });

    it('traegt Datenklasse und Frist als Kommentar (Definition of Done)', async () => {
      const { rows } = await asPostgres<{ beschreibung: string | null }>(
        `select obj_description('public.treatment_text_snippets'::regclass, 'pg_class') as beschreibung`,
      );
      expect(rows[0]!.beschreibung).toMatch(/Datenklasse/);
      expect(rows[0]!.beschreibung).toMatch(/Frist/);
      expect(rows[0]!.beschreibung).toMatch(/ANN-020/);
    });

    it('loescht persoenliche Bausteine mit dem Mitarbeiterdatensatz', async () => {
      // Eine eigene Person, damit der Seed unberuehrt bleibt.
      const { rows: person } = await asPostgres<{ id: string }>(
        `insert into public.persons (organization_id, given_name, family_name)
         values ($1, 'Wechsel', 'Weg') returning id`,
        [organizationId],
      );
      const { rows: staff } = await asPostgres<{ id: string }>(
        `insert into public.staff_members (organization_id, person_id) values ($1, $2) returning id`,
        [organizationId, person[0]!.id],
      );

      await baustein({ titel: 'Geht mit', staff: staff[0]!.id });
      await asPostgres('delete from public.staff_members where id = $1', [staff[0]!.id]);

      const { rows } = await asPostgres<{ anzahl: string }>(
        `select count(*)::text as anzahl from public.treatment_text_snippets where title = 'Geht mit'`,
      );
      expect(rows[0]!.anzahl).toBe('0');
    });
  });
});
