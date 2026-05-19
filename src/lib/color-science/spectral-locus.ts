/**
 * CIE 1931 Spectral Locus chromaticity coordinates
 * Pre-computed lookup table at 5nm intervals (380nm - 780nm, 81 points)
 * Sources: CIE 1931 2-degree standard observer data
 */

/** Single point: wavelength(nm), x, y chromaticity */
export interface SpectralPoint {
  wavelength: number;
  x: number;
  y: number;
}

/**
 * CIE 1931 2° observer spectral locus data at 5nm intervals
 */
export const SPECTRAL_LOCUS_DATA: SpectralPoint[] = [
  { wavelength: 380, x: 0.1741, y: 0.0050 },
  { wavelength: 385, x: 0.1740, y: 0.0050 },
  { wavelength: 390, x: 0.1738, y: 0.0049 },
  { wavelength: 395, x: 0.1733, y: 0.0049 },
  { wavelength: 400, x: 0.1733, y: 0.0048 },
  { wavelength: 405, x: 0.1730, y: 0.0048 },
  { wavelength: 410, x: 0.1726, y: 0.0048 },
  { wavelength: 415, x: 0.1721, y: 0.0051 },
  { wavelength: 420, x: 0.1714, y: 0.0051 },
  { wavelength: 425, x: 0.1703, y: 0.0058 },
  { wavelength: 430, x: 0.1689, y: 0.0069 },
  { wavelength: 435, x: 0.1669, y: 0.0086 },
  { wavelength: 440, x: 0.1644, y: 0.0109 },
  { wavelength: 445, x: 0.1611, y: 0.0138 },
  { wavelength: 450, x: 0.1566, y: 0.0177 },
  { wavelength: 455, x: 0.1510, y: 0.0227 },
  { wavelength: 460, x: 0.1440, y: 0.0297 },
  { wavelength: 465, x: 0.1355, y: 0.0399 },
  { wavelength: 470, x: 0.1241, y: 0.0578 },
  { wavelength: 475, x: 0.1096, y: 0.0868 },
  { wavelength: 480, x: 0.0913, y: 0.1327 },
  { wavelength: 485, x: 0.0687, y: 0.2007 },
  { wavelength: 490, x: 0.0454, y: 0.2950 },
  { wavelength: 495, x: 0.0235, y: 0.4127 },
  { wavelength: 500, x: 0.0049, y: 0.5384 },
  { wavelength: 505, x: 0.0039, y: 0.6548 },
  { wavelength: 510, x: 0.0093, y: 0.7502 },
  { wavelength: 515, x: 0.0291, y: 0.8120 },
  { wavelength: 520, x: 0.0633, y: 0.8338 },
  { wavelength: 525, x: 0.1096, y: 0.8262 },
  { wavelength: 530, x: 0.1655, y: 0.7920 },
  { wavelength: 535, x: 0.2257, y: 0.7393 },
  { wavelength: 540, x: 0.2904, y: 0.6727 },
  { wavelength: 545, x: 0.3514, y: 0.6049 },
  { wavelength: 550, x: 0.4087, y: 0.5351 },
  { wavelength: 555, x: 0.4580, y: 0.4722 },
  { wavelength: 560, x: 0.4972, y: 0.4187 },
  { wavelength: 565, x: 0.5271, y: 0.3725 },
  { wavelength: 570, x: 0.5502, y: 0.3320 },
  { wavelength: 575, x: 0.5680, y: 0.2974 },
  { wavelength: 580, x: 0.5806, y: 0.2673 },
  { wavelength: 585, x: 0.5895, y: 0.2415 },
  { wavelength: 590, x: 0.5952, y: 0.2190 },
  { wavelength: 595, x: 0.5987, y: 0.1982 },
  { wavelength: 600, x: 0.6005, y: 0.1791 },
  { wavelength: 605, x: 0.6008, y: 0.1606 },
  { wavelength: 610, x: 0.5998, y: 0.1432 },
  { wavelength: 615, x: 0.5977, y: 0.1267 },
  { wavelength: 620, x: 0.5945, y: 0.1109 },
  { wavelength: 625, x: 0.5906, y: 0.0961 },
  { wavelength: 630, x: 0.5857, y: 0.0822 },
  { wavelength: 635, x: 0.5802, y: 0.0694 },
  { wavelength: 640, x: 0.5742, y: 0.0578 },
  { wavelength: 645, x: 0.5678, y: 0.0473 },
  { wavelength: 650, x: 0.5611, y: 0.0378 },
  { wavelength: 655, x: 0.5542, y: 0.0295 },
  { wavelength: 660, x: 0.5472, y: 0.0222 },
  { wavelength: 665, x: 0.5401, y: 0.0160 },
  { wavelength: 670, x: 0.5331, y: 0.0109 },
  { wavelength: 675, x: 0.5262, y: 0.0068 },
  { wavelength: 680, x: 0.5195, y: 0.0038 },
  { wavelength: 685, x: 0.5131, y: 0.0018 },
  { wavelength: 690, x: 0.5070, y: 0.0008 },
  { wavelength: 695, x: 0.5013, y: 0.0003 },
  { wavelength: 700, x: 0.4958, y: 0.0001 },
  { wavelength: 705, x: 0.4907, y: 0.0000 },
  { wavelength: 710, x: 0.4858, y: 0.0000 },
  { wavelength: 715, x: 0.4811, y: 0.0000 },
  { wavelength: 720, x: 0.4766, y: 0.0000 },
  { wavelength: 725, x: 0.4723, y: 0.0000 },
  { wavelength: 730, x: 0.4682, y: 0.0000 },
  { wavelength: 735, x: 0.4642, y: 0.0000 },
  { wavelength: 740, x: 0.4604, y: 0.0000 },
  { wavelength: 745, x: 0.4568, y: 0.0000 },
  { wavelength: 750, x: 0.4533, y: 0.0000 },
  { wavelength: 755, x: 0.4499, y: 0.0000 },
  { wavelength: 760, x: 0.4466, y: 0.0000 },
  { wavelength: 765, x: 0.4435, y: 0.0000 },
  { wavelength: 770, x: 0.4405, y: 0.0000 },
  { wavelength: 775, x: 0.4376, y: 0.0000 },
  { wavelength: 780, x: 0.4348, y: 0.0000 },
];

