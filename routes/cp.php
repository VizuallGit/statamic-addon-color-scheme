<?php

use Illuminate\Support\Facades\Cache;
use Vizuall\ColorScheme\Fieldtypes\ThemeColorPicker;

Route::get('color-scheme/swatches', function () {
    ThemeColorPicker::clearSwatchCache();

    // Ugemte theme_settings fra Visual Editor Live Preview-stash (hvis aktiv).
    try {
        $overrides = Cache::get('sve-globals-preview.'.session()->getId(), []);
        $raw = $overrides['theme_settings'] ?? null;
        if (is_array($raw) && $raw !== []) {
            return response()->json(ThemeColorPicker::buildSwatchesWithVarsFrom($raw));
        }
    } catch (\Throwable) {
        // Fald tilbage til gemte globals.
    }

    return response()->json(ThemeColorPicker::buildSwatchesWithVars());
})->middleware('can:access cp');
