/**
 * Synthetic demo data for the stub: fake repositories and initiatives at different points of
 * their lifecycle. Ids are fixed so links stored in Jira keep working after a restart.
 * Nothing here comes from a real customer.
 */
import { advance, LIFECYCLE, start, type JournalDraft, type LifecyclePosition } from './lifecycle.ts';
import type { Datasource, Initiative, JournalEntry } from './types.ts';

export const SEED_USERNAME = 'demo.user';

export const SEED_DATASOURCES: Datasource[] = [
  { datasourceId: 'resource:5f1c2a4e-0d3b-4c7e-9a21-6b8f0e3d1a01', name: 'sample-org/payments-api', defaultBranch: 'main' },
  { datasourceId: 'resource:5f1c2a4e-0d3b-4c7e-9a21-6b8f0e3d1a02', name: 'sample-org/web-portal', defaultBranch: 'main' },
  { datasourceId: 'resource:5f1c2a4e-0d3b-4c7e-9a21-6b8f0e3d1a03', name: 'sample-org/mobile-app', defaultBranch: 'main' },
  { datasourceId: 'resource:5f1c2a4e-0d3b-4c7e-9a21-6b8f0e3d1a04', name: 'sample-org/design-system', defaultBranch: 'main' },
];
const [PAYMENTS, PORTAL, MOBILE, DESIGN] = SEED_DATASOURCES.map((d) => d.datasourceId);

interface SeedInitiative {
  initiativeId: string;
  title: string;
  initiativeGoal: string;
  targets: string[];
  context: string[];
  /** Row of LIFECYCLE the initiative has reached. */
  row: number;
  createdAt: string;
  archived?: boolean;
}

const SEEDS: SeedInitiative[] = [
  {
    initiativeId: '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e01',
    title: 'Migrate payments API to Node 24',
    initiativeGoal:
      'Upgrade the payments API runtime to Node 24.\n\n- Replace deprecated crypto calls\n- Keep the public API unchanged',
    targets: [PAYMENTS],
    context: [],
    row: 1,
    createdAt: '2026-11-18T14:00:00.000Z',
  },
  {
    initiativeId: '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e02',
    title: 'Add audit logging to the web portal',
    initiativeGoal:
      'Record who changed account settings and when.\n\n- Structured audit events\n- 90-day retention',
    targets: [PORTAL],
    context: [PAYMENTS],
    row: 6,
    createdAt: '2026-11-10T09:30:00.000Z',
  },
  {
    initiativeId: '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e03',
    title: 'Replace legacy date library',
    initiativeGoal: 'Move every date calculation to the built-in Temporal API and remove the legacy library.',
    targets: [PORTAL, MOBILE],
    context: [],
    row: 7,
    createdAt: '2026-11-03T16:15:00.000Z',
  },
  {
    initiativeId: '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e04',
    title: 'Adopt new design tokens in mobile app',
    initiativeGoal: 'Use the design-system tokens for colour and spacing in every mobile screen.',
    targets: [MOBILE],
    context: [DESIGN],
    row: 8,
    createdAt: '2026-10-27T11:00:00.000Z',
  },
  {
    initiativeId: '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e05',
    title: 'Remove unused feature flags',
    initiativeGoal: 'Delete feature flags that have been fully rolled out for more than 30 days.',
    targets: [PORTAL],
    context: [],
    row: 9,
    createdAt: '2026-10-15T08:45:00.000Z',
  },
  {
    initiativeId: '3c9a7e10-5b2d-4f8a-8e61-0a1b2c3d4e06',
    title: 'Split the monolith billing module',
    initiativeGoal: 'Superseded by the payments API migration.',
    targets: [PAYMENTS],
    context: [],
    row: 2,
    createdAt: '2026-09-30T10:00:00.000Z',
    archived: true,
  },
];

const HOUR = 60 * 60 * 1000;

/** Replays the lifecycle up to `row`, so each seed initiative has a believable journal. */
const replay = (row: number): { position: LifecyclePosition; drafts: JournalDraft[] } => {
  let { position, entries } = start();
  const drafts = [...entries];
  for (let i = 0; i < row; i++) {
    ({ position, entries } = advance(position));
    drafts.push(...entries);
  }
  return { position, drafts };
};

export interface SeedData {
  datasources: Datasource[];
  initiatives: Initiative[];
  journal: JournalEntry[];
}

/** Builds a fresh copy of the seed data. */
export const buildSeed = (): SeedData => {
  const initiatives: Initiative[] = [];
  const journal: JournalEntry[] = [];

  for (const seed of SEEDS) {
    if (seed.row < 0 || seed.row >= LIFECYCLE.length) throw new Error(`Bad seed row for ${seed.title}`);
    const { position, drafts } = replay(seed.row);
    initiatives.push({
      initiativeId: seed.initiativeId,
      title: seed.title,
      initiativeGoal: seed.initiativeGoal,
      targetDatasourceIds: seed.targets,
      contextDatasourceIds: seed.context,
      standardIds: [],
      datasourceBranches: {},
      ...position,
      createdAt: seed.createdAt,
      archiveStatus: seed.archived ? { state: 'archived', reason: 'Superseded' } : { state: 'active' },
      createdByUsername: SEED_USERNAME,
      planFormat: 'unified',
    });

    const created = Date.parse(seed.createdAt);
    drafts.forEach((draft, i) => {
      journal.push({
        entryId: `${seed.initiativeId.slice(0, -2)}${String(i).padStart(2, '0')}-entry`,
        initiativeId: seed.initiativeId,
        createdAt: new Date(created + (i + 1) * 6 * HOUR).toISOString(),
        source: draft.source,
        tag: draft.tag,
        step: draft.step,
        authorUsername: draft.authorUsername ?? SEED_USERNAME,
        content: draft.content,
      });
    });
  }

  return { datasources: SEED_DATASOURCES.map((d) => ({ ...d })), initiatives, journal };
};
