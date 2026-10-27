import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wortmarke } from '@/components/ui/Wortmarke';
import type { CurrentUser } from '@/features/core/session/types';
import {
  fetchFleetPhotos,
  fetchWorkshopSheet,
  fotosSchluessel,
  loadFleetPhoto,
  werkstattSchluessel,
  type FleetPhoto,
  type WorkshopSheet,
} from './api';
import { bikeTypeLabels, checkItemLabels, zoneCheckItem, zoneLabel, type Severity } from './zones';
import { dateinameWerkstatt, formatTag, formatZeitpunkt } from './format';
import { aktiveStandortvorlage } from './standortvorlage';
import { todayInTimeZone } from '@/lib/datum';

/**
 * Die Unterlage für die Werkstatt als Druckblatt: Seite 1 die Stellen mit Nummer und Bauteil zum
 * Abhaken, danach je Stelle ihre Fotos. Nur Angaben zum Rad - keine Namen, kein Pannenort -, und
 * versendet wird nichts (ADR-017 Punkt 42).
 */
export function WerkstattblattPage({ user }: { user: CurrentUser }) {
  const { radId = '' } = useParams();
  const zone = user.organizationTimeZone;
  const blatt = useQuery({
    queryKey: werkstattSchluessel(radId),
    queryFn: () => fetchWorkshopSheet(radId),
    retry: false,
  });
  const zumRad = `/betrieb/flotte/rad/${radId}?bereich=stellen`;

  return (
    <Abfragezustand
      abfrage={blatt}
      laden="Unterlage wird vorbereitet …"
      fehler="Die Unterlage für die Werkstatt konnte nicht geladen werden."
      inKarte
      rahmen={(zustand) => (
        <>
          <Rueckweg standard={zumRad} beschriftung="Zurück zum Rad" />
          <PageHeader title="Unterlage für die Werkstatt" />
          {zustand}
        </>
      )}
    >
      {(daten) =>
        daten.spots.length === 0 ? (
          <>
            <Rueckweg standard={zumRad} beschriftung="Zurück zum Rad" />
            <PageHeader title="Unterlage für die Werkstatt" />
            <EmptyState inKarte title="Keine offenen Stellen" />
          </>
        ) : (
          <Unterlage blatt={daten} radId={radId} zone={zone} zumRad={zumRad} />
        )
      }
    </Abfragezustand>
  );
}

/** Drei Stellen je Detailseite (Handoff, Druckregeln). */
const JE_SEITE = 3;

