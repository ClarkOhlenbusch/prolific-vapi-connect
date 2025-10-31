import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, Volume2, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MicSpeakerTest = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    // Enforce flow: must be at step 1
    const currentStep = sessionStorage.getItem('flowStep');
    if (currentStep !== '1') {
      navigate('/');
      return;
    }
  }, [navigate]);
  
  const sessionToken = searchParams.get("sessionToken");
  const prolificId = searchParams.get("prolificId");
  
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [hasPlayedRecording, setHasPlayedRecording] = useState(false);
  const [speakerTested, setSpeakerTested] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!sessionToken || !prolificId) {
      navigate("/");
    }
  }, [sessionToken, prolificId, navigate]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      streamRef.current = stream;
      setMicPermission(true);
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const audioChunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        setRecordedAudio(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        
        toast({
          title: "Recording complete",
          description: "Play it back to verify your microphone works",
        });
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Update timer display every 100ms
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingTime(prev => Math.min(prev + 0.1, 3.0));
      }, 100);
      
      // Auto-stop after exactly 3 seconds
      recordingTimeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, 3000);
      
      toast({
        title: "Recording started",
        description: "Speak for 3 seconds to test your microphone",
      });
    } catch (error) {
      console.error("Mic access error:", error);
      setMicPermission(false);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to continue",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    console.log("Stopping recording...");
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    setIsRecording(false);
  };

  const playRecording = () => {
    if (recordedAudio) {
      const audioUrl = URL.createObjectURL(recordedAudio);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => {
        setHasPlayedRecording(true);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.play();
      
      toast({
        title: "Playing recording",
        description: "Listen to verify your audio quality",
      });
    }
  };

  const resetMicTest = () => {
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    // Reset states
    setRecordedAudio(null);
    setHasPlayedRecording(false);
    setRecordingTime(0);
    
    toast({
      title: "Mic test reset",
      description: "You can record a new audio clip",
    });
  };

  const playSpeakerTest = () => {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 440; // A4 note
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      setSpeakerTested(true);
      toast({
        title: "Speaker test complete",
        description: "If you heard a tone, your speakers are working",
      });
    }, 1000);
  };

  const handleProceed = () => {
    // Clean up
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    // Advance to next step
    sessionStorage.setItem('flowStep', '2');
    navigate('/conversation');
  };

  const canProceed = recordedAudio !== null && hasPlayedRecording && speakerTested;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-secondary/20">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Audio Equipment Test</CardTitle>
          <CardDescription>
            Please test your microphone and speakers before starting the conversation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Microphone Test */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mic className="h-6 w-6" />
                <div>
                  <h3 className="font-semibold">Microphone Test</h3>
                  <p className="text-sm text-muted-foreground">
                    {!recordedAudio && !isRecording && "Record a 3-second audio clip"}
                    {isRecording && "Recording... speak now!"}
                    {recordedAudio && !hasPlayedRecording && "Play back to verify"}
                    {recordedAudio && hasPlayedRecording && "Microphone test complete"}
                  </p>
                </div>
              </div>
              {recordedAudio && hasPlayedRecording ? (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              ) : micPermission === false ? (
                <XCircle className="h-6 w-6 text-red-500" />
              ) : null}
            </div>
            
            {!recordedAudio && !isRecording && (
              <Button onClick={startRecording} className="w-full">
                <Mic className="h-4 w-4 mr-2" />
                Start Recording
              </Button>
            )}
            
            {isRecording && (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 py-4">
                  <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-lg font-mono">{recordingTime.toFixed(1)}s / 3.0s</span>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Recording will stop automatically after 3 seconds
                </p>
              </div>
            )}
            
            {recordedAudio && (
              <div className="space-y-2">
                <Button 
                  onClick={playRecording} 
                  variant={hasPlayedRecording ? "outline" : "default"}
                  className="w-full"
                >
                  <Volume2 className="h-4 w-4 mr-2" />
                  {hasPlayedRecording ? "Play Recording Again" : "Play Recording"}
                </Button>
                <Button 
                  onClick={resetMicTest} 
                  variant="outline"
                  className="w-full"
                >
                  Record Again
                </Button>
              </div>
            )}
          </div>

          {/* Speaker Test */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Volume2 className="h-6 w-6" />
                <div>
                  <h3 className="font-semibold">Speaker Test</h3>
                  <p className="text-sm text-muted-foreground">
                    {!speakerTested ? "Click to play a test tone" : "Speaker test complete"}
                  </p>
                </div>
              </div>
              {speakerTested && <CheckCircle2 className="h-6 w-6 text-green-500" />}
            </div>
            
            <Button 
              onClick={playSpeakerTest} 
              variant={speakerTested ? "outline" : "default"}
              className="w-full"
            >
              {speakerTested ? "Play Test Tone Again" : "Play Test Tone"}
            </Button>
          </div>

          {/* Proceed Button */}
          <div className="pt-4">
            <Button 
              onClick={handleProceed}
              disabled={!canProceed}
              className="w-full"
              size="lg"
            >
              {canProceed ? "Proceed to Conversation" : "Complete Tests to Continue"}
            </Button>
            {!canProceed && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                {!recordedAudio ? "Please record and play back your audio" : 
                 !hasPlayedRecording ? "Please play back your recording" :
                 !speakerTested ? "Please complete the speaker test" : ""}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MicSpeakerTest;
