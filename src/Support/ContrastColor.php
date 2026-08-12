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

        // Farverne er custom properties — `var(--color-bg)` eller `--primary-500`.
        // Dem kan serveren ikke slå op: værdien findes først i browseren, hvor
        // kaskaden er kørt. Der er ikke noget rigtigt svar at give her, så der
        // gives det sikre: paletternes farver er typisk mørke, og lys tekst på
        // en mørk flade er læsbar. Skal kontrasten være rigtig, er det
        // `auto-contrast.js` der afgør den — den måler den resolvede værdi.
        if (str_starts_with($hex, 'var(') || str_starts_with($hex, '--')) {
            return 0.0;
        }

        if (strlen($hex) === 3) {
            $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        }

        // Alt andet end en hex-farve: samme svar som ovenfor, frem for en
        // advarsel fra hexdec() og en luminans regnet på ingenting.
        if (! preg_match('/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/', $hex)) {
            return 0.0;
        }

        [$r, $g, $b] = array_map('hexdec', str_split(substr($hex, 0, 6), 2));
        $lin = fn($c) => ($c /= 255) <= 0.04045 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4;

        return 0.2126 * $lin($r) + 0.7152 * $lin($g) + 0.0722 * $lin($b);
    }
}
