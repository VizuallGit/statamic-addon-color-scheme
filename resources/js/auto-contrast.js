const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const KNOWN_FAMILIES = ['primary', 'secondary', 'tertiary', 'gray'];
const CONTRAST_SELECTOR = '[data-auto-contrast], [data-auto-contrast-hover]';

/** @type {null | { name: string, samples: { rgb: number[], step: number | null }[] }[]} */
let scaleCache = null;

function parseRgb(color) {
    if (!color) return null;
    const hex = color.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
    if (hex) {
        let h = hex[1];
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    const parts = (color.match(/[\d.]+/g) || []).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    return parts.slice(0, 3);
}

function colorDistance(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function familyFromVarName(name) {
    if (!name) return null;
    const base = name.replace(/^--/, '').replace(/-brand$/, '').replace(/-\d+$/, '');
    if (!base) return null;
    if (KNOWN_FAMILIES.includes(base)) return base;
    // Dynamiske paletter (fx accent_color → --accent-50)
    const root = getComputedStyle(document.documentElement);
    if (root.getPropertyValue(`--${base}-50`).trim()) return base;
    return null;
}

function parseFamilyFromCssValue(value) {
    if (!value || !value.includes('var(')) return null;
    const m = value.match(/var\(\s*(--[\w-]+)/);
    return m ? familyFromVarName(m[1]) : null;
}

/** Følg var(--color-bg) → var(--primary-950) osv. for at finde paletten. */
function resolveFamilyFromValue(value, el, depth = 0) {
    if (!value || depth > 6) return null;

    const direct = parseFamilyFromCssValue(value);
    if (direct) return direct;

    const m = value.match(/var\(\s*(--[\w-]+)/);
    if (!m) return familyFromVarName(value.startsWith('--') ? value : null);

    const fromName = familyFromVarName(m[1]);
    if (fromName) return fromName;

    const next = (
        getComputedStyle(el).getPropertyValue(m[1]).trim()
        || getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim()
    );
    if (!next || next === value) return null;
    return resolveFamilyFromValue(next, el, depth + 1);
}

/** Find baggrundens CSS-var fra inline/style-attr/--color-bg (hurtigt). */
function authoredBackgroundFamily(el) {
    const inline = el.style.getPropertyValue('background-color') || el.style.backgroundColor;
    const fromInline = resolveFamilyFromValue(inline, el);
    if (fromInline) return fromInline;

    const attr = el.getAttribute('style') || '';
    const fromAttr = resolveFamilyFromValue(
        attr.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1] || '',
        el,
    );
    if (fromAttr) return fromAttr;

    // Sektioner sætter ofte --color-bg: var(--primary-950) og bg via den variabel.
    for (const prop of ['--color-bg', '--bg-color']) {
        const raw = getComputedStyle(el).getPropertyValue(prop).trim();
        if (!raw) continue;
        const family = resolveFamilyFromValue(
            raw.includes('var(') || raw.startsWith('--') ? raw : `var(${prop})`,
            el,
        );
        if (family) return family;
    }

    return null;
}

/** Langsommere: find var(--family-N) i stylesheets der matcher elementet. */
function stylesheetBackgroundFamily(el) {
    for (const sheet of document.styleSheets) {
        let rules;
        try {
            rules = sheet.cssRules;
        } catch {
            continue;
        }
        if (!rules) continue;
        for (const rule of rules) {
            if (!rule.selectorText || !rule.style) continue;
            try {
                if (!el.matches(rule.selectorText)) continue;
            } catch {
                continue;
            }
            const bg = rule.style.getPropertyValue('background-color') || rule.style.backgroundColor;
            const family = resolveFamilyFromValue(bg, el);
            if (family) return family;
            const colorBg = rule.style.getPropertyValue('--color-bg');
            const fromColorBg = resolveFamilyFromValue(colorBg, el);
            if (fromColorBg) return fromColorBg;
        }
    }
    return null;
}

function getScaleCache() {
    if (scaleCache) return scaleCache;

    const root = getComputedStyle(document.documentElement);
    const names = new Set(KNOWN_FAMILIES);

    // Opdag ekstra paletter der har en 50-trin-variabel.
    for (const name of KNOWN_FAMILIES) {
        if (root.getPropertyValue(`--${name}-50`).trim()) names.add(name);
    }

    const families = [];
    for (const name of names) {
        const samples = [];
        for (const step of STEPS) {
            const raw = root.getPropertyValue(`--${name}-${step}`).trim();
            const rgb = parseRgb(raw);
            if (rgb) samples.push({ step, rgb });
        }
        const baseRaw = root.getPropertyValue(`--${name}`).trim();
        const baseRgb = parseRgb(baseRaw);
        if (baseRgb) samples.push({ step: null, rgb: baseRgb });

        if (samples.length) families.push({ name, samples });
    }

    scaleCache = families;
    return scaleCache;
}

function familyFromComputedRgb(rgb) {
    let best = null;
    let bestDist = Infinity;
    // ~18 pr. kanal — tillad small afrunding mellem hex og getComputedStyle
    const threshold = 18 * 18 * 3;

    for (const family of getScaleCache()) {
        for (const sample of family.samples) {
            const dist = colorDistance(rgb, sample.rgb);
            if (dist < bestDist) {
                bestDist = dist;
                best = family.name;
            }
        }
    }

    return bestDist <= threshold ? best : null;
}

function contrastColorFor(el, rgb) {
    const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    const wantLightText = brightness <= 128;
    const family = authoredBackgroundFamily(el)
        || familyFromComputedRgb(rgb)
        || stylesheetBackgroundFamily(el);

    if (family) {
        return wantLightText
            ? `var(--${family}-50)`
            : `var(--${family}-950)`;
    }

    return wantLightText
        ? 'var(--contrast-light)'
        : 'var(--contrast-dark)';
}

function autoContrast(el) {
    const bg = getComputedStyle(el).backgroundColor;
    const nums = (bg.match(/[\d.]+/g) || []).map(Number);
    if (nums.length < 3 || nums.slice(0, 3).some(Number.isNaN)) return;
    const a = nums.length >= 4 ? nums[3] : 1;
    if (a === 0) return;

    el.style.color = contrastColorFor(el, nums.slice(0, 3));
}

export function applyAutoContrast(root = document) {
    scaleCache = null;
    root.querySelectorAll(CONTRAST_SELECTOR).forEach(trackContrast);
}

window.applyAutoContrast = applyAutoContrast;
window.applyContrastColors = applyAutoContrast;

function trackContrast(el) {
    const dur = parseFloat(getComputedStyle(el).transitionDuration) * 1000 || 0;
    el._contrastUntil = performance.now() + dur + 50;
    if (el._contrastTicking) return;
    el._contrastTicking = true;
    const tick = (now) => {
        autoContrast(el);
        if (now < el._contrastUntil) {
            requestAnimationFrame(tick);
        } else {
            el._contrastTicking = false;
        }
    };
    requestAnimationFrame(tick);
}

let scheduled = false;
const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'disabled'
            && m.target.matches?.(CONTRAST_SELECTOR)) {
            trackContrast(m.target);
        }
    }
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        document.querySelectorAll(CONTRAST_SELECTOR).forEach(trackContrast);
    });
});
observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'disabled'],
});

function onHoverContrast(e) {
    const el = e.target.closest?.('[data-auto-contrast-hover]');
    if (el) trackContrast(el);
}
document.addEventListener('mouseover', onHoverContrast);
document.addEventListener('mouseout', onHoverContrast);

applyAutoContrast();
