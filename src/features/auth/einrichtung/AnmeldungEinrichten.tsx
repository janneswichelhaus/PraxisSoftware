import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { FENSTERZIEL, PortalZielKontext } from '@/components/ui/portalZiel';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Vollseite } from '@/app/Vollseite';
import { ANMELDEN_TITEL, EINLADUNG_TITEL } from '@/app/tabtitel';
import { TELEFON } from '@/app/tuerzeichen';
import { useSchriftgroesseAnwenden } from '@/features/platform/schriftgroesse';
import { useFokusNachWechsel } from '../fokus';
import { PASSKEY_SAETZE, PasskeyFehler, passkeyEinrichten, passkeyMoeglich } from '../passkey';
import type { Einrichtungsstand } from './einrichtungsstand';
import { PinFestlegen } from './PinFestlegen';

const PIN_FORMULAR = 'einrichtung-pin';

/**
 * Anmeldung einrichten: Passkey und App-PIN (ADR-025 Fassung 2, Punkt 13).
 *
 * Zwei Schritte in fester Reihenfolge: erst der Passkey auf diesem Gerät,
 * dann die PIN. Ohne Passkey ist die Einrichtung nicht abgeschlossen. In
 * Produktion führt kein Weg daran vorbei (`Einrichtungspflicht`); außerhalb
 * der Produktion darf `onSpaeter` den Schritt auslassen (Punkt 15).
 *
 * Seit Schritt 1c (Handoff 2026-10-22, Abschnitt 5.2) ist es ein geführter
 * Ablauf: eine Frage je Seite, der Hauptknopf im Fuß. Nach der Einladung
 * (`ausEinladung`) sind es die Schritte 2 und 3 von 3 - die Einladung war der
 * erste. Eine Fertig-Seite gibt es nicht; `onFertig` führt weiter (ANN-685).
 * Das ✕ meldet nicht sofort ab, sondern fragt: Ohne Passkey braucht es danach
 * eine neue Einladung (ANN-686).
 */
