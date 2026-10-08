// Funnel + ICP definitions for both companies.
// Grounded in each site's own positioning (llms.txt, framework / firm / platform pages). No invented metrics:
// targets are set after a four-week baseline, exactly as in the Rothenhall one-pager this is modelled on.

export const GEO = {
  core: ['United States'],
  expand: ['United Kingdom & Ireland', 'Canada', 'EU & Nordics', 'Australia & New Zealand', 'UAE, Saudi Arabia & Qatar', 'Singapore', 'Israel', 'Brazil & Mexico'],
  excluded: ['India', 'Nigeria'],
};

export const FUNNELS = {
  ventures: {
    kicker: 'Dayone Ventures · Funnel and pipeline',
    headline: ['Sponsors do not read brochures, so ', 'a Value Map.', ' Reach, capture, convert.'],
    intro:
      'A sponsor or software CEO does not want a pitch. They want to know where value is leaking in a company and what it is worth fixing. So the content that fills each stage is diagnostic proof: a benchmark, a scorecard and a scoped diagnostic, built as a small set of repeatable assets that share one voice and one next step.',
    icp: {
      one: 'Sponsors and management teams of lower-middle-market software companies ($5M–$40M ARR) who need the operating work done, not advised, in any market except India and Nigeria.',
      segments: [
        { name: 'Sponsors', who: 'PE firms, independent sponsors, search funds, family offices and holdcos with lower-middle-market software.', titles: 'Partner, Principal, Operating Partner, VP Portfolio Operations', trigger: 'New acquisition and a hundred-day plan that needs owners; a portfolio company stuck flat.' },
        { name: 'Portfolio management teams', who: 'CEO and CFO of a sponsor-backed software company with $5M–$40M ARR.', titles: 'CEO, CFO, COO, Chief Product Officer', trigger: 'Net revenue retention below target, margin pressure, a board asking for a bigger number.' },
        { name: 'Founders and owners', who: 'Owners of software or tech-enabled businesses weighing a control or structured partner.', titles: 'Founder, CEO, Chair', trigger: 'Pre-exit in 12–24 months; growth has plateaued; wants a higher multiple, not just a buyer.' },
      ],
      firmographics: ['$5M–$40M ARR software or tech-enabled services', 'Earnings flat or under-managed; two or more operating levers to pull (revenue, margin, product)', 'Holding period still ahead, or exit readiness needed within 24 months', 'Decision maker reachable: sponsor partner or CEO'],
      disqualify: ['Pre-revenue, consumer hardware or non-software businesses', 'Requests for advice or slide work only, with no appetite for operating accountability', 'Vendors, list sellers, agencies and service resellers', 'Buyer or company headquartered in India or Nigeria'],
      qualify: ['Which sponsor or owner, and what is the ARR?', 'Which of the six value dimensions hurts most: GTM, margin, NRR, pricing, defensibility, cost?', 'Who owns the number after we leave the room?', 'What is the exit or hold horizon?'],
    },
    stages: [
      {
        tag: 'TOFU · Reach', title: 'Where is the value leaking?', tone: 'dark',
        goal: 'Put the right sponsors and CEOs in front of a specific, quotable diagnosis, so the first thing they learn about Dayone is a useful answer.',
        assets: [
          ['Value Leak benchmark posts.', 'One post per diagnostic dimension: go-to-market efficiency, gross margin, retention, pricing, defensibility, cost. Open with the question a sponsor asks, then answer it.'],
          ['Operator, not advisor.', 'Why the holding period is the product, and how an operating partner differs from a consultant. Written so AI assistants can quote it.'],
          ['Day-One 100-day plan.', 'The first hundred days after close, mapped to Diagnose and Operate, as a one-page template.'],
          ['Named outbound list.', 'Twenty hand-picked lower-middle-market software companies and their sponsors per week, each with one specific observation. India and Nigeria headquartered accounts are excluded.'],
        ],
        channels: 'LinkedIn led by the partners, sponsor and operating-partner newsletters, search and answer engines, introductions from portfolio executives and the Dayone technology group, sponsor conferences in core markets.',
        measure: 'ICP accounts reached per week, outbound reply rate, non-brand search impressions, and how often AI assistants name Dayone in a weekly ten-prompt check. One metric to beat: ICP replies per week.',
      },
      {
        tag: 'MOFU · Capture', title: 'The Value Map sample', tone: 'dark',
        goal: 'Turn a reader into a named contact inside the ICP who has raised their hand. Today the only exit is a contact form.',
        assets: [
          ['Value Map sample.', 'A redacted one-page diagnostic: six dimensions, a ranked list of interventions, and what each is worth. Organisation and role required to download.'],
          ['Portfolio scorecard.', 'Ten questions a sponsor answers about one company. Returns a leak score and the two dimensions to look at first.'],
          ['Operating library notes.', 'One lesson a month from the proprietary operating library, sent to captured contacts.'],
          ['Sponsor briefing.', 'Thirty minutes, under NDA, walking one live company through the four-phase framework.'],
        ],
        channels: 'One landing page with three choices: get the sample, score a company, book a briefing. Comment keyword ("MAP") on LinkedIn posts. Capture organisation, role and country on every form.',
        measure: 'Captures per 100 visits, ICP-qualified share of captures, scorecard completions, briefings booked. Baseline in week 4 before setting targets.',
      },
      {
        tag: 'BOFU · Convert', title: 'Diagnostic before capital', tone: 'accent',
        goal: 'A first scoped diagnostic inside the quarter, and a mandate that runs across the holding period.',
        assets: [
          ['Scoped diagnostic.', 'One company, six dimensions, a Value Map in a fixed window. "No capital moves ahead of the diagnosis."'],
          ['Proof stack.', 'The four-phase framework, the captive technology group, and the 100+ production platforms it has delivered, each linked to its source page.'],
          ['Sponsor references.', 'With consent, a named reference or a dated before and after. No invented testimonials.'],
          ['Mandate proposal.', 'Diagnose, Operate, Compound, Realize, with scope, fees and the numbers Dayone is accountable for.'],
        ],
        loop: 'After a diagnostic, propose a second company in the same portfolio and ask for two introductions.',
        measure: 'Capture to briefing, briefing to diagnostic, diagnostic to mandate, cycle length in days, and declared pipeline. Baseline these in week 4 before setting targets.',
      },
    ],
    week: [['Mon', 'Value Leak benchmark post'], ['Wed', 'Scorecard share with comment keyword'], ['Thu', 'Twenty outbound messages, one specific observation each'], ['Fri', 'Operating library note to captured list'], ['Sun', 'Review ICP fit of the week’s leads, pick next week’s list']],
  },

  tech: {
    kicker: 'Day One Technologies · Funnel and pipeline',
    headline: ['Operators do not shop for developers, so ', 'a Diagnostic.', ' Reach, capture, convert.'],
    intro:
      'A CEO, CTO or operating partner is not looking for a vendor. They want to know which technology move changes the number, and who will own delivering it. So each stage is filled with proof of execution: a direct answer, a readiness check and a fixed first step, built as repeatable assets that share one voice and one next step.',
    icp: {
      one: 'Private equity firms and their portfolio companies, founder-led growth companies and enterprise operators that need senior technology, AI and data execution, in any market except India and Nigeria.',
      segments: [
        { name: 'PE firms and portfolio companies', who: 'Sponsors whose value-creation plan needs technology, AI or data delivered, not described.', titles: 'Operating Partner, VP Portfolio Operations, portfolio CEO, CTO', trigger: 'A closed deal and a plan that needs execution; a stalled platform build; an AI mandate from the board.' },
        { name: 'Founder-led growth companies', who: 'Companies scaling past what the in-house team can ship, without a full-time senior technology leader.', titles: 'Founder, CEO, COO, CTO', trigger: 'Platform rebuild, AI roadmap, a need for fractional senior leadership that stays until the outcome is real.' },
        { name: 'Enterprise operators', who: 'Operators in Financial Services, Logistics and Supply Chain, Trade Finance, Healthcare, Manufacturing, Technology, Retail, Agriculture and Education.', titles: 'CIO, Chief Data Officer, Head of Transformation, COO', trigger: 'Data platform, AI and ML platform, API platform, digital twin or security programme with a named owner.' },
      ],
      firmographics: ['Engagements that fit Operating Partner (6–24 months), Strategic Build (3–12 months) or Venture Studio models', 'Budget band of $50K or more, with $100K+ the sweet spot seen on the project form', 'A named executive who owns the outcome and can start within six months', 'A clear technology, AI or data problem tied to a measurable business number'],
      disqualify: ['Staff augmentation and commodity development requests', 'Small-business retail or one-off website work', 'RFP, procurement and resale requests (for example hardware tenders)', 'Lead-list, SEO and agency pitches', 'Buyer or company headquartered in India or Nigeria'],
      qualify: ['Which sector, and who owns the outcome?', 'What number should the technology move: margin, pipeline, cycle time?', 'What budget band and start date?', 'Which engagement model fits: operating partner, strategic build or venture studio?'],
    },
    stages: [
      {
        tag: 'TOFU · Reach', title: 'Answer the question first', tone: 'dark',
        goal: 'Operators and sponsors searching for a technology operating partner, fractional CTO or AI execution find Day One and get a direct answer.',
        assets: [
          ['Answer pages.', '"What does a technology operating partner do?", "Operating partner or fractional CTO?", "What does an AI programme really cost?" Fifty-word answer first, detail after, marked up as FAQ.'],
          ['Case-study one-pagers.', 'One per published case: defect detection, NLP platforms, fintech, energy SaaS, e-commerce. Problem, build, measured result.'],
          ['Outcome cards.', 'The published representative outcomes (30% gross margin improvement, 2.5x pipeline, 40% shorter delivery cycle), each linked to the case it came from.'],
          ['Operator POV posts.', 'What breaks between a board’s AI mandate and a shipped platform, written by the people who ship it.'],
        ],
        channels: 'LinkedIn, search and AI answer engines (the site must be pre-rendered so crawlers can read it), Clutch reviews, PE operating-partner communities, partner referrals through the partnerships page.',
        measure: 'Non-brand impressions, visits to /operating-partner, case-study views per 100 visits, and how often AI assistants cite Day One in a weekly ten-prompt check. One metric to beat: visits to /operating-partner.',
      },
      {
        tag: 'MOFU · Capture', title: 'The Readiness Check', tone: 'dark',
        goal: 'Turn a reader into a named, ICP-fit contact. Today the exit is a long project form or a contact form.',
        assets: [
          ['Tech Readiness Check.', 'Ten questions across strategy, data, AI, platforms and delivery. Returns a score and the first two fixes as a one-page report by email.'],
          ['90-day roadmap sample.', 'The operating plan on one page: diagnostic in weeks 1–2, roadmap by day 30, execution from day 60, early wins by day 90.'],
          ['Engagement model guide.', 'Operating Partner, Strategic Build and Venture Studio side by side, with who each one fits.'],
          ['Four-email nurture.', 'One case, one framework, one outcome, one invitation to a fit call.'],
        ],
        channels: 'Start-a-project page with three choices: take the check, get the roadmap sample, book a call. Comment keyword ("CHECK") on LinkedIn posts. Capture company, role and country on every form.',
        measure: 'Checks completed per 100 visits, email capture rate, ICP-fit share of captures, calls booked. Baseline in week 4 before setting targets.',
      },
      {
        tag: 'BOFU · Convert', title: 'A fixed first step', tone: 'accent',
        goal: 'A diagnostic booked within two weeks of first contact, and an engagement inside the quarter.',
        assets: [
          ['Fit call.', 'Thirty minutes scripted around the ICP questions: sector, outcome owner, budget band, start date.'],
          ['Two-week diagnostic.', 'Fixed scope and price, ending in a transformation roadmap. It is weeks 1–2 of the published first-six-months plan.'],
          ['Proof stack.', 'Named cases, Clutch reviews, and the engagement models with scope and duration.'],
          ['One-page proposal.', 'Roadmap, team, economics and the zero-to-180-day plan.'],
        ],
        loop: 'At day 90, run an early-wins review, then propose a Strategic Build or a second function, and ask for two portfolio introductions.',
        measure: 'Lead to call, call to diagnostic, diagnostic to engagement, cycle length in days, and declared pipeline from the form’s budget bands. Baseline these in week 4 before setting targets.',
      },
    ],
    week: [['Mon', 'Answer page or case-study one-pager'], ['Tue', 'Fit-call day'], ['Wed', 'Readiness Check post with comment keyword'], ['Fri', 'Nurture email and a partner referral ask'], ['Sun', 'Review ICP fit of the week’s leads; run the AI citation check']],
  },
};
