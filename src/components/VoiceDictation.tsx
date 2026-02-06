import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceDictationProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
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

export const VoiceDictation = ({ onTranscript, disabled, className }: VoiceDictationProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

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

      setInterimTranscript(interim);

      if (finalTranscript) {
        onTranscript(finalTranscript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "aborted") {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [onTranscript]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
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
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant={isListening ? "destructive" : "outline"}
        size="icon"
        onClick={toggleListening}
        disabled={disabled}
        className="h-8 w-8 shrink-0"
        title={isListening ? "Stop dictation" : "Start voice dictation"}
      >
        {isListening ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
      {isListening && interimTranscript && (
        <span className="text-xs text-muted-foreground italic truncate max-w-[200px]">
          {interimTranscript}...
        </span>
      )}
      {isListening && !interimTranscript && (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Listening...
        </span>
      )}
    </div>
  );
};
