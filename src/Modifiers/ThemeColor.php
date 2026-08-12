<?php

namespace Vizuall\ColorScheme\Modifiers;

use Statamic\Modifiers\Modifier;
use Vizuall\ColorScheme\Fieldtypes\ThemeColorPicker;

class ThemeColor extends Modifier
{
    /**
     * Resolvér var(--primary-950) → aktuel hex (inkl. lysniveau/saturation).
     * Hex og andre værdier sendes uændret igennem.
     */
    public function index($value, $params, $context): mixed
    {
        return ThemeColorPicker::resolveStoredColor($value);
    }
}
