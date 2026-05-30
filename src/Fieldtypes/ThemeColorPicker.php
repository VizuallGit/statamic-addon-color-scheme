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

    public function component(): string
    {
        return 'theme-color-picker';
    }

    public function preload(): array
    {
        return ['swatches' => static::buildSwatches()];
    }

    public static function scale(string $hex, int $bias = 0): array
    {
        [, $C, $H] = static::hexToOklch($hex);
        $offset = $bias / 100 * 0.35;

        return array_map(function ($stepL) use ($C, $H, $offset) {
            $L = max(0.05, min(0.97, $stepL + $offset));
            $chromaScale = min(1.0, $L * 2.0, (1.0 - $L) * 2.0);
            return static::oklchToHex($L, $C * $chromaScale, $H);
        }, self::LIGHTNESS_STEPS);
    }

    public static function buildSwatches(): array
    {
        if (static::$cachedSwatches !== null) return static::$cachedSwatches;

        try {
            $global = GlobalSet::findByHandle('theme_settings');
            if (!$global) return [];
            $variables = $global->in(Site::default()->handle());
            if (!$variables) return [];

            $swatches = [];

            foreach ([
                ['color' => 'primary_color',    'bias' => 'primary_tones_bias'],
                ['color' => 'secondary_color',  'bias' => 'secondary_tones_bias'],
                ['color' => 'tertiary_color',   'bias' => 'tertiary_tones_bias'],
                ['color' => 'quaternary_color', 'bias' => 'quaternary_tones_bias'],
            ] as $meta) {
                if (!($hex = $variables->get($meta['color']))) continue;
                $controlled = $variables->get(str_replace('_color', '_tones', $meta['color']));
                $bias = $controlled ? (int) ($variables->get($meta['bias']) ?? 0) : 0;
                array_push($swatches, ...static::scale($hex, $bias));
            }

            $tintHex = match ($variables->get('neutral_color')) {
                'from_primary'    => $variables->get('primary_color'),
                'from_secondary'  => $variables->get('secondary_color'),
                'from_tertiary'   => $variables->get('tertiary_color'),
                'from_quaternary' => $variables->get('quaternary_color'),
                default           => null,
            };

            array_push($swatches, ...static::neutralScale($tintHex));

            return static::$cachedSwatches = $swatches;
        } catch (\Throwable) {
            return [];
        }
    }

    private static function neutralScale(?string $tintHex): array
    {
        if (!$tintHex) return self::GRAY_STEPS;

        [, $pC, $pH] = static::hexToOklch($tintHex);
        $chroma = min($pC * 0.3, 0.025);

        return array_map(function (string $gray) use ($chroma, $pH) {
            [$gL] = static::hexToOklch($gray);
            return static::oklchToHex($gL, $chroma, $pH);
        }, self::GRAY_STEPS);
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
