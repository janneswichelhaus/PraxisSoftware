import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { fetchPatient, fullName } from '@/features/patients/api';
import { Patientensuche } from '@/features/patients/Patientensuche';
import type { CurrentUser } from '@/features/session/types';
import { grundlageBezeichnung } from '@/features/treatment-bases/api';
import {
  eindeutigeGrundlage,
  useVerordnungenDerAkte,
  zustandLabels,
  type VerordnungMitZahlen,
} from '@/features/treatment-bases/grundlagen';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import { leseTerminVorbelegung, schreibeTerminVorbelegung } from './api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Dauertermin aus dem Kalender, wenn die Zeit feststeht und die Person noch
 * nicht (BEF-042).
 *
 * Bis UX-002j war „Dauertermin" im Anlegen-Menü ausgegraut, solange der
 * Kalender nicht auf eine Patient:in gefiltert war — der neue Termin dagegen
 * fragte im Formular nach der Person. Jetzt gehen beide Wege gleich: Zeit
 * markieren, dann die Person, dann, wenn nötig, die Grundlage.
 *
 * Fachlich bleibt die Serie an einer Behandlungsgrundlage, weil deren
 * Kontingent die Anzahl vorgibt (CAL-007, ADR-020). Diese Seite ändert nur
 * die Reihenfolge der Fragen und führt dann auf die eine Serienseite — einen
 * zweiten Anlageweg gibt es nicht.
 */
export function DauerterminStartPage({ user }: { user: CurrentUser }) {
  const [suche, setSuche] = useSearchParams();
  const vorbelegung = leseTerminVorbelegung(suche);
  const gewaehlt = suche.get('patient');
  const patientId = gewaehlt && UUID.test(gewaehlt) ? gewaehlt : null;

  // Tag und Beginn reisen weiter; die Länge nicht, sie steht beim
  // Behandlungstermin im Terminfenster (wie auf der Serienseite).
  const anhang = schreibeTerminVorbelegung({
    ...(vorbelegung.datum ? { datum: vorbelegung.datum } : {}),
    ...(vorbelegung.beginn ? { beginn: vorbelegung.beginn } : {}),
  });

  // Die gewählte Person steht in der Adresse: neu laden und Zurück behalten
  // sie, und „Andere Patient:in" ist nur ein Parameter weniger.
  function waehlePatient(id: string | null) {
    const naechste = new URLSearchParams(suche);
    if (id) naechste.set('patient', id);
    else naechste.delete('patient');
    setSuche(naechste);
  }

  const zeit = [vorbelegung.datum ? formatDate(vorbelegung.datum) : null, vorbelegung.beginn]
    .filter(Boolean)
    .join(', ab ');

  return (
    <>
      <PageHeader
        title={`${BEGRIFFE.dauertermin} anlegen`}
        description="Zuerst die Patient:in, dann die Behandlungsgrundlage. Rhythmus und Anzahl folgen im nächsten Schritt."
      />

      <Section titel="Vorbelegung">
        <DetailList>
          <DetailRow label="Erster Termin">{zeit ? `${zeit} Uhr` : 'noch offen'}</DetailRow>
        </DetailList>
      </Section>

      {patientId === null ? (
        <Section titel="Patient:in">
          <div className="max-w-md">
            <Patientensuche label="Patient:in suchen" labelSichtbar onAuswahl={waehlePatient} />
          </div>
        </Section>
      ) : (
        <Grundlagenwahl
          patientId={patientId}
          user={user}
          anhang={anhang}
          zurueck={() => waehlePatient(null)}
        />
      )}
    </>
  );
}

