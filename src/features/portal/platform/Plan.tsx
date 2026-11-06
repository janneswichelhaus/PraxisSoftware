import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { EmptyState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Pfeilzeichen } from '@/components/ui/Tagebuchbausteine';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import {
  geltenderPlan,
  planTag,
  positionMeta,
  type Plan as Ernaehrungsplan,
} from '@/features/nutrition/plaene';
import { JePortionAbschnitt } from '@/features/nutrition/RezeptFormular';
import { portionenText, zutatAus, zutatMenge, type Rezept } from '@/features/nutrition/rezepte';
import { MAHLZEIT_NAMEN } from '@/features/nutrition/tagebuch';
import { formatDate } from '@/lib/datum';
import {
  ernaehrungSchluessel,
  ladeErnaehrung,
  ladeTagebuch,
  tagebuchSchluessel,
  type Plattformzugang,
} from './api';
import { Abschnitt, Unterseitenzustand, Weiterpfeil } from './Ernaehrungsteile';
import { PLATTFORM_PFAD } from './pfade';

/**
 * Der Plan der Beratung auf der Plattform (ADR-027 Punkt 14, ANN-845): der Plan von heute mit
 * Tagen, Mahlzeiten und Rezepten. Eingetragen wird im Tagebuch; nichts wird bewertet.
 */
export const PLAN_PFAD = `${PLATTFORM_PFAD}/ernaehrung/plan`;

export function Plan({ zugang }: { zugang: Plattformzugang }) {
  const { search } = useLocation();
  const abfrage = useQuery({
    queryKey: ernaehrungSchluessel(zugang.access_id),
    queryFn: () => ladeErnaehrung(zugang.access_id),
  });
  // „Zahlen ausblenden“ ist die Einstellung der Person und gilt auch hier (ADR-027 Punkt 11).
  const tagebuch = useQuery({
    queryKey: tagebuchSchluessel(zugang.access_id, 'heute'),
    queryFn: () => ladeTagebuch(zugang.access_id, null),
  });
  const daten = abfrage.data;
  const plan = daten ? geltenderPlan(daten.profile.plans, daten.today) : undefined;
  return (
    <>
      <Rueckweg standard={`${PLATTFORM_PFAD}/ernaehrung${search}`} beschriftung="Zur Ernährung" />
      <PageHeader
        title={plan?.title ?? 'Ihr Plan'}
        description={plan && daten ? planZeile(plan, daten.today) : undefined}
        stufe="seite"
      />
      <Unterseitenzustand
        abfrage={abfrage}
        beschriftung="Ihr Plan wird geladen"
        fehler="Ihr Plan konnte nicht geladen werden."
        leer={{
          wenn: () => !plan,
          titel: 'Zurzeit kein Plan',
          beschreibung: 'Ihre Praxis kann Ihnen in der Ernährungsberatung einen Plan zuweisen.',
        }}
      >
        {(geladen) => (
          <Inhalt
            plan={plan!}
            heute={geladen!.today}
            ohneZahlen={tagebuch.data?.hide_numbers ?? false}
          />
        )}
      </Unterseitenzustand>
    </>
  );
}

/** „Heute Tag 2 von 7“, „Ab 10.11.2026“ oder „Ein Vorschlag für jeden Tag“. */
function planZeile(plan: Ernaehrungsplan, heute: string): string {
  const tag = planTag(plan, heute);
  if (tag === null) return `Ab ${formatDate(plan.starts_on)}`;
  return plan.day_count > 1
    ? `Heute Tag ${tag} von ${plan.day_count}`
    : 'Ein Vorschlag für jeden Tag';
}

