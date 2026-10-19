import { createContext, useContext } from 'react';
import * as api from './api';
import type { Verbindung } from './api';

/**
 * Die Einsicht der Praxis in die Plattform einer Person (E-001, DSN-001 D7,
 * Befund B11): „So sieht … die Plattform", nur lesend.
 *
 * Die Plattform selbst weiß nichts von Rollen der Praxis. Die Praxisseite
 * (`features/platform-access`) gibt ihr eine **Quelle** mit, die eine
 * Projektion über den Verteiler `platform_preview` liest; daraus entsteht hier
 * einmal eine eigene Fassung der Plattformfunktionen (`einsichtsApi`). Die
 * Seiten holen sie über `usePlattformApi()` - ohne Einsicht ist das schlicht
 * dieses Modul, so wie bisher. Es gibt keinen Schalter im Modul und keinen
 * Zustand außerhalb von React: Die echte Plattform einer Person bekommt nie
 * etwas anderes als `./api`.
 *
 * Lesend sind nur die Projektionen aus `EINSICHT_LESEN`, für genau den einen
 * Zugang. Jeder andere Weg wirft, bevor etwas das Gerät verlässt. Verbindlich
 * ist der Server: Er ruft nur seine feste Liste und schaltet die Transaktion
 * auf nur lesend.
 */

/** Der eine Satz, mit dem in der Einsicht jeder schreibende Weg endet. */
export const IN_DER_EINSICHT = 'In der Einsicht wird nichts geändert.';

/**
 * ANN-307: Die Übungstage sieht nur die Person - der Server liefert sie der
 * Einsicht leer. Statt „keine Tage" steht unter „Termine“ dieser Satz; unter
 * „Übungen“ fehlen die Tage ohne ihn (die Leiste sagt „nur lesen“).
 */
export const TAGE_NUR_DIE_PERSON = 'Die Übungstage sieht nur die Person.';

/**
 * Die Projektionen, die die Einsicht liest - dieselbe Liste wie
 * `app.platform_preview_functions()` am Server; den Kontext lädt die
 * Praxisseite selbst. Was hier fehlt, liest die Einsicht nicht.
 */
export const EINSICHT_LESEN: readonly string[] = [
  'platform_onboarding',
  'platform_appointments',
  'platform_appointment_requests',
  'platform_questionnaire',
  'platform_invoices',
  'platform_invoice',
  'platform_files',
  'platform_consents',
  'platform_representatives',
  'platform_aftercare',
  'platform_training_offer',
  'platform_training_contract',
  'platform_training_packages',
  'platform_training_offers',
  'platform_exercise_plans',
  'platform_messages',
  'platform_checkins',
  'platform_habits',
];

/**
 * Liest eine Projektion für die Einsicht - eingespeist von der Praxisseite.
 * Die Kennung des Zugangs kennt die Quelle selbst; `argumente` sind die
 * übrigen Werte des Aufrufs (etwa `p_invoice_id`).
 */
