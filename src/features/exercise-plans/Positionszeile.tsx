import { Badge } from '@/components/ui/Badge';
import { ListRow } from '@/components/ui/ListRow';
import { Vorschaubild } from '@/features/exercises/Vorschaubild';
import type { Position } from './api';
import { dosierungAlltag, dosierungFachlich, dosierungKurz } from './dosierung';

/**
 * Eine Position als Zeile (Welle B): Vorschaubild, „1. Kniebeuge am Geländer",
 * darunter die Dosierung - kurz im Planeditor, ausführlich am zugewiesenen
 * Plan, in Alltagssprache so, wie die Person ihn liest (IDEA-QSN-002).
 *
 * Im Planeditor ist die ganze Zeile das Ziel und öffnet die Dosierung.
 */
export function Positionszeile({
  position,
  sprache = 'kurz',
  schritt = [],
  onClick,
}: {
  position: Position;
  sprache?: 'kurz' | 'fachlich' | 'alltag';
  /** Schritt und Unterschiede zur vorigen Fassung (UEB-006). */
  schritt?: readonly string[];
  onClick?: () => void;
}) {
  const alltag = sprache === 'alltag';
  const meta = (
    <>
      <span className="block">
        {sprache === 'kurz'
          ? dosierungKurz(position)
          : alltag
            ? dosierungAlltag(position)
            : dosierungFachlich(position)}
      </span>
      {alltag && position.instruction ? (
        <span className="text-ink mt-1 block whitespace-pre-line">{position.instruction}</span>
      ) : null}
      {alltag && position.equipment.length > 0 ? (
        <span className="mt-1 block">Sie brauchen: {position.equipment.join(', ')}</span>
      ) : null}
      {position.note ? (
        <span className="mt-1 block">
          {alltag ? '' : 'Hinweis: '}
          {position.note}
        </span>
      ) : null}
      {schritt.map((zeile, index) => (
        <span key={zeile} className={index === 0 ? 'text-ink mt-1 block font-medium' : 'block'}>
          {zeile}
        </span>
      ))}
    </>
  );
  return (
    <ListRow
      bild={
        <Vorschaubild
          bild={position.illustration}
          name={alltag ? position.variant_lay_name : position.variant_name}
        />
      }
      titel={`${position.position}. ${alltag ? position.variant_lay_name : position.variant_name}`}
      meta={meta}
      {...(position.variant_archived ? { status: <Badge ton="warnung">archiviert</Badge> } : {})}
      {...(onClick ? { onClick } : {})}
    />
  );
}
