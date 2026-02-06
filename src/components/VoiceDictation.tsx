import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceDictationProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
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
  ({ onTranscript, onInterimTranscript, disabled, className, silenceTimeoutMs = 15000 }, ref) => {
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(true);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const shouldRestartRef = useRef(false);
    const lastSpeechTimeRef = useRef<number>(Date.now());

    // Expose stopListening method to parent
    useImperativeHandle(ref, () => ({
      stopListening: () => {
        shouldRestartRef.current = false;
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        setIsListening(false);
        onInterimTranscript?.("");
      }
    }));

    const resetSilenceTimeout = useCallback(() => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      lastSpeechTimeRef.current = Date.now();
      silenceTimeoutRef.current = setTimeout(() => {
        // Stop listening after silence timeout
        shouldRestartRef.current = false;
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        setIsListening(false);
        onInterimTranscript?.("");
      }, silenceTimeoutMs);
    }, [silenceTimeoutMs, onInterimTranscript]);

    useEffect(() => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        setIsSupported(false);
        return;
      }

      const recognition = new SpeechRecognition();
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
        resetSilenceTimeout();

        // Send interim transcript for live preview
        onInterimTranscript?.(interim);

        if (finalTranscript) {
          onTranscript(finalTranscript);
          onInterimTranscript?.("");
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error);
        // Don't stop on "aborted" or "no-speech" errors - these are expected
        if (event.error !== "aborted" && event.error !== "no-speech") {
          shouldRestartRef.current = false;
          setIsListening(false);
          onInterimTranscript?.("");
        }
      };

      recognition.onend = () => {
        // Auto-restart if we should keep listening (handles browser auto-stop)
        if (shouldRestartRef.current && isListening) {
          try {
            recognition.start();
          } catch (error) {
            // If we can't restart, stop gracefully
            shouldRestartRef.current = false;
            setIsListening(false);
            onInterimTranscript?.("");
          }
        } else {
          setIsListening(false);
          onInterimTranscript?.("");
        }
      };

      recognition.onstart = () => {
        setIsListening(true);
        resetSilenceTimeout();
      };

      recognitionRef.current = recognition;

      return () => {
        shouldRestartRef.current = false;
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      };
    }, [onTranscript, onInterimTranscript, resetSilenceTimeout, isListening]);

    const toggleListening = useCallback(() => {
      if (!recognitionRef.current) return;

      if (isListening) {
        shouldRestartRef.current = false;
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        recognitionRef.current.stop();
        onInterimTranscript?.("");
      } else {
        try {
          shouldRestartRef.current = true;
          recognitionRef.current.start();
        } catch (error) {
          console.error("Failed to start speech recognition:", error);
        }
      }
    }, [isListening, onInterimTranscript]);

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