function Inhalt({
  plan,
  heute,
  ohneZahlen,
}: {
  plan: Ernaehrungsplan;
  heute: string;
  ohneZahlen: boolean;
}) {
  const heuteTag = planTag(plan, heute);
  const [tag, setTag] = useState(heuteTag ?? 1);
  const [rezept, setRezept] = useState<Rezept | null>(null);
  const tagDaten = plan.days.find((d) => d.day === tag);
  const mahlzeiten = tagDaten?.meals.filter((m) => m.items.length > 0) ?? [];
  return (
    <>
      <div className="mt-6 flex flex-col gap-10 [.plattform-schrift[data-rechner]_&]:gap-12">
        {plan.day_count > 1 ? (
          <Tagwahl tag={tag} anzahl={plan.day_count} heute={heuteTag} onTag={setTag} />
        ) : null}
        {mahlzeiten.length === 0 ? (
          <EmptyState title="An diesem Tag steht nichts im Plan." />
        ) : (
          mahlzeiten.map((m) => (
            <Abschnitt key={m.meal} titel={MAHLZEIT_NAMEN[m.meal]}>
              <ListRows rahmen={false} beschriftung={MAHLZEIT_NAMEN[m.meal]}>
                {m.items.map((p, i) => {
                  const r =
                    p.kind === 'recipe' ? plan.recipes.find((x) => x.id === p.id) : undefined;
                  return (
                    <ListRow
                      key={`${p.kind}-${p.id}-${i}`}
                      titel={p.name}
                      meta={positionMeta(p, ohneZahlen)}
                      {...(r ? { onClick: () => setRezept(r), status: <Weiterpfeil /> } : {})}
                    />
                  );
                })}
              </ListRows>
            </Abschnitt>
          ))
        )}
      </div>
      {rezept ? (
        <Dialogfenster
          titel={rezept.name}
          beschreibung={portionenText(rezept.servings)}
          onSchliessen={() => setRezept(null)}
        >
          <Rezeptdetail
            rezept={rezept}
            ohneZahlen={ohneZahlen}
            onSchliessen={() => setRezept(null)}
          />
        </Dialogfenster>
      ) : null}
    </>
  );
}

/**
 * Die Tage eines Plans blättern wie die Tage im Tagebuch: Knöpfe 48 mit Rahmen, dazwischen der Tag.
 * Sieben „Tag n“ nebeneinander passten bei 375 px nicht.
 */
function Tagwahl({
  tag,
  anzahl,
  heute,
  onTag,
}: {
  tag: number;
  anzahl: number;
  heute: number | null;
  onTag: (tag: number) => void;
}) {
  return (
    <div role="group" aria-label="Tag wählen" className="flex items-center justify-between gap-2">
      <Symbolknopf
        beschriftung="Vorheriger Tag"
        variant="secondary"
        groesse="gross"
        disabled={tag <= 1}
        onClick={() => onTag(tag - 1)}
      >
        <Pfeilzeichen richtung="links" />
      </Symbolknopf>
      <p aria-live="polite" className="min-w-0 text-center font-bold tabular-nums">
        {`Tag ${tag} von ${anzahl}${tag === heute ? ' · heute' : ''}`}
      </p>
      <Symbolknopf
        beschriftung="Nächster Tag"
        variant="secondary"
        groesse="gross"
        disabled={tag >= anzahl}
        onClick={() => onTag(tag + 1)}
      >
        <Pfeilzeichen richtung="rechts" />
      </Symbolknopf>
    </div>
  );
}

/** Ein Rezept zum Nachkochen: je Portion, Zutaten für alle Portionen, Zubereitung. */
function Rezeptdetail({
  rezept,
  ohneZahlen,
  onSchliessen,
}: {
  rezept: Rezept;
  ohneZahlen: boolean;
  onSchliessen: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {ohneZahlen ? null : <JePortionAbschnitt werte={rezept.per_portion} imFenster />}
      <div className="flex flex-col gap-1">
        <Zwischentitel ebene={3}>Zutaten</Zwischentitel>
        <ListRows rahmen={false} beschriftung="Zutaten">
          {rezept.ingredients.map((z, i) => (
            <ListRow
              key={`${z.food_id}-${i}`}
              dicht
              titel={z.name}
              meta={zutatMenge(zutatAus(z))}
            />
          ))}
        </ListRows>
      </div>
      {rezept.instructions ? (
        <div className="flex flex-col gap-1">
          <Zwischentitel ebene={3}>Zubereitung</Zwischentitel>
          <p className="whitespace-pre-line">{rezept.instructions}</p>
        </div>
      ) : null}
      <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onSchliessen}>
        Schließen
      </Button>
    </div>
  );
}
