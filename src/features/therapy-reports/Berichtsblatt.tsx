import { Wortmarke } from '@/components/ui/Wortmarke';
import { MARKE_RECHNUNGSHOEHE } from '@/components/ui/markeRegeln';
import { KoerperschemaBild } from '@/features/assessments/KoerperschemaFeld';
import { bereicheText } from '@/features/assessments/koerperschema';
import { formatDate } from '@/lib/datum';
import { empfaengerName, terminzeile, type Berichtsdokument } from './api';

/**
 * Der Therapiebericht als Blatt (DOK-005, B14 Weg 1).
 *
 * **Alles hier ist übernommen, nichts gedeutet** (PROJECT_PRINCIPLES.md §17,
 * ADR-006 Punkt 2 und 4): die Angaben der Verordnung, die Zahl der
 * stattgefundenen Termine, die angekreuzten Einträge wörtlich mit Tag und
 * Verfasser:in, die Kreise des Körperschemas mit dem Tag der Erhebung. Was die
 * Therapeut:in selbst schreibt — ihr Text und ihre Empfehlung zum
 * Verordnungsende —, steht mit ihrem Namen und dem Tag da (ANN-014).
 *
 * Dieselbe Komponente zeigt die Vorschau des Entwurfs und das Druckblatt; was
 * am Bildschirm steht, kommt aus dem Drucker. Ein Entwurf trägt einen Vermerk,
 * der **mitgedruckt** wird. Der Kopf steht in einem `div`, nicht in einem
 * `header` — die Druckregeln aus UI-000 blenden `header` aus.
 */
