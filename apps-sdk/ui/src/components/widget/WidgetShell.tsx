import type { CSSProperties, PropsWithChildren, Ref } from 'react';

/**
 * Outermost frame for a widget. Sets the type/color baseline from the
 * design tokens in styles/base.css and provides consistent edge padding.
 *
 * No visual decoration of its own — that lives in widget-specific styles
 * and per-widget composition. Keeping this frame identity-free is what
 * lets us apply a coherent visual language across very different widgets.
 */
export function WidgetShell({
  children,
  style,
  rootRef,
  density = 'comfortable',
  width = 'auto',
}: PropsWithChildren<{
  style?: CSSProperties;
  rootRef?: Ref<HTMLDivElement>;
  density?: 'comfortable' | 'compact';
  /**
   * `auto` lets content size dictate width (good in narrow side panels).
   * `full` stretches to host iframe width.
   * `narrow` clamps to a readable max for prose-heavy widgets.
   */
  width?: 'auto' | 'full' | 'narrow';
}>) {
  return (
    <div
      ref={rootRef}
      className="dx-widget"
      data-density={density}
      data-width={width}
      style={style}
    >
      {children}
    </div>
  );
}
