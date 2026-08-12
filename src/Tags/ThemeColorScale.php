<?php

namespace Vizuall\ColorScheme\Tags;

use Statamic\Facades\GlobalSet;
use Statamic\Facades\Site;
use Statamic\Tags\Tags;
use Vizuall\ColorScheme\Fieldtypes\ThemeColorPicker;

class ThemeColorScale extends Tags
{
    protected static $handle = 'theme_color_scale';

    public function index(): string
    {
        try {
            $global = GlobalSet::findByHandle('theme_settings');
            if (! $global) return '';

            // Brug current site — OverrideGlobalsInPreview skriver på den samme
            // Variables-instans under Live Preview (sve_globals=1).
            $vars = $global->in(Site::current()->handle())
                ?? $global->in(Site::default()->handle());
            if (! $vars) return '';

            $lines = [];

            foreach (ThemeColorPicker::discoverPalettes($vars) as $palette) {
                $hex   = (string) $vars->get($palette['color']);
                $bias  = (int) ($vars->get($palette['bias']) ?? 0);
                $sat   = (int) ($vars->get($palette['sat'])  ?? 0);
                $scale = ThemeColorPicker::scale($hex, $bias, $sat);
                $name  = $palette['name'];

                // --primary = brand-hex fra Theme Settings (matcher farvefeltet).
                // Skala-trin 50–950 er afledte toner; --primary-brand er samme brand.
                $lines[] = "--{$name}: {$hex};";
                $lines[] = "--{$name}-brand: {$hex};";
                foreach (ThemeColorPicker::STEP_NAMES as $i => $step) {
                    $lines[] = "--{$name}-{$step}: {$scale[$i]};";
                }
            }

            return implode("\n            ", $lines);
        } catch (\Throwable) {
            return '';
        }
    }
}
