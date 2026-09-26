import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { login } from "../helpers/auth";
import {
  attachBrowserAudit,
  expectNoUnexpectedBrowserFailures,
  monitorBrowserFailures,
  type BrowserFailureCollector,
} from "../helpers/diagnostics";
import {
  getQaCredentials,
  type QaCredentialKind,
} from "../helpers/environment";

type QaBrowserSession = {
  context: BrowserContext;
  page: Page;
  audit: BrowserFailureCollector;
};

type QaFixtures = {
  browserAudit: BrowserFailureCollector;
  qaUserASession: QaBrowserSession;
  qaUserAContext: BrowserContext;
  qaUserAPage: Page;
  qaUserAAudit: BrowserFailureCollector;
  qaUserBSession: QaBrowserSession;
  qaUserBContext: BrowserContext;
  qaUserBPage: Page;
  qaUserBAudit: BrowserFailureCollector;
  deleteAccountSession: QaBrowserSession;
  deleteAccountContext: BrowserContext;
  deleteAccountPage: Page;
  deleteAccountAudit: BrowserFailureCollector;
};

async function provideQaSession(
  browser: Browser,
  kind: QaCredentialKind,
  label: string,
  testInfo: TestInfo,
  provideSession: (session: QaBrowserSession) => Promise<void>,
) {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    // Auth state exists only in this in-memory context and is never serialized.
    storageState: undefined,
  });
  const page = await context.newPage();
  let audit: BrowserFailureCollector | null = null;

  try {
    await login(page, getQaCredentials(kind));
    await page.waitForLoadState("networkidle");
    audit = monitorBrowserFailures(page);
    await provideSession({ context, page, audit });
  } finally {
    if (audit) {
      audit.stop();
      await attachBrowserAudit(testInfo, label, audit);
    }
    await context.close();
  }
}

export const test = base.extend<QaFixtures>({
  browserAudit: [
    async ({ page }, provideAudit, testInfo) => {
      const audit = monitorBrowserFailures(page);
      try {
        await provideAudit(audit);
        expectNoUnexpectedBrowserFailures(audit);
      } finally {
        audit.stop();
        await attachBrowserAudit(testInfo, "default-page", audit);
      }
    },
    { auto: true },
  ],

  qaUserASession: async ({ browser }, provideSession, testInfo) => {
    await provideQaSession(
      browser,
      "A",
      "qa-user-a",
      testInfo,
      provideSession,
    );
  },
  qaUserAContext: async ({ qaUserASession }, provideContext) => {
    await provideContext(qaUserASession.context);
  },
  qaUserAPage: async ({ qaUserASession }, providePage) => {
    await providePage(qaUserASession.page);
  },
  qaUserAAudit: async ({ qaUserASession }, provideAudit) => {
    await provideAudit(qaUserASession.audit);
  },

  qaUserBSession: async ({ browser }, provideSession, testInfo) => {
    await provideQaSession(
      browser,
      "B",
      "qa-user-b",
      testInfo,
      provideSession,
    );
  },
  qaUserBContext: async ({ qaUserBSession }, provideContext) => {
    await provideContext(qaUserBSession.context);
  },
  qaUserBPage: async ({ qaUserBSession }, providePage) => {
    await providePage(qaUserBSession.page);
  },
  qaUserBAudit: async ({ qaUserBSession }, provideAudit) => {
    await provideAudit(qaUserBSession.audit);
  },

  deleteAccountSession: async ({ browser }, provideSession, testInfo) => {
    await provideQaSession(
      browser,
      "delete",
      "disposable-account",
      testInfo,
      provideSession,
    );
  },
  deleteAccountContext: async (
    { deleteAccountSession },
    provideContext,
  ) => {
    await provideContext(deleteAccountSession.context);
  },
  deleteAccountPage: async ({ deleteAccountSession }, providePage) => {
    await providePage(deleteAccountSession.page);
  },
  deleteAccountAudit: async ({ deleteAccountSession }, provideAudit) => {
    await provideAudit(deleteAccountSession.audit);
  },
});

export { expect };
