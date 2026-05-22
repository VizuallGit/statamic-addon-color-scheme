<?php

namespace Vizuall\ColorScheme\Fieldtypes;

use Vizuall\ColorScheme\Support\ContrastColor;
use Statamic\Facades\GlobalSet;
use Statamic\Facades\Site;
use Statamic\Fields\Fieldtype;

class ColorSchemeSelector extends Fieldtype
{
    protected static $handle = 'color_scheme_selector';

    public function component(): string
    {
        return 'color-scheme-selector';
    }

    public function preload(): array
    {
        $cpBase   = '/' . config('statamic.cp.route', 'cp');
        $editBase = $cpBase . '/globals/theme_settings?cs=';

        $options = collect($this->getAllSchemes())
            ->filter(fn($s) => !empty($s['handle']) && ($s['enabled'] ?? true) !== false)
            ->values()
            ->map(fn($s, $i) => [
                'value'                  => $s['handle'],
                'index'                  => $i,
                'label'                  => $s['label']                  ?? 'Unavngivet',
                'text_color'             => $s['text_color']             ?? '#000000',
                'background_color'       => $s['background_color']       ?? '#ffffff',
                'inner_background_color' => $s['inner_background_color'] ?? null,
                'inner_text_color'       => $s['inner_text_color']       ?? null,
                'button_one_color'       => $s['button_one_color']       ?? '#333333',
                'button_one_text_color'  => $s['button_one_text_color']  ?? null,
                'button_two_color'       => $s['button_two_color']       ?? '#999999',
                'button_two_text_color'  => $s['button_two_text_color']  ?? null,
            ])
            ->toArray();

        return [
            'options'     => $options,
            'editBaseUrl' => $editBase,
        ];
    }

    public function augment($value): mixed
    {
        if (!$value) return null;
        $scheme = collect($this->getAllSchemes())->firstWhere('handle', $value);
        if (!$scheme) return null;

        ['light' => $light, 'dark' => $dark] = $this->getContrastColors();
        $scheme['button_one_text_color'] = ContrastColor::pick($scheme['button_one_color'] ?? '#333333', $light, $dark);
        $scheme['button_two_text_color'] = ContrastColor::pick($scheme['button_two_color'] ?? '#999999', $light, $dark);

        return $scheme;
    }

    private function getContrastColors(): array
    {
        try {
            $global = GlobalSet::findByHandle('theme_settings');
            $vars   = $global?->in(Site::default()->handle());
            return [
                'light' => $vars?->get('contrast_light') ?? '#ffffff',
                'dark'  => $vars?->get('contrast_dark')  ?? '#000000',
            ];
        } catch (\Throwable) {
            return ['light' => '#ffffff', 'dark' => '#000000'];
        }
    }

    private function getAllSchemes(): array
    {
        try {
            $global = GlobalSet::findByHandle('theme_settings');
            if (!$global) return [];
            $variables = $global->in(Site::default()->handle());
            return $variables?->get('color_schemes') ?? [];
        } catch (\Throwable) {
            return [];
        }
    }
}
