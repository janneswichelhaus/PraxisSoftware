import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatEuro } from '@/lib/geld';
import { ladeDatenexport, type Datenexport as Daten, type Plattformzugang } from './api';
import { EINWILLIGUNGSTEXTE } from './einwilligungstexte';
import { PLATTFORM_PFAD } from './pfade';
import { terminBeschreibung } from './terminbeschreibung';
import { datum, tagLang, zeitraum } from './zeit';

/**
 * „Ich → Meine Daten" (POR-018, IDEA-QSN-003, ANN-265).
 *
 * Ein Knopf stellt die Daten zusammen - erst dann, weil jeder Abruf im
 * Protokoll der Praxis steht. Danach zwei Wege: als Datei speichern
 * (maschinenlesbar, Art. 20 DSGVO) oder lesbar ansehen und drucken. Der
 * Inhalt ist, was die Plattform zeigt, nicht die Akte; die Kopie der Akte
 * gibt die Praxis (ADR-023 Punkt 12). Das steht vorher da.
 */
export function Datenexport({ zugang }: { zugang: Plattformzugang }) {
  const [ergebnis, setErgebnis] = useState<{ daten: Daten; roh: unknown } | null>(null);
  const abrufen = useMutation({
    mutationFn: () => ladeDatenexport(zugang.access_id),
    onSuccess: setErgebnis,
  });
  const fuer = zugang.access_kind === 'legal_representative' ? zugang.represented_name : null;

  return (
    <>
      <Link
        to={`${PLATTFORM_PFAD}/ich`}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm print:hidden"
      >
        ← Zu „Ich“
      </Link>
      <h1 className="text-accent text-h3 font-bold">Meine Daten</h1>
      {ergebnis ? null : (
        <>
          <p className="text-ink mt-2 max-w-prose text-base leading-relaxed">
            {fuer ? `Sie holen hier die Daten von ${fuer}. ` : ''}
            Sie bekommen alles, was Sie hier auf der Plattform sehen: Ihre Angaben zur Person,
            Termine, Wünsche, {zugang.relationship_kind === 'treatment' ? 'Befundbogen, ' : ''}
            Rechnungen, Dokumente und Einwilligungen.
          </p>
          <p className="text-ink mt-3 max-w-prose text-base leading-relaxed">
            {zugang.relationship_kind === 'treatment'
              ? 'Eine vollständige Kopie Ihrer Akte bekommen Sie bei der Praxis.'
              : 'Eine vollständige Auskunft bekommen Sie bei der Praxis.'}
          </p>
          <div className="mt-5">
            <Button type="button" onClick={() => abrufen.mutate()} disabled={abrufen.isPending}>
              {abrufen.isPending ? 'Wird zusammengestellt …' : 'Daten zusammenstellen'}
            </Button>
          </div>
          {abrufen.error ? (
            <Statusmeldung ton="fehler" className="mt-3">
              {abrufen.error.message}
            </Statusmeldung>
          ) : null}
        </>
      )}
      {ergebnis ? <Ergebnis daten={ergebnis.daten} roh={ergebnis.roh} /> : null}
    </>
  );
}

