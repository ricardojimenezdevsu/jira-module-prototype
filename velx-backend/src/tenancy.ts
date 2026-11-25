/**
 * Which Velx deployment and Velx user a Forge request belongs to.
 *
 * Velx runs one deployment per customer (XXX.velx.ai) and has no tenant table, and nothing
 * links an Atlassian account to a Velx user. Solving both is issue #3755. Until then the stub
 * maps every site to one fake deployment and every Jira user to one fake Velx user, and logs,
 * once per site and per account, the mapping a real connector would need.
 */
import type { ForgeRequestContext, Logger } from './types.ts';

export interface VelxTenant {
  /** Base URL of the customer's Velx web app. */
  webUrl: string;
  /** The Velx user the Jira user acts as. */
  username: string;
}

export interface Tenancy {
  resolve(forge: ForgeRequestContext): VelxTenant;
}

export const createStubTenancy = ({
  webUrl,
  username,
  logger,
}: VelxTenant & { logger: Logger }): Tenancy => {
  const seenSites = new Set<string>();
  const seenAccounts = new Set<string>();
  return {
    resolve(forge) {
      const site = forge.cloudId ?? 'unknown';
      if (!seenSites.has(site)) {
        seenSites.add(site);
        logger.log(
          `[tenant] cloudId=${site} site=${forge.siteUrl} would need a Forge-site-to-Velx-deployment ` +
            `mapping (#3755); using stub ${webUrl}`
        );
      }
      const account = forge.accountId ?? 'unknown';
      if (!seenAccounts.has(account)) {
        seenAccounts.add(account);
        logger.log(
          `[tenant] accountId=${account} would need an Atlassian-account-to-Velx-user mapping (#3755); ` +
            `using ${username}`
        );
      }
      return { webUrl, username };
    },
  };
};
