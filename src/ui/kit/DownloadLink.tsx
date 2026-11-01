import { Icon } from './Icon';

/**
 * A link to a file the app hands out as an attachment. A plain anchor, not a Next link: the
 * router would prefetch or fetch it as a page, and every download is audited. It has no `download`
 * attribute: the 200 already says `Content-Disposition: attachment`, and a download link follows a
 * redirect and saves what it lands on, so a failed download's 303 to the archive would be saved as
 * a file instead of showing its notice (ADR 0045).
 */
export function DownloadLink({
  href,
  children,
}: {
  readonly href: `/${string}`;
  readonly children: string;
}) {
  return (
    <a href={href} className="w-fit font-bold">
      {children}
      {'\u00a0'}
      <Icon name="download" />
    </a>
  );
}
