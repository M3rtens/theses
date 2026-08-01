/* oxlint-disable react/only-export-components -- Next metadata is colocated by convention. */
import { notFound } from 'next/navigation'
import AppShell from '../../../src/components/AppShell.jsx'
import { findPublicAnalyst, plainTextExcerpt } from '../../../src/lib/publicRouteData.js'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const analyst = await findPublicAnalyst(slug)
  if (!analyst) return { title: 'Analyst not found' }

  const title = `${analyst.name} (${analyst.handle})`
  const description = plainTextExcerpt(analyst.bio)
    || `View ${analyst.name}'s published investment theses and tracked performance.`
  const path = `/analysts/${analyst.slug}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      type: 'profile',
      url: path,
      images: [{ url: `${path}/opengraph-image`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${path}/opengraph-image`],
    },
  }
}

export default async function PublicAnalystPage({ params }) {
  const { slug } = await params
  const analyst = await findPublicAnalyst(slug)
  if (!analyst) notFound()
  return <AppShell initialView="analyst" initialAnalyst={analyst} />
}