export function Berichtsblatt({
  dokument,
  entwurf,
  eingebettet = false,
}: {
  dokument: Berichtsdokument;
  entwurf: boolean;
  /**
   * Als Vorschau in einer Seite mit eigenem Titel: Die Überschriften rücken
   * zwei Ebenen tiefer, damit die Seite genau eine Hauptüberschrift behält.
   */
  eingebettet?: boolean;
}) {
  const Titel = eingebettet ? 'h3' : 'h1';
  const Abschnitt = eingebettet ? 'h4' : 'h2';
  const { praxis, empfaenger, patient, verordnung } = dokument;
  const praxisStrasse = [praxis.street, praxis.house_number].filter(Boolean).join(' ');
  const praxisOrt = [praxis.postal_code, praxis.city].filter(Boolean).join(' ');
  const absenderzeile = [praxis.name, praxisStrasse, praxisOrt].filter(Boolean).join(' · ');
  const datum = dokument.abgeschlossen?.datum ?? null;

  return (
    <article className="text-ink mx-auto max-w-[210mm] text-[0.9375rem]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Die schwarze Fassung: `marke/README.md` nennt Rechnung und Fax als
            ihren Fall, und ein Bericht an die Verordner:in geht oft per Fax. */}
        <Wortmarke hoehe={MARKE_RECHNUNGSHOEHE} fassung="schwarz" />
        <address className="text-ink-muted text-right text-sm not-italic">
          <span className="text-ink block font-medium">{praxis.name}</span>
          {praxisStrasse ? <span className="block">{praxisStrasse}</span> : null}
          {praxisOrt ? <span className="block">{praxisOrt}</span> : null}
          {praxis.phone ? <span className="block">{praxis.phone}</span> : null}
          {praxis.email ? <span className="block">{praxis.email}</span> : null}
        </address>
      </div>

      {entwurf ? (
        <p className="border-line-strong text-ink mt-8 border-2 px-3 py-2 text-sm font-semibold">
          Entwurf — noch nicht abgeschlossen, nicht zum Versand.
        </p>
      ) : null}

      <div className="mt-10 flex flex-wrap justify-between gap-8">
        <div className="min-w-[70mm]">
          <p className="text-ink-subtle border-line border-b pb-1 text-[0.6875rem]">
            {absenderzeile}
          </p>
          {empfaenger ? (
            <address className="mt-3 leading-relaxed not-italic">
              {empfaenger.practice_name ? (
                <span className="block">{empfaenger.practice_name}</span>
              ) : null}
              <span className="block">{empfaengerName(empfaenger)}</span>
              {empfaenger.street ? (
                <span className="block">
                  {[empfaenger.street, empfaenger.house_number].filter(Boolean).join(' ')}
                </span>
              ) : null}
              {empfaenger.postal_code || empfaenger.city ? (
                <span className="block">
                  {[empfaenger.postal_code, empfaenger.city].filter(Boolean).join(' ')}
                </span>
              ) : null}
            </address>
          ) : null}
          {empfaenger?.fax ? (
            <p className="text-ink-muted mt-2 text-sm">Fax {empfaenger.fax}</p>
          ) : null}
        </div>

        <dl className="text-sm">
          {datum ? (
            <div className="flex gap-3">
              <dt className="text-ink-muted w-36">Datum</dt>
              <dd className="tabular-nums">{formatDate(datum)}</dd>
            </div>
          ) : null}
          <div className="mt-1 flex gap-3">
            <dt className="text-ink-muted w-36">Patient:in</dt>
            <dd>
              {patient.given_name} {patient.family_name}
            </dd>
          </div>
          {patient.date_of_birth ? (
            <div className="mt-1 flex gap-3">
              <dt className="text-ink-muted w-36">Geburtsdatum</dt>
              <dd className="tabular-nums">{formatDate(patient.date_of_birth)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <Titel className="mt-10 text-lg font-semibold">Therapiebericht</Titel>
      <p className="text-ink-muted mt-1 text-sm">
        zur {verordnung.treatment_basis_kind === 'first' ? 'Erstverordnung' : 'Folgeverordnung'} vom{' '}
        {formatDate(verordnung.issued_on)}
      </p>

      <section className="mt-6">
        <Abschnitt className="text-sm font-semibold">Verordnung</Abschnitt>
        <dl className="mt-1 text-sm">
          {verordnung.diagnosis ? (
            <div className="flex flex-wrap gap-x-3">
              <dt className="text-ink-muted w-36">Diagnose</dt>
              <dd className="min-w-0 flex-1">{verordnung.diagnosis}</dd>
            </div>
          ) : null}
          {verordnung.items.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-x-3">
              <dt className="text-ink-muted w-36">Heilmittel</dt>
              <dd className="min-w-0 flex-1">
                {verordnung.items
                  .map((item) => `${item.remedy} (${item.prescribed_quantity}×)`)
                  .join(', ')}
              </dd>
            </div>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-x-3">
            <dt className="text-ink-muted w-36">Durchgeführt</dt>
            <dd className="min-w-0 flex-1 tabular-nums">
              {terminzeile(
                verordnung.termine_durchgefuehrt,
                verordnung.erster_termin,
                verordnung.letzter_termin,
              )}
            </dd>
          </div>
        </dl>
      </section>

      {dokument.eintraege.length > 0 ? (
        <section className="mt-6">
          <Abschnitt className="text-sm font-semibold">
            Befund und Verlauf aus der Dokumentation
          </Abschnitt>
          <ul className="mt-1 flex flex-col gap-3 text-sm">
            {dokument.eintraege.map((eintrag) => (
              <li key={eintrag.note_id}>
                <p className="text-ink-muted tabular-nums">
                  {formatDate(eintrag.datum)}
                  {eintrag.ergaenzung ? ' · Nachtrag' : ''}
                  {eintrag.verfasser ? ` · ${eintrag.verfasser}` : ''}
                </p>
                <p className="whitespace-pre-line">{eintrag.inhalt}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dokument.koerperschema ? (
        <section className="mt-6">
          <Abschnitt className="text-sm font-semibold">Körperschema</Abschnitt>
          <p className="text-ink-muted mt-1 text-sm">
            Angabe vom {formatDate(dokument.koerperschema.erhoben_am)}:{' '}
            {bereicheText(dokument.koerperschema.markierungen.map((m) => m.bereich))}
          </p>
          <div className="mt-2">
            <KoerperschemaBild markierungen={dokument.koerperschema.markierungen} />
          </div>
        </section>
      ) : null}

      {dokument.text ? (
        <section className="mt-6">
          <Abschnitt className="text-sm font-semibold">Bericht der Therapeut:in</Abschnitt>
          <p className="mt-1 text-sm whitespace-pre-line">{dokument.text.inhalt}</p>
          <p className="text-ink-muted mt-1 text-xs">{quelle(dokument.text)}</p>
        </section>
      ) : null}

      {dokument.empfehlung ? (
        <section className="mt-6">
          <Abschnitt className="text-sm font-semibold">
            Empfehlung der Therapeut:in zum Verordnungsende
          </Abschnitt>
          <p className="mt-1 text-sm whitespace-pre-line">{dokument.empfehlung.inhalt}</p>
          <p className="text-ink-muted mt-1 text-xs">{quelle(dokument.empfehlung)}</p>
        </section>
      ) : null}

      {dokument.abgeschlossen ? (
        <p className="text-ink-muted mt-10 text-sm">
          Abgeschlossen am {formatDate(dokument.abgeschlossen.datum)}
          {dokument.abgeschlossen.von ? ` von ${dokument.abgeschlossen.von}` : ''}.
        </p>
      ) : null}
    </article>
  );
}

function quelle(angabe: { verfasser: string | null; datum: string | null }): string {
  const teile = [angabe.verfasser, angabe.datum ? formatDate(angabe.datum) : null].filter(Boolean);
  return teile.length > 0 ? teile.join(', ') : '';
}
