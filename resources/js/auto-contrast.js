/**
 * data-auto-contrast — tekstfarven vælges ud fra den baggrund elementet
 * faktisk har.
 *
 * Paletterne skrives i sitets site.css og redigeres i Tema-panelet. Derfor
 * ved vi ikke på forhånd hvilke trin en palet har: en farve kan have tints
 * 150, 175, 200 og shades 500-950, den kan have de klassiske 50-950, og den
 * kan være én enkelt farve helt uden trin. Trinnene bliver derfor fundet ved
 * at læse hvad der rent faktisk står på :root, ikke ved at gætte på en fast
 * liste.
 *
 * Valget af tekstfarve:
 *   lys tekst  → palettens laveste trin, hvis det er <= LIGHT_MAX_STEP
 *   mørk tekst → palettens højeste trin, hvis det er >= DARK_MIN_STEP
 *   ellers     → GRAY_LIGHT / GRAY_DARK
 *
 * Grå er låst i temaet og har altid 50-950, så den er et sikkert sted at
 * falde tilbage til. Brandfarven uden tal (--primary) bruges til at genkende
 * hvilken palet en baggrund hører til, men kan aldrig selv blive tekstfarve:
 * så ville en palet uden trin pege på sig selv, og teksten forsvinde i sin
 * egen baggrund.
 *
 * data-auto-contrast="gray" (og data-auto-contrast-hover="gray") springer
 * paletten over og bruger grå. Det er til knapper og lignende, hvor en tonet
 * tekstfarve ligger for tæt på sin egen baggrund.
 */

const CONTRAST_SELECTOR = '[data-auto-contrast], [data-auto-contrast-hover]';

/** Det lyseste trin må højst hedde dette for at kunne bruges som lys tekst. */
const LIGHT_MAX_STEP = 200;
/** Det mørkeste trin skal mindst hedde dette for at kunne bruges som mørk tekst. */
const DARK_MIN_STEP = 800;

const GRAY_LIGHT = 'var(--gray-50)';
const GRAY_DARK = 'var(--gray-900)';

/**
 * Paletterne som de står på :root.
 *
 * @type {null | Map<string, { samples: { rgb: number[] }[], light: string | null, dark: string | null }>}
 */
let scaleCache = null;

/**
 * Er værdien overhovedet en farve? :root rummer også skrifttyper, tider og
 * størrelser, og clamp(1.3125rem, 1.2083rem + 0.5208vw, 1.625rem) har tre tal
 * i sig. Uden denne vagt bliver --size- og --text-skalaerne til paletter.
 */
const COLOR_VALUE = /^(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color|color-mix)\()/i;

function parseRgb(color) {
    if (!color || !COLOR_VALUE.test(color.trim())) return null;
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

/** @type {Map<string, null | { rgb: number[], alpha: number }>} */
const measuredColors = new Map();
let probeCtx;

/**
 * Mål en beregnet CSS-farve som sRGB.
 * getComputedStyle giver ikke altid rgb(): color-mix(in oklch, ...) serialiseres
 * som oklab()/oklch(), hvor tallene er 0-1 og 0-360 og ikke 0-255. Læses de som
 * RGB, ser enhver baggrund mørk ud, og teksten bliver altid lys.
 */
function measureColor(color) {
    if (!color) return null;
    if (measuredColors.has(color)) return measuredColors.get(color);

    let result = null;
    const legacy = color.trim().match(/^rgba?\(([^)]*)\)$/i);

    if (legacy) {
        const nums = (legacy[1].match(/[\d.]+/g) || []).map(Number);
        if (nums.length >= 3 && !nums.slice(0, 3).some(Number.isNaN)) {
            result = { rgb: nums.slice(0, 3), alpha: nums.length >= 4 ? nums[3] : 1 };
        }
    } else {
        result = probeColor(color);
    }

    measuredColors.set(color, result);
    return result;
}

/** Lad browseren konvertere farven til sRGB via et 1x1 canvas. */
function probeColor(color) {
    if (probeCtx === undefined) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        probeCtx = canvas.getContext('2d', { willReadFrequently: true }) || null;
    }
    if (!probeCtx) return null;

    try {
        probeCtx.clearRect(0, 0, 1, 1);
        // Genkender browseren ikke farven, bliver fillStyle stående på gennemsigtig,
        // og vi ender med alpha 0 - altså samme no-op som hvis der ingen baggrund var.
        probeCtx.fillStyle = 'rgba(0, 0, 0, 0)';
        probeCtx.fillStyle = color;
        probeCtx.fillRect(0, 0, 1, 1);
        const d = probeCtx.getImageData(0, 0, 1, 1).data;
        return { rgb: [d[0], d[1], d[2]], alpha: d[3] / 255 };
    } catch {
        return null;
    }
}

