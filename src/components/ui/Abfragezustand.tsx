import type { ReactNode } from 'react';
import { EmptyState, ErrorState, LoadingState } from './Feedback';
import { NachladeHinweis } from './Rueckmeldung';
import { VERBINDUNG_PRUEFEN } from './abfrageTexte';

/** Was der Baustein von einer Abfrage (`useQuery`) braucht. */
export interface Abfrage<T> {
  data: T | undefined;
  /** Der Fehler selbst - gebraucht nur für `endgueltig`. */
  error?: unknown;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}

/**
 * Laden, Fehler, Leer, Veraltet und Inhalt einer Abfrage an einer Stelle (DESIGN.md „Zustände“,
 * ANN-406): Scheitert nur das Nachladen, bleibt der Inhalt - nie verschwindet ein Formular
 * mitten in der Eingabe; was der Server endgültig abweist, ersetzt auch einen alten Stand.
 */
export function Abfragezustand<T>({
  abfrage,
  laden,
  fehler,
  endgueltig,
  leer,
  inKarte = false,
  kacheln = 0,
  ausweg,
  rahmen = ohneRahmen,
  children,
}: {
  abfrage: Abfrage<T>;
  /** Satz beim Laden, etwa „Patientenliste wird geladen …“. */
  laden: string;
  /** Titel des Fehlers, etwa „Die Patientenliste konnte nicht geladen werden.“ */
  fehler: string;
  /** Ein Fehler, den kein neuer Versuch behebt, und sein Titel. */
  endgueltig?: {
    wenn: (fehler: unknown) => boolean;
    titel: string;
  };
  leer?: {
    wenn: (daten: T) => boolean;
    titel: string;
    beschreibung?: string;
    aktion?: ReactNode;
    /** Die Fassung der Plattform, wo der Leerzustand der Inhalt der Seite ist (ANN-803). */
    markenform?: boolean;
  };
  inKarte?: boolean;
  kacheln?: number;
  /** Der Weg hinaus unter jeder Fehlermeldung, etwa „Zur Übersicht“. */
  ausweg?: ReactNode;
  /** Die Hülle um Laden und Fehler - nicht um den Inhalt. */
  rahmen?: (zustand: ReactNode) => ReactNode;
  children: (daten: T) => ReactNode;
}) {
  const { data, error, isPending, isError, isFetching } = abfrage;
  const alsFehler = (meldung: ReactNode) =>
    rahmen(
      ausweg === undefined ? (
        meldung
      ) : (
        <>
          {meldung}
          {ausweg}
        </>
      ),
    );

  if (isError && endgueltig?.wenn(error)) return alsFehler(<ErrorState title={endgueltig.titel} />);

  if (data === undefined) {
    if (isPending) {
      return rahmen(<LoadingState label={laden} inKarte={inKarte} kacheln={kacheln} />);
    }
    if (isError) {
      return alsFehler(
        <ErrorState title={fehler} description={VERBINDUNG_PRUEFEN} onErneut={abfrage.refetch} />,
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
          inKarte={inKarte && !leer.markenform}
          markenform={leer.markenform ?? false}
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

/** Ohne eigene Hülle stehen Laden und Fehler, wo der Inhalt stünde. */
function ohneRahmen(zustand: ReactNode): ReactNode {
  return zustand;
}