function Unterlage({
  blatt,
  radId,
  zone,
  zumRad,
}: {
  blatt: WorkshopSheet;
  radId: string;
  zone: string | null;
  zumRad: string;
}) {
  const vorlage = aktiveStandortvorlage;
  const heute = todayInTimeZone(zone ?? 'Europe/Berlin');
  const name = dateinameWerkstatt(blatt.name, heute);
  const stand = `${formatZeitpunkt(new Date().toISOString(), zone)} Uhr`;

  const fotos = useQuery({
    queryKey: fotosSchluessel(radId),
    queryFn: () => fetchFleetPhotos(radId),
    retry: false,
  });
  const fotoadressen = useFotoadressen(
    (fotos.data ?? []).filter((foto) => blatt.spots.some((spot) => spot.id === foto.spot_id)),
  );

  // Der Dateiname der PDF ist der Titel des Tabs im Moment des Druckens.
  useEffect(() => {
    let vorher = document.title;
    const vor = () => {
      vorher = document.title;
      document.title = name;
    };
    const nach = () => {
      document.title = vorher;
    };
    window.addEventListener('beforeprint', vor);
    window.addEventListener('afterprint', nach);
    return () => {
      window.removeEventListener('beforeprint', vor);
      window.removeEventListener('afterprint', nach);
    };
  }, [name]);

  const probleme = blatt.spots.filter((spot) => spot.severity === 'problem').length;
  const seiten: WorkshopSheet['spots'][] = [];
  for (let start = 0; start < blatt.spots.length; start += JE_SEITE) {
    seiten.push(blatt.spots.slice(start, start + JE_SEITE));
  }
  const seitenzahl = 1 + seiten.length;
  // Erst drucken, wenn die Liste der Fotos da ist - sonst fehlten sie still auf dem Blatt.
  const bereit = fotos.isError || (fotos.isSuccess && fotoadressen.fertig);

  return (
    <>
      <div className="nicht-drucken mx-auto mb-8 flex max-w-[210mm] flex-col gap-3">
        <Rueckweg standard={zumRad} beschriftung="Zurück zum Rad" />
        <div>
          <Button
            type="button"
            disabled={!bereit}
            onClick={() => window.print()}
            className="w-full sm:w-auto"
          >
            {bereit ? 'Drucken oder als PDF sichern' : 'Wird vorbereitet …'}
          </Button>
        </div>
        {/* Nur Datei und Datenfluss (DESIGN.md Regel 6): Was auf dem Blatt
            steht, zeigt das Blatt selbst. */}
        <Kleingedrucktes>
          Datei: {name}.pdf. Versendet wird nichts automatisch; Sie schicken die Datei selbst an die
          Werkstatt. Notizen und Fotos gehen unverändert mit – bitte vor dem Weitergeben auf Angaben
          zu Patient:innen prüfen.
        </Kleingedrucktes>
        {fotos.isError || fotoadressen.fehler ? (
          <Statusmeldung ton="warnung">
            Nicht alle Fotos ließen sich laden. Die Unterlage zeigt nur die geladenen.
          </Statusmeldung>
        ) : null}
      </div>

      <article aria-label="Unterlage für die Werkstatt" className="text-ink mx-auto max-w-[210mm]">
        <Blattseite nummer={1} von={seitenzahl} rad={blatt.name}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Wortmarke farbig, 40 px, Schutzraum frei (marke/README.md). */}
            <Wortmarke hoehe={40} />
            <div className="text-right">
              <p className="text-base font-semibold">Übersicht für die Werkstatt</p>
              <p className="text-ink-muted text-sm">Stand {stand}</p>
            </div>
          </div>

          <h1 className="text-accent mt-8 text-3xl font-extrabold">{blatt.name}</h1>
          <p className="text-ink-muted mt-1 text-base">{bikeTypeLabels[blatt.bike_type].lang}</p>

          <dl className="border-line rounded-card mt-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 border p-4 text-base sm:gap-x-6">
            <dt className="text-ink-muted">An</dt>
            <dd>{vorlage.werkstatt.name}</dd>
            <dt className="text-ink-muted">Rückfragen</dt>
            <dd>{vorlage.zustaendigeRolle} · hallo@ownmotion.de</dd>
            <dt className="text-ink-muted">Zustand</dt>
            <dd>
              {blatt.blocked_since
                ? `Gesperrt seit ${formatZeitpunkt(blatt.blocked_since, zone)}`
                : 'Nicht gesperrt'}
            </dd>
            <dt className="text-ink-muted">Stellen</dt>
            <dd>
              {blatt.spots.length} markiert, davon {probleme} Problem
            </dd>
          </dl>

          <h2 className="mt-6 text-lg font-bold">Markierte Stellen</h2>
          {/* Feste Spalten mit Silbentrennung. Am Telefon steht die Einstufung
              unter dem Bauteil, und das Kästchen zum Abhaken fehlt - es gehört
              aufs Papier. A4 ist breiter als `sm`: Gedruckt bleibt die Tabelle
              wie im Entwurf. */}
          <table className="mt-3 w-full table-fixed border-collapse text-sm break-words hyphens-auto sm:text-base">
            <colgroup>
              <col className="w-10" />
              <col className="w-[38%] sm:w-[30%]" />
              <col />
              <col className="hidden w-[18%] sm:table-column" />
              <col className="hidden w-16 sm:table-column" />
            </colgroup>
            <thead>
              <tr className="border-ink border-b-2 text-left text-sm">
                <th scope="col" className="py-2 pr-2 sm:pr-3">
                  Nr.
                </th>
                <th scope="col" className="py-2 pr-2 sm:pr-3">
                  Bauteil
                </th>
                <th scope="col" className="py-2 pr-2 sm:pr-3">
                  Beschreibung
                </th>
                <th scope="col" className="hidden py-2 pr-2 sm:table-cell sm:pr-3">
                  Einstufung
                </th>
                <th scope="col" className="hidden py-2 sm:table-cell">
                  Erledigt
                </th>
              </tr>
            </thead>
            <tbody>
              {blatt.spots.map((spot) => (
                <tr key={spot.id} className="border-line border-b align-top">
                  <td className="py-2 pr-2 font-semibold tabular-nums sm:pr-3">{spot.number}</td>
                  <td className="py-2 pr-2 sm:pr-3">
                    <span className="block font-semibold">{zoneLabel(spot.zone)}</span>
                    <span className="block sm:hidden">{einstufungText(spot.severity)}</span>
                    <span className="text-ink-muted block text-sm">{herkunft(spot, zone)}</span>
                  </td>
                  <td className="py-2 pr-2 sm:pr-3">{spot.note ?? '–'}</td>
                  <td className="hidden py-2 pr-2 sm:table-cell sm:pr-3">
                    {einstufungText(spot.severity)}
                  </td>
                  <td className="hidden py-2 sm:table-cell">
                    <span
                      aria-label="Erledigt, zum Abhaken"
                      role="img"
                      className="border-ink inline-block size-6 border-2"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-ink-muted mt-4 text-sm">
            Fotos zu jeder Stelle: Seite 2{seitenzahl > 2 ? ` bis ${seitenzahl}` : ''}.
          </p>
        </Blattseite>

        {seiten.map((gruppe, index) => (
          <Blattseite
            key={gruppe[0]?.id ?? index}
            nummer={index + 2}
            von={seitenzahl}
            rad={blatt.name}
          >
            <div className="border-line flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
              <p className="text-accent text-sm font-semibold">
                {blatt.name} · Übersicht für die Werkstatt
              </p>
              <p className="text-ink-muted text-sm">Stand {stand}</p>
            </div>
            <h2 className="text-accent mt-6 text-2xl font-extrabold">Stellen im Detail</h2>
            <p className="text-ink-muted mt-1 text-base">Je Stelle die Fotos aus der Meldung.</p>
            <div className="mt-6 flex flex-col gap-4">
              {gruppe.map((spot) => {
                const pruefpunkt = zoneCheckItem(spot.zone);
                return (
                  <article
                    key={spot.id}
                    aria-label={`Stelle ${spot.number}`}
                    className="border-line rounded-card grid gap-4 border p-4 sm:grid-cols-[200px_minmax(0,1fr)]"
                  >
                    <div className="flex min-w-0 flex-col gap-2">
                      <h3 className="text-base font-semibold">
                        <span className="tabular-nums">{spot.number}</span> · {zoneLabel(spot.zone)}
                      </h3>
                      <p className="text-sm font-semibold">{einstufungText(spot.severity)}</p>
                      <p className="text-base">{spot.note ?? 'Ohne Notiz.'}</p>
                      <p className="text-ink-muted text-sm">
                        {herkunft(spot, zone)}
                        {pruefpunkt ? ` · Prüfpunkt ${checkItemLabels[pruefpunkt]}` : ''}
                      </p>
                    </div>
                    <figure className="min-w-0">
                      <Fotos
                        adressen={fotoadressen.adressen.filter(
                          (eintrag) => eintrag.spotId === spot.id,
                        )}
                        nummer={spot.number}
                      />
                      <figcaption className="text-ink-muted mt-2 text-sm">
                        {spot.source === 'breakdown'
                          ? 'Foto aus der Panne'
                          : 'Foto aus dem Check-Up'}
                      </figcaption>
                    </figure>
                  </article>
                );
              })}
            </div>
            <p className="text-ink-muted mt-6 text-sm">
              Rückfragen bitte mit der Nummer der Stelle an die {vorlage.zustaendigeRolle}.
            </p>
          </Blattseite>
        ))}
      </article>
    </>
  );
}

function herkunft(spot: WorkshopSheet['spots'][number], zone: string | null): string {
  return `${spot.source === 'breakdown' ? 'Panne' : 'Check-Up'} am ${formatTag(spot.source_at, zone)}`;
}

function einstufungText(einstufung: Severity): string {
  return einstufung === 'problem' ? '× Problem' : '! Beobachten';
}

/**
 * Eine A4-Seite. Am Bildschirm ohne Rahmen wie das Rechnungsblatt (kein
 * Kasten im Kasten), Folgeseiten mit einer Linie davor; im Druck mit
 * Seitenumbruch.
 */
function Blattseite({
  nummer,
  von,
  rad,
  children,
}: {
  nummer: number;
  von: number;
  rad: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={`Seite ${nummer} von ${von}`}
      className={`mb-8 flex flex-col print:mb-0 ${
        nummer > 1
          ? 'border-line border-t-2 pt-8 print:break-before-page print:border-0 print:pt-0'
          : ''
      }`.trim()}
    >
      <div className="flex-1">{children}</div>
      <div className="border-line text-ink-muted mt-6 flex flex-wrap justify-between gap-x-4 border-t pt-2 text-xs">
        <span>Own Motion · hallo@ownmotion.de</span>
        <span>
          {rad} · Seite {nummer} von {von}
        </span>
      </div>
    </section>
  );
}

function Fotos({
  adressen,
  nummer,
}: {
  adressen: readonly { id: string; url: string }[];
  nummer: number;
}) {
  if (adressen.length === 0) {
    return (
      <div className="bg-surface-sunken border-line text-ink-muted rounded-card border border-dashed p-4 text-center text-sm">
        Zu dieser Stelle gibt es kein Foto.
      </div>
    );
  }
  // Ohne die Ansichten des Modells hat die Zeile die ganze Breite: Ab drei Fotos stehen sie in
  // einer Reihe, damit drei Stellen weiter auf ein A4-Blatt passen.
  return (
    <div className={`grid grid-cols-2 gap-2 ${adressen.length > 2 ? 'sm:grid-cols-4' : ''}`.trim()}>
      {adressen.map((eintrag, index) => (
        <img
          key={eintrag.id}
          src={eintrag.url}
          alt={`Foto ${index + 1} zu Stelle ${nummer}`}
          className="border-line rounded-card aspect-[3/2] w-full border object-cover"
        />
      ))}
    </div>
  );
}

/**
 * Die Fotos der Stellen für das Blatt laden - in den Speicher der Seite, über
 * die einmalige Freigabe je Foto (ADR-017 Punkt 54 sinngemäß). Die Adressen
 * gehen mit der Seite.
 */
function useFotoadressen(fotos: readonly FleetPhoto[]): {
  adressen: { id: string; spotId: string | null; url: string }[];
  fertig: boolean;
  fehler: boolean;
} {
  const schluessel = fotos.map((foto) => foto.id).join(',');
  const [stand, setStand] = useState<{
    schluessel: string;
    adressen: { id: string; spotId: string | null; url: string }[];
    fertig: boolean;
    fehler: boolean;
  }>({ schluessel: '', adressen: [], fertig: false, fehler: false });

  useEffect(() => {
    let abgebrochen = false;
    const erzeugt: string[] = [];
    void (async () => {
      const adressen: { id: string; spotId: string | null; url: string }[] = [];
      let fehler = false;
      for (const foto of fotos) {
        try {
          const bild = await loadFleetPhoto(foto.id);
          const url = URL.createObjectURL(bild);
          erzeugt.push(url);
          adressen.push({ id: foto.id, spotId: foto.spot_id, url });
        } catch {
          fehler = true;
        }
        if (abgebrochen) return;
      }
      if (!abgebrochen) setStand({ schluessel, adressen, fertig: true, fehler });
    })();
    return () => {
      abgebrochen = true;
      erzeugt.forEach((url) => URL.revokeObjectURL(url));
    };
    // Neu geladen wird nur, wenn sich die Fotos ändern.
  }, [schluessel]);

  return stand.schluessel === schluessel
    ? stand
    : { adressen: [], fertig: fotos.length === 0, fehler: false };
}
