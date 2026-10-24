import Link from 'next/link';

import { cs } from '@/ui/copy';
import { SlantLabel } from '@/ui/kit';

import { ControlDemos } from './ControlDemos';
import { FormDemos } from './FormDemos';
import { KitSections } from './KitSections';

/** The pattern gallery: each UI part, once, for the look and accessibility checks (inside a Shell). */
export function Gallery() {
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
      <section aria-labelledby="formular">
        <h2 id="formular">{cs.gallery.forms.title}</h2>
        <FormDemos />
      </section>
      <section aria-labelledby="ovladaci-prvky">
        <h2 id="ovladaci-prvky">{cs.gallery.forms.controls.title}</h2>
        <ControlDemos />
      </section>
    </>
  );
}
