<?php

namespace App\Jobs;

use App\Models\AutomationJob;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Log;

class ExecuteWorkflowJob implements ShouldQueue
{
    use Queueable;

    public $timeout = 120; // 2 minutes max execution time

    /**
     * Create a new job instance.
     */
    public function __construct(public string $jobId)
    {
        //
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        $job = AutomationJob::find($this->jobId);

        if (!$job) {
            Log::error("Automation job {$this->jobId} not found");
            return;
        }

        // Mark job as running
        $job->markAsRunning();

        try {
            // Execute the Node.js worker
            $workerPath = base_path('browser-worker/worker.js');

            $result = Process::timeout($this->timeout)
                ->run("node {$workerPath} {$this->jobId}");

            if ($result->successful()) {
                // Refresh the job to get updated result from worker
                $job->refresh();

                if ($job->status !== 'completed') {
                    Log::warning("Worker completed but job status is {$job->status}");
                }
            } else {
                $errorOutput = $result->errorOutput();
                Log::error("Worker failed for job {$this->jobId}: {$errorOutput}");
                $job->markAsFailed("Worker execution failed: " . $errorOutput);
            }
        } catch (\Illuminate\Process\Exceptions\ProcessTimedOutException $e) {
            Log::error("Job {$this->jobId} timed out");
            $job->markAsTimeout();
        } catch (\Exception $e) {
            Log::error("Job {$this->jobId} failed: " . $e->getMessage());
            $job->markAsFailed($e->getMessage());
        }
    }

    /**
     * Handle a job failure.
     */
    public function failed(\Throwable $exception): void
    {
        $job = AutomationJob::find($this->jobId);
        if ($job) {
            $job->markAsFailed("Job failed: " . $exception->getMessage());
        }
    }
}
