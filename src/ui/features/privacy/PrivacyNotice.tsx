import type { PrivacyCopy } from '@/ui/copy';
import { Card, InPageLink, Notice, SlantLabel } from '@/ui/kit';

import { Blocks, SummaryBullets } from './Blocks';

/** The privacy notice page: a draft banner until approved, a summary, contents, then every section. */
export function PrivacyNotice({ notice }: { readonly notice: PrivacyCopy }) {
  const banner = notice.approved ? null : (
    <Notice tone="info" live={false}>
      {notice.draft}
    </Notice>
  );
  const since = `${notice.effectiveLabel} ${notice.effectiveFrom}`;
  const effective = notice.effectiveFrom === null ? null : <p>{since}</p>;
  return (
    <div className="flex flex-col gap-4">
      <SlantLabel level={1}>{notice.title}</SlantLabel>
      {banner}
      {effective}
      <Card title={notice.summaryTitle}>
        <SummaryBullets items={notice.summary} labels={notice} />
      </Card>
      <nav aria-label={notice.tocLabel}>
        <ul className="list-disc pl-6">
          {notice.sections.map((section) => (
            <li key={section.id}>
              <InPageLink id={section.id}>{section.title}</InPageLink>
            </li>
          ))}
        </ul>
      </nav>
      {notice.sections.map((section) => (
        <section key={section.id} aria-labelledby={section.id} className="flex flex-col gap-2">
          <h2 id={section.id} className="text-xl">
            {section.title}
          </h2>
          <Blocks blocks={section.blocks} labels={notice} />
        </section>
      ))}
    </div>
  );
}
