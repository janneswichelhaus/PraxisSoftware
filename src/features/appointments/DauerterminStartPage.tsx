import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { fetchPatient, fullName } from '@/features/patients/api';
import { Patientenauswahl } from '@/features/patients/Patientenauswahl';
import { canWriteTreatmentBases, type CurrentUser } from '@/features/session/types';
import { grundlageBezeichnung } from '@/features/treatment-bases/api';
import {
  eindeutigeGrundlage,
  useVerordnungenDerAkte,
  zustandLabels,
  type VerordnungMitZahlen,
} from '@/features/treatment-bases/grundlagen';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { leseTerminVorbelegung, schreibeTerminVorbelegung } from '@/lib/termin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Für eine Serie zählt von den Karteileichen nur diese (B1, B10). */
const NUR_TERMINE_FEHLEN = ['termine_fehlen'] as const;

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
 *
 * **Person und Rückweg reisen mit (KAL-05).** Die behandelnde Person der
 * angetippten Spalte geht wie beim neuen Termin an die Serienseite, und der
 * Kalenderstand als Rückweg ebenso. Der Abstecher „Grundlage erfassen" kehrt
 * hierher zurück - samt Zeit und Person (VER-05).
 */
export function DauerterminStartPage({ user }: { user: CurrentUser }) {
  const [suche, setSuche] = useSearchParams();
  const ort = useLocation();
  const vorbelegung = leseTerminVorbelegung(suche);
  const gewaehlt = suche.get('patient');
  const patientId = gewaehlt && UUID.test(gewaehlt) ? gewaehlt : null;
  // Der Rückweg des Aufrufers - meist der Kalenderstand (KAL-05).
  const rueckweg = leseRueckweg(suche, '');

  // Tag, Beginn und die Person der Spalte reisen weiter; die Länge nicht, sie
  // steht beim Behandlungstermin im Terminfenster (wie auf der Serienseite).
  const anhang = schreibeTerminVorbelegung({
    ...(vorbelegung.datum ? { datum: vorbelegung.datum } : {}),
    ...(vorbelegung.beginn ? { beginn: vorbelegung.beginn } : {}),
    ...(vorbelegung.person ? { person: vorbelegung.person } : {}),
  });

  // Die gewählte Person steht in der Adresse: neu laden und Zurück behalten
  // sie, und „Andere Patient:in" ist nur ein Parameter weniger.
  function waehlePatient(id: string | null) {
    const naechste = new URLSearchParams(suche);
    if (id) naechste.set('patient', id);
    else naechste.delete('patient');
    setSuche(naechste);
  }

  // Die Patientenanlage hängt die neue Kennung an diese Adresse an - damit
  // steht die Person gewählt da (NewPatientPage, UX-012).
  const anlegen = mitRueckweg('/patienten/neu', `${ort.pathname}${ort.search}`);
  const anlegenKnopf = (
    <ButtonLink to={anlegen} variant="secondary" groesse="kompakt">
      Patient:in anlegen
    </ButtonLink>
  );

  // „Uhr" nur mit einem Beginn - ohne ihn stand „28.09.2026 Uhr" da (KAL-10).
  const zeit = vorbelegung.datum
    ? `${formatDate(vorbelegung.datum)}${vorbelegung.beginn ? `, ab ${vorbelegung.beginn} Uhr` : ''}`
    : vorbelegung.beginn
      ? `ab ${vorbelegung.beginn} Uhr`
      : null;

  return (
    <>
      {/* Der Weg zurück, meist in den Kalenderstand (KAL-19). */}
      <Rueckweg standard="/kalender" />

      {/* Nur der erste Satz; was im nächsten Schritt folgt, zeigt der nächste
          Schritt (UX-005g). */}
      <PageHeader
        title={`${BEGRIFFE.dauertermin} anlegen`}
        description="Zuerst die Patient:in, dann die Behandlungsgrundlage."
        // Wie beim Termin: Die Gesuchte ist neu - anlegen und mit ihr hierher
        // zurück, gleich in den zweiten Schritt (Design-Review A, Befund 6).
        actions={
          patientId === null ? (
            <ButtonLink to={anlegen} variant="secondary">
              Patient:in anlegen
            </ButtonLink>
          ) : undefined
        }
      />

      {/* Eine Zeile statt Abschnitt und Tabelle für einen einzigen Wert (UX-005g). */}
      {zeit ? <p className="text-ink text-liste mb-8 font-medium">Erster Termin: {zeit}</p> : null}

      {patientId === null ? (
        <Section titel="Patient:in">
          {/* B10 (BEF-160): die Liste zum Filtern und Sortieren statt der
              Suche ab drei Zeichen. Eine Zeile wählt die Person. */}
          <Patientenauswahl
            ziel={(id) => {
              const naechste = new URLSearchParams(suche);
              naechste.set('patient', id);
              return `${ort.pathname}?${naechste.toString()}`;
            }}
            wahlenNur={NUR_TERMINE_FEHLEN}
            leer={{ titel: 'Noch keine Patient:innen', aktion: anlegenKnopf }}
            anlegen={anlegenKnopf}
          />
        </Section>
      ) : (
        <Grundlagenwahl
          patientId={patientId}
          user={user}
          anhang={anhang}
          rueckweg={rueckweg}
          hierher={`${ort.pathname}${ort.search}`}
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
  rueckweg,
  hierher,
  zurueck,
}: {
  patientId: string;
  user: CurrentUser;
  anhang: string;
  /** Wohin die Serienseite nach dem Anlegen zurückführt (KAL-05). */
  rueckweg: string;
  /** Diese Seite samt Zeit und Person - Rückweg des Abstechers (VER-05). */
  hierher: string;
  zurueck: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    retry: false,
  });
  const { eintraege, isPending, zahlenGeladen, isError } = useVerordnungenDerAkte(patientId, user);
  const serie = (grundlageId: string) =>
    mitRueckweg(`/patienten/${patientId}/verordnungen/${grundlageId}/serie${anhang}`, rueckweg);

  // Erst mit den Zahlen entscheiden: Ohne sie gälte jede Grundlage als offen.
  const eindeutig = !isPending && zahlenGeladen ? eindeutigeGrundlage(eintraege) : null;

  // Steht die Grundlage fest, gibt es nichts zu fragen. `replace`, damit
  // Zurück nicht auf eine Seite führt, die sofort weiterleitet.
  useEffect(() => {
    if (eindeutig) void navigate(serie(eindeutig), { replace: true });
  }, [eindeutig, anhang, rueckweg, navigate]);

  const offen = eintraege.filter((eintrag) => eintrag.zustand === 'offen');
  const weitere = eintraege.filter((eintrag) => eintrag.zustand !== 'offen');

  // Die beiden Lesepfade der Akte noch einmal - dieselben Schlüssel wie in
  // `useVerordnungenDerAkte` (WRT-01, UIK-16).
  function erneutLaden() {
    return Promise.all(
      [
        ['patient-treatment-bases-clinical', patientId],
        ['patient-treatment-bases', patientId],
        ['patient-treatment-basis-slots', patientId],
      ].map((queryKey) => queryClient.refetchQueries({ queryKey })),
    );
  }

  return (
    <Section
      titel={patient.data ? `Grundlage für ${fullName(patient.data)}` : 'Grundlage'}
      aktion={
        // Ein leiser Knopf des Systems statt eines eigenen (DESIGN.md Regel 4).
        <Button type="button" variant="quiet" groesse="kompakt" onClick={zurueck}>
          Andere Patient:in
        </Button>
      }
    >
      {isError ? (
        <ErrorState
          title="Die Behandlungsgrundlagen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={erneutLaden}
        />
      ) : isPending || !zahlenGeladen || eindeutig ? (
        <LoadingState label="Behandlungsgrundlagen werden geladen …" />
      ) : eintraege.length === 0 ? (
        // Der Weg zur Grundlage steht im Leerzustand selbst (UIK-16) - und
        // nur für die Rollen, die sie erfassen dürfen: Das Praxismanagement
        // wurde bisher ins Formular geführt und dort abgewiesen (VER-04,
        // ANN-011). Verbindlich prüft weiterhin die Datenbank.
        <EmptyState
          title="Keine Behandlungsgrundlage"
          description={
            canWriteTreatmentBases(user.roles)
              ? 'Ein Dauertermin hängt an einer Verordnung oder Selbstzahler-Vereinbarung. Zuerst eine erfassen.'
              : 'Ein Dauertermin hängt an einer Verordnung oder Selbstzahler-Vereinbarung. Behandlungsgrundlagen erfasst das Praxisteam.'
          }
          aktion={
            canWriteTreatmentBases(user.roles) ? (
              <ButtonLink
                to={mitRueckweg(`/patienten/${patientId}/verordnungen/neu`, hierher)}
                variant="secondary"
              >
                Grundlage erfassen
              </ButtonLink>
            ) : null
          }
        />
      ) : (
        <>
          {offen.length > 0 ? (
            <Grundlagenliste eintraege={offen} ziel={serie} />
          ) : (
            // Der Leerzustand in der Karte (DESIGN.md Regel 8), mit dem, was
            // trotzdem geht: Die Serienseite zeigt, was ungedeckt bliebe.
            <EmptyState
              inKarte
              title="Keine Grundlage hat noch etwas zu planen."
              description="Eine Serie darüber hinaus ist möglich."
            />
          )}
          {weitere.length > 0 ? (
            // Was selten gebraucht wird, steht eingeklappt (Bedienprinzipien,
            // UX-EPIC-002). Ohne offene Grundlage ist es das einzige Angebot
            // und steht deshalb offen. Der Aufklapper des Systems, mit Zeichen
            // und 44 px Kopf (RSP-07, UIK-07).
            <div className="mt-4">
              <Disclosure
                summary={`Verplante und ausgeschöpfte (${weitere.length})`}
                offen={offen.length === 0}
              >
                <Grundlagenliste eintraege={weitere} ziel={serie} />
              </Disclosure>
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}

function Grundlagenliste({
  eintraege,
  ziel,
}: {
  eintraege: readonly VerordnungMitZahlen[];
  ziel: (grundlageId: string) => string;
}) {
  // Zeilen des Systems (DESIGN.md Regel 3): Die ganze Zeile führt auf die
  // Serienseite der Grundlage.
  return (
    <ListRows>
      {eintraege.map(({ verordnung, kontingent, zustand }) => {
        const { bauart, praeposition } = grundlageBezeichnung(verordnung);
        const rest = kontingent?.remaining ?? 0;
        return (
          <ListRow
            key={verordnung.id}
            to={ziel(verordnung.id)}
            titel={`${bauart} ${praeposition} ${formatDate(verordnung.issued_on)}`}
            meta={[
              verordnung.prescriber_name,
              // Das Kontingent zählt Termine (ANN-064, VER-08).
              zustand === 'offen'
                ? `noch ${rest} ${rest === 1 ? 'Termin' : 'Termine'} zu planen`
                : zustandLabels[zustand],
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        );
      })}
    </ListRows>
  );
}
