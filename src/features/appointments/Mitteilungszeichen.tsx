import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { notificationChannelLabels, type NotificationChannel } from './api';

/**
 * Die Mitteilungswege eines Termins als Zeichenreihe (CAL-012).
 *
 * Vorbild ist die Terminliste von iPrax: ein Zeichen hinter dem Termin sagt,
 * dass er der Patient:in bereits mitgeteilt wurde, und über welchen Weg. Wer
 * die Liste überfliegt, sieht damit ohne Aufklappen, wo noch ein Anruf fehlt.
 *
 * Vier Abzeichen im selben Ton — die Wege sind kein Status, keiner ist besser
 * als der andere. Unterschieden werden sie am Bild **und** am Wort: Farbe
 * trägt hier gar nichts, und ein Bild allein wäre für Vorlesesoftware stumm
 * (Oberflächen-Checkliste Punkt 4, WCAG 1.4.1).
 *
 * Kein Zeichen heißt: noch nicht mitgeteilt — oder der Termin hat sich seit
 * der Mitteilung geändert. Beides ist derselbe Handlungsbedarf, und die
 * Datenbank unterscheidet sie deshalb auch nicht (`notified_at >=
 * appointments.updated_at`).
 */

const bilder: Record<NotificationChannel, ReactNode> = {
  slip: <DruckerBild />,
  phone: <HoererBild />,
  in_person: <SprechBild />,
  email: <BriefBild />,
};

export function Mitteilungszeichen({ kanaele }: { kanaele: readonly NotificationChannel[] }) {
  if (kanaele.length === 0) return null;

  return (
    <span className="flex flex-wrap items-center gap-1">
      {kanaele.map((kanal) => (
        <Badge key={kanal} eigenesZeichen={bilder[kanal]}>
          {notificationChannelLabels[kanal].kurz}
        </Badge>
      ))}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Bilder
//
// Inline-SVG statt Sonderzeichen: Ein „✉" oder „☎" hängt an der Schriftart des
// Geräts und fällt auf manchen Systemen auf ein Ersatzzeichen zurück. Die
// Größe folgt der Schrift (1em), damit sie im Abzeichen sitzt.
// -----------------------------------------------------------------------------

function Bild({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Drucker — der Terminzettel wurde ausgehändigt. */
function DruckerBild() {
  return (
    <Bild>
      <path d="M4.5 6V2.5h7V6" />
      <rect x="2" y="6" width="12" height="5" rx="1" />
      <path d="M4.5 9.5h7v4h-7z" />
    </Bild>
  );
}

/** Hörer — telefonisch mitgeteilt. */
function HoererBild() {
  return (
    <Bild>
      <path d="M3 3.5c0-.6.5-1 1-1h1.6c.4 0 .8.3.9.7l.7 2c.1.4 0 .8-.3 1l-1 .8a8 8 0 0 0 3.1 3.1l.8-1c.2-.3.6-.4 1-.3l2 .7c.4.1.7.5.7.9V12c0 .5-.4 1-1 1A10 10 0 0 1 3 3.5Z" />
    </Bild>
  );
}

/** Sprechblase — persönlich gesagt. */
function SprechBild() {
  return (
    <Bild>
      <path d="M13.5 8.5a4.5 4.5 0 0 1-4.5 4.5H5l-2.5 2v-2.6A4.5 4.5 0 0 1 1 8.5v-1A4.5 4.5 0 0 1 5.5 3H9a4.5 4.5 0 0 1 4.5 4.5Z" />
    </Bild>
  );
}

/** Umschlag — die Praxis hat selbst eine E-Mail geschrieben. */
function BriefBild() {
  return (
    <Bild>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1" />
      <path d="m1.5 5 6.5 4 6.5-4" />
    </Bild>
  );
}
