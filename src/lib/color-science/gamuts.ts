/**
 * Standard color gamut definitions
 * Each gamut defines primaries (R, G, B) and white point in CIE xy coordinates
 */

export interface GamutPrimaries {
  name: string;
  red: { x: number; y: number };
  green: { x: number; y: number };
  blue: { x: number; y: number };
  white: { x: number; y: number };
  description?: string;
}

export const STANDARD_GAMUTS: Record<string, GamutPrimaries> = {
  sRGB: {
    name: 'sRGB',
    red: { x: 0.64, y: 0.33 },
    green: { x: 0.30, y: 0.60 },
    blue: { x: 0.15, y: 0.06 },
    white: { x: 0.3127, y: 0.3290 },
    description: 'Standard RGB for web and general displays'
  },
  DCI_P3: {
    name: 'DCI-P3',
    red: { x: 0.68, y: 0.32 },
    green: { x: 0.265, y: 0.69 },
    blue: { x: 0.15, y: 0.06 },
    white: { x: 0.314, y: 0.351 },
    description: 'DCI-P3 (theatrical white point)'
  },
  D65_P3: {
    name: 'D65-P3',
    red: { x: 0.68, y: 0.32 },
    green: { x: 0.265, y: 0.69 },
    blue: { x: 0.15, y: 0.06 },
    white: { x: 0.3127, y: 0.3290 },
    description: 'Display P3 (D65 white point, Apple, wide-gamut monitors)'
  },
  D60_P3: {
    name: 'D60-P3',
    red: { x: 0.68, y: 0.32 },
    green: { x: 0.265, y: 0.69 },
    blue: { x: 0.15, y: 0.06 },
    white: { x: 0.3217, y: 0.3378 },
    description: 'P3 D60 (D60 illuminant white point)'
  },
  Rec2020: {
    name: 'Rec.2020',
    red: { x: 0.708, y: 0.292 },
    green: { x: 0.170, y: 0.797 },
    blue: { x: 0.131, y: 0.046 },
    white: { x: 0.3127, y: 0.3290 },
    description: 'ITU-R BT.2020, ultra-wide gamut for HDR'
  },
  AdobeRGB: {
    name: 'Adobe RGB (1998)',
    red: { x: 0.64, y: 0.33 },
    green: { x: 0.21, y: 0.71 },
    blue: { x: 0.15, y: 0.06 },
    white: { x: 0.3127, y: 0.3290 },
    description: 'Adobe RGB (1998), professional photography'
  },
  Rec709: {
    name: 'Rec.709',
    red: { x: 0.64, y: 0.33 },
    green: { x: 0.30, y: 0.60 },
    blue: { x: 0.15, y: 0.06 },
    white: { x: 0.3127, y: 0.3290 },
    description: 'ITU-R BT.709, HDTV standard (same primaries as sRGB)'
  },
  Rec601_525: {
    name: 'Rec.601 (525)',
    red: { x: 0.630, y: 0.340 },
    green: { x: 0.310, y: 0.595 },
    blue: { x: 0.155, y: 0.070 },
    white: { x: 0.3127, y: 0.3290 },
    description: 'ITU-R BT.601 (525-line, NTSC-based)'
  },
  Rec601_625: {
    name: 'Rec.601 (625)',
    red: { x: 0.640, y: 0.330 },
    green: { x: 0.290, y: 0.600 },
    blue: { x: 0.150, y: 0.060 },
    white: { x: 0.3127, y: 0.3290 },
    description: 'ITU-R BT.601 (625-line, PAL-based)'
  },
  DCI: {
    name: 'DCI (D65 white)',
    red: { x: 0.7347, y: 0.2653 },
    green: { x: 0.0, y: 1.0 },
    blue: { x: 0.0001, y: -0.077 },
    white: { x: 0.3127, y: 0.3290 },
    description: 'DCI with D65 white point adaptation'
  },
  PAL_SECAM: {
    name: 'PAL/SECAM',
    red: { x: 0.64, y: 0.33 },
    green: { x: 0.29, y: 0.60 },
    blue: { x: 0.15, y: 0.06 },
    white: { x: 0.3127, y: 0.3290 },
    description: 'PAL/SECAM television standard'
  },
  NTSC_1953: {
    name: 'NTSC (1953)',
    red: { x: 0.67, y: 0.33 },
    green: { x: 0.21, y: 0.71 },
    blue: { x: 0.14, y: 0.08 },
    white: { x: 0.310, y: 0.316 },
    description: 'Original NTSC (1953) standard'
  },
  CIE_RGB: {
    name: 'CIE RGB',
    red: { x: 0.7347, y: 0.2653 },
    green: { x: 0.2738, y: 0.7174 },
    blue: { x: 0.1666, y: 0.0089 },
    white: { x: 0.3127, y: 0.3290 },
    description: 'CIE RGB color space'
  },
  ProPhoto: {
    name: 'ProPhoto RGB',
    red: { x: 0.7347, y: 0.2653 },
    green: { x: 0.1596, y: 0.8404 },
    blue: { x: 0.0366, y: 0.0001 },
    white: { x: 0.3457, y: 0.3585 },
    description: 'ProPhoto RGB, wide gamut for photography (D50)'
  },
};

export function getGamutNames(): string[] {
  return Object.keys(STANDARD_GAMUTS);
}

export function getGamut(name: string): GamutPrimaries | undefined {
  return STANDARD_GAMUTS[name];
}
