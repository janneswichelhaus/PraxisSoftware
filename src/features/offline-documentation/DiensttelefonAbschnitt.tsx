import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { GERAETEVORGABE, ausschalten, einrichten, useEinrichtung } from './servicePhone';
import { useEntwuerfe } from './entwuerfe';

/**
 * „Dokumentieren ohne Empfang" unter „Mein Konto" (OFF-001, ADR-024 Punkt 6).
 *
 * Eingeschaltet wird je Gerät, mit der Bestätigung jeder Zeile der
 * Gerätevorgabe. Die Anwendung prüft sie nicht; die Seite sagt das. Was danach
 * auf dem Gerät liegt, steht in einem Satz: der eigene Tagesplan von heute und
 * eigene Entwürfe, bis sie übertragen sind.
 */
export function DiensttelefonAbschnitt({
  besitzer,
  wartend: vorgegeben,
}: {
  besitzer: string;
  /** Nur für Tests: Entwürfe, die noch auf dem Gerät liegen. */
  wartend?: number;
}) {
  const einrichtung = useEinrichtung(besitzer);
  // Jeder Entwurf auf dem Gerät, gleich in welchem Zustand: Er fällt nie mit
  // dem Ausschalten (§13).
  const liegen = useEntwuerfe(besitzer);
  const wartend = vorgegeben ?? liegen?.length ?? 0;
  const [bestaetigt, setBestaetigt] = useState<boolean[]>(GERAETEVORGABE.map(() => false));
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function schalten(an: boolean) {
    setLaeuft(true);
    setFehler(null);
    try {
      if (an) await einrichten(besitzer);
      else await ausschalten(besitzer);
      setBestaetigt(GERAETEVORGABE.map(() => false));
    } catch {
      setFehler('Das Gerät hat die Einstellung nicht gespeichert. Bitte erneut versuchen.');
    } finally {
      setLaeuft(false);
    }
  }

  if (einrichtung === undefined) return null;

  return (
    // Kopf eine Zeile (DESIGN.md Regel 6, Design-Review R2 T7): „für ein
    // Diensttelefon“ bestätigt die Gerätevorgabe, „ohne Verbindung“ sagt der
    // Titel.
    <Section
      titel="Dokumentieren ohne Empfang"
      hinweis="Tagesplan und Entwürfe bleiben auf dem Gerät."
    >
      {fehler ? (
        <Statusmeldung ton="fehler" className="mb-3">
          {fehler}
        </Statusmeldung>
      ) : null}
      {einrichtung ? (
        <>
          <Statusmeldung ton="erfolg">
            Auf diesem Gerät eingeschaltet seit{' '}
            {new Date(einrichtung.eingerichtetAm).toLocaleDateString('de-DE')}.
          </Statusmeldung>
          <p className="text-ink mt-3 text-sm">
            Auf dem Gerät liegen Ihr Tagesplan von heute (Uhrzeit, Terminart, Name, Adresse,
            Telefon) und Ihre Entwürfe, bis sie übertragen sind. Der Tagesplan fällt am Ende des
            Tages und beim Abmelden.
          </p>
          {wartend > 0 ? (
            <p className="text-ink mt-3 text-sm">
              Noch {wartend === 1 ? 'ein Entwurf liegt' : `${wartend} Entwürfe liegen`} nur auf
              diesem Gerät. Ausschalten geht erst, wenn alles übertragen ist.
            </p>
          ) : null}
          <Button
            variant="secondary"
            className="mt-4"
            disabled={laeuft || wartend > 0}
            onClick={() => void schalten(false)}
          >
            Auf diesem Gerät ausschalten
          </Button>
        </>
      ) : (
        <>
          <p className="text-ink text-sm">Nur einschalten, wenn alles davon gilt:</p>
          <div className="mt-2">
            {GERAETEVORGABE.map((zeile, i) => (
              <Checkbox
                key={zeile}
                label={zeile}
                checked={bestaetigt[i]}
                onChange={(e) => {
                  const neu = [...bestaetigt];
                  neu[i] = e.target.checked;
                  setBestaetigt(neu);
                }}
              />
            ))}
          </div>
          <Button
            className="mt-4"
            disabled={laeuft || !bestaetigt.every(Boolean)}
            onClick={() => void schalten(true)}
          >
            Auf diesem Gerät einschalten
          </Button>
          {/* ADR-024 Punkt 6: Wer verantwortet, und was ein Verlust kostet.
              Was der Passkey ohne Verbindung öffnet, sagt die Sperre ohne
              Netz dort, wo es gilt (`ohneNetz.tsx`) - hier stand es doppelt
              (Design-Review R2 T7). */}
          <Kleingedrucktes className="mt-3">
            Die Praxis verantwortet die Angaben, die Anwendung prüft sie nicht. Ohne Fernlöschung
            gehen nicht übertragene Entwürfe mit dem Gerät verloren.
          </Kleingedrucktes>
        </>
      )}
    </Section>
  );
}
