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

        // Front-end-halvdelen af kontrasten. En custom property kan ikke slås op
        // på serveren — værdien findes først når kaskaden er kørt — så
        // ContrastColor falder tilbage på lys tekst, og den her måler den
        // rigtige farve i browseren. Uden den er kontrasten et gæt.
        //
        // Udgives frem for at injiceres: det er sitets JS, ikke CP'ets, og
        // hvert site vælger selv om den skal bundles eller hentes som en fil.
        // Importér den i din site.js:
        //     import '../../public/vendor/color-scheme/js/auto-contrast.js';
        $this->publishes([
            __DIR__.'/../resources/js/auto-contrast.js' => public_path('vendor/color-scheme/js/auto-contrast.js'),
        ], 'color-scheme');

        Modifier::register('contrast_color', Modifiers\ContrastColor::class);
        Modifier::register('theme_color', Modifiers\ThemeColor::class);
        Modifier::register('highlight_color', Modifiers\HighlightColor::class);
    }
}
