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
        const SCALE_MAX   = SCALE_STEPS[0];                        // 0.971 (trin 50)
        const SCALE_MIN   = SCALE_STEPS[SCALE_STEPS.length - 1];  // 0.122 (trin 950)
        const SCALE_SPAN  = SCALE_MAX - SCALE_MIN;

        function hexScale(hex, bias = 0, saturation = 0) {
            const [, C, H] = hexToOklch(hex);
            const offset  = bias / 100 * 0.35;
            // Komprimér skalaen i stedet for at clippe — alle trin forbliver unikke
            const minL    = Math.max(0.05, SCALE_MIN + offset);
            const maxL    = Math.min(0.97, SCALE_MAX + offset);
            const satMult = Math.max(0, 1 + saturation / 100);
            return SCALE_STEPS.map(stepL => {
                const t = (stepL - SCALE_MIN) / SCALE_SPAN;
                const L = minL + t * (maxL - minL);
                return oklchToHex(L, C * Math.min(1, L * 2, (1 - L) * 2) * satMult, H);
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
                    { key: 'primary_color',    biasKey: 'primary_tones_bias',    satKey: 'primary_saturation' },
                    { key: 'secondary_color',  biasKey: 'secondary_tones_bias',  satKey: 'secondary_saturation' },
                    { key: 'tertiary_color',   biasKey: 'tertiary_tones_bias',   satKey: 'tertiary_saturation' },
                    { key: 'quaternary_color', biasKey: 'quaternary_tones_bias', satKey: 'quaternary_saturation' },
                ];

                const liveSwatches = computed(() => {
                    if (publishContext) {
                        const vals = getPublishValues(publishContext);
                        const palette = [];
                        for (const { key, biasKey, satKey } of colorData) {
                            if (!vals[key]) continue;
                            const bias = vals[biasKey] ?? props.meta.biases?.[key]      ?? 0;
                            const sat  = vals[satKey]  ?? props.meta.saturations?.[key] ?? 0;
                            palette.push(vals[key]);
                            palette.push(...hexScale(vals[key], bias, sat));
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
                    const bias = vals[props.config.bias_field       ?? 'primary_tones_bias']  ?? 0;
                    const sat  = vals[props.config.saturation_field ?? 'primary_saturation']  ?? 0;
                    return hexScale(hex, bias, sat).map((color, i) => ({ step: STEP_LABELS[i], color }));
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
                        width: '288px', maxHeight: '480px',
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
                const fontVariationSettings = computed(() => {
                    const wdth = vals.value.button_width;
                    if (!wdth) return null;
                    const num = parseFloat(String(wdth));
                    if (isNaN(num)) return null;
                    return `'wdth' ${num}`;
                });

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
                        display:               'inline-flex',
                        alignItems:            'center',
                        justifyContent:        'center',
                        paddingBlock:          '0.9em',
                        paddingInline:         '1.8em',
                        borderRadius:          borderRadius.value,
                        fontSize:              fontSize.value,
                        fontWeight:            fontWeight.value,
                        fontFamily:            fontFamily.value,
                        fontVariationSettings: fontVariationSettings.value || undefined,
                        textTransform:         textTransform.value,
                        lineHeight:            '1.15',
                        cursor:                'default',
                        border:                'none',
                        outline:               'none',
                        whiteSpace:            'nowrap',
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

    // ── Hjælpefunktioner til vizuStyle CSS-string manipulation ──────────────
    function setCssProp(styleStr, prop, value) {
        const parts = (styleStr || '').split(';').map(s => s.trim()).filter(Boolean);
        const escaped = prop.replace(/[-]/g, '\\-');
        const filtered = parts.filter(p => !new RegExp(`^${escaped}\\s*:`,'i').test(p));
        if (value !== null && value !== undefined) filtered.push(`${prop}: ${value}`);
        return filtered.join('; ') || null;
    }

    function readVizuProp(editor, prop) {
        try {
            const { state } = editor;
            const { from, to } = state.selection;
            const vizuType = state.schema.marks.vizuStyle;
            if (!vizuType) return null;
            let value = null;
            const escaped = prop.replace(/[-]/g, '\\-');
            const r = new RegExp(`(?:^|;)\\s*${escaped}:\\s*([^;]+)`, 'i');
            state.doc.nodesBetween(from, to === from ? to + 1 : to, node => {
                if (value) return false;
                if (node.isText) {
                    const m = node.marks.find(m => m.type === vizuType);
                    if (m?.attrs.style) { const match = m.attrs.style.match(r); if (match) value = match[1].trim(); }
                }
            });
            return value;
        } catch { return null; }
    }

    // ── Delt swatch-fetch (cached, bruges af CSS-injektion og toolbar-knap) ──
    let _swatchesCache = null;
    function fetchSwatches() {
        if (_swatchesCache !== null) return Promise.resolve(_swatchesCache);
        const cpRoot = document.querySelector('meta[name="cp-root"]')?.content || '/cp';
        return fetch(`${cpRoot}/vizuall/swatches`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
        })
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
        .then(s => { _swatchesCache = s; return s; });
    }

    // Injicér tema-CSS-variabler i CP så var(--primary-500) virker i Bard-editoren
    Statamic.booting(() => {
        fetchSwatches().then(swatches => {
            if (!swatches.length) return;
            const css = swatches
                .filter(s => s.var)
                .map(s => `${s.var}:${s.hex}`)
                .join(';');
            const style = document.createElement('style');
            style.id = 'cp-theme-vars';
            style.textContent = `:root{${css}}`;
            document.head.appendChild(style);
        });
    });

    // ── Bard color mark + toolbar button ─────────────────────────────────────

    // Registrér knappen i button-pickeren
    Statamic.booting(() => {
        Statamic.$bard.buttons(buttons => {
            buttons.push({
                name:      'color',
                text:      'Tekstfarve',
                component: 'bard-button-color',
                html:      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37-1.34-1.34a1 1 0 0 0-1.41 0L9 12.25 11.75 15l8.96-8.96a1 1 0 0 0 0-1.41z"/></svg>',
            });
        });
    });

    Statamic.booting(() => {
        const { h, ref, onMounted, onUnmounted } = window.Vue;

        // 0a. vizuStyle — combined inline style mark (color + font-size + text-transform + ...)
        Statamic.$bard.addExtension(({ tiptap }) => {
            return tiptap.core.Mark.create({
                name: 'vizuStyle',
                priority: 1000,

                addAttributes() {
                    return {
                        style: {
                            default: null,
                            parseHTML: el => el.getAttribute('style') || null,
                            renderHTML: attrs => attrs.style ? { 'data-vizu': '', style: attrs.style } : {},
                        },
                    };
                },

                parseHTML() {
                    return [{ tag: 'span[data-vizu]' }];
                },

                renderHTML({ HTMLAttributes }) {
                    return ['span', HTMLAttributes, 0];
                },

                addCommands() {
                    const applyVizu = fn => ({ tr, state, dispatch }) => {
                        const vizuType = state.schema.marks.vizuStyle;
                        if (!vizuType) return false;
                        const { from, to } = state.selection;
                        const nodes = [];
                        state.doc.nodesBetween(from, to, (node, pos) => { if (node.isText) nodes.push({ node, pos }); });
                        nodes.forEach(({ node, pos }) => {
                            const m        = node.marks.find(m => m.type === vizuType);
                            const newStyle = fn(m?.attrs.style || null);
                            if (m) tr.removeMark(pos, pos + node.nodeSize, vizuType);
                            if (newStyle) tr.addMark(pos, pos + node.nodeSize, vizuType.create({ style: newStyle }));
                        });
                        if (dispatch) dispatch(tr);
                        return true;
                    };
                    return {
                        setVizuProp:   (prop, val) => applyVizu(s => setCssProp(s, prop, val)),
                        clearVizuProp: prop        => applyVizu(s => setCssProp(s, prop, null)),
                    };
                },
            });
        });

        // 0b-pre. btsSpan mark — nødvendig for at Tiptap kan loade gammelt indhold.
        // Migratoren konverterer det straks til vizuStyle ved editor create.
        Statamic.$bard.addExtension(({ tiptap }) => {
            return tiptap.core.Mark.create({
                name: 'btsSpan',
                priority: 100,
                addAttributes() {
                    return { class: { default: null } };
                },
                parseHTML() {
                    return [
                        { tag: 'span[data-bts-style]', getAttrs: el => ({ class: el.getAttribute('data-bts-style') }) },
                        { tag: 'span[class]',           getAttrs: el => ({ class: el.getAttribute('class') || null }) },
                    ];
                },
                renderHTML({ HTMLAttributes }) {
                    return ['span', HTMLAttributes, 0];
                },
            });
        });

        // 0b. Migrator: convert old themeColor + btsSpan marks → vizuStyle on editor create
        Statamic.$bard.addExtension(({ tiptap }) => {
            const BTSSPAN_MAP = (() => {
                const styles = Statamic.$config.get('vizuall-bard-styles') || [];
                const map = {};
                styles.forEach(s => { map[s.handle.replace(/_/g, '-')] = { prop: s.prop, value: s.value }; });
                return map;
            })();

            return tiptap.core.Extension.create({
                name: 'vizuStyleMigrator',
                onCreate() {
                    const { schema, doc } = this.editor.state;
                    const tcType  = schema.marks.themeColor;
                    const btsType = schema.marks.btsSpan;
                    const vzType  = schema.marks.vizuStyle;
                    if (!vzType) return;
                    const ops = [];
                    doc.descendants((node, pos) => {
                        if (!node.isText) return;
                        const tc   = tcType  && node.marks.find(m => m.type === tcType);
                        const btss = btsType ? node.marks.filter(m => m.type === btsType) : [];
                        const vz   = node.marks.find(m => m.type === vzType);
                        if (!tc && !btss.length) return;
                        let style = vz?.attrs.style || null;
                        const removals = [];
                        if (tc) { style = setCssProp(style, 'color', tc.attrs.color); removals.push(tc); }
                        btss.forEach(m => {
                            const def = BTSSPAN_MAP[m.attrs.class || ''];
                            if (def) style = setCssProp(style, def.prop, def.value);
                            removals.push(m);
                        });
                        ops.push({ pos, size: node.nodeSize, vz, removals, style });
                    });
                    if (!ops.length) return;
                    const tr = this.editor.state.tr;
                    ops.forEach(({ pos, size, vz, removals, style }) => {
                        removals.forEach(m => tr.removeMark(pos, pos + size, m));
                        if (vz) tr.removeMark(pos, pos + size, vzType);
                        if (style) tr.addMark(pos, pos + size, vzType.create({ style }));
                    });
                    tr.setMeta('vizuMigrate', true);
                    this.editor.view.dispatch(tr);
                },
            });
        });

        // 0c. Paragraph-style Tiptap-extension (vizuClass-attribut på <p>/<h1>)
        Statamic.$bard.addExtension(({ tiptap }) => {
            const paragraphStyles = (Statamic.$config.get('vizuall-bard-styles') || [])
                .filter(s => s.type === 'paragraph' && s.class);
            if (!paragraphStyles.length) return tiptap.core.Extension.create({ name: 'vizuParaNoop' });

            const knownClasses = new Set(paragraphStyles.map(s => s.class));
            return tiptap.core.Extension.create({
                name: 'vizuParagraphStyle',
                addGlobalAttributes() {
                    return [{
                        types: ['paragraph', 'heading'],
                        attributes: {
                            vizuClass: {
                                default: null,
                                parseHTML: el => {
                                    for (const cls of knownClasses) {
                                        if (el.classList.contains(cls)) return cls;
                                    }
                                    return null;
                                },
                                renderHTML: attrs => attrs.vizuClass ? { class: attrs.vizuClass } : {},
                            },
                        },
                    }];
                },
            });
        });

        // 0d. Injicér CP-preview CSS for paragraph-styles
        (() => {
            const paragraphStyles = (Statamic.$config.get('vizuall-bard-styles') || [])
                .filter(s => s.type === 'paragraph' && s.class && s.cp_css);
            if (!paragraphStyles.length) return;
            const css = paragraphStyles.map(s => `.ProseMirror .${s.class} { ${s.cp_css} }`).join('\n');
            const el  = document.createElement('style');
            el.textContent = css;
            document.head.appendChild(el);
        })();

        // 0e. (vizu style-knapper registreres i separat booting-blok — se bunden af filen)

        // 1. TipTap mark — wraps text in <span style="color: #xxx"> (bevares for bagudkompatibilitet)
        Statamic.$bard.addExtension(({ tiptap }) => {
            return tiptap.core.Mark.create({
                name: 'themeColor',
                priority: 1000,

                addAttributes() {
                    return {
                        color: {
                            default: null,
                            parseHTML: el => {
                                const m = (el.getAttribute('style') || '').match(/(?:^|;)\s*color:\s*([^;]+)/);
                                return m ? m[1].trim() : null;
                            },
                            renderHTML: attrs => attrs.color ? { style: `color: ${attrs.color}` } : {},
                        },
                    };
                },

                parseHTML() {
                    return [{
                        tag: 'span',
                        getAttrs: el => {
                            const m = (el.getAttribute('style') || '').match(/(?:^|;)\s*color:\s*([^;]+)/);
                            if (!m) return false;
                            return { color: m[1].trim() };
                        },
                    }];
                },

                renderHTML({ HTMLAttributes }) {
                    return ['span', HTMLAttributes, 0];
                },

                addCommands() {
                    return {
                        setThemeColor:   color => ({ commands }) => commands.setMark(this.name, { color }),
                        unsetThemeColor: ()    => ({ commands }) => commands.unsetMark(this.name),
                    };
                },
            });
        });

        // 2. Toolbar button — paint brush icon, swatch dropdown via portal
        Statamic.$components.register('bard-button-color', {
            props: {
                editor: { type: Object, required: true },
                bard:   { type: Object, default: null },
            },
            setup(props) {
                const container   = ref(null);
                const isOpen      = ref(false);
                const activeColor = ref(null);
                const portalEl    = { value: null };
                const COLS        = 12;

                // Bruger den delte fetchSwatches fra IIFE-scope

                function readActiveColor() {
                    // Tjek vizuStyle først (ny format), fall back til themeColor (gammel format)
                    const vizuColor = readVizuProp(props.editor, 'color');
                    if (vizuColor) return vizuColor;
                    try {
                        const { state }  = props.editor;
                        const { from, to } = state.selection;
                        const markType   = state.schema.marks.themeColor;
                        if (!markType) return null;
                        let color = null;
                        state.doc.nodesBetween(from, to === from ? to + 1 : to, (node) => {
                            if (color) return false;
                            if (node.isText) {
                                const m = node.marks.find(m => m.type === markType);
                                if (m) color = m.attrs.color;
                            }
                        });
                        return color;
                    } catch { return null; }
                }

                function updatePos() {
                    if (!container.value || !portalEl.value) return;
                    const r  = container.value.getBoundingClientRect();
                    const pw = portalEl.value.offsetWidth || 340;
                    portalEl.value.style.left = Math.max(4, Math.min(r.left, window.innerWidth - pw - 4)) + 'px';
                    portalEl.value.style.top  = (r.bottom + 4) + 'px';
                }

                function buildPortalContent(swatches) {
                    const div     = portalEl.value;
                    const current = readActiveColor();
                    div.innerHTML = '';

                    // Find hex for current CSS-variabel (til visning i header)
                    const currentEntry = swatches.find(s => (s.var ? `var(${s.var})` : s.hex) === current);
                    const currentHex   = currentEntry?.hex || null;

                    // Header: farvevisning + variabel-navn + fjern-knap
                    const header = document.createElement('div');
                    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px 8px;border-bottom:1px solid #3f3f46;margin-bottom:8px';

                    const swatchEl = document.createElement('div');
                    swatchEl.style.cssText = `width:28px;height:28px;border-radius:50%;background:${currentHex || 'transparent'};border:2px solid ${currentHex ? currentHex : '#52525b'};flex-shrink:0`;
                    header.appendChild(swatchEl);

                    const label = document.createElement('span');
                    label.style.cssText = 'font-size:12px;font-family:monospace;color:#a1a1aa;flex:1';
                    label.textContent = current || 'Ingen farve';
                    header.appendChild(label);

                    if (current) {
                        const removeBtn = document.createElement('button');
                        removeBtn.type = 'button';
                        removeBtn.innerHTML = '&times;';
                        removeBtn.title = 'Fjern farve';
                        removeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#a1a1aa;font-size:16px;line-height:1;padding:0 4px;border-radius:4px';
                        removeBtn.onmouseenter = () => { removeBtn.style.color = '#f87171'; };
                        removeBtn.onmouseleave = () => { removeBtn.style.color = '#a1a1aa'; };
                        removeBtn.addEventListener('click', () => {
                            props.editor.chain().focus().extendMarkRange('vizuStyle').clearVizuProp('color').run();
                            closePortal();
                        });
                        header.appendChild(removeBtn);
                    }
                    div.appendChild(header);

                    // Swatch grid — gemmer CSS-variabel (var(--primary-500)) eller hex for neutraler
                    const grid = document.createElement('div');
                    grid.style.cssText = `display:grid;grid-template-columns:repeat(${COLS},1fr);gap:4px;padding:0 4px`;

                    swatches.forEach(({ hex, var: cssVar }) => {
                        const stored = cssVar ? `var(${cssVar})` : hex;
                        const btn    = document.createElement('button');
                        btn.type     = 'button';
                        btn.title    = cssVar ? `${cssVar} — ${hex}` : hex;
                        const active = stored === current;
                        btn.style.cssText = `width:24px;height:24px;border-radius:50%;background:${hex};border:2px solid ${active ? '#fff' : 'transparent'};cursor:pointer;outline:${active ? '2px solid '+hex : 'none'};outline-offset:2px;transition:transform .1s`;
                        btn.onmouseenter = () => { btn.style.transform = 'scale(1.18)'; };
                        btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; };
                        btn.addEventListener('click', () => {
                            if (active) {
                                props.editor.chain().focus().extendMarkRange('vizuStyle').clearVizuProp('color').run();
                            } else {
                                props.editor.chain().focus().extendMarkRange('vizuStyle').setVizuProp('color', stored).run();
                            }
                            closePortal();
                        });
                        grid.appendChild(btn);
                    });
                    div.appendChild(grid);
                }

                function openPortal() {
                    if (portalEl.value) return;
                    const div = document.createElement('div');
                    div.style.cssText = 'position:fixed;z-index:99999;background:#18181b;border:1px solid #3f3f46;border-radius:10px;padding:8px 4px;box-shadow:0 8px 32px rgba(0,0,0,.7);min-width:200px';
                    document.body.appendChild(div);
                    portalEl.value = div;

                    // Vis loading-state mens swatches hentes
                    div.innerHTML = '<div style="padding:12px;text-align:center;color:#71717a;font-size:12px">Henter farver…</div>';
                    window.addEventListener('scroll', updatePos, true);
                    requestAnimationFrame(updatePos);

                    fetchSwatches().then(swatches => {
                        if (!portalEl.value) return;
                        buildPortalContent(swatches);
                        requestAnimationFrame(updatePos);
                    });
                }

                function closePortal() {
                    if (!portalEl.value) return;
                    document.body.removeChild(portalEl.value);
                    portalEl.value = null;
                    window.removeEventListener('scroll', updatePos, true);
                    isOpen.value = false;
                }

                function toggle() {
                    isOpen.value ? closePortal() : (isOpen.value = true, openPortal());
                }

                function handleOutsideClick(e) {
                    if (!isOpen.value) return;
                    if (container.value?.contains(e.target) || portalEl.value?.contains(e.target)) return;
                    closePortal();
                }

                function onEditorUpdate() {
                    activeColor.value = readActiveColor();
                }

                onMounted(() => {
                    document.addEventListener('mousedown', handleOutsideClick);
                    props.editor?.on('selectionUpdate', onEditorUpdate);
                    props.editor?.on('transaction',     onEditorUpdate);
                });

                onUnmounted(() => {
                    document.removeEventListener('mousedown', handleOutsideClick);
                    props.editor?.off('selectionUpdate', onEditorUpdate);
                    props.editor?.off('transaction',     onEditorUpdate);
                    closePortal();
                });

                function brushSvg(color) {
                    return h('svg', { width: '14', height: '14', viewBox: '0 0 24 24' }, [
                        h('path', { fill: 'currentColor', d: 'M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37-1.34-1.34a1 1 0 0 0-1.41 0L9 12.25 11.75 15l8.96-8.96a1 1 0 0 0 0-1.41z' }),
                        color ? h('rect', { x: '1', y: '21', width: '22', height: '2.5', rx: '1.25', fill: color }) : null,
                    ]);
                }

                return () => {
                    const color = activeColor.value;
                    return h('div', { ref: container, style: 'display:inline-flex' }, [
                        h('button', {
                            type: 'button',
                            class: ['bard-toolbar-button', isOpen.value && 'active'].filter(Boolean).join(' '),
                            title: 'Tekstfarve',
                            onClick: toggle,
                        }, [ brushSvg(color) ]),
                    ]);
                };
            },
        });
    });

    // Auto-open a replicator set on page load:
    //   #open=N      → Nth top-level [data-replicator-set] (page sections)
    //   ?cs=N#colors → Nth [data-replicator-set][data-type="color_scheme"]
    (function () {
        const mPage   = window.location.hash.match(/^#open=(\d+)$/);
        const csParam = new URLSearchParams(window.location.search).get('cs');
        const mScheme = csParam !== null;
        if (!mPage && !mScheme) return;

        const targetIndex = parseInt(mPage ? mPage[1] : csParam, 10);
        const MAX_MS      = 8000;
        const INTERVAL    = 150;
        const start       = Date.now();

        function findTarget() {
            if (mScheme) {
                const all = [...document.querySelectorAll('[data-replicator-set][data-type="color_scheme"]')];
                return all[targetIndex] ?? null;
            }
            const topLevel = [...document.querySelectorAll('[data-replicator-set]')]
                .filter(el => !el.parentElement?.closest('[data-replicator-set]'));
            return topLevel[targetIndex] ?? null;
        }

        function tryOpen() {
            const target = findTarget();

            if (!target) {
                if (mScheme) {
                    const colorsTab = [...document.querySelectorAll('[role="tab"]')]
                        .find(t => t.textContent.trim().toLowerCase() === 'colors');
                    if (colorsTab && colorsTab.getAttribute('aria-selected') !== 'true') {
                        colorsTab.click();
                    }
                }
                if (Date.now() - start < MAX_MS) setTimeout(tryOpen, INTERVAL);
                return;
            }

            if (target.dataset.collapsed !== 'false') {
                target.querySelector('header button')?.click();
            }

            setTimeout(() => {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const prev = target.style.outline;
                target.style.outline      = '2px solid #3b82f6';
                target.style.borderRadius = '4px';
                setTimeout(() => { target.style.outline = prev; }, 2000);
            }, 350);
        }

        setTimeout(tryOpen, 600);
    }());

    // ── Vizuall Bard Style-knapper ────────────────────────────────────────────
    // Styles uden 'group' → individuel knap i pickeren.
    // Styles med samme 'group'-værdi → én dropdown-knap i pickeren.
    Statamic.booting(() => {
        const allStyles = Statamic.$config.get('vizuall-bard-styles') || [];
        const allGroups = Statamic.$config.get('vizuall-bard-groups') || {};
        if (!allStyles.length) return;

        const { h, ref, onMounted, onUnmounted } = window.Vue;

        // Sortér styles i grupper og individuelle
        const groupedMap = {};   // groupName → [styles]
        const ungrouped  = [];

        allStyles.forEach(style => {
            if (style.group) {
                if (!groupedMap[style.group]) groupedMap[style.group] = [];
                groupedMap[style.group].push(style);
            } else {
                ungrouped.push(style);
            }
        });

        // Registrér alle knapper i ét kald — vigtig for at de vises i picker
        Statamic.$bard.buttons(buttons => {
            Object.entries(groupedMap).forEach(([groupName, groupStyles]) => {
                const meta = allGroups[groupName] || {};
                const slug = groupName.replace(/_/g, '-');
                buttons.push({
                    name:      `vizu-group-${slug}`,
                    text:      meta.name || groupName,
                    component: `bard-btn-vizu-group-${slug}`,
                    html:      meta.ident || groupName[0].toUpperCase(),
                });
            });
            ungrouped.forEach(style => {
                const slug = style.handle.replace(/_/g, '-');
                buttons.push({
                    name:      `vizu-${slug}`,
                    text:      style.name,
                    component: `bard-btn-vizu-${slug}`,
                    html:      style.ident || '?',
                });
            });
        });

        // ── Gruppe dropdown-komponenter ───────────────────────────────────────
        Object.entries(groupedMap).forEach(([groupName, groupStyles]) => {
            const groupMeta = allGroups[groupName] || {};
            const slug      = groupName.replace(/_/g, '-');

            Statamic.$components.register(`bard-btn-vizu-group-${slug}`, {
                props: { editor: { type: Object, required: true }, bard: { type: Object, default: null } },
                setup(props) {
                    const container = ref(null);
                    const isOpen    = ref(false);
                    const portalEl  = { value: null };

                    function getActive() {
                        for (const s of groupStyles) {
                            if (s.prop && readVizuProp(props.editor, s.prop) === s.value) return s;
                        }
                        return null;
                    }

                    function updatePos() {
                        if (!container.value || !portalEl.value) return;
                        const r  = container.value.getBoundingClientRect();
                        const pw = portalEl.value.offsetWidth || 180;
                        portalEl.value.style.left = Math.max(4, Math.min(r.left, window.innerWidth - pw - 4)) + 'px';
                        portalEl.value.style.top  = (r.bottom + 4) + 'px';
                    }

                    function buildContent() {
                        const div    = portalEl.value;
                        div.innerHTML = '';
                        const active = getActive();

                        groupStyles.forEach(style => {
                            const isCur = active?.handle === style.handle;

                            const btn = document.createElement('button');
                            btn.type = 'button';
                            btn.style.cssText = `display:flex;align-items:center;gap:8px;width:100%;padding:5px 10px;border:none;cursor:pointer;text-align:left;background:${isCur ? 'rgba(59,130,246,.18)' : 'transparent'};border-radius:4px;color:${isCur ? '#93c5fd' : '#e2e8f0'};`;
                            btn.addEventListener('mouseover', () => { if (!isCur) btn.style.background = 'rgba(255,255,255,.07)'; });
                            btn.addEventListener('mouseout',  () => { if (!isCur) btn.style.background = 'transparent'; });
                            btn.addEventListener('click', () => {
                                if (isCur) {
                                    props.editor.chain().focus().extendMarkRange('vizuStyle').clearVizuProp(style.prop).run();
                                } else {
                                    props.editor.chain().focus().extendMarkRange('vizuStyle').setVizuProp(style.prop, style.value).run();
                                }
                                closePortal();
                            });

                            const badge = document.createElement('span');
                            badge.style.cssText = `display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:18px;padding:0 3px;border-radius:3px;font-size:9px;font-weight:700;font-family:monospace;background:${isCur ? '#3b82f6' : 'rgba(255,255,255,.15)'};color:${isCur ? '#fff' : '#94a3b8'};flex-shrink:0;`;
                            badge.textContent = style.ident;
                            btn.appendChild(badge);

                            const name = document.createElement('span');
                            name.style.cssText = 'font-size:12px;flex:1;';
                            name.textContent = style.name;
                            btn.appendChild(name);

                            if (isCur) {
                                const chk = document.createElement('span');
                                chk.textContent = '✓';
                                chk.style.cssText = 'font-size:11px;color:#3b82f6;';
                                btn.appendChild(chk);
                            }

                            div.appendChild(btn);
                        });
                    }

                    function openPortal() {
                        if (portalEl.value) return;
                        const div = document.createElement('div');
                        div.style.cssText = 'position:fixed;z-index:99999;background:#1a1f2e;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,.5);min-width:160px;';
                        document.body.appendChild(div);
                        portalEl.value = div;
                        window.addEventListener('scroll', updatePos, true);
                        requestAnimationFrame(() => { updatePos(); buildContent(); });
                    }

                    function closePortal() {
                        if (!portalEl.value) return;
                        document.body.removeChild(portalEl.value);
                        portalEl.value = null;
                        window.removeEventListener('scroll', updatePos, true);
                        isOpen.value = false;
                    }

                    function toggle() { isOpen.value ? closePortal() : (isOpen.value = true, openPortal()); }

                    function handleOutside(e) {
                        if (!isOpen.value) return;
                        if (container.value?.contains(e.target) || portalEl.value?.contains(e.target)) return;
                        closePortal();
                    }

                    function onEditorUpdate() { if (portalEl.value) buildContent(); }

                    onMounted(() => {
                        document.addEventListener('mousedown', handleOutside);
                        props.editor?.on('selectionUpdate', onEditorUpdate);
                        props.editor?.on('transaction', onEditorUpdate);
                    });
                    onUnmounted(() => {
                        document.removeEventListener('mousedown', handleOutside);
                        props.editor?.off('selectionUpdate', onEditorUpdate);
                        props.editor?.off('transaction', onEditorUpdate);
                        closePortal();
                    });

                    return () => {
                        const active = getActive();
                        return h('div', { ref: container, style: 'display:inline-flex' }, [
                            h('button', {
                                type: 'button',
                                class: ['bard-toolbar-button', (isOpen.value || active) && 'active'].filter(Boolean).join(' '),
                                title: groupMeta.name || groupName,
                                onClick: toggle,
                            }, active ? active.ident : (groupMeta.ident || groupName[0].toUpperCase())),
                        ]);
                    };
                },
            });
        });

        // ── Individuelle knapper (ingen group) ────────────────────────────────
        ungrouped.forEach(style => {
            const isParagraph = style.type === 'paragraph';
            const slug        = style.handle.replace(/_/g, '-');

            Statamic.$components.register(`bard-btn-vizu-${slug}`, {
                props: { editor: { type: Object, required: true } },
                setup(props) {
                    const isActive = ref(false);

                    function check() {
                        if (isParagraph) {
                            isActive.value = props.editor.getAttributes('paragraph').vizuClass === style.class;
                        } else {
                            isActive.value = readVizuProp(props.editor, style.prop) === style.value;
                        }
                    }

                    onMounted(() => {
                        props.editor?.on('selectionUpdate', check);
                        props.editor?.on('transaction', check);
                    });
                    onUnmounted(() => {
                        props.editor?.off('selectionUpdate', check);
                        props.editor?.off('transaction', check);
                    });

                    function toggle() {
                        if (isParagraph) {
                            const cur = props.editor.getAttributes('paragraph').vizuClass;
                            props.editor.chain().focus()
                                .updateAttributes('paragraph', { vizuClass: cur === style.class ? null : style.class })
                                .run();
                        } else if (isActive.value) {
                            props.editor.chain().focus().extendMarkRange('vizuStyle').clearVizuProp(style.prop).run();
                        } else {
                            props.editor.chain().focus().extendMarkRange('vizuStyle').setVizuProp(style.prop, style.value).run();
                        }
                    }

                    return () => h('button', {
                        type: 'button',
                        class: ['bard-toolbar-button', isActive.value && 'active'].filter(Boolean).join(' '),
                        title: style.name,
                        onClick: toggle,
                    }, style.ident || '?');
                },
            });
        });
    });

}());
