<?php

namespace Vizuall\ColorScheme\Fieldtypes;

use Statamic\Facades\GlobalSet;
use Statamic\Facades\Site;
use Statamic\Fields\Fieldtype;

class ThemeColorPicker extends Fieldtype
{
    protected static $handle = 'theme_color_picker';

    private static ?array $cachedSwatches = null;

    private const LIGHTNESS_STEPS = [0.971, 0.941, 0.874, 0.785, 0.681, 0.572, 0.462, 0.374, 0.274, 0.184, 0.122];

    private const GRAY_STEPS = [
        '#fafafa', '#f5f5f5', '#e5e5e5', '#d4d4d4', '#a3a3a3',
        '#737373', '#525252', '#404040', '#262626', '#171717', '#0a0a0a',
    ];

    // Enkelt kilde til trin-navngivning — bruges af ThemeColorScale og buildSwatchesWithVars
    public const STEP_NAMES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

    public function component(): string
    {
        return 'theme-color-picker';
    }

    /**
     * Behold CSS-custom-properties i output (var(--primary-950)).
     * Live Preview/fremside opdaterer via :root (--primary-* fra theme_color_scale
     * + live injektion når lysniveau/saturation ændres).
     */
    public function augment($value): mixed
    {
        return $value;
    }

    public static function clearSwatchCache(): void
    {
        static::$cachedSwatches = null;
    }

    public static function resolveStoredColor(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        $value = trim($value);

        if (! preg_match('/^var\(\s*(--[a-z0-9-]+)\s*\)$/i', $value, $m)) {
            return $value;
        }

        return static::resolveCssVar($m[1]) ?? $value;
    }

    /** Resolvér --primary-950 / --gray-100 til hex ud fra nuværende theme_settings. */
    public static function resolveCssVar(string $varName): ?string
    {
        $name = ltrim($varName, '-');

        if (preg_match('/^gray-(\d+)$/', $name, $m)) {
            $idx = array_search((int) $m[1], self::STEP_NAMES, true);

            return $idx !== false ? (self::GRAY_STEPS[$idx] ?? null) : null;
        }

        try {
            $variables = static::loadVariables();
            if (! $variables) {
                return null;
            }

            foreach (static::discoverPalettes($variables) as $palette) {
                $pname = $palette['name'];
                $hex   = (string) $variables->get($palette['color']);
                $bias  = (int) ($variables->get($palette['bias']) ?? 0);
                $sat   = (int) ($variables->get($palette['sat']) ?? 0);
                $scale = static::scale($hex, $bias, $sat);

                // --primary = brand-hex (samme som Theme Settings-feltet).
                if ($name === $pname) {
                    return $hex;
                }

                if ($name === $pname.'-brand') {
                    return $hex;
                }

                if (! preg_match('/^'.preg_quote($pname, '/').'-(\d+)$/', $name, $m)) {
                    continue;
                }

                $idx = array_search((int) $m[1], self::STEP_NAMES, true);

                return $idx === false ? null : ($scale[$idx] ?? null);
            }
        } catch (\Throwable) {
            return null;
        }

        return null;
    }

    public function preload(): array
    {
        return [
            'swatches'         => static::buildSwatches(),
            'swatchesWithVars' => static::buildSwatchesWithVars(),
            'biases'           => static::buildBiases(),
            'saturations'      => static::buildSaturations(),
        ];
    }

    public static function buildBiases(): array
    {
        try {
            $global = GlobalSet::findByHandle('theme_settings');
            if (!$global) return [];
            $variables = $global->in(Site::default()->handle());
            if (!$variables) return [];

            return [
                'primary_color'    => (int) ($variables->get('primary_tones_bias')    ?? 0),
                'secondary_color'  => (int) ($variables->get('secondary_tones_bias')  ?? 0),
                'tertiary_color'   => (int) ($variables->get('tertiary_tones_bias')   ?? 0),
                'quaternary_color' => (int) ($variables->get('quaternary_tones_bias') ?? 0),
            ];
        } catch (\Throwable) {
            return [];
        }
    }

