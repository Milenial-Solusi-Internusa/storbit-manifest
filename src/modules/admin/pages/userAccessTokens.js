// src/modules/admin/pages/userAccessTokens.js
// Non-component shared values for the User Access pages (design tokens, role
// maps, helpers). Kept in a plain .js file so the companion userAccessShared.jsx
// can export ONLY components (Fast Refresh / react-refresh requirement).

// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────

export const PASTEL = {
  ink:          '#2D2A28',
  inkSoft:      '#5C5550',
  inkMute:      '#9C948D',
  line:         '#EDE6DC',
  lineSoft:     '#F5EFE5',
  mint:         '#C8EFD9',
  mintDeep:     '#7FC9A0',
  rose:         '#F5C8D5',
  roseDeep:     '#D89AB0',
  lavender:     '#D8C5F0',
  lavenderDeep: '#A98FD8',
  sky:          '#C8E4F5',
  skyDeep:      '#8FBCD8',
  peach:        '#FFD4B8',
  peachDeep:    '#F5A78F',
  butter:       '#FFE9B8',
  butterDeep:   '#E8C168',
};

export const NAVY   = '#1B4D8A';
export const ORANGE = '#E85A1E';
export const RED    = '#DC2626';

export const LEGACY_ROLES = [
  { value: 'super',       label: 'Super Admin' },
  { value: 'operations',  label: 'Operations' },      // renamed from 'logistic'
  { value: 'procurement', label: 'Procurement' },
  { value: 'finance',     label: 'Finance' },
  { value: 'management',  label: 'Management' },
];

export const LEGACY_ROLE_COLOR = {
  super:       PASTEL.peachDeep,
  operations:  PASTEL.skyDeep,    // renamed from 'logistic'
  procurement: PASTEL.lavenderDeep,
  finance:     PASTEL.mintDeep,
  management:  PASTEL.butterDeep,
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

export function getPrimaryErpRole(userRoles) {
  return (userRoles || []).find((ur) => ur.is_active) || null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Preferred display order for permission-matrix action columns
export const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'print'];
