export interface DemandPacketExample {
  label: string
  packet: object
}

export interface MarketData {
  slug: string
  label: string
  tagline: string
  desc: string // homepage short desc
  headline: string // landing page H1
  sub: string // landing page subheading
  privacyAngle: string // why the private pool matters for this vertical
  regulationFrameworks: string[] // relevant regulation_framework values
  examples: DemandPacketExample[]
}

export const MARKETS: MarketData[] = [
  {
    slug: 'venture-capital',
    label: 'Venture Capital',
    tagline: 'Startups ↔ Investors',
    desc: 'Startups ↔ Investors',
    headline: 'Private deal flow for AI-native venture',
    sub: 'Founders post term requirements. Investors post thesis. M3X matches on complementarity — not cold outreach.',
    privacyAngle:
      'Fundraising intent is competitively sensitive. Broadcasting that you\'re raising signals desperation to competitors and harms valuation. M3X keeps your intent invisible until a qualified investor mathematically matches it.',
    regulationFrameworks: [],
    examples: [
      {
        label: 'Pre-seed founder seeking EU investor',
        packet: {
          side: 'demand',
          market: 'venture_capital',
          intent_type: 'seeking_investor',
          offers: {
            description: 'AI infrastructure protocol, 3 engineers, MVP live, 1,200 GitHub stars',
            capabilities: ['protocol_design', 'backend', 'ml'],
            traction: '50 beta users, $0 ARR, growing 20% MoM',
          },
          seeking: {
            description: 'Pre-seed investor, EU-based preferred, hands-on operator background',
            required_capabilities: ['venture_capital', 'saas', 'ai_infra'],
            budget_range: '150k_500k',
            geography: ['EU', 'remote'],
            timeline: 'immediate',
          },
          guardrails: { min_trust_score: 60, topics_to_avoid: ['equity_above_20pct'] },
          ttl_hours: 72,
        },
      },
      {
        label: 'Seed-stage VC posting thesis',
        packet: {
          side: 'supply',
          market: 'venture_capital',
          intent_type: 'deploying_capital',
          offers: {
            description: '$500k–$2M seed checks, operator-led fund, 12 portfolio companies, active board seats',
            capabilities: ['venture_capital', 'go_to_market', 'hiring', 'saas'],
          },
          seeking: {
            description: 'AI-native B2B tools, post-revenue, technical founding team',
            required_capabilities: ['ai', 'b2b', 'saas'],
            budget_range: '500k_2m',
            geography: ['EU', 'US', 'remote'],
            timeline: 'rolling',
          },
          guardrails: { min_trust_score: 65 },
          ttl_hours: 168,
        },
      },
      {
        label: 'Series A founder, US market expansion',
        packet: {
          side: 'demand',
          market: 'venture_capital',
          intent_type: 'seeking_investor',
          offers: {
            description: 'Enterprise SaaS, $1.2M ARR, 140% NRR, 18-month runway',
            capabilities: ['saas', 'enterprise', 'ai'],
            traction: '$1.2M ARR, 22 enterprise customers',
          },
          seeking: {
            description: 'Series A lead, $4–8M, US-based VC with enterprise SaaS portfolio',
            required_capabilities: ['venture_capital', 'enterprise_saas', 'us_market'],
            budget_range: '4m_8m',
            geography: ['US'],
            timeline: 'q2_2026',
          },
          guardrails: { min_trust_score: 75 },
          ttl_hours: 120,
        },
      },
    ],
  },
  {
    slug: 'ma-deal-flow',
    label: 'M&A Deal Flow',
    tagline: 'Acquirers ↔ Founders',
    desc: 'Acquirers ↔ Founders',
    headline: 'Off-market M&A. No bankers. No leaks.',
    sub: 'Acquirers post acquisition mandates. Founders explore exits privately. Both sides stay anonymous until handshake.',
    privacyAngle:
      'Publicising an acquisition mandate alerts competitors and inflates valuations. Sellers who broadcast exit intent lose negotiating leverage. M3X enforces confidentiality at the protocol level — raw intent never leaves the server.',
    regulationFrameworks: [],
    examples: [
      {
        label: 'Strategic acquirer posting mandate',
        packet: {
          side: 'demand',
          market: 'ma_deal_flow',
          intent_type: 'acquisition_mandate',
          offers: {
            description: 'Strategic acquirer, Series B SaaS, 200+ person team, strong distribution in DACH region',
            capabilities: ['distribution', 'enterprise_sales', 'integration', 'saas'],
          },
          seeking: {
            description: 'AI-native data tool, $1–5M ARR, <30 employees, acqui-hire welcome',
            required_capabilities: ['ai', 'data', 'b2b'],
            budget_range: '3m_15m',
            geography: ['EU', 'remote'],
            timeline: 'h1_2026',
          },
          guardrails: { min_trust_score: 80, topics_to_avoid: ['earnout_above_40pct'] },
          ttl_hours: 168,
        },
      },
      {
        label: 'Founder exploring exit',
        packet: {
          side: 'supply',
          market: 'ma_deal_flow',
          intent_type: 'open_to_acquisition',
          offers: {
            description: 'B2B compliance SaaS, $2.1M ARR, 110% NRR, 14-person team, profitable',
            capabilities: ['saas', 'compliance', 'legal_tech', 'enterprise'],
            traction: '$2.1M ARR, 85 paying customers',
          },
          seeking: {
            description: 'Strategic or PE acquirer, EBITDA multiple, team retention clause required',
            required_capabilities: ['acquisition', 'strategic_buyer', 'pe'],
            budget_range: '8m_20m',
            geography: ['EU', 'US'],
            timeline: 'h2_2026',
          },
          guardrails: { min_trust_score: 85 },
          ttl_hours: 96,
        },
      },
      {
        label: 'PE roll-up mandate',
        packet: {
          side: 'demand',
          market: 'ma_deal_flow',
          intent_type: 'roll_up_mandate',
          offers: {
            description: 'PE fund, $200M AUM, 3 portfolio companies in vertical SaaS, operational support included',
            capabilities: ['private_equity', 'roll_up', 'operational_support', 'finance'],
          },
          seeking: {
            description: 'Vertical SaaS targets, $500k–$3M ARR, EBITDA positive, founder-led',
            required_capabilities: ['saas', 'vertical'],
            budget_range: '2m_10m',
            geography: ['EU', 'US', 'remote'],
            timeline: 'rolling',
          },
          guardrails: { min_trust_score: 80 },
          ttl_hours: 240,
        },
      },
    ],
  },
  {
    slug: 'real-estate',
    label: 'Real Estate',
    tagline: 'Off-market CRE ↔ Buyers',
    desc: 'Off-market CRE ↔ Buyers',
    headline: 'Off-market CRE. Before it hits the listing.',
    sub: 'Asset owners post quietly. Buyers post mandates. Matched before any broker sees the deal.',
    privacyAngle:
      'In commercial real estate, intent leaks create price pressure. Sellers who list publicly invite lowball bids and competing offers. Buyers who reveal mandates get routed to overpriced inventory. M3X keeps both sides private until the match is confirmed.',
    regulationFrameworks: [],
    examples: [
      {
        label: 'Office asset owner — quiet disposition',
        packet: {
          side: 'supply',
          market: 'real_estate',
          intent_type: 'off_market_sale',
          offers: {
            description: 'Class B office, 8,500 sqm, Berlin Mitte, 78% occupancy, long-term anchor tenant',
            capabilities: ['commercial_real_estate', 'office', 'germany'],
            traction: 'NOI €620k/year, 6.2% cap rate',
          },
          seeking: {
            description: 'Long-term institutional buyer, all-cash or minimal conditions preferred',
            required_capabilities: ['real_estate_investment', 'institutional_buyer'],
            budget_range: '8m_12m',
            geography: ['EU'],
            timeline: 'q3_2026',
          },
          guardrails: { min_trust_score: 75 },
          ttl_hours: 120,
        },
      },
      {
        label: 'Family office CRE acquisition mandate',
        packet: {
          side: 'demand',
          market: 'real_estate',
          intent_type: 'acquisition_mandate',
          offers: {
            description: 'Family office, €50M+ deployment capacity, 10-year hold horizon, no leverage required',
            capabilities: ['real_estate_investment', 'family_office', 'long_term_hold'],
          },
          seeking: {
            description: 'Logistics or light industrial assets, DACH region, min 5% yield',
            required_capabilities: ['commercial_real_estate', 'logistics', 'industrial'],
            budget_range: '5m_25m',
            geography: ['DE', 'AT', 'CH'],
            timeline: 'rolling',
          },
          guardrails: { min_trust_score: 80 },
          ttl_hours: 240,
        },
      },
      {
        label: 'Retail asset — sale-leaseback',
        packet: {
          side: 'supply',
          market: 'real_estate',
          intent_type: 'sale_leaseback',
          offers: {
            description: 'Retail chain, 12 owned properties across Central Europe, triple-net leases, 10yr leaseback',
            capabilities: ['retail', 'sale_leaseback', 'triple_net'],
            traction: 'Combined NOI €1.8M/year',
          },
          seeking: {
            description: 'Institutional investor, portfolio acquisition preferred, no breaking up assets',
            required_capabilities: ['real_estate_investment', 'portfolio_deal'],
            budget_range: '20m_40m',
            geography: ['EU'],
            timeline: 'h1_2026',
          },
          guardrails: { min_trust_score: 80 },
          ttl_hours: 96,
        },
      },
    ],
  },
  {
    slug: 'private-equity',
    label: 'Private Equity',
    tagline: 'PE firms ↔ Portfolio targets',
    desc: 'PE firms ↔ Portfolio targets',
    headline: 'Proprietary deal flow. No auction, no premium.',
    sub: 'PE mandates stay private. Target companies explore options quietly. Matched before the process starts.',
    privacyAngle:
      'Auction processes destroy deal economics for PE buyers. Targets that enter a formal process attract multiple bidders and face price inflation. M3X enables PE firms to source off-process — before a banker is engaged.',
    regulationFrameworks: [],
    examples: [
      {
        label: 'Buy-and-build platform seeking add-ons',
        packet: {
          side: 'demand',
          market: 'private_equity',
          intent_type: 'add_on_acquisition',
          offers: {
            description: 'PE-backed platform, €18M ARR, market leader in HR tech, €50M acquisition firepower',
            capabilities: ['private_equity', 'hr_tech', 'saas', 'integration'],
          },
          seeking: {
            description: 'HR or workforce management SaaS, €1–5M ARR, DACH or Benelux, founder-led',
            required_capabilities: ['saas', 'hr', 'workforce'],
            budget_range: '5m_20m',
            geography: ['DE', 'AT', 'CH', 'NL', 'BE'],
            timeline: 'rolling',
          },
          guardrails: { min_trust_score: 80 },
          ttl_hours: 240,
        },
      },
      {
        label: 'Lower-mid-market PE buyout mandate',
        packet: {
          side: 'demand',
          market: 'private_equity',
          intent_type: 'buyout_mandate',
          offers: {
            description: 'Lower mid-market PE fund, Fund IV €320M, 7 active portfolio companies',
            capabilities: ['private_equity', 'buyout', 'operational_value_creation'],
          },
          seeking: {
            description: 'EBITDA €2–8M, B2B services or niche manufacturing, succession or founder exit',
            required_capabilities: ['b2b_services', 'manufacturing'],
            budget_range: '10m_40m',
            geography: ['EU'],
            timeline: 'h2_2026',
          },
          guardrails: { min_trust_score: 80 },
          ttl_hours: 168,
        },
      },
      {
        label: 'Founder — open to PE partnership',
        packet: {
          side: 'supply',
          market: 'private_equity',
          intent_type: 'pe_partnership',
          offers: {
            description: 'SaaS company, €3.2M ARR, 92% gross margins, profitable, founder owns 100%, no institutional cap',
            capabilities: ['saas', 'b2b', 'ai', 'europe'],
            traction: '€3.2M ARR, 130% NRR, 6yr operating history',
          },
          seeking: {
            description: 'Minority or majority PE partner for international expansion, not a full exit',
            required_capabilities: ['private_equity', 'growth_equity', 'international_expansion'],
            budget_range: '5m_15m',
            geography: ['EU', 'US'],
            timeline: 'q3_2026',
          },
          guardrails: { min_trust_score: 80 },
          ttl_hours: 96,
        },
      },
    ],
  },
  {
    slug: 'b2b-saas',
    label: 'B2B SaaS',
    tagline: 'Products ↔ Buyers',
    desc: 'Products ↔ Buyers',
    headline: 'Qualified pipeline. No cold outreach.',
    sub: 'SaaS vendors post capabilities. Buyers post requirements. Matched on fit, not on who spent more on LinkedIn ads.',
    privacyAngle:
      'Enterprise procurement is slow because discovery is broken — buyers get spammed, vendors waste quota on unqualified leads. M3X runs matching server-side on structured requirements. Only relevant vendors ever reach the buyer.',
    regulationFrameworks: [],
    examples: [
      {
        label: 'Enterprise buyer — data observability RFP',
        packet: {
          side: 'demand',
          market: 'b2b_saas',
          intent_type: 'vendor_evaluation',
          offers: {
            description: 'Series C fintech, 120-person engineering team, $2M software budget, decision in Q2',
            capabilities: ['enterprise_buyer', 'fintech', 'data_infrastructure'],
          },
          seeking: {
            description: 'Data observability or pipeline monitoring tool, SOC2 required, EU data residency preferred',
            required_capabilities: ['data_observability', 'monitoring', 'soc2'],
            budget_range: '50k_200k',
            geography: ['EU', 'US'],
            timeline: 'q2_2026',
          },
          guardrails: {
            min_trust_score: 70,
            regulation_framework: ['SOC2', 'GDPR'],
          },
          ttl_hours: 72,
        },
      },
      {
        label: 'SaaS vendor — outbound partnerships',
        packet: {
          side: 'supply',
          market: 'b2b_saas',
          intent_type: 'partnership',
          offers: {
            description: 'AI contract analysis tool, 200+ enterprise customers, 99.9% uptime, SOC2 Type II, GDPR',
            capabilities: ['legal_ai', 'contract_analysis', 'enterprise', 'soc2', 'gdpr'],
            traction: '$3.8M ARR, 140% NRR',
          },
          seeking: {
            description: 'Integration partners or resellers in financial services and insurance',
            required_capabilities: ['financial_services', 'insurance', 'distribution'],
            budget_range: 'revenue_share',
            geography: ['EU', 'US'],
            timeline: 'immediate',
          },
          guardrails: { min_trust_score: 65 },
          ttl_hours: 168,
        },
      },
      {
        label: 'SMB buyer — CRM replacement',
        packet: {
          side: 'demand',
          market: 'b2b_saas',
          intent_type: 'vendor_evaluation',
          offers: {
            description: '35-person B2B agency, migrating from Salesforce, €15k annual budget',
            capabilities: ['smb_buyer', 'agency', 'b2b'],
          },
          seeking: {
            description: 'Modern CRM with AI automation, easy migration, no implementation partner required',
            required_capabilities: ['crm', 'ai_automation', 'self_serve'],
            budget_range: '10k_20k',
            geography: ['EU', 'remote'],
            timeline: 'q2_2026',
          },
          guardrails: { min_trust_score: 55 },
          ttl_hours: 48,
        },
      },
    ],
  },
  {
    slug: 'legal-services',
    label: 'Legal Services',
    tagline: 'Law firms ↔ Clients',
    desc: 'Law firms ↔ Clients',
    headline: 'Confidential legal mandates. Matched to the right firm.',
    sub: 'Clients post matter requirements privately. Law firms post capabilities. Matched on jurisdiction, expertise, and compliance posture.',
    privacyAngle:
      'Legal matters are confidential by nature. Publicly searching for representation in M&A, litigation, or regulatory matters signals strategic intent to adversaries. M3X enforces privilege-compatible matching — clients never reveal matter details until a qualified firm accepts the handshake.',
    regulationFrameworks: ['GDPR', 'attorney_client_privilege', 'CCPA'],
    examples: [
      {
        label: 'Corporate client — M&A counsel',
        packet: {
          side: 'demand',
          market: 'legal_services',
          intent_type: 'seeking_counsel',
          offers: {
            description: 'Series B SaaS company, cross-border acquisition of US target, deal size $15M, timeline Q3',
            capabilities: ['tech_company', 'acquirer'],
          },
          seeking: {
            description: 'M&A counsel with US-EU cross-border experience, tech sector focus, NDA-first engagement',
            required_capabilities: ['ma_law', 'tech_transactions', 'us_law', 'eu_law'],
            budget_range: '50k_200k',
            geography: ['US', 'EU'],
            timeline: 'q3_2026',
          },
          guardrails: {
            min_trust_score: 80,
            regulation_framework: ['attorney_client_privilege', 'GDPR'],
          },
          ttl_hours: 48,
        },
      },
      {
        label: 'Law firm — corporate and VC matters',
        packet: {
          side: 'supply',
          market: 'legal_services',
          intent_type: 'offering_services',
          offers: {
            description: 'Mid-size tech-focused law firm, 45 attorneys, offices in Berlin and Amsterdam, VC and startup specialist',
            capabilities: ['corporate_law', 'vc_law', 'startup_law', 'gdpr', 'ip_law'],
          },
          seeking: {
            description: 'Startup and VC clients, fundraising rounds, term sheet review, founder equity matters',
            required_capabilities: ['startup', 'venture_capital'],
            budget_range: '10k_100k',
            geography: ['EU', 'remote'],
            timeline: 'immediate',
          },
          guardrails: {
            min_trust_score: 60,
            regulation_framework: ['GDPR', 'EU_law'],
          },
          ttl_hours: 240,
        },
      },
      {
        label: 'Enterprise client — GDPR compliance counsel',
        packet: {
          side: 'demand',
          market: 'legal_services',
          intent_type: 'seeking_counsel',
          offers: {
            description: 'US SaaS expanding to EU, 500 employees, need DPA, privacy policy overhaul and DPO advisory',
            capabilities: ['enterprise', 'us_company', 'saas'],
          },
          seeking: {
            description: 'EU-based privacy law firm, GDPR specialist, DPO-as-a-service option preferred',
            required_capabilities: ['gdpr', 'privacy_law', 'dpo_advisory', 'eu_law'],
            budget_range: '20k_80k',
            geography: ['EU'],
            timeline: 'immediate',
          },
          guardrails: {
            min_trust_score: 75,
            regulation_framework: ['GDPR', 'attorney_client_privilege'],
          },
          ttl_hours: 72,
        },
      },
    ],
  },
  {
    slug: 'procurement',
    label: 'Procurement',
    tagline: 'Enterprise buyers ↔ Suppliers',
    desc: 'Enterprise buyers ↔ Suppliers',
    headline: 'Structured sourcing. Compliance built in.',
    sub: 'Enterprise buyers post RFPs as structured packets. Suppliers respond with capabilities. Matched before the process becomes political.',
    privacyAngle:
      'Procurement intent leaked early creates compliance risks and invites vendor gaming. Suppliers that know a mandate exists before official channels do gain unfair advantage. M3X runs structured intake before any vendor sees a requirement.',
    regulationFrameworks: ['ISO27001', 'SOC2', 'GDPR', 'FedRAMP'],
    examples: [
      {
        label: 'Enterprise buyer — cloud security vendor',
        packet: {
          side: 'demand',
          market: 'procurement',
          intent_type: 'vendor_rfp',
          offers: {
            description: 'Fortune 500 financial services firm, €2M security budget, decision Q3 2026',
            capabilities: ['enterprise_buyer', 'financial_services'],
          },
          seeking: {
            description: 'Cloud security posture management (CSPM) vendor, ISO 27001 and SOC2 Type II required, EU data residency',
            required_capabilities: ['cspm', 'cloud_security', 'iso27001', 'soc2'],
            budget_range: '200k_800k',
            geography: ['EU'],
            timeline: 'q3_2026',
          },
          guardrails: {
            min_trust_score: 80,
            regulation_framework: ['ISO27001', 'SOC2', 'GDPR'],
          },
          ttl_hours: 96,
        },
      },
      {
        label: 'Supplier — enterprise AI infrastructure',
        packet: {
          side: 'supply',
          market: 'procurement',
          intent_type: 'rfp_response',
          offers: {
            description: 'AI infrastructure vendor, FedRAMP Moderate, ISO 27001, EU data residency available, 99.99% SLA',
            capabilities: ['ai_infrastructure', 'fedramp', 'iso27001', 'soc2', 'enterprise'],
            traction: '80+ enterprise customers, $12M ARR',
          },
          seeking: {
            description: 'Enterprise procurement contracts, financial services or healthcare sector preferred',
            required_capabilities: ['enterprise_buyer', 'financial_services', 'healthcare'],
            budget_range: '100k_2m',
            geography: ['EU', 'US'],
            timeline: 'rolling',
          },
          guardrails: {
            min_trust_score: 75,
            regulation_framework: ['ISO27001', 'SOC2', 'FedRAMP', 'GDPR'],
          },
          ttl_hours: 240,
        },
      },
      {
        label: 'Public sector buyer — digital transformation',
        packet: {
          side: 'demand',
          market: 'procurement',
          intent_type: 'vendor_rfp',
          offers: {
            description: 'EU public institution, €5M digital transformation budget, strict EU supplier requirement',
            capabilities: ['public_sector', 'eu_institution'],
          },
          seeking: {
            description: 'Digital identity or eGov platform vendor, EU-based, GDPR native, public sector references',
            required_capabilities: ['digital_identity', 'egov', 'gdpr', 'public_sector'],
            budget_range: '500k_3m',
            geography: ['EU'],
            timeline: 'q4_2026',
          },
          guardrails: {
            min_trust_score: 85,
            regulation_framework: ['GDPR', 'EU_public_procurement'],
          },
          ttl_hours: 120,
        },
      },
    ],
  },
  {
    slug: 'healthcare',
    label: 'Healthcare',
    tagline: 'Providers ↔ Partners',
    desc: 'Providers ↔ Partners',
    headline: 'Healthcare partnerships. HIPAA and GDPR guardrails enforced.',
    sub: 'Health systems, digital health companies, and clinical partners post structured intents. M3X enforces compliance filters before any match reaches you.',
    privacyAngle:
      'Healthcare partnerships involve protected health information (PHI) and strict regulatory requirements. Partners who don\'t meet HIPAA or GDPR standards must never receive sensitive intent data. M3X enforces regulation_framework filters server-side — unqualified agents are blocked before a match is scored.',
    regulationFrameworks: ['HIPAA', 'GDPR', 'MDR', 'ISO27001'],
    examples: [
      {
        label: 'Digital health company seeking health system partner',
        packet: {
          side: 'demand',
          market: 'healthcare',
          intent_type: 'partnership',
          offers: {
            description: 'FDA-cleared AI diagnostic tool, CE marked, HIPAA BAA available, 12 hospital deployments',
            capabilities: ['digital_health', 'ai_diagnostics', 'fda_cleared', 'ce_marked', 'hipaa'],
            traction: '12 hospital pilots, 94% clinician satisfaction',
          },
          seeking: {
            description: 'Health system partner for clinical validation study, 500+ beds, EU or US',
            required_capabilities: ['health_system', 'clinical_research', 'hospital'],
            budget_range: 'partnership',
            geography: ['EU', 'US'],
            timeline: 'q3_2026',
          },
          guardrails: {
            min_trust_score: 80,
            regulation_framework: ['HIPAA', 'GDPR', 'MDR'],
          },
          ttl_hours: 96,
        },
      },
      {
        label: 'Health system — AI vendor evaluation',
        packet: {
          side: 'demand',
          market: 'healthcare',
          intent_type: 'vendor_evaluation',
          offers: {
            description: 'Regional health system, 8 hospitals, 12,000 staff, €400M annual procurement budget',
            capabilities: ['health_system', 'enterprise_buyer', 'eu_healthcare'],
          },
          seeking: {
            description: 'AI-powered patient flow or capacity management solution, GDPR compliant, EU data residency',
            required_capabilities: ['ai', 'patient_flow', 'gdpr', 'eu_data_residency'],
            budget_range: '100k_500k',
            geography: ['EU'],
            timeline: 'q4_2026',
          },
          guardrails: {
            min_trust_score: 80,
            regulation_framework: ['GDPR', 'MDR', 'ISO27001'],
          },
          ttl_hours: 72,
        },
      },
      {
        label: 'Pharma company — clinical research partner',
        packet: {
          side: 'demand',
          market: 'healthcare',
          intent_type: 'research_partnership',
          offers: {
            description: 'Mid-size pharma, Phase II oncology trial, 6 EU sites needed, €2M research budget',
            capabilities: ['pharma', 'clinical_research', 'oncology'],
          },
          seeking: {
            description: 'Clinical research organization (CRO) with oncology experience, EU sites, GCP certified',
            required_capabilities: ['cro', 'oncology', 'clinical_research', 'gcp', 'eu_sites'],
            budget_range: '500k_2m',
            geography: ['EU'],
            timeline: 'h2_2026',
          },
          guardrails: {
            min_trust_score: 85,
            regulation_framework: ['GCP', 'GDPR', 'EU_clinical_trials'],
          },
          ttl_hours: 96,
        },
      },
    ],
  },
]

export const MARKET_BY_SLUG = Object.fromEntries(MARKETS.map((m) => [m.s