    public static function buildSaturations(): array
    {
        try {
            $global = GlobalSet::findByHandle('theme_settings');
            if (!$global) return [];
            $variables = $global->in(Site::default()->handle());
            if (!$variables) return [];

            return [
                'primary_color'    => (int) ($variables->get('primary_saturation')    ?? 0),
                'secondary_color'  => (int) ($variables->get('secondary_saturation')  ?? 0),
                'tertiary_color'   => (int) ($variables->get('tertiary_saturation')   ?? 0),
                'quaternary_color' => (int) ($variables->get('quaternary_saturation') ?? 0),
            ];
        } catch (\Throwable) {
            return [];
        }
    }

    public static function scale(string $hex, int $bias = 0, int $saturation = 0): array
    {
        [, $C, $H] = static::hexToOklch($hex);
        $offset   = $bias / 100 * 0.35;
        $scaleMax = self::LIGHTNESS_STEPS[0];                                   // 0.971
        $scaleMin = self::LIGHTNESS_STEPS[count(self::LIGHTNESS_STEPS) - 1];   // 0.122
        $span     = $scaleMax - $scaleMin;
        $minL     = max(0.05, $scaleMin + $offset);
        $maxL     = min(0.97, $scaleMax + $offset);
        $satMult  = max(0.0, 1 + $saturation / 100);

        return array_map(function ($stepL) use ($C, $H, $minL, $maxL, $scaleMin, $span, $satMult) {
            $t = ($stepL - $scaleMin) / $span;
            $L = $minL + $t * ($maxL - $minL);
            $chromaScale = min(1.0, $L * 2.0, (1.0 - $L) * 2.0);
            return static::oklchToHex($L, $C * $chromaScale * $satMult, $H);
        }, self::LIGHTNESS_STEPS);
    }

    // Scanner theme_settings dynamisk for alle *_color-felter.
    // Tilføjer man fx test_color i blueprintet, dukker --test-50..--test-950 automatisk op.
    public static function discoverPalettes($variables): array
    {
        return static::discoverPalettesFrom($variables->data()->all());
    }

    public static function discoverPalettesFrom(array $data): array
    {
        $palettes = [];

        foreach ($data as $key => $value) {
            if (! is_string($key) || ! str_ends_with($key, '_color')) {
                continue;
            }
            if (! $value || ! preg_match('/^#[0-9a-fA-F]{3,8}$/', (string) $value)) {
                continue;
            }

            $name       = substr($key, 0, -strlen('_color'));
            $palettes[] = [
                'name'  => $name,
                'color' => $key,
                'bias'  => $name.'_tones_bias',
                'sat'   => $name.'_saturation',
            ];
        }

        return $palettes;
    }

    private static function loadVariables()
    {
        $global = GlobalSet::findByHandle('theme_settings');
        if (! $global) return null;

        $vars = $global->in(Site::current()->handle())
            ?? $global->in(Site::default()->handle());
        if ($vars) return $vars;

        // Fallback: prøv alle sites
        foreach ($global->sites() as $handle) {
            $vars = $global->in($handle);
            if ($vars) return $vars;
        }

        return null;
    }

    // Returnerer [{hex, var}] — var er CSS-custom-property-navn (fx --primary-500).
    public static function buildSwatchesWithVars(): array
    {
        try {
            $variables = static::loadVariables();
            if (! $variables) {
                return [];
            }

            return static::buildSwatchesWithVarsFrom($variables->data()->all());
        } catch (\Throwable) {
            return [];
        }
    }

