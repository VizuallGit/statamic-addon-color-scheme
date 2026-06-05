<?php

use Vizuall\ColorScheme\Fieldtypes\ThemeColorPicker;

Route::get('vizuall/swatches', function () {
    return response()->json(ThemeColorPicker::buildSwatches());
})->middleware('can:access cp');
