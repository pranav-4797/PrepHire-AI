// ── SHARED THEME TOKENS (neo-brutalist: ink borders, hard shadows, gold accent) ──────────────────────────────────────────────────────
// Extracted so new features (e.g. the Coding Platform) can reuse the exact
// same design system as the rest of the app instead of re-declaring colors.
export const T = {
  bg:         '#f7f9fb',
  bgWhite:    '#ffffff',
  bgLow:      '#f2f4f6',
  bgMid:      '#eceef0',
  bgHigh:     '#e6e8ea',
  glass:      'rgba(255,255,255,0.82)',
  glassBord:  '#001e40',

  txtPri:     '#191c1e',
  txtSec:     '#2b3340',
  txtMut:     '#4a5565',

  primary:    '#001e40',
  primaryFix: '#d5e3ff',
  primaryFixD:'#a7c8ff',
  onPrimFx:   '#001b3c',
  onPrimFxV:  '#1f477b',

  gold:       '#fea619',
  goldFixed:  '#ffddb8',
  goldFixedD: '#ffb95f',
  onGold:     '#001e40',

  border:     '#001e40',
  outlineVar: '#001e40',
  outline:    '#4a5565',

  error:      '#ba1a1a',
  errCont:    '#ffdad6',
  errorBg:    '#fef2f2',
  errorBorder:'#f87171',
  green:      '#166534',
  greenBg:    '#dcfce7',
  amber:      '#92400e',
  amberBg:    '#fef3c7',
  teal:       '#0f766e',
  purple:     '#7c3aed',
  info:       '#2563eb',
  infoBg:     '#eff6ff',
  infoBorder: '#bfdbfe',

  // Type: bold editorial display + modern grotesque UI
  display:    "'Archivo Black', 'Arial Black', 'Helvetica Neue', Arial, sans-serif",
  sans:       "'Space Grotesk', system-ui, 'Segoe UI', Roboto, sans-serif",
  trackHeading: '-0.03em',
  trackLabel:   '0.08em',

  // Neo-brutalist helpers: hard offset shadows with zero blur
  ink:        '#001e40',
  shadowSm:   '3px 3px 0 #001e40',
  shadowMd:   '5px 5px 0 #001e40',
  shadowLg:   '8px 8px 0 #001e40',
}
