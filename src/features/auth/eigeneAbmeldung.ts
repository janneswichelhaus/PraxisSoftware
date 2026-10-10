/**
 * Hat diese Seite die Abmeldung selbst ausgelöst? (BEF-047)
 *
 * Endet eine Sitzung, meldet der Anmeldedienst immer dasselbe Ereignis
 * `SIGNED_OUT` - ob die Person in diesem Tab „Abmelden" getippt hat oder ob
 * die Sitzung von außen endete: Abmelden im zweiten Tab, „Alle Sitzungen
 * beenden" an einem anderen Gerät, eine abgelehnte Erneuerung. Nur im
 * zweiten Fall soll die Anmeldemaske sagen, dass die Sitzung beendet wurde;
 * wer selbst abmeldet, weiß es.
 *
 * Deshalb setzt jeder eigene Abmeldeweg für die Dauer des Aufrufs diesen
 * Merker, und der `SessionProvider` liest ihn, wenn das Ereignis eintrifft.
 * Der Merker gilt je Seite: Ein anderer Tab erfährt nur das Ereignis und
 * zeigt deshalb den Satz - dort ist die Sitzung ja von außen beendet.
 */
let eigeneAbmeldungLaeuft = false;

export async function meldeSelbstAb<T>(vorgang: () => Promise<T>): Promise<T> {
  eigeneAbmeldungLaeuft = true;
  try {
    return await vorgang();
  } finally {
    eigeneAbmeldungLaeuft = false;
  }
}

export function istEigeneAbmeldung(): boolean {
  return eigeneAbmeldungLaeuft;
}
