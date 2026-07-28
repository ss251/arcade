import { useId } from "react"
import arcMarkSvg from "../marks/arc-mark.svg?raw"
import usdcSvg from "../marks/usdc.svg?raw"

/**
 * Brand marks, vendored — never hotlinked.
 *
 * arc.network and docs.arc.network both 301 to arc.io, and their logo URLs carry a signed
 * `s=` query param that rotates. A fetched copy of one is 24 bytes reading "Invalid query
 * parameters", which is exactly what a hotlink looks like in a judge's browser three days
 * after we tested it. These are files in the repo.
 *
 * Neither is a semantic colour. Blue means USDC, green settled, red not-settled — a
 * self-contained brand object is a different category, and carrying one does not license a
 * third hue anywhere else on the card.
 */

/**
 * The Arc arch. Its gradient id is DOCUMENT-GLOBAL once inlined, so two copies on one page
 * would collide and the second would render wrong or empty. `useId` gives each instance its
 * own, which is the version that survives a card appearing twice in a thread.
 */
export const ArcMark = ({ size = 20 }: { size?: number }) => {
  const id = useId().replace(/:/g, "")
  const svg = arcMarkSvg
    .replace(/id="arcMark"/g, `id="arcMark-${id}"`)
    .replace(/url\(#arcMark\)/g, `url(#arcMark-${id})`)
    .replace(/<svg /, `<svg width="${size}" height="${size}" `)
  return <span className="mark-plate" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Circle's own USDC mark — flat fills, self-contained on any background. */
export const UsdcMark = ({ size = 26 }: { size?: number }) => (
  <span
    className="mark-plate"
    dangerouslySetInnerHTML={{
      __html: usdcSvg.replace(/<svg /, `<svg width="${size}" height="${size}" `)
    }}
  />
)
