import type { ReactNode } from 'react';
import { EmptyState, ErrorState, LoadingState } from './Feedback';
import { NachladeHinweis } from './Rueckmeldung';
import { VERBINDUNG_PRUEFEN } from './abfrageTexte';

/** Was der Baustein von einer Abfrage (`useQuery`) braucht. */
export interface Abfrage<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}

/**
 * Laden, Fehler, Leer, Veraltet und Inhalt einer Abfrage an einer Stelle
 * (Design-Fundament, DESIGN.md „Zustände“, ANN-406).
 *
 * Bis dahin schrieb jede Seite die Weiche selbst (`isPending ? … : isError ?
 * …`, rund 200-mal) und den Satz zum Fehler dazu. Jetzt:
 *
 *   * **Laden** in Zielgröße: `LoadingState` mit `laden` als Satz, mit
 *     `inKarte` in einer Karte, mit `kacheln` leeren Kachelflächen darüber.
 *   * **Fehler ohne Stand:** `ErrorState` mit `fehler` als Titel, dem einen
 *     Satz `VERBINDUNG_PRUEFEN` und „Erneut versuchen“.
 *   * **Fehler mit Stand** (das Nachladen scheiterte): der Inhalt bleibt, darüber
 *     „Der angezeigte Stand konnte nicht aktualisiert werden …“ mit „Erneut
 *     versuchen“ (`NachladeHinweis`) - nie ein Formular, das mitten in der
 *     Eingabe verschwindet.
 *   * **Leer:** trifft `leer.wenn` zu, ein `EmptyState` (in einer Karte, wenn
 *     `inKarte`) mit dem nächsten Schritt.
 *   * Sonst `children(daten)`.
 */
export function Abfragezustand<T>({
  abfrage,
  laden,
  fehler,
  leer,
  inKarte = false,
  kacheln = 0,
  children,
}: {
  abfrage: Abfrage<T>;
  /** Satz beim Laden, etwa „Patientenliste wird geladen …“. */
  laden: string;
  /** Titel des Fehlers, etwa „Die Patientenliste konnte nicht geladen werden.“ */
  fehler: string;
  leer?: {
    wenn: (daten: T) => boolean;
    titel: string;
    beschreibung?: string;
    aktion?: ReactNode;
  };
  inKarte?: boolean;
  kacheln?: number;
  children: (daten: T) => ReactNode;
}) {
  const { data, isPending, isError, isFetching } = abfrage;

  if (data === undefined) {
    if (isPending) return <LoadingState label={laden} inKarte={inKarte} kacheln={kacheln} />;
    if (isError) {
      return (
        <ErrorState title={fehler} description={VERBINDUNG_PRUEFEN} onErneut={abfrage.refetch} />
      );
    }
    return null;
  }

  return (
    <>
      {isError ? (
        <NachladeHinweis
          className="mb-3"
          laeuft={isFetching}
          onErneut={() => void abfrage.refetch()}
        />
      ) : null}
      {leer && leer.wenn(data) ? (
        <EmptyState
          inKarte={inKarte}
          title={leer.titel}
          description={leer.beschreibung}
          {...(leer.aktion === undefined ? {} : { aktion: leer.aktion })}
        />
      ) : (
        children(data)
      )}
    </>
  );
}
