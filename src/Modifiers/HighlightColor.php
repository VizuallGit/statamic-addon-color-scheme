<?php

namespace Vizuall\ColorScheme\Modifiers;

use Statamic\Modifiers\Modifier;

class HighlightColor extends Modifier
{
    protected static $handle = 'highlight_color';

    /**
     * Convert `{accent}` segments into colored spans.
     *
     * Usage: {{ headline | highlight_color(color) | raw }}
     * Without a colour the braces are stripped so the plain words remain.
     * Bard leftovers (arrays) are flattened to plain text so old saves don't break.
     */
    public function index($value, $params, $context): string
    {
        $text = $this->toPlainText($value);

        if ($text === '') {
            return '';
        }

        if (! str_contains($text, '{')) {
            return e($text);
        }

        $color = isset($params[0]) ? trim((string) $params[0]) : '';

        if ($color === '' || ! $this->isSafeColor($color)) {
            return e((string) preg_replace('/\{([^{}]+)\}/', '$1', $text));
        }

        $parts = preg_split('/(\{[^{}]+\})/', $text, -1, PREG_SPLIT_DELIM_CAPTURE);
        $html = '';

        foreach ($parts as $part) {
            if ($part === '') {
                continue;
            }

            if (preg_match('/^\{([^{}]+)\}$/', $part, $match)) {
                $html .= '<span data-highlight style="color: '.$color.'">'.e($match[1]).'</span>';
            } else {
                $html .= e($part);
            }
        }

        return $html;
    }

    /** @param  mixed  $value */
    private function toPlainText($value): string
    {
        if (is_string($value) || is_numeric($value)) {
            return (string) $value;
        }

        if (! is_array($value)) {
            return '';
        }

        $out = '';

        $walk = function ($nodes) use (&$walk, &$out) {
            foreach ($nodes as $node) {
                if (! is_array($node)) {
                    continue;
                }

                if (isset($node['text']) && is_string($node['text'])) {
                    $colored = false;

                    foreach ($node['marks'] ?? [] as $mark) {
                        $style = $mark['attrs']['style'] ?? '';

                        if (is_string($style) && str_contains($style, 'color:')) {
                            $colored = true;
                            break;
                        }
                    }

                    $out .= $colored ? '{'.$node['text'].'}' : $node['text'];
                }

                if (isset($node['content']) && is_array($node['content'])) {
                    $walk($node['content']);
                }
            }
        };

        $walk($value);

        return $out;
    }

    private function isSafeColor(string $color): bool
    {
        if (preg_match('/^#[0-9a-fA-F]{3,8}$/', $color)) {
            return true;
        }

        if (preg_match('/^var\(\s*--[a-zA-Z0-9_-]+\s*\)$/', $color)) {
            return true;
        }

        if (preg_match('/^rgba?\([^)]+\)$/', $color)) {
            return true;
        }

        return false;
    }
}