export function AnmeldungEinrichten({
  stand,
  ausEinladung = false,
  adresse,
  onFertig,
  onAbmelden,
  onSpaeter,
}: {
  stand: Einrichtungsstand;
  /** Direkt nach der Einladung: „Schritt 2 von 3“, sonst „Schritt 1 von 2“. */
  ausEinladung?: boolean;
  /** Die Adresse aus der Einladung - nur für die gezeichnete Abfrage. */
  adresse?: string | undefined;
  onFertig: () => void;
  onAbmelden: () => void;
  /** Nur außerhalb der Produktion. */
  onSpaeter?: (() => void) | undefined;
}) {
  const [passkeyDa, setPasskeyDa] = useState(stand.passkeys > 0);
  const [fehler, setFehler] = useState<{ satz: string; abgebrochen: boolean } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [abbrechen, setAbbrechen] = useState(false);
  const [ziel, setZiel] = useState<HTMLDivElement | null>(null);
  const fehlerkasten = useRef<HTMLDivElement>(null);
  useFokusNachWechsel(fehler, () => (fehler ? fehlerkasten.current : null));
  useSchriftgroesseAnwenden();
  useEffect(() => {
    document.title = ausEinladung ? EINLADUNG_TITEL : ANMELDEN_TITEL;
  }, [ausEinladung]);

  if (!passkeyDa && !passkeyMoeglich()) {
    return (
      <Vollseite
        tabtitel={ausEinladung ? EINLADUNG_TITEL : ANMELDEN_TITEL}
        zeichen={TELEFON}
        titel="Hier lässt sich kein Passkey anlegen"
        einleitung="Dafür braucht es ein aktuelles Telefon oder einen aktuellen Browser."
      >
        <p className="text-ink text-base">
          Bitten Sie die Praxis um eine neue Einladung und öffnen Sie sie auf einem aktuellen
          Telefon.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button variant="secondary" onClick={onAbmelden}>
            Abmelden
          </Button>
          {onSpaeter ? (
            <Button variant="quiet" onClick={onSpaeter}>
              Später einrichten (nur Test-Umgebung)
            </Button>
          ) : null}
        </div>
      </Vollseite>
    );
  }

  async function einrichten() {
    setFehler(null);
    setLaeuft(true);
    try {
      await passkeyEinrichten();
      setPasskeyDa(true);
      if (stand.pin) onFertig();
    } catch (grund) {
      setFehler(
        grund instanceof PasskeyFehler
          ? { satz: grund.message, abgebrochen: grund.abgebrochen }
          : { satz: PASSKEY_SAETZE.geraet, abgebrochen: false },
      );
    } finally {
      setLaeuft(false);
    }
  }

  const pinSchritt = passkeyDa && !stand.pin;
  const schritt = ausEinladung
    ? { text: `Schritt ${pinSchritt ? 3 : 2} von 3`, wert: pinSchritt ? 3 : 2, von: 3 }
    : { text: `Schritt ${pinSchritt ? 2 : 1} von 2`, wert: pinSchritt ? 2 : 1, von: 2 };

  const spaeter = onSpaeter ? (
    <Button variant="quiet" className="mt-2 w-full" onClick={onSpaeter}>
      Später einrichten (nur Test-Umgebung)
    </Button>
  ) : null;

  // Das ✕ und Esc fragen nach, statt abzumelden (ANN-686).
  const rueckfrage = abbrechen ? (
    <div className="max-w-formular mx-auto flex w-full flex-col gap-3 px-4 pt-2 pb-2">
      <Statusmeldung ton="warnung">
        {passkeyDa
          ? 'Einrichtung abbrechen? Die PIN legen Sie dann beim nächsten Anmelden fest.'
          : 'Einrichtung abbrechen? Ohne Passkey kommen Sie danach nur mit einer neuen Einladung der Praxis hinein.'}
      </Statusmeldung>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onAbmelden}>
          Abbrechen und abmelden
        </Button>
        <Button variant="quiet" onClick={() => setAbbrechen(false)}>
          Weiter einrichten
        </Button>
      </div>
    </div>
  ) : null;

  const ablauf = pinSchritt ? (
    <GefuehrterAblauf
      titel="Eine PIN festlegen"
      objekt="Anmeldung einrichten"
      schliessen="Einrichtung abbrechen"
      onSchliessen={() => setAbbrechen(true)}
      seite="pin"
      stand={schritt}
      schutz={rueckfrage}
      fuss={
        <>
          <Button type="submit" form={PIN_FORMULAR} className="w-full">
            PIN speichern
          </Button>
          {spaeter}
        </>
      }
    >
      <p className="text-ink text-base">
        Sechs Ziffern. Damit kommen Sie hinein, wenn Gesicht oder Finger einmal nicht gehen.
      </p>
      <PinFestlegen onGesetzt={onFertig} formular={PIN_FORMULAR} />
    </GefuehrterAblauf>
  ) : (
    <GefuehrterAblauf
      titel="Mit Gesicht oder Finger anmelden"
      objekt="Anmeldung einrichten"
      schliessen="Einrichtung abbrechen"
      onSchliessen={() => setAbbrechen(true)}
      seite="passkey"
      stand={schritt}
      schutz={rueckfrage}
      fuss={
        <>
          <Button className="w-full" disabled={laeuft} onClick={() => void einrichten()}>
            {laeuft ? 'Wird eingerichtet …' : fehler ? 'Erneut versuchen' : 'Jetzt einrichten'}
          </Button>
          {spaeter}
        </>
      }
    >
      {fehler ? (
        <div ref={fehlerkasten} tabIndex={-1} className="focus:outline-none">
          <Statusmeldung ton={fehler.abgebrochen ? 'warnung' : 'fehler'}>
            {fehler.abgebrochen
              ? 'Nicht bestätigt. Versuchen Sie es noch einmal – Ihr Telefon fragt dann erneut.'
              : fehler.satz}
          </Statusmeldung>
        </div>
      ) : null}
      <p className="text-ink text-base">
        Ihr Telefon fragt gleich nach Gesicht, Finger oder Displaysperre. So melden Sie sich künftig
        an.
      </p>
      {/* Die Abfrage des Telefons, nur gezeichnet; unter 23rem entfällt sie
          wie ein Foto (ANN-682). */}
      <figure className="max-[23rem]:hidden">
        <div
          aria-hidden="true"
          className="bg-surface-sunken rounded-image flex justify-center px-4 py-6"
        >
          <div className="bg-surface rounded-card flex w-60 max-w-full flex-col items-center gap-2 p-5 text-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent size-12"
            >
              <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1M15 9v1M12 9v4h-1M9 16a4 4 0 0 0 6 0" />
            </svg>
            <span className="text-ink font-semibold">Own Motion</span>
            {adresse ? (
              <span className="text-ink-muted w-full truncate text-base">{adresse}</span>
            ) : null}
            <span className="bg-accent text-surface rounded-button mt-2 flex h-10 w-full items-center justify-center font-semibold">
              Fortfahren
            </span>
          </div>
        </div>
        <figcaption className="text-ink-muted mt-2 text-base">
          So etwa sieht die Abfrage Ihres Telefons aus.
        </figcaption>
      </figure>
      <p className="text-ink flex items-start gap-3 text-base">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent mt-0.5 size-6 shrink-0"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        Gesicht und Fingerabdruck bleiben auf Ihrem Telefon. Own Motion bekommt sie nie.
      </p>
      <Disclosure summary="Was passiert dabei genau?">
        <div className="text-ink flex flex-col gap-2 text-base">
          <p>
            Ihr Telefon legt einen Passkey an: einen Schlüssel, der nur zu Own Motion passt. Er
            bleibt auf dem Telefon oder in Ihrem Schlüsselbund.
          </p>
          <p>
            Der Anmeldedienst speichert nur den öffentlichen Schlüssel des Passkeys, von der PIN nur
            eine nicht umkehrbare Prüfsumme.
          </p>
        </div>
      </Disclosure>
    </GefuehrterAblauf>
  );

  // Das Fenster zeichnet in ein Ziel mit der Schrift der Plattform, nicht an
  // den `body` (ANN-584); innerhalb der Sitzungssperre liegt es in dem
  // Bereich, den sie verbirgt.
  return (
    <>
      {ziel ? <PortalZielKontext.Provider value={ziel}>{ablauf}</PortalZielKontext.Provider> : null}
      <div ref={setZiel} className="plattform-schrift" {...{ [FENSTERZIEL]: '' }} />
    </>
  );
}
