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
 * Die Texte stehen seit MAP-004 in einer eigenen Datei, weil sie zwei
 * Komponenten tragen: die Route und die Matrix. Beide Male ist es derselbe
 * Datenweg und damit dieselbe Ursache — zwei Fassungen desselben Satzes wären
 * zwei Fassungen zum Pflegen.
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
    titel: 'Kein Kartendienst eingerichtet',
    erklaerung:
      'Die Berechnung läuft serverseitig und braucht dafür die Secrets LOCATION_PROVIDER, PTV_API_KEY und LOCATION_DATA_GATE. Alle drei liegen lokal und nie im Repository.',
  },
  unauthorized: {
    titel: 'Kartendienst weist den Serverschlüssel ab',
    erklaerung:
      'Der Kartendienst hat den hinterlegten Serverschlüssel nicht angenommen. Das ist ein Einrichtungsschritt und betrifft nur die Routenberechnung.',
  },
  session_invalid: {
    titel: 'Anmeldung gilt nicht mehr',
    erklaerung:
      'Die Routenberechnung braucht eine gültige Sitzung. Melde dich neu an; die Stopps und die Karte bleiben davon unberührt.',
  },
  function_unavailable: {
    titel: 'Routenfunktion antwortet nicht',
    erklaerung:
      'Die Anfrage hat die Routenfunktion nicht erreicht — geantwortet hat etwas davor. Über den Kartendienst sagt das nichts.',
  },
  rate_limited: {
    titel: 'Kontingent erschöpft',
    erklaerung: 'Der Kartendienst nimmt gerade keine weitere Anfrage an. Später erneut versuchen.',
  },
  not_found: {
    titel: 'Keine Route gefunden',
    erklaerung: 'Zwischen diesen Punkten hat der Kartendienst keinen Weg für das Rad gefunden.',
  },
  invalid_request: {
    titel: 'Anfrage nicht gültig',
    erklaerung: 'Die Stopps ließen sich so nicht anfragen. Das ist ein Fehler in der Anwendung.',
  },
};
