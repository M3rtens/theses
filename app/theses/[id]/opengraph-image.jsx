/* oxlint-disable react/only-export-components -- Next image metadata is colocated by convention. */
import { ImageResponse } from 'next/og'
import { findPublicThesis, plainTextExcerpt } from '../../../src/lib/publicRouteData.js'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function ThesisOpenGraphImage({ params }) {
  const { id } = await params
  const thesis = await findPublicThesis(id)
  const side = thesis?.side === 'bear' ? 'BEAR · SHORT' : 'BULL · LONG'
  const accent = thesis?.side === 'bear' ? '#b33a2b' : '#247052'

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', background: '#f7f4ee', color: '#181714', fontFamily: 'Georgia, serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 700 }}>Theses<span style={{ color: '#b33a2b' }}>.</span></div>
        <div style={{ display: 'flex', padding: '10px 16px', border: `2px solid ${accent}`, color: accent, fontSize: 20, fontWeight: 700 }}>{side}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', color: accent, fontFamily: 'Arial, sans-serif', fontSize: 28, fontWeight: 700, letterSpacing: 2 }}>{thesis?.ticker || 'THESIS'}</div>
        <div style={{ display: 'flex', maxWidth: 1040, fontSize: 58, lineHeight: 1.08, fontWeight: 600 }}>{thesis?.title || 'Investment thesis'}</div>
        <div style={{ display: 'flex', maxWidth: 980, color: '#5d5a53', fontFamily: 'Arial, sans-serif', fontSize: 23, lineHeight: 1.35 }}>{plainTextExcerpt(thesis?.body, 150)}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#777168', fontFamily: 'Arial, sans-serif', fontSize: 20 }}>
        <div style={{ display: 'flex' }}>By {thesis?.author || 'Analyst'}</div>
        <div style={{ display: 'flex' }}>Entry and timestamp sealed at publication</div>
      </div>
    </div>,
    size,
  )
}
