import { cs } from '@/ui/copy';
import {
  BulletList,
  Card,
  Cluster,
  Columns,
  Disclosure,
  FactList,
  Item,
  ItemList,
  Meta,
  Section,
  Stack,
  StatusChip,
} from '@/ui/kit';

const { layout, lists, disclosure, statuses } = cs.gallery;

/** A block to see the spacing around. */
function Sample({ children }: { readonly children: string }) {
  return (
    <Card>
      <p>{children}</p>
    </Card>
  );
}

/** The layout kit once each: stacks, a cluster, columns, sections, lists and a disclosure. */
export function LayoutSections() {
  return (
    <>
      <Section title={layout.title} headingId="rozvrzeni">
        <h3>{layout.stacks}</h3>
        <Stack gap="item">
          <Sample>{layout.item}</Sample>
          <Sample>{layout.item}</Sample>
        </Stack>
        <Stack gap="block">
          <Sample>{layout.block}</Sample>
          <Sample>{layout.block}</Sample>
        </Stack>
        <Stack gap="section">
          <Sample>{layout.section}</Sample>
          <Sample>{layout.section}</Sample>
        </Stack>
        <h3>{layout.cluster}</h3>
        <Cluster>
          <StatusChip tone="neutral">{statuses.neutral}</StatusChip>
          <StatusChip tone="waiting">{statuses.waiting}</StatusChip>
          <StatusChip tone="done">{statuses.done}</StatusChip>
        </Cluster>
        <h3>{layout.columns}</h3>
        <Columns at="sm">
          <Sample>{layout.left}</Sample>
          <Sample>{layout.right}</Sample>
        </Columns>
        <Columns at="lg">
          <Sample>{layout.left}</Sample>
          <Sample>{layout.right}</Sample>
        </Columns>
        <Section title={layout.sectionDivided} level={3} divided>
          <p>{layout.sectionBody}</p>
        </Section>
      </Section>
      <Section title={lists.title} headingId="seznamy">
        <h3>{lists.items}</h3>
        <ItemList>
          <Item title={lists.first} badges={<StatusChip tone="done">{statuses.done}</StatusChip>}>
            <Meta>{lists.meta}</Meta>
          </Item>
          <Item title={lists.second} heading={3}>
            <Meta>{lists.meta}</Meta>
          </Item>
        </ItemList>
        <h3>{lists.bullets}</h3>
        <BulletList>
          {lists.bullet.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </BulletList>
        <h3>{lists.facts}</h3>
        <FactList rows={lists.fact} />
      </Section>
      <Section title={disclosure.title} headingId="rozbaleni">
        <Disclosure summary={disclosure.summary}>
          <p>{disclosure.body}</p>
        </Disclosure>
      </Section>
    </>
  );
}
