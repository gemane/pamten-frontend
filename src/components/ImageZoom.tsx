/** The panel's portrait, which opens big on a click.
 *
 *  The avatar is a 72-pixel crop of a thumbnail. The enlarged view shows the
 *  whole picture, uncropped, from the API's large rendition (`large_url`,
 *  `?size=large`, 960 px) — fetched only now, never with the panel, and
 *  through our API like the thumbnail, so Wikimedia still never sees the
 *  reader. The thumbnail shows at once and is swapped for the large file
 *  when it has loaded; if the large file fails, the thumbnail stays.
 *
 *  The credit goes with the picture: a larger reproduction is still the
 *  licensed work, and its attribution belongs beside it. */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import ImageCredit, { type NodeImage } from './ImageCredit'

export default function ImageZoom({ image, alt }: { image: NodeImage; alt: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [src, setSrc] = useState(image.src)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    setSrc(image.src)
    closeRef.current?.focus()
    let live = true
    if (image.large) {
      const big = new Image()
      big.onload = () => { if (live) setSrc(image.large!) }
      big.src = image.large
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => { live = false; document.removeEventListener('keydown', onKey) }
  }, [open, image.src, image.large])

  return (
    <>
      <button type="button" className="panel-avatar-button" onClick={() => setOpen(true)}
              aria-label={t('panel.enlargePhoto', { name: alt })}>
        <img className="panel-avatar" src={image.src} alt={alt} />
      </button>
      {open && createPortal(
        <div className="image-zoom" role="dialog" aria-modal="true" aria-label={alt}
             data-testid="image-zoom" onClick={() => setOpen(false)}>
          <figure className="image-zoom__figure" onClick={e => e.stopPropagation()}>
            <img className="image-zoom__img" src={src} alt={alt} />
            <figcaption><ImageCredit credit={image.credit} kind="person" /></figcaption>
          </figure>
          <button ref={closeRef} type="button" className="image-zoom__close"
                  aria-label={t('panel.closePhoto')} onClick={() => setOpen(false)}>×</button>
        </div>,
        document.body,
      )}
    </>
  )
}