function colorDistance(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * Navnene på alle custom properties der er sat på :root, læst af de stylesheets
 * siden har. getComputedStyle kan ikke remse dem op, så reglerne må gennemgås.
 * Både sitets byggede CSS og det <style>-tag theme_tokens lægger i head tæller
 * med, og @layer/@media-grupper gennemgås indeni.
 */
function rootPropertyNames() {
    const names = new Set();

    const walk = (rules) => {
        for (const rule of rules || []) {
            if (rule.style && rule.selectorText && /(^|,)\s*(:root|html)\b/.test(rule.selectorText)) {
                for (const prop of rule.style) {
                    if (prop.startsWith('--')) names.add(prop);
                }
            }
            if (rule.cssRules) walk(rule.cssRules);
        }
    };

    for (const sheet of document.styleSheets) {
        try {
            walk(sheet.cssRules);
        } catch {
            // Et stylesheet fra et andet domæne må ikke læses. Det er fint:
            // temaet står altid i sitets egen CSS.
        }
    }

    return names;
}

/**
 * Byg paletterne: navn → de trin der findes, plus hvilke to af dem der kan
 * bruges som lys og mørk tekst.
 */
function getScaleCache() {
    if (scaleCache) return scaleCache;

    const root = getComputedStyle(document.documentElement);
    const families = new Map();

    const add = (name) => {
        if (!families.has(name)) {
            families.set(name, { samples: [], steps: [] });
        }
        return families.get(name);
    };

    for (const prop of rootPropertyNames()) {
        // --primary-500 → primary + 500, --primary → primary uden trin.
        // Kun ét bindestreg-tal til sidst tæller som trin; --color-primary-500
        // springes over, da den korte form altid står der også.
        if (prop.startsWith('--color-')) continue;

        const match = prop.match(/^--([a-z][\w-]*?)(?:-(\d+))?$/i);
        if (!match) continue;

        const rgb = parseRgb(root.getPropertyValue(prop).trim());
        if (!rgb) continue;

        const family = add(match[1]);
        family.samples.push({ rgb });

        if (match[2] !== undefined) {
            family.steps.push({ step: parseInt(match[2], 10), name: prop });
        }
    }

    scaleCache = new Map();

    for (const [name, family] of families) {
        // En farve uden trin (--yyy, --white) kan ikke levere hverken en lys
        // eller en mørk tone. Den udelades, og en baggrund i den farve falder
        // til grå — hvilket er det rigtige svar.
        if (!family.steps.length) continue;

        const sorted = [...family.steps].sort((a, b) => a.step - b.step);
        const lightest = sorted[0];
        const darkest = sorted[sorted.length - 1];

        scaleCache.set(name, {
            samples: family.samples,
            light: lightest && lightest.step <= LIGHT_MAX_STEP ? `var(${lightest.name})` : null,
            dark: darkest && darkest.step >= DARK_MIN_STEP ? `var(${darkest.name})` : null,
        });
    }

    return scaleCache;
}

function familyFromVarName(name) {
    if (!name) return null;
    const base = name.replace(/^--/, '').replace(/^color-/, '').replace(/-brand$/, '').replace(/-\d+$/, '');
    if (!base) return null;
    return getScaleCache().has(base) ? base : null;
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

function familyFromComputedRgb(rgb) {
    let best = null;
    let bestDist = Infinity;
    // ~18 pr. kanal — tillad small afrunding mellem hex og getComputedStyle
    const threshold = 18 * 18 * 3;

    for (const [name, family] of getScaleCache()) {
        for (const sample of family.samples) {
            const dist = colorDistance(rgb, sample.rgb);
            if (dist < bestDist) {
                bestDist = dist;
                best = name;
            }
        }
    }

    return bestDist <= threshold ? best : null;
}

/** Siger elementet selv, at det vil have grå? */
function wantsGray(el) {
    return el.getAttribute('data-auto-contrast') === 'gray'
        || el.getAttribute('data-auto-contrast-hover') === 'gray';
}

function contrastColorFor(el, rgb) {
    const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    const wantLightText = brightness <= 128;
    const gray = wantLightText ? GRAY_LIGHT : GRAY_DARK;

    if (wantsGray(el)) return gray;

    const name = authoredBackgroundFamily(el)
        || familyFromComputedRgb(rgb)
        || stylesheetBackgroundFamily(el);

    const family = name ? getScaleCache().get(name) : null;
    if (!family) return gray;

    // Mangler paletten en tone yderligt nok, er grå det nærmeste vi kommer
    // en læsbar tekst — en tint på 350 oven på sin egen 800 er ikke tekst.
    return (wantLightText ? family.light : family.dark) || gray;
}

function autoContrast(el) {
    const measured = measureColor(getComputedStyle(el).backgroundColor);
    if (!measured || measured.alpha === 0) return;

    el.style.color = contrastColorFor(el, measured.rgb);
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
