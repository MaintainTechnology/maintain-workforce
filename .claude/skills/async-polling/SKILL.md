---
name: async-polling
description: Apply the browser-direct async polling pattern for any feature that calls a VectorShift pipeline and needs to wait for results. Use when building a new page/component that submits data to VectorShift, needs progress tracking, result storage in DB, cancellation, and resume-after-reload. This skill provides the exact code templates, API routes, and frontend utilities to wire up a new VectorShift-backed feature using the proven architecture from the biomarker analysis dashboard.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Async Polling for VectorShift Pipelines

## When to Use

Use this skill when you need to:
- Build a new feature that sends data to a VectorShift pipeline and waits for results
- Add async analysis to a new page (e.g., a new report type, chatbot, or AI processing feature)
- Replicate the biomarker analysis pattern for a different pipeline
- Fix or extend the existing polling infrastructure

## Architecture Summary

The pattern uses **browser-direct synchronous calls** to VectorShift with DB-backed status tracking:

```
Browser                         Our API                      VectorShift
  |                               |                              |
  |-- POST /start-async --------->|  (register task in DB)       |
  |<-- { taskId } ---------------|                              |
  |                               |                              |
  |-- POST /get-upload-url ------>|  (return VS credentials)     |
  |<-- { uploadUrl, auth } ------|                              |
  |                               |                              |
  |-- POST uploadUrl (DIRECT) ---|----------------------------->|
  |   (fire-and-forget IIFE)     |                    (processing 2-15 min)
  |                               |                              |
  |-- GET /status/{taskId} ------>|  (read DB)                   |
  |<-- { status: running } ------|                              |
  |   ... poll every 5s ...       |                              |
  |                               |                              |
  |   (VS responds to browser)  <|------------------------------|
  |-- POST /store-result -------->|  (save result to DB)         |
  |                               |                              |
  |-- GET /status/{taskId} ------>|  (read DB)                   |
  |<-- { status: completed, result } |                           |
```

### Why This Pattern

| Alternative | Why it doesn't work |
|---|---|
| VectorShift `background:true` | Returns `{status: "completed"}` with NO output data for many pipelines |
| Server-side sync via `after()` | Vercel kills long-running `after()` calls; VS drops server connections after ~10 min |
| Server-side proxy | Vercel serverless functions timeout (max 300s, pipelines can take 10-15 min) |
| **Browser-direct sync** | No timeout limit on browser `fetch` - works for 15+ minute pipelines |

---

## Reference Implementation

Read the full code documentation: `docs/codereuse/biomarker-analysis-pipeline.md`

---

## Step-by-Step: Add a New VectorShift Feature

### Step 1: Register Your Pipeline ID

**File:** `src/app/api/vectorshift/lip-pipeline/start-async/route.ts`

Add your pipeline ID to `PIPELINE_TYPE_MAP`:

```typescript
const PIPELINE_TYPE_MAP: Record<string, string> = {
  // ... existing entries ...
  'YOUR_PIPELINE_ID': 'your_feature_name',
};
```

Also update the enum in `shared/schema.ts` if you need a new pipeline type:

```typescript
export const vectorshiftPipelineTypeEnum = pgEnum('vectorshift_pipeline_type', [
  'lip_basic',
  'lip_advanced',
  'knowledge_assistant',
  // Add your new type here:
  'your_feature_name',
]);
```

### Step 2: Create Your Input Builder

Build the inputs object matching your VectorShift pipeline's expected input schema. The structure depends on your pipeline's input nodes.

```typescript
// Example: your feature's input builder
function buildYourFeatureInputs(userFormData: YourFormData): Record<string, any> {
  return {
    // Map to your pipeline's input node names exactly
    input_0: userFormData.mainContent,
    Other_files: userFormData.files.map(file => ({
      metadata: {
        name: file.name,
        mime_type: file.type || "application/octet-stream",
      },
      raw_bytes: file.base64Data, // base64-encoded, no data URL prefix
      type: "file",
    })),
    language: userFormData.language || "English",
    // ... any other pipeline inputs
  };
}
```

### File Encoding Helper

Convert `File` objects to VectorShift's expected base64 format:

```typescript
async function encodeFileForVectorShift(file: File): Promise<{
  metadata: { name: string; mime_type: string };
  raw_bytes: string;
  type: "file";
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const base64Data = base64.split(",")[1]; // Strip data URL prefix
      if (!base64Data) {
        reject(new Error(`Failed to encode file: ${file.name}`));
        return;
      }
      resolve({
        metadata: {
          name: file.name,
          mime_type: file.type || "application/octet-stream",
        },
        raw_bytes: base64Data,
        type: "file",
      });
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}
```

### Step 3: Call the Pipeline from Your Component

Import and use `runAsyncLIPPipeline` from the shared utility:

