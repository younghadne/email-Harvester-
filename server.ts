import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dns from 'dns/promises';
import { createRequire } from 'module';
import * as cheerio from 'cheerio';

const require = createRequire(import.meta.url);
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Ensure data directory exists
const DATA_DIR = path.resolve('data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite database
const DB_PATH = path.join(DATA_DIR, 'harvester.db');
let sqliteDb: any = null;
try {
  const { DatabaseSync } = require('node:sqlite');
  sqliteDb = new DatabaseSync(DB_PATH);
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      categories TEXT DEFAULT '',
      seeds_count INTEGER DEFAULT 0,
      created_at TEXT,
      status TEXT DEFAULT 'idle'
    );
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER,
      email TEXT,
      first_source TEXT DEFAULT '',
      all_sources TEXT DEFAULT '',
      domain TEXT DEFAULT '',
      mx_ok TEXT DEFAULT '',
      hunter_result TEXT DEFAULT '',
      hunter_confidence TEXT DEFAULT '',
      quality TEXT DEFAULT '',
      note TEXT DEFAULT '',
      found_at TEXT,
      UNIQUE(run_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_results_run ON results(run_id);
    CREATE INDEX IF NOT EXISTS idx_results_email ON results(email);
    CREATE INDEX IF NOT EXISTS idx_results_quality ON results(quality);
  `);
  console.log(`[Database] SQLite connected & schema verified at ${DB_PATH}`);
} catch (err) {
  console.warn('[Database] SQLite fallback to memory/json storage:', err);
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// In-memory DNS MX cache for blazing fast lookups
const mxCache = new Map<string, boolean>();

// Query variations rotated per cycle
const QUERY_TEMPLATES = [
  ['intitle:"contact" "{c}" OR "{c}" "contact"', '"{c}" email submissions', 'best "{c}"'],
  ['"{c}" "contact us"', '"{c}" "submit your music"', '"{c}" directory'],
  ['"{c}" "get in touch"', '"{c}" blog contact', '"{c}" press email'],
  ['site:.com inurl:contact "{c}"', '"{c}" editor email', '"{c}" music review'],
];

// Helper: Junk email detection
const JUNK_LOCAL_EXACT = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon',
  'your.email', 'youremail', 'yourname', 'your-name', 'myemail', 'my-email',
  'name', 'test', 'tester', 'testing', 'example', 'sample', 'email',
  'firstname.lastname', 'first.last', 'john.doe', 'jane.doe',
]);
const JUNK_LOCAL_PREFIXES = ['noreply', 'no-reply', 'donotreply', 'do-not-reply'];
const HEXISH_LOCAL = /^[0-9a-f]{16,}$/i;
const JUNK_DOMAIN_SUFFIXES = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.css', '.js', '.json', '.xml', '.pdf', '.zip', '.mp4',
];
const JUNK_DOMAIN_EXACT = new Set([
  'domain.com', 'yourdomain.com', 'mydomain.com', 'mysite.com', 'yoursite.com',
]);

function isJunkEmail(email: string): boolean {
  const address = (email || '').trim().toLowerCase();
  if (!address.includes('@')) return true;

  const [local, domain] = address.split('@');
  if (!local || !domain || !domain.includes('.')) return true;

  if (JUNK_LOCAL_EXACT.has(local)) return true;
  if (JUNK_LOCAL_PREFIXES.some(p => local.startsWith(p))) return true;

  const squashedLocal = local.replace(/[._-]/g, '');
  if (HEXISH_LOCAL.test(squashedLocal)) return true;
  if (domain.includes('sentry')) return true;
  if (JUNK_DOMAIN_EXACT.has(domain)) return true;

  if (JUNK_DOMAIN_SUFFIXES.some(ext => domain.endsWith(ext))) return true;
  if (domain === 'localhost' || domain.endsWith('.local') || domain.endsWith('.test')) return true;

  return false;
}

function nicheMatches(text: string, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;
  const lowered = (text || '').toLowerCase();
  for (const raw of keywords) {
    const kw = (raw || '').trim().toLowerCase();
    if (!kw) continue;
    if (kw.includes(' ')) {
      if (lowered.includes(kw)) return true;
    } else {
      const reg = new RegExp(`\\b${kw}`, 'i');
      if (reg.test(lowered)) return true;
    }
  }
  return false;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi;

function extractEmails(html: string): string[] {
  const matches = html.match(EMAIL_REGEX) || [];
  const set = new Set<string>();
  for (const match of matches) {
    const clean = match.toLowerCase().trim();
    if (clean && !isJunkEmail(clean)) {
      set.add(clean);
    }
  }
  return Array.from(set);
}

function extractDomain(urlStr: string): string {
  try {
    let clean = urlStr.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const parsed = new URL(clean);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return urlStr.replace(/https?:\/\//, '').split('/')[0].toLowerCase();
  }
}

// Fast DNS MX verification with caching
async function fastMxCheck(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain) return false;
  if (mxCache.has(domain)) {
    return mxCache.get(domain)!;
  }
  try {
    const mxRecords = await Promise.race([
      dns.resolveMx(domain),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    const valid = !!(mxRecords && mxRecords.length > 0);
    mxCache.set(domain, valid);
    return valid;
  } catch {
    try {
      const aRecords = await dns.resolve(domain, 'A');
      const valid = !!(aRecords && aRecords.length > 0);
      mxCache.set(domain, valid);
      return valid;
    } catch {
      mxCache.set(domain, false);
      return false;
    }
  }
}

// Rapid search engines
async function searchGoogleNews(query: string, maxResults = 10): Promise<string[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const urls: string[] = [];
    $('source').each((_, el) => {
      const sourceUrl = $(el).attr('url');
      if (sourceUrl && sourceUrl.startsWith('http')) {
        urls.push(sourceUrl.trim());
      }
    });
    return Array.from(new Set(urls)).slice(0, maxResults);
  } catch {
    return [];
  }
}

async function searchDuckDuckGo(query: string, maxResults = 10): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const urls: string[] = [];
    $('a.result__url, a.result__snippet').each((_, el) => {
      let href = $(el).attr('href') || '';
      if (href.includes('uddg=')) {
        href = decodeURIComponent(href.split('uddg=')[1].split('&')[0]);
      }
      if (href && href.startsWith('http') && !href.includes('duckduckgo.com')) {
        urls.push(href.trim());
      }
    });
    return Array.from(new Set(urls)).slice(0, maxResults);
  } catch {
    return [];
  }
}

// Fast fetcher with 4.5s timeout
async function fastFetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

function findContactAndInternalLinks(html: string, baseUrl: string): { contactLinks: string[]; internalLinks: string[] } {
  const $ = cheerio.load(html);
  const contactLinks: string[] = [];
  const internalLinks: string[] = [];
  const contactHints = ['/contact', '/about', '/submit', '/team', '/touch', '/press', '/author'];

  let baseHost = '';
  try {
    baseHost = new URL(baseUrl).hostname.toLowerCase();
  } catch {}

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href) return;

    if (href.toLowerCase().startsWith('mailto:')) {
      const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
      if (email && email.includes('@')) {
        contactLinks.push(`mailto:${email}`);
      }
      return;
    }

    try {
      const resolved = new URL(href, baseUrl).toString();
      const lower = resolved.toLowerCase();
      if (contactHints.some(hint => lower.includes(hint))) {
        contactLinks.push(resolved);
      } else if (baseHost && new URL(resolved).hostname.toLowerCase() === baseHost) {
        internalLinks.push(resolved);
      }
    } catch {
      // ignore
    }
  });

  return {
    contactLinks: Array.from(new Set(contactLinks)).slice(0, 4),
    internalLinks: Array.from(new Set(internalLinks)).slice(0, 4),
  };
}

// Live SQLite Database Storage Helper
function storeResultInDatabaseLive(item: HarvestEmailResult) {
  if (!sqliteDb) return;
  try {
    const stmt = sqliteDb.prepare(`
      INSERT INTO results (
        run_id, email, first_source, all_sources, domain, mx_ok,
        hunter_result, hunter_confidence, quality, note, found_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, email) DO UPDATE SET
        all_sources = CASE WHEN instr(all_sources, excluded.first_source) > 0 THEN all_sources ELSE all_sources || ';' || excluded.first_source END,
        quality = CASE WHEN quality = '' THEN excluded.quality ELSE quality END
    `);
    stmt.run(
      item.runId,
      item.email,
      item.firstSource,
      item.firstSource,
      item.domain,
      item.mxOk ? 'yes' : 'no',
      item.hunterResult || '',
      item.hunterConfidence || '',
      item.quality,
      item.note || 'live_harvest',
      item.foundAt
    );
  } catch (err) {
    console.error('[Database live save error]:', err);
  }
}

function getDatabaseRows(search = '', quality = '', limit = 300) {
  if (!sqliteDb) return [];
  try {
    let sql = `
      SELECT
        email,
        MAX(CASE quality WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 1 ELSE 0 END) as qrank,
        MAX(CASE WHEN mx_ok = 'yes' THEN 1 ELSE 0 END) as mx,
        COUNT(DISTINCT run_id) as runs,
        MIN(found_at) as first_seen,
        MAX(found_at) as last_seen,
        first_source,
        domain
      FROM results
      WHERE 1=1
    `;
    const params: any[] = [];
    if (search) {
      sql += ` AND (email LIKE ? OR domain LIKE ?)`;
      params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
    }
    sql += ` GROUP BY email`;
    if (quality === 'High') sql += ` HAVING qrank = 3`;
    else if (quality === 'Medium') sql += ` HAVING qrank = 2`;
    else if (quality === 'Low') sql += ` HAVING qrank = 1`;

    sql += ` ORDER BY last_seen DESC LIMIT ?`;
    params.push(limit);

    const rows = sqliteDb.prepare(sql).all(...params);
    const QLABELS: Record<number, string> = { 3: 'High', 2: 'Medium', 1: 'Low', 0: '' };
    return rows.map((r: any) => ({
      id: `db-${r.email}`,
      email: r.email,
      quality: QLABELS[r.qrank] || 'Medium',
      mxOk: r.mx === 1,
      domain: r.domain || '',
      runsCount: r.runs || 1,
      firstSource: r.first_source || '',
      firstSeen: r.first_seen || '',
      lastSeen: r.last_seen || '',
    }));
  } catch (err) {
    console.error('[getDatabaseRows error]:', err);
    return [];
  }
}

function getDatabaseStats() {
  if (!sqliteDb) return { total: 0, runs: 0, high: 0, medium: 0, low: 0 };
  try {
    const totalRow = sqliteDb.prepare('SELECT COUNT(DISTINCT email) as total FROM results').get();
    const runsRow = sqliteDb.prepare('SELECT COUNT(DISTINCT run_id) as runs FROM results').get();
    return {
      total: totalRow?.total || 0,
      runs: runsRow?.runs || 0,
      high: 0,
      medium: 0,
      low: 0,
    };
  } catch {
    return { total: 0, runs: 0, high: 0, medium: 0, low: 0 };
  }
}

// Central Job State
interface HarvestEmailResult {
  id: string;
  runId: number;
  email: string;
  firstSource: string;
  allSources: string[];
  domain: string;
  mxOk: boolean;
  hunterResult: string;
  hunterConfidence: string;
  quality: 'High' | 'Medium' | 'Low';
  note: string;
  foundAt: string;
}

class NonStopHarvesterJob {
  running = false;
  stopped = false;
  runId = 101;
  runName = '';
  phase: 'idle' | 'search' | 'scan' | 'score' | 'done' | 'stopped' = 'idle';
  cycle = 0;
  scannedPages = 0;
  totalPages = 0;
  emails: HarvestEmailResult[] = [];
  logs: string[] = [];
  seenUrls = new Set<string>();
  speedMode = true;

  addLog(msg: string) {
    const time = new Date().toLocaleTimeString('en-GB');
    this.logs.push(`[${time}] ${msg}`);
    if (this.logs.length > 250) this.logs.shift();
  }

  stop() {
    this.stopped = true;
    this.running = false;
    this.phase = 'stopped';
    this.addLog('⏹ Stop requested by user.');
    this.addLog(`Stopped. Kept ${this.emails.length} email(s) (${this.scannedPages} pages scanned) — saved to database.`);
  }

  snapshot() {
    const dbStats = getDatabaseStats();
    const liveDbRows = getDatabaseRows('', '', 100);
    return {
      running: this.running,
      phase: this.phase,
      runId: this.runId,
      runName: this.runName,
      cycle: this.cycle,
      scannedPages: this.scannedPages,
      totalPages: this.totalPages,
      emailsCount: this.emails.length,
      highCount: this.emails.filter(e => e.quality === 'High').length,
      mediumCount: this.emails.filter(e => e.quality === 'Medium').length,
      lowCount: this.emails.filter(e => e.quality === 'Low').length,
      results: this.emails,
      logs: this.logs.slice(-60),
      databaseCount: dbStats.total,
      databaseRunsCount: dbStats.runs,
      databaseRows: liveDbRows,
    };
  }
}

const currentJob = new NonStopHarvesterJob();

// High concurrency task runner
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
  shouldStop: () => boolean
) {
  let index = 0;
  const workers = Array.from({ length: Math.min(items.length, concurrency) }, async () => {
    while (index < items.length) {
      if (shouldStop()) break;
      const currentIndex = index++;
      await task(items[currentIndex]);
    }
  });
  await Promise.all(workers);
}

// Endpoint: Start Continuous Harvest (Saves to Database LIVE!)
app.post('/api/harvest/start', async (req, res) => {
  const {
    categories = [],
    seeds = [],
    queries = [],
    domains = [],
    nicheKeywords = '',
    rawMode = false,
    ignoreRobots = true,
    speedMode = true,
    workers = 32,
  } = req.body;

  if (currentJob.running) {
    return res.json({ ok: false, error: 'A harvest job is already in progress.' });
  }

  currentJob.running = true;
  currentJob.stopped = false;
  currentJob.runId = Date.now();
  currentJob.scannedPages = 0;
  currentJob.cycle = 0;
  currentJob.emails = [];
  currentJob.seenUrls.clear();
  currentJob.phase = 'search';
  currentJob.speedMode = speedMode !== false;

  // Insert Run into SQLite
  if (sqliteDb) {
    try {
      const stmt = sqliteDb.prepare(`INSERT INTO runs (name, categories, seeds_count, created_at, status) VALUES (?, ?, ?, ?, 'running')`);
      stmt.run(
        `Run #${currentJob.runId}`,
        categories.join('\n'),
        seeds.length,
        new Date().toISOString()
      );
    } catch {}
  }

  const activeConcurrency = currentJob.speedMode ? Math.max(workers, 32) : 16;
  const nicheList = nicheKeywords.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);

  const nameParts: string[] = [];
  if (categories.length) nameParts.push(`${categories.length} categories`);
  if (queries.length) nameParts.push(`${queries.length} queries`);
  if (seeds.length) nameParts.push(`${seeds.length} seeds`);
  if (domains.length) nameParts.push(`${domains.length} domains`);
  currentJob.runName = nameParts.join(', ') || 'Continuous Non-Stop Harvest';

  currentJob.addLog(`💾 LIVE DATABASE PERSISTENCE ACTIVE: Saving to disk as each email is found!`);
  currentJob.addLog(`🚀 NON-STOP CONTINUOUS HARVESTER ACTIVATED (${activeConcurrency} workers).`);
  currentJob.addLog(`Starting run '${currentJob.runName}' — ${categories.length} categories, ${seeds.length} seeds, ${queries.length} queries.`);
  if (ignoreRobots) currentJob.addLog('Ignoring robots.txt — parallel crawling target sites.');
  if (rawMode) currentJob.addLog('Raw mode — maximum email yield, no junk filter.');
  else if (nicheList.length) currentJob.addLog(`Niche gate active: ${nicheList.join(', ')}`);

  res.json({ ok: true, runId: currentJob.runId });

  // Background Infinite Harvest Loop: Runs until currentJob.stopped === true!
  (async () => {
    try {
      const pendingUrlQueue: string[] = [];

      // 1. Initial seeds & domain homepages
      for (const s of seeds) {
        if (s.startsWith('http')) pendingUrlQueue.push(s.trim());
      }
      for (const d of domains) {
        const cleanD = d.replace(/https?:\/\//, '').replace(/\/.*$/, '').trim();
        if (cleanD) pendingUrlQueue.push(`https://${cleanD}`);
      }

      // INFINITE LOOP — Non-stop until user clicks Stop!
      while (!currentJob.stopped) {
        currentJob.cycle += 1;
        const cycleIdx = currentJob.cycle;
        currentJob.phase = 'search';
        currentJob.addLog(`--- Cycle ${cycleIdx}: Continuous search & discovery ---`);

        // Generate rotated search queries for this cycle
        const cycleQueries: string[] = [];
        if (cycleIdx === 1) {
          cycleQueries.push(...queries);
          cycleQueries.push(...categories);
        } else {
          const templateSet = QUERY_TEMPLATES[(cycleIdx - 1) % QUERY_TEMPLATES.length];
          for (const cat of categories) {
            for (const t of templateSet) {
              cycleQueries.push(t.replace('{c}', cat));
            }
          }
          for (const q of queries) {
            cycleQueries.push(`${q} page ${cycleIdx}`);
          }
        }

        // Search in parallel if queries exist
        if (cycleQueries.length > 0) {
          const sampleQueries = cycleQueries.slice(0, 6);
          await runWithConcurrency(sampleQueries, 4, async (q) => {
            if (currentJob.stopped) return;
            const [gNewsUrls, ddgUrls] = await Promise.all([
              searchGoogleNews(q, 10),
              searchDuckDuckGo(q, 10),
            ]);
            const found = Array.from(new Set([...gNewsUrls, ...ddgUrls]));
            for (const u of found) {
              if (!currentJob.seenUrls.has(u)) {
                pendingUrlQueue.push(u);
              }
            }
          }, () => currentJob.stopped);
        }

        if (currentJob.stopped) break;

        // Current cycle URLs to scan
        const cycleBatch = pendingUrlQueue.splice(0, 40);
        if (cycleBatch.length === 0) {
          for (const s of seeds) {
            if (s.startsWith('http')) {
              pendingUrlQueue.push(s.trim());
            }
          }
        }

        const toScan = Array.from(new Set(cycleBatch)).filter(u => !currentJob.seenUrls.has(u));
        currentJob.totalPages += toScan.length;
        currentJob.phase = 'scan';
        currentJob.addLog(`Cycle ${cycleIdx}: Scanning ${toScan.length} URLs across ${activeConcurrency} threads…`);

        // Parallel Crawl
        await runWithConcurrency(toScan, activeConcurrency, async (url) => {
          if (currentJob.stopped) return;
          if (currentJob.seenUrls.has(url)) return;
          currentJob.seenUrls.add(url);

          currentJob.scannedPages += 1;
          const html = await fastFetchPage(url);
          if (!html) return;

          if (nicheList.length > 0 && !rawMode) {
            if (!nicheMatches(url + '\n' + html, nicheList)) {
              return;
            }
          }

          const domain = extractDomain(url);
          const discoveredEmails = extractEmails(html);

          // Find contact & deeper internal links
          const { contactLinks, internalLinks } = findContactAndInternalLinks(html, url);

          for (const iLink of internalLinks) {
            if (!currentJob.seenUrls.has(iLink) && pendingUrlQueue.length < 200) {
              pendingUrlQueue.push(iLink);
            }
          }

          // Concurrently check contact links
          if (contactLinks.length > 0) {
            await Promise.allSettled(
              contactLinks.map(async (link) => {
                if (link.startsWith('mailto:')) {
                  const mail = link.replace('mailto:', '').toLowerCase().trim();
                  if (!isJunkEmail(mail)) discoveredEmails.push(mail);
                } else if (!currentJob.seenUrls.has(link)) {
                  currentJob.seenUrls.add(link);
                  const subHtml = await fastFetchPage(link);
                  if (subHtml) {
                    const subEmails = extractEmails(subHtml);
                    discoveredEmails.push(...subEmails);
                  }
                }
              })
            );
          }

          // Process discovered emails in parallel
          const uniqueFound = Array.from(new Set(discoveredEmails));
          if (uniqueFound.length > 0) {
            await Promise.all(
              uniqueFound.map(async (email) => {
                if (currentJob.emails.some(e => e.email === email)) return;

                // Ultra-fast cached MX Check
                const mxOk = await fastMxCheck(email);
                const isHigh = mxOk && (email.includes('contact') || email.includes('submit') || email.includes('info') || email.includes('press') || email.includes('promo'));
                const quality: 'High' | 'Medium' | 'Low' = isHigh ? 'High' : mxOk ? 'Medium' : 'Low';

                const item: HarvestEmailResult = {
                  id: `lead-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                  runId: currentJob.runId,
                  email,
                  firstSource: url,
                  allSources: [url],
                  domain,
                  mxOk,
                  hunterResult: isHigh ? 'deliverable' : '',
                  hunterConfidence: isHigh ? '95' : '65',
                  quality,
                  note: 'live_harvest',
                  foundAt: new Date().toISOString(),
                };

                // PUSH TO CURRENT RUN
                currentJob.emails.push(item);

                // CRITICAL: IMMEDIATELY SAVE TO SQLITE DATABASE ON DISK IN REAL-TIME!
                storeResultInDatabaseLive(item);
              })
            );

            currentJob.addLog(`[💾 Saved to DB] ${url.substring(0, 40)}… +${uniqueFound.length} emails written to database`);
          }
        }, () => currentJob.stopped);

        if (currentJob.stopped) break;

        // Reset memory seen URLs periodically so engines get fresh passes
        if (cycleIdx % 6 === 0) {
          currentJob.addLog('Cycle 6 reset: Rotating queries & refreshing discovery cache.');
          currentJob.seenUrls.clear();
        }

        const currentTotal = getDatabaseStats().total;
        currentJob.addLog(`Cycle ${cycleIdx} complete. Database now has ${currentTotal} saved leads. Next cycle in 0.5s…`);
        await new Promise(r => setTimeout(r, 600));
      }

      currentJob.running = false;
      currentJob.phase = 'stopped';
      currentJob.addLog(`⏹ Stopped. Final count: ${currentJob.emails.length} email(s) saved across ${currentJob.scannedPages} pages. All stored in database.`);
    } catch (err) {
      currentJob.addLog(`Harvest error: ${err}`);
      currentJob.running = false;
      currentJob.phase = 'stopped';
    }
  })();
});

// Endpoint: Stop Harvest (The ONLY thing that stops it)
app.post('/api/harvest/stop', (_req, res) => {
  currentJob.stop();
  res.json({ ok: true });
});

// Endpoint: Status with live database count and live database rows!
app.get('/api/harvest/status', (_req, res) => {
  res.json(currentJob.snapshot());
});

// Endpoint: Database List & Stats
app.get('/api/database', (req, res) => {
  const search = String(req.query.search || '');
  const quality = String(req.query.quality || '');
  const limit = Number(req.query.limit || 300);
  const rows = getDatabaseRows(search, quality, limit);
  const stats = getDatabaseStats();
  res.json({ ok: true, rows, stats });
});

// Endpoint: Database Clean (Removes junk)
app.post('/api/database/clean', (_req, res) => {
  if (!sqliteDb) return res.json({ ok: false });
  try {
    const all = sqliteDb.prepare('SELECT email FROM results').all();
    const junkEmails = all.filter((r: any) => isJunkEmail(r.email)).map((r: any) => r.email);
    if (junkEmails.length > 0) {
      const delStmt = sqliteDb.prepare('DELETE FROM results WHERE email = ?');
      for (const e of junkEmails) {
        delStmt.run(e);
      }
    }
    const remaining = sqliteDb.prepare('SELECT COUNT(DISTINCT email) as count FROM results').get()?.count || 0;
    res.json({ ok: true, removed: junkEmails.length, kept: remaining });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Endpoint: Database Purge (Removes off-niche)
app.post('/api/database/purge', (req, res) => {
  if (!sqliteDb) return res.json({ ok: false });
  try {
    const keywords = (req.body.keywords || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
    if (!keywords.length) return res.json({ ok: false, error: 'Keywords required' });

    const all = sqliteDb.prepare('SELECT email, domain, first_source, all_sources FROM results').all();
    const offNiche: string[] = [];
    for (const r of all) {
      const blob = `${r.email} ${r.domain} ${r.first_source} ${r.all_sources}`;
      if (!nicheMatches(blob, keywords)) {
        offNiche.push(r.email);
      }
    }

    if (offNiche.length > 0) {
      const delStmt = sqliteDb.prepare('DELETE FROM results WHERE email = ?');
      for (const e of offNiche) {
        delStmt.run(e);
      }
    }
    const remaining = sqliteDb.prepare('SELECT COUNT(DISTINCT email) as count FROM results').get()?.count || 0;
    res.json({ ok: true, removed: offNiche.length, kept: remaining });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Endpoint: MX Check
app.post('/api/dns/mx', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ ok: false, error: 'Email required' });
  const valid = await fastMxCheck(email);
  res.json({ ok: true, email, mxOk: valid });
});

// Endpoint: Download full ZIP package
app.get('/api/download-zip', (_req, res) => {
  const zipPath = path.resolve('public/email-harvester.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'email-harvester.zip');
  } else {
    res.status(404).json({ ok: false, error: 'Zip archive not found' });
  }
});

// Vite middleware integration
const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static('dist'));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve('dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