/** Die Datei: genau die Antwort des Servers, eingerückt. */
function speichern(roh: unknown, daten: Daten) {
  const blob = new Blob([JSON.stringify(roh, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `meine-daten-${daten.exported_at.slice(0, 10)}.json`;
  link.click();
  // Erst später freigeben: Manche Browser (älteres Safari) brechen den
  // Download sonst ab (Zweitreview).
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const STATUS: Record<Daten['appointments'][number]['status'], string> = {
  confirmed: 'geplant',
  completed: 'durchgeführt',
  cancelled: 'abgesagt',
  no_show: 'nicht wahrgenommen',
};

const EINWILLIGUNG: Record<Daten['consents'][number]['state'], string> = {
  open: 'nicht entschieden',
  granted: 'erteilt',
  withdrawn: 'widerrufen',
  refused: 'abgelehnt',
};

function Ergebnis({ daten, roh }: { daten: Daten; roh: unknown }) {
  const p = daten.person as Record<string, string | null | undefined>;
  const name = [p.given_name, p.family_name].filter(Boolean).join(' ');
  const anschrift = [
    [p.street, p.house_number].filter(Boolean).join(' '),
    [p.postal_code, p.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  const telefone = [p.phone, p.phone_mobile, p.phone_work].filter(Boolean).join(', ');

  return (
    <>
      <Statusmeldung ton="erfolg" className="mt-3 print:hidden">
        Ihre Daten sind zusammengestellt.
      </Statusmeldung>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row print:hidden">
        <Button type="button" onClick={() => speichern(roh, daten)}>
          Als Datei speichern
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Drucken
        </Button>
      </div>
      <p className="text-ink-muted mt-3 max-w-prose text-sm print:hidden">
        Die Datei ist im Format JSON. Andere Programme können sie lesen.
      </p>

      <p className="text-ink mt-6 text-base">
        Stand {datum(daten.exported_at)} · {daten.organization}
      </p>

      <Abschnitt titel="Angaben zur Person">
        <Zeile label="Name">{name || '–'}</Zeile>
        {p.date_of_birth ? <Zeile label="Geburtsdatum">{datum(p.date_of_birth)}</Zeile> : null}
        {anschrift ? <Zeile label="Anschrift">{anschrift}</Zeile> : null}
        {telefone ? <Zeile label="Telefon">{telefone}</Zeile> : null}
        {p.email ? <Zeile label="E-Mail">{p.email}</Zeile> : null}
      </Abschnitt>

      <Abschnitt titel={`Termine (${daten.appointments.length})`}>
        {daten.appointments.length === 0 ? <Leer /> : null}
        {daten.appointments.map((t) => (
          <Zeile key={t.id} label={`${tagLang(t.starts_at)}, ${zeitraum(t.starts_at, t.ends_at)}`}>
            {terminBeschreibung(t).titel} · {STATUS[t.status]}
          </Zeile>
        ))}
      </Abschnitt>

      <Abschnitt titel={`Terminwünsche (${daten.appointment_requests.length})`}>
        {daten.appointment_requests.length === 0 ? <Leer /> : null}
        {daten.appointment_requests.map((w) => (
          <Zeile key={w.id} label={datum(w.created_at)}>
            {w.kind === 'new' ? 'Termin gewünscht' : w.kind === 'change' ? 'Änderung' : 'Absage'}
            {w.answer ? ` · Antwort: ${w.answer}` : ''}
          </Zeile>
        ))}
      </Abschnitt>

      {daten.relationship === 'treatment' ? (
        <Abschnitt titel={`Befundbogen (${daten.questionnaires.length})`}>
          {daten.questionnaires.length === 0 ? <Leer /> : null}
          {daten.questionnaires.map((b) => (
            <Zeile key={b.id} label={datum(b.recorded_on)}>
              {b.status === 'abgeschlossen' ? 'abgeschickt' : 'Entwurf'}
            </Zeile>
          ))}
        </Abschnitt>
      ) : null}

      <Abschnitt titel={`Rechnungen (${daten.invoices.length})`}>
        {daten.invoices.length === 0 ? <Leer /> : null}
        {daten.invoices.map((r) => (
          <Zeile key={r.id} label={`${r.invoice_number} vom ${datum(r.issued_on)}`}>
            {formatEuro(r.total_cents, r.currency)}
            {r.cancelled ? ' · storniert' : ''}
          </Zeile>
        ))}
      </Abschnitt>

      {/* ANG-008: die eigenen Trainingspakete. */}
      {daten.relationship === 'training' ? (
        <Abschnitt titel={`Trainingspakete (${daten.training_packages.length})`}>
          {daten.training_packages.length === 0 ? <Leer /> : null}
          {daten.training_packages.map((k) => (
            <Zeile key={k.starts_on} label={`${datum(k.starts_on)} bis ${datum(k.ends_on)}`}>
              {k.label} · {formatEuro(k.price_cents, k.currency)}
            </Zeile>
          ))}
        </Abschnitt>
      ) : null}

      {daten.relationship === 'treatment' ? (
        <Abschnitt titel={`Dokumente (${daten.documents.length})`}>
          {daten.documents.length === 0 ? <Leer /> : null}
          {daten.documents.map((d) => (
            <Zeile key={d.id} label={d.display_name}>
              freigegeben am {datum(d.released_at)}
            </Zeile>
          ))}
        </Abschnitt>
      ) : null}

      <Abschnitt titel="Einwilligungen">
        {daten.consents.map((e) => (
          <Zeile key={e.purpose} label={EINWILLIGUNGSTEXTE[e.purpose].titel}>
            {EINWILLIGUNG[e.state]}
            {e.occurred_on ? ` am ${datum(e.occurred_on)}` : ''}
          </Zeile>
        ))}
      </Abschnitt>
    </>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <Section titel={titel} rahmen>
      <dl className="flex flex-col gap-3">{children}</dl>
    </Section>
  );
}

function Zeile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wrap-anywhere">
      <dt className="text-ink-muted text-sm">{label}</dt>
      <dd className="text-ink text-base">{children}</dd>
    </div>
  );
}

function Leer() {
  return (
    <div>
      <dt className="sr-only">Hinweis</dt>
      <dd className="text-ink-muted text-base">Keine Einträge.</dd>
    </div>
  );
}
