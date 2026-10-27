import Link from 'next/link';

import { cs } from '@/ui/copy';
import { SlantLabel } from '@/ui/kit';

import { AutosaveDemo } from './AutosaveDemo';
import { ControlDemos } from './ControlDemos';
import { FormDemos } from './FormDemos';
import { KitSections } from './KitSections';
import { PeopleDemos } from './PeopleDemos';
import { ProblemDemos } from './ProblemDemos';
import { StatusDemos } from './StatusDemos';

/** The pattern gallery: each UI part, once, for the look and accessibility checks (inside a Shell). */
export function Gallery({ unavailable = false }: { readonly unavailable?: boolean }) {
  return (
    <>
      <SlantLabel level={1}>{cs.gallery.title}</SlantLabel>
      <p>{cs.gallery.intro}</p>
      <p>
        <Link href="/vzornik?stav=vyjimka" prefetch={false}>
          {cs.gallery.errorPage}
        </Link>
      </p>
      <KitSections />
      <section aria-labelledby="stavy-aplikace">
        <h2 id="stavy-aplikace">{cs.gallery.statusMaps.title}</h2>
        <StatusDemos />
      </section>
      <section aria-labelledby="formular">
        <h2 id="formular">{cs.gallery.forms.title}</h2>
        <FormDemos unavailable={unavailable} />
      </section>
      <section aria-labelledby="ovladaci-prvky">
        <h2 id="ovladaci-prvky">{cs.gallery.forms.controls.title}</h2>
        <ControlDemos />
      </section>
      <section aria-labelledby="osoby">
        <h2 id="osoby">{cs.gallery.people.title}</h2>
        <PeopleDemos />
      </section>
      <section aria-labelledby="ukladani">
        <h2 id="ukladani">{cs.gallery.autosave.title}</h2>
        <AutosaveDemo />
      </section>
      <section aria-labelledby="chyby">
        <h2 id="chyby">{cs.gallery.problems.title}</h2>
        <ProblemDemos />
      </section>
    </>
  );
}
