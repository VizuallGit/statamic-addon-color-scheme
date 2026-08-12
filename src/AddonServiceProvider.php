<?php

namespace Vizuall\ColorScheme;

use Statamic\Providers\AddonServiceProvider as BaseAddonServiceProvider;
use Statamic\Modifiers\Modifier;

class AddonServiceProvider extends BaseAddonServiceProvider
{
    protected $fieldtypes = [
        Fieldtypes\ColorSchemeSelector::class,
        Fieldtypes\ColorSchemePreview::class,
        Fieldtypes\ThemeColorPicker::class,
        Fieldtypes\ThemeColorScalePreview::class,
        Fieldtypes\ButtonPreview::class,
    ];

    protected $tags = [
        Tags\ThemeColorScale::class,
        // Farveskemaerne som JSON til front-end. Bliver stående så længe
        // skemaerne bruges — temafarve-vælgeren afløser dem først når den er
        // besluttet, og indtil da skal det her virke uændret.
        Tags\ColorSchemesJson::class,
    ];

    protected $scripts = [];

    protected $routes = [
        'cp' => __DIR__.'/../routes/cp.php',
    ];

    public function bootAddon(): void
    {
        // Cache-bust på indhold — ellers holder browseren fast i gammel addon.js
        // mens Scale Preview godt kan se ud til at virke (fra et ældre load).
        $script = __DIR__.'/../resources/js/addon.js';
        $this->publishes([
            $script => public_path('vendor/color-scheme/js/addon.js'),
        ], 'color-scheme');
        \Statamic\Statamic::script('color-scheme', 'addon.js?v='.md5_file($script));

        Modifier::register('contrast_color', Modifiers\ContrastColor::class);
        Modifier::register('theme_color', Modifiers\ThemeColor::class);
        Modifier::register('highlight_color', Modifiers\HighlightColor::class);
    }
}
