/* oxlint-disable react/only-export-components -- Next metadata is colocated by convention. */
import { notFound } from 'next/navigation'
import AppShell from '../../../src/components/AppShell.jsx'
import { findPublicThesis, plainTextExcerpt } from '../../../src/lib/publicRouteData.js'

export async function generateMetadata({ params }) {
  const { id } = await params
  const thesis = await findPublicThesis(id)
  if (!thesis) return { title: 'Thesis not found' }

  const title = `${thesis.ticker}: ${thesis.title}`
  const description = plainTextExcerpt(thesis.body)
    || `${thesis.author}'s ${thesis.side === 'bear' ? 'bear' : 'bull'} thesis on ${thesis.ticker}.`
  const path = `/theses/${thesis.id}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      type: 'article',
      url: path,
      publishedTime: thesis.createdAt || undefined,
      authors: [thesis.author],
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

export default async function PublicThesisPage({ params }) {
  const { id } = await params
  const thesis = await findPublicThesis(id)
  if (!thesis) notFound()
  return <AppShell initialView="thesis" initialThesis={thesis} />
}
