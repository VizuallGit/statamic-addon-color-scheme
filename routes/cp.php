<?php

use Vizuall\ColorScheme\Fieldtypes\ThemeColorPicker;

Route::get('color-scheme/swatches', function () {
    return response()->json(ThemeColorPicker::buildSwatchesWithVars());
})->middleware('can:access cp');
