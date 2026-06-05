<?php

use Vizuall\ColorScheme\Fieldtypes\ThemeColorPicker;

Route::get('vizuall/swatches', function () {
    return response()->json(ThemeColorPicker::buildSwatchesWithVars());
})->middleware('can:access cp');
