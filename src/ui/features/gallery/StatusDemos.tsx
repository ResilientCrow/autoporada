import { cs } from '@/ui/copy';
import { ACCESS_LOOK, ACCOUNT_LOOK, Chip, ROLE_LOOK, STUDENT_LOOK, type Look } from '@/ui/status';

const { statusMaps } = cs.gallery;

function Row({ title, looks }: { readonly title: string; readonly looks: readonly Look[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="font-bold">{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {looks.map((look) => (
          <li key={look.label}>
            <Chip look={look} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every look of the status maps, so the checks see each chip. */
export function StatusDemos() {
  return (
    <div className="flex flex-col gap-4">
      <Row title={statusMaps.access} looks={Object.values(ACCESS_LOOK)} />
      <Row title={statusMaps.role} looks={[...Object.values(ROLE_LOOK), STUDENT_LOOK]} />
      <Row title={statusMaps.account} looks={Object.values(ACCOUNT_LOOK)} />
    </div>
  );
}
