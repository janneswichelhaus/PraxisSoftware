import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BETRIEBSLOG_FRIST_TAGE,
  ENTFERNT,
  protokolliereFehler,
  protokolliereWarnung,
  redigiere,
} from './protokoll';

/**
 * Die Verbotsliste aus ADR-011 Punkt 2, zur Laufzeit geprüft (OPS-004).
 *
 * Der ADR sagt über seine eigene Liste: „Die Verbotsliste ist bewusst konkret
 * und damit prüfbar. Sie lässt sich als automatisierter Test formulieren, der
 * gegen erzeugte Logausgaben läuft, statt nur als Vorsatz zu existieren."
 * Genau das steht hier — und zwar so, dass der **ADR** die Liste führt und
 * nicht dieser Test: Die Punkte werden aus `ADR-011` gelesen, nicht
 * abgeschrieben. Eine zweite Fassung der Liste im Quelltext wäre die Stelle,
 * an der beide auseinanderlaufen, ohne dass es jemand merkt.
 *
 * Zu jedem Punkt gehört eine **synthetische** Probe (§3.1: echte Daten
 * nirgends, auch nicht in Tests). Die Zuordnung unten muss die Liste des ADR
 * vollständig treffen — in beide Richtungen. Bekommt der ADR einen zwölften
 * Punkt, wird dieser Test rot, bis jemand eine Probe dafür hinterlegt; das ist
 * beabsichtigt und der Unterschied zwischen einer geprüften und einer
 * behaupteten Liste.
 */

const ADR = join(process.cwd(), 'docs/adr/ADR-011-logging-and-observability.md');
const adrtext = readFileSync(ADR, 'utf8');

/** Liest die Aufzählung unter „Operational Logs DÜRFEN NICHT enthalten". */
function verbotsliste(): string[] {
  const ueberschrift = '**Operational Logs DÜRFEN NICHT enthalten:**';
  const ab = adrtext.indexOf(ueberschrift);
  if (ab === -1) {
    throw new Error(
      `ADR-011: "${ueberschrift}" fehlt — die Verbotsliste hat ihren Anker verloren.`,
    );
  }
  const punkte: string[] = [];
  for (const zeile of adrtext
    .slice(ab + ueberschrift.length)
    .split('\n')
    .slice(1)) {
    const treffer = /^\s+-\s+(.+?)\s*$/.exec(zeile);
    if (!treffer) break;
    punkte.push(treffer[1]!);
  }
  if (punkte.length === 0) throw new Error('ADR-011: die Verbotsliste ist leer.');
  return punkte;
}

/**
 * Zu jedem Punkt des ADR eine erfundene Probe.
 *
 * Alle Angaben sind frei erfunden: Der Name gehört niemandem, die Adresse
 * keiner Wohnung, das Kennwort keinem Konto. Das ist keine Formalie — §3.1
 * verbietet echte Patientendaten ausdrücklich auch dort, wo sie nur als
 * Testeingabe dienen.
 */
const PROBEN: Record<string, string> = {
  Patientennamen: 'Marlene Kaltenbrunner',
  Adressen: 'Ahornweg 12, 50823 Musterstadt',
  Diagnosen: 'M54.5 Kreuzschmerz',
  Anamnese: 'seit drei Wochen Schmerzen beim Buecken',
  'klinischen Freitext': 'Palpation paravertebral L4/L5 druckdolent',
  'vollständige KI-Prompts oder KI-Outputs': 'Fasse die Anamnese zusammen und nenne Red Flags',
  Passwörter: 'Sommerwiese2026',
  'Auth-Tokens': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.tPqRwXyZ',
  Cookies: 'sb-access-token=abc123; Path=/; HttpOnly',
  'Authorization Header': 'Bearer eyJhbGciOiJIUzI1NiJ9',
  'sonstige unnötige personenbezogene Inhalte': 'geboren 14.03.1979, Telefon 0221 5550187',
};

const liste = verbotsliste();

describe('Verbotsliste aus ADR-011', () => {
  it('wird vollstaendig aus dem ADR gelesen', () => {
    // Elf Punkte hat die Fassung vom 2026-08-28. Die Zahl steht hier, damit
    // ein stilles Wegfallen auffaellt - ein kuerzer gewordener Filter, den
    // niemand bemerkt, waere der schlechteste Ausgang dieser Pruefung.
    expect(liste).toHaveLength(11);
  });

  it('hat zu jedem Punkt eine Probe und keine Probe zu viel', () => {
    expect([...liste].sort()).toEqual(Object.keys(PROBEN).sort());
  });

  it.each(liste)('%s ueberlebt die Redaction an keiner Stelle', (punkt) => {
    const probe = PROBEN[punkt]!;
    const ausgaben = [
      redigiere({ ereignis: probe }),
      redigiere({ ereignis: 'akte.gelesen', ids: { wert: probe } }),
      redigiere({ ereignis: 'akte.gelesen', werte: { wert: probe } }),
      redigiere({ ereignis: 'akte.gelesen', ids: { [probe]: probe } }),
    ];

    for (const ausgabe of ausgaben) {
      expect(ausgabe).not.toContain(probe);
      // Nicht nur die ganze Probe, auch jedes Bruchstueck: Eine Redaction, die
      // "Marlene Kaltenbrunner" auf "Marlene" kuerzt, hat nichts geschuetzt.
      for (const bruchstueck of probe.split(/[\s,;:/.=]+/).filter((t) => t.length >= 3)) {
        expect(ausgabe, `Bruchstueck "${bruchstueck}" steht noch in "${ausgabe}".`).not.toContain(
          bruchstueck,
        );
      }
    }
  });
});

