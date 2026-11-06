import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Field } from '@/components/ui/Field';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { formatDate } from '@/lib/datum';
import { ernaehrungSchluessel, fetchErnaehrung, type Ernaehrungsprofil } from './api';
import { ernaehrungsFormulare, planPfad, type Verhaeltnisart } from './eingabe';
import { lebensmittelSuchen } from './lebensmittelApi';
import { PlanFormular } from './PlanFormular';
import {
  entwurfAus,
  leererPlan,
  offenerPlan,
  planTag,
  tageText,
  type Plan,
  type PlanAngaben,
  type Planentwurf,
} from './plaene';
import {
  planAendern,
  planBeenden,
  planvorlagen,
  PLANVORLAGEN_SCHLUESSEL,
  planZuweisen,
} from './plaeneApi';
import type { Rezept } from './rezepte';
import { praxisRezepte, REZEPTE_SCHLUESSEL } from './rezepteApi';

/**
 * Der Plan an einer Beratung (ADR-027 Punkt 14, ANN-845): aus einer Vorlage oder leer zuweisen,
 * den offenen ändern oder beenden. Allein die Fähigkeit; die Auswahl trifft die Beratung.
 */

function energieziel(profil: Ernaehrungsprofil): number | undefined {
  return profil.targets.status === 'ok' ? profil.targets.energy.kcal : undefined;
}

/** Der Abschnitt „Plan“ im Reiter Ernährung: der offene Plan oder der Weg zum Zuweisen. */
export function PlanAbschnitt({
  profil,
  heute,
  art,
  verhaeltnisId,
  schreibbar,
}: {
  profil: Ernaehrungsprofil;
  heute: string;
  art: Verhaeltnisart;
  verhaeltnisId: string;
  schreibbar: boolean;
}) {
  const offen = offenerPlan(profil.plans);
  const tag = offen ? planTag(offen, heute) : null;
  return (
    <Section
      titel="Plan"
      aktion={
        schreibbar ? (
          <ButtonLink to={planPfad(art, verhaeltnisId)} variant="secondary" groesse="kompakt">
            {offen ? 'Ändern' : 'Zuweisen'}
          </ButtonLink>
        ) : null
      }
    >
      {offen ? (
        <p>
          <span className="font-semibold">{offen.title}</span>
          <span className="text-ink-muted block">
            {[
              tageText(offen.day_count),
              tag === null ? `ab ${formatDate(offen.starts_on)}` : `heute Tag ${tag}`,
            ].join(' · ')}
          </span>
        </p>
      ) : (
        <p className="text-ink-muted">Kein Plan zugewiesen.</p>
      )}
    </Section>
  );
}

function useVerhaeltnisId(art: Verhaeltnisart): string {
  const { patientId = '', relationshipId = '' } = useParams();
  return art === 'treatment' ? patientId : relationshipId;
}

/** `…/ernaehrung/plan` */
export function PlanSeite({ art }: { art: Verhaeltnisart }) {
  const verhaeltnisId = useVerhaeltnisId(art);
  const reiter = ernaehrungsFormulare(art, verhaeltnisId);
  const sicht = useQuery({
    queryKey: ernaehrungSchluessel(art, verhaeltnisId),
    queryFn: () => fetchErnaehrung(art, verhaeltnisId),
    retry: false,
    // Jedes Laden ist ein protokolliertes Öffnen des Verhältnisses.
    refetchOnWindowFocus: false,
  });
  const rezepte = useQuery({ queryKey: REZEPTE_SCHLUESSEL, queryFn: praxisRezepte });
  return (
    <>
      <Rueckweg standard={reiter} beschriftung="Zur Ernährung" className="mb-3" />
      <Abfragezustand
        abfrage={sicht}
        laden="Die Beratung wird geladen …"
        fehler="Die Beratung konnte nicht geladen werden."
        inKarte
        leer={{
          wenn: (s) => !s?.profile || s.profile.ended_on !== null,
          titel: 'Keine laufende Ernährungsberatung',
        }}
      >
        {(s) => (
          <Abfragezustand
            abfrage={rezepte}
            laden="Die Rezepte werden geladen …"
            fehler="Die Rezepte konnten nicht geladen werden."
            inKarte
          >
            {(zurWahl) => (
              <Inhalt
                art={art}
                verhaeltnisId={verhaeltnisId}
                profil={s!.profile!}
                heute={s!.today}
                rezepte={zurWahl}
              />
            )}
          </Abfragezustand>
        )}
      </Abfragezustand>
    </>
  );
}

function Inhalt({
  art,
  verhaeltnisId,
  profil,
  heute,
  rezepte,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  profil: Ernaehrungsprofil;
  heute: string;
  rezepte: Rezept[];
}) {
  const offen = offenerPlan(profil.plans);
  return offen ? (
    <>
      <PageHeader title="Plan ändern" />
      <Aendern
        art={art}
        verhaeltnisId={verhaeltnisId}
        profil={profil}
        plan={offen}
        rezepte={rezepte}
      />
    </>
  ) : (
    <>
      <PageHeader title="Plan zuweisen" />
      <Zuweisen
        art={art}
        verhaeltnisId={verhaeltnisId}
        profil={profil}
        heute={heute}
        rezepte={rezepte}
      />
    </>
  );
}

