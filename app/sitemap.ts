import { MetadataRoute } from 'next'

const BASE_URL = 'https://m3x.space'

const MARKETS = [
  'venture-capital',
  'b2b-saas',
  'freelance',
  'cofounder',
  'hiring',
  'partnerships',
  'legal-services',
  'procurement',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const marketPages = MARKETS.map((slug) => ({
    url: `${BASE_URL}/markets/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    ...marketPages,
  ]
}
