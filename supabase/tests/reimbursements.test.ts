import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asServiceRole,
  asStorageApi,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { gleichzeitig } from './helpers/gleichzeitig';
import { tageweise } from './helpers/wiederherstellung';

/**
 * Erstattungen: Einkauf mit Belegen, Ladestrom ebenso (ANN-598 bis ANN-602); Rechte, Belege als Dateien
 * nach ADR-017, IBAN, Sichtbarkeit, Negativfälle aus ADR-013 Punkt 9 Nr. 1 und Löschlauf mit Journal.
 */

const { users, organizationId } = SEED;

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
  tom: '55555555-5555-4555-8555-000000000006',
} as const;

/** Gültige Beispiel-IBANs (Prüfziffer nach ISO 13616), ausschließlich synthetisch. */
const IBAN = {
  anna: 'DE89370400440532013000',
  annaNeu: 'DE02500105170137075030',
  olivia: 'DE02120300000000202051',
  jannes: 'DE75512108001245126199',
  falsch: 'DE89370400440532013001',
} as const;

const SUMME = 'c'.repeat(64);
const GROESSE = 54_321;
/** Ein Ladestrom-Beleg über 18,50 Euro. */
const LADESTROM = 1850;

const KONTO = 'select public.set_own_payout_account($1) as daten';
const VORBEREITEN = 'select * from public.prepare_reimbursement_receipt_upload($1, $2::bigint, $3)';
const BESTAETIGEN = 'select public.confirm_reimbursement_receipt_upload($1::uuid)';
const VERWERFEN = 'select public.discard_reimbursement_receipt($1::uuid)';
const EINKAUF = 'select public.submit_purchase_reimbursement($1::jsonb, $2) as daten';
const ZURUECKZIEHEN = 'select public.withdraw_reimbursement($1::uuid)';
const ENTSCHEIDEN = 'select public.decide_reimbursement($1::uuid, $2::boolean, $3) as daten';
const AUSZAHLUNG = 'select public.reimbursement_payout_details($1::uuid) as daten';
const AUSGEZAHLT = 'select public.mark_reimbursement_paid($1::uuid) as daten';
const LISTE = 'select public.list_reimbursements($1::uuid) as daten';
const VERWEIS = 'select * from public.issue_reimbursement_receipt_link($1::uuid)';
const ANKUENDIGUNG =
  'select * from public.reimbursement_receipt_for_verification($1::uuid, $2::uuid)';

interface Vorbereitet {
  receipt_id: string;
  bucket_id: string;
  object_key: string;
}

interface Antrag {
  id: string;
  staff_member_id: string;
  name: string | null;
  kind: 'electricity' | 'purchase';
  period_month: string | null;
  working_days: number | null;
  energy_wh_per_day: number | null;
  working_minutes: number | null;
  km_per_hour: number | null;
  wh_per_km: number | null;
  tour_km: number | null;
  rate_cents_per_kwh: number | null;
  amount_cents: number;
  status: string;
  self_entered: boolean;
  decision_note: string | null;
  receipts: { id: string; amount_cents: number; purpose: string; mime_type: string }[];
}

interface Liste {
  my_staff_member_id: string | null;
  can_decide: boolean;
  can_read_all: boolean;
  person: {
    staff_member_id: string;
    name: string | null;
    account: { iban_masked: string; since: string } | null;
    reimbursements: Antrag[];
  } | null;
  to_decide: Antrag[];
  to_pay: (Antrag & { iban_masked: string | null })[];
  people: { staff_member_id: string; name: string | null; open: number }[];
}

async function code(versuch: Promise<unknown>): Promise<string> {
  const fehler = await abgefangen(versuch);
  return fehler ? String((fehler as { code?: string }).code ?? fehler.message) : 'kein Fehler';
}

async function meldung(versuch: Promise<unknown>): Promise<string> {
  return (await abgefangen(versuch))?.message ?? 'kein Fehler';
}

/** Der Erste eines Monats vor `zurueck` Monaten, in der Zeitzone der Praxis. */
async function monat(zurueck: number): Promise<string> {
  const { rows } = await asPostgres<{ m: string }>(
    `select to_char(date_trunc('month', now() at time zone 'Europe/Berlin')
                    - make_interval(months => $1), 'YYYY-MM-DD') as m`,
    [zurueck],
  );
  return rows[0]!.m;
}

async function kontoHinterlegen(konto: string, iban: string): Promise<void> {
  await asUserCommitted(konto, KONTO, [iban]);
}

/** Ladestrom eines Monats, beantragt wie ein Einkauf: ein Beleg mit Betrag und Zweck. */
async function strom(
  konto: string,
  ersterTag: string,
  iban: string | null = null,
): Promise<{ id: string; status: string; amount_cents: number }> {
  const v = await beleg(konto);
  const zweck = `Ladestrom ${ersterTag.slice(0, 7)}`;
  return einkauf(
    konto,
    [{ receipt_id: v.receipt_id, amount_cents: LADESTROM, purpose: zweck }],
    iban,
  );
}

async function vorbereiten(
  konto: string,
  mime = 'image/jpeg',
  groesse: number = GROESSE,
): Promise<Vorbereitet> {
  const { rows } = await asUserCommitted<Vorbereitet>(konto, VORBEREITEN, [mime, groesse, SUMME]);
  return rows[0]!;
}

/** Spielt nach, was die Storage-API beim Upload tut - mit der RLS des Kontos. */
async function hochladen(
  konto: string,
  v: Pick<Vorbereitet, 'bucket_id' | 'object_key'>,
  groesse = GROESSE,
  mime = 'image/jpeg',
): Promise<void> {
  await asStorageApi(
    konto,
    'storage.object.upload',
    `insert into storage.objects (bucket_id, name, metadata)
     values ($1, $2, jsonb_build_object('size', $3::bigint, 'mimetype', $4::text))`,
    [v.bucket_id, v.object_key, groesse, mime],
  );
}

/** Der ganze Weg eines Belegs: vorbereiten, hochladen, bestätigen. */
async function beleg(konto: string, mime = 'image/jpeg'): Promise<Vorbereitet> {
  const v = await vorbereiten(konto, mime);
  await hochladen(konto, v, GROESSE, mime);
  await asUserCommitted(konto, BESTAETIGEN, [v.receipt_id]);
  return v;
}

async function einkauf(
  konto: string,
  posten: { receipt_id: string; amount_cents: number; purpose: string }[],
  iban: string | null = null,
): Promise<{ id: string; status: string; amount_cents: number }> {
  const { rows } = await asUserCommitted<{
    daten: { id: string; status: string; amount_cents: number };
  }>(konto, EINKAUF, [JSON.stringify(posten), iban]);
  return rows[0]!.daten;
}

async function liste(konto: string, person: string | null = null): Promise<Liste> {
  const { rows } = await asUser<{ daten: Liste }>(konto, LISTE, [person]);
  return rows[0]!.daten;
}

async function antrag(id: string) {
  const { rows } = await asPostgres<{
    status: string;
    amount_cents: number;
    decided_by: string | null;
    decision_note: string | null;
    paid_by: string | null;
    self_entered: boolean;
  }>(
    `select status, amount_cents, decided_by, decision_note, paid_by, self_entered
       from public.staff_reimbursements where id = $1`,
    [id],
  );
  return rows[0];
}

/** Die offenen Löschaufträge im Bucket der Belege. */
async function auftraege(): Promise<string[]> {
  const { rows } = await asPostgres<{ object_key: string }>(
    `select object_key from public.storage_deletion_orders
      where bucket_id = 'erstattungsbelege' and receipted_at is null order by object_key`,
  );
  return rows.map((r) => r.object_key);
}

async function auditAnzahl(): Promise<number> {
  const { rows } = await asPostgres<{ n: number }>(
    'select count(*)::integer as n from public.audit_log',
  );
  return rows[0]!.n;
}

/** Der Schalter der Prüfung am Server (ADR-017 Punkt 51) - derselbe wie für die Akte. */
async function schalter(an: boolean): Promise<void> {
  await asPostgres(
    `create or replace function app.patient_file_verification_required()
       returns boolean language sql immutable set search_path = '' as $$ select ${an} $$`,
  );
}

async function ergebnis(
  id: string,
  typ: boolean,
  summe: boolean,
  metadaten: boolean | null,
): Promise<string> {
  const { rows } = await asServiceRole<{ r: string }>(
    'select public.record_reimbursement_receipt_verification($1::uuid, $2, $3, $4) as r',
    [id, typ, summe, metadaten],
  );
  return rows[0]!.r;
}

