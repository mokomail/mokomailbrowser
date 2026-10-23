'use strict';

/**
 * Material 3 — построение цветовой схемы из опорного цвета (seed).
 *
 * Реализована компактная версия тональных палитр Material 3 на основе
 * перцептивного пространства CIE LCh (близко к HCT): из цвета-семени
 * строится тональный ряд (tone 0…100 = светлота L*), из которого затем
 * берутся роли цвета (primary, surface, outline и т.д.) для светлой и
 * тёмной темы. Насыщенность автоматически уменьшается, если цвет выходит
 * за пределы sRGB (гамма-отображение).
 */
(function () {
  window.BP = window.BP || {};

  // ── Преобразования цвета ───────────────────────────────────────────────
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  function hexToRgb(hex) {
    let value = String(hex || '').trim().replace(/^#/, '');
    if (value.length === 3) value = value.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(value)) value = '6c8cff';
    const num = parseInt(value, 16);
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
  }

  function rgbToHex(rgb) {
    const to255 = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
    return `#${to255(rgb[0])}${to255(rgb[1])}${to255(rgb[2])}`;
  }

  const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

  // sRGB ↔ XYZ (D65)
  function rgbToXyz(rgb) {
    const r = srgbToLinear(rgb[0]);
    const g = srgbToLinear(rgb[1]);
    const b = srgbToLinear(rgb[2]);
    return [
      r * 0.4124 + g * 0.3576 + b * 0.1805,
      r * 0.2126 + g * 0.7152 + b * 0.0722,
      r * 0.0193 + g * 0.1192 + b * 0.9505,
    ];
  }

  function xyzToRgb(xyz) {
    const [x, y, z] = xyz;
    return [
      linearToSrgb(x * 3.2406 + y * -1.5372 + z * -0.4986),
      linearToSrgb(x * -0.9689 + y * 1.8758 + z * 0.0415),
      linearToSrgb(x * 0.0557 + y * -0.204 + z * 1.057),
    ];
  }

  const WHITE = [0.95047, 1.0, 1.08883];

  function xyzToLab(xyz) {
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(xyz[0] / WHITE[0]);
    const fy = f(xyz[1] / WHITE[1]);
    const fz = f(xyz[2] / WHITE[2]);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function labToXyz(lab) {
    const fy = (lab[0] + 16) / 116;
    const fx = fy + lab[1] / 500;
    const fz = fy - lab[2] / 200;
    const finv = (t) => {
      const t3 = t * t * t;
      return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
    };
    return [finv(fx) * WHITE[0], finv(fy) * WHITE[1], finv(fz) * WHITE[2]];
  }

  function labToLch(lab) {
    const c = Math.sqrt(lab[1] ** 2 + lab[2] ** 2);
    let h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
    if (h < 0) h += 360;
    return [lab[0], c, h];
  }

  function lchToLab([l, c, h]) {
    const rad = (h * Math.PI) / 180;
    return [l, Math.cos(rad) * c, Math.sin(rad) * c];
  }

  const inGamut = (rgb) => rgb.every((v) => v >= -0.002 && v <= 1.002);

  /** Цвет из LCh с гамма-отображением в sRGB (понижаем насыщенность). */
  function lchToHex([l, c, h]) {
    if (l <= 0) return '#000000';
    if (l >= 100) return '#ffffff';
    let rgb = xyzToRgb(labToXyz(lchToLab([l, c, h])));
    if (!inGamut(rgb)) {
      let lo = 0;
      let hi = c;
      for (let i = 0; i < 26; i += 1) {
        const mid = (lo + hi) / 2;
        if (inGamut(xyzToRgb(labToXyz(lchToLab([l, mid, h]))))) lo = mid;
        else hi = mid;
      }
      rgb = xyzToRgb(labToXyz(lchToLab([l, lo, h])));
    }
    return rgbToHex(rgb);
  }

  /** Насыщенность семени (ограниченная) и его оттенок. */
  function seedInfo(hex) {
    const [, c, h] = labToLch(xyzToLab(rgbToXyz(hexToRgb(hex))));
    return { chroma: c, hue: h };
  }

  /** Тональная палитра: tone → цвет. */
  function tone(hue, chroma) {
    return (t) => lchToHex([t, chroma, hue]);
  }

  // ── Роли цвета ─────────────────────────────────────────────────────────
  function buildScheme(seedHex) {
    const { chroma, hue } = seedInfo(seedHex);
    const pChroma = Math.min(56, Math.max(36, chroma)); // основной — насыщенный
    const sChroma = 16;
    const tChroma = 24;
    const nChroma = 4; // нейтральный
    const nvChroma = 8; // нейтрально-вариантный
    const eHue = 27; // «красный» Material
    const eChroma = 48;

    const P = tone(hue, pChroma);
    const S = tone(hue, sChroma);
    const T = tone((hue + 60) % 360, tChroma);
    const N = tone(hue, nChroma);
    const V = tone(hue, nvChroma);
    const E = tone(eHue, eChroma);

    const light = {
      primary: P(40),
      onPrimary: P(100),
      primaryContainer: P(90),
      onPrimaryContainer: P(10),
      secondary: S(40),
      onSecondary: S(100),
      secondaryContainer: S(90),
      onSecondaryContainer: S(10),
      tertiary: T(40),
      onTertiary: T(100),
      tertiaryContainer: T(90),
      onTertiaryContainer: T(10),
      error: E(40),
      onError: E(100),
      errorContainer: E(90),
      onErrorContainer: E(10),
      surface: N(98),
      surfaceDim: N(87),
      surfaceBright: N(98),
      surfaceContainerLowest: N(100),
      surfaceContainerLow: N(96),
      surfaceContainer: N(94),
      surfaceContainerHigh: N(92),
      surfaceContainerHighest: N(90),
      onSurface: N(10),
      onSurfaceVariant: V(30),
      outline: V(50),
      outlineVariant: V(80),
      inverseSurface: N(20),
      inverseOnSurface: N(95),
      inversePrimary: P(80),
      scrim: N(0),
      shadow: N(0),
    };

    const dark = {
      primary: P(80),
      onPrimary: P(20),
      primaryContainer: P(30),
      onPrimaryContainer: P(90),
      secondary: S(80),
      onSecondary: S(20),
      secondaryContainer: S(30),
      onSecondaryContainer: S(90),
      tertiary: T(80),
      onTertiary: T(20),
      tertiaryContainer: T(30),
      onTertiaryContainer: T(90),
      error: E(80),
      onError: E(20),
      errorContainer: E(30),
      onErrorContainer: E(90),
      surface: N(6),
      surfaceDim: N(6),
      surfaceBright: N(24),
      surfaceContainerLowest: N(4),
      surfaceContainerLow: N(10),
      surfaceContainer: N(12),
      surfaceContainerHigh: N(17),
      surfaceContainerHighest: N(22),
      onSurface: N(90),
      onSurfaceVariant: V(80),
      outline: V(60),
      outlineVariant: V(30),
      inverseSurface: N(90),
      inverseOnSurface: N(20),
      inversePrimary: P(40),
      scrim: N(0),
      shadow: N(0),
    };

    return { light, dark, hue, chroma };
  }

  /** Семантические цвета, которых нет в палитре Material. */
  function semantics(mode) {
    if (mode === 'light') {
      return { ok: '#1f8a4c', warn: '#a2670a', shadow: '0 24px 60px rgba(15,23,42,.18)', shadowSm: '0 8px 24px rgba(15,23,42,.12)' };
    }
    return { ok: '#6ed49b', warn: '#f2c14e', shadow: '0 24px 60px rgba(0,0,0,.6)', shadowSm: '0 8px 24px rgba(0,0,0,.45)' };
  }

  const cache = new Map();
  function scheme(seedHex) {
    const key = String(seedHex || '').toLowerCase();
    if (!cache.has(key)) cache.set(key, buildScheme(key));
    return cache.get(key);
  }

  /** Ставит CSS-переменные Material 3 и «старые» семантические переменные. */
  function apply(mode, seedHex) {
    const body = document.body;
    if (!body) return null;
    const resolved = mode === 'light' ? 'light' : 'dark';
    const s = scheme(seedHex)[resolved];
    const sem = semantics(resolved);

    const vars = {
      '--md-primary': s.primary,
      '--md-on-primary': s.onPrimary,
      '--md-primary-container': s.primaryContainer,
      '--md-on-primary-container': s.onPrimaryContainer,
      '--md-secondary': s.secondary,
      '--md-on-secondary': s.onSecondary,
      '--md-secondary-container': s.secondaryContainer,
      '--md-on-secondary-container': s.onSecondaryContainer,
      '--md-tertiary': s.tertiary,
      '--md-tertiary-container': s.tertiaryContainer,
      '--md-on-tertiary-container': s.onTertiaryContainer,
      '--md-error': s.error,
      '--md-on-error': s.onError,
      '--md-error-container': s.errorContainer,
      '--md-on-error-container': s.onErrorContainer,
      '--md-surface': s.surface,
      '--md-surface-dim': s.surfaceDim,
      '--md-surface-bright': s.surfaceBright,
      '--md-surface-container-lowest': s.surfaceContainerLowest,
      '--md-surface-container-low': s.surfaceContainerLow,
      '--md-surface-container': s.surfaceContainer,
      '--md-surface-container-high': s.surfaceContainerHigh,
      '--md-surface-container-highest': s.surfaceContainerHighest,
      '--md-on-surface': s.onSurface,
      '--md-on-surface-variant': s.onSurfaceVariant,
      '--md-outline': s.outline,
      '--md-outline-variant': s.outlineVariant,
      '--md-inverse-surface': s.inverseSurface,
      '--md-inverse-on-surface': s.inverseOnSurface,
      '--md-inverse-primary': s.inversePrimary,
      '--md-scrim': s.scrim,

      // Совместимость с прежними именами переменных интерфейса
      '--accent': s.primary,
      '--accent-soft': `color-mix(in srgb, ${s.primary} 16%, transparent)`,
      '--on-accent': s.onPrimary,
      '--bg': s.surface,
      '--bg-chrome': s.surfaceContainer,
      '--bg-elev': s.surfaceContainerHigh,
      '--bg-elev-2': s.surfaceContainerHighest,
      '--bg-input': s.surfaceContainerHighest,
      '--bg-hover': `color-mix(in srgb, ${s.onSurface} 8%, transparent)`,
      '--bg-active': `color-mix(in srgb, ${s.onSurface} 12%, transparent)`,
      '--text': s.onSurface,
      '--text-dim': s.onSurfaceVariant,
      '--text-faint': `color-mix(in srgb, ${s.onSurfaceVariant} 72%, ${s.surface})`,
      '--border': s.outlineVariant,
      '--border-soft': `color-mix(in srgb, ${s.outlineVariant} 55%, transparent)`,
      '--danger': s.error,
      '--ok': sem.ok,
      '--warn': sem.warn,
      '--shadow': sem.shadow,
      '--shadow-sm': sem.shadowSm,
    };

    for (const [key, value] of Object.entries(vars)) body.style.setProperty(key, value);
    return s;
  }

  BP.material = { scheme, apply, seedInfo, lchToHex, hexToRgb, rgbToHex };
})();
