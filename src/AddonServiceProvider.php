<?php

namespace Vizuall\ColorScheme;

use Statamic\Fieldtypes\Bard\Augmentor;
use Statamic\Providers\AddonServiceProvider as BaseAddonServiceProvider;
use Statamic\Statamic;
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
    ];

    protected $scripts = [
        __DIR__.'/../resources/js/addon.js',
    ];

    protected $routes = [
        'cp' => __DIR__.'/../routes/cp.php',
    ];

    public function bootAddon(): void
    {
        Modifier::register('contrast_color', Modifiers\ContrastColor::class);
        Augmentor::addExtension('themeColor', new Marks\ThemeColor);

        Statamic::booted(function () {
            $swatches = Fieldtypes\ThemeColorPicker::buildSwatches();
            Statamic::provideToScript(['bard-color-picker' => [
                'swatches'  => $swatches,
                'allow_any' => true,
            ]]);
        });
    }
}
