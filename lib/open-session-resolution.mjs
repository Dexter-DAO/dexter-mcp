export function createOpenSessionResolver({
  dexterApi,
  apiBaseFallback,
  openSessionHintTtlMs,
  normalizeSessionFunding,
}) {
  const openSessionHints = new Map();
  const openSessionContext = new Map();

  function rememberOpenSessionHint(session) {
    const token = session?.sessionToken;
    if (!token) return;
    openSessionHints.set(token, {
      sessionId: session.sessionId || null,
      sessionToken: token,
      funding: normalizeSessionFunding(session.funding),
      expiresAt: session.expiresAt || null,
      createdAt: Date.now(),
    });
  }

  function extractMcpSessionId(extra) {
    if (extra?.sessionId) return extra.sessionId;
    if (extra?._meta?.['openai/session']) return extra._meta['openai/session'];
    const headerSources = [
      extra?.requestInfo?.headers,
      extra?.httpRequest?.headers,
      extra?.request?.headers,
    ].filter(Boolean);
    for (const headers of headerSources) {
      const value = headers?.['mcp-session-id'] || headers?.['Mcp-Session-Id'] || headers?.['MCP-SESSION-ID'];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  function linkSessionToContext(extra, sessionToken) {
    if (!sessionToken) return;
    const sessionId = extractMcpSessionId(extra);
    if (sessionId) openSessionContext.set(sessionId, sessionToken);
  }

  function readOpenSessionHint(sessionToken) {
    const hint = openSessionHints.get(sessionToken);
    if (!hint) return null;
    if (Date.now() - hint.createdAt > openSessionHintTtlMs) {
      openSessionHints.delete(sessionToken);
      return null;
    }
    return {
      sessionId: hint.sessionId,
      sessionToken: hint.sessionToken,
      funding: hint.funding,
      expiresAt: hint.expiresAt,
    };
  }

  function readContextSessionHint(extra) {
    const mcpSessionId = extractMcpSessionId(extra);
    if (!mcpSessionId) return null;
    const token = openSessionContext.get(mcpSessionId);
    if (!token) return null;
    const hint = readOpenSessionHint(token);
    if (!hint) {
      openSessionContext.delete(mcpSessionId);
      return null;
    }
    return hint;
  }

  async function createOpenSession(targetFundingAtomic, sessionKey) {
    const bases = [dexterApi, apiBaseFallback].filter(Boolean);
    const paths = ['/v2/open/session/create', '/v2/pay/open/session/create'];
    for (const base of bases) {
      for (const path of paths) {
        const sessionRes = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetFundingAtomic,
            sessionKey: sessionKey || undefined,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const sessionBody = await sessionRes.json().catch(() => null);
        if (sessionRes.status === 404) continue;
        if (sessionRes.ok && sessionBody?.ok) return sessionBody;
        return null;
      }
    }
    return null;
  }

  async function resolveSessionByToken(sessionToken) {
    const bases = [dexterApi, apiBaseFallback].filter(Boolean);
    const paths = ['/v2/open/session/resolve', '/v2/pay/open/session/resolve'];
    for (const base of bases) {
      for (const path of paths) {
        try {
          const res = await fetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ sessionToken }),
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const body = await res.json().catch(() => null);
            if (body?.ok && body.sessionId) return body;
          }
          if (res.status === 404) return null;
        } catch {}
      }
    }
    return null;
  }

  async function resolveOrCreateSessionForWallet(args, extra) {
    let sessionResolution = { mode: 'missing' };
    let session = args?.sessionToken ? readOpenSessionHint(args.sessionToken) : readContextSessionHint(extra);

    if (session && args?.sessionToken) {
      linkSessionToContext(extra, args.sessionToken);
      sessionResolution = { mode: 'resumed_from_token' };
    } else if (session) {
      sessionResolution = { mode: 'resumed_from_context' };
    }

    if (!session && args?.sessionToken) {
      const resolved = await resolveSessionByToken(args.sessionToken);
      if (resolved) {
        session = {
          sessionId: resolved.sessionId,
          sessionToken: args.sessionToken,
          funding: resolved.funding || null,
          expiresAt: resolved.expiresAt || null,
        };
        rememberOpenSessionHint({ ...session, ...resolved });
        linkSessionToContext(extra, args.sessionToken);
        sessionResolution = { mode: 'resumed_from_token' };
      }
    }

    if (!session && args?.sessionToken) {
      const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.sessionToken);
      return {
        session: null,
        sessionResolution: {
          mode: isUuidFormat ? 'invalid_token_format' : 'unknown_session_token',
        },
        error: {
          error: isUuidFormat ? 'invalid_token_format' : 'unknown_session_token',
          mode: 'session_error',
          message: isUuidFormat
            ? 'You passed a sessionId (UUID), not a sessionToken. The sessionToken starts with "open_" and is the bearer credential returned when an access session is created.'
            : 'That access-session token was not recognized. It may have expired or the server may have restarted. Retry the call without a sessionToken and a fresh access session starts automatically.',
          hint: 'Retry this tool without a sessionToken to start a fresh access session, or pass a valid sessionToken starting with "open_". This legacy access session is separate from the Dexter wallet; x402_wallet does not create sessions.',
        },
      };
    }

    if (!session) {
      const sessionBody = await createOpenSession('1000000', extractMcpSessionId(extra));
      if (sessionBody?.ok) {
        rememberOpenSessionHint(sessionBody);
        linkSessionToContext(extra, sessionBody.sessionToken);
        session = {
          sessionId: sessionBody.sessionId,
          sessionToken: sessionBody.sessionToken,
          funding: sessionBody.funding || null,
          expiresAt: sessionBody.expiresAt || null,
        };
        sessionResolution = { mode: 'created_new' };
      }
    }

    if (!session) {
      return {
        session: null,
        sessionResolution: { mode: 'missing', reason: 'wallet_session_unavailable' },
        error: {
          error: 'session_unavailable',
          mode: 'session_error',
          message: 'Could not initialize an OpenDexter spend session.',
        },
      };
    }

    return { session, sessionResolution, error: null };
  }

  async function resolveSessionForPayment(args, extra) {
    const explicitToken = args?.sessionToken || null;
    let session = explicitToken ? readOpenSessionHint(explicitToken) : readContextSessionHint(extra);
    let sessionResolution = { mode: 'missing' };

    if (session && explicitToken) {
      linkSessionToContext(extra, explicitToken);
      sessionResolution = { mode: 'resumed_from_token' };
    } else if (session) {
      sessionResolution = { mode: 'resumed_from_context' };
    }

    if (!session && explicitToken) {
      const resolved = await resolveSessionByToken(explicitToken);
      if (resolved) {
        session = {
          sessionId: resolved.sessionId,
          sessionToken: explicitToken,
          funding: resolved.funding || null,
          expiresAt: resolved.expiresAt || null,
        };
        rememberOpenSessionHint({ ...session, ...resolved });
        linkSessionToContext(extra, explicitToken);
        sessionResolution = { mode: 'resumed_from_token' };
      }
    }

    if (!session && explicitToken) {
      const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(explicitToken);
      return {
        session: null,
        sessionHint: null,
        sessionResolution: {
          mode: isUuidFormat ? 'invalid_token_format' : 'unknown_session_token',
        },
        error: {
          status: 404,
          mode: 'session_error',
          error: isUuidFormat ? 'invalid_token_format' : 'unknown_session_token',
          message: isUuidFormat
            ? 'You passed a sessionId (UUID), not a sessionToken. The sessionToken starts with "open_" and is the bearer credential returned when a session is created.'
            : 'Session token not recognized. It may have expired or the server may have restarted.',
          hint: 'Call x402_wallet() with no arguments to create or resume a session, or use a valid sessionToken starting with "open_".',
        },
      };
    }

    // No bound session yet. Bootstrap one inline so the caller can return
    // a proper "needs funding" payload to the widget instead of a bare
    // "go run x402_wallet first" error. The widget handles the rest:
    // shows the deposit address, copy button, QR, and a "try again"
    // button that retries the original paid call once funding lands.
    if (!session) {
      const sessionBody = await createOpenSession('1000000', extractMcpSessionId(extra));
      if (sessionBody?.ok) {
        rememberOpenSessionHint(sessionBody);
        linkSessionToContext(extra, sessionBody.sessionToken);
        const fresh = {
          sessionId: sessionBody.sessionId,
          sessionToken: sessionBody.sessionToken,
          funding: normalizeSessionFunding(sessionBody.funding),
          expiresAt: sessionBody.expiresAt || null,
        };
        return {
          session: null,
          sessionHint: fresh,
          sessionResolution: { mode: 'created_for_payment' },
          error: {
            status: 402,
            mode: 'session_required',
            error: 'session_not_funded',
            message: 'A wallet was created for this conversation. Fund it to continue.',
            session: fresh,
            funding: fresh.funding,
            sessionFunding: fresh.funding,
          },
        };
      }
      // createOpenSession failed — fall through to the original error so
      // the user sees something rather than a silent stall.
      return {
        session: null,
        sessionHint: null,
        sessionResolution: { mode: 'missing', reason: 'create_failed' },
        error: {
          status: 502,
          mode: 'session_error',
          error: 'session_create_failed',
          message: 'Could not create an OpenDexter session. The wallet service is unavailable.',
        },
      };
    }

    return {
      session,
      sessionHint: readOpenSessionHint(session.sessionToken),
      sessionResolution,
      error: null,
    };
  }

  return {
    createOpenSession,
    extractMcpSessionId,
    linkSessionToContext,
    readContextSessionHint,
    readOpenSessionHint,
    rememberOpenSessionHint,
    resolveOrCreateSessionForWallet,
    resolveSessionByToken,
    resolveSessionForPayment,
  };
}
