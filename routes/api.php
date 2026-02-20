<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\JobController;

Route::prefix('v1')->group(function () {
    Route::post('/jobs', [JobController::class, 'store']);
    Route::get('/jobs/{id}', [JobController::class, 'show']);
});
