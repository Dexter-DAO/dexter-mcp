export const DEXTER_TOOL_INVOCATION_META_KEY = 'dexter/toolInvocation';
export const OPENAI_WIDGET_SESSION_META_KEY = 'openai/widgetSessionId';
export const TOOL_RESULT_ATTACH_TIMEOUT_MS = 30_000;

export type ToolInvocationStatus =
  | 'waiting'
  | 'running'
  | 'ready'
  | 'cancelled'
  | 'malformed'
  | 'timed_out';

export type ToolInvocationIdentity = {
  toolName: string | null;
  requestId: string | null;
  widgetSessionId: string | null;
};

export type ToolInvocationLifecycle = {
  key: string;
  identity: ToolInvocationIdentity;
  status: ToolInvocationStatus;
  input: unknown;
  output: unknown;
  metadata: Record<string, unknown> | null;
  message: string | null;
  startedAt: number;
  updatedAt: number;
  timeoutMs: number;
};

export type ToolInvocationClock = {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type ToolInvocationSource = 'mcp-apps' | 'chatgpt';

type InvocationRecord = {
  snapshot: ToolInvocationLifecycle;
  trustedIdentity: boolean;
  acceptedUnboundLegacyHydration: boolean;
  legacyWidgetSessionId: string | null;
  timeoutHandle: unknown | null;
};

type ResultEnvelope = {
  content?: Array<{ type?: unknown; text?: unknown }>;
  structuredContent?: unknown;
  _meta?: unknown;
};

type BindingResult =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'valid'; identity: ToolInvocationIdentity };

const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
const MAX_ID_LENGTH = 512;
const MAX_RECORDS = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cleanString(value: unknown, maxLength = MAX_ID_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function cleanRequestId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return cleanString(value);
}

function cleanToolName(value: unknown): string | null {
  const name = cleanString(value, 128);
  return name && TOOL_NAME.test(name) ? name : null;
}

function cleanWidgetSessionId(value: unknown): string | null {
  return cleanString(value);
}

function defaultClock(): ToolInvocationClock {
  return {
    now: () => Date.now(),
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    clearTimeout: (handle) => globalThis.clearTimeout(
      handle as ReturnType<typeof setTimeout>,
    ),
  };
}

function invocationKey(identity: ToolInvocationIdentity): string {
  return JSON.stringify([
    identity.widgetSessionId ?? '~',
    identity.toolName ?? '~',
    identity.requestId ?? '~',
  ]);
}

function sameIdentity(
  expected: ToolInvocationIdentity,
  actual: ToolInvocationIdentity,
): boolean {
  if (expected.toolName && actual.toolName !== expected.toolName) return false;
  if (expected.requestId && actual.requestId !== expected.requestId) return false;
  if (
    expected.widgetSessionId
    && actual.widgetSessionId
    && actual.widgetSessionId !== expected.widgetSessionId
  ) return false;
  return true;
}

function compatibleIdentity(
  left: ToolInvocationIdentity,
  right: ToolInvocationIdentity,
): boolean {
  if (left.toolName && right.toolName && left.toolName !== right.toolName) return false;
  if (left.requestId && right.requestId && left.requestId !== right.requestId) return false;
  if (
    left.widgetSessionId
    && right.widgetSessionId
    && left.widgetSessionId !== right.widgetSessionId
  ) return false;
  return true;
}

