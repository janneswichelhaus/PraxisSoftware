import { dosierungAlltag, dosierungFachlich } from '@/features/exercise-plans/dosierung';
import {
  GRUNDSTELLUNGEN,
  istAusgangsstellung,
  type Uebungsbild as Bild,
} from '@/features/exercises/bild/schema';
import { Uebungsbild } from '@/features/exercises/bild/Uebungsbild';
import { KATALOG } from '@/features/exercises/katalog';
import { alsDosis } from '@/features/exercises/katalog/dosierung';
import { ausruestungVon } from '@/features/exercises/katalog/schema';
import {
  AUSGANGSSTELLUNG_LABEL,
  NIVEAU_LABEL,
  ZIEL_LABEL,
  type Katalogeintrag,
} from '@/features/exercises/katalog/typen';
import { KOERPERREGION_LABEL } from '@/features/exercises/types';

/**
 * Einstieg der Prüfseite aus `uebungsbilder.html` (ANN-382): der Kontaktbogen
 * des Übungskatalogs. Je Eintrag Start und Ende, das Bewegungsbild, die
 * Vorschau in Listengröße (56 px), Dosierung, Anleitung, Fehler und Hinweise.
 * Ein Bild der Ausgangsstellung (ANN-480) steht in beiden Darstellungen als
 * eine Figur; `data-art` am Eintrag sagt, welche Art es ist.
 *
 * `?gruppe=kn` zeigt nur eine Gruppe. Gedacht zum Durchsehen am Telefon:
 * Stimmt die Stellung, liegt die Figur auf, greift die Hand, zeigt der Pfeil
 * die richtige Richtung?
 */
const gruppe = new URLSearchParams(window.location.search).get('gruppe')?.toUpperCase() ?? null;
const eintraege = KATALOG.filter((e) => !gruppe || e.schluessel.startsWith(`${gruppe}-`));

