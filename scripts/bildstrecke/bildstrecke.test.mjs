import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALTE_AKTENBEREICHE } from '@/features/patients/akte';
import { PLATTFORM_PFAD } from '@/features/platform/pfade';
import { KONTEN, PLATTFORMKONTEN } from '../testkonten.mjs';
import { AUSGENOMMEN, BEREICHE, ROUTEN } from './routen.mjs';
import { musterAlsAusdruck, routenmusterAusQuelle } from './routenquelle.mjs';
import { schreibanfrage } from './lesewaechter.mjs';
import { kontaktbogenHtml, kurzname, maskieren, vergleichHtml } from './kontaktbogen.mjs';

/**
 * Die Bildstrecke (scripts/bildstrecke.mjs) zeigt die ganze Anwendung nur,
 * wenn ihre Routenliste mit den Routentabellen mitwaechst. Diese Tests halten
 * das fest: Eine neue Seite ohne Eintrag in scripts/bildstrecke/routen.mjs
 * (oder ohne Grund in AUSGENOMMEN) macht `pnpm test` rot.
 */

const PRAXIS = routenmusterAusQuelle(readFileSync('src/routes/AuthenticatedRoutes.tsx', 'utf8'), {
  variablen: new Map([['alt', Object.keys(ALTE_AKTENBEREICHE)]]),
});
const PLATTFORM = routenmusterAusQuelle(
  readFileSync('src/features/platform/PlattformApp.tsx', 'utf8'),
  { konstanten: new Map([['PLATTFORM_PFAD', PLATTFORM_PFAD]]) },
);
const ERFASST = new Set(ROUTEN.map((route) => route.muster));
/** Eine Route je Muster - die Einsicht der Praxis (E-001) zählt für sich. */
const EINDEUTIG = new Set(
  ROUTEN.map((route) => (route.einsicht ? `${route.muster} (Einsicht)` : route.muster)),
);
const AUSNAHMEN = new Set(AUSGENOMMEN.map((eintrag) => eintrag.muster));

describe('Routenliste der Bildstrecke', () => {
  it('liest die Routentabellen vollständig (Plausibilität des Lesers)', () => {
    expect(PRAXIS.length).toBeGreaterThan(90);
    expect(PRAXIS).toContain('/patienten/:patientId/doku/befund');
    expect(PRAXIS).toContain('/patienten/:patientId/verlauf');
    expect(PLATTFORM).toContain(PLATTFORM_PFAD);
    expect(PLATTFORM).toContain(`${PLATTFORM_PFAD}/uebungen/einheit/:planId`);
  });

  it('jede Route der Praxis hat ein Bild oder einen Grund', () => {
    const fehlend = PRAXIS.filter((muster) => !ERFASST.has(muster) && !AUSNAHMEN.has(muster));
    expect(fehlend, 'in scripts/bildstrecke/routen.mjs ergänzen').toEqual([]);
  });

  it('jede Route der Patientenplattform hat ein Bild oder einen Grund', () => {
    const fehlend = PLATTFORM.filter((muster) => !ERFASST.has(muster) && !AUSNAHMEN.has(muster));
    expect(fehlend, 'in scripts/bildstrecke/routen.mjs ergänzen').toEqual([]);
  });

  it('nennt keine Route, die es nicht mehr gibt', () => {
    const vorhanden = new Set([...PRAXIS, ...PLATTFORM]);
    const veraltet = ROUTEN.filter((route) => !route.oeffentlich && !vorhanden.has(route.muster));
    expect(veraltet.map((route) => route.muster)).toEqual([]);
    for (const eintrag of AUSGENOMMEN) {
      expect(vorhanden.has(eintrag.muster), eintrag.muster).toBe(true);
      expect(eintrag.grund.length, eintrag.muster).toBeGreaterThan(10);
    }
  });

  it('jeder Pfad passt zu seinem Muster', () => {
    for (const route of ROUTEN.filter((r) => !r.oeffentlich)) {
      const pfad = new URL(route.pfad.replaceAll('{heute}', '2026-01-01'), 'http://x.invalid')
        .pathname;
      expect(pfad, route.muster).toMatch(musterAlsAusdruck(route.muster));
    }
  });

  it('Bereiche, Etiketten und Konten sind gültig, Muster eindeutig', () => {
    expect(EINDEUTIG.size).toBe(ROUTEN.length);
    for (const route of ROUTEN) {
      expect(BEREICHE, route.muster).toContain(route.bereich);
      expect(route.etikett.trim().length, route.muster).toBeGreaterThan(2);
      expect(route.konten.length, route.muster).toBeGreaterThan(0);
      for (const konto of route.konten) {
        expect(konto === 'ohne' || KONTEN.has(konto), `${route.muster}: ${konto}`).toBe(true);
      }
      // Plattformseiten nur mit Plattformkonten, Praxisseiten nie mit ihnen.
      const plattform = route.muster === PLATTFORM_PFAD || route.muster.startsWith('/p/');
      if (route.einsicht) {
        // E-001: Die Einsicht zeigt eine Plattformseite, und nur der
        // Praxisinhaber:in - nie einem Plattformkonto, nie einer anderen Rolle.
        expect(plattform, route.muster).toBe(true);
        expect(route.oeffentlich, route.muster).toBeUndefined();
        expect(route.konten, route.muster).toEqual(['owner']);
        continue;
      }
      for (const konto of route.konten) {
        if (route.oeffentlich) expect(konto, route.muster).toBe('ohne');
        else expect(PLATTFORMKONTEN.has(konto), `${route.muster}: ${konto}`).toBe(plattform);
      }
    }
    for (const bereich of BEREICHE) {
      expect(
        ROUTEN.some((route) => route.bereich === bereich),
        bereich,
      ).toBe(true);
    }
  });

  it('die Kern-Seiten haben ein Bild für Therapeut:innen (Termin, Doku, Tour, Übersicht)', () => {
    for (const muster of [
      '/',
      '/kalender',
      '/touren',
      '/termine/:appointmentId/abschluss',
      '/patienten/:patientId/doku',
    ]) {
      const route = ROUTEN.find((r) => r.muster === muster);
      expect(route?.konten, muster).toContain('therapist');
    }
  });
});