/** Der zweite Schritt, sobald die Person feststeht. */
function Grundlagenwahl({
  patientId,
  user,
  anhang,
  zurueck,
}: {
  patientId: string;
  user: CurrentUser;
  anhang: string;
  zurueck: () => void;
}) {
  const navigate = useNavigate();
  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    retry: false,
  });
  const { eintraege, isPending, zahlenGeladen, isError } = useVerordnungenDerAkte(patientId, user);
  const serie = (grundlageId: string) =>
    `/patienten/${patientId}/verordnungen/${grundlageId}/serie${anhang}`;

  // Erst mit den Zahlen entscheiden: Ohne sie gälte jede Grundlage als offen.
  const eindeutig = !isPending && zahlenGeladen ? eindeutigeGrundlage(eintraege) : null;

  // Steht die Grundlage fest, gibt es nichts zu fragen. `replace`, damit
  // Zurück nicht auf eine Seite führt, die sofort weiterleitet.
  useEffect(() => {
    if (eindeutig) void navigate(serie(eindeutig), { replace: true });
  }, [eindeutig, anhang, navigate]);

  const offen = eintraege.filter((eintrag) => eintrag.zustand === 'offen');
  const weitere = eintraege.filter((eintrag) => eintrag.zustand !== 'offen');

  return (
    <Section
      titel={patient.data ? `Grundlage für ${fullName(patient.data)}` : 'Grundlage'}
      aktion={
        <button
          type="button"
          onClick={zurueck}
          className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
        >
          Andere Patient:in
        </button>
      }
    >
      {isError ? (
        <ErrorState
          title="Die Behandlungsgrundlagen konnten nicht geladen werden."
          description="Bitte später erneut versuchen."
        />
      ) : isPending || !zahlenGeladen || eindeutig ? (
        <LoadingState label="Behandlungsgrundlagen werden geladen …" />
      ) : eintraege.length === 0 ? (
        <>
          <EmptyState
            title="Keine Behandlungsgrundlage"
            description="Eine Terminserie hängt an einer Verordnung oder Selbstzahler-Vereinbarung. Zuerst eine anlegen."
          />
          <p className="text-center">
            <Link
              to={`/patienten/${patientId}/verordnungen/neu`}
              className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
            >
              Grundlage anlegen
            </Link>
          </p>
        </>
      ) : (
        <>
          {offen.length > 0 ? (
            <Grundlagenliste eintraege={offen} ziel={serie} label="Offene Grundlagen" />
          ) : (
            <p className="text-ink-muted max-w-prose text-sm">
              Keine Grundlage hat noch etwas zu planen. Eine Serie darüber hinaus ist möglich; die
              nächste Seite zeigt, was ungedeckt bleibt.
            </p>
          )}
          {weitere.length > 0 ? (
            // Was selten gebraucht wird, steht eingeklappt (Bedienprinzipien,
            // UX-EPIC-002). Ohne offene Grundlage ist es das einzige Angebot
            // und steht deshalb offen.
            <details className="mt-4" open={offen.length === 0}>
              <summary className="text-ink-muted hover:text-ink inline-flex min-h-11 cursor-pointer items-center text-sm">
                Verplante und ausgeschöpfte ({weitere.length})
              </summary>
              <Grundlagenliste
                eintraege={weitere}
                ziel={serie}
                label="Verplante und ausgeschöpfte Grundlagen"
              />
            </details>
          ) : null}
        </>
      )}
    </Section>
  );
}

function Grundlagenliste({
  eintraege,
  ziel,
  label,
}: {
  eintraege: readonly VerordnungMitZahlen[];
  ziel: (grundlageId: string) => string;
  label: string;
}) {
  return (
    <ul aria-label={label} className="divide-line border-line max-w-xl divide-y border-y">
      {eintraege.map(({ verordnung, kontingent, zustand }) => {
        const { bauart, praeposition } = grundlageBezeichnung(verordnung);
        const rest = kontingent?.remaining ?? 0;
        return (
          <li key={verordnung.id}>
            <Link
              to={ziel(verordnung.id)}
              className="hover:bg-surface-sunken flex min-h-11 flex-col justify-center px-1 py-2.5"
            >
              <span className="text-ink text-[0.9375rem]">
                {bauart} {praeposition} {formatDate(verordnung.issued_on)}
              </span>
              <span className="text-ink-muted text-sm">
                {[
                  verordnung.prescriber_name,
                  zustand === 'offen'
                    ? `noch ${rest} ${rest === 1 ? 'Behandlung' : 'Behandlungen'} zu planen`
                    : zustandLabels[zustand],
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