export function Eintrag({ e }: { e: Katalogeintrag }) {
  const dosis = alsDosis(e.dosierung);
  const ausruestung = ausruestungVon(e);
  return (
    <article
      data-eintrag={e.schluessel}
      data-art={e.bild ? (istAusgangsstellung(e.bild) ? 'ausgangsstellung' : 'bewegung') : 'ohne'}
      className="border-line rounded-card bg-surface border p-4"
      aria-labelledby={`titel-${e.schluessel}`}
    >
      <div className="flex items-start gap-3">
        {e.bild ? (
          <div className="size-14 shrink-0" data-vorschau>
            <Uebungsbild bild={e.bild} name={e.alltagsname} darstellung="vorschau" dekorativ />
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 id={`titel-${e.schluessel}`} className="text-ink text-base font-bold">
            {e.alltagsname}
          </h2>
          <p className="text-ink-muted text-sm">
            {e.schluessel} · {e.name}
          </p>
          <p className="text-ink-muted text-sm">
            {KOERPERREGION_LABEL[e.region]} · {ZIEL_LABEL[e.ziel]} ·{' '}
            {AUSGANGSSTELLUNG_LABEL[e.ausgangsstellung]} · {NIVEAU_LABEL[e.niveau]}
          </p>
        </div>
      </div>

      {e.bild ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Uebungsbild bild={e.bild} name={e.alltagsname} darstellung="start-ende" animierbar />
          <Uebungsbild bild={e.bild} name={e.alltagsname} darstellung="bewegung" />
        </div>
      ) : (
        <p className="text-ink-muted mt-3 text-sm" data-ohne-bild>
          Ohne Bild – die Übung steht als Text.
        </p>
      )}

      <p className="text-ink mt-3 text-sm font-semibold">{dosierungAlltag(dosis)}</p>
      <p className="text-ink-muted text-sm">{dosierungFachlich(dosis)}</p>
      {ausruestung.length > 0 ? (
        <p className="text-ink-muted text-sm">Hilfsmittel: {ausruestung.join(', ')}</p>
      ) : null}
      <ol className="text-ink mt-2 list-decimal pl-5 text-sm">
        {e.anleitung.map((schritt) => (
          <li key={schritt}>{schritt}</li>
        ))}
      </ol>
      <p className="text-ink-muted mt-2 text-sm">Typische Fehler: {e.fehler.join(' ')}</p>
      {e.hinweise_praxis ? (
        <p className="text-ink-muted mt-1 text-sm">Für die Praxis: {e.hinweise_praxis}</p>
      ) : null}
    </article>
  );
}

/** `?ansicht=bogen`: nur die Bewegungsbilder, dicht - der Kontaktbogen auf einen Blick. */
export function Bogen() {
  return (
    <main className="mx-auto max-w-5xl p-3">
      <h1 className="text-accent text-h2-mobil font-extrabold">Kontaktbogen</h1>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {eintraege.map((e) => (
          <figure key={e.schluessel} className="m-0" data-eintrag={e.schluessel}>
            {e.bild ? (
              <Uebungsbild bild={e.bild} name={e.alltagsname} darstellung="bewegung" />
            ) : (
              <div className="bg-surface-sunken rounded-image text-ink-muted grid aspect-[4/3] place-items-center text-xs">
                ohne Bild
              </div>
            )}
            <figcaption className="text-ink-muted mt-0.5 text-xs">
              {e.schluessel} · {e.alltagsname}
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}

/**
 * `?ansicht=muster`: das Vokabular des Zeichners auf einen Blick - jede
 * Grundstellung und jedes Hilfsmittel einmal. Für alle, die Einträge
 * schreiben; kein Katalogeintrag.
 */
const MUSTER: [string, Bild][] = [
  ...GRUNDSTELLUNGEN.map((basis): [string, Bild] => [
    `Grundstellung ${basis}`,
    { v: 1, basis, start: {}, ende: {} },
  ]),
  [
    'Brücke (loesen)',
    {
      v: 1,
      basis: 'rueckenlage_angestellt',
      unterlage: 'matte',
      start: {},
      ende: {
        huefte: [10, 10],
        knie: [80, 80],
        loesen: { winkel: 'rumpf', gleich: ['schulter', 'ferse_nah'] },
      },
      bewegung: ['becken'],
    },
  ],
  [
    'Seitlage: Bein abspreizen',
    { v: 1, basis: 'seitlage_front', unterlage: 'matte', start: {}, ende: { bein: [35, 0] } },
  ],
  [
    'Stand vorn: Hüfte abspreizen mit Halt',
    {
      v: 1,
      basis: 'stand_front',
      start: { haende: [null, 'lehne'] },
      ende: { bein: [30, 3], rumpf: -4, haende: [null, 'lehne'] },
      hilfsmittel: [{ art: 'stuhl', x: 46 }],
      bewegung: ['knoechel_nah'],
    },
  ],
  [
    'Hantel, Ball, Manschette',
    {
      v: 1,
      basis: 'sitz',
      start: { schulter: [10, 10], ellbogen: [20, 20] },
      ende: { schulter: [10, 10], ellbogen: [120, 20], knie: [20, 87] },
      hilfsmittel: [
        { art: 'hantel', an: 'hand_nah' },
        { art: 'ball', an: 'knie' },
        { art: 'manschette', an: 'knoechel_nah' },
      ],
      bewegung: ['hand_nah'],
    },
  ],
  [
    'Stab, Band, Gehstock',
    {
      v: 1,
      basis: 'stand',
      start: { schulter: [40, 40], ellbogen: [10, 10] },
      ende: { schulter: [150, 150], ellbogen: [10, 10] },
      hilfsmittel: [{ art: 'stab', an: 'haende' }],
      bewegung: ['hand_nah'],
    },
  ],
  [
    'Rudern im Langsitz mit Band',
    {
      v: 1,
      basis: 'langsitz',
      unterlage: 'matte',
      start: { rumpf: 6, schulter: [62, 58], ellbogen: [5, 5] },
      ende: { rumpf: -4, schulter: [-25, -30], ellbogen: [105, 105] },
      hilfsmittel: [{ art: 'band', von: 'zehen_nah', nach: 'hand_nah' }],
      bewegung: ['hand_nah'],
    },
  ],
  [
    'Gehen mit Stock, Kissen, Rolle, Bett',
    {
      v: 1,
      basis: 'rueckenlage',
      unterlage: 'bett',
      start: {},
      ende: { huefte: [0, 0], knie: [0, 0], sprung: [-10, 12] },
      hilfsmittel: [
        { art: 'kissen', an: 'kopf' },
        { art: 'rolle', an: 'knie_nah' },
      ],
    },
  ],
  [
    'Wand, Tisch, Türrahmen, Stufen',
    {
      v: 1,
      basis: 'stand',
      start: { haende: ['wand', 'wand'], rumpf: 20 },
      ende: { haende: ['wand', 'wand'], rumpf: 30 },
      hilfsmittel: [
        { art: 'wand', x: 70 },
        { art: 'stufe', x: -70, stufen: 3, nach: 'hinten' },
        { art: 'gehstock', an: 'hand_fern' },
      ],
      bewegung: ['schulter'],
    },
  ],
];

function Muster() {
  return (
    <main className="mx-auto max-w-5xl p-3">
      <h1 className="text-accent text-h2-mobil font-extrabold">Musterbogen</h1>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {MUSTER.map(([titel, bild]) => (
          <figure key={titel} className="m-0">
            <Uebungsbild bild={bild} name={titel} darstellung="bewegung" />
            <figcaption className="text-ink-muted mt-0.5 text-xs">{titel}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}

export function Pruefseite() {
  const mitBild = eintraege.filter((e) => e.bild).length;
  const stellungen = eintraege.filter((e) => e.bild && istAusgangsstellung(e.bild)).length;
  const ansicht = new URLSearchParams(window.location.search).get('ansicht');
  if (ansicht === 'bogen') return <Bogen />;
  if (ansicht === 'muster') return <Muster />;
  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="text-accent text-h2-mobil font-extrabold">Übungsbilder</h1>
      <p className="text-ink-muted mt-1 text-sm" role="status">
        {eintraege.length} Einträge{gruppe ? ` der Gruppe ${gruppe}` : ''}, {mitBild} mit Bild,
        davon {stellungen} nur mit der Ausgangsstellung. KI-erstellt und bis zur Durchsicht durch
        die Praxis ungeprüft.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {eintraege.map((e) => (
          <Eintrag key={e.schluessel} e={e} />
        ))}
      </div>
    </main>
  );
}
