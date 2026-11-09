import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { initialen } from '@/components/ui/personenfarben';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { StatusMark } from '@/components/ui/StatusMark';
import { zahl as zahlDeutsch } from '@/features/nutrition/texte';
import { mitRueckweg } from '@/lib/rueckweg';
import { RECHTSGRUNDLAGE, VERTRETUNGSART } from '@/lib/vertretung';
import {
  aboSchluessel,
  begleitungBeenden,
  ernaehrungSchluessel,
  ladeAbo,
  ladeErnaehrung,
  ladeMeinePakete,
  ladeMeineVertretungen,
  ladeVertrag,
  paketeSchluessel,
  ueberallAbmelden,
  vertragSchluessel,
  vertretungenSchluessel,
  type MeineVertretung,
  type Plattformzugang,
} from './api';
import { PLATTFORM_PFAD } from './pfade';
import { useWahl, wahlAdresse, wahlName } from './wahl';
import { datum, kalendertag } from './zeit';

/**
 * Gruppen nach Zweck statt einer Liste je Bereich: Der Bereich steht als Wahl im Kopf (ANN-858).
 * Was eine Rolle sieht, sagt der Server (ANN-261); nach der Lesefrist bleibt das Widerrufen (D2).
 */
export function Ich({
  email,
  praxis,
  zugaenge,
  entscheidend,
  rechner,
  onAbmelden,
}: {
  email: string | undefined;
  praxis: string;
  /** Die lesbaren Zugänge; unter ihnen wählt der Schalter im Kopf. */
  zugaenge: Plattformzugang[];
  /** Zugänge, über die Einwilligungen und Export gehen (ANN-261). */
  entscheidend: Plattformzugang[];
  rechner: boolean;
  onAbmelden: () => void;
}) {
  const gewaehlt = useWahl(zugaenge);
  // Nach der Lesefrist steht ein Bereich nicht mehr im Schalter; widerrufen
  // lässt sich trotzdem (D2) - seine Zeilen stehen deshalb ohne Wahl.
  const beendet = entscheidend.filter((e) => !zugaenge.some((z) => z.access_id === e.access_id));
  const name = (gewaehlt ?? zugaenge[0] ?? entscheidend[0])?.own_name?.trim() || null;

  const inhalt = (
    <>
      {gewaehlt ? (
        <Bereichsgruppen
          zugang={gewaehlt}
          entscheidet={entscheidend.some((x) => x.access_id === gewaehlt.access_id)}
          // Ohne Schalter im Kopf sagt eine Zeile, für wen eine Vertretung hier handelt.
          fuerWen={zugaenge.length === 1 && gewaehlt.access_kind !== 'self'}
        />
      ) : null}
      {beendet.map((z) => (
        <Datenschutz
          key={z.access_id}
          zugang={z}
          entscheidet
          titel={`Datenschutz – ${wahlName(z)}`}
        />
      ))}
      <Konto email={email} onAbmelden={onAbmelden} />
      <Kleingedrucktes className="mt-8">
        {/* Ein Kennwort gibt es nicht; was sich weitergeben ließe, ist
            das entsperrte Telefon. */}
        Ihr Zugang gehört nur Ihnen. Geben Sie Ihr entsperrtes Telefon nicht weiter. Angehörige, die
        Ihnen helfen, bekommen von der Praxis einen eigenen Zugang.
      </Kleingedrucktes>
    </>
  );

  return (
    <>
      <PageHeader title="Ich" />
      {rechner ? (
        <div className="grid grid-cols-[minmax(0,17rem)_minmax(0,40rem)] items-start gap-12">
          <div className="sticky top-6 mt-12">
            <Profilkopf name={name} email={email} praxis={praxis} />
          </div>
          <div className="min-w-0 [&>section:first-child]:mt-12">{inhalt}</div>
        </div>
      ) : (
        <>
          <Profilkopf name={name} email={email} praxis={praxis} />
          {inhalt}
        </>
      )}
    </>
  );
}

