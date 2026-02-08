import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceDictationProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onBeforeStart?: () => boolean | Promise<boolean>;
  onListeningChange?: (isListening: boolean, reason?: string) => void;
  onDictationError?: (errorCode: string, message?: string) => void;
  disabled?: boolean;
  className?: string;
  silenceTimeoutMs?: number;
}

export interface VoiceDictationRef {
  stopListening: () => void;
}

// Extend Window interface for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

type SpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export const VoiceDictation = forwardRef<VoiceDictationRef, VoiceDictationProps>(
  ({
    onTranscript,
    onInterimTranscript,
    onBeforeStart,
    onListeningChange,
    onDictationError,
    disabled,
    className,
    silenceTimeoutMs = 15000,
  }, ref) => {
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(true);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const shouldRestartRef = useRef(false);
    const isListeningRef = useRef(false);
    
    // Store callbacks in refs to avoid recreating recognition
    const onTranscriptRef = useRef(onTranscript);
    const onInterimTranscriptRef = useRef(onInterimTranscript);
    const onBeforeStartRef = useRef(onBeforeStart);
    const onListeningChangeRef = useRef(onListeningChange);
    const onDictationErrorRef = useRef(onDictationError);
    
    // Keep refs in sync with props
    useEffect(() => {
      onTranscriptRef.current = onTranscript;
    }, [onTranscript]);
    
    useEffect(() => {
      onInterimTranscriptRef.current = onInterimTranscript;
    }, [onInterimTranscript]);

    useEffect(() => {
      onBeforeStartRef.current = onBeforeStart;
    }, [onBeforeStart]);

    useEffect(() => {
      onListeningChangeRef.current = onListeningChange;
    }, [onListeningChange]);

    useEffect(() => {
      onDictationErrorRef.current = onDictationError;
    }, [onDictationError]);

    const setListeningState = useCallback((next: boolean, reason?: string) => {
      if (isListeningRef.current === next) return;
      isListeningRef.current = next;
      setIsListening(next);
      onListeningChangeRef.current?.(next, reason);
    }, []);

    // Expose stopListening method to parent
    useImperativeHandle(ref, () => ({
      stopListening: () => {
        shouldRestartRef.current = false;
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
        setListeningState(false, "external_stop");
        onInterimTranscriptRef.current?.("");
      }
    }), [setListeningState]);

    const resetSilenceTimeout = useCallback(() => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      silenceTimeoutRef.current = setTimeout(() => {
        // Stop listening after silence timeout
        shouldRestartRef.current = false;
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        setListeningState(false, "silence_timeout");
        onInterimTranscriptRef.current?.("");
      }, silenceTimeoutMs);
    }, [silenceTimeoutMs, setListeningState]);

    useEffect(() => {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognitionAPI) {
        setIsSupported(false);
        return;
      }

      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = "";
        let interim = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interim += transcript;
          }
        }

        // Reset silence timeout on any speech activity
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
        silenceTimeoutRef.current = setTimeout(() => {
          shouldRestartRef.current = false;
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
          setListeningState(false, "silence_timeout");
          onInterimTranscriptRef.current?.("");
        }, silenceTimeoutMs);

        // Send interim transcript for live preview
        onInterimTranscriptRef.current?.(interim);

        if (finalTranscript) {
          onTranscriptRef.current(finalTranscript);
          onInterimTranscriptRef.current?.("");
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error);
        onDictationErrorRef.current?.(event.error, event.message);
        // Don't stop on "aborted" or "no-speech" errors - these are expected
        if (event.error !== "aborted" && event.error !== "no-speech") {
          shouldRestartRef.current = false;
          setListeningState(false, `error:${event.error}`);
          onInterimTranscriptRef.current?.("");
        }
      };

      recognition.onend = () => {
        // Auto-restart if we should keep listening (handles browser auto-stop)
        if (shouldRestartRef.current && isListeningRef.current) {
          try {
            setTimeout(() => {
              if (shouldRestartRef.current && isListeningRef.current) {
                recognition.start();
              }
            }, 100);
          } catch (error) {
            // If we can't restart, stop gracefully
            shouldRestartRef.current = false;
            setListeningState(false, "restart_failed");
            onInterimTranscriptRef.current?.("");
          }
        } else {
          setListeningState(false, "ended");
          onInterimTranscriptRef.current?.("");
        }
      };

      recognition.onstart = () => {
        setListeningState(true, "started");
      };

      recognitionRef.current = recognition;

      return () => {
        shouldRestartRef.current = false;
        setListeningState(false, "cleanup");
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      };
    }, [silenceTimeoutMs, setListeningState]);

    const toggleListening = useCallback(async () => {
      if (!recognitionRef.current) return;

      if (isListening) {
        shouldRestartRef.current = false;
        setListeningState(false, "manual_stop");
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        recognitionRef.current.stop();
        onInterimTranscriptRef.current?.("");
      } else {
        try {
          const allowStart = await onBeforeStartRef.current?.();
          if (allowStart === false) {
            return;
          }
          shouldRestartRef.current = true;
          recognitionRef.current.start();
        } catch (error) {
          console.error("Failed to start speech recognition:", error);
          onDictationErrorRef.current?.("start_failed", error instanceof Error ? error.message : undefined);
          setListeningState(false, "start_failed");
        }
      }
    }, [isListening, setListeningState]);

    if (!isSupported) {
      return null;
    }

    return (
      <Button
        type="button"
        variant={isListening ? "destructive" : "outline"}
        size="sm"
        onClick={toggleListening}
        disabled={disabled}
        className={cn(
          "shrink-0 gap-2 transition-all",
          isListening && "animate-pulse",
          className
        )}
        title={isListening ? "Stop dictation" : "Click to dictate your response"}
      >
        {isListening ? (
          <>
            <MicOff className="h-4 w-4" />
            <span className="hidden sm:inline">Stop</span>
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" />
            <span className="hidden sm:inline">Dictate</span>
          </>
        )}
      </Button>
    );
  }
);

VoiceDictation.displayName = "VoiceDictation";
