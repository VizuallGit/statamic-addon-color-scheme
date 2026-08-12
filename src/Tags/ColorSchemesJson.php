<?php

namespace Vizuall\ColorScheme\Tags;

use Vizuall\ColorScheme\Support\ContrastColor;
use Statamic\Tags\Tags;
use Symfony\Component\Yaml\Yaml;

class ColorSchemesJson extends Tags
{
    public static $handle = 'color_schemes_json';

    public function index(): string
    {
        $path = base_path('content/globals/default/theme_settings.yaml');
        if (!file_exists($path)) return '[]';

        $data = Yaml::parseFile($path);
        $schemes = $data['color_schemes'] ?? [];

        return collect($schemes)
            ->filter(fn($s) => $s['enabled'] ?? true)
            ->map(fn($s) => [
                'handle'    => $s['handle'] ?? '',
                'label'     => $s['label'] ?? '',
                'bg'        => $s['background_color'] ?? '',
                'text'      => $s['text_color'] ?? '',
                'innerBg'   => $s['inner_background_color'] ?? '',
                'innerText' => $s['inner_text_color'] ?? '',
                'btn1'      => $s['button_one_color'] ?? '',
                'btn1Text'  => ContrastColor::pick((string)($s['button_one_color'] ?? ''), '#ffffff', '#000000'),
                'btn1Hover' => $s['button_one_hover_color'] ?? '',
                'btn2'          => $s['button_two_color'] ?? '',
                'btn2Text'      => ContrastColor::pick((string)($s['button_two_color'] ?? ''), '#ffffff', '#000000'),
                'btn2Hover'     => $s['button_two_hover_color'] ?? '',
                'highlighted'   => $s['highlighted_color'] ?? '',
            ])
            ->values()
            ->pipe(fn ($c) => htmlspecialchars($c->toJson(), ENT_QUOTES, 'UTF-8'));
    }
}
