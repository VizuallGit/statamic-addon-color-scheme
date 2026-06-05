<?php

namespace Vizuall\ColorScheme\Marks;

use Tiptap\Core\Mark;

class ThemeColor extends Mark
{
    public static $name = 'themeColor';

    public function addAttributes()
    {
        return [
            'color' => [
                'default'     => null,
                'parseHTML'   => fn ($DOMNode) => $DOMNode->hasAttribute('style')
                    ? (preg_match('/(?:^|;)\s*color:\s*([^;]+)/', $DOMNode->getAttribute('style'), $m) ? trim($m[1]) : null)
                    : null,
                'renderHTML'  => fn ($attributes) => $attributes['color']
                    ? ['style' => 'color: ' . $attributes['color']]
                    : [],
            ],
        ];
    }

    public function parseHTML()
    {
        return [
            [
                'tag'     => 'span',
                'getAttrs' => fn ($DOMNode) => $DOMNode->hasAttribute('style')
                    && str_contains($DOMNode->getAttribute('style'), 'color:')
                    ? [] : false,
            ],
        ];
    }

    public function renderHTML($mark, $HTMLAttributes = [])
    {
        $color = $mark->attrs->color ?? null;

        if (! $color) {
            return ['span', $HTMLAttributes ?? [], 0];
        }

        $attrs = array_merge($HTMLAttributes ?? [], ['style' => 'color: ' . $color]);

        return ['span', $attrs, 0];
    }
}
