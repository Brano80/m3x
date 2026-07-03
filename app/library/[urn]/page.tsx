import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServiceClient } from '@/lib/supabase'
import styles from '../page.module.css'

const URN_RE = /^urn:air:[a-z0-9.-]{1,128}:(business|agent|tool):[a-z0-9-]{1,128}$/

interface CredentialItem {
  issuer?: string
  name?: string
  tier?: string
  status?: string
  verify_url?: string
}

interface ClaimItem {
  id?: string
  text?: string
  provenance?: string
  status?: string
  evidence_url?: string
}

async function getCard(rawUrn: string) {
  const urn = decodeURIComponent(rawUrn)
  if (!URN_RE.test(urn)) return null
  // Reads via the SECURITY DEFINER RPC (migration #3) — the library schema
  // itself stays locked; never query library.cards directly from app code.
  const supabase = getServiceClient()
  const { data } = await supabase.rpc('library_get_card', { p_urn: urn })
  return data ?? null
}

export async function generateMetadata(
  { params }: { params: Promise<{ urn: string }> }
): Promise<Metadata> {
  const { urn } = await params
  const card = await getCard(urn)
  if (!card) return { title: 'Card not found | M3X Library' }
  return {
    title: `${card.name} — ${card.type} card | M3X Library`,
    description: card.one_liner ?? `Verified ${card.type} card for ${card.name} in the M3X library.`,
  }
}

function ringClass(score: number): string {
  if (score >= 70) return styles.ringHi
  if (score >= 40) return styles.ringMid
  return styles.ringLo
}

export default async function CardPage(
  { params }: { params: Promise<{ urn: string }> }
) {
  const { urn } = await params
  const card = await getCard(urn)
  if (!card) notFound()

  const credentials: CredentialItem[] = Array.isArray(card.credentials) ? card.credentials : []
  const claims: ClaimItem[] = Array.isArray(card.claims) ? card.claims : []
  const trust = card.trust ?? {}
  const endpoints = card.endpoints ?? {}

  // Canonical card JSON (v0.2 shape) — what agents get from the API
  const cardJson = {
    schema_version: card.schema_version,
    type: card.type,
    urn: card.urn,
    domain: card.domain,
    name: card.name,
    one_liner: card.one_liner,
    category: card.category,
    capabilities: card.capabilities,
    serves_markets: card.serves_markets,
    customer_types: card.customer_types,
    entity_size: card.entity_size,
    industries: card.industries,
    integrations: card.integrations,
    languages: card.languages,
    credentials: card.credentials,
    pricing: card.pricing,
    claims: card.claims,
    endpoints: card.endpoints,
    callable: card.callable,
    identity: card.identity,
    trust: card.trust,
    meta: card.meta,
  }

  return (
    <div className={styles.root}>
      <nav className={styles.nav}>
        <div className={styles.navIn}>
          <Link href="/" className={styles.logo} aria-label="M3X home">
            M<b>3</b>X<span className={styles.logoLib}>Library</span>
          </Link>
          <div className={styles.navLinks}>
            <Link href="/library" className={styles.navLink}>◈ Browse</Link>
            <Link href="/" className={styles.navLink}>⬡ Match — private pool</Link>
            <Link href="/toolradar" className={styles.navLink}>Tool Radar</Link>
          </div>
          <Link href="/register" className={styles.navCta}>Claim your card</Link>
        </div>
      </nav>

      <div className={styles.detailWrap}>
        <Link href="/library" className={styles.backLink}>← back to library</Link>

        <div className={styles.detailCard}>
          <div className={styles.chead}>
            <div className={styles.avatar}>◈</div>
            <div className={styles.cid}>
              <h1 className={styles.cardName}>
                {card.name}
                <span className={styles.typeTag}>{card.type}</span>
              </h1>
              {card.one_liner && <div className={styles.oneliner}>{card.one_liner}</div>}
              <div className={styles.urn}>{card.urn}</div>
            </div>
            <div className={styles.tscore}>
              <div
                className={`${styles.ring} ${ringClass(card.trust_score)}`}
                style={{ ['--v' as string]: card.trust_score }}
              >
                <span>{card.trust_score}</span>
              </div>
              <div className={styles.tscoreLbl}>TRUST</div>
            </div>
          </div>

          <div className={styles.badges}>
            {credentials.map((cr, i) => (
              <span key={i} className={cr.status === 'confirmed' ? styles.bConf : styles.bUnc}>
                {cr.status === 'confirmed' ? '✓' : '◌'} {cr.issuer} {cr.tier && cr.tier !== '—' ? cr.tier : cr.name}
                {cr.status === 'confirmed' ? ' — confirmed' : ' — unconfirmed'}
              </span>
            ))}
            <span className={styles.bRung}>● {card.callable ? 'callable' : 'readable'}</span>
            {card.status === 'unclaimed' && (
              <span className={styles.bUnc}>◌ unclaimed — auto-generated card</span>
            )}
            {(card.capabilities ?? []).map((cap: string) => (
              <span key={cap} className={styles.bFacet}>{cap}</span>
            ))}
          </div>

          {trust.basis_string && (
            <div className={styles.basis}>
              <span className={styles.basisLbl}>RECEIPT</span>
              {trust.basis_string}
            </div>
          )}

          {claims.length > 0 && (
            <div className={styles.detailSection}>
              <div className={styles.detailH}>Claims</div>
              {claims.map((cl, i) => (
                <div key={cl.id ?? i} className={styles.claimRow}>
                  {cl.status === 'confirmed' ? '✓ ' : '◌ '}
                  {cl.text}
                  <span style={{ opacity: 0.6 }}> — {cl.provenance} · {cl.status}</span>
                </div>
              ))}
            </div>
          )}

          {(endpoints.website || endpoints.mcp) && (
            <div className={styles.detailSection}>
              <div className={styles.detailH}>Endpoints</div>
              {endpoints.website && (
                <div className={styles.claimRow}>
                  website:{' '}
                  <a href={endpoints.website} target="_blank" rel="noopener noreferrer nofollow"
                     style={{ color: 'inherit' }}>
                    {endpoints.website}
                  </a>
                </div>
              )}
              {endpoints.mcp && <div className={styles.claimRow}>mcp: {endpoints.mcp}</div>}
            </div>
          )}

          <div className={styles.detailSection}>
            <div className={styles.detailH}>Card JSON — what agents read</div>
            <pre className={styles.jsonPre}>{JSON.stringify(cardJson, null, 2)}</pre>
            <div className={styles.mcpBox}>
              GET https://m3x.space/api/library/card/{encodeURIComponent(card.urn)}
            </div>
          </div>

          <div className={styles.detailCtaRow}>
            {card.status === 'unclaimed' && (
              <Link href="/register" className={styles.navCta}>
                Claim this card free →
              </Link>
            )}
            <Link href="/library" className={styles.panelBtn}>Search more cards</Link>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerIn}>
          <span><b>M3X</b> · Library</span>
          <span>pay for verification, never for rank</span>
          <Link href="/library" className={styles.footerRight}>← Library</Link>
        </div>
      </footer>
    </div>
  )
}
