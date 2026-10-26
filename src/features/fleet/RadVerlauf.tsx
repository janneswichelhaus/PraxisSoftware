import { Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import type { BikeDetail, FleetPhoto } from './api';
import { checkItemLabels, type CheckItemKey } from './zones';
import { formatTag, formatZeitpunkt } from './format';
import { Fotoreihe } from './Fotoreihe';

/**
 * Der Verlauf eines Rads (FLT-EPIC-001): Check-Ups, Pannen, Sperren und
 * Freigaben in einer Liste, neueste zuerst; der Schlüssel eingeklappt
 * darunter - er wechselt zweimal am Tag und steht nur 30 Tage (ANN-551).
 *
 * Wer geprüft oder gemeldet hat, steht am Ereignis (Handoff, Abschnitt 6);
 * eine Auswertung je Person gibt es nicht (§20).
 */
interface Eintrag {
  key: string;
  zeit: string;
  titel: string;
  zeilen: string[];
  fotos?: FleetPhoto[];
}

function pruefpunkte(
  items: BikeDetail['checkups'][number]['items'],
  wert: 'problem' | 'beobachten',
) {
  return items
    .filter((item) => item.rating === wert)
    .map((item) =>
      item.key in checkItemLabels ? checkItemLabels[item.key as CheckItemKey] : item.key,
    );
}

export function RadVerlauf({
  detail,
  fotos,
  zone,
}: {
  detail: BikeDetail;
  fotos: readonly FleetPhoto[];
  zone: string | null;
}) {
  const eintraege: Eintrag[] = [
    ...detail.checkups.map((checkup) => {
      const probleme = pruefpunkte(checkup.items, 'problem');
      const beobachten = pruefpunkte(checkup.items, 'beobachten');
      const notizen = checkup.items
        .filter((item) => item.note)
        .map(
          (item) => `${checkItemLabels[item.key as CheckItemKey] ?? item.key}: ${item.note ?? ''}`,
        );
      return {
        key: `c-${checkup.id}`,
        zeit: checkup.checked_at,
        titel: 'Check-Up',
        zeilen: [
          [formatZeitpunkt(checkup.checked_at, zone), checkup.checked_by_name]
            .filter(Boolean)
            .join(' · '),
          probleme.length > 0 ? `Problem: ${probleme.join(', ')}` : '',
          beobachten.length > 0 ? `Beobachten: ${beobachten.join(', ')}` : '',
          probleme.length === 0 && beobachten.length === 0 ? 'Alles in Ordnung' : '',
          ...notizen,
          checkup.note ? `Notiz: ${checkup.note}` : '',
        ].filter(Boolean),
        fotos: fotos.filter((foto) => foto.checkup_id === checkup.id),
      };
    }),
    ...detail.breakdowns.map((panne) => ({
      key: `p-${panne.id}`,
      zeit: panne.reported_at,
      titel: panne.blocks ? 'Panne, Rad gesperrt' : 'Panne, ohne Sperre',
      zeilen: [
        [formatZeitpunkt(panne.reported_at, zone), panne.reported_by_name]
          .filter(Boolean)
          .join(' · '),
        panne.summary,
        panne.location_note ? `Standort: ${panne.location_note}` : '',
      ].filter(Boolean),
    })),
    ...detail.blocks.flatMap((sperre) => [
      ...(sperre.breakdown_id
        ? []
        : [
            {
              key: `s-${sperre.id}`,
              zeit: sperre.blocked_at,
              titel: 'Gesperrt',
              zeilen: [
                [formatZeitpunkt(sperre.blocked_at, zone), sperre.blocked_by_name]
                  .filter(Boolean)
                  .join(' · '),
                sperre.reason ?? '',
              ].filter(Boolean),
            },
          ]),
      ...(sperre.released_at
        ? [
            {
              key: `f-${sperre.id}`,
              zeit: sperre.released_at,
              titel: 'Freigegeben',
              zeilen: [
                [formatZeitpunkt(sperre.released_at, zone), sperre.released_by_name]
                  .filter(Boolean)
                  .join(' · '),
              ],
            },
          ]
        : []),
    ]),
  ].sort((a, b) => b.zeit.localeCompare(a.zeit));

  return (
    <>
      <Listenabschnitt
        titel="Verlauf"
        anzahl={eintraege.length}
        leer={{ titel: 'Noch kein Check-Up und keine Panne' }}
      >
        {eintraege.map((eintrag) => (
          <ListRow
            key={eintrag.key}
            titel={eintrag.titel}
            meta={eintrag.zeilen.map((zeile, index) => (
              <span key={index} className="block">
                {zeile}
              </span>
            ))}
            darunter={
              eintrag.fotos && eintrag.fotos.length > 0 ? (
                <Fotoreihe fotos={eintrag.fotos} bezug="vom ganzen Rad" />
              ) : undefined
            }
          />
        ))}
      </Listenabschnitt>

      {detail.keys.length > 0 ? (
        <div className="mt-8">
          <Disclosure summary="Schlüssel, letzte 30 Tage" anzahl={detail.keys.length}>
            <ListRows rahmen={false} beschriftung="Schlüssel">
              {detail.keys.map((schluessel) => (
                <ListRow
                  key={`${schluessel.taken_at}-${schluessel.holder_name ?? ''}`}
                  zeit={formatTag(schluessel.taken_at, zone)}
                  titel={schluessel.holder_name ?? 'Ohne Namen'}
                  meta={
                    schluessel.returned_at
                      ? `${formatZeitpunkt(schluessel.taken_at, zone)} bis ${formatZeitpunkt(schluessel.returned_at, zone)}`
                      : `seit ${formatZeitpunkt(schluessel.taken_at, zone)}, noch nicht zurückgelegt`
                  }
                />
              ))}
            </ListRows>
          </Disclosure>
        </div>
      ) : null}
    </>
  );
}
