// Everything site-specific lives here. Add a tab = add one line.
// Sheet IDs come from env vars (SHEET_ID_TECH, SHEET_ID_VENTURES): the sheets are link-shared, so the IDs are secrets.
export const SITES = {
  tech: {
    key: 'tech',
    name: 'Day One Technologies',
    short: 'Day1Tech',
    domain: 'day1tech.com',
    url: 'https://day1tech.com/',
    sheetId: process.env.SHEET_ID_TECH || '',
    tabs: [
      { gid: '1761688476', name: 'Project Enquiries', kind: 'project' },
      { gid: '83748736', name: 'Contact', kind: 'contact' },
      { gid: '0', name: 'Sheet1', kind: 'contact' },
    ],
  },
  ventures: {
    key: 'ventures',
    name: 'Dayone Venture Partners',
    short: 'Dayone Ventures',
    domain: 'dayoneventurepartners.com',
    url: 'https://dayoneventurepartners.com/',
    sheetId: process.env.SHEET_ID_VENTURES || '',
    tabs: [
      { gid: '2141515466', name: 'Project enquiries', kind: 'project' },
      { gid: '669402875', name: 'Leads', kind: 'contact' },
      { gid: '825016271', name: 'Applications', kind: 'application' },
      { gid: '0', name: 'Sheet1', kind: 'contact' },
    ],
  },
};

export const LEADS_TTL_MS = 30_000;          // sheet cache; the UI also polls every 60s
export const AUDIT_TTL_MS = 15 * 60_000;     // site audit cache
export const AUDIT_EVERY_MS = 6 * 3600_000;  // background audit for the trend history
export const PSI_API_KEY = process.env.PSI_API_KEY || '';
