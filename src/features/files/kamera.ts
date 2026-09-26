/**
 * Gibt es auf diesem Gerät überhaupt eine Kamera-Schnittstelle (DOK-006)?
 *
 * `getUserMedia` steht nur in einem sicheren Kontext zur Verfügung (HTTPS,
 * `localhost`); über eine IP-Adresse im heimischen WLAN fehlt sie (ADR-017,
 * Konsequenzen der Fassung 2). Ob das Gerät wirklich eine Kamera hat und ob
 * sie freigegeben wird, zeigt erst der Versuch im Kameradialog.
 */
export function kameraVerfuegbar(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/** „Foto vom 26.09.2026" — der vorgeschlagene Name eines Fotos aus dem Kameradialog. */
export function fotoVomHeutigenTag(): string {
  return `Foto vom ${new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`;
}
