const JUNK_LOCAL_EXACT = new Set([
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'mailer-daemon',
  'your.email',
  'youremail',
  'yourname',
  'your-name',
  'myemail',
  'my-email',
  'myname',
  'name',
  'test',
  'tester',
  'testing',
  'example',
  'sample',
  'email',
  'emailaddress',
  'firstname.lastname',
  'first.last',
  'john.doe',
  'jane.doe',
  'your',
  'you',
]);

const JUNK_LOCAL_PREFIXES = ['noreply', 'no-reply', 'donotreply', 'do-not-reply'];
const HEXISH_LOCAL = /^[0-9a-f]{16,}$/i;
const JUNK_DOMAIN_SUFFIXES = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.css', '.js', '.json', '.xml', '.pdf', '.zip', '.mp4',
];
const JUNK_DOMAIN_EXACT = new Set([
  'domain.com',
  'yourdomain.com',
  'mydomain.com',
  'mysite.com',
  'yoursite.com',
]);

export function isJunkEmail(email: string): boolean {
  const address = (email || '').trim().toLowerCase();
  if (!address.includes('@')) return true;

  const [local, domain] = address.split('@');
  if (!local || !domain || !domain.includes('.')) return true;

  if (JUNK_LOCAL_EXACT.has(local)) return true;
  if (JUNK_LOCAL_PREFIXES.some(prefix => local.startsWith(prefix))) return true;

  const squashedLocal = local.replace(/[._-]/g, '');
  if (HEXISH_LOCAL.test(squashedLocal)) return true;
  if (domain.includes('sentry')) return true;
  if (JUNK_DOMAIN_EXACT.has(domain)) return true;

  const squashedDomain = domain.replace(/[._-]/g, '');
  if (squashedLocal && squashedLocal === squashedDomain) return true;

  if (JUNK_DOMAIN_SUFFIXES.some(ext => domain.endsWith(ext))) return true;
  if (domain === 'localhost' || domain.endsWith('.local') || domain.endsWith('.invalid') || domain.endsWith('.test')) return true;

  return false;
}

export function nicheMatches(text: string, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;
  const lowered = (text || '').toLowerCase();
  for (const raw of keywords) {
    const kw = (raw || '').trim().toLowerCase();
    if (!kw) continue;
    if (kw.includes(' ')) {
      if (lowered.includes(kw)) return true;
    } else {
      const regex = new RegExp(`\\b${kw}`, 'i');
      if (regex.test(lowered)) return true;
    }
  }
  return false;
}

export function extractDomain(url: string): string {
  try {
    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const parsed = new URL(clean);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return url.replace(/https?:\/\//, '').split('/')[0].toLowerCase();
  }
}
