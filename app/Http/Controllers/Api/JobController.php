<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AutomationJob;
use App\Jobs\ExecuteWorkflowJob;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;

class JobController extends Controller
{
    private const MAX_JSON_SIZE = 50 * 1024; // 50KB
    private const MAX_STEPS = 25;
    private const ALLOWED_ACTIONS = ['goto', 'wait', 'click', 'type', 'waitForSelector', 'screenshot', 'waitForDownload', 'evaluate'];

    public function store(Request $request): JsonResponse
    {
        // Check JSON size
        $jsonSize = strlen($request->getContent());
        if ($jsonSize > self::MAX_JSON_SIZE) {
            return response()->json([
                'error' => 'Request payload exceeds maximum size of 50KB'
            ], 413);
        }

        // Validate workflow structure
        $validator = Validator::make($request->all(), [
            'workflow' => 'required|array',
            'workflow.steps' => 'required|array|min:1|max:' . self::MAX_STEPS,
            'workflow.steps.*.action' => 'required|string|in:' . implode(',', self::ALLOWED_ACTIONS),
            'options' => 'sometimes|array',
            'options.timeout' => 'sometimes|integer|min:1000|max:120000',
            'options.viewport' => 'sometimes|array',
            'options.viewport.width' => 'required_with:options.viewport|integer|min:100|max:3840',
            'options.viewport.height' => 'required_with:options.viewport|integer|min:100|max:2160',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $validator->errors()
            ], 422);
        }

        // Validate each step based on action type
        $steps = $request->input('workflow.steps');
        foreach ($steps as $index => $step) {
            $stepValidator = $this->validateStep($step);
            if ($stepValidator->fails()) {
                return response()->json([
                    'error' => "Step {$index} validation failed",
                    'details' => $stepValidator->errors()
                ], 422);
            }

            // Security: Check for SSRF and file:// URLs
            if (isset($step['url'])) {
                $securityError = $this->validateUrl($step['url']);
                if ($securityError) {
                    return response()->json([
                        'error' => "Step {$index}: {$securityError}"
                    ], 422);
                }
            }
        }

        // Create automation job
        $job = AutomationJob::create([
            'status' => 'pending',
            'workflow_json' => $request->all(),
        ]);

        // Dispatch to queue
        ExecuteWorkflowJob::dispatch($job->id);

        return response()->json([
            'job_id' => $job->id,
            'status' => $job->status
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $job = AutomationJob::find($id);

        if (!$job) {
            return response()->json([
                'error' => 'Job not found'
            ], 404);
        }

        $response = [
            'job_id' => $job->id,
            'status' => $job->status,
            'created_at' => $job->created_at->toIso8601String(),
        ];

        if ($job->status === 'completed' && $job->result_json) {
            $response['result'] = $job->result_json;
        }

        if ($job->status === 'failed' && $job->error_message) {
            $response['error'] = $job->error_message;
        }

        if ($job->started_at) {
            $response['started_at'] = $job->started_at->toIso8601String();
        }

        if ($job->finished_at) {
            $response['finished_at'] = $job->finished_at->toIso8601String();
        }

        return response()->json($response);
    }

    private function validateStep(array $step): \Illuminate\Validation\Validator
    {
        $rules = match ($step['action']) {
            'goto' => ['url' => 'required|string|url'],
            'wait' => ['duration' => 'required|integer|min:0|max:60000'],
            'click' => ['selector' => 'required|string'],
            'type' => ['selector' => 'required|string', 'value' => 'required|string'],
            'waitForSelector' => ['selector' => 'required|string'],
            'screenshot' => ['fullPage' => 'sometimes|boolean'],
            'waitForDownload' => [],
            'evaluate' => ['script' => 'required|string'],
            default => [],
        };

        return Validator::make($step, $rules);
    }

    private function validateUrl(string $url): ?string
    {
        // Reject file:// URLs
        if (str_starts_with(strtolower($url), 'file://')) {
            return 'file:// URLs are not allowed';
        }

        // Parse URL
        $parsed = parse_url($url);
        if (!$parsed || !isset($parsed['host'])) {
            return 'Invalid URL format';
        }

        $host = $parsed['host'];

        // Check for IP addresses
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            // Reject private/internal IP ranges (SSRF protection)
            if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
                return 'Internal/private IP addresses are not allowed';
            }
        } else {
            // For hostnames, resolve and check IPs
            $ips = @gethostbynamel($host);
            if ($ips) {
                foreach ($ips as $ip) {
                    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
                        return 'Hostname resolves to internal/private IP address';
                    }
                }
            }
        }

        return null;
    }
}
