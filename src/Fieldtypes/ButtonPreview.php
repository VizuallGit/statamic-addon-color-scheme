<?php

namespace Vizuall\ColorScheme\Fieldtypes;

use Statamic\Fields\Fieldtype;

class ButtonPreview extends Fieldtype
{
    protected static $handle = 'button_preview';

    public function component(): string
    {
        return 'button-preview';
    }

    public function preProcess($value): array
    {
        if (is_array($value) && isset($value['bg'])) return $value;
        return ['bg' => '#4f46e5', 'text' => '#ffffff'];
    }

    public function process($value): array
    {
        if (is_array($value) && isset($value['bg'])) return $value;
        return ['bg' => '#4f46e5', 'text' => '#ffffff'];
    }
}
