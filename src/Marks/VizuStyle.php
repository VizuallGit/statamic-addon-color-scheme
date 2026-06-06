<?php

namespace Vizuall\ColorScheme\Marks;

use Tiptap\Core\Mark;

class VizuStyle extends Mark
{
    public static $name = 'vizuStyle';

    public function parseHTML()
    {
        return [
            ['tag' => 'span[data-vizu]'],
        ];
    }

    public function renderHTML($mark, $HTMLAttributes = [])
    {
        $style = $mark->attrs->style ?? null;
        if (! $style) return ['span', [], 0];
        return ['span', ['style' => $style], 0];
    }
}
