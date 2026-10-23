<?php

namespace Vizuall\ColorScheme\Support;

/**
 * The theme colors written in the site's site.css `@theme`:
 * `--color-primary-900: #11121b;` → `['primary-900' => '#11121b']`, in file order.
 *
 * A site that keeps its colors there has one source for them: Visual Editor's
 * theme panel writes the file, the site's `{{ theme_tokens }}` tag serves it
 * on `:root` at request time (no build), and the pickers offer the same list.
 * A site whose `@theme` only points at variables (`--color-primary:
 * var(--primary)`) gets an empty list and keeps using theme_settings.
 *
 * Literal colors are read, and a color that points at one of them — a
 * highlight from the theme panel, `--color-highlight-1: var(--color-primary-500);`
 * → `['highlight-1' => '#223344']`, so the pickers and Bard offer it beside the
 * palette and a value saved as `var(--highlight-1)` follows the color it points
 * at. A token that points at anything else, like `--color-contrast-light:
 * var(--contrast-light)`, is left to site.css.
 */
class SiteCssColors
{
    private const DECL = '/--color-([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^;]*\)|var\(\s*--color-[\w-]+\s*\))\s*;/';

    private const POINTER = '/^var\(\s*--color-([\w-]+)\s*\)$/';

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

        $found = [];

        foreach ($blocks[1] as $block) {
            preg_match_all(self::DECL, $block, $matches, PREG_SET_ORDER);

            foreach ($matches as [, $name, $value]) {
                $found[$name] = $value;
            }
        }

        // A pointer takes the color it points at; one that points at nothing
        // we have (or at itself, or round in a ring) is left out.
        $colors = [];

        foreach ($found as $name => $value) {
            $resolved = static::follow($name, $found);

            if ($resolved !== null) {
                $colors[$name] = $resolved;
            }
        }

        return $colors;
    }

    /** @param array<string, string> $found */
    private static function follow(string $name, array $found): ?string
    {
        $seen = [];

        while (isset($found[$name]) && ! isset($seen[$name])) {
            $seen[$name] = true;

            if (! preg_match(self::POINTER, $found[$name], $m)) {
                return $found[$name];
            }

            $name = $m[1];
        }

        return null;
    }
}