/** Verlegt einen Zeitpunkt zurück - am Wächter vorbei, nur für den Test. */
async function belegVor(id: string, intervall: string): Promise<void> {
  await asPostgres(
    'alter table public.staff_reimbursement_receipts disable trigger staff_reimbursement_receipts_guard',
  );
  try {
    await asPostgres(
      'update public.staff_reimbursement_receipts set created_at = now() - $2::interval where id = $1',
      [id, intervall],
    );
  } finally {
    await asPostgres(
      'alter table public.staff_reimbursement_receipts enable trigger staff_reimbursement_receipts_guard',
    );
  }
}

describe('Erstattungen (ERS-001)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await schalter(false);
  }, 120_000);

  describe('Rechte der Funktionen', () => {
    it('gibt die Wege der Anwendung angemeldeten Konten, die Hilfen niemandem', async () => {
      const { rows } = await asPostgres<{ name: string; auth: boolean; anon: boolean }>(
        `select p.oid::regprocedure::text as name,
                has_function_privilege('authenticated', p.oid, 'execute') as auth,
                has_function_privilege('anon', p.oid, 'execute') as anon
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where (n.nspname = 'public' and p.proname in (
                  'set_own_payout_account', 'prepare_reimbursement_receipt_upload',
                  'confirm_reimbursement_receipt_upload', 'discard_reimbursement_receipt',
                  'submit_purchase_reimbursement', 'withdraw_reimbursement', 'decide_reimbursement',
                  'reimbursement_payout_details', 'mark_reimbursement_paid', 'list_reimbursements',
                  'issue_reimbursement_receipt_link'))
          order by 1`,
      );
      expect(rows).toHaveLength(11);
      expect(rows.every((r) => r.auth && !r.anon)).toBe(true);

      const { rows: hilfen } = await asPostgres<{ name: string; auth: boolean }>(
        `select p.proname as name, has_function_privilege('authenticated', p.oid, 'execute') as auth
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'app' and p.proname in (
                  'reimbursement_receipt_limit', 'mask_iban', 'store_payout_account',
                  'payout_account_view',
                  'reimbursement_view', 'reimbursement_start', 'own_pending_reimbursement_receipt',
                  'may_pay_reimbursement', 'delete_due_reimbursements',
                  'staff_reimbursement_receipts_guard',
                  'order_reimbursement_receipt_object_deletion')`,
      );
      // reimbursement_view zweimal: mit und ohne Tiefe (ANN-616).
      expect(hilfen).toHaveLength(12);
      expect(hilfen.filter((r) => r.auth)).toEqual([]);
    });

    it('kennt die Rechnung des Ladestroms nicht mehr - weder Wege noch Einstellungen', async () => {
      const { rows } = await asPostgres<{ name: string }>(
        `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public', 'app')
            and (p.proname like '%electricity%' or p.proname = 'reimbursement_working_minutes')
         union all
         select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'organizations'
            and column_name like 'electricity%'`,
      );
      expect(rows).toEqual([]);
    });

    it('lässt Ankündigung, Ergebnis und Aufräumen nur den Dienst rufen', async () => {
      const { rows } = await asPostgres<{ name: string; auth: boolean; dienst: boolean }>(
        `select p.proname as name,
                has_function_privilege('authenticated', p.oid, 'execute') as auth,
                has_function_privilege('service_role', p.oid, 'execute') as dienst
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in (
                  'reimbursement_receipt_for_verification',
                  'record_reimbursement_receipt_verification',
                  'discard_stale_reimbursement_receipts')
          order by 1`,
      );
      expect(rows).toEqual([
        { name: 'discard_stale_reimbursement_receipts', auth: false, dienst: false },
        { name: 'record_reimbursement_receipt_verification', auth: false, dienst: true },
        { name: 'reimbursement_receipt_for_verification', auth: false, dienst: true },
      ]);
    });

    it('gibt keiner Rolle der Anwendung ein Tabellenrecht', async () => {
      const { rows } = await asPostgres<{ n: number }>(
        `select count(*)::integer as n from information_schema.role_table_grants
          where table_schema = 'public'
            and table_name in ('staff_reimbursements', 'staff_reimbursement_receipts',
                               'staff_reimbursement_receipt_access_grants', 'staff_payout_accounts')
            and grantee in ('anon', 'authenticated')`,
      );
      expect(rows[0]!.n).toBe(0);
      expect(
        await code(asUser(users.ownerTherapist, 'select * from public.staff_payout_accounts')),
      ).toBe('42501');
      expect(await code(asUser(users.office, 'select * from public.staff_reimbursements'))).toBe(
        '42501',
      );
    });
  });

  describe('Konto (ANN-601)', () => {
    it('hinterlegt die IBAN ohne Leerzeichen und zeigt sie maskiert', async () => {
      const { rows } = await asUserCommitted<{ daten: { iban_masked: string; since: string } }>(
        users.therapist,
        KONTO,
        ['de89 3704 0044 0532 0130 00'],
      );
      expect(rows[0]!.daten.iban_masked).toBe('DE89 •••• 3000');
      const { rows: gespeichert } = await asPostgres<{ iban: string; updated_by: string }>(
        'select iban, updated_by from public.staff_payout_accounts where staff_member_id = $1',
        [STAFF.anna],
      );
      expect(gespeichert).toEqual([{ iban: IBAN.anna, updated_by: users.therapist }]);
    });

    it('weist eine falsche Prüfziffer ab und ersetzt eine hinterlegte', async () => {
      expect(await meldung(asUser(users.therapist, KONTO, [IBAN.falsch]))).toBe('invalid iban');
      expect(await code(asUser(users.therapist, KONTO, ['']))).toBe('22023');
      await kontoHinterlegen(users.therapist, IBAN.anna);
      await kontoHinterlegen(users.therapist, IBAN.annaNeu);
      const { rows } = await asPostgres<{ n: number; iban: string }>(
        `select count(*) over ()::integer as n, iban from public.staff_payout_accounts
          where staff_member_id = $1`,
        [STAFF.anna],
      );
      expect(rows).toEqual([{ n: 1, iban: IBAN.annaNeu }]);
    });

    it('hält die Prüfziffer auch am Tisch fest, für jeden Weg', async () => {
      expect(
        await code(
          asPostgres(
            `insert into public.staff_payout_accounts (organization_id, staff_member_id, iban, updated_by)
             values ($1, $2, $3, $4)`,
            [organizationId, STAFF.anna, IBAN.falsch, users.therapist],
          ),
        ),
      ).toBe('23514');
    });

    it('weist Konten ohne Praxisrolle, Plattformkonten und Unangemeldete ab', async () => {
      expect(await code(asUser(users.patientMax, KONTO, [IBAN.anna]))).toBe('42501');
      expect(await code(asUser(users.plattformTina, KONTO, [IBAN.anna]))).toBe('42501');
      expect(await code(asUser(null, KONTO, [IBAN.anna]))).toBe('42501');
      expect(await code(asAnon(KONTO, [IBAN.anna]))).toBe('42501');
    });
  });

  describe('Ältere Ladestrom-Anträge mit Rechenweg', () => {
    it('bleiben mit ihren Werten lesbar, entscheidbar und auszahlbar', async () => {
      await kontoHinterlegen(users.therapist, IBAN.anna);
      // Ein Antrag nach der alten Regel: 18 Tage × 0,5 kWh × 37 ct = 333 ct.
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.staff_reimbursements
           (organization_id, staff_member_id, kind, period_month, working_days, energy_wh_per_day,
            rate_cents_per_kwh, declared_at, amount_cents, status, requested_by)
         values ($1, $2, 'electricity', $3, 18, 500, 37, now(), 333, 'requested', $4)
         returning id`,
        [organizationId, STAFF.anna, await monat(2), users.therapist],
      );
      const alt = rows[0]!.id;

      const antraege = (await liste(users.therapist)).person?.reimbursements ?? [];
      expect(antraege.find((r) => r.id === alt)).toMatchObject({
        kind: 'electricity',
        working_days: 18,
        energy_wh_per_day: 500,
        rate_cents_per_kwh: 37,
        amount_cents: 333,
      });
      await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [alt, true, null]);
      await asUserCommitted(users.ownerTherapist, AUSGEZAHLT, [alt]);
      expect(await antrag(alt)).toMatchObject({ status: 'paid', amount_cents: 333 });
    });

    it('zeigt Kilometer und Betrag eines Antrags aus Touren nur der Person und owner (ANN-616)', async () => {
      // Nach der alten Regel: 412 km × 18 Wh/km × 37 ct/kWh = 274 ct; daneben einer nach km je Stunde.
      const { rows } = await asPostgres<{ id: string; art: string }>(
        `insert into public.staff_reimbursements
           (organization_id, staff_member_id, kind, period_month, working_minutes, km_per_hour,
            wh_per_km, tour_km, rate_cents_per_kwh, declared_at, amount_cents, status, requested_by)
         values ($1, $2, 'electricity', $3, 9600, null, 18, 412, 37, now(), 274, 'requested', $5),
                ($1, $2, 'electricity', $4, 9600, 6, 18, null, 37, now(), 639, 'requested', $5)
         returning id, case when tour_km is null then 'stunde' else 'tour' end as art`,
        [organizationId, STAFF.anna, await monat(1), await monat(2), users.therapist],
      );
      const tour = rows.find((r) => r.art === 'tour')!.id;
      const stunde = rows.find((r) => r.art === 'stunde')!.id;
      const voll = {
        id: tour,
        tour_km: 412,
        amount_cents: 274,
        wh_per_km: 18,
        rate_cents_per_kwh: 37,
      };
      const finde = (antraege: Antrag[] | undefined, id: string) =>
        (antraege ?? []).find((r) => r.id === id);

      expect(finde((await liste(users.therapist)).person?.reimbursements, tour)).toMatchObject(
        voll,
      );
      const owner = await liste(users.ownerTherapist, STAFF.anna);
      expect(finde(owner.person?.reimbursements, tour)).toMatchObject(voll);
      expect(finde(owner.to_decide, tour)).toMatchObject(voll);

      const buero = (await liste(users.office, STAFF.anna)).person?.reimbursements;
      expect(finde(buero, tour)).toMatchObject({
        id: tour,
        tour_km: null,
        amount_cents: null,
        wh_per_km: null,
        rate_cents_per_kwh: null,
      });
      // Ohne Touren gibt es nichts zu verbergen: Das Büro sieht den Betrag.
      expect(finde(buero, stunde)).toMatchObject({ id: stunde, tour_km: null, amount_cents: 639 });
    });

    it('hält die Rechnung auch am Tisch fest - für jeden Weg', async () => {
      const letzter = await monat(1);
      const einfuegen = (spalten: string, werte: string, fuer = letzter) =>
        code(
          asPostgres(
            `insert into public.staff_reimbursements
               (organization_id, staff_member_id, kind, period_month, declared_at, status,
                requested_by, ${spalten})
             values ($1, $2, 'electricity', $3, now(), 'requested', $4, ${werte})`,
            [organizationId, STAFF.anna, fuer, users.therapist],
          ),
        );
      // Falscher Betrag.
      expect(
        await einfuegen(
          'working_minutes, km_per_hour, wh_per_km, rate_cents_per_kwh, amount_cents',
          '9600, 6, 18, 37, 640',
        ),
      ).toBe('23514');
      // Beide Formen zugleich.
      expect(
        await einfuegen(
          'working_days, energy_wh_per_day, working_minutes, km_per_hour, wh_per_km, rate_cents_per_kwh, amount_cents',
          '18, 500, 9600, 6, 18, 37, 333',
        ),
      ).toBe('23514');
      // Strecke außerhalb der Grenzen.
      expect(
        await einfuegen(
          'working_minutes, km_per_hour, wh_per_km, rate_cents_per_kwh, amount_cents',
          '9600, 31, 18, 37, 3304',
        ),
      ).toBe('23514');
      expect(
        await einfuegen(
          'working_minutes, km_per_hour, wh_per_km, rate_cents_per_kwh, amount_cents',
          '9600, 6, 18, 37, 639',
        ),
      ).toBe('kein Fehler');
      // Aus Touren, in einem anderen Monat (einer je Monat): falscher Betrag, zugleich km je
      // Stunde, Strecke außerhalb der Grenzen.
      const tour =
        'working_minutes, km_per_hour, wh_per_km, tour_km, rate_cents_per_kwh, amount_cents';
      const vorletzter = await monat(2);
      expect(await einfuegen(tour, '9600, null, 18, 412, 37, 275', vorletzter)).toBe('23514');
      expect(await einfuegen(tour, '9600, 6, 18, 412, 37, 274', vorletzter)).toBe('23514');
      expect(await einfuegen(tour, '9600, null, 18, 10001, 37, 6661', vorletzter)).toBe('23514');
      expect(await einfuegen(tour, '9600, null, 18, 412, 37, 274', vorletzter)).toBe('kein Fehler');
    });
  });

  describe('Belege hochladen (ANN-600, ADR-017 sinngemäß)', () => {
    it('legt den Beleg bei der Person an - der Schlüssel besteht nur aus Kennungen', async () => {
      const v = await vorbereiten(users.therapist);
      expect(v.bucket_id).toBe('erstattungsbelege');
      expect(v.object_key).toBe(`${organizationId}/${STAFF.anna}/${v.receipt_id}`);
      const { rows } = await asPostgres(
        `select staff_member_id, reimbursement_id, mime_type, byte_size::integer as byte_size,
                status, created_by from public.staff_reimbursement_receipts where id = $1`,
        [v.receipt_id],
      );
      expect(rows).toEqual([
        {
          staff_member_id: STAFF.anna,
          reimbursement_id: null,
          mime_type: 'image/jpeg',
          byte_size: GROESSE,
          status: 'pending',
          created_by: users.therapist,
        },
      ]);
    });

    it('nimmt JPEG, PNG und PDF bis 10 MB mit Prüfsumme', async () => {
      expect((await vorbereiten(users.therapist, 'image/png')).bucket_id).toBe('erstattungsbelege');
      expect((await vorbereiten(users.therapist, 'application/pdf')).bucket_id).toBe(
        'erstattungsbelege',
      );
      expect(
        await meldung(asUser(users.therapist, VORBEREITEN, ['image/gif', GROESSE, SUMME])),
      ).toBe('unsupported media type');
      expect(
        await meldung(asUser(users.therapist, VORBEREITEN, ['image/jpeg', 10_485_761, SUMME])),
      ).toBe('file too large or empty');
      expect(await meldung(asUser(users.therapist, VORBEREITEN, ['image/jpeg', 0, SUMME]))).toBe(
        'file too large or empty',
      );
      expect(
        await meldung(asUser(users.therapist, VORBEREITEN, ['image/jpeg', GROESSE, 'xyz'])),
      ).toBe('invalid checksum');
    });

    it('hält höchstens zehn Belege ohne Antrag bei einer Person', async () => {
      for (let i = 0; i < 10; i += 1) await vorbereiten(users.therapist);
      expect(await code(asUser(users.therapist, VORBEREITEN, ['image/jpeg', GROESSE, SUMME]))).toBe(
        '23514',
      );
      // Eine andere Person ist davon nicht betroffen.
      expect((await vorbereiten(users.teamLead)).bucket_id).toBe('erstattungsbelege');
    });

    it('lässt nur das eigene, vorbereitete Objekt hochladen', async () => {
      const v = await vorbereiten(users.therapist);
      expect(await code(hochladen(users.teamLead, v))).toBe('42501');
      expect(
        await code(
          hochladen(users.therapist, { bucket_id: v.bucket_id, object_key: `${v.object_key}x` }),
        ),
      ).toBe('42501');
      await hochladen(users.therapist, v);
      // Nach der Bestätigung kein zweites Mal (unveränderlich, Punkt 8).
      await asUserCommitted(users.therapist, BESTAETIGEN, [v.receipt_id]);
      expect(
        await code(
          asStorageApi(
            users.therapist,
            'storage.object.upload',
            `update storage.objects set metadata = '{}'::jsonb where name = $1`,
            [v.object_key],
          ),
        ),
      ).toBe('kein Fehler');
      const { rows } = await asPostgres<{ metadata: unknown }>(
        'select metadata from storage.objects where name = $1',
        [v.object_key],
      );
      expect(rows[0]!.metadata).not.toEqual({});
    });

    it('bestätigt nur, was angekündigt war', async () => {
      const v = await vorbereiten(users.therapist);
      expect(await meldung(asUser(users.therapist, BESTAETIGEN, [v.receipt_id]))).toBe(
        'object was not uploaded',
      );
      await hochladen(users.therapist, v, GROESSE + 1);
      expect(await meldung(asUser(users.therapist, BESTAETIGEN, [v.receipt_id]))).toBe(
        'uploaded size does not match the announced size',
      );
      const w = await vorbereiten(users.therapist);
      await hochladen(users.therapist, w, GROESSE, 'image/png');
      expect(await meldung(asUser(users.therapist, BESTAETIGEN, [w.receipt_id]))).toBe(
        'uploaded media type does not match the announced media type',
      );
      // Fremd sieht aus wie nicht vorhanden.
      const x = await vorbereiten(users.therapist);
      await hochladen(users.therapist, x);
      expect(await code(asUser(users.teamLead, BESTAETIGEN, [x.receipt_id]))).toBe('P0002');
    });

    it('wartet mit scharfer Prüfung auf ihr Ergebnis', async () => {
      await schalter(true);
      const v = await beleg(users.therapist);
      const { rows } = await asPostgres<{ status: string; angefragt: boolean }>(
        `select status, confirmation_requested_at is not null as angefragt
           from public.staff_reimbursement_receipts where id = $1`,
        [v.receipt_id],
      );
      expect(rows).toEqual([{ status: 'pending', angefragt: true }]);
      expect(await ergebnis(v.receipt_id, true, true, true)).toBe('passed');
      const { rows: nachher } = await asPostgres<{ status: string; geprueft: boolean }>(
        `select status, verified_at is not null as geprueft
           from public.staff_reimbursement_receipts where id = $1`,
        [v.receipt_id],
      );
      expect(nachher).toEqual([{ status: 'ready', geprueft: true }]);
    });

    it('verwirft bei einem Befund, mit Löschauftrag für das Objekt', async () => {
      const v = await beleg(users.therapist);
      expect(await ergebnis(v.receipt_id, true, false, true)).toBe('rejected');
      const { rows } = await asPostgres<{ n: number }>(
        'select count(*)::integer as n from public.staff_reimbursement_receipts where id = $1',
        [v.receipt_id],
      );
      expect(rows[0]!.n).toBe(0);
      expect(await auftraege()).toEqual([v.object_key]);
    });

    it('prüft ein PDF ohne Metadatenfrage und ein Bild nur mit ihr', async () => {
      const pdf = await beleg(users.therapist, 'application/pdf');
      expect(await code(ergebnis(pdf.receipt_id, true, true, true))).toBe('22023');
      expect(await ergebnis(pdf.receipt_id, true, true, null)).toBe('passed');
      const bild = await beleg(users.therapist);
      expect(await code(ergebnis(bild.receipt_id, true, true, null))).toBe('22023');
    });

    it('kündigt dem Dienst nur Belege der Person ohne Antrag an', async () => {
      await kontoHinterlegen(users.therapist, IBAN.anna);
      const v = await beleg(users.therapist);
      const { rows } = await asServiceRole(ANKUENDIGUNG, [v.receipt_id, users.therapist]);
      expect(rows).toHaveLength(1);
      expect((await asServiceRole(ANKUENDIGUNG, [v.receipt_id, users.teamLead])).rows).toEqual([]);
      await einkauf(users.therapist, [
        { receipt_id: v.receipt_id, amount_cents: 1290, purpose: 'Massageöl' },
      ]);
      expect((await asServiceRole(ANKUENDIGUNG, [v.receipt_id, users.therapist])).rows).toEqual([]);
      // Ein zugeordneter Beleg wird nicht mehr verworfen.
      expect(await ergebnis(v.receipt_id, false, false, false)).toBe('not_found');
      expect(
        (
          await asPostgres('select 1 from public.staff_reimbursement_receipts where id = $1', [
            v.receipt_id,
          ])
        ).rows,
      ).toHaveLength(1);
    });

    it('verwirft eigene Belege ohne Antrag und räumt nach einem Tag auf', async () => {
      const weg = await beleg(users.therapist);
      expect(await code(asUser(users.teamLead, VERWERFEN, [weg.receipt_id]))).toBe('P0002');
      await asUserCommitted(users.therapist, VERWERFEN, [weg.receipt_id]);
      expect(await auftraege()).toEqual([weg.object_key]);

      const alt = await beleg(users.therapist);
      const frisch = await beleg(users.therapist);
      await belegVor(alt.receipt_id, '25 hours');
      const { rows } = await asPostgres<{ n: number }>(
        'select public.discard_stale_reimbursement_receipts() as n',
      );
      expect(rows[0]!.n).toBe(1);
      const { rows: uebrig } = await asPostgres<{ id: string }>(
        'select id from public.staff_reimbursement_receipts order by id',
      );
      expect(uebrig.map((r) => r.id)).toEqual([frisch.receipt_id]);
      expect(await auftraege()).toEqual([weg.object_key, alt.object_key].sort());
    });

    it('lässt einen Beleg nicht ändern - auch nicht von postgres', async () => {
      const v = await beleg(users.therapist);
      expect(
        await code(
          asPostgres(
            'update public.staff_reimbursement_receipts set byte_size = byte_size + 1 where id = $1',
            [v.receipt_id],
          ),
        ),
      ).toBe('42501');
      await kontoHinterlegen(users.therapist, IBAN.anna);
      await einkauf(users.therapist, [
        { receipt_id: v.receipt_id, amount_cents: 1290, purpose: 'Massageöl' },
      ]);
      expect(
        await code(
          asPostgres(
            'update public.staff_reimbursement_receipts set amount_cents = 1 where id = $1',
            [v.receipt_id],
          ),
        ),
      ).toBe('42501');
    });
  });

  describe('Einkauf beantragen (ANN-600)', () => {
    it('ordnet die Belege mit Betrag und Zweck zu - der Betrag ist ihre Summe', async () => {
      await kontoHinterlegen(users.therapist, IBAN.anna);
      const oel = await beleg(users.therapist);
      const rechnung = await beleg(users.therapist, 'application/pdf');
      const e = await einkauf(users.therapist, [
        { receipt_id: oel.receipt_id, amount_cents: 1290, purpose: ' Massageöl ' },
        { receipt_id: rechnung.receipt_id, amount_cents: 4599, purpose: 'Handtücher' },
      ]);
      expect(e).toMatchObject({ status: 'requested', amount_cents: 5889 });
      const { rows } = await asPostgres(
        `select id, amount_cents, purpose from public.staff_reimbursement_receipts
          where reimbursement_id = $1 order by amount_cents`,
        [e.id],
      );
      expect(rows).toEqual([
        { id: oel.receipt_id, amount_cents: 1290, purpose: 'Massageöl' },
        { id: rechnung.receipt_id, amount_cents: 4599, purpose: 'Handtücher' },
      ]);
    });

    it('nimmt nur eigene, fertige, nicht zugeordnete Belege', async () => {
      await kontoHinterlegen(users.therapist, IBAN.anna);
      await kontoHinterlegen(users.teamLead, IBAN.olivia);
      const fremd = await beleg(users.teamLead);
      const offen = await vorbereiten(users.therapist);
      const eigen = await beleg(users.therapist);
      const posten = (id: string) =>
        JSON.stringify([{ receipt_id: id, amount_cents: 500, purpose: 'Tape' }]);
      expect(await code(asUser(users.therapist, EINKAUF, [posten(fremd.receipt_id), null]))).toBe(
        'P0002',
      );
      expect(await code(asUser(users.therapist, EINKAUF, [posten(offen.receipt_id), null]))).toBe(
        'P0002',
      );
      await einkauf(users.therapist, [
        { receipt_id: eigen.receipt_id, amount_cents: 500, purpose: 'Tape' },
      ]);
      // Ein zweites Mal nicht.
      expect(await code(asUser(users.therapist, EINKAUF, [posten(eigen.receipt_id), null]))).toBe(
        'P0002',
      );
    });

    it('prüft Betrag, Zweck und Zahl der Posten', async () => {
      await kontoHinterlegen(users.therapist, IBAN.anna);
      const v = await beleg(users.therapist);
      const versuch = (posten: unknown) =>
        meldung(asUser(users.therapist, EINKAUF, [JSON.stringify(posten), null]));
      const gut = { receipt_id: v.receipt_id, amount_cents: 1290, purpose: 'Massageöl' };
      expect(await versuch([])).toBe('one to ten receipts');
      expect(await versuch(Array.from({ length: 11 }, () => gut))).toBe('one to ten receipts');
      expect(await versuch({ gut })).toBe('one to ten receipts');
      expect(await versuch([{ ...gut, amount_cents: 0 }])).toBe('receipt item is invalid');
      expect(await versuch([{ ...gut, amount_cents: 100_001 }])).toBe('receipt item is invalid');
      expect(await versuch([{ ...gut, amount_cents: '12,90' }])).toBe('receipt item is invalid');
      expect(await versuch([{ ...gut, purpose: '  ' }])).toBe('receipt item is invalid');
      expect(await versuch([{ ...gut, purpose: 'x'.repeat(201) }])).toBe('receipt item is invalid');
      expect(await versuch([{ ...gut, receipt_id: 'kein-uuid' }])).toBe('receipt item is invalid');
      expect(await versuch([gut, gut])).toBe('receipt item is invalid');
      expect(await versuch([gut])).toBe('kein Fehler');
    });

    it('trägt den Einkauf von owner als genehmigt ein', async () => {
      await kontoHinterlegen(users.ownerTherapist, IBAN.jannes);
      const v = await beleg(users.ownerTherapist);
      const e = await einkauf(users.ownerTherapist, [
        { receipt_id: v.receipt_id, amount_cents: 2500, purpose: 'Kettenöl' },
      ]);
      expect(e.status).toBe('approved');
    });
  });

  describe('Zurückziehen, entscheiden, auszahlen (ANN-598)', () => {
    async function annasStrom(): Promise<string> {
      await kontoHinterlegen(users.therapist, IBAN.anna);
      return (await strom(users.therapist, await monat(1))).id;
    }

    it('lässt die Person zurückziehen, solange beantragt ist', async () => {
      const id = await annasStrom();
      expect(await code(asUser(users.teamLead, ZURUECKZIEHEN, [id]))).toBe('P0002');
      expect(await code(asUser(users.ownerTherapist, ZURUECKZIEHEN, [id]))).toBe('P0002');
      await asUserCommitted(users.therapist, ZURUECKZIEHEN, [id]);
      expect((await antrag(id))?.status).toBe('withdrawn');
      expect(await meldung(asUser(users.therapist, ZURUECKZIEHEN, [id]))).toBe(
        'reimbursement is not open',
      );
    });

    it('genehmigt mit einem Aufruf - genehmigt heißt nicht ausgezahlt', async () => {
      const id = await annasStrom();
      const { rows } = await asUserCommitted<{ daten: { status: string } }>(
        users.ownerTherapist,
        ENTSCHEIDEN,
        [id, true, 'wird ignoriert'],
      );
      expect(rows[0]!.daten.status).toBe('approved');
      expect(await antrag(id)).toMatchObject({
        status: 'approved',
        decided_by: users.ownerTherapist,
        decision_note: null,
        paid_by: null,
      });
      expect(await meldung(asUser(users.therapist, ZURUECKZIEHEN, [id]))).toBe(
        'reimbursement is not open',
      );
    });

    it('lehnt nur mit Grund ab und entscheidet nichts zweimal', async () => {
      const id = await annasStrom();
      expect(await meldung(asUser(users.ownerTherapist, ENTSCHEIDEN, [id, false, '  ']))).toBe(
        'rejection needs a reason',
      );
      expect(
        await meldung(asUser(users.ownerTherapist, ENTSCHEIDEN, [id, false, 'x'.repeat(501)])),
      ).toBe('reason is too long');
      expect(await meldung(asUser(users.ownerTherapist, ENTSCHEIDEN, [id, null, null]))).toBe(
        'decision missing',
      );
      await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, false, 'Rad war im Urlaub']);
      expect(await antrag(id)).toMatchObject({
        status: 'rejected',
        decision_note: 'Rad war im Urlaub',
      });
      expect(await meldung(asUser(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]))).toBe(
        'reimbursement is not open',
      );
    });

    it('lässt nur owner entscheiden und auszahlen', async () => {
      const id = await annasStrom();
      for (const konto of [users.office, users.teamLead, users.therapist, users.trainer]) {
        expect(await code(asUser(konto, ENTSCHEIDEN, [id, true, null])), konto).toBe('42501');
        expect(await code(asUser(konto, AUSZAHLUNG, [id])), konto).toBe('42501');
        expect(await code(asUser(konto, AUSGEZAHLT, [id])), konto).toBe('42501');
      }
      expect(await code(asUser(users.patientMax, ENTSCHEIDEN, [id, true, null]))).toBe('42501');
      expect(await code(asUser(users.plattformTina, AUSZAHLUNG, [id]))).toBe('42501');
    });

    it('zeigt owner zum Auszahlen die volle IBAN, sonst nirgends', async () => {
      const id = await annasStrom();
      expect(await meldung(asUser(users.ownerTherapist, AUSZAHLUNG, [id]))).toBe(
        'reimbursement is not approved',
      );
      await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
      const { rows } = await asUser<{
        daten: { iban: string; account_since: string; amount_cents: number; name: string };
      }>(users.ownerTherapist, AUSZAHLUNG, [id]);
      expect(rows[0]!.daten).toMatchObject({
        iban: IBAN.anna,
        amount_cents: LADESTROM,
        name: 'Anna Beispiel',
      });
      expect(rows[0]!.daten.account_since).toBeTruthy();
      // Die Listen tragen sie für niemanden voll.
      for (const konto of [users.ownerTherapist, users.office, users.therapist]) {
        expect(
          JSON.stringify(await liste(konto, konto === users.therapist ? null : STAFF.anna)),
        ).not.toContain(IBAN.anna);
      }
    });

    it('vermerkt die Auszahlung eines genehmigten Antrags', async () => {
      const id = await annasStrom();
      expect(await meldung(asUser(users.ownerTherapist, AUSGEZAHLT, [id]))).toBe(
        'reimbursement is not approved',
      );
      await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
      const { rows } = await asUserCommitted<{ daten: { status: string } }>(
        users.ownerTherapist,
        AUSGEZAHLT,
        [id],
      );
      expect(rows[0]!.daten.status).toBe('paid');
      expect(await antrag(id)).toMatchObject({ status: 'paid', paid_by: users.ownerTherapist });
      expect(await meldung(asUser(users.ownerTherapist, AUSGEZAHLT, [id]))).toBe(
        'reimbursement is not approved',
      );
      expect(await meldung(asUser(users.ownerTherapist, AUSZAHLUNG, [id]))).toBe(
        'reimbursement is not approved',
      );
    });

    it('lässt owner den selbst eingetragenen auszahlen, nie einen eigenen eines anderen Kontos', async () => {
      await kontoHinterlegen(users.ownerTherapist, IBAN.jannes);
      const eigen = await strom(users.ownerTherapist, await monat(1));
      expect((await asUser(users.ownerTherapist, AUSZAHLUNG, [eigen.id])).rows).toHaveLength(1);
      await asUserCommitted(users.ownerTherapist, AUSGEZAHLT, [eigen.id]);
      expect((await antrag(eigen.id))?.status).toBe('paid');

      // Ein Antrag von Jannes, beantragt, als er noch nicht owner war.
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.staff_reimbursements
           (organization_id, staff_member_id, kind, period_month, working_days, energy_wh_per_day,
            rate_cents_per_kwh, declared_at, amount_cents, status, requested_by)
         values ($1, $2, 'electricity', $3, 10, 500, 37, now(), 185, 'requested', $4)
         returning id`,
        [organizationId, STAFF.jannes, await monat(2), users.ownerTherapist],
      );
      const alt = rows[0]!.id;
      expect(await meldung(asUser(users.ownerTherapist, ENTSCHEIDEN, [alt, true, null]))).toBe(
        'not allowed to decide own request',
      );
      await asPostgres(
        `update public.staff_reimbursements set status = 'approved', decided_by = $2,
                decided_at = now() where id = $1`,
        [alt, users.office],
      );
      expect(await code(asUser(users.ownerTherapist, AUSGEZAHLT, [alt]))).toBe('42501');
      expect(await meldung(asUser(users.ownerTherapist, AUSZAHLUNG, [alt]))).toBe(
        'reimbursement is not approved',
      );
    });

    it('findet keinen Antrag einer anderen Praxis', async () => {
      const id = await annasStrom();
      const fremd = await fremdeOrganisation();
      expect(await code(asUser(fremd.owner, ENTSCHEIDEN, [id, true, null]))).toBe('P0002');
      expect(await code(asUser(fremd.owner, AUSZAHLUNG, [id]))).toBe('P0002');
      expect(await code(asUser(fremd.owner, AUSGEZAHLT, [id]))).toBe('P0002');
      expect(await code(asUser(fremd.owner, LISTE, [STAFF.anna]))).toBe('P0002');
      const sicht = await liste(fremd.owner);
      expect(sicht.to_decide).toEqual([]);
      expect(sicht.people).toEqual([]);
    });
  });

  describe('Lesen (BEF-066 Option 2 mit Büro)', () => {
    async function belegtePraxis() {
      await kontoHinterlegen(users.therapist, IBAN.anna);
      await kontoHinterlegen(users.teamLead, IBAN.olivia);
      const stromAnna = (await strom(users.therapist, await monat(1))).id;
      const v = await beleg(users.therapist);
      const einkaufAnna = (
        await einkauf(users.therapist, [
          { receipt_id: v.receipt_id, amount_cents: 1290, purpose: 'Massageöl' },
        ])
      ).id;
      const stromTim = (await strom(users.teamLead, await monat(1))).id;
      await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [stromTim, true, null]);
      return { stromAnna, einkaufAnna, stromTim, beleg: v };
    }

    it('zeigt jeder Person nur ihre eigenen, mit maskierter IBAN', async () => {
      const { stromAnna, einkaufAnna } = await belegtePraxis();
      const sicht = await liste(users.therapist);
      expect(sicht).toMatchObject({
        my_staff_member_id: STAFF.anna,
        can_decide: false,
        can_read_all: false,
        to_decide: [],
        to_pay: [],
        people: [],
      });
      expect(sicht.person?.account?.iban_masked).toBe('DE89 •••• 3000');
      expect(sicht.person?.reimbursements.map((r) => r.id).sort()).toEqual(
        [stromAnna, einkaufAnna].sort(),
      );
      const einkaufZeile = sicht.person?.reimbursements.find((r) => r.id === einkaufAnna);
      expect(einkaufZeile?.receipts).toEqual([
        expect.objectContaining({
          amount_cents: 1290,
          purpose: 'Massageöl',
          mime_type: 'image/jpeg',
        }),
      ]);
      expect(JSON.stringify(sicht)).not.toContain('object_key');
      // Fremde Personen gibt es für sie nicht.
      expect(await code(asUser(users.therapist, LISTE, [STAFF.tim]))).toBe('P0002');
      expect(await code(asUser(users.trainer, LISTE, [STAFF.anna]))).toBe('P0002');
    });

    it('zeigt Büro die Personen mit Erstattungen und je Person die Anträge - ohne Summe über alle', async () => {
      const { stromAnna } = await belegtePraxis();
      const uebersicht = await liste(users.office);
      expect(uebersicht.can_read_all).toBe(true);
      expect(uebersicht.can_decide).toBe(false);
      expect(uebersicht.to_decide).toEqual([]);
      expect(uebersicht.people).toEqual([
        { staff_member_id: STAFF.anna, name: 'Anna Beispiel', open: 2 },
        { staff_member_id: STAFF.tim, name: 'Tim Teamleitung', open: 1 },
      ]);
      expect(Object.keys(uebersicht)).not.toContain('total_cents');
      const anna = await liste(users.office, STAFF.anna);
      expect(anna.person?.account?.iban_masked).toBe('DE89 •••• 3000');
      expect(anna.person?.reimbursements.map((r) => r.id)).toContain(stromAnna);
    });

    it('zeigt owner, was zu entscheiden und was auszuzahlen ist', async () => {
      const { stromAnna, einkaufAnna, stromTim } = await belegtePraxis();
      const sicht = await liste(users.ownerTherapist);
      expect(sicht.can_decide).toBe(true);
      expect(sicht.to_decide.map((r) => r.id).sort()).toEqual([stromAnna, einkaufAnna].sort());
      expect(sicht.to_pay).toEqual([
        expect.objectContaining({
          id: stromTim,
          iban_masked: 'DE02 •••• 2051',
          status: 'approved',
        }),
      ]);
    });

    it('gibt Belege gegen eine einmalige Freigabe frei - eigene immer, alle für owner und Büro', async () => {
      const { beleg: v } = await belegtePraxis();
      const offen = await beleg(users.therapist);
      // Die Person: ihren zugeordneten und ihren noch offenen.
      expect((await asUserCommitted(users.therapist, VERWEIS, [v.receipt_id])).rows).toHaveLength(
        1,
      );
      expect(
        (await asUserCommitted(users.therapist, VERWEIS, [offen.receipt_id])).rows,
      ).toHaveLength(1);
      // Büro und owner: nur zugeordnete; andere Rollen nichts.
      expect((await asUserCommitted(users.office, VERWEIS, [v.receipt_id])).rows).toHaveLength(1);
      expect(await code(asUser(users.office, VERWEIS, [offen.receipt_id]))).toBe('P0002');
      expect(await code(asUser(users.teamLead, VERWEIS, [v.receipt_id]))).toBe('P0002');
      const fremd = await fremdeOrganisation();
      expect(await code(asUser(fremd.owner, VERWEIS, [v.receipt_id]))).toBe('P0002');

      // Die Freigabe gilt für genau einen Zugriff.
      const lesen = (konto: string) =>
        asStorageApi<{ n: number }>(
          konto,
          'storage.object.sign',
          `select count(*)::integer as n from storage.objects
            where bucket_id = 'erstattungsbelege' and name = $1`,
          [v.object_key],
        );
      await asUserCommitted(users.ownerTherapist, VERWEIS, [v.receipt_id]);
      expect((await lesen(users.ownerTherapist)).rows[0]!.n).toBe(1);
      expect((await lesen(users.ownerTherapist)).rows[0]!.n).toBe(0);
      expect((await lesen(users.teamLead)).rows[0]!.n).toBe(0);
    });

    it('schreibt keinen Auditeintrag (ADR-010 Punkt 15)', async () => {
      const vorher = await auditAnzahl();
      const { stromAnna } = await belegtePraxis();
      await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [stromAnna, true, null]);
      await asUser(users.ownerTherapist, AUSZAHLUNG, [stromAnna]);
      await asUserCommitted(users.ownerTherapist, AUSGEZAHLT, [stromAnna]);
      expect(await auditAnzahl()).toBe(vorher);
    });
  });

  describe('Löschlauf (ANN-602)', () => {
    async function verlege(id: string, spalten: Record<string, string>): Promise<void> {
      const setzen = Object.entries(spalten)
        .map(([spalte, wert]) => `${spalte} = ${wert}`)
        .join(', ');
      await asPostgres(`update public.staff_reimbursements set ${setzen} where id = $1`, [id]);
    }

    it('löscht ausgezahlte acht Jahre nach Ende des Jahres der Auszahlung, mit Belegen und Journal', async () => {
      await kontoHinterlegen(users.therapist, IBAN.anna);
      const v = await beleg(users.therapist);
      const alt = (
        await einkauf(users.therapist, [
          { receipt_id: v.receipt_id, amount_cents: 1290, purpose: 'Massageöl' },
        ])
      ).id;
      const jung = (await strom(users.therapist, await monat(1))).id;
      for (const id of [alt, jung]) {
        await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
        await asUserCommitted(users.ownerTherapist, AUSGEZAHLT, [id]);
      }
      // Ausgezahlt vor neun Jahren: fällig. Vor sieben Jahren: nicht.
      await verlege(alt, { paid_at: "now() - interval '9 years'" });
      await verlege(jung, { paid_at: "now() - interval '7 years'" });

      await asPostgres('select public.apply_retention()');
      const { rows } = await asPostgres<{ id: string }>(
        'select id from public.staff_reimbursements order by id',
      );
      expect(rows.map((r) => r.id)).toEqual([jung]);
      expect(
        (
          await asPostgres('select 1 from public.staff_reimbursement_receipts where id = $1', [
            v.receipt_id,
          ])
        ).rows,
      ).toEqual([]);
      expect(await auftraege()).toEqual([v.object_key]);
      const { rows: journal } = await asPostgres<{ target_id: string; retention_class: string }>(
        `select target_id, retention_class from public.deletion_journal
          where target_table = 'staff_reimbursements'`,
      );
      expect(journal).toEqual([{ target_id: alt, retention_class: 'erstattung' }]);
    });

    it('löscht abgelehnte und zurückgezogene nach einem Jahr, beantragte und genehmigte nie', async () => {
      await kontoHinterlegen(users.therapist, IBAN.anna);
      const abgelehnt = (await strom(users.therapist, await monat(1))).id;
      const zurueck = (await strom(users.therapist, await monat(2))).id;
      const beantragt = (await strom(users.therapist, await monat(3))).id;
      const genehmigt = (await strom(users.therapist, await monat(4))).id;
      await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [abgelehnt, false, 'Doppelt']);
      await asUserCommitted(users.therapist, ZURUECKZIEHEN, [zurueck]);
      await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [genehmigt, true, null]);
      await verlege(abgelehnt, { decided_at: "now() - interval '13 months'" });
      await verlege(zurueck, { withdrawn_at: "now() - interval '13 months'" });
      await verlege(beantragt, { requested_at: "now() - interval '20 years'" });
      await verlege(genehmigt, {
        requested_at: "now() - interval '20 years'",
        decided_at: "now() - interval '20 years'",
      });

      await asPostgres('select public.apply_retention()');
      const { rows } = await asPostgres<{ id: string }>(
        'select id from public.staff_reimbursements order by id',
      );
      expect(rows.map((r) => r.id).sort()).toEqual([beantragt, genehmigt].sort());
      const { rows: journal } = await asPostgres<{ retention_class: string }>(
        `select retention_class from public.deletion_journal
          where target_table = 'staff_reimbursements' order by retention_class`,
      );
      expect(journal.map((j) => j.retention_class)).toEqual(['erstattung_kurz', 'erstattung_kurz']);
    });

    it('löscht nach einer Wiederherstellung erneut', async () => {
      await kontoHinterlegen(users.therapist, IBAN.anna);
      const id = (await strom(users.therapist, await monat(1))).id;
      await asUserCommitted(users.therapist, ZURUECKZIEHEN, [id]);
      await verlege(id, { withdrawn_at: "now() - interval '13 months'" });
      const { rows: vorher } = await asPostgres<Record<string, unknown>>(
        'select * from public.staff_reimbursements where id = $1',
        [id],
      );
      await asPostgres('select public.apply_retention()');
      // Die Sicherung bringt die Zeile zurück.
      const zeile = vorher[0]!;
      const spalten = Object.keys(zeile);
      await asPostgres(
        `insert into public.staff_reimbursements (${spalten.join(', ')})
         select * from jsonb_populate_record(null::public.staff_reimbursements, $1::jsonb)`,
        [JSON.stringify(zeile)],
      );
      await asPostgres('select public.reapply_deletion_journal()');
      expect(
        (await asPostgres('select 1 from public.staff_reimbursements where id = $1', [id])).rows,
      ).toEqual([]);
    });
  });

  describe('Ablage und Löschaufträge (ADR-017 Punkte 8, 11, 25)', () => {
    /** Liest das Objekt mit der RLS des Kontos, wie die Storage-API beim Signieren. */
    async function signieren(konto: string, objectKey: string): Promise<number> {
      const { rows } = await asStorageApi<{ n: number }>(
        konto,
        'storage.object.sign',
        `select count(*)::integer as n from storage.objects
          where bucket_id = 'erstattungsbelege' and name = $1`,
        [objectKey],
      );
      return rows[0]!.n;
    }

    it('lässt nicht hochladen: nach 24 Stunden, aus einer anderen Praxis, als Patienten- oder Plattformkonto', async () => {
      const alt = await vorbereiten(users.therapist);
      await belegVor(alt.receipt_id, '25 hours');
      expect(await meldung(hochladen(users.therapist, alt))).toContain('row-level security');

      const v = await vorbereiten(users.therapist);
      const fremd = await fremdeOrganisation();
      for (const konto of [fremd.owner, users.patientMax, users.plattformTina, users.office]) {
        expect(await meldung(hochladen(konto, v)), konto).toContain('row-level security');
      }
      // Bestätigt ist bestätigt: kein zweites Objekt unter demselben Schlüssel.
      await hochladen(users.therapist, v);
      await asUserCommitted(users.therapist, BESTAETIGEN, [v.receipt_id]);
      expect(await meldung(hochladen(users.therapist, v))).not.toBe('kein Fehler');
    });

    it('kein Überschreiben und kein direktes Löschen am Objektspeicher', async () => {
      const v = await beleg(users.therapist);
      const { rows } = await asUser<{ id: string }>(
        users.therapist,
        `update storage.objects set metadata = jsonb_build_object('size', 1)
          where bucket_id = 'erstattungsbelege' and name = $1 returning id`,
        [v.object_key],
      ).catch(() => ({ rows: [] as { id: string }[] }));
      expect(rows).toEqual([]);
      // Ohne Löschauftrag löscht niemand das Objekt - auch owner nicht.
      for (const konto of [users.therapist, users.ownerTherapist]) {
        await asStorageApi(
          konto,
          'storage.object.delete',
          "delete from storage.objects where bucket_id = 'erstattungsbelege' and name = $1",
          [v.object_key],
        );
      }
      const { rows: objekt } = await asPostgres<{ size: string }>(
        `select metadata ->> 'size' as size from storage.objects
          where bucket_id = 'erstattungsbelege' and name = $1`,
        [v.object_key],
      );
      expect(objekt).toEqual([{ size: String(GROESSE) }]);
    });

    it('der Auftrag lässt sich ausführen und quittieren - nur owner, nur gegen die Löschfreigabe', async () => {
      const ENTFERNEN =
        "delete from storage.objects where bucket_id = 'erstattungsbelege' and name = $1 returning id";
      const OPERATION = 'storage.object.delete_many';
      const bleibt = await beleg(users.therapist);
      const v = await beleg(users.therapist);
      // Solange die Zeile steht, entfernt niemand das Objekt.
      expect(
        (await asStorageApi(users.ownerTherapist, OPERATION, ENTFERNEN, [bleibt.object_key])).rows,
      ).toEqual([]);

      await asUserCommitted(users.therapist, VERWERFEN, [v.receipt_id]);
      const { rows: offen } = await asUser<{ id: string; bucket_id: string }>(
        users.ownerTherapist,
        'select id, bucket_id from public.list_storage_deletion_orders()',
      );
      expect(offen.map((o) => o.bucket_id)).toEqual(['erstattungsbelege']);
      for (const konto of [users.therapist, users.ownerTherapist]) {
        expect(
          (await asStorageApi(konto, OPERATION, ENTFERNEN, [v.object_key])).rows,
          konto,
        ).toEqual([]);
      }
      const { rows: geholt } = await asUserCommitted(
        users.ownerTherapist,
        'select * from public.claim_storage_deletion_order($1::uuid)',
        [offen[0]!.id],
      );
      expect(geholt).toEqual([{ bucket_id: 'erstattungsbelege', object_key: v.object_key }]);
      // Auch mit offener Freigabe entfernt kein anderes Konto das Objekt.
      const fremd = await fremdeOrganisation();
      for (const konto of [fremd.owner, users.patientMax, users.plattformTina, users.office]) {
        expect(
          (await asStorageApi(konto, OPERATION, ENTFERNEN, [v.object_key])).rows,
          konto,
        ).toEqual([]);
      }
      // Die Löschfreigabe öffnet das Objekt nicht zum Ansehen.
      expect(await signieren(users.ownerTherapist, v.object_key)).toBe(0);
      expect(
        (await asStorageApi(users.ownerTherapist, OPERATION, ENTFERNEN, [v.object_key])).rows,
      ).toHaveLength(1);
      await asUserCommitted(
        users.ownerTherapist,
        'select public.receipt_storage_deletion_order($1::uuid)',
        [offen[0]!.id],
      );
      expect(await auftraege()).toEqual([]);
    });
  });

  describe('Lesefreigaben (ANN-052)', () => {
    async function signieren(konto: string, objectKey: string): Promise<number> {
      const { rows } = await asStorageApi<{ n: number }>(
        konto,
        'storage.object.sign',
        `select count(*)::integer as n from storage.objects
          where bucket_id = 'erstattungsbelege' and name = $1`,
        [objectKey],
      );
      return rows[0]!.n;
    }

    it('eine abgelaufene Freigabe öffnet nichts; das Aufräumen entfernt sie, und sie fällt mit dem Beleg', async () => {
      const v = await beleg(users.therapist);
      await asUserCommitted(users.therapist, VERWEIS, [v.receipt_id]);
      await asPostgres(
        `update public.staff_reimbursement_receipt_access_grants
            set created_at = now() - interval '1 minute', expires_at = now() - interval '30 seconds'`,
      );
      expect(await signieren(users.therapist, v.object_key)).toBe(0);
      // Beim nächsten Ausstellen fällt die abgelaufene weg.
      await asUserCommitted(users.therapist, VERWEIS, [v.receipt_id]);
      expect(
        (await asPostgres('select 1 from public.staff_reimbursement_receipt_access_grants')).rows,
      ).toHaveLength(1);
      // Ohne weiteres Ausstellen räumt der tägliche Lauf auf (§20).
      await asPostgres(
        `update public.staff_reimbursement_receipt_access_grants
            set created_at = now() - interval '1 minute', expires_at = now() - interval '30 seconds'`,
      );
      await asPostgres('select public.discard_stale_reimbursement_receipts()');
      expect(
        (await asPostgres('select 1 from public.staff_reimbursement_receipt_access_grants')).rows,
      ).toEqual([]);
      // Eine offene Freigabe fällt mit ihrem Beleg (cascade).
      await asUserCommitted(users.therapist, VERWEIS, [v.receipt_id]);
      await asUserCommitted(users.therapist, VERWERFEN, [v.receipt_id]);
      expect(
        (await asPostgres('select 1 from public.staff_reimbursement_receipt_access_grants')).rows,
      ).toEqual([]);
    });

    it('öffnet ein Objekt nur der Person mit ihrer eigenen Freigabe (Zweitreview Runde 2)', async () => {
      const v = await beleg(users.therapist);
      await asUserCommitted(users.therapist, VERWEIS, [v.receipt_id]);
      const fremd = await fremdeOrganisation();
      // Andere Praxis, Patienten- und Plattformkonto: nichts, auch mit Annas
      // offener Freigabe.
      expect(await signieren(fremd.owner, v.object_key)).toBe(0);
      expect(await signieren(users.patientMax, v.object_key)).toBe(0);
      expect(await signieren(users.plattformTina, v.object_key)).toBe(0);
      // Tim hat eine Freigabe für seinen eigenen Beleg - sie öffnet Annas nicht.
      const tim = await beleg(users.teamLead);
      await asUserCommitted(users.teamLead, VERWEIS, [tim.receipt_id]);
      expect(await signieren(users.teamLead, v.object_key)).toBe(0);
      expect(await signieren(users.teamLead, tim.object_key)).toBe(1);
      expect(await signieren(users.therapist, v.object_key)).toBe(1);
      // Freigaben stellen Patienten- und Plattformkonten gar nicht erst aus.
      expect(await code(asUser(users.patientMax, VERWEIS, [v.receipt_id]))).toBe('42501');
      expect(await code(asUser(users.plattformTina, VERWEIS, [v.receipt_id]))).toBe('42501');
    });
  });

  describe('Gleichzeitig (Zweitreview)', () => {
    it('ordnet keinen Beleg zu, der gleichzeitig verworfen wird - der Betrag bleibt gedeckt', async () => {
      await kontoHinterlegen(users.therapist, IBAN.anna);
      const v = await beleg(users.therapist);
      const fehler = await gleichzeitig(
        { konto: users.therapist, sql: VERWERFEN, params: [v.receipt_id] },
        {
          konto: users.therapist,
          sql: EINKAUF,
          params: [
            JSON.stringify([
              { receipt_id: v.receipt_id, amount_cents: 1290, purpose: 'Massageöl' },
            ]),
            null,
          ],
        },
      );
      expect(fehler?.message).toBe('receipt not found');
      expect((await asPostgres('select 1 from public.staff_reimbursements')).rows).toEqual([]);
    });

    it('bestätigt keinen Beleg, der gleichzeitig verworfen wird (Zweitreview Runde 2)', async () => {
      const v = await vorbereiten(users.therapist);
      await hochladen(users.therapist, v, GROESSE);
      const fehler = await gleichzeitig(
        { konto: users.therapist, sql: VERWERFEN, params: [v.receipt_id] },
        { konto: users.therapist, sql: BESTAETIGEN, params: [v.receipt_id] },
      );
      expect(fehler?.message).toBe('receipt not found');
      expect((await asPostgres('select 1 from public.staff_reimbursement_receipts')).rows).toEqual(
        [],
      );
    });
  });

  describe('Löschjournal der Belege (ADR-008 Punkt 8)', () => {
    it('führt verworfene, aufgeräumte und abgewiesene Belege und löscht sie nach einer Wiederherstellung erneut', async () => {
      const verworfen = await beleg(users.therapist);
      const alt = await beleg(users.therapist);
      const auchAlt = await beleg(users.therapist);
      const abgewiesen = await beleg(users.therapist);
      const sicherung = await asPostgres<Record<string, unknown>>(
        `select * from public.staff_reimbursement_receipts order by id`,
      );
      await asUserCommitted(users.therapist, VERWERFEN, [verworfen.receipt_id]);
      await belegVor(alt.receipt_id, '25 hours');
      await belegVor(auchAlt.receipt_id, '25 hours');
      await asPostgres('select public.discard_stale_reimbursement_receipts()');
      expect(await ergebnis(abgewiesen.receipt_id, false, true, true)).toBe('rejected');

      const { rows: journal } = await asPostgres<{ target_id: string; retention_class: string }>(
        `select target_id, retention_class from public.deletion_journal
          where target_table = 'staff_reimbursement_receipts' order by target_id`,
      );
      expect(journal).toEqual(
        [verworfen.receipt_id, alt.receipt_id, auchAlt.receipt_id, abgewiesen.receipt_id]
          .sort()
          .map((id) => ({ target_id: id, retention_class: 'erstattung' })),
      );
      // Von Hand und nach einem Befund tageweise (ANN-752); der tägliche Lauf mit einer Kennung.
      expect(
        await tageweise('staff_reimbursement_receipts', [
          verworfen.receipt_id,
          abgewiesen.receipt_id,
        ]),
      ).toEqual([true, true]);
      const { rows: laeufe } = await asPostgres<{ n: number }>(
        `select count(distinct run_id)::int as n from public.deletion_journal
          where target_id = any($1::uuid[])`,
        [[alt.receipt_id, auchAlt.receipt_id]],
      );
      expect(laeufe[0]!.n).toBe(1);

      // Die Sicherung bringt die Zeilen zurück - ohne den Wächter, wie ein Restore.
      await asPostgres(
        `insert into public.staff_reimbursement_receipts
           (id, organization_id, staff_member_id, mime_type, byte_size, checksum_sha256, status,
            confirmed_at, created_by, created_at)
         select (r ->> 'id')::uuid, (r ->> 'organization_id')::uuid, (r ->> 'staff_member_id')::uuid,
                r ->> 'mime_type', (r ->> 'byte_size')::bigint, r ->> 'checksum_sha256', r ->> 'status',
                (r ->> 'confirmed_at')::timestamptz, (r ->> 'created_by')::uuid, now()
           from jsonb_array_elements($1::jsonb) as r`,
        [JSON.stringify(sicherung.rows)],
      );
      await asPostgres('select public.reapply_deletion_journal()');
      expect((await asPostgres('select 1 from public.staff_reimbursement_receipts')).rows).toEqual(
        [],
      );
    });
  });

  describe('Abgleich (ADR-017 Punkt 27)', () => {
    it('findet verwaiste Objekte auch im Bucket der Belege', async () => {
      const v = await beleg(users.therapist);
      await asPostgres(
        `insert into storage.objects (bucket_id, name, metadata)
         values ('erstattungsbelege', $1, '{}'::jsonb)`,
        [`${organizationId}/${STAFF.anna}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`],
      );
      const { rows } = await asUser<{ n: number }>(
        users.ownerTherapist,
        'select public.count_orphaned_patient_file_objects() as n',
      );
      expect(rows[0]!.n).toBe(1);
      await asUserCommitted(users.ownerTherapist, 'select public.order_orphaned_object_deletion()');
      expect(await auftraege()).toEqual([
        `${organizationId}/${STAFF.anna}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      ]);
      expect((await auftraege()).includes(v.object_key)).toBe(false);
    });
  });
});
