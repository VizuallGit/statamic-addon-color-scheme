<?php

namespace Vizuall\ColorScheme\Marks;

use Tiptap\Core\Mark;

class VizuSpanClass extends Mark
{
    public static $name = 'vizuSpanClass';

    public function addAttributes()
    {
        return [
            'class' => [
                'default'    => null,
                'parseHTML'  => fn ($node) => $node->getAttribute('data-vsc') ?: null,
                'renderHTML' => fn ($attributes) => $attributes->class
                    ? ['data-vsc' => $attributes->class, 'class' => $attributes->class]
                    : [],
            ],
        ];
    }

    public function parseHTML()
    {
        return [['tag' => 'span[data-vsc]']];
    }

    public function renderHTML($mark, $HTMLAttributes = [])
    {
        $class = $mark->attrs->class ?? null;
        if (! $class) return ['span', [], 0];
        return ['span', ['data-vsc' => $class, 'class' => $class], 0];
    }
}