describe('routenmusterAusQuelle', () => {
  const quelle = `
    <Routes>
      <Route path="/" element={<Start onX={() => (a > b ? 1 : 2)} />} />
      {zeigen ? (
        <>
          <Route path="/akte/:id" element={<Rahmen user={{ a: 1 }} />}>
            <Route index element={<Einstieg />} />
            <Route path="teil" element={<Teil />} />
            {LISTE.map((alt) => (
              <Route key={alt} path={alt} element={<Alt alt={alt} />} />
            ))}
          </Route>
        </>
      ) : null}
      <Route path={\`\${BASIS}/x\`} element={<X />} />
      <Route path={BASIS} element={<Y />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>`;

  it('verbindet verschachtelte Routen, index, Vorlagen und Laufvariablen', () => {
    expect(
      routenmusterAusQuelle(quelle, {
        konstanten: new Map([['BASIS', '/p']]),
        variablen: new Map([['alt', ['a', 'b']]]),
      }),
    ).toEqual([
      '/',
      '/akte/:id',
      '/akte/:id/teil',
      '/akte/:id/a',
      '/akte/:id/b',
      '/p/x',
      '/p',
      '*',
    ]);
  });

  it('meldet eine unbekannte Pfadform, statt sie still zu übergehen', () => {
    expect(() => routenmusterAusQuelle('<Route path={pfade[0]} element={<X />} />')).toThrow(
      /Unbekannte Pfadform/,
    );
    expect(() => routenmusterAusQuelle('<Route path={UNBEKANNT} element={<X />} />')).toThrow(
      /Unbekannter Ausdruck/,
    );
  });

  it('musterAlsAusdruck setzt Parameter ein und maskiert den Rest', () => {
    expect('/akte/123/teil').toMatch(musterAlsAusdruck('/akte/:id/teil'));
    expect('/akte/123/teil/mehr').not.toMatch(musterAlsAusdruck('/akte/:id/teil'));
    expect('/').toMatch(musterAlsAusdruck('/'));
  });
});

