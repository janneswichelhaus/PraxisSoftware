import { useState, type ReactNode } from 'react';

/**
 * Ein Bild im Inhalt: Zeichnung einer Übung, Foto, Scan (Design-Fundament,
 * DESIGN.md Lücke 9.10, ANN-404).
 *
 *   * **Seitenverhältnis 4:3** (Vorgabe) oder 1:1 - der Platz steht fest,
 *     bevor das Bild geladen ist, und die Seite springt nicht.
 *   * Radius 16 (`rounded-image`), eine Linie `line`; die Fläche dahinter
 *     ist Weiß, damit Zeichnungen auf Papier stehen.
 *   * **Ganz statt beschnitten** (`einpassen="ganz"`, Vorgabe): Eine
 *     Übungszeichnung, der die Hand fehlt, zeigt die Übung falsch. Fotos
 *     dürfen den Rahmen füllen (`fuellen`).
 *   * **Platzhalter:** ohne Bild, oder wenn es nicht lädt, eine vertiefte
 *     Fläche mit einem Bildzeichen und `platzhalter` als Text („Noch kein
 *     Bild“) - nie ein zerbrochenes Bildsymbol des Browsers.
 *   * **Beschreibung ist Pflicht** (`alt`): Was zeigt das Bild? Ein leerer
 *     Text nur, wenn das Bild daneben schon in Worten steht.
 *   * Statt `src` darf ein gezeichnetes SVG als `children` kommen (die
 *     Figuren der Übungsbibliothek); es füllt den Rahmen.
 *   * `vorschau`: 56 × 56 px, 1:1, für den Platz `bild` einer `ListRow`.
 *   * `beschriftung` setzt eine Bildunterschrift darunter (14 px Leise).
 *
 * Geladen wird träge (`loading="lazy"`): Eine Liste mit 150 Übungen lädt nur,
 * was zu sehen ist.
 */
export function Medienbild({
  src,
  alt,
  verhaeltnis = '4:3',
  einpassen = 'ganz',
  vorschau = false,
  platzhalter = 'Noch kein Bild',
  beschriftung,
  className = '',
  children,
}: {
  src?: string | null;
  alt: string;
  verhaeltnis?: '4:3' | '1:1';
  einpassen?: 'ganz' | 'fuellen';
  vorschau?: boolean;
  platzhalter?: string;
  beschriftung?: ReactNode;
  className?: string;
  /** Gezeichnetes Bild (SVG) statt `src`. */
  children?: ReactNode;
}) {
  const [kaputt, setKaputt] = useState<string | null>(null);
  const mitBild = Boolean(src) && kaputt !== src;
  const rahmen = [
    'border-line bg-surface relative block overflow-hidden border',
    vorschau ? 'rounded-button size-14' : 'rounded-image w-full',
    !vorschau && (verhaeltnis === '1:1' ? 'aspect-square' : 'aspect-[4/3]'),
  ]
    .filter(Boolean)
    .join(' ');

  let inhalt: ReactNode;
  if (children) {
    inhalt = (
      <span
        role="img"
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className="flex size-full items-center justify-center [&>svg]:size-full"
      >
        {children}
      </span>
    );
  } else if (mitBild && src) {
    inhalt = (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setKaputt(src)}
        className={`size-full ${einpassen === 'fuellen' ? 'object-cover' : 'object-contain'}`}
      />
    );
  } else {
    inhalt = (
      <span
        role="img"
        aria-label={alt ? `${alt} - ${platzhalter}` : platzhalter}
        className="bg-surface-sunken text-ink-muted flex size-full flex-col items-center justify-center gap-1 text-sm"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={vorschau ? 'size-6' : 'size-8'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.75" />
          <path d="m21 16-5-5-8 8" />
        </svg>
        {vorschau ? null : <span aria-hidden="true">{platzhalter}</span>}
      </span>
    );
  }

  if (!beschriftung) {
    return <span className={`${rahmen} ${className}`.trim()}>{inhalt}</span>;
  }
  return (
    <figure className={className}>
      <span className={rahmen}>{inhalt}</span>
      <figcaption className="text-ink-muted mt-2 text-sm">{beschriftung}</figcaption>
    </figure>
  );
}
