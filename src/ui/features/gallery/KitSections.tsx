import { cs } from '@/ui/copy';
import { Notice, StatusChip } from '@/ui/kit';

const TONES = ['neutral', 'waiting', 'done', 'attention', 'stopped'] as const;

/** The kit's status chips and notices, once each. Notices are not live: nothing here is news. */
export function KitSections() {
  return (
    <>
      <section aria-labelledby="stavy">
        <h2 id="stavy">{cs.gallery.statuses.title}</h2>
        <ul className="flex flex-wrap gap-2">
          {TONES.map((tone) => (
            <li key={tone}>
              <StatusChip tone={tone}>{cs.gallery.statuses[tone]}</StatusChip>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="oznameni">
        <h2 id="oznameni">{cs.gallery.notices.title}</h2>
        <div className="flex flex-col gap-2">
          <Notice tone="info" live={false}>
            {cs.gallery.notices.info}
          </Notice>
          <Notice tone="problem" live={false}>
            {cs.gallery.notices.problem}
          </Notice>
        </div>
      </section>
    </>
  );
}
