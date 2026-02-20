<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class AutomationJob extends Model
{
    use HasUuids;

    protected $table = 'automation_jobs';

    protected $fillable = [
        'status',
        'workflow_json',
        'result_json',
        'error_message',
        'attempts',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'workflow_json' => 'array',
        'result_json' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function markAsRunning(): void
    {
        $this->update([
            'status' => 'running',
            'started_at' => now(),
            'attempts' => $this->attempts + 1,
        ]);
    }

    public function markAsCompleted(array $result): void
    {
        $this->update([
            'status' => 'completed',
            'result_json' => $result,
            'finished_at' => now(),
        ]);
    }

    public function markAsFailed(string $errorMessage): void
    {
        $this->update([
            'status' => 'failed',
            'error_message' => $errorMessage,
            'finished_at' => now(),
        ]);
    }

    public function markAsTimeout(): void
    {
        $this->update([
            'status' => 'timeout',
            'error_message' => 'Execution timed out',
            'finished_at' => now(),
        ]);
    }
}