function useZurueck(art: Verhaeltnisart, verhaeltnisId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ernaehrungSchluessel(art, verhaeltnisId) });
    void navigate(ernaehrungsFormulare(art, verhaeltnisId), { replace: true });
  };
}

function Zuweisen({
  art,
  verhaeltnisId,
  profil,
  heute,
  rezepte,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  profil: Ernaehrungsprofil;
  heute: string;
  rezepte: Rezept[];
}) {
  const navigate = useNavigate();
  const zurueck = useZurueck(art, verhaeltnisId);
  const [start, setStart] = useState<Planentwurf | null>(null);
  const [beginn, setBeginn] = useState(heute);
  const vorlagen = useQuery({ queryKey: PLANVORLAGEN_SCHLUESSEL, queryFn: planvorlagen });
  const zuweisen = useMutation({
    mutationFn: ({ angaben }: { angaben: PlanAngaben; freigeben: () => void }) =>
      planZuweisen(profil.id, angaben, beginn),
    onSuccess: async (_id, { freigeben }) => {
      freigeben();
      await zurueck();
    },
  });

  if (!start) {
    return (
      <Abfragezustand
        abfrage={vorlagen}
        laden="Die Vorlagen werden geladen …"
        fehler="Die Vorlagen konnten nicht geladen werden."
        inKarte
      >
        {(liste) => (
          <div className="max-w-formular flex flex-col gap-8 [&>*]:mt-0">
            <Listenabschnitt
              titel="Aus einer Vorlage"
              anzahl={liste.length}
              leer={{ titel: 'Noch keine Vorlagen.' }}
            >
              {liste.map((v) => (
                <ListRow
                  key={v.id}
                  titel={v.title}
                  meta={tageText(v.day_count)}
                  onClick={() => setStart(entwurfAus(v))}
                />
              ))}
            </Listenabschnitt>
            <Listenabschnitt titel="Neu">
              <ListRow
                titel="Leer beginnen"
                meta="Ein Tagesvorschlag, weitere Tage nach Bedarf"
                onClick={() => setStart(leererPlan('Tagesvorschlag'))}
              />
            </Listenabschnitt>
          </div>
        )}
      </Abfragezustand>
    );
  }
  return (
    <PlanFormular
      beschriftung="Plan zuweisen"
      anfang={start}
      speichernText="Zuweisen"
      laeuft={zuweisen.isPending}
      fehlermeldung={zuweisen.error?.message}
      onSpeichern={(angaben, freigeben) => zuweisen.mutate({ angaben, freigeben })}
      onAbbrechen={() => void navigate(ernaehrungsFormulare(art, verhaeltnisId))}
      rezepte={rezepte}
      suchen={lebensmittelSuchen}
      schluessel={['lebensmittel', 'plan']}
      ziel={energieziel(profil)}
      oben={
        <Field
          label="Beginn"
          type="date"
          min={heute}
          value={beginn}
          onChange={(event) => setBeginn(event.target.value)}
        />
      }
    />
  );
}

function Aendern({
  art,
  verhaeltnisId,
  profil,
  plan,
  rezepte,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  profil: Ernaehrungsprofil;
  plan: Plan;
  rezepte: Rezept[];
}) {
  const navigate = useNavigate();
  const zurueck = useZurueck(art, verhaeltnisId);
  const speichern = useMutation({
    mutationFn: ({ angaben }: { angaben: PlanAngaben; freigeben: () => void }) =>
      planAendern(plan.id, angaben, plan.updated_at),
    onSuccess: async (_leer, { freigeben }) => {
      freigeben();
      await zurueck();
    },
  });
  const beenden = useMutation({ mutationFn: () => planBeenden(plan.id), onSuccess: zurueck });
  return (
    <PlanFormular
      beschriftung="Plan ändern"
      anfang={entwurfAus(plan)}
      speichernText="Speichern"
      laeuft={speichern.isPending}
      fehlermeldung={speichern.error?.message}
      onSpeichern={(angaben, freigeben) => speichern.mutate({ angaben, freigeben })}
      onAbbrechen={() => void navigate(ernaehrungsFormulare(art, verhaeltnisId))}
      rezepte={rezepte}
      suchen={lebensmittelSuchen}
      schluessel={['lebensmittel', 'plan']}
      ziel={energieziel(profil)}
      unten={
        <Rueckfrage
          ausloeser="Plan beenden"
          ausloeserVariante="quiet"
          bestaetigen="Plan beenden"
          bestaetigenLaeuft="Wird beendet …"
          fehler={beenden.error?.message}
          onBestaetigen={() => beenden.mutateAsync()}
        >
          <p>Ab heute steht kein Vorschlag mehr im Tagebuch. Der Plan bleibt in der Beratung.</p>
        </Rueckfrage>
      }
    />
  );
}