/**
 * Initialen und Name, wenn die Projektion einen trägt, sonst die Adresse des Kontos; kein Foto
 * (Briefing 7, feste Grenzen).
 */
function Profilkopf({
  name,
  email,
  praxis,
}: {
  name: string | null;
  email: string | undefined;
  praxis: string;
}) {
  return (
    <div className="bg-surface border-line rounded-card flex items-center gap-4 border p-4">
      <span
        aria-hidden="true"
        className="bg-accent-soft text-accent rounded-pill inline-flex size-16 shrink-0 items-center justify-center text-xl font-bold"
      >
        {name ? initialen(name) : <Symbol>{ZEICHEN.person}</Symbol>}
      </span>
      <div className="min-w-0">
        <p className="text-ink text-lg font-semibold wrap-anywhere">
          {name ?? email ?? 'Ihr Zugang'}
        </p>
        {praxis ? <p className="text-ink-muted text-sm">{praxis}</p> : null}
      </div>
    </div>
  );
}

/** Der Suchteil eines Zugangs für Links auf seine Seiten (D6). */
function wahlSuche(z: Plattformzugang): string {
  return wahlAdresse(z).split('?')[1] ?? '';
}

/**
 * Die Gruppen des gewählten Bereichs: Unterlagen, Meine Angaben, Verträge, Datenschutz.
 */
function Bereichsgruppen({
  zugang: z,
  entscheidet,
  fuerWen,
}: {
  zugang: Plattformzugang;
  entscheidet: boolean;
  fuerWen: boolean;
}) {
  const ziel = (pfad: string) => `${PLATTFORM_PFAD}/${pfad}?${wahlSuche(z)}`;
  return (
    <>
      {fuerWen ? <p className="text-ink mt-6 text-base font-semibold">{wahlName(z)}</p> : null}
      <Gruppe titel="Unterlagen">
        <Zeile to={ziel('rechnungen')} zeichen={ZEICHEN.rechnung} titel="Rechnungen" />
        {/* Dokumente gibt es nur in der Behandlung. */}
        {z.relationship_kind === 'treatment' ? (
          <Zeile to={ziel('dokumente')} zeichen={ZEICHEN.dokument} titel="Dokumente" />
        ) : null}
      </Gruppe>
      <Gruppe titel="Meine Angaben">
        {/* „Meine Angaben“ heißt wie die Seite: dort stehen auch die Angaben nach den Übungen. */}
        <Zeile to={ziel('angaben')} zeichen={ZEICHEN.angaben} titel="Meine Angaben" />
        {/* Von hier führt der Rückweg wieder unter „Ich“, nicht zur Übersicht. */}
        <Zeile
          to={mitRueckweg(ziel('gewohnheiten'), `${PLATTFORM_PFAD}/ich?${wahlSuche(z)}`)}
          zeichen={ZEICHEN.gewohnheit}
          titel="Gewohnheiten"
        />
        {/* Nur mit laufender Beratung - die Zeile fragt den Server. */}
        {z.access_kind !== 'companion' ? <ErnaehrungZeile zugang={z} /> : null}
      </Gruppe>
      {z.relationship_kind === 'treatment' ? (
        <AboGruppe zugang={z} />
      ) : (
        <Gruppe titel="Verträge">
          <PaketZeile zugang={z} />
          <VertragZeile zugang={z} />
        </Gruppe>
      )}
      <Datenschutz zugang={z} entscheidet={entscheidet} titel="Datenschutz" />
      {/* Die Person selbst und eine rechtliche Vertretung sehen, wer Zugang hat; eine Begleitung
          nicht. Verbindlich ist der Server (manage_companions). */}
      {z.access_kind !== 'companion' ? <WerZugangHat zugang={z} /> : null}
    </>
  );
}

/**
 * Einwilligungen und Export (ANN-261: nur in der Lesezeit); eine Begleitung
 * lädt nur ihre eigene Wahl herunter. Ohne Zeile keine Gruppe.
 */
