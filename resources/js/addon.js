(function () {
    'use strict';

    Statamic.booting(() => {
        const { h, ref, computed, watch, inject, onMounted, onUnmounted, resolveComponent, getCurrentInstance } = window.Vue;

        const GRAY_STEPS = ['#fafafa','#f5f5f5','#e5e5e5','#d4d4d4','#a3a3a3','#737373','#525252','#404040','#262626','#171717','#0a0a0a'];

        function usePublishContext() {
            const inject = window.__STATAMIC__?.ui?.injectPublishContext;
            return inject ? inject() : null;
        }

        function getPublishValues(ctx) {
            return ctx?.values?.value ?? ctx?.values ?? {};
        }

        function parseHex(hex) {
            hex = hex.replace('#', '');
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
        }

        function toHex(r, g, b) {
            return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        }

        function hexToOklch(hex) {
            const [r8, g8, b8] = parseHex(hex);
            const toLinear = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            const lr = toLinear(r8 / 255), lg = toLinear(g8 / 255), lb = toLinear(b8 / 255);
            const l = 0.4122214708*lr + 0.5363325363*lg + 0.0514459929*lb;
            const m = 0.2119034982*lr + 0.6806995451*lg + 0.1073969566*lb;
            const s = 0.0883024619*lr + 0.2817188376*lg + 0.6299787005*lb;
            const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
            const L  =  0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_;
            const a  =  1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_;
            const b2 =  0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_;
            return [L, Math.sqrt(a*a + b2*b2), Math.atan2(b2, a) * 180 / Math.PI];
        }

        function oklchToHex(L, C, H) {
            const hRad = H * Math.PI / 180;
            const a = C * Math.cos(hRad), b = C * Math.sin(hRad);
            const l_ = L + 0.3963377774*a + 0.2158037573*b;
            const m_ = L - 0.1055613458*a - 0.0638541728*b;
            const s_ = L - 0.0894841775*a - 1.2914855480*b;
            const l = l_**3, m = m_**3, s = s_**3;
            const r  =  4.0767416621*l - 3.3077115913*m + 0.2309699292*s;
            const g  = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s;
            const bv = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s;
            const toSrgb = c => c <= 0.0031308 ? 12.92*c : 1.055*Math.pow(c, 1/2.4) - 0.055;
            const clamp  = c => Math.max(0, Math.min(1, c));
            return toHex(Math.round(clamp(toSrgb(r))*255), Math.round(clamp(toSrgb(g))*255), Math.round(clamp(toSrgb(bv))*255));
        }

        const SCALE_STEPS = [0.971, 0.941, 0.874, 0.785, 0.681, 0.572, 0.462, 0.374, 0.274, 0.184, 0.122];

        function hexScale(hex, bias = 0) {
            const [, C, H] = hexToOklch(hex);
            const offset = bias / 100 * 0.35;
            return SCALE_STEPS.map((stepL, i) => {
                if (i === 5) return hex; // trin 500 = altid den eksakte basisfarve
                const L = Math.max(0.05, Math.min(0.97, stepL + offset));
                return oklchToHex(L, C * Math.min(1, L * 2, (1 - L) * 2), H);
            });
        }

        function neutralScale() {
            return GRAY_STEPS;
        }

        Statamic.$components.register('theme-color-picker-fieldtype', {
            inheritAttrs: false,
            props: {
                value:  { required: true },
                meta:   { type: Object, default: () => ({}) },
                config: { type: Object, default: () => ({}) },
            },
            emits: ['update:value', 'update:meta', 'focus', 'blur'],
            setup(props, { emit, attrs }) {
                const publishContext = inject('PublishContainerContext', null);

                const colorData = [
                    { key: 'primary_color',    biasKey: 'primary_tones_bias' },
                    { key: 'secondary_color',  biasKey: 'secondary_tones_bias' },
                    { key: 'tertiary_color',   biasKey: 'tertiary_tones_bias' },
                    { key: 'quaternary_color', biasKey: 'quaternary_tones_bias' },
                ];

                const liveSwatches = computed(() => {
                    if (publishContext) {
                        const vals = getPublishValues(publishContext);
                        const palette = [];
                        for (const { key, biasKey } of colorData) {
                            if (!vals[key]) continue;
                            const bias = vals[biasKey] ?? props.meta.biases?.[key] ?? 0;
                            palette.push(...hexScale(vals[key], bias));
                        }
                        if (!palette.length) return props.meta.swatches || [];
                        palette.push(...neutralScale());
                        return palette;
                    }
                    return props.meta.swatches || [];
                });

                const stepIndex = ref(-1);

                watch(() => props.value, (val) => {
                    if (!val) { stepIndex.value = -1; return; }
                    const idx = liveSwatches.value.indexOf(val);
                    if (idx !== -1) stepIndex.value = idx;
                }, { immediate: true });

                const onSelectValue = (val) => {
                    stepIndex.value = liveSwatches.value.indexOf(val);
                    emit('update:value', val);
                };

                watch(liveSwatches, (newSwatches, oldSwatches) => {
                    if (!oldSwatches?.length) return;
                    if (stepIndex.value === -1 || !newSwatches.length) return;
                    const newColor = newSwatches[stepIndex.value];
                    if (newColor && newColor !== props.value) {
                        emit('update:value', newColor);
                    }
                });

                return () => {
                    const ColorFieldtype = resolveComponent('color-fieldtype');
                    return h(ColorFieldtype, {
                        ...attrs,
                        value:  props.value,
                        meta:   props.meta,
                        config: { ...props.config, swatches: liveSwatches.value, allow_any: true },
                        'onUpdate:value': onSelectValue,
                        'onUpdate:meta':  (val) => emit('update:meta', val),
                        onFocus: () => emit('focus'),
                        onBlur:  () => emit('blur'),
                    });
                };
            },
        });

        Statamic.$components.register('theme-color-scale-preview-fieldtype', {
            props: {
                value:  { default: null },
                meta:   { type: Object, default: () => ({}) },
                config: { type: Object, default: () => ({}) },
            },
            setup(props) {
                const publishContext = usePublishContext();
                const STEP_LABELS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

                const scale = computed(() => {
                    const vals = publishContext ? getPublishValues(publishContext) : {};
                    const hex = vals[props.config.base_color ?? 'primary_color'];
                    if (!hex) return [];
                    const bias = vals[props.config.bias_field ?? 'primary_tones_bias'] ?? 0;
                    return hexScale(hex, bias).map((color, i) => ({ step: STEP_LABELS[i], color }));
                });

                return () => {
                    if (!scale.value.length) return null;
                    return h('div', { style: 'display:flex;gap:5px;padding:10px 0 6px;' },
                        scale.value.map(({ step, color }) =>
                            h('div', { style: 'flex:1;min-width:0;text-align:center;' }, [
                                h('div', { style: `background:${color};border-radius:7px;aspect-ratio:3/4;margin-bottom:5px;` }),
                                h('div', { style: 'font-size:11px;font-weight:600;color:#9ca3af;' }, String(step)),
                                h('div', { style: 'font-size:9px;color:#6b7280;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }, color.slice(1).toUpperCase()),
                            ])
                        )
                    );
                };
            },
        });

        Statamic.$components.register('color-scheme-preview-fieldtype', {
            props: {
                value:  { default: null },
                meta:   { type: Object, default: () => ({}) },
                config: { type: Object, default: () => ({}) },
            },
            setup(props, { attrs }) {
                const publishContext = usePublishContext();
                const instance = getCurrentInstance();

                const setKey = ref(null);
                const el     = ref(null);

                {
                    const m = String(attrs.name || '').match(/color_schemes[.\[]([^.\]\s[]+)/);
                    if (m?.[1]) setKey.value = m[1];
                }

                if (!setKey.value) {
                    let node = instance?.parent;
                    let depth = 0;
                    while (node && depth < 30) {
                        for (const src of [node.setupState, node.props, node.data]) {
                            if (!src) continue;
                            if (src?.row?._id)    { setKey.value = src.row._id;    break; }
                            if (src?.row?.id)     { setKey.value = src.row.id;     break; }
                            if (src?.set?._id)    { setKey.value = src.set._id;    break; }
                            if (src?.item?._id)   { setKey.value = src.item._id;   break; }
                            if (src?.values?._id) { setKey.value = src.values._id; break; }
                        }
                        if (setKey.value) break;
                        node = node.parent;
                        depth++;
                    }
                }

                onMounted(() => {
                    if (setKey.value) return;
                    for (const sel of ['[data-id]', '[data-set-id]', '[data-row-id]', '[data-uuid]']) {
                        const found = el.value?.closest(sel);
                        const id = found?.dataset?.id || found?.dataset?.setId
                                || found?.dataset?.rowId || found?.dataset?.uuid;
                        if (id) { setKey.value = id; return; }
                    }
                    let parent = el.value?.parentElement;
                    let depth = 0;
                    while (parent && depth < 15 && !setKey.value) {
                        for (const input of parent.querySelectorAll('input, textarea')) {
                            const m = (input.name || '').match(/color_schemes[.\[]([^.\]\s[]+)[.\[]/);
                            if (m?.[1]) { setKey.value = m[1]; break; }
                        }
                        parent = parent.parentElement;
                        depth++;
                    }
                });

                function findScheme(vals) {
                    const schemes = vals.color_schemes || [];
                    const key = setKey.value;
                    if (!key) return null;
                    if (/^\d+$/.test(String(key))) return schemes[parseInt(key)] ?? null;
                    return schemes.find(s => s._id === key) ?? null;
                }

                const colors = computed(() => {
                    const vals = getPublishValues(publishContext);
                    if (vals.text_color || vals.background_color) {
                        return {
                            bg:      vals.background_color       || '#f9fafb',
                            fg:      vals.text_color             || '#374151',
                            innerBg: vals.inner_background_color || null,
                            innerFg: vals.inner_text_color       || null,
                            btn1:    vals.button_one_color       || '#6b7280',
                            btn2:    vals.button_two_color       || '#9ca3af',
                        };
                    }
                    const mine = findScheme(vals);
                    if (mine) {
                        return {
                            bg:      mine.background_color       || '#f9fafb',
                            fg:      mine.text_color             || '#374151',
                            innerBg: mine.inner_background_color || null,
                            innerFg: mine.inner_text_color       || null,
                            btn1:    mine.button_one_color       || '#6b7280',
                            btn2:    mine.button_two_color       || '#9ca3af',
                        };
                    }
                    return { bg: '#f3f4f6', fg: '#9ca3af', innerBg: null, innerFg: null, btn1: '#d1d5db', btn2: '#e5e7eb' };
                });

                const myHandle = computed(() => {
                    const vals = getPublishValues(publishContext);
                    return findScheme(vals)?.handle ?? null;
                });

                const usages = computed(() => {
                    if (!myHandle.value) return [];
                    return props.meta.usages?.[myHandle.value] ?? [];
                });

                return () => {
                    const c = colors.value;
                    const card = schemeCard({ background_color: c.bg, text_color: c.fg, inner_background_color: c.innerBg, inner_text_color: c.innerFg, button_one_color: c.btn1, button_two_color: c.btn2 }, 'inline');

                    const MAX = 8;
                    const list = usages.value;
                    const shown = list.slice(0, MAX);
                    const rest  = list.length - shown.length;

                    const usageEl = h('div', { style: 'margin-top:10px' }, [
                        h('p', { style: 'font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em' },
                            list.length ? `Bruges i ${list.length} ${list.length === 1 ? 'sted' : 'steder'}` : 'Bruges ikke endnu'
                        ),
                        ...shown.map(item =>
                            h('div', { style: 'font-size:12px;display:flex;align-items:baseline;gap:5px;line-height:1.6' }, [
                                h('span', { style: 'color:#9ca3af;flex-shrink:0' }, '·'),
                                h('a', { href: item.url, target: '_blank', style: 'color:#3b82f6;text-decoration:none;' }, item.label),
                            ])
                        ),
                        rest > 0 ? h('div', { style: 'font-size:11px;color:#9ca3af;margin-top:2px' }, `… og ${rest} mere`) : null,
                    ]);

                    return h('div', { ref: el, style: 'display:flex;gap:16px;align-items:flex-start' }, [card, usageEl]);
                };
            },
        });

        function schemeCard(option, size = 'normal') {
            const bg      = option.background_color       || '#ffffff';
            const fg      = option.text_color             || '#000000';
            const innerBg = option.inner_background_color || null;
            const innerFg = option.inner_text_color       || null;
            const btn1    = option.button_one_color       || '#333333';
            const btn2    = option.button_two_color       || '#999999';

            const isSmall  = size === 'small';
            const isInline = size === 'inline';

            const cardClass = isInline
                ? 'flex flex-col items-center justify-center rounded-lg border border-gray-200 gap-1.5 w-36 aspect-[4/3] @container'
                : isSmall
                    ? 'flex flex-col items-center justify-center shrink-0 rounded-lg border border-gray-200 gap-0.5 w-11 h-9 @container'
                    : 'flex flex-col items-center justify-center shrink-0 rounded-lg border border-gray-200 gap-1.5 w-16 h-14 @container';

            const aaClass   = 'font-bold font-serif text-[20cqi] leading-none';
            const pillClass = isSmall ? 'block rounded-full h-1 w-3' : 'block rounded-full h-1.5 w-4';
            const dotClass  = (isSmall ? 'size-2' : 'dot-size') + ' rounded-full border-custom shrink-0';

            const innerDots = (innerBg || innerFg) ? h('div', { class: 'absolute top-2 right-2 flex gap-1' }, [
                innerBg ? h('span', { class: dotClass, style: { backgroundColor: innerBg } }) : null,
                innerFg ? h('span', { class: dotClass, style: { backgroundColor: innerFg } }) : null,
            ]) : null;

            return h('div', { class: 'relative ' + cardClass, style: { backgroundColor: bg } }, [
                innerDots,
                h('span', { class: aaClass, style: { color: fg } }, 'Aa'),
                h('div', { class: 'flex gap-1' }, [
                    h('span', { class: pillClass, style: { backgroundColor: btn1 } }),
                    h('span', { class: pillClass + ' bg-transparent border-custom', style: { borderColor: btn2 } }),
                ]),
            ]);
        }

        Statamic.$components.register('color-scheme-selector-fieldtype', {
            props: {
                value:    { default: null },
                meta:     { type: Object, default: () => ({}) },
                config:   { type: Object, default: () => ({}) },
                name:     { type: String },
                readOnly: { type: Boolean, default: false },
            },
            emits: ['update:value'],
            setup(props, { emit }) {
                const selected    = ref(props.value);
                const isOpen      = ref(false);
                const container   = ref(null);
                const skiftBtnRef = ref(null);
                const portalEl    = ref(null);

                watch(() => props.value, (val) => { selected.value = val; });

                const options = computed(() => props.meta.options || []);

                const selectedOption = computed(() =>
                    options.value.find(o => o.value === selected.value) || null
                );

                watch(options, (opts) => {
                    if (!selected.value && opts.length) {
                        selected.value = opts[0].value;
                        emit('update:value', opts[0].value);
                    }
                }, { immediate: true });

                function select(handle) {
                    if (props.readOnly) return;
                    selected.value = handle;
                    emit('update:value', handle);
                    isOpen.value = false;
                }

                function toggle() {
                    if (props.readOnly || !options.value.length) return;
                    if (!isOpen.value && skiftBtnRef.value) {
                        const rect = skiftBtnRef.value.getBoundingClientRect();
                        buildPortal(rect.bottom + 4, rect.left);
                        isOpen.value = true;
                    } else {
                        isOpen.value = false;
                    }
                }

                function cardDOM(option, small) {
                    const bg      = option.background_color       || '#ffffff';
                    const fg      = option.text_color             || '#000000';
                    const innerBg = option.inner_background_color || null;
                    const innerFg = option.inner_text_color       || null;
                    const b1      = option.button_one_color       || '#333333';
                    const b2      = option.button_two_color       || '#999999';
                    const w    = small ? '44px' : '64px';
                    const ht   = small ? '36px' : '56px';
                    const pw   = small ? '12px' : '16px';
                    const dotSz = small ? '5px' : '7px';

                    const card = document.createElement('div');
                    Object.assign(card.style, {
                        position: 'relative',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', flexShrink: '0',
                        borderRadius: '8px', border: '1px solid #e5e7eb',
                        gap: '2px', width: w, height: ht, backgroundColor: bg,
                    });

                    if (innerBg || innerFg) {
                        const dots = document.createElement('div');
                        Object.assign(dots.style, { position: 'absolute', top: '3px', right: '3px', display: 'flex', gap: '2px' });
                        for (const col of [innerBg, innerFg]) {
                            if (!col) continue;
                            const dot = document.createElement('span');
                            Object.assign(dot.style, { width: dotSz, height: dotSz, borderRadius: '50%', backgroundColor: col, border: '1px solid color-mix(in oklch, rgb(145,145,145), transparent 50%)', flexShrink: '0' });
                            dots.appendChild(dot);
                        }
                        card.appendChild(dots);
                    }

                    const aa = document.createElement('span');
                    Object.assign(aa.style, {
                        fontWeight: 'bold', fontFamily: 'serif',
                        fontSize: small ? '10px' : '13px', lineHeight: '1',
                        color: fg,
                    });
                    aa.textContent = 'Aa';
                    card.appendChild(aa);

                    const row = document.createElement('div');
                    Object.assign(row.style, { display: 'flex', gap: '2px' });

                    const p1 = document.createElement('span');
                    Object.assign(p1.style, { display: 'block', borderRadius: '9999px', height: '4px', width: pw, backgroundColor: b1 });

                    const p2 = document.createElement('span');
                    Object.assign(p2.style, { display: 'block', borderRadius: '9999px', height: '4px', width: pw, border: '1px solid ' + b2, backgroundColor: 'transparent' });

                    row.appendChild(p1);
                    row.appendChild(p2);
                    card.appendChild(row);
                    return card;
                }

                function updatePortalPos() {
                    if (!portalEl.value || !skiftBtnRef.value) return;
                    const rect = skiftBtnRef.value.getBoundingClientRect();
                    if (rect.bottom < 0 || rect.top > window.innerHeight) {
                        isOpen.value = false;
                        return;
                    }
                    portalEl.value.style.top  = (rect.bottom + 4) + 'px';
                    portalEl.value.style.left = rect.left + 'px';
                }

                function buildPortal(top, left) {
                    removePortal();
                    const dark = document.documentElement.classList.contains('dark');

                    const contentBg  = dark ? '#1e2538' : '#ffffff';
                    const bodyBg     = dark ? '#151a28' : '#f9fafb';
                    const border     = dark ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
                    const selBg      = dark ? 'oklch(0.25 0.04 264)' : '#eff6ff';
                    const selHoverBg = dark ? 'oklch(0.28 0.06 264)' : '#dbeafe';
                    const defBg      = contentBg;
                    const defHoverBg = bodyBg;

                    const div = document.createElement('div');
                    Object.assign(div.style, {
                        position: 'fixed', zIndex: '99999',
                        top: top + 'px', left: left + 'px',
                        width: '288px', maxHeight: '320px',
                        backgroundColor: contentBg,
                        border: '1px solid ' + border,
                        borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0/.15),0 4px 6px -4px rgb(0 0 0/.1)',
                        overflowY: 'auto',
                        color: dark ? '#f1f5f9' : '#374151',
                    });

                    options.value.forEach(option => {
                        const cur = selected.value === option.value;
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        Object.assign(btn.style, {
                            display: 'flex', alignItems: 'center', gap: '12px',
                            width: '100%', padding: '8px 14px',
                            border: 'none', borderBottom: '1px solid ' + border,
                            cursor: 'pointer', textAlign: 'left', color: 'inherit',
                            backgroundColor: cur ? selBg : defBg,
                        });
                        btn.addEventListener('mouseover', () => { btn.style.backgroundColor = cur ? selHoverBg : defHoverBg; });
                        btn.addEventListener('mouseout',  () => { btn.style.backgroundColor = cur ? selBg      : defBg; });
                        btn.addEventListener('mousedown', (e) => { e.stopPropagation(); });
                        btn.addEventListener('click', () => select(option.value));

                        btn.appendChild(cardDOM(option, true));

                        const lbl = document.createElement('span');
                        Object.assign(lbl.style, { flex: '1', fontSize: '14px', fontWeight: cur ? '600' : '400' });
                        lbl.textContent = option.label;
                        btn.appendChild(lbl);

                        if (cur) {
                            const chk = document.createElement('span');
                            chk.textContent = '✓';
                            chk.style.color = '#3b82f6';
                            btn.appendChild(chk);
                        }

                        div.appendChild(btn);
                    });

                    document.body.appendChild(div);
                    portalEl.value = div;
                    window.addEventListener('scroll', updatePortalPos, true);
                }

                function removePortal() {
                    if (portalEl.value) {
                        window.removeEventListener('scroll', updatePortalPos, true);
                        document.body.removeChild(portalEl.value);
                        portalEl.value = null;
                    }
                }

                function onClickOutside(e) {
                    if (container.value?.contains(e.target)) return;
                    if (portalEl.value?.contains(e.target)) return;
                    isOpen.value = false;
                }

                watch(isOpen, (val) => { if (!val) removePortal(); });

                onMounted(()   => document.addEventListener('mousedown', onClickOutside));
                onUnmounted(() => {
                    document.removeEventListener('mousedown', onClickOutside);
                    removePortal();
                });

                return () => {
                    if (!options.value.length) {
                        return h('p', { class: 'text-sm text-gray-500 italic py-1' },
                            'Ingen farveskemaer endnu — opret dem under Globals → Theme Settings');
                    }

                    const opt = selectedOption.value;

                    return h('div', { ref: container, class: 'inline-flex items-stretch gap-3 w-full' }, [
                        h('button', {
                            ref:     skiftBtnRef,
                            class:   'inline-flex items-center justify-center gap-1.5 px-3.5 self-stretch bg-[color-mix(in_oklab,var(--theme-color-gray-400)_15%,transparent)] border border-[color-mix(in_oklab,var(--theme-color-gray-400)_30%,transparent)] rounded-lg cursor-pointer text-sm shrink-0 whitespace-nowrap min-w-40 hover:bg-[var(--color-body-bg)]',
                            type:    'button',
                            onClick: toggle,
                        }, [
                            h('span', {}, 'Skift farve'),
                            h('span', { style: 'font-size:0.5rem;line-height:1' }, isOpen.value ? '▲' : '▼'),
                        ]),

                        opt
                            ? schemeCard(opt)
                            : h('div', { class: 'flex flex-col items-center justify-center shrink-0 rounded-lg border border-gray-200 gap-1.5 w-16 h-14' }),

                        h('div', { class: 'flex flex-col justify-center gap-1' }, [
                            h('span', { class: 'text-sm font-semibold' }, opt ? opt.label : 'Intet valgt'),
                            h('a', {
                                class: 'text-xs text-blue-500 hover:underline',
                                href: (props.meta.editBaseUrl ?? '/cp/globals/theme_settings') + (opt?.index ?? '') + '#colors',
                                target: '_blank',
                            }, 'Rediger'),
                        ]),
                    ]);
                };
            },
        });

        Statamic.$components.register('button-preview-fieldtype', {
            props: {
                value:  { default: null },
                meta:   { type: Object, default: () => ({}) },
                config: { type: Object, default: () => ({}) },
            },
            emits: ['update:value', 'update:meta', 'focus', 'blur'],
            setup(props, { emit }) {
                const { inject, computed, ref, resolveComponent } = window.Vue;

                const publishContext = inject('PublishContainerContext', null);

                const vals = computed(() => publishContext?.values?.value || {});

                const baseFont    = computed(() => vals.value.font_family?.base     || 'sans-serif');
                const headingFont = computed(() => vals.value.font_family?.headings || 'sans-serif');

                const FONT_MAP = { '--font-base': () => baseFont.value, '--font-heading': () => headingFont.value };
                const SIZE_MAP = { '--size-xs': '0.875rem', '--size-sm': '0.9375rem', '--size-base': '1rem', '--size-300': '1.125rem' };
                const WEIGHT_MAP = { '--font-weight-regular': '400', '--font-weight-medium': '500', '--font-weight-semibold': '600', '--font-weight-bold': '700' };
                const RADIUS_MAP = {
                    '0px':                   '0px',
                    'var(--radius-xs)':       '3px',
                    'var(--radius-sm)':       '5px',
                    'var(--radius-md)':       '8px',
                    'var(--radius-lg)':       '12px',
                    'var(--radius-xl)':       '16px',
                    'calc(infinity * 1px)':   '9999px',
                };

                const fontFamily   = computed(() => FONT_MAP[vals.value.button_font]?.() || baseFont.value);
                const fontSize     = computed(() => SIZE_MAP[vals.value.button_size]     || '0.9375rem');
                const fontWeight   = computed(() => WEIGHT_MAP[vals.value.button_weight] || '700');
                const borderRadius = computed(() => RADIUS_MAP[vals.value.button_radius] || '0px');
                const textTransform = computed(() => vals.value.button_uppercase ? 'uppercase' : 'none');

                function parseColors(val) {
                    if (val && typeof val === 'object' && val.bg) return { bg: val.bg, text: val.text || '#ffffff' };
                    return { bg: '#4f46e5', text: '#ffffff' };
                }
                const colors    = ref(parseColors(props.value));
                const bgMeta    = ref({});
                const textMeta  = ref({});

                function setColor(key, val) {
                    colors.value = { ...colors.value, [key]: val };
                    emit('update:value', { ...colors.value });
                }

                return () => {
                    const ThemeColorPicker = resolveComponent('theme-color-picker-fieldtype');
                    const bg   = colors.value.bg   || '#4f46e5';
                    const text = colors.value.text || '#ffffff';

                    const btnBase = {
                        display:        'inline-flex',
                        alignItems:     'center',
                        justifyContent: 'center',
                        paddingBlock:   '0.9em',
                        paddingInline:  '1.8em',
                        borderRadius:   borderRadius.value,
                        fontSize:       fontSize.value,
                        fontWeight:     fontWeight.value,
                        fontFamily:     fontFamily.value,
                        textTransform:  textTransform.value,
                        lineHeight:     '1.15',
                        cursor:         'default',
                        border:         'none',
                        outline:        'none',
                        whiteSpace:     'nowrap',
                    };

                    return h('div', { class: 'fluid-ft-panel rounded-lg' }, [

                        h('div', { class: 'fluid-ft-panel-hd flex items-start gap-4 px-3 py-2 rounded-t-lg' }, [
                            h('div', { class: 'flex flex-col gap-1' }, [
                                h('span', { class: 'fluid-ft-label text-[10px]' }, 'Baggrund'),
                                h(ThemeColorPicker, {
                                    value:  bg,
                                    meta:   bgMeta.value,
                                    config: { allow_any: true },
                                    'onUpdate:value': val => setColor('bg', val),
                                    'onUpdate:meta':  val => { bgMeta.value = val; },
                                    onFocus: () => emit('focus'), onBlur: () => emit('blur'),
                                }),
                            ]),
                            h('div', { class: 'flex flex-col gap-1' }, [
                                h('span', { class: 'fluid-ft-label text-[10px]' }, 'Tekst'),
                                h(ThemeColorPicker, {
                                    value:  text,
                                    meta:   textMeta.value,
                                    config: { allow_any: true },
                                    'onUpdate:value': val => setColor('text', val),
                                    'onUpdate:meta':  val => { textMeta.value = val; },
                                    onFocus: () => emit('focus'), onBlur: () => emit('blur'),
                                }),
                            ]),
                        ]),

                        h('div', { class: 'flex items-center gap-3 flex-wrap px-4 py-5 rounded-b-lg' }, [
                            h('span', {
                                style: { ...btnBase, background: bg, color: text },
                            }, 'Book et møde'),
                            h('span', {
                                style: { ...btnBase, background: 'transparent', color: bg, boxShadow: `0 0 0 1px ${bg} inset` },
                            }, 'Afspil video'),
                        ]),
                    ]);
                };
            },
        });

    });
}());
