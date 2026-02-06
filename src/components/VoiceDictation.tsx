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
    const isListeningRef = useRef(false);
    
    // Store callbacks in refs to avoid recreating recognition
    const onTranscriptRef = useRef(onTranscript);
    const onInterimTranscriptRef = useRef(onInterimTranscript);
    
    // Keep refs in sync with props
    useEffect(() => {
      onTranscriptRef.current = onTranscript;
    }, [onTranscript]);
    
    useEffect(() => {
      onInterimTranscriptRef.current = onInterimTranscript;
    }, [onInterimTranscript]);

    // Expose stopListening method to parent
    useImperativeHandle(ref, () => ({
      stopListening: () => {
        shouldRestartRef.current = false;
        isListeningRef.current = false;
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
        setIsListening(false);
        onInterimTranscriptRef.current?.("");
      }
    }));

    const resetSilenceTimeout = useCallback(() => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      silenceTimeoutRef.current = setTimeout(() => {
        // Stop listening after silence timeout
        shouldRestartRef.current = false;
        isListeningRef.current = false;
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        setIsListening(false);
        onInterimTranscriptRef.current?.("");
      }, silenceTimeoutMs);
    }, [silenceTimeoutMs]);

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
          isListeningRef.current = false;
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
          setIsListening(false);
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
        // Don't stop on "aborted" or "no-speech" errors - these are expected
        if (event.error !== "aborted" && event.error !== "no-speech") {
          shouldRestartRef.current = false;
          isListeningRef.current = false;
          setIsListening(false);
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
            isListeningRef.current = false;
            setIsListening(false);
            onInterimTranscriptRef.current?.("");
          }
        } else {
          setIsListening(false);
          onInterimTranscriptRef.current?.("");
        }
      };

      recognition.onstart = () => {
        isListeningRef.current = true;
        setIsListening(true);
      };

      recognitionRef.current = recognition;

      return () => {
        shouldRestartRef.current = false;
        isListeningRef.current = false;
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      };
    }, [silenceTimeoutMs]);

    const toggleListening = useCallback(() => {
      if (!recognitionRef.current) return;

      if (isListening) {
        shouldRestartRef.current = false;
        isListeningRef.current = false;
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        recognitionRef.current.stop();
        onInterimTranscriptRef.current?.("");
      } else {
        try {
          shouldRestartRef.current = true;
          recognitionRef.current.start();
        } catch (error) {
          console.error("Failed to start speech recognition:", error);
        }
      }
    }, [isListening]);

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