function Datenschutz({
  zugang: z,
  entscheidet,
  titel,
}: {
  zugang: Plattformzugang;
  entscheidet: boolean;
  titel: string;
}) {
  const ziel = (pfad: string) => `${PLATTFORM_PFAD}/${pfad}?${wahlSuche(z)}`;
  const zeilen = [
    entscheidet ? (
      <Zeile
        key="einwilligungen"
        to={ziel('einwilligungen')}
        zeichen={ZEICHEN.einwilligung}
        titel="Einwilligungen"
      />
    ) : null,
    entscheidet && z.readable ? (
      <Zeile
        key="daten"
        to={ziel('daten')}
        zeichen={ZEICHEN.daten}
        titel="Meine Daten herunterladen"
      />
    ) : null,
    entscheidet && !z.readable ? (
      <Zeile
        key="daten"
        zeichen={ZEICHEN.daten}
        titel="Meine Daten"
        meta="Ihre Daten bekommen Sie jetzt bei der Praxis."
      />
    ) : null,
    z.readable && z.access_kind === 'companion' ? (
      <Zeile
        key="daten"
        to={ziel('daten')}
        zeichen={ZEICHEN.daten}
        titel="Meine Benachrichtigungen herunterladen"
      />
    ) : null,
  ].filter((zeile) => zeile !== null);
  if (zeilen.length === 0) return null;
  return <Gruppe titel={titel}>{zeilen}</Gruppe>;
}

/** Das Konto: angemeldet als, Einstellungen, am Ende leise Abmelden. */
function Konto({ email, onAbmelden }: { email: string | undefined; onAbmelden: () => void }) {
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  return (
    <Section titel="Konto">
      <ListRows rahmen>
        <ListRow
          bild={<Symbol>{ZEICHEN.person}</Symbol>}
          titel="Angemeldet als"
          meta={<span className="wrap-anywhere">{email ?? 'Ihr Konto'}</span>}
        />
        <Zeile
          to={`${PLATTFORM_PFAD}/einstellungen`}
          zeichen={ZEICHEN.einstellungen}
          titel="Einstellungen"
          meta="Schrift, Benachrichtigungen, Anmeldung"
        />
      </ListRows>
      {/* Abmelden ist nicht die Hauptsache dieser Seite - eine leise Zeile am
          Ende, „Überall abmelden“ mit Rückfrage darunter. */}
      <div className="mt-6 flex flex-col items-start gap-3">
        <Button variant="quiet" onClick={onAbmelden}>
          Abmelden
        </Button>
        <Rueckfrage
          ausloeser="Überall abmelden"
          ausloeserVariante="quiet"
          bestaetigen="Überall abmelden"
          bestaetigenLaeuft="Wird abgemeldet …"
          fehler={fehler}
          onBestaetigen={() =>
            ueberallAbmelden().catch((grund: Error) => {
              setFehler(grund.message);
              throw grund;
            })
          }
        >
          <p>Sie werden auf allen Geräten abgemeldet, auch auf diesem.</p>
        </Rueckfrage>
      </div>
    </Section>
  );
}

function Gruppe({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <Section titel={titel}>
      <ListRows rahmen>{children}</ListRows>
    </Section>
  );
}

/** Eine Zeile unter „Ich“: Zeichen vorn, Pfeil hinten, die ganze Zeile das Ziel. */
function Zeile({
  to,
  zeichen,
  titel,
  meta,
}: {
  to?: string;
  zeichen: ReactNode;
  titel: string;
  meta?: string | undefined;
}) {
  return (
    <ListRow
      {...(to ? { to, pfeil: true } : {})}
      bild={<Symbol>{zeichen}</Symbol>}
      titel={titel}
      {...(meta ? { meta } : {})}
    />
  );
}

/**
 * Die Ernährungsberatung: nur, wenn eine läuft und der Zugang sie sehen darf; sonst
 * keine Zeile.
 */
