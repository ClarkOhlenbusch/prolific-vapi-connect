import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecordButtonProps {
  isRecording: boolean;
  /** Called when user clicks to start. Return false to abort (e.g. mic precheck failed). */
  onStart: () => Promise<boolean>;
  /** Called when user clicks to stop. */
  onStop: () => void;
  disabled?: boolean;
  className?: string;
  startLabel?: string;
}

export const RecordButton = ({
  isRecording,
  onStart,
  onStop,
  disabled,
  className,
  startLabel = "Click to record",
}: RecordButtonProps) => {
  const [isPending, setIsPending] = useState(false);

  const handleClick = useCallback(async () => {
    if (isPending || disabled) return;

    if (isRecording) {
      onStop();
      return;
    }

    setIsPending(true);
    try {
      const allowed = await onStart();
      if (!allowed) return;
    } finally {
      setIsPending(false);
    }
  }, [isPending, disabled, isRecording, onStart, onStop]);

  return (
    <Button
      type="button"
      variant={isRecording ? "destructive" : "default"}
      size="sm"
      onClick={handleClick}
      disabled={disabled || isPending}
      className={cn(
        "shrink-0 gap-2 transition-all",
        isRecording && "animate-pulse",
        !isRecording && !isPending && "animate-pulse bg-blue-600 hover:bg-blue-700 text-white border-blue-600",
        className
      )}
      title={isRecording ? "Stop recording" : startLabel}
    >
      {isRecording ? (
        <>
          <Square className="h-4 w-4 fill-current" />
          <span className="hidden sm:inline">Stop</span>
        </>
      ) : (
        <>
          <Mic className="h-4 w-4" />
          <span className="hidden sm:inline">{isPending ? "Starting…" : startLabel}</span>
        </>
      )}
    </Button>
  );
};
