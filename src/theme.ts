// ── SHARED THEME TOKENS ──────────────────────────────────────────────────────
// Extracted so new features (e.g. the Coding Platform) can reuse the exact
// same design system as the rest of the app instead of re-declaring colors.
//
// 2026-11-24: neo-brutalist editorial pass — paper + navy ink + gold, square
// geometry, 2px borders and hard offset shadows. Colour names are unchanged so
// every existing screen inherits the new palette without code changes.
export const T = {
  // Surfaces — warm paper instead of cool blue-grey
  bg:         '#f4f1e9',
  bgWhite:    '#fffdf7',
  bgLow:      '#ece7da',
  bgMid:      '#e2dcca',
  bgHigh:     '#d7cfba',
  glass:      'rgba(255,253,247,0.88)',
  glassBord:  'rgba(11,27,51,0.9)',

  // Text — navy ink
  txtPri:     '#0b1b33',
  txtSec:     '#3c4657',
  txtMut:     '#6c6455',

  // Primary — deep navy
  primary:    '#0b2545',
  primaryFix: '#ffe3ad',
  primaryFixD:'#f6c96e',
  onPrimFx:   '#1d1503',
  onPrimFxV:  '#241a05',

  // Secondary — placement gold
  gold:       '#fea619',
  goldFixed:  '#ffe3ad',
  goldFixedD: '#f6c96e',
  onGold:     '#241600',

  // Hard edges
  ink:        '#0b1b33',
  paper:      '#f4f1e9',
  border:     '#0b1b33',
  outlineVar: '#b9ae95',
  outline:    '#5f5747',

  // Status
  error:      '#b3261e',
  errCont:    '#ffdad6',
  errorBg:    '#fdecea',
  errorBorder:'#c0392b',
  green:      '#0f6b3f',
  greenBg:    '#e2f2e6',
  amber:      '#8a5300',
  amberBg:    '#fff0cf',
  teal:       '#0f5f66',
  purple:     '#6d28d9',
  info:       '#1d4ed8',
  infoBg:     '#e8eefc',
  infoBorder: '#9fb4e8',

  // Type: bold editorial display + modern grotesque UI
  display:    "'Archivo Black', 'Arial Black', 'Helvetica Neue', Arial, sans-serif",
  sans:       "'Space Grotesk', system-ui, 'Segoe UI', Roboto, sans-serif",
  trackHeading: '-0.03em',
  trackLabel:   '0.12em',

  // Hard shadows (offset, never blurred)
  shadow:     '5px 5px 0 0 #0b1b33',
  shadowGold: '5px 5px 0 0 #fea619',
  shadowSm:   '3px 3px 0 0 #0b1b33',
  shadowLg:   '8px 8px 0 0 #fea619',
}
