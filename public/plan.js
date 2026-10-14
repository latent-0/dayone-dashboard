// 90-day plan checklists (same plan as the one-pager PDFs). Ticks are saved per site via /api/growth.
export const PLAN = {
  ventures: [
    { phase: 'Days 1–30 · Foundation', items: [
      ['landing-page', 'Operating-partner landing page live with org, role and country fields'],
      ['value-map', 'Value Map sample published (redacted one-page diagnostic)'],
      ['scorecard', 'Portfolio scorecard live (10 questions, returns a leak score)'],
      ['site-basics', 'robots.txt, sitemap.xml and llms.txt published'],
      ['form-protection', 'Spam protection and a Country field added to the forms'],
      ['mail-warmup', 'Sending domains set up (SPF, DKIM, DMARC) and warming for 3–4 weeks'],
      ['account-list', 'Hand-built list of ~150 accounts (about 90 US, 60 Europe)'],
      ['profiles', 'Three partner LinkedIn profiles rewritten'],
      ['posting-started', 'LinkedIn posting 3 times a week has started'],
    ] },
    { phase: 'Days 31–60 · Launch', items: [
      ['outbound-live', 'Outbound live at ~20 accounts a week'],
      ['newsletter-1', 'Newsletter issue 1 sent'],
      ['podcast-pitch', 'First podcast pitch sent'],
      ['baseline-readout', 'Day-35 baseline read-out done and targets set'],
      ['first-briefing', 'First sponsor briefing held'],
    ] },
    { phase: 'Days 61–90 · Scale', items: [
      ['double-down', 'Doubled down on the best channel and region'],
      ['first-diagnostic', 'First scoped diagnostic started'],
      ['reference', 'Reference or before-and-after published (with consent)'],
      ['icp-tightened', 'ICP tightened using the lead data'],
    ] },
  ],
  tech: [
    { phase: 'Days 1–30 · Foundation', items: [
      ['prerender', 'Site pre-rendered so AI crawlers can read it'],
      ['canonical-titles', 'Canonical tags and unique page titles added'],
      ['readiness-check', 'Tech Readiness Check live (10 questions, one-page report)'],
      ['answer-pages', 'Three answer pages published with FAQ markup'],
      ['case-one-pagers', 'Case-study one-pagers published'],
      ['form-protection', 'Spam protection and a Country field added to the forms'],
      ['fit-call-script', 'Fit-call script written around the ICP questions'],
    ] },
    { phase: 'Days 31–60 · Launch', items: [
      ['outbound-live', 'Outbound live to named PE and operator accounts'],
      ['nurture', 'Four-email nurture live for Readiness Check captures'],
      ['baseline-readout', 'Day-35 baseline read-out done and targets set'],
      ['first-fit-call', 'First fit calls held'],
    ] },
    { phase: 'Days 61–90 · Scale', items: [
      ['first-diagnostic', 'First two-week diagnostic sold'],
      ['partner-referrals', 'Partner referral motion started (partnerships page)'],
      ['icp-tightened', 'ICP tightened using the lead data'],
    ] },
  ],
};
