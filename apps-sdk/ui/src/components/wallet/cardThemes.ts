/*
 * The three finished Dexter card designs (mirrors dexter-fe app/lib/cardThemes.ts).
 * Reused here for the widget card face. When dextercard becomes a shared package,
 * both copies collapse into it (tracked drift — board #94/#95).
 */
export type CardThemeId = 'orange' | 'obsidian' | 'moonagents';

export type CardTheme = {
  id: CardThemeId;
  label: string;
  /** CSS background stack for the card face. */
  background: string;
  /** Ink color for brand text, chip caption, PAN, holder. */
  ink: string;
  network: 'visa' | 'mastercard';
};

export const CARD_THEMES: Record<CardThemeId, CardTheme> = {
  orange: {
    id: 'orange',
    label: 'Original',
    background: `radial-gradient(ellipse 120% 80% at 0% 0%, rgba(255,180,110,.45) 0%, transparent 55%),
      radial-gradient(ellipse 80% 60% at 100% 100%, rgba(255,60,0,.45) 0%, transparent 60%),
      linear-gradient(135deg, #ff8a3a 0%, #f26b1a 35%, #c84510 75%, #8a2c08 100%)`,
    ink: '#ffffff',
    network: 'visa',
  },
  obsidian: {
    id: 'obsidian',
    label: 'Obsidian',
    background: `radial-gradient(ellipse 110% 70% at 8% 8%, rgba(60,50,40,.55) 0%, transparent 60%),
      radial-gradient(ellipse 90% 70% at 92% 92%, rgba(20,24,32,.85) 0%, transparent 65%),
      linear-gradient(135deg, #1a1a1c 0%, #121214 35%, #0a0a0c 70%, #050506 100%)`,
    ink: '#d4b87e',
    network: 'visa',
  },
  moonagents: {
    id: 'moonagents',
    label: 'MoonAgents',
    background: `radial-gradient(ellipse 100% 70% at 88% 12%, rgba(180,200,230,.18) 0%, transparent 55%),
      radial-gradient(ellipse 90% 70% at 8% 92%, rgba(10,14,24,.85) 0%, transparent 65%),
      linear-gradient(135deg, #2a3548 0%, #1c2434 35%, #131826 70%, #0a0d18 100%)`,
    ink: '#c8d4e8',
    network: 'mastercard',
  },
};

export const CARD_THEME_ORDER: CardThemeId[] = ['orange', 'obsidian', 'moonagents'];
