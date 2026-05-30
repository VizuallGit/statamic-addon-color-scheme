<?php

namespace Vizuall\ColorScheme\Tags;

use Statamic\Facades\GlobalSet;
use Statamic\Facades\Site;
use Statamic\Tags\Tags;
use Vizuall\ColorScheme\Fieldtypes\ThemeColorPicker;

class ThemeColorScale extends Tags
{
    protected static $handle = 'theme_color_scale';

    private const STEP_NAMES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

    private const COLORS = [
        ['name' => 'primary',    'color' => 'primary_color',    'bias' => 'primary_tones_bias'],
        ['name' => 'secondary',  'color' => 'secondary_color',  'bias' => 'secondary_tones_bias'],
        ['name' => 'tertiary',   'color' => 'tertiary_color',   'bias' => 'tertiary_tones_bias'],
        ['name' => 'quaternary', 'color' => 'quaternary_color', 'bias' => 'quaternary_tones_bias'],
    ];

    public function index(): string
    {
        try {
            $global = GlobalSet::findByHandle('theme_settings');
            if (!$global) return '';
            $vars = $global->in(Site::default()->handle());
            if (!$vars) return '';

            $lines = [];

            foreach (self::COLORS as $meta) {
                $hex = $vars->get($meta['color']);
                if (!$hex) continue;

                $bias = (int) ($vars->get($meta['bias']) ?? 0);
                $scale = ThemeColorPicker::scale($hex, $bias);
                $name  = $meta['name'];

                $lines[] = "--{$name}: {$hex};";
                foreach (self::STEP_NAMES as $i => $step) {
                    $lines[] = "--{$name}-{$step}: {$scale[$i]};";
                }
            }

            return implode("\n            ", $lines);
        } catch (\Throwable) {
            return '';
        }
    }
}