function ErnaehrungZeile({ zugang }: { zugang: Plattformzugang }) {
  const { data } = useQuery({
    queryKey: ernaehrungSchluessel(zugang.access_id),
    queryFn: () => ladeErnaehrung(zugang.access_id),
    retry: false,
  });
  if (!data) return null;
  const z = data.profile.targets;
  return (
    <Zeile
      to={`${PLATTFORM_PFAD}/ernaehrung?${wahlSuche(zugang)}`}
      zeichen={ZEICHEN.ernaehrung}
      titel="Ernährung"
      meta={z.status === 'ok' ? `Energie am Tag: ${zahlDeutsch(z.energy.kcal)} kcal` : undefined}
    />
  );
}

/**
 * Das Nachsorge-Abo: seit wann, bis wann, und der Weg zum Kündigen. Ohne
 * Abo - oder ohne Recht, es zu sehen - keine Gruppe „Verträge“.
 */
function AboGruppe({ zugang }: { zugang: Plattformzugang }) {
  const { data } = useQuery({
    queryKey: aboSchluessel(zugang.access_id),
    queryFn: () => ladeAbo(zugang.access_id),
  });
  if (!data) return null;
  return (
    <Gruppe titel="Verträge">
      <Zeile
        to={`${PLATTFORM_PFAD}/abo?${wahlSuche(zugang)}`}
        zeichen={ZEICHEN.vertrag}
        titel={
          data.state === 'running' && data.can_cancel
            ? 'Nachsorge-Abo ansehen oder kündigen'
            : 'Nachsorge-Abo'
        }
        meta={
          data.state === 'running'
            ? data.starts_on > kalendertag(new Date())
              ? `Beginnt am ${datum(data.starts_on)}.`
              : `Läuft seit ${datum(data.starts_on)}.`
            : data.state === 'ending'
              ? `Gekündigt, endet am ${datum(data.ends_on ?? '')}.`
              : `Beendet am ${datum(data.ends_on ?? '')}.`
        }
      />
    </Gruppe>
  );
}

/**
 * Das Trainingspaket (PROJECT_PRINCIPLES.md 4.10): ein laufendes Paket in einem Satz,
 * und immer der Weg zu Paket und Preisen - die Preise stehen da, bevor jemand fragt. Den
 * eigenen Stand sieht nur, wer Rechnungen sieht; das sagt der Server.
 */
function PaketZeile({ zugang }: { zugang: Plattformzugang }) {
  const { data } = useQuery({
    queryKey: paketeSchluessel(zugang.access_id),
    queryFn: () => ladeMeinePakete(zugang.access_id),
  });
  const aktuell = data?.find((k) => k.state !== 'ended');
  return (
    <Zeile
      to={`${PLATTFORM_PFAD}/paket?${wahlSuche(zugang)}`}
      zeichen={ZEICHEN.paket}
      titel={aktuell ? 'Trainingspaket und Preise' : 'Pakete und Preise'}
      meta={
        aktuell
          ? aktuell.state === 'planned'
            ? `Beginnt am ${datum(aktuell.starts_on)}.`
            : `Läuft bis ${datum(aktuell.ends_on)}.`
          : undefined
      }
    />
  );
}

/**
 * Der Trainingsvertrag: gebucht am, und der Weg zur Bestätigung - solange die Frist läuft, auch
 * zum Widerruf. Ohne Vertrag im Konto keine Zeile.
 */
function VertragZeile({ zugang }: { zugang: Plattformzugang }) {
  const { data } = useQuery({
    queryKey: vertragSchluessel(zugang.access_id),
    queryFn: () => ladeVertrag(zugang.access_id),
  });
  if (!data) return null;
  return (
    <Zeile
      to={`${PLATTFORM_PFAD}/vertrag?${wahlSuche(zugang)}`}
      zeichen={ZEICHEN.vertrag}
      titel={data.can_withdraw ? 'Trainingsvertrag ansehen oder widerrufen' : 'Trainingsvertrag'}
      meta={`Gebucht am ${datum(data.concluded_at)}.${
        data.withdrawn_at
          ? ` Widerrufen am ${datum(data.withdrawn_at)}.`
          : data.can_withdraw
            ? ` Widerruf möglich bis ${datum(data.withdrawal_ends_on)}.`
            : ''
      }`}
    />
  );
}

