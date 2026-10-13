import { dosierungAlltag, dosierungFachlich } from '@/features/exercise-plans/dosierung';
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

export function Pruefseite() {
  const mitBild = eintraege.filter((e) => e.bild).length;
  if (new URLSearchParams(window.location.search).get('ansicht') === 'bogen') return <Bogen />;
  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="text-accent text-h2-mobil font-extrabold">Übungsbilder</h1>
      <p className="text-ink-muted mt-1 text-sm" role="status">
        {eintraege.length} Einträge{gruppe ? ` der Gruppe ${gruppe}` : ''}, {mitBild} mit Bild.
        KI-erstellt und bis zur Durchsicht durch die Praxis ungeprüft.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {eintraege.map((e) => (
          <Eintrag key={e.schluessel} e={e} />
        ))}
      </div>
    </main>
  );
}
