/**
 * Adapted from https://github.com/openai/openai-apps-sdk-examples
 */

export type UnknownObject = Record<string, unknown>;

export type DisplayMode = 'pip' | 'inline' | 'fullscreen';

export type RequestDisplayMode = (args: { mode: DisplayMode }) => Promise<{ mode: DisplayMode }>;

export type Theme = 'light' | 'dark';

export type SafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type SafeArea = {
  insets: SafeAreaInsets;
};

export type HostStyleContext = {
  variables?: Record<string, string>;
  css?: {
    fonts?: string;
  };
};

export type HostContainerDimensions = {
  width?: number;
  maxWidth?: number;
  height?: number;
  maxHeight?: number;
};

export type AdaptiveHostContext = {
  theme: Theme;
  displayMode: DisplayMode;
  availableDisplayModes: DisplayMode[];
  containerDimensions?: HostContainerDimensions;
  locale?: string;
  timeZone?: string;
  platform?: 'web' | 'desktop' | 'mobile';
  deviceCapabilities?: {
    touch?: boolean;
    hover?: boolean;
  };
  safeAreaInsets: SafeAreaInsets;
  styles?: HostStyleContext;
};

export type AdaptiveHostCapabilities = {
  callTool: boolean;
  openExternal: boolean;
  requestDisplayMode: boolean;
  updateModelContext: boolean;
  sendFollowUpMessage: boolean;
  downloadFile: boolean;
  widgetState: boolean;
};

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export type UserAgent = {
  device: { type: DeviceType };
  capabilities: {
    hover: boolean;
    touch: boolean;
  };
};

export type ToolResultContent = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type CallToolResult<
  StructuredContent = unknown,
  Meta = UnknownObject,
> = {
  /**
   * Backward-compatible text projection. New consumers should prefer
   * structuredContent and inspect isError.
   */
  result: string;
  structuredContent?: StructuredContent;
  content?: ToolResultContent[];
  _meta?: Meta;
  isError?: boolean;
  [key: string]: unknown;
};

export type CallTool = (
  name: string,
  args: Record<string, unknown>,
) => Promise<CallToolResult>;

export type OpenAIGlobals<
  ToolInput = UnknownObject,
  ToolOutput = UnknownObject,
  ToolResponseMetadata = UnknownObject,
  WidgetState = UnknownObject
> = {
  theme: Theme;
  userAgent: UserAgent;
  locale: string;
  maxHeight: number;
  displayMode: DisplayMode;
  safeArea: SafeArea;
  toolInput: ToolInput;
  toolOutput: ToolOutput | null;
  toolResponseMetadata: ToolResponseMetadata | null;
  widgetState: WidgetState | null;
  setWidgetState: (state: WidgetState) => Promise<void>;
  notifyIntrinsicHeight?: (args: { height: number }) => void;
  callTool: CallTool;
  sendFollowUpMessage: (args: { prompt: string; scrollToBottom?: boolean }) => Promise<void>;
  openExternal: (payload: { href: string }) => void;
  requestDisplayMode: RequestDisplayMode;
  updateModelContext?: (args: {
    content?: ToolResultContent[];
    structuredContent?: UnknownObject;
  }) => Promise<void>;
  downloadFile?: (args: {
    contents: UnknownObject[];
  }) => Promise<{ isError?: boolean } | void>;
  apps?: {
    registerComponent?: (name: string, renderer: (props: unknown) => string | HTMLElement) => void;
  };
};

export const SET_GLOBALS_EVENT_TYPE = 'openai:set_globals';

export class SetGlobalsEvent extends CustomEvent<{ globals: Partial<OpenAIGlobals> }> {
  readonly type = SET_GLOBALS_EVENT_TYPE;
}

declare global {
  interface Window {
    openai: OpenAIGlobals;
    registerComponent?: (name: string, renderer: (props: unknown) => string | HTMLElement) => void;
    __isChatGptApp?: boolean;
  }

  interface WindowEventMap {
    [SET_GLOBALS_EVENT_TYPE]: SetGlobalsEvent;
  }
}
