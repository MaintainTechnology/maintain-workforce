import { createClerkClient } from "@clerk/backend";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type FixtureConfig = {
  url: string;
  anonKey: string;
  clerkSecretKey: string;
  userIds: string[];
};

/** Test infrastructure only: never creates users or touches an existing session. */
export function createClerkRlsClients(config: FixtureConfig): {
  ready: Promise<SupabaseClient[]>;
  close: () => Promise<void>;
} {
  if (!config.clerkSecretKey.startsWith("sk_test_")) {
    throw new Error("RLS fixture sessions require an explicit Clerk development key.");
  }
  if (config.userIds.length === 0 || config.userIds.some((id) => !/^user_[a-zA-Z0-9]+$/.test(id))) {
    throw new Error("Every RLS fixture user must have an explicit Clerk user id.");
  }

  const clerk = createClerkClient({ secretKey: config.clerkSecretKey });
  const createdSessionIds = new Set<string>();
  const revocationAttempts = new Map<string, Promise<void>>();
  let closing = false;
  let cleanupRun: Promise<void> | undefined;

  const assertOpen = () => {
    if (closing) throw new Error("The Clerk RLS fixture session is closed.");
  };

  const revokeOwnedSession = (sessionId: string): Promise<void> => {
    if (!createdSessionIds.has(sessionId)) return Promise.resolve();
    const existing = revocationAttempts.get(sessionId);
    if (existing) return existing;
    const attempt = Promise.resolve().then(async () => {
      await clerk.sessions.revokeSession(sessionId);
      createdSessionIds.delete(sessionId);
    });
    // Keep failed attempts until this cleanup run ends, so concurrent callers
    // share the outcome. A later explicit close retries only the remaining ids.
    revocationAttempts.set(sessionId, attempt);
    return attempt;
  };

  const setupSettled = Promise.allSettled(config.userIds.map(async (userId) => {
    const session = await clerk.sessions.createSession({ userId });
    createdSessionIds.add(session.id);
    try {
      assertOpen();
      const accessToken = async () => {
        assertOpen();
        const token = await clerk.sessions.getToken(session.id, "supabase");
        assertOpen();
        if (!token.jwt) throw new Error("Clerk returned no RLS fixture token.");
        return token.jwt;
      };
      await accessToken(); // Fail setup, rather than silently testing as anonymous.
      assertOpen();
      return createClient(config.url, config.anonKey, {
        accessToken,
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } finally {
      // A timed-out beforeAll does not cancel its requests. Revoke a session
      // even when its creation finishes after afterAll has started cleanup.
      if (closing) await revokeOwnedSession(session.id);
    }
  }));

  const close = (): Promise<void> => {
    closing = true;
    if (cleanupRun) return cleanupRun;
    cleanupRun = (async () => {
      try {
        // Revoke known sessions immediately, without waiting for another user
        // creation or token request. Late creations revoke themselves above.
        await Promise.allSettled([...createdSessionIds].map(revokeOwnedSession));
        await setupSettled;
        if (createdSessionIds.size > 0) {
          throw new Error(
            `Could not revoke ${createdSessionIds.size} Clerk RLS fixture session(s); retry cleanup.`,
          );
        }
      } finally {
        revocationAttempts.clear();
        cleanupRun = undefined;
      }
    })();
    return cleanupRun;
  };

  const ready = setupSettled.then(async (results) => {
    if (closing || results.some((result) => result.status === "rejected")) {
      await close();
      throw new Error(
        "Unable to initialise Clerk RLS fixture sessions. Check the configured users and supabase JWT template.",
      );
    }
    return results.map((result) => {
      if (result.status !== "fulfilled") throw new Error("RLS fixture setup did not complete.");
      return result.value;
    });
  });

  // The caller must register close before awaiting ready, so hook timeouts
  // cannot lose the only handle to sessions that are still being created.
  return { ready, close };
}
