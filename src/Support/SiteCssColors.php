<?php

namespace Vizuall\ColorScheme\Support;

/**
 * The theme colors written in the site's site.css `@theme`:
 * `--color-primary-900: #11121b;` → `['primary-900' => '#11121b']`, in file order.
 *
 * A site that keeps its colors there has one source for them: Visual Editor's
 * color panel writes the file, `{{ theme_tokens }}` serves it on `:root` at
 * request time (no build), and the pickers offer the same list. A site whose
 * `@theme` only points at variables (`--color-primary: var(--primary)`) gets
 * an empty list and keeps using theme_settings.
 *
 * Only literal colors are read. A token that points at another variable, like
 * `--color-contrast-light: var(--contrast-light)`, is left to site.css.
 */
class SiteCssColors
{
    private const DECL = '/--color-([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^;]*\))\s*;/';

    /** @var array{0: int, 1: array<string, string>}|null */
    private static ?array $memo = null;

    /** @return array<string, string> */
    public static function all(): array
    {
        $path = resource_path('css/site.css');
        $mtime = @filemtime($path);

        if ($mtime === false) {
            return [];
        }

        if (static::$memo !== null && static::$memo[0] === $mtime) {
            return static::$memo[1];
        }

        $colors = static::parse((string) @file_get_contents($path));
        static::$memo = [$mtime, $colors];

        return $colors;
    }

    /** @return array<string, string> */
    public static function parse(string $css): array
    {
        preg_match_all('/@theme\b[^{]*\{([^}]*)\}/', $css, $blocks);

        $colors = [];

        foreach ($blocks[1] as $block) {
            preg_match_all(self::DECL, $block, $matches, PREG_SET_ORDER);

            foreach ($matches as [, $name, $value]) {
                $colors[$name] = $value;
            }
        }

        return $colors;
    }

    /**
     * Each color as `{{ theme_tokens }}` puts it on `:root`: `--color-x`, plus
     * the short `--x: var(--color-x)` that templates, CSS and saved field
     * values (`var(--primary-600)`) use.
     *
     * @param  array<string, string>  $colors
     */
    public static function rootCss(array $colors): string
    {
        $lines = [];

        foreach ($colors as $name => $value) {
            $lines[] = "--color-{$name}: {$value};";
            $lines[] = "--{$name}: var(--color-{$name});";
        }

        return $lines ? ':root{'.implode('', $lines).'}' : '';
    }
}
