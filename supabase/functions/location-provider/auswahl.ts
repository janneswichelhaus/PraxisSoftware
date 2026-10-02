/**
 * Welcher Adapter antwortet (MAP-003a).
 *
 * Die Wahl hängt an einem Secret, nicht an einem Schalter in der Oberfläche:
 * `LOCATION_PROVIDER=ptv` spricht den Anbieter an, `LOCATION_PROVIDER=mock`
 * die Nachbildung. Beides wird beim Start gelesen.
 *
 * **Alles andere ist „nicht eingerichtet" (`null`), nie stillschweigend die
 * Nachbildung** (ANN-090). Eine Nachbildung, die einspringt, weil ein Secret
 * fehlt oder falsch geschrieben ist, sähe auf der Karte aus wie eine Route —
 * und niemand erführe, dass die Einrichtung unvollständig ist.
 */

import { erstelleNachbildung } from './mock.ts';
import { erstellePtvAdapter } from './ptv.ts';
import type { Anbieteradapter } from './typen.ts';

/** Nur die Felder, die diese Function tatsächlich liest. */
export interface Umgebung {
  readonly LOCATION_PROVIDER?: string | undefined;
  readonly PTV_API_KEY?: string | undefined;
  readonly LOCATION_DATA_GATE?: string | undefined;
  /** ADR-019 Punkt 36: `development`, `test` oder `production`. */
  readonly APP_ENVIRONMENT?: string | undefined;
}

export type Umgebungsart = 'development' | 'test' | 'production';

/**
 * Welche Umgebung das ist — **ohne Angabe oder mit unbekannter Angabe die
 * Produktion** (ADR-019 Punkt 36, ANN-094 Fassung 3). Wer das Secret vergisst,
 * bekommt die strengere Regel, nicht die bequemere.
 */
export function umgebungsart(wert: string | undefined): Umgebungsart {
  const art = (wert ?? '').trim().toLowerCase();
  return art === 'development' || art === 'test' ? art : 'production';
}

/**
 * Der Umschalter aus ADR-019 Punkt 25 — **ANN-094**.
 *
 * Ein echter Anbieter antwortet nur, wenn die Umgebung ausdrücklich sagt,
 * welche Adressen sie trägt: `synthetic` für Entwicklungs- und
 * Test-Umgebungen, die nach §3.1 nur synthetische Daten kennen, `released`
 * erst nach dem Gate aus ADR-019 Punkt 9 (Vertrag, §203, DSFA,
 * Edge Runtime). Fehlt der Wert oder ist er falsch geschrieben, gilt der
 * Anbieter als nicht eingerichtet — der Schalter steht zu, bis ihn jemand
 * bewusst öffnet. `released` in einer Umgebung mit echten Daten zu setzen
 * ist eine Go-live-Vorbedingung (ADR-007 Punkt 5), kein Konfigurationsdetail.
 *
 * Die Nachbildung braucht den Schalter nicht: Sie schickt nichts hinaus.
 * Seit ADR-019 Fassung 5 (Punkt 36) gilt beides nur außerhalb der Produktion.
 */
export const DATENFREIGABEN = ['synthetic', 'released'] as const;

/** Was die Function aus ihren Secrets macht. */
export interface Einrichtung {
  /** `null`: nicht eingerichtet oder vom Schalter abgewiesen. */
  readonly adapter: Anbieteradapter | null;
  /** Darf die Karte Kacheln laden (ADR-019 Punkt 35)? */
  readonly kartenFreigegeben: boolean;
  /** Hat der Schalter in der Produktion abgewiesen (`gate_rejected`, Punkt 36)? */
  readonly gateAbgewiesen: boolean;
}

/**
 * Adapter und Schalter in einem (ADR-019 Punkte 35 und 36).
 *
 * **Ein Schalter für beide Wege.** Offen ist er mit `released` oder mit
 * `synthetic` außerhalb der Produktion; nur dann laden die Kacheln, und nur
 * dann spricht der Anbieter. **In der Produktion gilt nur `released`:**
 * `synthetic` und die Nachbildung sind dort technisch ausgeschlossen, nicht
 * nur per Konvention — beide antworten `not_configured`, und das Log trägt
 * `gate_rejected`.
 */
export function richteEin(umgebung: Umgebung): Einrichtung {
  const anbieter = (umgebung.LOCATION_PROVIDER ?? '').trim().toLowerCase();
  const schluessel = (umgebung.PTV_API_KEY ?? '').trim();
  const freigabe = (umgebung.LOCATION_DATA_GATE ?? '').trim().toLowerCase();
  const produktion = umgebungsart(umgebung.APP_ENVIRONMENT) === 'production';
  const gueltig = (DATENFREIGABEN as readonly string[]).includes(freigabe);
  const kartenFreigegeben = freigabe === 'released' || (freigabe === 'synthetic' && !produktion);
  const nicht = (gateAbgewiesen: boolean): Einrichtung => ({
    adapter: null,
    kartenFreigegeben,
    gateAbgewiesen,
  });

  if (anbieter === 'mock') {
    return produktion
      ? nicht(true)
      : { adapter: erstelleNachbildung(), kartenFreigegeben, gateAbgewiesen: false };
  }
  if (!gueltig) return nicht(false);
  if (produktion && freigabe !== 'released') return nicht(true);
  // Der Anbieter ohne Schlüssel ist keine halbe Einrichtung, sondern keine:
  // Jeder Aufruf endete beim Anbieter mit 401.
  if (anbieter === 'ptv' && schluessel !== '') {
    return {
      adapter: erstellePtvAdapter({ apiKey: schluessel }),
      kartenFreigegeben,
      gateAbgewiesen: false,
    };
  }
  return nicht(false);
}

export function waehleAdapter(umgebung: Umgebung): Anbieteradapter | null {
  return richteEin(umgebung).adapter;
}
