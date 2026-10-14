export type EmailQuality = 'High' | 'Medium' | 'Low';

export interface HarvestEmail {
  id: string;
  runId: number;
  email: string;
  firstSource: string;
  allSources: string[];
  domain: string;
  mxOk: boolean;
  hunterResult: string;
  hunterConfidence: string;
  quality: EmailQuality;
  note: string;
  foundAt: string;
  runsCount?: number;
}

export interface HarvestRun {
  id: number;
  name: string;
  categories: string[];
  seedsCount: number;
  queriesCount: number;
  createdAt: string;
  status: 'idle' | 'running' | 'done' | 'stopped';
  emailsCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  scannedPages: number;
  totalPages: number;
  cycle: number;
  inputs?: {
    categories?: string[];
    seeds?: string[];
    customQueries?: string[];
    domains?: string[];
  };
}

export interface HarvestSettings {
  workers: number;
  maxResultsPerQuery: number;
  maxExtraPages: number;
  minDelay: number;
  maxDelay: number;
  nicheKeywords: string;
  rawMode: boolean;
  ignoreRobots: boolean;
  speedMode: boolean;
  useGoogle: boolean;
  googleHeaded: boolean;
  useHunterDomainSearch: boolean;
  hunterVerify: boolean;
  maxHunterVerifications: number;
  serpapiKey: string;
  serperKey: string;
  braveKey: string;
  bingKey: string;
  hunterKey: string;
}

export type SourceTab = 'categories' | 'seeds' | 'queries' | 'domains';
export type SourceMode = 'categories' | 'seeds' | 'both';
