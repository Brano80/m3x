/**
 * Market intent templates — used by the MCP agent to guide users through
 * posting a well-structured intent via conversational follow-up questions.
 *
 * The agent calls GET /api/markets/:slug/template, reads the questions,
 * asks the user in plain language, then assembles the intent for m3x_post_intent.
 */

export interface InterviewQuestion {
  field: string           // logical field name
  question: string        // what the agent asks the user, in plain language
  required: boolean       // must be answered before posting
  example?: string        // hint shown to user if they're unsure
}

export interface SideTemplate {
  intent_types: string[]           // valid intent_type values for this side
  description: string              // one-line description of who posts on this side
  interview: InterviewQuestion[]   // ordered questions to ask the user
  assemblyHint: string             // how to turn answers into offers/seeking strings
}

export interface MarketTemplate {
  market: string
  label: string
  demand: SideTemplate
  supply: SideTemplate
}

const TEMPLATES: Record<string, MarketTemplate> = {

  venture_capital: {
    market: 'venture_capital',
    label: 'Venture Capital',
    demand: {
      intent_types: ['seeking_investor'],
      description: 'Founders seeking investment',
      interview: [
        { field: 'stage', question: 'What stage are you at?', required: true, example: 'idea, MVP, pre-revenue, $X ARR, Series A' },
        { field: 'raise_amount', question: 'How much are you raising?', required: true, example: '$150k–$500k pre-seed, $2M seed' },
        { field: 'what_you_offer', question: 'What does your company do and what traction do you have?', required: true, example: 'AI infrastructure protocol, 3 engineers, 1,200 GitHub stars, 50 beta users' },
        { field: 'investor_type', question: 'What kind of investor are you looking for?', required: false, example: 'hands-on operator, sector-specific, EU-based, lead or follow' },
        { field: 'geography', question: 'Geography preference for the investor?', required: false, example: 'EU, US, remote, specific country' },
        { field: 'timeline', question: 'How urgently do you need to close?', required: false, example: 'immediately, Q2 2026, no rush' },
        { field: 'guardrails', question: 'Any hard limits? (e.g. max equity you\'d give up, topics to avoid)', required: false, example: 'no equity above 20%, no convertible notes' },
      ],
      assemblyHint: 'Put company description and traction into offers. Put investor type, amount, geography, timeline into seeking.',
    },
    supply: {
      intent_types: ['deploying_capital'],
      description: 'Investors posting their thesis',
      interview: [
        { field: 'fund_description', question: 'Describe your fund — size, stage focus, number of investments', required: true, example: '$500k–$2M seed checks, operator-led fund, 12 portfolio companies' },
        { field: 'what_you_offer', question: 'What do you bring beyond capital?', required: false, example: 'active board seats, go-to-market help, hiring network' },
        { field: 'target_profile', question: 'What kind of companies are you looking for?', required: true, example: 'AI-native B2B tools, post-revenue, technical founding team' },
        { field: 'check_size', question: 'What is your typical check size?', required: true, example: '$500k–$2M' },
        { field: 'geography', question: 'Geography preference?', required: false, example: 'EU, US, remote' },
        { field: 'timeline', question: 'Are you actively deploying now or building pipeline?', required: false, example: 'actively deploying, rolling, H2 2026' },
      ],
      assemblyHint: 'Put fund description and value-add into offers. Put target company profile and check size into seeking.',
    },
  },

  ma_deal_flow: {
    market: 'ma_deal_flow',
    label: 'M&A Deal Flow',
    demand: {
      intent_types: ['acquisition_mandate', 'roll_up_mandate'],
      description: 'Acquirers posting mandates',
      interview: [
        { field: 'acquirer_description', question: 'Describe who you are as an acquirer', required: true, example: 'Strategic acquirer, Series B SaaS, 200-person team, strong DACH distribution' },
        { field: 'target_profile', question: 'What kind of company are you trying to acquire?', required: true, example: 'AI-native data tool, $1–5M ARR, <30 employees' },
        { field: 'budget', question: 'What is your acquisition budget or valuation range?', required: true, example: '$3M–$15M, €5M–€20M' },
        { field: 'geography', question: 'Geography preference for the target?', required: false, example: 'EU, US, DACH, remote' },
        { field: 'timeline', question: 'What is your acquisition timeline?', required: false, example: 'H1 2026, immediate, rolling' },
        { field: 'guardrails', question: 'Any deal structure requirements or topics to avoid?', required: false, example: 'no earnout above 40%, team retention required' },
      ],
      assemblyHint: 'Put acquirer description and strengths into offers. Put target profile, budget range, geography into seeking.',
    },
    supply: {
      intent_types: ['open_to_acquisition', 'pe_partnership'],
      description: 'Founders exploring exit or acquisition',
      interview: [
        { field: 'company_description', question: 'Describe your company — what do you do and what are the key metrics?', required: true, example: 'B2B compliance SaaS, $2.1M ARR, 110% NRR, 14-person team, profitable' },
        { field: 'exit_preference', question: 'What kind of exit or transaction are you open to?', required: true, example: 'full acquisition, acqui-hire, minority investment, strategic merger' },
        { field: 'valuation_expectation', question: 'What valuation or deal size are you expecting?', required: false, example: '$8M–$20M, EBITDA multiple, revenue multiple' },
        { field: 'buyer_type', question: 'What type of buyer are you looking for?', required: false, example: 'strategic acquirer, PE firm, competitor, financial buyer' },
        { field: 'timeline', question: 'What is your timeline for a transaction?', required: false, example: 'H2 2026, 12–18 months, no rush' },
        { field: 'guardrails', question: 'Any non-negotiables? (e.g. team retention, geography, exclusions)', required: false, example: 'team retention clause required, no offshore buyers' },
      ],
      assemblyHint: 'Put company description, metrics and traction into offers. Put exit type, buyer profile, valuation expectations into seeking.',
    },
  },

  real_estate: {
    market: 'real_estate',
    label: 'Real Estate',
    demand: {
      intent_types: ['acquisition_mandate'],
      description: 'Buyers posting acquisition mandates',
      interview: [
        { field: 'buyer_description', question: 'Who are you as a buyer? (fund, family office, developer, etc.)', required: true, example: 'Family office, €50M+ deployment capacity, 10-year hold horizon' },
        { field: 'asset_type', question: 'What type of asset are you looking for?', required: true, example: 'logistics, office, residential, retail, mixed-use, light industrial' },
        { field: 'geography', question: 'What geography?', required: true, example: 'DACH, EU, specific city or country' },
        { field: 'budget', question: 'What is your acquisition budget per deal?', required: true, example: '€5M–€25M, €10M–€50M' },
        { field: 'yield_requirements', question: 'Any yield or return requirements?', required: false, example: 'min 5% yield, 6%+ cap rate, value-add acceptable' },
        { field: 'timeline', question: 'Timeline to close?', required: false, example: 'rolling, Q3 2026, immediate if right deal' },
      ],
      assemblyHint: 'Put buyer profile and capital capacity into offers. Put asset type, geography, budget, yield requirements into seeking.',
    },
    supply: {
      intent_types: ['off_market_sale', 'sale_leaseback'],
      description: 'Asset owners exploring sale',
      interview: [
        { field: 'asset_description', question: 'Describe the asset — type, size, location, key metrics', required: true, example: 'Class B office, 8,500 sqm, Berlin Mitte, 78% occupancy, €620k NOI/year' },
        { field: 'asking_price', question: 'What price range or cap rate are you targeting?', required: true, example: '€8M–€12M, 6.2% cap rate, negotiable' },
        { field: 'buyer_preference', question: 'What kind of buyer are you looking for?', required: false, example: 'institutional, all-cash, long-term hold, no conditions' },
        { field: 'timeline', question: 'When do you want to close?', required: false, example: 'Q3 2026, flexible, immediate if clean offer' },
        { field: 'special_conditions', question: 'Any special conditions? (leaseback, existing tenants, etc.)', required: false, example: '10yr leaseback required, anchor tenant in place' },
      ],
      assemblyHint: 'Put asset description and financial metrics into offers. Put price expectation, buyer type, timeline into seeking.',
    },
  },

  private_equity: {
    market: 'private_equity',
    label: 'Private Equity',
    demand: {
      intent_types: ['buyout_mandate', 'add_on_acquisition', 'growth_equity'],
      description: 'PE firms posting investment mandates',
      interview: [
        { field: 'fund_description', question: 'Describe your fund — size, strategy, portfolio', required: true, example: 'Lower mid-market PE, Fund IV €320M, 7 active portfolio companies' },
        { field: 'target_profile', question: 'What type of company are you looking for?', required: true, example: 'B2B services or niche manufacturing, EBITDA €2–8M, succession or founder exit' },
        { field: 'deal_size', question: 'What deal size are you targeting?', required: true, example: '€10M–€40M enterprise value' },
        { field: 'geography', question: 'Geography preference?', required: false, example: 'EU, DACH, specific countries' },
        { field: 'timeline', question: 'Actively deploying or building pipeline?', required: false, example: 'H2 2026, rolling, immediate for the right deal' },
      ],
      assemblyHint: 'Put fund credentials and value-add into offers. Put target company profile, deal size, geography into seeking.',
    },
    supply: {
      intent_types: ['pe_partnership', 'open_to_acquisition'],
      description: 'Founders open to PE investment or partnership',
      interview: [
        { field: 'company_description', question: 'Describe your company and key metrics', required: true, example: 'SaaS, €3.2M ARR, 92% gross margins, profitable, founder owns 100%' },
        { field: 'what_you_want', question: 'What are you open to — minority stake, majority, full exit?', required: true, example: 'minority partner for expansion, not a full exit' },
        { field: 'use_of_funds', question: 'What would you use the capital for?', required: false, example: 'international expansion, product investment, founder liquidity' },
        { field: 'valuation', question: 'What valuation range do you have in mind?', required: false, example: '€5M–€15M, revenue multiple, EBITDA multiple' },
        { field: 'geography', question: 'Preferred investor geography?', required: false, example: 'EU, US, specific countries' },
        { field: 'timeline', question: 'Timeline for a transaction?', required: false, example: 'Q3 2026, 12–18 months' },
      ],
      assemblyHint: 'Put company description, metrics and traction into offers. Put transaction type, capital use, valuation into seeking.',
    },
  },

  b2b_saas: {
    market: 'b2b_saas',
    label: 'B2B SaaS',
    demand: {
      intent_types: ['vendor_evaluation', 'partnership'],
      description: 'Buyers or companies seeking SaaS vendors',
      interview: [
        { field: 'buyer_description', question: 'Describe yourself as a buyer — company size, industry, budget', required: true, example: '35-person B2B agency, €15k annual budget, migrating from Salesforce' },
        { field: 'what_you_need', question: 'What tool or capability are you looking for?', required: true, example: 'CRM with AI automation, data observability, security tool' },
        { field: 'requirements', question: 'Any specific requirements? (compliance, integrations, features)', required: false, example: 'SOC2 required, EU data residency, must integrate with HubSpot' },
        { field: 'budget', question: 'What is your budget?', required: false, example: '€10k–€20k/year, €50k–€200k, flexible' },
        { field: 'timeline', question: 'When do you need to make a decision?', required: false, example: 'Q2 2026, immediately, no hard deadline' },
      ],
      assemblyHint: 'Put buyer description and context into offers. Put tool requirements, compliance needs, budget, timeline into seeking.',
    },
    supply: {
      intent_types: ['partnership', 'reseller', 'integration'],
      description: 'SaaS vendors seeking buyers or partners',
      interview: [
        { field: 'product_description', question: 'Describe your product — what it does, key metrics, compliance posture', required: true, example: 'AI contract analysis tool, 200+ enterprise customers, SOC2 Type II, GDPR' },
        { field: 'target_customer', question: 'Who is your ideal customer?', required: true, example: 'mid-market financial services companies, legal teams in enterprises' },
        { field: 'what_you_seek', question: 'Are you looking for direct buyers, resellers, or integration partners?', required: true, example: 'integration partners, resellers in financial services, direct enterprise buyers' },
        { field: 'geography', question: 'Geography?', required: false, example: 'EU, US, remote' },
        { field: 'deal_structure', question: 'What deal structure are you open to?', required: false, example: 'revenue share, direct license, OEM, co-sell' },
      ],
      assemblyHint: 'Put product description, traction, compliance into offers. Put target customer profile, partnership type, geography into seeking.',
    },
  },

  legal_services: {
    market: 'legal_services',
    label: 'Legal Services',
    demand: {
      intent_types: ['seeking_counsel'],
      description: 'Clients seeking legal representation',
      interview: [
        { field: 'client_description', question: 'Briefly describe yourself and the matter (keep it high-level — details stay private)', required: true, example: 'Series B SaaS company, cross-border M&A, deal size ~$15M' },
        { field: 'legal_need', question: 'What kind of legal help do you need?', required: true, example: 'M&A counsel, GDPR compliance, employment law, IP protection, litigation' },
        { field: 'jurisdiction', question: 'What jurisdiction(s) are involved?', required: true, example: 'EU, US, cross-border EU-US, specific country' },
        { field: 'budget', question: 'What is your approximate legal budget?', required: false, example: '€20k–€80k, $50k–$200k, hourly rate preferred' },
        { field: 'timeline', question: 'How urgent is this?', required: false, example: 'immediate, Q3 2026, no rush' },
        { field: 'compliance', question: 'Any compliance frameworks that apply?', required: false, example: 'GDPR, attorney-client privilege, CCPA' },
      ],
      assemblyHint: 'Put client type and matter context into offers. Put legal expertise needed, jurisdiction, budget, compliance into seeking.',
    },
    supply: {
      intent_types: ['offering_services'],
      description: 'Law firms posting their practice areas',
      interview: [
        { field: 'firm_description', question: 'Describe your firm — size, focus areas, geography', required: true, example: 'Mid-size tech-focused firm, 45 attorneys, Berlin and Amsterdam, VC and startup specialist' },
        { field: 'practice_areas', question: 'What are your main practice areas?', required: true, example: 'corporate law, VC, M&A, GDPR, IP, employment' },
        { field: 'target_client', question: 'What type of client are you looking for?', required: true, example: 'startups raising, scale-ups with GDPR needs, US companies expanding to EU' },
        { field: 'geography', question: 'Which jurisdictions do you cover?', required: true, example: 'EU, Germany, Netherlands, US, cross-border' },
        { field: 'engagement_size', question: 'What engagement size do you typically take on?', required: false, example: '€10k–€100k, hourly only, project-based' },
      ],
      assemblyHint: 'Put firm credentials and practice areas into offers. Put ideal client type, matter size, geography into seeking.',
    },
  },

  procurement: {
    market: 'procurement',
    label: 'Procurement',
    demand: {
      intent_types: ['vendor_rfp', 'vendor_evaluation'],
      description: 'Enterprise buyers posting sourcing requirements',
      interview: [
        { field: 'buyer_description', question: 'Describe your organization and procurement context', required: true, example: 'Fortune 500 financial services firm, €2M security budget, decision Q3 2026' },
        { field: 'what_you_need', question: 'What product or service category are you sourcing?', required: true, example: 'cloud security (CSPM), data analytics platform, HR software' },
        { field: 'requirements', question: 'What compliance or technical requirements must vendors meet?', required: true, example: 'ISO 27001, SOC2 Type II, EU data residency, FedRAMP' },
        { field: 'budget', question: 'What is the contract value range?', required: false, example: '€200k–€800k/year, $1M–$5M total contract value' },
        { field: 'timeline', question: 'When do you need to award the contract?', required: false, example: 'Q3 2026, Q4 2026, immediate' },
      ],
      assemblyHint: 'Put buyer description, industry, and procurement authority into offers. Put requirements, compliance standards, budget, timeline into seeking.',
    },
    supply: {
      intent_types: ['rfp_response', 'vendor_listing'],
      description: 'Suppliers posting capabilities for enterprise procurement',
      interview: [
        { field: 'product_description', question: 'Describe your product or service and key enterprise credentials', required: true, example: 'AI infrastructure vendor, FedRAMP Moderate, ISO 27001, EU data residency, 99.99% SLA' },
        { field: 'certifications', question: 'What compliance certifications do you hold?', required: true, example: 'SOC2 Type II, ISO 27001, FedRAMP, GDPR, HIPAA' },
        { field: 'target_sectors', question: 'What enterprise sectors do you target?', required: true, example: 'financial services, healthcare, public sector, enterprise SaaS' },
        { field: 'contract_range', question: 'What contract sizes do you handle?', required: false, example: '€100k–€2M/year' },
        { field: 'geography', question: 'Geography where you can deliver?', required: false, example: 'EU, US, global, specific countries' },
      ],
      assemblyHint: 'Put product description, certifications, SLA, and track record into offers. Put target sectors, contract size, geography into seeking.',
    },
  },

  healthcare: {
    market: 'healthcare',
    label: 'Healthcare',
    demand: {
      intent_types: ['partnership', 'vendor_evaluation', 'research_partnership'],
      description: 'Health organizations seeking partners or vendors',
      interview: [
        { field: 'org_description', question: 'Describe your organization', required: true, example: 'Regional health system, 8 hospitals, 12,000 staff; or mid-size pharma, Phase II trial' },
        { field: 'what_you_need', question: 'What are you looking for?', required: true, example: 'AI patient flow tool, clinical research partner, digital health vendor, CRO' },
        { field: 'compliance', question: 'What compliance frameworks must partners meet?', required: true, example: 'HIPAA, GDPR, MDR, GCP, EU data residency' },
        { field: 'budget', question: 'What is your budget for this engagement?', required: false, example: '€100k–€500k, partnership model, €2M research budget' },
        { field: 'geography', question: 'Geography preference?', required: false, example: 'EU, US, specific countries' },
        { field: 'timeline', question: 'Timeline to engage?', required: false, example: 'Q3 2026, immediate, H2 2026' },
      ],
      assemblyHint: 'Put organization description and procurement authority into offers. Put partnership need, compliance requirements, budget, timeline into seeking.',
    },
    supply: {
      intent_types: ['partnership', 'vendor_listing'],
      description: 'Digital health companies and CROs seeking partners',
      interview: [
        { field: 'product_description', question: 'Describe your product or service and regulatory status', required: true, example: 'FDA-cleared AI diagnostic tool, CE marked, HIPAA BAA available, 12 hospital deployments' },
        { field: 'certifications', question: 'What regulatory approvals or certifications do you hold?', required: true, example: 'FDA cleared, CE marked, ISO 13485, HIPAA compliant, GCP certified' },
        { field: 'what_you_seek', question: 'What kind of partner or customer are you looking for?', required: true, example: 'health system for clinical validation, enterprise buyer, pharma for research partnership' },
        { field: 'geography', question: 'Target geography?', required: false, example: 'EU, US, specific countries' },
        { field: 'timeline', question: 'When are you looking to engage?', required: false, example: 'Q3 2026, immediately, rolling' },
      ],
      assemblyHint: 'Put product description, regulatory status, and clinical track record into offers. Put ideal partner type, compliance requirements, geography into seeking.',
    },
  },

  freelance: {
    market: 'freelance',
    label: 'Freelance',
    demand: {
      intent_types: ['seeking_talent', 'seeking_capacity'],
      description: 'Project owners seeking freelancers or agencies',
      interview: [
        { field: 'project_description', question: 'Describe the project or role you need help with', required: true, example: 'LLM product development, fractional CTO 2 days/week, UX design for SaaS product' },
        { field: 'skills_needed', question: 'What specific skills do you need?', required: true, example: 'Python, PyTorch, Next.js, Figma, TypeScript, Go' },
        { field: 'engagement_type', question: 'What type of engagement? (project, part-time, full-time, fractional)', required: true, example: '3–6 month project, 20h/week, fractional, one-time' },
        { field: 'budget', question: 'What is your budget?', required: false, example: '$5k–$10k/month, $150/hr, fixed price €20k' },
        { field: 'geography', question: 'Remote or location-specific?', required: false, example: 'fully remote, EU timezone, Berlin on-site' },
        { field: 'timeline', question: 'When do you need someone to start?', required: false, example: 'immediately, Q2 2026, flexible' },
      ],
      assemblyHint: 'Put project context and your organization description into offers. Put skills needed, engagement type, budget, timeline into seeking.',
    },
    supply: {
      intent_types: ['seeking_project', 'offering_capacity'],
      description: 'Freelancers or agencies posting availability',
      interview: [
        { field: 'skills_description', question: 'Describe your skills and experience', required: true, example: 'Senior ML engineer, 8yr exp, PyTorch/JAX, LLM fine-tuning, MLOps' },
        { field: 'availability', question: 'How many hours or days per week are you available?', required: true, example: '20h/week, full-time, 2 days/week' },
        { field: 'project_type', question: 'What kind of work are you looking for?', required: true, example: 'LLM product, AI infrastructure, product design, fractional leadership' },
        { field: 'rate', question: 'What is your rate?', required: false, example: '$150–$250/hr, €80–€120/hr, €5k/month' },
        { field: 'geography', question: 'Can you work remotely? Any geography restrictions?', required: false, example: 'fully remote, EU timezone only, open to travel' },
        { field: 'timeline', question: 'When are you available to start?', required: false, example: 'immediately, May 2026, after current project ends' },
      ],
      assemblyHint: 'Put skills, experience, and track record into offers. Put project type preference, rate, availability, timeline into seeking.',
    },
  },

  cofounder: {
    market: 'cofounder',
    label: 'Cofounder',
    demand: {
      intent_types: ['seeking_cofounder'],
      description: 'Founders seeking a cofounder',
      interview: [
        { field: 'what_you_bring', question: 'What do you bring to the table? (background, skills, what\'s already built)', required: true, example: 'Ex-Google SWE, AI infrastructure SaaS in stealth, MVP live, 3 enterprise LOIs' },
        { field: 'what_you_need', question: 'What skills or background are you looking for in a cofounder?', required: true, example: 'GTM or enterprise sales, technical with ML background, operator with healthcare experience' },
        { field: 'equity', question: 'What equity split are you thinking?', required: false, example: '50/50, 60/40, open to discussion, vesting over 4 years' },
        { field: 'stage', question: 'What stage are you at?', required: false, example: 'idea stage, MVP built, first revenue, pre-seed funded' },
        { field: 'geography', question: 'Location preference for the cofounder?', required: false, example: 'EU, US, fully remote, Berlin-based preferred' },
        { field: 'timeline', question: 'How soon do you want to start working together?', required: false, example: 'immediately, Q2 2026, flexible' },
      ],
      assemblyHint: 'Put your background, skills, and what\'s already built into offers. Put cofounder skills needed, equity, geography, timeline into seeking.',
    },
    supply: {
      intent_types: ['open_to_cofounding'],
      description: 'People open to cofounder opportunities',
      interview: [
        { field: 'background', question: 'Describe your background and what you\'d bring as a cofounder', required: true, example: '12yr SWE, ex-Stripe payments infra, full-stack TypeScript/Go, ready for startup' },
        { field: 'what_you_seek', question: 'What kind of startup or cofounder are you looking for?', required: true, example: 'fintech or B2B SaaS, market-validated idea, commercial cofounder to pair with my technical skills' },
        { field: 'equity', question: 'What equity stake are you looking for?', required: false, example: '20–40%, 50/50 open, depends on stage' },
        { field: 'geography', question: 'Where are you based and how flexible are you?', required: false, example: 'Berlin-based, EU only, fully remote' },
        { field: 'timeline', question: 'When are you looking to make a move?', required: false, example: 'immediately, Q3 2026, still employed but exploring' },
      ],
      assemblyHint: 'Put your background, skills, and track record into offers. Put startup type preference, equity expectation, geography, timeline into seeking.',
    },
  },

  hiring: {
    market: 'hiring',
    label: 'Hiring',
    demand: {
      intent_types: ['open_role', 'team_build'],
      description: 'Employers posting open roles',
      interview: [
        { field: 'company_description', question: 'Describe your company and what makes it a good place to work', required: true, example: 'Series B AI company, €120M raised, hybrid Berlin or remote EU, strong eng culture' },
        { field: 'role', question: 'What role are you hiring for?', required: true, example: 'Staff ML Engineer, Senior PM, Head of Product, Fullstack Engineer' },
        { field: 'skills', question: 'What specific skills are required?', required: true, example: 'LLM fine-tuning, PyTorch, TypeScript/React, product management B2B SaaS' },
        { field: 'compensation', question: 'What is the compensation range?', required: false, example: '€130k–€180k + equity, $100k–$150k, competitive' },
        { field: 'geography', question: 'Is this remote, hybrid, or on-site?', required: false, example: 'fully remote EU, hybrid Berlin, on-site London' },
        { field: 'timeline', question: 'When do you need to fill this role?', required: false, example: 'immediately, Q2 2026, rolling' },
      ],
      assemblyHint: 'Put company description and culture into offers. Put role, skills, compensation, location, timeline into seeking.',
    },
    supply: {
      intent_types: ['open_to_opportunity'],
      description: 'Candidates open to opportunities',
      interview: [
        { field: 'background', question: 'Describe your professional background and key achievements', required: true, example: 'Senior PM, 9yr experience, scaled 2 B2B SaaS products from 0 to $10M ARR, EU passport' },
        { field: 'what_you_seek', question: 'What kind of role and company are you looking for?', required: true, example: 'Head of Product or VP Product, seed or Series A, remote-first, meaningful equity' },
        { field: 'compensation', question: 'What compensation range are you targeting?', required: false, example: '€140k–€200k, $180k+, open if equity is meaningful' },
        { field: 'geography', question: 'Where are you based and how flexible are you?', required: false, example: 'Berlin-based, EU timezone, fully remote only' },
        { field: 'timeline', question: 'When could you start?', required: false, example: 'immediately, after 3-month notice period, Q3 2026' },
        { field: 'guardrails', question: 'Any hard requirements? (remote, no specific industries, etc.)', required: false, example: 'no Web3, must be remote-first, early-stage only' },
      ],
      assemblyHint: 'Put background, skills, and notable achievements into offers. Put role preference, compensation, geography, timeline into seeking.',
    },
  },

  partnerships: {
    market: 'partnerships',
    label: 'Partnerships',
    demand: {
      intent_types: ['channel_partnership', 'infrastructure_partnership', 'strategic_partnership'],
      description: 'Companies seeking distribution or integration partners',
      interview: [
        { field: 'company_description', question: 'Describe your company and what you bring to a partnership', required: true, example: 'HR tech SaaS, $8M ARR, 30% partner revenue share, co-marketing budget available' },
        { field: 'what_you_need', question: 'What kind of partner are you looking for?', required: true, example: 'channel reseller with 50+ SMB clients, BaaS provider, systems integrator in DACH' },
        { field: 'partner_profile', question: 'What does the ideal partner look like?', required: true, example: 'HR consultancy with DACH market access, 180+ mid-market clients, implementation capability' },
        { field: 'deal_structure', question: 'What deal structure are you offering?', required: false, example: '30% revenue share, co-sell, white-label, OEM, referral fee' },
        { field: 'geography', question: 'What geography for the partnership?', required: false, example: 'DACH, Nordics, EU, specific countries' },
        { field: 'timeline', question: 'Timeline to engage?', required: false, example: 'Q2 2026, immediately, rolling' },
      ],
      assemblyHint: 'Put company description, product, and what you offer to partners into offers. Put partner profile, geography, deal structure into seeking.',
    },
    supply: {
      intent_types: ['distribution_partnership', 'integration_partnership'],
      description: 'Companies offering distribution or integration capacity',
      interview: [
        { field: 'what_you_offer', question: 'Describe what you bring to a partnership — distribution, clients, capabilities', required: true, example: 'Digital transformation consultancy, 180 mid-market clients in financial services, DACH region' },
        { field: 'what_you_seek', question: 'What kind of product or company do you want to partner with?', required: true, example: 'SaaS products to resell in financial services, fintech infrastructure, AI tools' },
        { field: 'deal_structure', question: 'What partnership model are you looking for?', required: false, example: 'revenue share, co-implementation, reseller agreement, referral fee' },
        { field: 'geography', question: 'What geography can you reach?', required: false, example: 'DACH, EU, specific countries' },
        { field: 'timeline', question: 'When are you looking to start?', required: false, example: 'immediately, Q2 2026, rolling' },
      ],
      assemblyHint: 'Put your distribution reach, client base, and capabilities into offers. Put product type, partnership model, geography into seeking.',
    },
  },

  marketing: {
    market: 'marketing',
    label: 'Marketing & Growth',
    demand: {
      intent_types: ['seeking_agency', 'seeking_talent'],
      description: 'Companies seeking marketing agencies or talent',
      interview: [
        { field: 'company_description', question: 'Describe your company and what you sell', required: true, example: 'B2B SaaS, $4M ARR, need to scale paid acquisition in EU' },
        { field: 'what_you_need', question: 'What marketing help are you looking for?', required: true, example: 'performance marketing agency, SEO partner, fractional CMO, content team' },
        { field: 'channels', question: 'Which channels are most important to you?', required: false, example: 'Google Ads, LinkedIn, SEO, content, email, influencer' },
        { field: 'budget', question: 'What is your monthly marketing budget?', required: false, example: '€5k/month, €20k/month, €50k+' },
        { field: 'geography', question: 'What market are you targeting?', required: false, example: 'EU, US, DACH, global' },
        { field: 'timeline', question: 'When do you need to engage?', required: false, example: 'immediately, Q2 2026, flexible' },
      ],
      assemblyHint: 'Put company description and product into offers. Put marketing need, channels, budget, target market into seeking.',
    },
    supply: {
      intent_types: ['offering_services'],
      description: 'Agencies or marketers posting capabilities',
      interview: [
        { field: 'agency_description', question: 'Describe your agency or expertise and key results', required: true, example: 'Technical SEO agency, 8yr experience, 60+ B2B SaaS clients, 3x organic traffic avg' },
        { field: 'specialization', question: 'What is your main specialization?', required: true, example: 'SEO, performance marketing, content, brand, growth hacking, email, social' },
        { field: 'target_client', question: 'What type of client do you work best with?', required: true, example: 'B2B SaaS, e-commerce, Series A+, SMB, enterprise' },
        { field: 'engagement_model', question: 'How do you engage — retainer, project, fractional?', required: false, example: '€5k/month retainer, project-based, fractional 2 days/week' },
        { field: 'geography', question: 'What geographies do you serve?', required: false, example: 'EU, US, remote, DACH' },
      ],
      assemblyHint: 'Put agency credentials, specialization, and track record into offers. Put ideal client type, engagement model, geography into seeking.',
    },
  },

  supply_chain: {
    market: 'supply_chain',
    label: 'Supply Chain',
    demand: {
      intent_types: ['supplier_search', 'logistics_partnership'],
      description: 'Companies seeking suppliers or logistics partners',
      interview: [
        { field: 'company_description', question: 'Describe your company and what you produce or sell', required: true, example: 'Automotive tier-1 manufacturer, €500M annual procurement, ISO 9001' },
        { field: 'what_you_need', question: 'What are you sourcing or looking for?', required: true, example: 'precision machined components, cold chain logistics, private label food manufacturer, packaging supplier' },
        { field: 'requirements', question: 'What certifications or standards must the supplier meet?', required: false, example: 'ISO 9001, IATF 16949, BRC, IFS, GMP, EU-based only' },
        { field: 'volume', question: 'What annual volume or contract value are you expecting?', required: false, example: '€500k–€5M/year, 10,000 units/month' },
        { field: 'geography', question: 'Geography preference for the supplier?', required: false, example: 'EU only, DACH, Eastern Europe, global' },
        { field: 'timeline', question: 'When do you need to onboard a new supplier?', required: false, example: 'Q3 2026, immediately, 6-month lead time acceptable' },
      ],
      assemblyHint: 'Put buyer description, volume, and procurement authority into offers. Put sourcing need, certifications, geography, timeline into seeking.',
    },
    supply: {
      intent_types: ['offering_capacity', 'supplier_listing'],
      description: 'Suppliers or logistics providers posting capacity',
      interview: [
        { field: 'company_description', question: 'Describe your company, capacity, and key certifications', required: true, example: 'Pan-European 3PL, 12 warehouses, cold chain, ISO 9001, 200+ clients' },
        { field: 'what_you_offer', question: 'What specifically do you manufacture, supply, or provide?', required: true, example: 'precision machining, food manufacturing, cold chain logistics, packaging' },
        { field: 'certifications', question: 'What certifications do you hold?', required: true, example: 'ISO 9001, IATF 16949, BRC, IFS, ISO 14001' },
        { field: 'capacity', question: 'What capacity or volume can you handle?', required: false, example: '50,000 units/month, 50k sqm storage, €2M+ annual contracts' },
        { field: 'target_client', question: 'What industry or type of client are you targeting?', required: false, example: 'automotive, FMCG, pharma, retail, manufacturing' },
        { field: 'geography', question: 'Where can you deliver or operate?', required: false, example: 'EU, DACH, global, specific countries' },
      ],
      assemblyHint: 'Put company description, certifications, capacity, and track record into offers. Put target client type, contract size, geography into seeking.',
    },
  },

  sustainability: {
    market: 'sustainability',
    label: 'Sustainability',
    demand: {
      intent_types: ['seeking_investment', 'energy_partnership', 'esg_partnership'],
      description: 'Companies seeking ESG investment or green partnerships',
      interview: [
        { field: 'company_description', question: 'Describe your company and the climate or ESG angle', required: true, example: 'Carbon capture SaaS, 12 industrial clients, €800k ARR, EU ETS compatible' },
        { field: 'what_you_need', question: 'What are you looking for?', required: true, example: 'impact investor, renewable energy PPA, ESG partnership, green supply chain partner' },
        { field: 'impact_metrics', question: 'What impact metrics can you demonstrate?', required: false, example: '2.1M tCO2e tracked, 40% energy reduction for clients, certified B Corp' },
        { field: 'compliance', question: 'What ESG frameworks or standards do you comply with?', required: false, example: 'SFDR, TCFD, EU Taxonomy, CSRD, GHG Protocol' },
        { field: 'geography', question: 'Geography?', required: false, example: 'EU, US, global' },
        { field: 'timeline', question: 'Timeline to engage?', required: false, example: 'H1 2026, immediately, rolling' },
      ],
      assemblyHint: 'Put company description, impact metrics, and ESG credentials into offers. Put investment/partnership need, compliance requirements, geography into seeking.',
    },
    supply: {
      intent_types: ['deploying_capital', 'offering_services'],
      description: 'Impact investors or green service providers posting mandates',
      interview: [
        { field: 'fund_or_company', question: 'Describe your fund or company and ESG focus', required: true, example: 'SFDR Article 9 impact fund, €180M AUM, EU Green Deal sectors; or renewable energy developer with 500MW capacity' },
        { field: 'what_you_offer', question: 'What do you bring — capital, services, infrastructure?', required: true, example: 'impact capital with active portfolio support, PPA agreements, carbon offset verification' },
        { field: 'target_profile', question: 'What kind of company or project are you targeting?', required: true, example: 'climate tech startups €500k–€5M revenue, corporates needing PPAs, SMEs with CSRD obligations' },
        { field: 'compliance', question: 'What ESG frameworks do you operate under?', required: false, example: 'SFDR Article 9, EU Taxonomy, TCFD reporting' },
        { field: 'geography', question: 'Geography focus?', required: false, example: 'EU, global, specific countries' },
        { field: 'timeline', question: 'Actively deploying or building pipeline?', required: false, example: 'actively deploying, rolling, H2 2026' },
      ],
      assemblyHint: 'Put fund/company credentials, ESG frameworks, and what you offer partners into offers. Put target company profile, compliance requirements, geography into seeking.',
    },
  },

  executive_search: {
    market: 'executive_search',
    label: 'Executive Search',
    demand: {
      intent_types: ['executive_hire', 'board_search'],
      description: 'Companies seeking C-suite executives or board members',
      interview: [
        { field: 'company_description', question: 'Describe your company — stage, size, ownership', required: true, example: 'PE-backed B2B SaaS, €25M ARR, preparing for Series C or exit in 18–24 months' },
        { field: 'role', question: 'What role are you looking to fill?', required: true, example: 'CEO, CFO, CTO, CPO, CCO, independent board director, non-exec' },
        { field: 'candidate_profile', question: 'What background and experience must the candidate have?', required: true, example: 'SaaS finance and M&A experience, investor relations background, 3+ exits' },
        { field: 'compensation', question: 'What is the compensation package?', required: false, example: '€250k–€350k base + equity, €30k–€60k board fee, competitive package' },
        { field: 'geography', question: 'Location requirement?', required: false, example: 'EU-based, remote possible, specific city' },
        { field: 'timeline', question: 'When do you need to fill the role?', required: false, example: 'Q3 2026, immediately, 3-month search timeline' },
      ],
      assemblyHint: 'Put company description, stage, and opportunity into offers. Put role, candidate profile, compensation, geography, timeline into seeking.',
    },
    supply: {
      intent_types: ['open_to_opportunity'],
      description: 'C-suite executives or board candidates open to opportunities',
      interview: [
        { field: 'background', question: 'Describe your executive background and key achievements', required: true, example: 'CTO with 3 exits, scaled 2 engineering teams from 5 to 80+, IPO experience' },
        { field: 'what_you_seek', question: 'What kind of role or opportunity are you open to?', required: true, example: 'CTO at Series B–D, independent board director, fractional CFO, advisory role' },
        { field: 'company_stage', question: 'What stage or type of company are you targeting?', required: false, example: 'Series B–D, PE-backed, pre-IPO, scale-up, specific industry' },
        { field: 'compensation', question: 'What compensation are you targeting?', required: false, example: '€300k+ base with meaningful equity, board fee €40k–€80k, flexible' },
        { field: 'geography', question: 'Location flexibility?', required: false, example: 'EU-based, remote only, willing to relocate for right role' },
        { field: 'timeline', question: 'When would you be available?', required: false, example: 'immediately, Q3 2026, currently employed but exploring' },
      ],
      assemblyHint: 'Put executive background, achievements, and track record into offers. Put role preference, company stage, compensation expectations, geography into seeking.',
    },
  },

  misc: {
    market: 'misc',
    label: 'Other',
    demand: {
      intent_types: ['general_request'],
      description: 'Any intent that doesn\'t fit a standard market',
      interview: [
        { field: 'what_you_need', question: 'What are you looking for? Describe it as simply as possible.', required: true, example: 'a cleaner for my house, a driver, a music producer, a lawyer for a personal matter' },
        { field: 'what_you_offer', question: 'What can you offer in return?', required: true, example: 'payment, equity, barter, services, opportunity' },
        { field: 'requirements', question: 'Any specific requirements?', required: false, example: 'must be local, must speak French, licensed professional only' },
        { field: 'budget', question: 'What is your budget or what can you offer?', required: false, example: '€500 one-time, €200/month, negotiable' },
        { field: 'geography', question: 'Where do you need this?', required: false, example: 'Bratislava, remote, EU, anywhere' },
        { field: 'timeline', question: 'When do you need it?', required: false, example: 'this week, next month, flexible' },
      ],
      assemblyHint: 'Put what you bring or offer into offers. Put your actual need, requirements, budget, geography, and timeline into seeking.',
    },
    supply: {
      intent_types: ['general_offer'],
      description: 'Anyone offering something that doesn\'t fit a standard market',
      interview: [
        { field: 'what_you_offer', question: 'What are you offering?', required: true, example: 'house cleaning services, personal driving, music production, handyman work' },
        { field: 'description', question: 'Tell me more about it — your experience, quality, or credentials', required: false, example: '5yr experience, 50+ satisfied clients, professional equipment' },
        { field: 'what_you_seek', question: 'What kind of client or arrangement are you looking for?', required: true, example: 'recurring client, one-time project, long-term contract' },
        { field: 'rate', question: 'What are your rates?', required: false, example: '€25/hr, €150/day, fixed price €500' },
        { field: 'geography', question: 'Where can you provide this?', required: false, example: 'Bratislava, remote, EU, specific area' },
        { field: 'availability', question: 'When are you available?', required: false, example: 'weekends only, full-time, immediate' },
      ],
      assemblyHint: 'Put your offering, credentials, and track record into offers. Put ideal client, rate, geography, availability into seeking.',
    },
  },

}

export function getMarketTemplate(marketSlug: string): MarketTemplate | null {
  // Normalize slug: both 'venture-capital' and 'venture_capital' should work
  const key = marketSlug.replace(/-/g, '_')
  return TEMPLATES[key] ?? null
}

export const ALL_MARKET_TEMPLATES = TEMPLATES
