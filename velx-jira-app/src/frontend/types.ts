/**
 * Shapes of what the kitchen backend sends back. The UI Kit modules share them.
 */

/** A kitchen ticket, as returned by POST /kitchen/orders and GET /kitchen/ticket. */
export interface Ticket {
  orderNo: number;
  issueKey: string;
  table: string;
  dish: string;
  course: string;
  dietary: string[];
  rush: boolean;
  prepMinutes: number;
  notes: string;
  jiraStatus: string;
  stages: string[];
  stageIndex: number;
  orderedBy?: string;
  orderedAt: string;
}

/** One line of the kitchen log (GET /kitchen/log). */
export interface LogEntry {
  at: string;
  accountId?: string;
  text: string;
}

/** Every non-2xx answer from the kitchen carries an error message. */
export interface KitchenError {
  error?: string;
}

/** Turns an unknown thrown value into a readable message. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
