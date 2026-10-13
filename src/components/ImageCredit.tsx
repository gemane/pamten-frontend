/** A node's image, fetched through our own API, and the credit its licence
 *  asks for.
 *
 *  The panel used to load a person's photo from Wikipedia and a company's
 *  logo from Wikimedia straight from the browser — the reader's address and
 *  what they looked at went to a third party on every open, and the image
 *  came without attribution. Now the backend resolves the file, checks its
 *  licence, caches it and serves bytes plus credit (`GET /media/{kind}/{id}`);
 *  the browser talks only to the API. A node the API has no licensed image
 *  for simply shows none.
 *
 *  The credit is visible, not a hover: "Photo: Jane Doe · CC BY-SA 4.0 ·
 *  Wikimedia Commons", author and licence linked to the Commons file page
 *  and the licence text, which is what "attribution reasonable to the
 *  medium" means for a 72-pixel portrait. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getMediaImage, mediaFileUrl, type MediaImage, type MediaKind } from '../services/api'

export interface NodeImage { src: string; credit: MediaImage }

export function useMediaImage(kind: MediaKind, id: string | undefined): NodeImage | null {
  const [image, setImage] = useState<NodeImage | null>(null)
  useEffect(() => {
    setImage(null)
    if (!id) return
    let live = true
    Promise.resolve()
      .then(() => getMediaImage(kind, id))
      .then(r => { if (live && r?.data) setImage({ src: mediaFileUrl(r.data.url), credit: r.data }) })
      .catch(() => { /* no licensed image, or the source is down: no image */ })
    return () => { live = false }
  }, [kind, id])
  return image
}

/** The caption parts in order: who, under what, from where. A public-domain
 *  file with no author named reads "Public domain · Wikimedia Commons". */
export function creditParts(credit: MediaImage): { text: string; href: string }[] {
  const parts: { text: string; href: string }[] = []
  if (credit.author) parts.push({ text: credit.author, href: credit.file_page })
  parts.push({ text: credit.license, href: credit.license_url || credit.file_page })
  parts.push({ text: credit.source, href: credit.file_page })
  return parts
}

export default function ImageCredit({ credit, kind }: { credit: MediaImage; kind: MediaKind }) {
  const { t } = useTranslation()
  const label = t(kind === 'person' ? 'panel.photoCredit' : 'panel.logoCredit')
  return (
    <div className="panel-image-credit" data-testid="image-credit">
      {label}:{' '}
      {creditParts(credit).map((p, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          <a href={p.href} target="_blank" rel="noreferrer">{p.text}</a>
        </span>
      ))}
    </div>
  )
}
