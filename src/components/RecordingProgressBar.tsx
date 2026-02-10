import { Progress } from "@/components/ui/progress";
import { AlertCircle, Check } from "lucide-react";

interface RecordingProgressBarProps {
  /** Current duration in seconds (live while recording, or last recorded when idle) */
  durationSeconds: number;
  /** True when recording is in progress (show "Recording: 0:23" and tick) */
  isRecording: boolean;
  minSeconds: number;
  showValidationError: boolean;
  showValidationSuccess?: boolean;
}

const MILESTONES_SEC = [
  { seconds: 20, label: "Minimum" },
  { seconds: 45, label: "Good" },
  { seconds: 90, label: "Great" },
  { seconds: 120, label: "Excellent" },
];

const formatDuration = (seconds: number): string => {
  const totalSec = Math.floor(seconds);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const RecordingProgressBar = ({
  durationSeconds,
  isRecording,
  minSeconds,
  showValidationError,
  showValidationSuccess = false,
}: RecordingProgressBarProps) => {
  const maxMilestone = MILESTONES_SEC[MILESTONES_SEC.length - 1].seconds;
  const progressValue = Math.min((durationSeconds / maxMilestone) * 100, 100);
  const isMinimumMet = durationSeconds >= minSeconds;

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="relative">
        <Progress value={progressValue} className="h-2" />
        <div className="absolute top-0 left-0 right-0 h-2 pointer-events-none">
          {MILESTONES_SEC.map((milestone) => {
            const position = (milestone.seconds / maxMilestone) * 100;
            return (
              <div
                key={milestone.seconds}
                className="absolute top-1/2 -translate-y-1/2 w-1 h-3 bg-foreground/30 rounded-full"
                style={{ left: `${position}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Milestone labels */}
      <div className="flex justify-between text-xs">
        {MILESTONES_SEC.map((milestone) => {
          const isReached = durationSeconds >= milestone.seconds;
          return (
            <div
              key={milestone.seconds}
              className={`flex flex-col items-center ${
                isReached ? "text-foreground" : "text-foreground/50"
              }`}
            >
              <span className="flex items-center gap-1">
                {isReached && <Check className="w-3 h-3" />}
                {milestone.label}
              </span>
              <span className="text-foreground/60">{milestone.seconds}s+</span>
            </div>
          );
        })}
      </div>

      {/* Duration and minimum */}
      <div className="flex justify-between items-center text-sm">
        <span
          className={`flex items-center gap-1 ${
            showValidationError && !isMinimumMet
              ? "text-destructive font-medium"
              : showValidationSuccess && isMinimumMet
                ? "text-green-600 dark:text-green-500 font-medium"
                : "text-foreground/70"
          }`}
        >
          {showValidationError && !isMinimumMet && (
            <AlertCircle className="w-4 h-4" />
          )}
          {showValidationSuccess && isMinimumMet && (
            <Check className="w-3 h-4 text-green-600 dark:text-green-500" />
          )}
          {isRecording
            ? `Recording: ${formatDuration(durationSeconds)}`
            : `${formatDuration(durationSeconds)} / ${minSeconds} seconds minimum`}
        </span>
      </div>
    </div>
  );
};