describe('Lesewächter', () => {
  const api = 'http://127.0.0.1:54321';

  it('lässt Lesen und die Anmeldung durch', () => {
    expect(schreibanfrage('GET', `${api}/rest/v1/tasks?select=*`)).toBeNull();
    expect(schreibanfrage('POST', `${api}/rest/v1/rpc/list_appointments`)).toBeNull();
    expect(schreibanfrage('POST', `${api}/rest/v1/rpc/platform_context`)).toBeNull();
    expect(schreibanfrage('POST', `${api}/rest/v1/rpc/log_patient_record_view`)).toBeNull();
    expect(schreibanfrage('POST', `${api}/rest/v1/rpc/notification_kind_switches`)).toBeNull();
    expect(schreibanfrage('POST', `${api}/rest/v1/rpc/reimbursement_payout_details`)).toBeNull();
    expect(schreibanfrage('POST', `${api}/auth/v1/token?grant_type=password`)).toBeNull();
    expect(schreibanfrage('POST', `${api}/storage/v1/object/sign/patient-files/a.png`)).toBeNull();
    expect(schreibanfrage('POST', `${api}/functions/v1/location-provider`)).toBeNull();
    // Der Entwicklungsserver der Anwendung ist nicht gemeint.
    expect(schreibanfrage('POST', 'http://127.0.0.1:5190/@vite/client')).toBeNull();
  });

  it('hält Schreiben an', () => {
    expect(schreibanfrage('POST', `${api}/rest/v1/rpc/create_task`)).toBe('rpc create_task');
    expect(schreibanfrage('POST', `${api}/rest/v1/rpc/save_treatment_note`)).toBe(
      'rpc save_treatment_note',
    );
    expect(schreibanfrage('POST', `${api}/rest/v1/rpc/platform_accesses_take_back_deletion`)).toBe(
      'rpc platform_accesses_take_back_deletion',
    );
    expect(schreibanfrage('PATCH', `${api}/rest/v1/tasks?id=eq.1`)).toBe('PATCH /rest/v1/tasks');
    expect(schreibanfrage('POST', `${api}/storage/v1/object/patient-files/a.png`)).toBe(
      'POST /storage/v1/object/patient-files/a.png',
    );
    expect(schreibanfrage('POST', `${api}/functions/v1/notifications`)).toBe(
      'POST /functions/v1/notifications',
    );
    expect(schreibanfrage('POST', `${api}/auth/v1/logout`)).toBe('POST /auth/v1/logout');
    expect(schreibanfrage('POST', `${api}/rest/v1/rpc/log_therapy_report_export`)).toBe(
      'rpc log_therapy_report_export',
    );
  });
});

describe('Kontaktbogen', () => {
  const bild = (teil) => ({
    muster: '/abrechnung',
    pfad: '/abrechnung',
    bereich: 'Abrechnung',
    etikett: 'Rechnungen <alt>',
    konto: 'owner',
    breite: 375,
    datei: 'abrechnung--abrechnung--owner--375.png',
    ziel: '/abrechnung',
    hoehe: 900,
    befunde: [],
    hinweise: [],
    ...teil,
  });

  it('maskiert und bildet Kurznamen', () => {
    expect(maskieren('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    expect(kurzname('Übungen und Training')).toBe('uebungen-und-training');
    expect(kurzname('/patienten/:patientId')).toBe('patienten-patientid');
  });

  it('gruppiert nach Bereich, stellt beide Breiten nebeneinander und markiert Befunde', () => {
    const html = kontaktbogenHtml({
      breiten: [375, 1280],
      bilder: [
        bild({}),
        bild({ breite: 1280, datei: 'b.png', befunde: [{ art: 'querscroll', text: '12 px' }] }),
        bild({ muster: '/', pfad: '/', bereich: 'Übersicht und Rahmen', etikett: 'Übersicht' }),
      ],
    });
    expect(html.indexOf('id="uebersicht-und-rahmen"')).toBeLessThan(
      html.indexOf('id="abrechnung"'),
    );
    expect(html).toContain('Rechnungen &lt;alt&gt;');
    expect(html).not.toContain('Rechnungen <alt>');
    expect(html).toContain('class="zeile befund"');
    expect(html).toContain('Querscrollen: 12 px');
    expect(html).toContain('src="b.png"');
  });

  it('der Vergleich zeigt neue und behobene Befunde und verweist auf den Vorher-Ordner', () => {
    const vorher = { commit: 'aaa', bilder: [bild({ befunde: [{ art: 'leer', text: '0' }] })] };
    const nachher = {
      commit: 'bbb',
      breiten: [375],
      bilder: [bild({ befunde: [{ art: 'konsole', text: 'Fehler' }] })],
    };
    const html = vergleichHtml(vorher, nachher, '../vorher');
    expect(html).toContain('src="../vorher/abrechnung--abrechnung--owner--375.png"');
    expect(html).toContain('1 neue Befunde · 1 behoben');
    expect(html).toContain('class="behoben"');
  });

  it('ein Teillauf vergleicht nur, was er aufgenommen hat', () => {
    const anderes = bild({ muster: '/', pfad: '/', bereich: 'Übersicht und Rahmen', etikett: 'X' });
    const vorher = { bilder: [bild({}), { ...anderes, befunde: [{ art: 'leer', text: '0' }] }] };
    const voll = { breiten: [375], bilder: [bild({})] };
    const teil = { ...voll, auswahl: { nur: ['abrechnung'], konten: [], breiten: [] } };
    expect(vergleichHtml(vorher, voll, 'v')).toContain('nachher nicht aufgenommen');
    expect(vergleichHtml(vorher, voll, 'v')).toContain('0 neue Befunde · 0 behoben');
    expect(vergleichHtml(vorher, teil, 'v')).not.toContain('nachher nicht aufgenommen');
  });
});
