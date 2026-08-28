import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { fetchPatients } from '@/features/patients/api';
import { canReadPatientDirectory, type CurrentUser } from '@/features/session/types';

function firstName(displayName: string): string {
  return displayName.split(' ')[0] ?? displayName;
}

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

export function DashboardPage({ user }: { user: CurrentUser }) {
  const showDirectory = canReadPatientDirectory(user.roles);

  const { data: patients } = useQuery({
    queryKey: ['patients'],
    queryFn: fetchPatients,
    enabled: showDirectory,
    retry: false,
  });

  const activeCount = patients?.filter((p) => p.status === 'active').length;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(user.profile.display_name)}`}
        description={user.organizationName ?? undefined}
      />

      <div className="flex flex-wrap gap-2">
        {user.roles.map((role) => (
          <RoleBadge key={role} role={role} />
        ))}
      </div>

      {showDirectory ? (
        <section className="mt-10">
          <h2 className="text-ink-muted text-sm font-semibold tracking-wide uppercase">
            Patientenkartei
          </h2>
          <p className="text-ink mt-3 text-3xl font-semibold tracking-[-0.02em] tabular-nums">
            {activeCount ?? '–'}
          </p>
          <p className="text-ink-muted mt-1 text-sm">
            {activeCount === 1
              ? 'Person in laufender Versorgung'
              : 'Personen in laufender Versorgung'}
          </p>
          <Link
            to="/patienten"
            className="text-accent hover:text-accent-hover mt-4 inline-flex min-h-11 items-center text-[0.9375rem] font-medium"
          >
            Zur Patientenliste →
          </Link>
        </section>
      ) : (
        <section className="mt-10">
          <h2 className="text-ink-muted text-sm font-semibold tracking-wide uppercase">
            Ihr Zugang
          </h2>
          <p className="text-ink-muted mt-3 max-w-prose text-[0.9375rem]">
            Sie sehen ausschließlich Ihre eigenen Daten. Weitere Bereiche des Patientenportals
            werden schrittweise ergänzt.
          </p>
        </section>
      )}

      <p className="text-ink-subtle mt-12 max-w-prose text-xs leading-relaxed">
        Dies ist ein früher Entwicklungsstand mit ausschließlich synthetischen Testdaten.
      </p>
    </>
  );
}
