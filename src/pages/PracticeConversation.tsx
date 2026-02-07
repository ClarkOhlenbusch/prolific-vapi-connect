import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Vapi from '@vapi-ai/web';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Mic, Phone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
import { ExperimentProgress } from '@/components/ExperimentProgress';
import { supabase } from '@/integrations/supabase/client';
import { usePageTracking } from '@/hooks/usePageTracking';
import {
  collectClientContext,
  generateCallAttemptId,
  getCallErrorGuidance,
  getCurrentMicPermissionState,
  getMicIssueGuidance,
  logNavigationEvent,
  mapCallEndReasonToFailureCode,
  mapVapiErrorToReasonCode,
  type TroubleshootingGuidance,
  runMicDiagnostics,
} from '@/lib/participant-telemetry';

const PracticeConversation = () => {
  const ASSISTANT_AUDIO_TIMEOUT_MS = 15000;
  const MIC_AUDIO_MONITOR_SAMPLE_MS = 45000;

  const [searchParams] = useSearchParams();
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAwaitingMicPermission, setIsAwaitingMicPermission] = useState(false);
  const [showPreCallModal, setShowPreCallModal] = useState(false);
  const [showAudioConfirmModal, setShowAudioConfirmModal] = useState(false);
  const [showAudioIssueFeedbackModal, setShowAudioIssueFeedbackModal] = useState(false);
  const [micIssueGuidance, setMicIssueGuidance] = useState<TroubleshootingGuidance | null>(null);
  const [audioIssueType, setAudioIssueType] = useState('');
  const [audioIssueNotes, setAudioIssueNotes] = useState('');
  const [practiceAssistantId, setPracticeAssistantId] = useState<string | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const vapiRef = useRef<Vapi | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callAttemptIdRef = useRef<string | null>(null);
  const attemptStartMsRef = useRef<number | null>(null);
  const firstAssistantSpeechLoggedRef = useRef(false);
  const assistantSpeechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCallActiveRef = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isResearcherMode } = useResearcherMode();
  const pageName = 'practice-conversation';

  const logEvent = useCallback((eventType: string, metadata: Record<string, unknown> = {}) => {
    void logNavigationEvent({
      prolificId,
      callId: callIdRef.current,
      pageName,
      eventType,
      metadata,
    });
  }, [prolificId]);

  const logAttemptEvent = useCallback((eventType: string, metadata: Record<string, unknown> = {}) => {
    logEvent(eventType, {
      callAttemptId: callAttemptIdRef.current,
      ...metadata,
    });
  }, [logEvent]);

  const getAttemptLatencyMs = () => {
    if (attemptStartMsRef.current === null) return null;
    return Math.round(performance.now() - attemptStartMsRef.current);
  };

  const clearAssistantSpeechTimeout = useCallback(() => {
    if (assistantSpeechTimeoutRef.current) {
      clearTimeout(assistantSpeechTimeoutRef.current);
      assistantSpeechTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  const runInCallMicMonitor = useCallback((callAttemptId: string | null) => {
    if (!callAttemptId) return;
    void runMicDiagnostics({ sampleMs: MIC_AUDIO_MONITOR_SAMPLE_MS })
      .then((micDiagnostics) => {
        logEvent('call_preflight_result', {
          callAttemptId,
          phase: 'in_call_monitor',
          state: micDiagnostics.permissionState,
          source: micDiagnostics.permissionSource,
          reasonCode: micDiagnostics.reasonCode || 'none',
          getUserMediaDurationMs: micDiagnostics.getUserMediaDurationMs,
          inputDeviceCount: micDiagnostics.inputDeviceCount,
          trackEnabled: micDiagnostics.trackEnabled,
          trackMuted: micDiagnostics.trackMuted,
          trackReadyState: micDiagnostics.trackReadyState,
          errorName: micDiagnostics.errorName,
          errorMessage: micDiagnostics.errorMessage,
        });
        if (micDiagnostics.audioDetected !== 'unknown') {
          logEvent('mic_audio_check', {
            callAttemptId,
            phase: 'in_call_monitor',
            detected: micDiagnostics.audioDetected,
            peakRms: micDiagnostics.peakRms,
            sampleMs: micDiagnostics.sampleMs,
            reasonCode: micDiagnostics.reasonCode || 'none',
          });
        }
        if (callAttemptIdRef.current !== callAttemptId || !isCallActiveRef.current) {
          return;
        }
        if (micDiagnostics.audioDetected === 'not_detected') {
          const guidance = getMicIssueGuidance('no_mic_audio_detected');
          toast({
            title: guidance.title,
            description: guidance.description,
            variant: 'destructive',
          });
          logEvent('call_quality_warning', {
            callAttemptId,
            reason: 'no_mic_audio_detected_during_call_monitor',
            reasonCode: 'no_mic_audio_detected',
            peakRms: micDiagnostics.peakRms,
            sampleMs: micDiagnostics.sampleMs,
          });
        }
      })
      .catch((error: unknown) => {
        const err = error as { name?: string; message?: string };
        logEvent('mic_audio_check_error', {
          callAttemptId,
          phase: 'in_call_monitor',
          errorName: err?.name,
          errorMessage: err?.message,
        });
      });
  }, [MIC_AUDIO_MONITOR_SAMPLE_MS, logEvent, toast]);

  usePageTracking({
    pageName,
    prolificId,
    callId: null,
  });
  // Fetch experiment config and assign condition during practice
  // This is where the atomic condition assignment happens for real participants
  // The assigned condition is stored in sessionStorage for the main conversation
  useEffect(() => {
    const fetchConfig = async () => {
      setIsConfigLoading(true);
      // Get prolificId from URL or storage
      const prolificIdFromUrl = searchParams.get('prolificId');
      const storedProlificId = sessionStorage.getItem('prolificId');
      const currentProlificId = prolificIdFromUrl || storedProlificId;
      
      try {
        // Pass prolificId to trigger atomic condition assignment
        // Real participants (24-char IDs) will be counted, testers won't
        console.log('[PracticeConversation] Fetching experiment config for:', currentProlificId);
        const { data, error } = await supabase.functions.invoke('get-experiment-config', {
          body: { prolificId: currentProlificId }
        });
        if (error) {
          console.error('[PracticeConversation] Error fetching experiment config:', error);
          setIsConfigLoading(false);
          return;
        }
        console.log('[PracticeConversation] Config received:', data);
        if (data?.practiceAssistantId) {
          setPracticeAssistantId(data.practiceAssistantId);
          console.log('[PracticeConversation] Practice assistant ID set:', data.practiceAssistantId);
        }
        // Store the assigned condition for the main conversation
        if (data?.assistantType) {
          sessionStorage.setItem('assistantType', data.assistantType);
          sessionStorage.setItem('assistantId', data.assistantId);
          console.log(`[PracticeConversation] Condition assigned: ${data.assistantType}`, data.stats);
        }
      } catch (err) {
        console.error('[PracticeConversation] Failed to fetch experiment config:', err);
      } finally {
        setIsConfigLoading(false);
      }
    };
    fetchConfig();
  }, [searchParams]);

  useEffect(() => {
    // Load IDs from URL or sessionStorage, no validation/redirects
    const prolificIdFromUrl = searchParams.get('prolificId');
    const sessionToken = searchParams.get('sessionToken');
    const storedProlificId = sessionStorage.getItem('prolificId');
    const finalProlificId = prolificIdFromUrl || storedProlificId || 'RESEARCHER_MODE';
    const finalSessionToken = sessionToken || localStorage.getItem('sessionToken') || '00000000-0000-0000-0000-000000000000';
    setProlificId(finalProlificId);
    sessionStorage.setItem('prolificId', finalProlificId);
    localStorage.setItem('sessionToken', finalSessionToken);
    sessionStorage.setItem('flowStep', '1');
  }, [searchParams]);

  // Initialize Vapi SDK
  useEffect(() => {
    if (!prolificId) return;
    
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;
    console.log('[Vapi Debug] Initializing with public key:', publicKey ? `${publicKey.substring(0, 8)}...` : 'MISSING');
    
    if (!publicKey) {
      console.error('[Vapi Debug] VITE_VAPI_PUBLIC_KEY is missing!');
      toast({
        title: "Configuration Error",
        description: "Vapi public key is not configured.",
        variant: "destructive"
      });
      return;
    }
    
    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;
    console.log('[Vapi Debug] SDK instance created');

    // Set up event listeners
    vapi.on('call-start', () => {
      console.log('[Vapi Debug] Event: call-start');
      setIsCallActive(true);
      setIsConnecting(false);
      setIsAwaitingMicPermission(false);
      logAttemptEvent('call_connected', {
        attemptLatencyMs: getAttemptLatencyMs(),
      });
      clearAssistantSpeechTimeout();
      assistantSpeechTimeoutRef.current = setTimeout(() => {
        logAttemptEvent('assistant_audio_timeout', {
          reasonCode: 'unknown',
          timeoutMs: ASSISTANT_AUDIO_TIMEOUT_MS,
        });
      }, ASSISTANT_AUDIO_TIMEOUT_MS);
      runInCallMicMonitor(callAttemptIdRef.current);
    });
    vapi.on('call-end', () => {
      console.log('[Vapi Debug] Event: call-end');
      setIsCallActive(false);
      setShowAudioConfirmModal(true);
      clearAssistantSpeechTimeout();
      logAttemptEvent('call_end', { reason: 'call-end', attemptLatencyMs: getAttemptLatencyMs() });
    });
    vapi.on('speech-start', () => {
      setIsSpeaking(true);
      if (!firstAssistantSpeechLoggedRef.current) {
        firstAssistantSpeechLoggedRef.current = true;
        clearAssistantSpeechTimeout();
        logAttemptEvent('first_assistant_audio', {
          attemptLatencyMs: getAttemptLatencyMs(),
        });
      }
    });
    vapi.on('speech-end', () => {
      setIsSpeaking(false);
    });
    // Listen for message events to catch call end reasons
    vapi.on('message', (message: any) => {
      console.log('[Vapi Debug] Event: message', message.type);
      if (message.type === 'end-of-call-report' && message.endedReason === 'exceeded-max-duration') {
        toast({
          title: "Call time limit reached",
          description: "Proceed with next section.",
        });
      }
      if (message.type === 'end-of-call-report') {
        const endedReason = message.endedReason;
        const reasonCode = mapCallEndReasonToFailureCode(endedReason);
        const isError = reasonCode !== 'none';
        logAttemptEvent('call_end_report', { endedReason, isError, reasonCode });
      }
    });
    vapi.on('error', error => {
      console.error('[Vapi Debug] Event: error', error);
      const reasonCode = mapVapiErrorToReasonCode(error?.name, error?.message);
      const guidance = getCallErrorGuidance(reasonCode);
      logAttemptEvent('call_error', {
        errorName: error?.name,
        errorMessage: error?.message,
        reasonCode,
      });
      // Check if it's a timeout-related error (meeting ended due to time limit)
      const errorMessage = error?.message?.toLowerCase() || '';
      if (
        errorMessage.includes('exceeded') || 
        errorMessage.includes('max-duration') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('meeting ended') ||
        errorMessage.includes('meeting has ended') ||
        errorMessage.includes('ejection')
      ) {
        toast({
          title: "Call time limit reached",
          description: "Proceed with next section.",
        });
      } else {
        toast({
          title: guidance.title,
          description: guidance.description,
          variant: "destructive"
        });
      }
      setIsConnecting(false);
      setIsAwaitingMicPermission(false);
    });
    return () => {
      console.log('[Vapi Debug] Cleanup: stopping call');
      vapi.stop();
      clearAssistantSpeechTimeout();
    };
  }, [prolificId, toast, logAttemptEvent, clearAssistantSpeechTimeout, runInCallMicMonitor]);
  const handleStartCallClick = () => {
    setShowPreCallModal(true);
  };
  const startCall = async () => {
    if (!vapiRef.current || !prolificId) {
      console.log('[PracticeConversation] startCall: Missing vapiRef or prolificId');
      logEvent('call_start_failed', { reason: 'missing_vapi_or_prolific', reasonCode: 'unknown' });
      return;
    }
    setShowPreCallModal(false);
    const initialPermissionState = await getCurrentMicPermissionState();
    if (initialPermissionState === 'denied') {
      setIsConnecting(false);
      setIsAwaitingMicPermission(false);
      setMicIssueGuidance(getMicIssueGuidance('mic_permission_denied'));
      logEvent('call_start_failed', { reason: 'mic_permission_denied_precheck', reasonCode: 'mic_permission_denied' });
      return;
    }
    setIsAwaitingMicPermission(initialPermissionState === 'prompt');
    setIsConnecting(true);

    const callAttemptId = generateCallAttemptId();
    callAttemptIdRef.current = callAttemptId;
    attemptStartMsRef.current = performance.now();
    firstAssistantSpeechLoggedRef.current = false;
    clearAssistantSpeechTimeout();

    const clientContext = await collectClientContext();
    logAttemptEvent('call_attempt_start', {
      callAttemptId,
      clientContext,
    });
    
    try {
      if (!practiceAssistantId) {
        console.error('[PracticeConversation] startCall: No practiceAssistantId available');
        logAttemptEvent('call_start_failed', { reason: 'missing_practice_assistant_id', reasonCode: 'unknown' });
        toast({
          title: "Configuration Error",
          description: "Practice assistant not configured. Please try again.",
          variant: "destructive"
        });
        setIsConnecting(false);
        setIsAwaitingMicPermission(false);
        return;
      }

      console.log('[PracticeConversation] Starting call with assistant:', practiceAssistantId);
      // Start the practice call using Vapi SDK
      const call = await vapiRef.current.start(practiceAssistantId, {
        variableValues: {
          prolificId: prolificId
        },
        metadata: {
          prolificId: prolificId,
          researcherMode: isResearcherMode,
        },
      });
      callIdRef.current = call?.id || null;
      logAttemptEvent('call_start', {
        assistantId: practiceAssistantId,
        isResearcherMode,
        callId: call?.id || null,
        attemptLatencyMs: getAttemptLatencyMs(),
      });
      console.log('[PracticeConversation] Call started successfully');
      toast({
        title: "Practice Started",
        description: "Have a conversation to test your audio equipment."
      });
    } catch (error) {
      console.error('[PracticeConversation] Failed to start call:', error);
      setIsConnecting(false);
      setIsAwaitingMicPermission(false);
      const reasonCode = mapVapiErrorToReasonCode(
        (error as { name?: string })?.name,
        (error as { message?: string })?.message
      );
      const guidance = getCallErrorGuidance(reasonCode);
      logAttemptEvent('call_start_failed', {
        reason: 'vapi_start_error',
        reasonCode,
        errorName: (error as { name?: string })?.name,
        errorMessage: (error as { message?: string })?.message,
      });
      toast({
        title: guidance.title,
        description: guidance.description,
        variant: "destructive"
      });
    }
  };
  const handleEndCall = () => {
    if (vapiRef.current) {
      vapiRef.current.stop();
    }
  };
  const handleAudioWorking = () => {
    logEvent('audio_confirm', { heardAssistant: true });
    setShowAudioConfirmModal(false);
    sessionStorage.setItem('flowStep', '2');
    const sessionToken = localStorage.getItem('sessionToken');
    navigate(`/voice-conversation?sessionToken=${sessionToken}&prolificId=${prolificId}`);
  };

  const handleAudioNotWorking = () => {
    logEvent('audio_confirm', { heardAssistant: false });
    setShowAudioConfirmModal(false);
    setAudioIssueType('');
    setAudioIssueNotes('');
    setShowAudioIssueFeedbackModal(true);
  };
  const handleSubmitAudioIssueFeedback = () => {
    if (!audioIssueType) {
      toast({
        title: "Please select an issue",
        description: "Choose the issue you experienced before continuing.",
        variant: "destructive",
      });
      return;
    }
    logEvent('restart_feedback_submitted', {
      issueType: audioIssueType,
      notes: audioIssueNotes.trim() || null,
      nextAction: 'restart',
      context: 'practice_audio_confirm_no',
    });
    setShowAudioIssueFeedbackModal(false);
    setAudioIssueType('');
    setAudioIssueNotes('');
  };
  if (!prolificId) {
    return null;
  }
  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 via-background to-teal-50 p-4">
      <Card className="w-full max-w-2xl shadow-xl border-teal-200">
        <CardHeader className="space-y-3">
          <ExperimentProgress />
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-700 border border-teal-300">
              <span className="w-2 h-2 rounded-full bg-teal-500"></span>
              Practice Session
            </span>
          </div>
          <CardTitle className="text-2xl text-center">Practice Conversation</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
          {isResearcherMode && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs font-mono">
              <p className="text-amber-800 font-semibold mb-1">🔬 Researcher Debug Info:</p>
              <p className="text-amber-700">
                VITE_VAPI_PUBLIC_KEY: {import.meta.env.VITE_VAPI_PUBLIC_KEY || 'NOT SET'}
              </p>
              <p className="text-amber-700">
                Practice Assistant ID: {practiceAssistantId || 'Loading...'}
              </p>
              <p className="text-amber-700">
                Config Loading: {isConfigLoading ? 'Yes' : 'No'}
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-6">
            <p className="text-foreground">
              <span className="font-bold">Welcome!</span> Before the main conversation, you will do a short practice to check that everything works. This allows you to:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-foreground ml-4">
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-0.5">✓</span>
                <span>Test your microphone and speakers</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-0.5">✓</span>
                <span>Get used to speaking with the assistant</span>
              </li>
            </ul>
          </div>

          <div className="bg-teal-50/50 border border-teal-100 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Instructions:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-0.5">•</span>
                <span>Sit in a quiet place</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-0.5">•</span>
                <span>If asked, give your browser permission to use your microphone</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-0.5">•</span>
                <span>Click the "Start" button below to begin the conversation</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col items-center justify-center py-8 gap-6">
            {!isCallActive && !isConnecting ? <div className="flex flex-col items-center gap-6">
                <Button 
                  onClick={handleStartCallClick} 
                  size="lg" 
                  disabled={isConfigLoading || !practiceAssistantId}
                  className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center gap-1 animate-pulse bg-teal-500 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:animate-none"
                >
                  <Mic className="w-14 h-14" />
                  <span className="text-sm">{isConfigLoading ? 'Loading...' : 'Start'}</span>
                </Button>
              </div> : isConnecting ? <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">
                  {isAwaitingMicPermission ? 'Waiting for microphone permission...' : 'Connecting...'}
                </p>
              </div> : <div className="flex flex-col items-center gap-4">
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center min-w-[200px]">
                  <div className="flex items-center justify-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isSpeaking ? 'bg-destructive animate-pulse' : 'bg-primary'}`}></div>
                    <p className="text-sm font-medium text-primary">
                      {isSpeaking ? 'Assistant Speaking...' : 'Listening...'}
                    </p>
                  </div>
                </div>
                <Button onClick={handleEndCall} size="lg" variant="destructive" className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center gap-1">
                  <Phone className="w-10 h-10 rotate-135" />
                  <span className="text-sm">Hang Up</span>
                </Button>
                <p className="text-base text-muted-foreground text-center max-w-md">
                  When you and the assistant can hear each other, hang up to continue.
                </p>
              </div>}
          </div>

          <Dialog open={showPreCallModal} onOpenChange={setShowPreCallModal}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-xl">Ready to Start?</DialogTitle>
                <DialogDescription className="space-y-4 text-left pt-4">
                  <div className="bg-accent/50 rounded-lg p-4 space-y-3">
                    <div className="space-y-2 text-sm">
                      <p className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Remember, this is just a practice conversation</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>If your browser asks for permission to use the microphone, click yes.</span>
                      </p>
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setShowPreCallModal(false)}>
                  Cancel
                </Button>
                <Button onClick={startCall}>
                  Start Practice Conversation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showAudioConfirmModal} onOpenChange={setShowAudioConfirmModal}>
            <DialogContent className="sm:max-w-[450px]">
              <DialogHeader>
                <DialogTitle className="text-xl text-center">
                  Can you hear the assistant clearly?
                </DialogTitle>
              </DialogHeader>
              <DialogFooter className="flex-col sm:flex-row gap-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={handleAudioNotWorking}
                  className="w-full sm:w-auto"
                >
                  No, try again
                </Button>
                <Button 
                  onClick={handleAudioWorking}
                  className="w-full sm:w-auto"
                >
                  Yes, continue
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={showAudioIssueFeedbackModal}
            onOpenChange={(open) => {
              if (open) setShowAudioIssueFeedbackModal(true);
            }}
          >
            <DialogContent className="sm:max-w-[540px]">
              <DialogHeader>
                <DialogTitle className="text-xl">Quick Issue Report</DialogTitle>
                <DialogDescription>
                  Help us diagnose audio issues before you retry the practice call.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">What issue did you face? (Required)</Label>
                  <RadioGroup value={audioIssueType} onValueChange={setAudioIssueType}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="cant_hear_assistant" id="practice-issue-cant-hear-assistant" />
                      <Label htmlFor="practice-issue-cant-hear-assistant">I could not hear the assistant</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="cant_be_heard" id="practice-issue-cant-be-heard" />
                      <Label htmlFor="practice-issue-cant-be-heard">The assistant could not hear me</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="stuck_connecting" id="practice-issue-stuck-connecting" />
                      <Label htmlFor="practice-issue-stuck-connecting">Call got stuck connecting</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="other" id="practice-issue-other" />
                      <Label htmlFor="practice-issue-other">Other</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="practice-issue-notes" className="text-sm font-medium">
                    Additional details (optional)
                  </Label>
                  <Textarea
                    id="practice-issue-notes"
                    placeholder="Example: Assistant voice never played even though call connected."
                    value={audioIssueNotes}
                    onChange={(event) => setAudioIssueNotes(event.target.value)}
                    maxLength={300}
                  />
                  <p className="text-xs text-muted-foreground text-right">{audioIssueNotes.length}/300</p>
                </div>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button onClick={handleSubmitAudioIssueFeedback} disabled={!audioIssueType}>
                  Submit & Try Again
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={Boolean(micIssueGuidance)} onOpenChange={(open) => {
            if (!open) setMicIssueGuidance(null);
          }}>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle className="text-xl text-center text-destructive">
                  {micIssueGuidance?.title || 'Microphone Issue'}
                </DialogTitle>
                <DialogDescription className="space-y-4 text-left pt-4">
                  <p>{micIssueGuidance?.description}</p>
                  
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                    <p className="font-semibold text-amber-800">Try these steps:</p>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-amber-700">
                      {(micIssueGuidance?.steps || []).map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    If it still fails, try a different browser or a private/incognito window.
                  </p>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="pt-4 gap-2">
                <Button variant="outline" onClick={() => setMicIssueGuidance(null)}>
                  Close
                </Button>
                <Button onClick={() => window.location.reload()}>
                  Refresh Page
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>;
};
export default PracticeConversation;
