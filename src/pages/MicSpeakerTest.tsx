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
  
  const sessionToken = searchParams.get("sessionToken");
  const prolificId = searchParams.get("prolificId");
  
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [speakerTested, setSpeakerTested] = useState(false);
  const [isTestingMic, setIsTestingMic] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionToken || !prolificId) {
      navigate("/");
    }
  }, [sessionToken, prolificId, navigate]);

  const startMicTest = async () => {
    try {
      setIsTestingMic(true);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      streamRef.current = stream;
      setMicPermission(true);
      
      // Set up audio analysis
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      analyserRef.current.fftSize = 256;
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const updateLevel = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        setMicLevel(Math.min(100, (average / 255) * 200));
        
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
      
      toast({
        title: "Microphone access granted",
        description: "Please speak to test your microphone",
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
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    navigate('/conversation');
  };

  const canProceed = micPermission === true && speakerTested && micLevel > 10;

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
                    {!isTestingMic && "Click to test your microphone"}
                    {isTestingMic && micLevel <= 10 && "Speak to test your microphone"}
                    {isTestingMic && micLevel > 10 && "Microphone working!"}
                  </p>
                </div>
              </div>
              {micPermission === true && micLevel > 10 ? (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              ) : micPermission === false ? (
                <XCircle className="h-6 w-6 text-red-500" />
              ) : null}
            </div>
            
            {!isTestingMic && (
              <Button onClick={startMicTest} className="w-full">
                Start Microphone Test
              </Button>
            )}
            
            {isTestingMic && (
              <div className="space-y-2">
                <div className="h-4 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-100"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Speak into your microphone - the bar should move
                </p>
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
              disabled={!isTestingMic}
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
            {!canProceed && micPermission === true && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                {micLevel <= 10 ? "Please speak into your microphone to verify it's working" : "Please complete the speaker test"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MicSpeakerTest;