describe('Erlaubnisliste', () => {
  it('laesst einen festen Bezeichner durch', () => {
    expect(redigiere({ ereignis: 'auth.abmeldung_fehlgeschlagen' })).toBe(
      'auth.abmeldung_fehlgeschlagen',
    );
  });

  it('laesst interne UUIDs und Zahlen durch', () => {
    const ausgabe = redigiere({
      ereignis: 'karte.route_fehlgeschlagen',
      ids: { anfrage: '3f6b1c2e-9d84-4a71-8c53-0b7e2a9f4d16' },
      werte: { dauer_ms: 1234 },
    });
    expect(ausgabe).toBe(
      'karte.route_fehlgeschlagen anfrage=3f6b1c2e-9d84-4a71-8c53-0b7e2a9f4d16 dauer_ms=1234',
    );
  });

  it('entfernt einen Bezeichner mit eingesetztem Wert', () => {
    // Der haeufigste Weg, wie Nutzdaten in ein Log geraten: eine Vorlage, in
    // die jemand eine Variable schreibt. Das Muster kennt keine Leerzeichen.
    expect(redigiere({ ereignis: 'Akte von Marlene nicht lesbar' })).toBe(ENTFERNT);
  });

  it('entfernt eine ID, die keine ist', () => {
    expect(redigiere({ ereignis: 'akte.gelesen', ids: { patient: 'Marlene' } })).toBe(
      `akte.gelesen patient=${ENTFERNT}`,
    );
  });

  it('entfernt eine Zahl, die keine ist', () => {
    expect(redigiere({ ereignis: 'akte.gelesen', werte: { dauer_ms: Number.NaN } })).toBe(
      `akte.gelesen dauer_ms=${ENTFERNT}`,
    );
  });

  it('entfernt ein Geheimnis auch dann, wenn es wie eine UUID aussieht', () => {
    // Die Erlaubnisliste allein traegt hier nicht: Manche Sitzungsschluessel
    // sind UUIDs. Deshalb prueft das Modul zusaetzlich den Namen, den der
    // Quelltext vergibt - ADR-011 Punkt 2 nennt Tokens und Cookies eigens.
    const ausgabe = redigiere({
      ereignis: 'auth.sitzung_abgelaufen',
      ids: { token: '3f6b1c2e-9d84-4a71-8c53-0b7e2a9f4d16' },
    });
    expect(ausgabe).toBe(`auth.sitzung_abgelaufen ${ENTFERNT}=${ENTFERNT}`);
  });

  it.each(['passwort', 'kennwort', 'authToken', 'cookie', 'authorization', 'apiKey', 'sessionId'])(
    'entfernt den Schluessel %s vollstaendig',
    (schluessel) => {
      const ausgabe = redigiere({ ereignis: 'auth.fehler', ids: { [schluessel]: 'egal' } });
      expect(ausgabe).toBe(`auth.fehler ${ENTFERNT}=${ENTFERNT}`);
    },
  );
});

describe('Ausgabe', () => {
  it('schreibt den redigierten Satz auf die Fehlerkonsole', () => {
    const spion = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    protokolliereFehler({ ereignis: 'akte.gelesen', ids: { patient: 'Marlene' } });
    expect(spion).toHaveBeenCalledWith(`akte.gelesen patient=${ENTFERNT}`);
    spion.mockRestore();
  });

  it('schreibt eine Warnung auf die Warnkonsole', () => {
    const spion = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    protokolliereWarnung({ ereignis: 'karte.langsam', werte: { dauer_ms: 9000 } });
    expect(spion).toHaveBeenCalledWith('karte.langsam dauer_ms=9000');
    spion.mockRestore();
  });
});

describe('Frist', () => {
  it('nennt dieselbe Zahl wie die Tabelle in ADR-011', () => {
    const zeile = /\|\s*Operational Logs\s*\|\s*(\d+)\s*Tage\s*\|/.exec(adrtext);
    expect(zeile?.[1], 'ADR-011 Punkt 4: Zeile "Operational Logs" nicht gefunden.').toBeDefined();
    expect(Number(zeile?.[1])).toBe(BETRIEBSLOG_FRIST_TAGE);
  });
});
