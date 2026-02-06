import { Progress } from "@/components/ui/progress";
import { AlertCircle, Check } from "lucide-react";

interface FeedbackProgressBarProps {
  wordCount: number;
  minWords: number;
  showValidationError: boolean;
  showValidationSuccess?: boolean;
}

const MILESTONES = [
  { words: 35, label: "Minimum" },
  { words: 75, label: "Good" },
  { words: 150, label: "Great" },
  { words: 250, label: "Excellent" },
];

export const FeedbackProgressBar = ({ 
  wordCount, 
  minWords, 
  showValidationError,
  showValidationSuccess = false
}: FeedbackProgressBarProps) => {
  const maxMilestone = MILESTONES[MILESTONES.length - 1].words;
  const progressValue = Math.min((wordCount / maxMilestone) * 100, 100);
  const isMinimumMet = wordCount >= minWords;

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="relative">
        <Progress 
          value={progressValue} 
          className="h-2"
        />
        {/* Milestone markers */}
        <div className="absolute top-0 left-0 right-0 h-2 pointer-events-none">
          {MILESTONES.map((milestone) => {
            const position = (milestone.words / maxMilestone) * 100;
            const isReached = wordCount >= milestone.words;
            return (
              <div
                key={milestone.words}
                className="absolute top-1/2 -translate-y-1/2 w-1 h-3 bg-foreground/30 rounded-full"
                style={{ left: `${position}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Milestone labels */}
      <div className="flex justify-between text-xs">
        {MILESTONES.map((milestone) => {
          const isReached = wordCount >= milestone.words;
          const isMinimum = milestone.words === minWords;
          return (
            <div 
              key={milestone.words} 
              className={`flex flex-col items-center ${
                isReached ? 'text-foreground' : 'text-foreground/50'
              }`}
            >
              <span className="flex items-center gap-1">
                {isReached && <Check className="w-3 h-3" />}
                {milestone.label}
              </span>
              <span className="text-foreground/60">{milestone.words}+</span>
            </div>
          );
        })}
      </div>

      {/* Word count and validation */}
      <div className="flex justify-between items-center text-sm">
        <span className={`flex items-center gap-1 ${
          showValidationError && !isMinimumMet 
            ? 'text-destructive font-medium' 
            : showValidationSuccess && isMinimumMet
              ? 'text-green-600 dark:text-green-500 font-medium'
              : 'text-foreground/70'
        }`}>
          {showValidationError && !isMinimumMet && <AlertCircle className="w-4 h-4" />}
          {showValidationSuccess && isMinimumMet && <Check className="w-4 h-4 text-green-600 dark:text-green-500" />}
          {wordCount} / {minWords} words minimum
        </span>
      </div>
    </div>
  );
};
