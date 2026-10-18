/**
 * Die Kennung einer Nachricht aus der Kennung des Geräts (TEAM-002, ANN-641,
 * ADR-024 Punkt 7) - dieselbe Ableitung wie `app.team_message_key` auf dem
 * Server: die ersten 128 Bit von SHA-256 über „Person:Gerätekennung“.
 *
 * Der Server legt die Nachricht unter dieser Kennung an; so trifft eine
 * Gerätekennung nie die Zeile einer anderen Person und verrät nichts über
 * sie. Das Gerät rechnet dieselbe Kennung, um seine noch nicht bestätigte
 * Nachricht im Verlauf wiederzuerkennen - kam sie an und ging nur die Antwort
 * verloren, steht sie sonst zweimal da. Beide Teile kennt nur die Person
 * selbst.
 */
export async function nachrichtKennung(staffMemberId: string, geraeteKennung: string): Promise<string> {
  const text = `${staffMemberId.toLowerCase()}:${geraeteKennung.toLowerCase()}`;
  const summe = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const hex = Array.from(summe.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
