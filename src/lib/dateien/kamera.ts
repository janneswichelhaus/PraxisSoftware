import { useEffect, useState } from 'react';

/**
 * Gibt es auf diesem Gerät überhaupt eine Kamera-Schnittstelle (DOK-006)?
 *
 * `getUserMedia` steht nur in einem sicheren Kontext zur Verfügung (HTTPS,
 * `localhost`); über eine IP-Adresse im heimischen WLAN fehlt sie (ADR-017,
 * Konsequenzen der Fassung 2). Ob das Gerät wirklich eine Kamera hat, sagt
 * `useKamera`; ob sie freigegeben wird, zeigt erst der Versuch im Kameradialog.
 */
export function kameraVerfuegbar(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/** Ein Satz zum Fehler beim Start der Kamera und ob ein zweiter Versuch Aussicht hat. */
export function kamerafehler(ursache: unknown): { meldung: string; erneut: boolean } {
  const name = ursache instanceof Error ? ursache.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      meldung:
        'Die Kamera wurde nicht freigegeben. Bitte in den Einstellungen des Browsers für diese Seite erlauben und erneut öffnen.',
      erneut: true,
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { meldung: 'Auf diesem Gerät wurde keine Kamera gefunden.', erneut: false };
  }
  if (name === 'NotReadableError') {
    return {
      meldung:
        'Die Kamera wird gerade von einer anderen App benutzt. Bitte dort schließen und erneut versuchen.',
      erneut: true,
    };
  }
  return {
    meldung: 'Die Kamera konnte nicht gestartet werden. Bitte erneut versuchen.',
    erneut: true,
  };
}

/**
 * Was die Seite über die Kamera weiß (DAT-25):
 *
 *   * `ohneSchnittstelle` - kein `getUserMedia`, etwa ohne sichere Verbindung;
 *   * `pruefen` - die Geräteliste ist angefragt, die Antwort steht aus;
 *   * `vorhanden` - mindestens eine Kamera, oder das Gerät sagt es nicht;
 *   * `keine` - die Geräteliste kennt keine Kamera.
 */
export type Kamerastand = 'ohneSchnittstelle' | 'pruefen' | 'vorhanden' | 'keine';

/** So lange wartet die Seite auf die Geräteliste, dann bietet sie die Kamera an (ms). */
export const KAMERA_FRIST = 1500;

/**
 * Hat dieses Gerät eine Kamera (DAT-25)?
 *
 * Die Schnittstelle gibt es in jedem Browser über HTTPS, auch am Empfangsrechner
 * ohne Webcam - dort führte „Foto aufnehmen" bis UXR-009 in einen Dialog, der
 * keine Kamera fand, samt „Erneut versuchen" ohne Aussicht. Die Geräteliste
 * sagt es vorher und ohne Freigabe; ohne Freigabe fehlen darin nur die Namen.
 * Kann das Gerät die Liste nicht liefern - oder antwortet es nicht binnen
 * `KAMERA_FRIST` -, wird die Kamera angeboten wie bisher: Der Dialog sagt dann,
 * was fehlt. Chromium hält die Antwort etwa zurück, solange die Seite keinen
 * Fokus hat; ein fehlender Knopf wäre dann ein stiller Verlust.
 */
export function useKamera(): Kamerastand {
  const [stand, setStand] = useState<Kamerastand>(() => {
    if (!kameraVerfuegbar()) return 'ohneSchnittstelle';
    return typeof navigator.mediaDevices.enumerateDevices === 'function' ? 'pruefen' : 'vorhanden';
  });

  useEffect(() => {
    if (stand !== 'pruefen') return;
    let aktuell = true;
    const frist = window.setTimeout(() => {
      if (aktuell) setStand('vorhanden');
    }, KAMERA_FRIST);
    navigator.mediaDevices
      .enumerateDevices()
      .then((geraete) => {
        if (aktuell) {
          setStand(geraete.some((geraet) => geraet.kind === 'videoinput') ? 'vorhanden' : 'keine');
        }
      })
      .catch(() => {
        if (aktuell) setStand('vorhanden');
      })
      .finally(() => window.clearTimeout(frist));
    return () => {
      aktuell = false;
      window.clearTimeout(frist);
    };
  }, [stand]);

  return stand;
}

/**
 * „26.09.2026, 10:42" — Tag und Uhrzeit für einen vorgeschlagenen Namen.
 *
 * Mit Uhrzeit, weil zwei Aufnahmen eines Tages sonst denselben Namen trügen;
 * ohne Vorschaubilder (ADR-017 Punkt 40) ist der Name das einzige Merkmal,
 * und jedes Öffnen zum Unterscheiden wäre ein Protokolleintrag (BEF-059).
 */
export function tagUndUhrzeit(zeitpunkt: Date = new Date(), zeitzone?: string): string {
  return `${tagDerPraxis(zeitpunkt, zeitzone)}, ${zeitpunkt.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    ...(zeitzone ? { timeZone: zeitzone } : {}),
  })}`;
}

/** „26.09.2026“ - in der Zeit der Praxis, wenn sie bekannt ist, sonst des Geräts. */
export function tagDerPraxis(zeitpunkt: Date, zeitzone?: string): string {
  return zeitpunkt.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(zeitzone ? { timeZone: zeitzone } : {}),
  });
}

/** „Foto vom 26.09.2026, 10:42" — der vorgeschlagene Name eines Fotos aus dem Kameradialog (BEF-059). */
export function fotoVomHeutigenTag(zeitpunkt: Date = new Date(), zeitzone?: string): string {
  return `Foto vom ${tagUndUhrzeit(zeitpunkt, zeitzone)}`;
}
