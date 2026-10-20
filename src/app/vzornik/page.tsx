import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { galleryPage } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { Gallery } from '@/ui/features/gallery';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.gallery.title) };

type Props = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Development and test only: in production the gallery is a 404. */
export default async function GalleryPage({ searchParams }: Props) {
  const gallery = galleryPage(await searchParams);
  if (!gallery) notFound();
  // A real render failure, to see global-error (the 500 page) in a browser and in e2e.
  if (gallery.fail) throw new Error('vzornik: failure requested with ?stav=vyjimka');
  return (
    <Shell>
      <Gallery />
    </Shell>
  );
}
