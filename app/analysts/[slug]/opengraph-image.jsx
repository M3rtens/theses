/* oxlint-disable react/only-export-components -- Next image metadata is colocated by convention. */
import { ImageResponse } from 'next/og'
import { findPublicAnalyst, plainTextExcerpt } from '../../../src/lib/publicRouteData.js'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function AnalystOpenGraphImage({ params }) {
  const { slug } = await params
  const analyst = await findPublicAnalyst(slug)
  const stats = analyst?.stats || {}

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', background: '#f7f4ee', color: '#181714', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 700 }}>Theses<span style={{ color: '#b33a2b' }}>.</span></div>
        {analyst?.verified && <div style={{ display: 'flex', padding: '10px 16px', border: '2px solid #247052', color: '#247052', fontSize: 20, fontWeight: 700 }}>VERIFIED ANALYST</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 34 }}>
        <div style={{ width: 132, height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 66, background: '#181714', color: 'white', fontSize: 43, fontWeight: 700 }}>{analyst?.avatar || '—'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', fontFamily: 'Georgia, serif', fontSize: 62, fontWeight: 600 }}>{analyst?.name || 'Analyst'}</div>
          <div style={{ display: 'flex', color: '#777168', fontSize: 25 }}>{analyst?.handle || ''}{analyst?.location ? ` · ${analyst.location}` : ''}</div>
        </div>
      </div>
      <div style={{ display: 'flex', color: '#5d5a53', fontSize: 23, lineHeight: 1.35, maxWidth: 980 }}>{plainTextExcerpt(analyst?.bio, 170) || 'A public record of published investment theses.'}</div>
      <div style={{ display: 'flex', gap: 54, paddingTop: 24, borderTop: '2px solid #d8d2c7' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 42, fontWeight: 700 }}>{stats.theses || 0}</span><span style={{ color: '#777168', fontSize: 18 }}>PUBLISHED THESES</span></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 42, fontWeight: 700 }}>{Number(stats.winRate || 0).toFixed(0)}%</span><span style={{ color: '#777168', fontSize: 18 }}>WIN RATE</span></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 42, fontWeight: 700 }}>{Number(stats.avgReturn || 0) >= 0 ? '+' : '−'}{Math.abs(Number(stats.avgReturn || 0)).toFixed(1)}%</span><span style={{ color: '#777168', fontSize: 18 }}>AVG RETURN</span></div>
      </div>
    </div>,
    size,
  )
}
