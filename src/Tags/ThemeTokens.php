<?php

namespace Vizuall\ColorScheme\Tags;

use Statamic\Tags\Tags;
use Vizuall\ColorScheme\Support\SiteCssColors;

/**
 * `{{ theme_tokens }}` — the theme colors from site.css' `@theme`, on `:root`.
 *
 * Put it after the site's stylesheet in the layout's `<head>`. Vite bakes
 * site.css into public/build at deploy, but Visual Editor saves the file on
 * the server between deploys; this reads it on every request, so a saved
 * color reaches the page without a build. The style is unlayered, so it wins
 * over Tailwind's `@layer theme`.
 */
class ThemeTokens extends Tags
{
    protected static $handle = 'theme_tokens';

    public function index(): string
    {
        $css = SiteCssColors::rootCss(SiteCssColors::all());

        return $css === '' ? '' : "<style>{$css}</style>";
    }
}
