import type { LocationErrorCode } from '@/lib/location/contract';

/**
 * Was die Person liest, wenn vom Kartendienst nichts kommt (MAP-003b).
 *
 * **Jeder Zustand hat einen eigenen Satz.** „Es hat nicht geklappt" wäre für
 * eine Praxis unbrauchbar: Eine Zeitüberschreitung geht vorbei, ein fehlender
 * Schlüssel nicht. Kein Text nennt eine Adresse, eine Anbietermeldung oder
 * einen Schlüssel (ADR-011).
 *
 * **Jeder Text zeigt auf den, der es war** (BEF-027). Vor dieser Korrektur
 * stand „Kartendienst weist den Serverschlüssel ab" auf dem Bildschirm,
 * während in Wahrheit die eigene Sitzungsprüfung nicht durchkam — und der
 * Kartendienst nie gefragt worden war. Wer eine Ursache benennt, die er nicht
 * kennt, schickt die Fehlersuche an die falsche Stelle.
 *
 * **In der Sprache der Praxis** (TER-07, WRT-03, WRT-13): Seit UXR-003 nennt
 * kein Satz mehr Secrets, Umgebungsvariablen oder Funktionsnamen, keiner
 * duzt, und „Kontingent" meint in der Praxis das Verordnungskontingent. Was
 * für die Einrichtung zu tun ist, gehört in die Entwicklerdokumentation, nicht
 * vor die Therapeutin. Dass eine fehlende Einrichtung ein eigener Zustand
 * bleibt und keine Störung, legt ANN-090 fest - geändert hat sich nur der
 * Wortlaut.
 *
 * Die Texte stehen seit MAP-004 in einer eigenen Datei, weil sie zwei
 * Komponenten tragen: die Route und die Matrix. Beide Male ist es derselbe
 * Datenweg und damit dieselbe Ursache — zwei Fassungen desselben Satzes wären
 * zwei Fassungen zum Pflegen. Das Verorten einer Adresse hat eigene Sätze
 * (`StartortEinstellung`, `AdresseVerorten`).
 */
export interface Fehlertext {
  readonly titel: string;
  readonly erklaerung: string;
}

export const FEHLERTEXTE: Readonly<Record<LocationErrorCode, Fehlertext>> = {
  timeout: {
    titel: 'Zeitüberschreitung',
    erklaerung: 'Der Kartendienst hat nicht rechtzeitig geantwortet. Ein neuer Versuch hilft oft.',
  },
  unavailable: {
    titel: 'Kartendienst nicht erreichbar',
    erklaerung:
      'Die Route konnte nicht berechnet werden. Die Stopps stehen trotzdem auf der Karte und in der Liste.',
  },
  // ANN-094: Ohne ausdrückliche Datenfreigabe der Umgebung (LOCATION_DATA_GATE)
  // gilt ein echter Anbieter als nicht eingerichtet - der Schalter aus
  // ADR-019 Punkt 25 steht zu, bis ihn jemand bewusst öffnet.
  not_configured: {
    titel: 'Fahrzeiten sind hier noch nicht eingerichtet',
    erklaerung: 'Liste und Navigation funktionieren trotzdem.',
  },
  // Der Anbieter hat den Schlüssel der Praxis abgelehnt - gefragt wurde er
  // also (BEF-027). Behoben wird das bei der Einrichtung, nicht im Alltag.
  unauthorized: {
    titel: 'Der Kartendienst nimmt die Anfrage nicht an',
    erklaerung: 'Das ist ein Einrichtungsschritt und betrifft nur die Routenberechnung.',
  },
  session_invalid: {
    titel: 'Anmeldung gilt nicht mehr',
    erklaerung: 'Bitte neu anmelden – Stopps und Karte bleiben erhalten.',
  },
  // Geantwortet hat etwas vor der eigenen Berechnung, nicht der Kartendienst
  // (BEF-027) - das bleibt die Aussage, nur ohne Funktionsnamen.
  function_unavailable: {
    titel: 'Die Route ließ sich gerade nicht berechnen',
    erklaerung: 'Der Kartendienst wurde dafür gar nicht gefragt. Bitte später erneut versuchen.',
  },
  rate_limited: {
    titel: 'Der Kartendienst ist gerade ausgelastet',
    erklaerung: 'Bitte später erneut versuchen.',
  },
  not_found: {
    titel: 'Keine Route gefunden',
    // ADR-019 Punkt 38: Auch eine Ersatzschätzung des Anbieters endet hier -
    // sie ist keine Fahrzeit.
    erklaerung:
      'Zwischen diesen Punkten hat der Kartendienst keinen Weg für das Rad berechnet; die Fahrzeit ist nicht verfügbar.',
  },
  invalid_request: {
    titel: 'Die Stopps ließen sich so nicht anfragen',
    erklaerung: 'Das ist ein Fehler in der Anwendung, nicht in Ihren Angaben.',
  },
};
