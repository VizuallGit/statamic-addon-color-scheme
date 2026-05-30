<?php

namespace Vizuall\ColorScheme\Fieldtypes;

use Statamic\Fields\Fieldtype;

class ThemeColorScalePreview extends Fieldtype
{
    protected static $handle = 'theme_color_scale_preview';

    public function component(): string
    {
        return 'theme-color-scale-preview';
    }

    public function preload(): array
    {
        return [];
    }
}
