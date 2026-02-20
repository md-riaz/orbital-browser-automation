<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/artifacts/{job}/{file}', function (string $job, string $file) {
    // Validate job ID is UUID format
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $job)) {
        abort(404);
    }

    // Validate file is alphanumeric with extension
    if (!preg_match('/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|pdf|txt|json)$/i', $file)) {
        abort(404);
    }

    $path = "artifacts/{$job}/{$file}";

    if (!Storage::exists($path)) {
        abort(404);
    }

    return Storage::download($path);
})->name('artifacts.show');
