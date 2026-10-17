/** Wege im Teamchat (TEAM-001) - eine Stelle für Liste, Suche und Seiten. */
export function gespraechPfad(kanalId: string): string {
  return `/team/${kanalId}`;
}

/** Der Thread einer Ausgangsnachricht; `nachricht` hebt eine Stelle hervor. */
export function threadPfad(kanalId: string, threadId: string, nachricht?: string): string {
  const pfad = `/team/${kanalId}/${threadId}`;
  return nachricht && nachricht !== threadId ? `${pfad}?nachricht=${nachricht}` : pfad;
}