function textContentOutput(content: ResultEnvelope['content']): unknown {
  const text = content?.find((item) => item?.type === 'text' && typeof item.text === 'string')?.text;
  if (typeof text !== 'string' || text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function resultOutput(result: unknown): unknown {
  if (!isRecord(result)) return null;
  if (result.structuredContent !== null && result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  return textContentOutput(result.content as ResultEnvelope['content']);
}

function widgetSessionFromRecord(value: Record<string, unknown> | null): string | null {
  if (!value) return null;
  const nestedOpenAi = isRecord(value.openai) ? value.openai : null;
  return cleanWidgetSessionId(value[OPENAI_WIDGET_SESSION_META_KEY])
    ?? cleanWidgetSessionId(value.widgetSessionId)
    ?? cleanWidgetSessionId(nestedOpenAi?.widgetSessionId);
}

/**
 * ChatGPT's current global can expose the complete tool-result envelope while
 * older hosts expose `_meta` directly. Consumers always receive the direct,
 * widget-only metadata object.
 */
export function normalizeToolResponseMetadata(
  value: unknown,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;

  if (isRecord(value.toolResponseMetadata)) {
    return normalizeToolResponseMetadata(value.toolResponseMetadata);
  }
  if (isRecord(value._meta)) return value._meta;
  return value;
}

export function toolInvocationBinding(
  metadata: Record<string, unknown> | null,
): BindingResult {
  if (!metadata || !Object.prototype.hasOwnProperty.call(
    metadata,
    DEXTER_TOOL_INVOCATION_META_KEY,
  )) {
    return { kind: 'absent' };
  }

  const value = metadata[DEXTER_TOOL_INVOCATION_META_KEY];
  if (!isRecord(value)) return { kind: 'invalid' };
  const toolName = cleanToolName(value.toolName);
  const requestId = cleanRequestId(value.requestId);
  if (!toolName || !requestId) return { kind: 'invalid' };

  return {
    kind: 'valid',
    identity: {
      toolName,
      requestId,
      widgetSessionId: widgetSessionFromRecord(metadata),
    },
  };
}

/** Read the invocation that owns an MCP Apps iframe from hostContext.toolInfo. */
export function hostToolInvocationIdentity(
  hostContext: unknown,
  fallbackWidgetSessionId: unknown = null,
): ToolInvocationIdentity | null {
  if (!isRecord(hostContext) || !isRecord(hostContext.toolInfo)) return null;
  const toolInfo = hostContext.toolInfo;
  if (!isRecord(toolInfo.tool)) return null;
  const toolName = cleanToolName(toolInfo.tool.name);
  if (!toolName) return null;

  return {
    toolName,
    requestId: cleanRequestId(toolInfo.id),
    widgetSessionId:
      widgetSessionFromRecord(hostContext)
      ?? cleanWidgetSessionId(fallbackWidgetSessionId),
  };
}

function lateResultMessage(timeoutMs: number): string {
  return `No valid result attached to this tool call within ${Math.round(timeoutMs / 1000)} seconds. No action was taken. A valid late result can still appear here.`;
}

/**
 * Per-widget invocation store. It never initiates a tool call: it only accepts
 * host input/result/cancellation events for the invocation that owns this view.
 */
export class ToolInvocationStore {
  private readonly clock: ToolInvocationClock;
  private readonly timeoutMs: number;
  private readonly records = new Map<string, InvocationRecord>();
  private readonly listeners = new Set<() => void>();
  private initialLegacyHydrationConsumed = false;
  private initialLegacyHydrationRecord: InvocationRecord | null = null;
  private activeKey: string;

  constructor({
    clock = defaultClock(),
    timeoutMs = TOOL_RESULT_ATTACH_TIMEOUT_MS,
  }: {
    clock?: ToolInvocationClock;
    timeoutMs?: number;
  } = {}) {
    this.clock = clock;
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : TOOL_RESULT_ATTACH_TIMEOUT_MS;
    const identity = { toolName: null, requestId: null, widgetSessionId: null };
    this.activeKey = invocationKey(identity);
    this.records.set(this.activeKey, this.createRecord(identity, false));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ToolInvocationLifecycle => this.activeRecord().snapshot;

  activateHostContext(hostContext: unknown, widgetSessionId: unknown = null): boolean {
    const identity = hostToolInvocationIdentity(hostContext, widgetSessionId);
    if (!identity) return false;
    const current = this.activeRecord();
    if (current.trustedIdentity && compatibleIdentity(identity, current.snapshot.identity)) {
      const merged = {
        toolName: current.snapshot.identity.toolName ?? identity.toolName,
        requestId: current.snapshot.identity.requestId ?? identity.requestId,
        widgetSessionId:
          current.snapshot.identity.widgetSessionId ?? identity.widgetSessionId,
      };
      if (invocationKey(merged) !== current.snapshot.key) {
        this.rekeyActiveRecord(current, merged);
        this.emit();
        return true;
      }
      return false;
    }
    const staged = this.compatibleInactiveRecords(identity, current);
    if (staged.length === 1) return this.activateExistingRecord(staged[0], identity);
    if (staged.length > 1) return false;
    // Host notifications can arrive before asynchronous MCP Apps initialize.
    // Preserve an anonymous cancellation by binding it to the first trusted
    // context; replacing it with a waiter could resurrect a cancelled call.
    if (
      !current.trustedIdentity
      && current.snapshot.status === 'cancelled'
      && !current.snapshot.identity.toolName
      && !current.snapshot.identity.requestId
      && (
        !current.legacyWidgetSessionId
        || !identity.widgetSessionId
        || current.legacyWidgetSessionId === identity.widgetSessionId
      )
    ) {
      current.trustedIdentity = true;
      this.rekeyActiveRecord(current, identity);
      this.emit();
      return true;
    }
    // An empty initial ChatGPT snapshot arms this exact record for a delayed
    // legacy output. Carry that ownership through the first compatible MCP
    // Apps context; the allowance cannot move to a later invocation record.
    if (
      !current.trustedIdentity
      && this.initialLegacyHydrationRecord === current
      && !current.snapshot.identity.toolName
      && !current.snapshot.identity.requestId
      && (
        !current.legacyWidgetSessionId
        || !identity.widgetSessionId
        || current.legacyWidgetSessionId === identity.widgetSessionId
      )
    ) {
      current.trustedIdentity = true;
      this.rekeyActiveRecord(current, {
        ...identity,
        widgetSessionId: identity.widgetSessionId ?? current.legacyWidgetSessionId,
      });
      this.emit();
      return true;
    }
    // In dual-host ChatGPT, the legacy globals snapshot can likewise arrive
    // first. The first session-compatible context owns that accepted record.
    if (
      !current.trustedIdentity
      && current.acceptedUnboundLegacyHydration
      && current.snapshot.status === 'ready'
      && !current.snapshot.identity.toolName
      && !current.snapshot.identity.requestId
      && (
        !current.legacyWidgetSessionId
        || !identity.widgetSessionId
        || current.legacyWidgetSessionId === identity.widgetSessionId
      )
    ) {
      current.trustedIdentity = true;
      this.rekeyActiveRecord(current, {
        ...identity,
        widgetSessionId: identity.widgetSessionId ?? current.legacyWidgetSessionId,
      });
      this.emit();
      return true;
    }
    return this.activate(identity, true);
  }

  acceptInput(input: unknown, source: ToolInvocationSource): boolean {
    const record = this.activeRecord();
    if (
      record.snapshot.status === 'cancelled'
      || record.snapshot.status === 'ready'
    ) {
      return false;
    }
    if (record.snapshot.status === 'timed_out') {
      // A delayed input can enrich the record, but it cannot hide the attach
      // timeout or leave the view running forever without another deadline.
      this.update(record, { input });
      return true;
    }
    this.update(record, {
      input,
      status: 'running',
      message: null,
    });
    return true;
  }

  acceptResult(
    result: unknown,
    source: ToolInvocationSource,
    {
      allowUnboundLegacy = false,
      legacyWidgetSessionId = null,
    }: {
      allowUnboundLegacy?: boolean;
      legacyWidgetSessionId?: unknown;
    } = {},
  ): boolean {
    const envelope = isRecord(result) ? result : null;
    const metadata = normalizeToolResponseMetadata(envelope?._meta);
    const binding = toolInvocationBinding(metadata);
    let record = this.activeRecord();

    if (record.snapshot.status === 'cancelled') return false;
    if (record.snapshot.status === 'ready') {
      if (
        source === 'mcp-apps'
        && !record.trustedIdentity
        && record.acceptedUnboundLegacyHydration
        && binding.kind === 'valid'
      ) {
        return this.stageBoundResult(result, metadata, binding.identity);
      }
      return this.enrichReadyMetadata(record, metadata, binding);
    }

    if (record.trustedIdentity) {
      if (binding.kind === 'valid' && !sameIdentity(record.snapshot.identity, binding.identity)) {
        return false;
      }
      if (binding.kind === 'valid') {
        const expected = record.snapshot.identity;
        const enriched = {
          toolName: expected.toolName ?? binding.identity.toolName,
          requestId: expected.requestId ?? binding.identity.requestId,
          widgetSessionId:
            expected.widgetSessionId ?? binding.identity.widgetSessionId,
        };
        if (invocationKey(enriched) !== record.snapshot.key) {
          this.rekeyActiveRecord(record, enriched);
        }
      }
      if (binding.kind === 'absent') {
        // A late ChatGPT global may describe the previous tool call. Only the
        // explicitly claimed initial legacy snapshot may hydrate a pristine,
        // already identified invocation without a server binding.
        if (source === 'chatgpt') {
          if (!allowUnboundLegacy) return false;
        } else {
          this.markMalformed(record, 'The result did not identify the tool call it belongs to. No action was taken.');
          return false;
        }
      }
      if (binding.kind === 'invalid') {
        this.markMalformed(record, 'The result carried an invalid tool-call identity. No action was taken.');
        return false;
      }
    } else if (binding.kind === 'valid') {
      this.activate(binding.identity, true);
      record = this.activeRecord();
    } else if (binding.kind === 'invalid') {
      this.markMalformed(record, 'The result carried an invalid tool-call identity. No action was taken.');
      return false;
    } else if (!allowUnboundLegacy || source !== 'chatgpt') {
      this.markMalformed(record, 'The result did not identify the tool call it belongs to. No action was taken.');
      return false;
    }

    const output = resultOutput(result);
    if (output === null || output === undefined) {
      this.markMalformed(record, 'The host returned no usable output for this tool call. No action was taken.');
      return false;
    }

    if (binding.kind === 'absent' && source === 'chatgpt' && allowUnboundLegacy) {
      record.acceptedUnboundLegacyHydration = true;
      record.legacyWidgetSessionId = cleanWidgetSessionId(legacyWidgetSessionId);
    }
    this.clearRecordTimeout(record);
    this.update(record, {
      output,
      metadata,
      status: 'ready',
      message: null,
    });
    return true;
  }

  acceptMetadata(value: unknown): boolean {
    const metadata = normalizeToolResponseMetadata(value);
    const binding = toolInvocationBinding(metadata);
    const record = this.activeRecord();
    if (
      record.snapshot.status === 'ready'
      && !record.trustedIdentity
      && record.acceptedUnboundLegacyHydration
      && binding.kind === 'valid'
    ) {
      return this.stageBoundMetadata(binding.identity);
    }
    return this.enrichReadyMetadata(record, metadata, binding);
  }

  acceptChatGptGlobals(
    globals: unknown,
    { allowUnboundLegacyHydration = false }: {
      allowUnboundLegacyHydration?: boolean;
    } = {},
  ): boolean {
    if (!isRecord(globals)) return false;
    const hasInput = Object.prototype.hasOwnProperty.call(globals, 'toolInput');
    const hasOutput = Object.prototype.hasOwnProperty.call(globals, 'toolOutput');
    const hasMetadata = Object.prototype.hasOwnProperty.call(
      globals,
      'toolResponseMetadata',
    );
    const rawMetadata = hasMetadata ? globals.toolResponseMetadata : null;
    const metadata = normalizeToolResponseMetadata(rawMetadata);
    const binding = toolInvocationBinding(metadata);
    const globalSessionId = cleanWidgetSessionId(globals.widgetSessionId)
      ?? widgetSessionFromRecord(metadata);

    if (binding.kind === 'valid' && globalSessionId && !binding.identity.widgetSessionId) {
      binding.identity.widgetSessionId = globalSessionId;
    }

    let current = this.activeRecord();
    if (
      !current.trustedIdentity
      && binding.kind === 'valid'
      && current.snapshot.status !== 'ready'
      && current.snapshot.status !== 'cancelled'
    ) {
      this.activate(binding.identity, true);
      current = this.activeRecord();
    }

    if (
      allowUnboundLegacyHydration
      && !this.initialLegacyHydrationConsumed
      && !this.initialLegacyHydrationRecord
      && binding.kind === 'absent'
      && current.snapshot.status === 'waiting'
      && current.snapshot.input === null
      && current.snapshot.output === null
      && current.snapshot.metadata === null
      && (
        current.trustedIdentity
        || (!current.snapshot.identity.toolName && !current.snapshot.identity.requestId)
      )
      && (
        !globalSessionId
        || !current.snapshot.identity.widgetSessionId
        || globalSessionId === current.snapshot.identity.widgetSessionId
      )
    ) {
      this.initialLegacyHydrationRecord = current;
      current.legacyWidgetSessionId = globalSessionId;
    }

    const initialLegacyHydrationAvailable = !this.initialLegacyHydrationConsumed
      && this.initialLegacyHydrationRecord === current;

    const canAttachInitialUnboundLegacy = initialLegacyHydrationAvailable
      && binding.kind === 'absent'
      && hasOutput
      && globals.toolOutput !== null
      && globals.toolOutput !== undefined
      && current.snapshot.status !== 'ready'
      && current.snapshot.status !== 'cancelled'
      && current.snapshot.output === null
      && current.snapshot.metadata === null
      && (
        current.trustedIdentity
        || (!current.snapshot.identity.toolName && !current.snapshot.identity.requestId)
      )
      && (
        !globalSessionId
        || !current.snapshot.identity.widgetSessionId
        || globalSessionId === current.snapshot.identity.widgetSessionId
      )
      && (
        !globalSessionId
        || !current.legacyWidgetSessionId
        || globalSessionId === current.legacyWidgetSessionId
      );
    if (canAttachInitialUnboundLegacy) {
      this.initialLegacyHydrationConsumed = true;
    }

    let changed = false;
    if (hasInput && globals.toolInput !== null && globals.toolInput !== undefined) {
      const active = this.activeRecord();
      const bindingMatches = binding.kind === 'valid'
        && sameIdentity(active.snapshot.identity, binding.identity);
      const canAcceptInitialUnboundLegacyInput = initialLegacyHydrationAvailable
        && binding.kind === 'absent'
        && (allowUnboundLegacyHydration || canAttachInitialUnboundLegacy);
      if (
        !active.trustedIdentity
        || bindingMatches
        || canAcceptInitialUnboundLegacyInput
      ) {
        changed = this.acceptInput(globals.toolInput, 'chatgpt') || changed;
      }
    }

    if (
      (hasOutput || hasMetadata)
      && globals.toolOutput !== null
      && globals.toolOutput !== undefined
    ) {
      changed = this.acceptResult({
        structuredContent: globals.toolOutput,
        _meta: rawMetadata,
      }, 'chatgpt', {
        allowUnboundLegacy: canAttachInitialUnboundLegacy,
        legacyWidgetSessionId: globalSessionId,
      }) || changed;
    } else if (hasMetadata) {
      changed = this.acceptMetadata(rawMetadata) || changed;
    }
    return changed;
  }

  cancel(reason?: unknown): boolean {
    const record = this.activeRecord();
    if (record.snapshot.status === 'ready' || record.snapshot.status === 'cancelled') {
      return false;
    }
    this.clearRecordTimeout(record);
    const cleanReason = cleanString(reason, 500);
    this.update(record, {
      status: 'cancelled',
      output: null,
      message: cleanReason
        ? `This tool call was cancelled: ${cleanReason}`
        : 'This tool call was cancelled before a result arrived.',
    });
    return true;
  }

  dispose(): void {
    for (const record of this.records.values()) this.clearRecordTimeout(record);
    this.records.clear();
    this.listeners.clear();
  }

  private activate(identity: ToolInvocationIdentity, trustedIdentity: boolean): boolean {
    const key = invocationKey(identity);
    if (key === this.activeKey) {
      const record = this.activeRecord();
      record.trustedIdentity = record.trustedIdentity || trustedIdentity;
      return false;
    }

    this.activeKey = key;
    let record = this.records.get(key);
    if (!record) {
      record = this.createRecord(identity, trustedIdentity);
      this.records.set(key, record);
      this.pruneRecords();
    } else {
      record.trustedIdentity = record.trustedIdentity || trustedIdentity;
    }
    this.emit();
    return true;
  }

  private compatibleInactiveRecords(
    identity: ToolInvocationIdentity,
    current: InvocationRecord,
  ): InvocationRecord[] {
    const exact = this.records.get(invocationKey(identity));
    if (exact && exact !== current && exact.trustedIdentity) return [exact];

    return [...this.records.values()].filter((record) => (
      record !== current
      && record.trustedIdentity
      && compatibleIdentity(record.snapshot.identity, identity)
    ));
  }

  private activateExistingRecord(
    record: InvocationRecord,
    identity: ToolInvocationIdentity,
  ): boolean {
    const existing = record.snapshot.identity;
    const merged = {
      toolName: existing.toolName ?? identity.toolName,
      requestId: existing.requestId ?? identity.requestId,
      widgetSessionId: existing.widgetSessionId ?? identity.widgetSessionId,
    };
    record.trustedIdentity = true;
    if (invocationKey(merged) !== record.snapshot.key) {
      this.rekeyActiveRecord(record, merged);
    } else {
      this.activeKey = record.snapshot.key;
    }
    this.emit();
    return true;
  }

  private getOrCreateBoundRecord(
    identity: ToolInvocationIdentity,
  ): { record: InvocationRecord; created: boolean } {
    const key = invocationKey(identity);
    const existing = this.records.get(key);
    if (existing) {
      existing.trustedIdentity = true;
      return { record: existing, created: false };
    }
    const record = this.createRecord(identity, true);
    this.records.set(key, record);
    this.pruneRecords();
    return { record, created: true };
  }

  private stageBoundMetadata(identity: ToolInvocationIdentity): boolean {
    const { created } = this.getOrCreateBoundRecord(identity);
    // A metadata-only notification proves an identity exists, but cannot
    // safely pair an anonymous legacy output with it before hostContext does.
    return created;
  }

  private stageBoundResult(
    result: unknown,
    metadata: Record<string, unknown> | null,
    identity: ToolInvocationIdentity,
  ): boolean {
    const { record } = this.getOrCreateBoundRecord(identity);
    if (record.snapshot.status === 'cancelled' || record.snapshot.status === 'ready') {
      return false;
    }
    const output = resultOutput(result);
    if (output === null || output === undefined) {
      this.markMalformed(
        record,
        'The host returned no usable output for this tool call. No action was taken.',
      );
      return false;
    }
    this.clearRecordTimeout(record);
    this.update(record, {
      output,
      metadata,
      status: 'ready',
      message: null,
    });
    return true;
  }

  private createRecord(
    identity: ToolInvocationIdentity,
    trustedIdentity: boolean,
  ): InvocationRecord {
    const now = this.clock.now();
    const record: InvocationRecord = {
      snapshot: {
        key: invocationKey(identity),
        identity: { ...identity },
        status: 'waiting',
        input: null,
        output: null,
        metadata: null,
        message: null,
        startedAt: now,
        updatedAt: now,
        timeoutMs: this.timeoutMs,
      },
      trustedIdentity,
      acceptedUnboundLegacyHydration: false,
      legacyWidgetSessionId: null,
      timeoutHandle: null,
    };
    this.scheduleTimeout(record);
    return record;
  }

  private scheduleTimeout(record: InvocationRecord): void {
    this.clearRecordTimeout(record);
    record.timeoutHandle = this.clock.setTimeout(() => {
      if (record.snapshot.status === 'ready' || record.snapshot.status === 'cancelled') return;
      record.timeoutHandle = null;
      this.update(record, {
        status: 'timed_out',
        output: null,
        message: lateResultMessage(this.timeoutMs),
      });
    }, this.timeoutMs);
    const handle = record.timeoutHandle as { unref?: () => void } | null;
    handle?.unref?.();
  }

  private rekeyActiveRecord(
    record: InvocationRecord,
    identity: ToolInvocationIdentity,
  ): void {
    const previousKey = record.snapshot.key;
    const nextKey = invocationKey(identity);
    if (previousKey === nextKey) return;
    this.records.delete(previousKey);
    record.snapshot = {
      ...record.snapshot,
      key: nextKey,
      identity: { ...identity },
      updatedAt: this.clock.now(),
    };
    this.activeKey = nextKey;
    this.records.set(nextKey, record);
  }

  private markMalformed(record: InvocationRecord, message: string): void {
    if (record.snapshot.status === 'timed_out') return;
    this.update(record, {
      status: 'malformed',
      output: null,
      message,
    });
  }

  private update(
    record: InvocationRecord,
    patch: Partial<ToolInvocationLifecycle>,
  ): void {
    record.snapshot = {
      ...record.snapshot,
      ...patch,
      identity: patch.identity
        ? { ...patch.identity }
        : record.snapshot.identity,
      updatedAt: this.clock.now(),
    };
    if (record.snapshot.key === this.activeKey) this.emit();
  }

  private enrichReadyMetadata(
    record: InvocationRecord,
    metadata: Record<string, unknown> | null,
    binding: BindingResult,
  ): boolean {
    if (
      record.snapshot.status !== 'ready'
      || record.snapshot.metadata !== null
      || !metadata
      || binding.kind !== 'valid'
    ) {
      return false;
    }

    if (!record.trustedIdentity) return false;
    if (!sameIdentity(record.snapshot.identity, binding.identity)) return false;

    const expected = record.snapshot.identity;
    const enrichedIdentity = {
      toolName: expected.toolName ?? binding.identity.toolName,
      requestId: expected.requestId ?? binding.identity.requestId,
      widgetSessionId:
        expected.widgetSessionId
        ?? binding.identity.widgetSessionId
        ?? record.legacyWidgetSessionId,
    };
    record.trustedIdentity = true;
    if (invocationKey(enrichedIdentity) !== record.snapshot.key) {
      this.rekeyActiveRecord(record, enrichedIdentity);
    }
    // Metadata may complete a previously accepted compact output, but it can
    // never replace that output or change a terminal lifecycle state.
    this.update(record, { metadata });
    return true;
  }

  private activeRecord(): InvocationRecord {
    const record = this.records.get(this.activeKey);
    if (!record) throw new Error('Active tool invocation is missing');
    return record;
  }

  private clearRecordTimeout(record: InvocationRecord): void {
    if (record.timeoutHandle === null) return;
    this.clock.clearTimeout(record.timeoutHandle);
    record.timeoutHandle = null;
  }

  private pruneRecords(): void {
    while (this.records.size > MAX_RECORDS) {
      const oldestKey = [...this.records.keys()].find((key) => key !== this.activeKey);
      if (!oldestKey) break;
      const oldest = this.records.get(oldestKey);
      if (oldest) this.clearRecordTimeout(oldest);
      this.records.delete(oldestKey);
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
