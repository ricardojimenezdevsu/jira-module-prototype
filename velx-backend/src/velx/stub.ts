/**
 * In-memory stand-in for the Velx initiatives API. Validation follows what Velx enforces on
 * POST /api/initiatives (title up to 200 characters, at least one target repository).
 * Everything is lost on restart except the seed data, which is rebuilt with the same ids.
 */
import { HttpError } from '../errors.ts';
import type { VelxClient } from './client.ts';
import { advance, fail, start, type JournalDraft, type LifecyclePosition } from './lifecycle.ts';
import { buildSeed, type SeedData } from './seed.ts';
import type {
  CreateInitiativeBody,
  Initiative,
  InitiativeDetail,
  InitiativeResponse,
  JournalEntry,
  VelxActor,
} from './types.ts';

export const TITLE_MAX = 200;
export const GOAL_MAX = 20_000;

export interface StubOptions {
  seed?: SeedData;
  now?: () => Date;
  newId?: () => string;
}

export class StubVelxClient implements VelxClient {
  private readonly datasources;
  private readonly initiatives = new Map<string, Initiative>();
  private readonly journal: JournalEntry[];
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor({ seed = buildSeed(), now = () => new Date(), newId = () => crypto.randomUUID() }: StubOptions = {}) {
    this.datasources = seed.datasources;
    for (const initiative of seed.initiatives) this.initiatives.set(initiative.initiativeId, initiative);
    this.journal = seed.journal;
    this.now = now;
    this.newId = newId;
  }

  async listInitiatives() {
    const data = [...this.initiatives.values()]
      .filter((i) => i.archiveStatus.state !== 'archived')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { data };
  }

  async getInitiative(initiativeId: string): Promise<InitiativeResponse | null> {
    const initiative = this.initiatives.get(initiativeId);
    return initiative ? this.respond(initiative) : null;
  }

  async createInitiative(body: CreateInitiativeBody, actor: VelxActor): Promise<InitiativeResponse> {
    const title = body.title.trim();
    if (!title) throw new HttpError(400, 'The title is required');
    if (title.length > TITLE_MAX) throw new HttpError(400, `The title can have at most ${TITLE_MAX} characters`);
    if (body.initiativeGoal.length > GOAL_MAX) {
      throw new HttpError(400, `The goal can have at most ${GOAL_MAX} characters`);
    }
    const targets = [...new Set(body.targetDatasourceIds)];
    if (targets.length === 0) throw new HttpError(400, 'Pick at least one target repository');
    const context = [...new Set(body.contextDatasourceIds ?? [])].filter((id) => !targets.includes(id));
    const known = new Set(this.datasources.map((d) => d.datasourceId));
    const unknown = [...targets, ...context].filter((id) => !known.has(id));
    if (unknown.length > 0) throw new HttpError(400, `Unknown repository: ${unknown.join(', ')}`);
    if ((body.standardIds ?? []).length > 0) throw new HttpError(400, 'The stub has no standards to pick');

    const { position, entries } = start();
    const initiative: Initiative = {
      initiativeId: this.newId(),
      title,
      initiativeGoal: body.initiativeGoal,
      targetDatasourceIds: targets,
      contextDatasourceIds: context,
      standardIds: [],
      datasourceBranches: { ...(body.datasourceBranches ?? {}) },
      ...position,
      createdAt: this.now().toISOString(),
      archiveStatus: { state: 'active' },
      createdByUsername: actor.username,
      planFormat: 'unified',
    };
    this.initiatives.set(initiative.initiativeId, initiative);
    this.addEntries(initiative.initiativeId, entries, actor);
    return this.respond(initiative);
  }

  async listJournalEntries(initiativeId: string) {
    this.mustGet(initiativeId);
    const data = this.journal
      .filter((e) => e.initiativeId === initiativeId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { data };
  }

  async listDatasources() {
    return { data: this.datasources.map((d) => ({ ...d })) };
  }

  async simulateAdvance(initiativeId: string, actor: VelxActor): Promise<InitiativeResponse> {
    return this.move(initiativeId, actor, advance);
  }

  async simulateFail(initiativeId: string, actor: VelxActor): Promise<InitiativeResponse> {
    return this.move(initiativeId, actor, fail);
  }

  private move(
    initiativeId: string,
    actor: VelxActor,
    step: (p: LifecyclePosition) => { position: LifecyclePosition; entries: JournalDraft[] }
  ): InitiativeResponse {
    const initiative = this.mustGet(initiativeId);
    if (initiative.archiveStatus.state === 'archived') throw new HttpError(409, 'This initiative is archived');
    const { position, entries } = step(initiative);
    const { failureReason: _old, ...rest } = initiative;
    const updated: Initiative = { ...rest, ...position };
    this.initiatives.set(initiativeId, updated);
    this.addEntries(initiativeId, entries, actor);
    return this.respond(updated);
  }

  private mustGet(initiativeId: string): Initiative {
    const initiative = this.initiatives.get(initiativeId);
    if (!initiative) throw new HttpError(404, 'Initiative not found in Velx');
    return initiative;
  }

  private addEntries(initiativeId: string, drafts: JournalDraft[], actor: VelxActor) {
    const at = this.now().toISOString();
    for (const draft of drafts) {
      this.journal.push({
        entryId: this.newId(),
        initiativeId,
        createdAt: at,
        source: draft.source,
        tag: draft.tag,
        step: draft.step,
        authorUsername: draft.authorUsername ?? actor.username,
        content: draft.content,
      });
    }
  }

  /** Builds the GET /api/initiatives/:id answer, resolving datasource ids to names and branches. */
  private respond(initiative: Initiative): InitiativeResponse {
    const { targetDatasourceIds, contextDatasourceIds, standardIds: _standards, ...rest } = initiative;
    const resolve = (id: string, role: 'target' | 'context') => {
      const ds = this.datasources.find((d) => d.datasourceId === id);
      return {
        id,
        name: ds?.name ?? id,
        role,
        branch: initiative.datasourceBranches[id] ?? ds?.defaultBranch ?? 'main',
      };
    };
    const detail: InitiativeDetail = {
      ...rest,
      datasources: [
        ...targetDatasourceIds.map((id) => resolve(id, 'target')),
        ...contextDatasourceIds.map((id) => resolve(id, 'context')),
      ],
      standards: [],
    };
    return { success: true, data: { initiative: detail } };
  }
}
