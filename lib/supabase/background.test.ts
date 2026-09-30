import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import {
  createCalendarSyncBackgroundClient,
  createScheduledReminderBackgroundClient,
} from "./background";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSecret = process.env.SUPABASE_SECRET_KEY;

afterEach(() => {
  vi.clearAllMocks();
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalSecret;
});

describe("scheduled reminder background client", () => {
  it("fails safely when either server-only setting is absent", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    expect(() => createScheduledReminderBackgroundClient()).toThrow(
      "The scheduled reminder database URL is not configured.",
    );
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://development.supabase.test";
    expect(() => createScheduledReminderBackgroundClient()).toThrow(
      "The scheduled reminder database credential is not configured.",
    );
  });

  it("constructs a non-persisting server client", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://development.supabase.test";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
    mocks.createClient.mockReturnValue({ rpc: vi.fn() });
    createScheduledReminderBackgroundClient();
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://development.supabase.test",
      "server-only-secret",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  });
});

describe("calendar sync background client", () => {
  it("fails safely when either server-only setting is absent", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    expect(() => createCalendarSyncBackgroundClient()).toThrow(
      "The calendar sync database URL is not configured.",
    );
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://development.supabase.test";
    expect(() => createCalendarSyncBackgroundClient()).toThrow(
      "The calendar sync database credential is not configured.",
    );
  });

  it("constructs a non-persisting server-only RPC client", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://development.supabase.test";
    process.env.SUPABASE_SECRET_KEY = "server-only-secret";
    mocks.createClient.mockReturnValue({ rpc: vi.fn() });
    createCalendarSyncBackgroundClient();
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://development.supabase.test",
      "server-only-secret",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  });
});
