import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { formatDate } from '@/lib/datum';
import { fetchTagebuch, tagebuchSchluessel, type TagebuchDerBeratung as Daten } from './api';
import {
  grammVon,
  kcal,
  MAHLZEIT_NAMEN,
  mengeText,
  wasserText,
  type Tagebuchtag,
  type Tagesziele,
} from './tagebuch';

/**
 * Das Tagebuch im Reiter „Ernährung“ (ERN-010, ADR-027 Punkte 4 und 10): die
 * Beratung liest mit - sieben Tage, ein Tipp öffnet den Tag mit seinen
 * Mahlzeiten. Sie schreibt nicht hinein. Geladen wird nur auf Abruf und
 * einmal; jedes Laden steht als Öffnen des Verhältnisses im Protokoll.
 */
export function TagebuchDerBeratung({ profilId }: { profilId: string }) {
  const [bis, setBis] = useState<string | null>(null);
  const [offen, setOffen] = useState<Tagebuchtag | null>(null);
  const abfrage = useQuery({
    queryKey: tagebuchSchluessel(profilId, bis),
    queryFn: () => fetchTagebuch(profilId, bis),
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
  return (
    <Abfragezustand
      abfrage={abfrage}
      laden="Das Tagebuch wird geladen …"
      fehler="Das Tagebuch konnte nicht geladen werden."
      inKarte
      leer={{ wenn: (daten) => !daten, titel: 'Nicht freigegeben' }}
    >
      {(daten) => (
        <>
          <Woche
            daten={daten!}
            onFrueher={() => setBis(vortag(daten!.from))}
            onOeffnen={setOffen}
          />
          {offen ? (
            <Tagesfenster tag={offen} ziele={daten!.targets} onSchliessen={() => setOffen(null)} />
          ) : null}
        </>
      )}
    </Abfragezustand>
  );
}

function vortag(tag: string): string {
  const d = new Date(`${tag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function Woche({
  daten,
  onFrueher,
  onOeffnen,
}: {
  daten: Daten;
  onFrueher: () => void;
  onOeffnen: (tag: Tagebuchtag) => void;
}) {
  const ziel = daten.targets?.energy_kcal;
  return (
    <Listenabschnitt
      titel="Tagebuch"
      {...(daten.from > daten.started_on
        ? {
            mehr: (
              <Button type="button" variant="quiet" onClick={onFrueher}>
                Frühere Tage
              </Button>
            ),
          }
        : {})}
    >
      {daten.days.map((t) => {
        const anzahl = t.meals.reduce((n, m) => n + m.entries.length, 0);
        return (
          <ListRow
            key={t.day}
            titel={formatDate(t.day)}
            meta={
              anzahl === 0
                ? `Nichts eingetragen${t.water_ml > 0 ? ` · ${wasserText(t.water_ml)} Wasser` : ''}`
                : `${anzahl} ${anzahl === 1 ? 'Eintrag' : 'Einträge'} · ${wasserText(t.water_ml)} Wasser`
            }
            betrag={
              anzahl === 0
                ? undefined
                : `${kcal(t.totals.energy_kcal)}${ziel ? ` von ${kcal(ziel)}` : ''}`
            }
            {...(anzahl > 0 ? { onClick: () => onOeffnen(t) } : {})}
          />
        );
      })}
    </Listenabschnitt>
  );
}

function Tagesfenster({
  tag,
  ziele,
  onSchliessen,
}: {
  tag: Tagebuchtag;
  ziele: Tagesziele;
  onSchliessen: () => void;
}) {
  const s = tag.totals;
  return (
    <Dialogfenster
      titel={formatDate(tag.day)}
      beschreibung={`${kcal(s.energy_kcal)}${ziele ? ` von ${kcal(ziele.energy_kcal)}` : ''} · ${wasserText(tag.water_ml)} Wasser`}
      onSchliessen={onSchliessen}
    >
      <div className="flex flex-col gap-6">
        {ziele ? (
          <Listenabschnitt titel="Nährwerte" ebene={3}>
            <ListRow dicht titel="Eiweiß" betrag={grammVon(s.protein_g, ziele.protein_g)} />
            <ListRow
              dicht
              titel="Kohlenhydrate"
              betrag={grammVon(s.carbohydrate_g, ziele.carbohydrate_g)}
            />
            <ListRow dicht titel="Fett" betrag={grammVon(s.fat_g, ziele.fat_g)} />
          </Listenabschnitt>
        ) : null}
        {tag.meals
          .filter((m) => m.entries.length > 0)
          .map((m) => (
            <Listenabschnitt key={m.meal} titel={MAHLZEIT_NAMEN[m.meal]} ebene={3}>
              {m.entries.map((e) => (
                <ListRow
                  key={e.id}
                  titel={e.name}
                  meta={`${mengeText(e)}${e.recorded_by_kind === 'legal_representative' ? ' · von der Vertretung' : ''}`}
                  betrag={kcal(e.energy_kcal)}
                />
              ))}
            </Listenabschnitt>
          ))}
      </div>
    </Dialogfenster>
  );
}
