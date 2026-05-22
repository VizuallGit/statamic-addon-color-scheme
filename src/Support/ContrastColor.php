<?php

namespace Vizuall\ColorScheme\Support;

class ContrastColor
{
    public static function pick(string $bg, string $light, string $dark): string
    {
        return self::luminance($bg) > 0.179 ? $dark : $light;
    }

    private static function luminance(string $hex): float
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) {
            $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        }
        [$r, $g, $b] = array_map('hexdec', str_split($hex, 2));
        $lin = fn($c) => ($c /= 255) <= 0.04045 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4;
        return 0.2126 * $lin($r) + 0.7152 * $lin($g) + 0.0722 * $lin($b);
    }
}
