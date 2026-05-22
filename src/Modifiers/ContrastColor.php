<?php

namespace Vizuall\ColorScheme\Modifiers;

use Vizuall\ColorScheme\Support\ContrastColor as ContrastColorHelper;
use Statamic\Modifiers\Modifier;

class ContrastColor extends Modifier
{
    protected static $handle = 'contrast_color';

    public function index($value, $params, $context): string
    {
        $light = $params[0] ?? '#ffffff';
        $dark  = $params[1] ?? '#000000';
        return ContrastColorHelper::pick((string) $value, $light, $dark);
    }
}
