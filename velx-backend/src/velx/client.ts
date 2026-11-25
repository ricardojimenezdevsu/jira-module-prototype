/**
 * What the connector needs from Velx. Each method maps to one Velx REST endpoint and
 * returns Velx's response envelope, so a real HTTP client can replace the stub without
 * touching the routes. Methods throw HttpError for Velx-side errors (400, 404, 409).
 */
import type {
  CreateInitiativeBody,
  Datasource,
  Initiative,
  InitiativeResponse,
  JournalEntry,
  ListResponse,
  VelxActor,
} from './types.ts';

export interface VelxClient {
  /** GET /api/initiatives: initiatives that are not archived. */
  listInitiatives(): Promise<ListResponse<Initiative>>;
  /** GET /api/initiatives/:id, or null when it does not exist. */
  getInitiative(initiativeId: string): Promise<InitiativeResponse | null>;
  /** POST /api/initiatives. */
  createInitiative(body: CreateInitiativeBody, actor: VelxActor): Promise<InitiativeResponse>;
  /** GET /api/initiatives/:id/journal/entries. */
  listJournalEntries(initiativeId: string): Promise<ListResponse<JournalEntry>>;
  /** Repositories the user can pick as targets or context. ASSUMED endpoint. */
  listDatasources(): Promise<ListResponse<Datasource>>;
  /** Stub only: move the initiative one row along its lifecycle. */
  simulateAdvance(initiativeId: string, actor: VelxActor): Promise<InitiativeResponse>;
  /** Stub only: fail the current step. */
  simulateFail(initiativeId: string, actor: VelxActor): Promise<InitiativeResponse>;
}
