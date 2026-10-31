/**
 * A link to a file the app hands out as an attachment. A plain anchor, not a Next link: the
 * router would prefetch or fetch it as a page, and every download is audited.
 */
export function DownloadLink({
  href,
  children,
}: {
  readonly href: `/${string}`;
  readonly children: string;
}) {
  return (
    <a href={href} download className="font-bold underline">
      {children}
    </a>
  );
}
