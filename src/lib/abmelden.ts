// Was ein Modul im Arbeitsspeicher hält und beim Abmelden oder Kontowechsel fallen muss, trägt es
// beim Laden hier ein: Ein nie geladenes Modul hält nichts, und die Sitzung kennt kein Fachmodul.

const aufraeumer = new Set<() => void>();

/** Trägt ein, was beim Abmelden und beim Kontowechsel geleert wird. */
export function beimAbmeldenLeeren(leeren: () => void): void {
  aufraeumer.add(leeren);
}

/** Leert alles Eingetragene; die Sitzung ruft es beim Abmelden und beim Kontowechsel. */
export function abmeldenAufraeumen(): void {
  for (const leeren of aufraeumer) {
    try {
      leeren();
    } catch (fehler) {
      // Ein Aufräumer, der wirft, hält weder die übrigen noch die Abmeldung auf; sichtbar bleibt er.
      queueMicrotask(() => {
        throw fehler;
      });
    }
  }
}