```typescript
import {
  runAsyncLIPPipeline,
  resumeAsyncLIPPipeline,
  cancelLIPPipeline,
} from "@/utils/lipPipelineAsync";

// In your component:
const [isProcessing, setIsProcessing] = useState(false);
const [progress, setProgress] = useState(0);
const [progressMessage, setProgressMessage] = useState("");
const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
const abortControllerRef = useRef<AbortController | null>(null);

const handleSubmit = async () => {
  setIsProcessing(true);
  setProgress(0);

  const abortController = new AbortController();
  abortControllerRef.current = abortController;

  try {
    const inputs = buildYourFeatureInputs(formData);

    const result = await runAsyncLIPPipeline(
      inputs,
      "YOUR_PIPELINE_ID",
      // onProgress callback
      (progress, message) => {
        setProgress(progress);
        setProgressMessage(message);
      },
      // onPollUpdate (optional)
      undefined,
      // onTaskIdReceived - save for cancellation + resume
      (taskId) => {
        setCurrentTaskId(taskId);
        // Persist to localStorage for resume after page reload
        localStorage.setItem("your-feature-running-task", JSON.stringify({
          taskId,
          pipelineId: "YOUR_PIPELINE_ID",
          startedAt: Date.now(),
        }));
      },
      // abort signal for cancellation
      abortController.signal
    );

    if (result.success) {
      const outputs = result.outputs || {};
      // Extract your pipeline's specific output keys
      const report = outputs.output_0 || outputs.your_output_key || "";
      const visual = outputs.Visual_Report || outputs.your_visual_key || "";
      // Display results...
    } else {
      throw new Error(result.error || "Pipeline failed");
    }
  } catch (err: any) {
    // Handle error...
  } finally {
    setIsProcessing(false);
    setCurrentTaskId(null);
    localStorage.removeItem("your-feature-running-task");
  }
};
```

### Step 4: Add Cancellation

```typescript
const handleCancel = async () => {
  // Abort the polling loop
  abortControllerRef.current?.abort();

  // Tell VectorShift to stop processing
  if (currentTaskId) {
    await cancelLIPPipeline("YOUR_PIPELINE_ID", currentTaskId);
  }

  setIsProcessing(false);
  setProgress(0);
  setCurrentTaskId(null);
  localStorage.removeItem("your-feature-running-task");
};
```

### Step 5: Add Resume After Page Reload

```typescript
useEffect(() => {
  // Check if there's a running task from before page reload
  const stored = localStorage.getItem("your-feature-running-task");
  if (!stored) return;

  const task = JSON.parse(stored);
  const elapsed = Date.now() - task.startedAt;
  const MAX_AGE = 60 * 60 * 1000; // 60 minutes

  if (elapsed > MAX_AGE) {
    localStorage.removeItem("your-feature-running-task");
    return;
  }

  // Resume polling
  setIsProcessing(true);
  setCurrentTaskId(task.taskId);

  const abortController = new AbortController();
  abortControllerRef.current = abortController;

  resumeAsyncLIPPipeline(
    task.taskId,
    task.pipelineId,
    (progress, message) => {
      setProgress(progress);
      setProgressMessage(message);
    },
    undefined,
    abortController.signal
  ).then((result) => {
    if (result.success) {
      const outputs = result.outputs || {};
      // Extract and display results...
    }
    setIsProcessing(false);
    localStorage.removeItem("your-feature-running-task");
  });
}, []);
```

### Step 6: Create Your Output Extractor

Each VectorShift pipeline has different output key names. Create an extractor function:

```typescript
function extractYourFeatureResults(outputs: Record<string, any>): {
  textReport: string;
  visualReport: string;
} {
  // Try multiple possible key names (VectorShift is inconsistent)
  const textReport =
    outputs.output_0 ||
    outputs.your_text_key ||
    outputs.text_report ||
    "";

  let visualReport =
    outputs.Visual_Report ||
    outputs.your_visual_key ||
    outputs.html_report ||
    "";

  // Fallback: scan all keys for HTML content
  if (!visualReport) {
    for (const [key, value] of Object.entries(outputs)) {
      if (
        typeof value === "string" &&
        (value.trim().startsWith("<!DOCTYPE") ||
          value.trim().startsWith("<html"))
      ) {
        visualReport = value;
        break;
      }
    }
  }

  return { textReport, visualReport };
}
```

---

## Shared Infrastructure (Already Built)

These files are **pipeline-agnostic** and shared across all VectorShift features. Do NOT duplicate them:

### Frontend Utility
| File | Exports | Purpose |
|------|---------|---------|
| `src/utils/lipPipelineAsync.ts` | `runAsyncLIPPipeline()` | Start pipeline + poll for result |
| | `resumeAsyncLIPPipeline()` | Resume polling after page reload |
| | `cancelLIPPipeline()` | Cancel a running pipeline |

