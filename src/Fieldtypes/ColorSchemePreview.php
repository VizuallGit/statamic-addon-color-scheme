<?php

namespace Vizuall\ColorScheme\Fieldtypes;

use Statamic\Facades\Entry;
use Statamic\Facades\GlobalSet;
use Statamic\Facades\Site;
use Statamic\Fields\Fieldtype;

class ColorSchemePreview extends Fieldtype
{
    protected static $handle = 'color_scheme_preview';
    protected $selectable = false;

    public function component(): string
    {
        return 'color-scheme-preview';
    }

    public function preload(): array
    {
        return ['usages' => $this->buildUsageMap()];
    }

    public function preProcess($value): null { return null; }
    public function process($value): null    { return null; }

    private function buildUsageMap(): array
    {
        $map       = [];
        $cpBase    = '/' . config('statamic.cp.route', 'cp');
        $globalUrl = $cpBase . '/globals/theme_settings';

        try {
            $global = GlobalSet::findByHandle('theme_settings');
            if ($global) {
                $vars = $global->in(Site::default()->handle());
                $data = $vars->data()->all();

                foreach (['topbar' => 'Topbar', 'header' => 'Header', 'footer' => 'Footer'] as $key => $label) {
                    $scheme = data_get($data, "$key.settings.color_scheme");
                    if ($scheme) {
                        $map[$scheme][] = ['label' => $label, 'url' => $globalUrl];
                    }
                }
            }
        } catch (\Throwable) {}

        try {
            foreach (Entry::all() as $entry) {
                $title    = $entry->get('title') ?? $entry->slug();
                $sections = $entry->get('page_sections') ?? [];

                foreach ($sections as $index => $section) {
                    $scheme = data_get($section, 'settings.color_scheme');
                    if (!$scheme) continue;

                    $type      = $section['type'] ?? '';
                    $typeLabel = ucwords(str_replace(['/', '_'], [' / ', ' '], $type));

                    $map[$scheme][] = [
                        'label' => $title . ' — ' . $typeLabel,
                        'url'   => $entry->editUrl() . '#open=' . $index,
                    ];
                }
            }
        } catch (\Throwable) {}

        return $map;
    }
}
