import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { EmptyState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Segment } from '@/components/ui/Segment';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import {
  offenerPlan,
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
import { Abschnitt } from './Ernaehrungsteile';
import { PLATTFORM_PFAD } from './pfade';

/**
 * Der Plan der Beratung auf der Plattform (ADR-027 Punkt 14, ANN-845): Tage, Mahlzeiten und die
 * Rezepte mit Zutaten und Zubereitung. Eingetragen wird im Tagebuch; nichts wird bewertet.
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
  const plan = abfrage.data ? offenerPlan(abfrage.data.profile.plans) : undefined;
  return (
    <>
      <Rueckweg standard={`${PLATTFORM_PFAD}/ernaehrung${search}`} beschriftung="Zur Ernährung" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Wird geladen …"
        fehler="Ihr Plan konnte nicht geladen werden."
        inKarte
        leer={{
          wenn: (daten) => !daten || !plan,
          titel: 'Zurzeit kein Plan',
          beschreibung: 'Ihre Praxis kann Ihnen in der Ernährungsberatung einen Plan zuweisen.',
          markenform: true,
        }}
      >
        {(daten) => (
          <Inhalt
            plan={plan!}
            heute={daten!.today}
            ohneZahlen={tagebuch.data?.hide_numbers ?? false}
          />
        )}
      </Abfragezustand>
    </>
  );
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
      <PageHeader
        title={plan.title}
        description={
          heuteTag === null
            ? `Ab ${formatDate(plan.starts_on)}`
            : plan.day_count > 1
              ? `Heute Tag ${heuteTag} von ${plan.day_count}`
              : 'Ein Vorschlag für jeden Tag'
        }
        stufe="seite"
      />
      <div className="mt-6 flex flex-col gap-10">
        {plan.day_count > 1 ? (
          <Segment
            beschriftung="Tag wählen"
            wahlen={plan.days.map((d) => ({ wert: String(d.day), text: `Tag ${d.day}` }))}
            gewaehlt={String(tag)}
            onWaehlen={(wert: string) => setTag(Number(wert))}
          />
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
                      {...(r ? { onClick: () => setRezept(r) } : {})}
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
          <Rezeptdetail rezept={rezept} ohneZahlen={ohneZahlen} />
        </Dialogfenster>
      ) : null}
    </>
  );
}

/** Ein Rezept zum Nachkochen: je Portion, Zutaten für alle Portionen, Zubereitung. */
function Rezeptdetail({ rezept, ohneZahlen }: { rezept: Rezept; ohneZahlen: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {ohneZahlen ? null : <JePortionAbschnitt werte={rezept.per_portion} />}
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
    </div>
  );
}