### API Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/vectorshift/lip-pipeline/start-async` | POST | Register task in DB, return taskId |
| `/api/vectorshift/lip-pipeline/status/[taskId]` | GET | Check pipeline status from DB |
| `/api/vectorshift/lip-pipeline/store-result` | POST | Save VectorShift result to DB |
| `/api/vectorshift/get-upload-url` | POST | Return VS API URL + auth header |
| `/api/vectorshift/lip-pipeline/[pipelineId]/terminate` | POST | Cancel running pipeline |
| `/api/vectorshift/lip-pipeline/update-run-id` | POST | Update VS run_id for a task |

### Database
| Table | Schema File | Purpose |
|-------|-------------|---------|
| `vectorshift_pipeline_runs` | `shared/schema.ts:744` | Track all pipeline runs, store results |

### Environment Variables
| Variable | Purpose |
|----------|---------|
| `VECTORSHIFT_API_KEY` | VectorShift API authentication |

---

## Progress Tracking

The `calculateProgressFromResult()` function in `lipPipelineAsync.ts` determines progress based on which output keys exist. It currently handles two pipeline types:

### Biomarker Pipeline Keys
| Key | Progress | Meaning |
|-----|----------|---------|
| (none) | 5-45% | Time-based estimation |
| `output_0` | 50% | Text report generated |
| `output_0` + `credits_node_1` | 60% | Stage 1 complete |
| `Visual_Report` | 90% | Visual report generated |
| `Visual_Report` + `credits_node_2` | 95% | Stage 2 complete |

### Advanced Pipeline Keys
| Key | Progress | Meaning |
|-----|----------|---------|
| `final_report_output` | 60% | Text report complete |
| `visual_report_output` / `output_1` | 85% | Visual report generated |
| Both | 95% | Finalizing |

### Adding Progress for a New Pipeline

If your pipeline has different output keys, update `calculateProgressFromResult()` in `lipPipelineAsync.ts`:

```typescript
function calculateProgressFromResult(result: any, pollCount: number) {
  // ... existing biomarker + advanced checks ...

  // --- Your new pipeline progress ---
  const hasYourOutput1 = !!(result.your_key_1);
  const hasYourOutput2 = !!(result.your_key_2);

  if (hasYourOutput1 && hasYourOutput2) {
    return { progress: 95, message: 'Finalizing your report...' };
  }
  if (hasYourOutput1) {
    return { progress: 60, message: 'Stage 1 complete, processing...' };
  }

  // ... fallback to time-based ...
}
```

---

## Error Handling

The biomarker dashboard maps raw VectorShift errors to user-friendly messages. Reuse or extend:

**File:** `src/views/LongevityIntelligenceCore.tsx` (line ~93)

```typescript
const PIPELINE_ERROR_MAP: { pattern: RegExp; friendly: FriendlyError }[] = [
  { pattern: /mistral.*ocr.*file.*parsing.*failed/i, friendly: { message: "OCR couldn't read your file", retryable: true } },
  { pattern: /timeout|timed out/i, friendly: { message: "Analysis timed out", retryable: true } },
  { pattern: /rate limit|429/i, friendly: { message: "High traffic", retryable: true } },
  { pattern: /empty.*response/i, friendly: { message: "No biomarker data detected", retryable: true } },
  { pattern: /500|internal.*server/i, friendly: { message: "Temporary server issue", retryable: true } },
];
```

Consider extracting this to a shared utility if multiple pages need error mapping.

---

## Polling Configuration

| Parameter | Value | Notes |
|-----------|-------|-------|
| Poll interval | 5 seconds | Hardcoded in `lipPipelineAsync.ts` |
| Max polls | 720 | 60 minutes total (720 * 5s) |
| Max consecutive failures | 10 | Aborts after 10 failed status checks in a row |
| Resume max polls | 360 | 30 minutes for resumed tasks |

---

## Checklist for New Feature

Before shipping a new VectorShift-backed feature:

- [ ] Pipeline ID added to `PIPELINE_TYPE_MAP` in `start-async/route.ts`
- [ ] Pipeline type added to enum in `shared/schema.ts` (if new type)
- [ ] Input builder maps to your pipeline's exact input node names
- [ ] Files encoded as `{ metadata: { name, mime_type }, raw_bytes: base64, type: "file" }`
- [ ] Output extractor handles your pipeline's specific output key names
- [ ] Progress tracking updated in `calculateProgressFromResult()` (if new keys)
- [ ] Cancellation wired to abort controller + `cancelLIPPipeline()`
- [ ] Resume-after-reload persists `{ taskId, pipelineId, startedAt }` in localStorage
- [ ] Error messages mapped to user-friendly text
- [ ] Tested with real pipeline (not just mocked)