/**
 * Wer Zugang hat (ADR-023 Punkt 14). Eine Begleitung beendet die Person selbst - das ist der
 * Widerruf ihrer Einwilligung; eine rechtliche Vertretung beendet nur die Praxis.
 */
function WerZugangHat({ zugang }: { zugang: Plattformzugang }) {
  const { data } = useQuery({
    queryKey: vertretungenSchluessel(zugang.access_id),
    queryFn: () => ladeMeineVertretungen(zugang.access_id),
  });
  if (!data || data.length === 0) return null;
  const titel =
    zugang.access_kind === 'self'
      ? 'Wer für Sie Zugang hat'
      : `Wer für ${zugang.represented_name ?? 'die Person'} Zugang hat`;
  return (
    <Section titel={titel}>
      <ListRows rahmen>
        {data.map((v) => (
          <VertretungZeile key={v.access_id} zugangId={zugang.access_id} vertretung={v} />
        ))}
      </ListRows>
    </Section>
  );
}

const ZUSTAND: Record<MeineVertretung['status'], ReactNode> = {
  active: <StatusMark ton="positiv">aktiv</StatusMark>,
  invited: <StatusMark>eingeladen</StatusMark>,
  locked: <StatusMark ton="warnung">gesperrt</StatusMark>,
};

function VertretungZeile({
  zugangId,
  vertretung: v,
}: {
  zugangId: string;
  vertretung: MeineVertretung;
}) {
  const queryClient = useQueryClient();
  const beenden = useMutation({
    mutationFn: () => begleitungBeenden(zugangId, v.access_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vertretungenSchluessel(zugangId) }),
  });
  const art =
    v.access_kind === 'legal_representative' && v.legal_basis
      ? `${VERTRETUNGSART.legal_representative} (${RECHTSGRUNDLAGE[v.legal_basis]})`
      : VERTRETUNGSART[v.access_kind];
  return (
    // Die Rückfrage öffnet sich an Ort und Stelle unter der Zeile und braucht
    // die volle Breite - neben dem Namen wäre sie am Telefon zu schmal.
    <ListRow
      titel={v.representative_name}
      meta={art}
      status={ZUSTAND[v.status]}
      darunter={
        v.can_end ? (
          <div className="pb-3">
            <Rueckfrage
              ausloeser="Begleitung beenden"
              ausloeserVariante="quiet"
              bestaetigen="Begleitung beenden"
              bestaetigenLaeuft="Wird beendet …"
              fehler={beenden.error?.message}
              onBestaetigen={() => beenden.mutateAsync()}
            >
              <p>
                {v.representative_name} sieht ab sofort nichts mehr. Damit widerrufen Sie Ihre
                Einwilligung. Eine neue Begleitung richtet die Praxis ein.
              </p>
            </Rueckfrage>
          </div>
        ) : (
          <p className="text-ink-muted pb-3 text-sm">
            Beenden kann diese Vertretung nur die Praxis.
          </p>
        )
      }
    />
  );
}

/** Die Zeichen im Raster 24 mit Strich 2; nur Schmuck, das Wort steht daneben. */
const ZEICHEN = {
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  rechnung: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />,
  dokument: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />,
  angaben: <path d="M8 4h8v3H8zM6 6H5v15h14V6h-1M9 12h6M9 16h4" />,
  gewohnheit: <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4M12 8v4l3 2" />,
  ernaehrung: <path d="M12 7c-4-3-8 0-7 5s4 9 7 8c3 1 6-3 7-8s-3-8-7-5zM12 7c0-2 1-4 3-4" />,
  vertrag: <path d="M6 3h12v18H6zM9 8h6M9 12h6M9 17l2 1 4-3" />,
  paket: <path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8" />,
  einwilligung: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5" />,
  daten: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  einstellungen: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
} as const;

function Symbol({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="text-accent size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