export type Einsichtsquelle = (
  funktion: string,
  argumente: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

/** Die Verbindung der Einsicht: nur die feste Liste, nur dieser eine Zugang. */
export function einsichtsVerbindung(zugangId: string, quelle: Einsichtsquelle): Verbindung {
  return {
    rpc: async (funktion, argumente) => {
      const { p_access_id: zugang, ...rest } = argumente;
      if (zugang !== zugangId || !EINSICHT_LESEN.includes(funktion)) {
        throw new Error(IN_DER_EINSICHT);
      }
      return quelle(funktion, rest);
    },
  };
}

/** Was die Seiten der Plattform vom Server wollen - lesend und schreibend. */
export type PlattformApi = Pick<
  typeof api,
  | 'ueberallAbmelden'
  | 'ladeMeineVertretungen'
  | 'begleitungBeenden'
  | 'ladeTermine'
  | 'ladeWuensche'
  | 'terminWuenschen'
  | 'wunschZurueckziehen'
  | 'terminAendernWuenschen'
  | 'ladeBefundbogen'
  | 'befundbogenSpeichern'
  | 'befundbogenAbsenden'
  | 'befundbogenVerwerfen'
  | 'ladeRechnungen'
  | 'ladeRechnung'
  | 'ladeDokumente'
  | 'ladeDokumentZumAnzeigen'
  | 'ladeDokumentHerunter'
  | 'ladeEinwilligungen'
  | 'einwilligungSchreiben'
  | 'ladeMeinePakete'
  | 'ladeAngebote'
  | 'ladeDatenexport'
  | 'ladeEinstieg'
  | 'einstiegBeenden'
  | 'ladeAbo'
  | 'aboKuendigen'
  | 'ladeTrainingsangebot'
  | 'angebotAnnehmen'
  | 'ladeVertrag'
  | 'vertragWiderrufen'
  | 'ladePlaene'
  | 'einheitUebertragen'
  | 'uebungstageSetzen'
  | 'ladeNachrichten'
  | 'nachrichtStellen'
  | 'nachrichtNachtragen'
  | 'nachrichtErledigen'
  | 'anhangSenden'
  | 'ladeAnhang'
  | 'anhangLoeschen'
  | 'ladeBenachrichtigungen'
  | 'speichereBenachrichtigungen'
  | 'registriereGeraet'
  | 'entferneGeraet'
  | 'ladeCheckins'
  | 'checkinAbsenden'
  | 'ladeGewohnheiten'
  | 'gewohnheitVermerken'
  | 'gewohnheitPausieren'
  | 'ladeErnaehrung'
  | 'ernaehrungGewichtEintragen'
  | 'ernaehrungZielgewichtSetzen'
  | 'ernaehrungTagebuchSchalten'
  | 'ernaehrungEinwilligen'
  | 'lebensmittelSuchen'
  | 'lebensmittelQuellen'
  | 'eigenesLebensmittelSpeichern'
  | 'eigenesLebensmittelLoeschen'
  | 'ladeTagebuch'
  | 'tagebuchEintragen'
  | 'tagebuchAendern'
  | 'tagebuchLoeschen'
  | 'wasserZaehlen'
>;

/** Endet jeden schreibenden Weg der Einsicht - ohne Netz, ohne Vorarbeit. */
function gesperrt(): Promise<never> {
  return Promise.reject(new Error(IN_DER_EINSICHT));
}

/**
 * Die Plattformfunktionen der Einsicht. Lesen geht über die Quelle,
 * Schreiben, Öffnen von Dokumenten und Anhängen (ANN-527), Export und alles
 * am Gerät der Person werfen sofort.
 */
export function einsichtsApi(zugangId: string, quelle: Einsichtsquelle): PlattformApi {
  const v = einsichtsVerbindung(zugangId, quelle);
  return {
    ladeMeineVertretungen: (id) => api.ladeMeineVertretungen(id, v),
    ladeTermine: (id) => api.ladeTermine(id, v),
    ladeWuensche: (id) => api.ladeWuensche(id, v),
    ladeBefundbogen: (id) => api.ladeBefundbogen(id, v),
    ladeRechnungen: (id) => api.ladeRechnungen(id, v),
    ladeRechnung: (id, rechnungId) => api.ladeRechnung(id, rechnungId, v),
    ladeDokumente: (id) => api.ladeDokumente(id, v),
    ladeEinwilligungen: (id) => api.ladeEinwilligungen(id, v),
    ladeMeinePakete: (id) => api.ladeMeinePakete(id, v),
    ladeAngebote: (id) => api.ladeAngebote(id, v),
    ladeEinstieg: (id) => api.ladeEinstieg(id, v),
    ladeAbo: (id) => api.ladeAbo(id, v),
    ladeTrainingsangebot: (id) => api.ladeTrainingsangebot(id, v),
    ladeVertrag: (id) => api.ladeVertrag(id, v),
    ladePlaene: (id) => api.ladePlaene(id, v),
    ladeNachrichten: (id) => api.ladeNachrichten(id, v),
    ladeCheckins: (id) => api.ladeCheckins(id, v),
    ladeGewohnheiten: (id) => api.ladeGewohnheiten(id, v),
    ueberallAbmelden: gesperrt,
    begleitungBeenden: gesperrt,
    terminWuenschen: gesperrt,
    wunschZurueckziehen: gesperrt,
    terminAendernWuenschen: gesperrt,
    befundbogenSpeichern: gesperrt,
    befundbogenAbsenden: gesperrt,
    befundbogenVerwerfen: gesperrt,
    ladeDokumentZumAnzeigen: gesperrt,
    ladeDokumentHerunter: gesperrt,
    einwilligungSchreiben: gesperrt,
    ladeDatenexport: gesperrt,
    einstiegBeenden: gesperrt,
    aboKuendigen: gesperrt,
    angebotAnnehmen: gesperrt,
    vertragWiderrufen: gesperrt,
    einheitUebertragen: gesperrt,
    uebungstageSetzen: gesperrt,
    nachrichtStellen: gesperrt,
    nachrichtNachtragen: gesperrt,
    nachrichtErledigen: gesperrt,
    anhangSenden: gesperrt,
    ladeAnhang: gesperrt,
    anhangLoeschen: gesperrt,
    ladeBenachrichtigungen: gesperrt,
    speichereBenachrichtigungen: gesperrt,
    registriereGeraet: gesperrt,
    entferneGeraet: gesperrt,
    checkinAbsenden: gesperrt,
    gewohnheitVermerken: gesperrt,
    gewohnheitPausieren: gesperrt,
    // ERN-002: Die Ernährung liest die Einsicht nicht - in der Praxis liest
    // sie nur die Beratung (ADR-027 Punkt 4), und das an ihrem eigenen Ort.
    ladeErnaehrung: gesperrt,
    ernaehrungGewichtEintragen: gesperrt,
    ernaehrungZielgewichtSetzen: gesperrt,
    ernaehrungTagebuchSchalten: gesperrt,
    ernaehrungEinwilligen: gesperrt,
    // ERN-EPIC-002: ebenso die Lebensmittel - die Seite liegt unter der Ernährung.
    lebensmittelSuchen: gesperrt,
    lebensmittelQuellen: gesperrt,
    eigenesLebensmittelSpeichern: gesperrt,
    eigenesLebensmittelLoeschen: gesperrt,
    // ERN-EPIC-003: ebenso das Tagebuch.
    ladeTagebuch: gesperrt,
    tagebuchEintragen: gesperrt,
    tagebuchAendern: gesperrt,
    tagebuchLoeschen: gesperrt,
    wasserZaehlen: gesperrt,
  };
}

/** Ohne Einsicht: dieses Modul, wie bisher. */
export const PlattformApiKontext = createContext<PlattformApi>(api);

/** Die Plattformfunktionen dieser Ansicht - der Person oder der Einsicht. */
export function usePlattformApi(): PlattformApi {
  return useContext(PlattformApiKontext);
}

/** In der Einsicht wird die Plattform gezeigt, nicht bedient. */
export const NurLesenKontext = createContext(false);

/** Ob jeder Schreibknopf fehlen soll (Einsicht der Praxis, E-001). */
export function useNurLesen(): boolean {
  return useContext(NurLesenKontext);
}

/**
 * Die Wege aus der Einsicht in die Praxis (E-001, DESIGN.md Regel 6): Was die
 * Einsicht nicht öffnet - ein Dokument, eine Aufnahme (ANN-527) -, öffnet die
 * Praxis an seinem Ort. Die Adressen kennt nur die Praxisseite
 * (`features/platform-access`); die Plattform bekommt sie eingespeist wie die
 * Quelle und kennt keine Seite der Praxis.
 */
export interface Praxiswege {
  /** Wo eine Datei dieser Art in der Akte steht; im Training gibt es keine. */
  datei: ((dokumentart: string) => string) | null;
  /** Eine Rückfrage, wie die Praxis sie liest. */
  rueckfrage: (nachrichtId: string) => string;
}

/** Ohne Einsicht gibt es keine Wege in die Praxis. */
export const PraxiswegeKontext = createContext<Praxiswege | null>(null);

/** Die Wege in die Praxis - nur in der Einsicht und nur, wenn die Praxisseite sie gibt. */
export function usePraxiswege(): Praxiswege | null {
  return useContext(PraxiswegeKontext);
}
