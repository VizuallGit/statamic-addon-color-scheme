<?php

use Vizuall\ColorScheme\Fieldtypes\ThemeColorPicker;

Route::get('vizuall/swatches', function () {
    return response()->json(ThemeColorPicker::buildSwatchesWithVars());
})->middleware('can:access cp');

Route::get('vizuall/size-vars', function () {
    try {
        $global    = \Statamic\Facades\GlobalSet::findByHandle('theme_settings');
        $variables = $global?->in('default');
        $data      = $variables?->data() ?? collect();
        $sizeVars  = $data->get('fluid_sizes')['sizes_css'] ?? [];
    } catch (\Throwable $e) {
        $sizeVars = [];
    }
    return response()->json($sizeVars);
})->middleware('can:access cp');