    /** Byg swatches fra et flat theme_settings-array (saved eller Live Preview-stash). */
    public static function buildSwatchesWithVarsFrom(array $data): array
    {
        $result = [];

        foreach (static::discoverPalettesFrom($data) as $palette) {
            $hex  = (string) ($data[$palette['color']] ?? '');
            if ($hex === '') {
                continue;
            }
            $bias = (int) ($data[$palette['bias']] ?? 0);
            $sat  = (int) ($data[$palette['sat']] ?? 0);
            $name = $palette['name'];
            $scale = static::scale($hex, $bias, $sat);

            // --primary = brand-hex (matcher Theme Settings). Trin 50–950 er afledte.
            $result[] = ['hex' => $hex, 'var' => "--{$name}"];

            foreach ($scale as $i => $scaleHex) {
                $step     = self::STEP_NAMES[$i] ?? ($i * 100);
                $result[] = ['hex' => $scaleHex, 'var' => "--{$name}-{$step}"];
            }
        }

        foreach (self::GRAY_STEPS as $i => $hex) {
            $step     = self::STEP_NAMES[$i] ?? ($i * 100);
            $result[] = ['hex' => $hex, 'var' => "--gray-{$step}"];
        }

        return $result;
    }

    public static function buildSwatches(): array
    {
        if (static::$cachedSwatches !== null) return static::$cachedSwatches;

        $withVars = static::buildSwatchesWithVars();
        if (empty($withVars)) return [];

        return static::$cachedSwatches = array_column($withVars, 'hex');
    }

    private static function neutralScale(): array
    {
        return self::GRAY_STEPS;
    }

    private static function hexToOklch(string $hex): array
    {
        [$r, $g, $b] = static::parseHex($hex);
        $toLinear = fn($c) => $c <= 0.04045 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4;
        $lr = $toLinear($r / 255);
        $lg = $toLinear($g / 255);
        $lb = $toLinear($b / 255);

        $l = 0.4122214708 * $lr + 0.5363325363 * $lg + 0.0514459929 * $lb;
        $m = 0.2119034982 * $lr + 0.6806995451 * $lg + 0.1073969566 * $lb;
        $s = 0.0883024619 * $lr + 0.2817188376 * $lg + 0.6299787005 * $lb;
        $l_ = $l ** (1/3); $m_ = $m ** (1/3); $s_ = $s ** (1/3);

        $L  =  0.2104542553 * $l_ + 0.7936177850 * $m_ - 0.0040720468 * $s_;
        $a  =  1.9779984951 * $l_ - 2.4285922050 * $m_ + 0.4505937099 * $s_;
        $b2 =  0.0259040371 * $l_ + 0.7827717662 * $m_ - 0.8086757660 * $s_;

        $C = sqrt($a * $a + $b2 * $b2);
        $H = atan2($b2, $a) * 180 / M_PI;
        return [$L, $C, $H];
    }

    private static function oklchToHex(float $L, float $C, float $H): string
    {
        $hRad = $H * M_PI / 180;
        $a = $C * cos($hRad);
        $b = $C * sin($hRad);

        $l_ = $L + 0.3963377774 * $a + 0.2158037573 * $b;
        $m_ = $L - 0.1055613458 * $a - 0.0638541728 * $b;
        $s_ = $L - 0.0894841775 * $a - 1.2914855480 * $b;
        $l = $l_ ** 3; $m = $m_ ** 3; $s = $s_ ** 3;

        $r  =  4.0767416621 * $l - 3.3077115913 * $m + 0.2309699292 * $s;
        $g  = -1.2684380046 * $l + 2.6097574011 * $m - 0.3413193965 * $s;
        $bv = -0.0041960863 * $l - 0.7034186147 * $m + 1.7076147010 * $s;

        $toSrgb = fn($c) => $c <= 0.0031308 ? 12.92 * $c : 1.055 * ($c ** (1/2.4)) - 0.055;
        $clamp  = fn($c) => max(0.0, min(1.0, $c));

        return static::toHex(
            (int) round($clamp($toSrgb($r))  * 255),
            (int) round($clamp($toSrgb($g))  * 255),
            (int) round($clamp($toSrgb($bv)) * 255),
        );
    }

    private static function parseHex(string $hex): array
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) {
            $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        }
        return [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
    }

    private static function toHex(int $r, int $g, int $b): string
    {
        return sprintf('#%02x%02x%02x', $r, $g, $b);
    }
}