/**
 * Get interpolated spectral locus at 1nm resolution for smooth rendering
 */
export function getSpectralLocus1nm(): SpectralPoint[] {
  const result: SpectralPoint[] = [];
  for (let wl = 380; wl <= 780; wl++) {
    // Find bracketing entries in the 5nm table
    const idx = Math.floor((wl - 380) / 5);
    const frac = (wl - 380) / 5 - idx;
    const p0 = SPECTRAL_LOCUS_DATA[Math.min(idx, SPECTRAL_LOCUS_DATA.length - 1)];
    const p1 = SPECTRAL_LOCUS_DATA[Math.min(idx + 1, SPECTRAL_LOCUS_DATA.length - 1)];
    result.push({
      wavelength: wl,
      x: p0.x + frac * (p1.x - p0.x),
      y: p0.y + frac * (p1.y - p0.y),
    });
  }
  return result;
}

/**
 * Generate SVG path data string for the spectral locus (horseshoe outline)
 * @param width SVG viewBox width
 * @param height SVG viewBox height
 * @param padX optional x-axis padding
 * @param padY optional y-axis padding
 */
export function spectralLocusSVGPath(
  width: number,
  height: number,
  padX = 0,
  padY = 0
): string {
  const points = getSpectralLocus1nm();
  const drawW = width - 2 * padX;
  const drawH = height - 2 * padY;

  return points
    .map((p) => {
      const sx = padX + p.x * drawW;
      const sy = padY + (1 - p.y) * drawH;
      return `${sx.toFixed(2)},${sy.toFixed(2)}`;
    })
    .join(' ');
}

/**
 * Generate SVG path data for the Planckian locus
 */
export function planckianLocusSVGPath(
  width: number,
  height: number,
  minK = 1000,
  maxK = 10000,
  numPoints = 80,
  padX = 0,
  padY = 0
): string {
  const drawW = width - 2 * padX;
  const drawH = height - 2 * padY;
  const logMin = Math.log10(minK);
  const logMax = Math.log10(maxK);
  const pts: string[] = [];

  // Low-temp lookup table (< 1667K) — same as calibration.ts LOW_TEMP_LOCUS
  const LOW_TBL: [number, number, number][] = [
    [1000, 0.6468, 0.3536],
    [1100, 0.6182, 0.3714],
    [1200, 0.5966, 0.3855],
    [1300, 0.5802, 0.3958],
    [1400, 0.5673, 0.4037],
    [1500, 0.5572, 0.4098],
    [1667, 0.5418, 0.4184],
  ];

  function locusXY(k: number): { x: number; y: number } {
    if (k < 1667) {
      let idx = 0;
      for (; idx < LOW_TBL.length - 1; idx++) {
        if (k <= LOW_TBL[idx + 1][0]) break;
      }
      const [t0, x0, y0] = LOW_TBL[idx];
      const [t1, x1, y1] = LOW_TBL[Math.min(idx + 1, LOW_TBL.length - 1)];
      const f = (k - t0) / (t1 - t0);
      return { x: x0 + f * (x1 - x0), y: y0 + f * (y1 - y0) };
    }
    const k2 = k * k;
    const k3 = k2 * k;
    const x = k <= 4000
      ? -0.2661239e9 / k3 - 0.2343589e6 / k2 + 0.8776956e3 / k + 0.179910
      : -3.0258469e9 / k3 + 2.1070379e6 / k2 + 0.2226347e3 / k + 0.240390;
    let y: number;
    if (k <= 2222) {
      y = -1.1063814 * x * x * x - 1.34811020 * x * x + 2.18555832 * x - 0.20219683;
    } else if (k <= 4000) {
      y = -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867;
    } else {
      y = 3.0817580 * x * x * x - 5.87338670 * x * x + 3.75112997 * x - 0.37001483;
    }
    return { x, y };
  }

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const k = Math.pow(10, logMin + t * (logMax - logMin));
    const { x, y } = locusXY(k);
    const sx = padX + x * drawW;
    const sy = padY + (1 - y) * drawH;
    pts.push(`${sx.toFixed(2)},${sy.toFixed(2)}`);
  }

  return pts.join(' ');
}
