import type {
  AdaptiveHostCapabilities,
  AdaptiveHostContext,
  DisplayMode,
  SafeAreaInsets,
} from './types';

export const ZERO_SAFE_AREA: SafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export function createDefaultHostContext(): AdaptiveHostContext {
  return {
    theme: 'dark',
    displayMode: 'inline',
    availableDisplayModes: ['inline'],
    safeAreaInsets: ZERO_SAFE_AREA,
  };
}

export function createDefaultCapabilities(): AdaptiveHostCapabilities {
  return {
    callTool: false,
    openExternal: false,
    requestDisplayMode: false,
    updateModelContext: false,
    sendFollowUpMessage: false,
    downloadFile: false,
    widgetState: false,
  };
}

export function normalizeMcpToolInput(params: unknown): unknown {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
  const record = params as Record<string, unknown>;
  return record.arguments ?? params;
}

export function normalizeMcpHostContext(
  value: Record<string, unknown> | null | undefined,
  previous: AdaptiveHostContext = createDefaultHostContext(),
): AdaptiveHostContext {
  const context = value ?? {};
  const containerDimensions =
    context.containerDimensions && typeof context.containerDimensions === 'object'
      ? context.containerDimensions as AdaptiveHostContext['containerDimensions']
      : previous.containerDimensions;
  const deviceCapabilities =
    context.deviceCapabilities && typeof context.deviceCapabilities === 'object'
      ? context.deviceCapabilities as AdaptiveHostContext['deviceCapabilities']
      : previous.deviceCapabilities;
  const safeAreaInsets =
    context.safeAreaInsets && typeof context.safeAreaInsets === 'object'
      ? {
          ...previous.safeAreaInsets,
          ...context.safeAreaInsets as Partial<SafeAreaInsets>,
        }
      : previous.safeAreaInsets;
  const styles =
    context.styles && typeof context.styles === 'object'
      ? context.styles as AdaptiveHostContext['styles']
      : previous.styles;
  const availableDisplayModes = Array.isArray(context.availableDisplayModes)
    ? context.availableDisplayModes.filter(
        (mode): mode is DisplayMode =>
          mode === 'inline' || mode === 'fullscreen' || mode === 'pip',
      )
    : previous.availableDisplayModes;

  return {
    ...previous,
    ...(context.theme === 'light' || context.theme === 'dark'
      ? { theme: context.theme }
      : {}),
    ...(context.displayMode === 'inline'
      || context.displayMode === 'fullscreen'
      || context.displayMode === 'pip'
      ? { displayMode: context.displayMode }
      : {}),
    availableDisplayModes: availableDisplayModes.length
      ? availableDisplayModes
      : previous.availableDisplayModes,
    containerDimensions,
    locale: typeof context.locale === 'string' ? context.locale : previous.locale,
    timeZone: typeof context.timeZone === 'string' ? context.timeZone : previous.timeZone,
    platform:
      context.platform === 'web'
      || context.platform === 'desktop'
      || context.platform === 'mobile'
        ? context.platform
        : previous.platform,
    deviceCapabilities,
    safeAreaInsets,
    styles,
  };
}

function supportsTextModality(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && 'text' in value,
  );
}

export function normalizeMcpCapabilities(
  capabilities: object | null | undefined,
  hostContext: AdaptiveHostContext,
): AdaptiveHostCapabilities {
  const value = (capabilities ?? {}) as Record<string, unknown>;
  return {
    callTool: Boolean(value.serverTools),
    openExternal: Boolean(value.openLinks),
    requestDisplayMode: hostContext.availableDisplayModes.length > 1,
    updateModelContext: supportsTextModality(value.updateModelContext),
    sendFollowUpMessage: supportsTextModality(value.message),
    downloadFile: Boolean(value.downloadFile),
    widgetState: false,
  };
}
