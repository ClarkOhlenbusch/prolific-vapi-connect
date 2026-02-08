import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  FlaskConical, 
  LogOut, 
  BarChart3, 
  Archive,
  Settings,
  Calculator,
  MessageSquare,
  Clock,
  UserX,
  Activity,
  Users,
  History,
  Pencil
} from 'lucide-react';
import { UnifiedParticipantsTable } from '@/components/researcher/UnifiedParticipantsTable';
import { ArchivedResponsesTable } from '@/components/researcher/ArchivedResponsesTable';
import { DataSummary } from '@/components/researcher/DataSummary';
import { ExperimentSettings } from '@/components/researcher/ExperimentSettings';
import { FormalityCalculator } from '@/components/researcher/FormalityCalculator';
import { PromptLab } from '@/components/researcher/PromptLab';
import { TimeAnalysis } from '@/components/researcher/TimeAnalysis';

import { NoConsentFeedbackTable } from '@/components/researcher/NoConsentFeedbackTable';
import { ActivityLogsTable } from '@/components/researcher/ActivityLogsTable';
import { GlobalSourceFilter } from '@/components/researcher/GlobalSourceFilter';
import { toast } from 'sonner';

const TAB_STORAGE_KEY = 'researcher-dashboard-active-tab';
const SOURCE_FILTER_STORAGE_KEY = 'researcher-dashboard-source-filter';
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

export type SourceFilterValue = 'all' | 'participant' | 'researcher';

const ResearcherDashboard = () => {
  const { user, role, logout, isSuperAdmin, isGuestMode } = useResearcherAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    const saved = sessionStorage.getItem(TAB_STORAGE_KEY);
    // Migrate old 'participants' tab value to 'responses'
    if (saved === 'participants') return 'responses';
    return saved || 'summary';
  });
  const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>(() => {
    const saved = sessionStorage.getItem(SOURCE_FILTER_STORAGE_KEY);
    if (saved === 'all' || saved === 'participant' || saved === 'researcher') return saved;
    return 'participant'; // Default to participants only
  });
  const [changeUsernameOpen, setChangeUsernameOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [displayUsername, setDisplayUsername] = useState('');

  useEffect(() => {
    const metadataUsername =
      (typeof user?.user_metadata?.username === 'string' && user.user_metadata.username) ||
      '';
    setDisplayUsername(metadataUsername.trim());
  }, [user]);

  useEffect(() => {
    sessionStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem(SOURCE_FILTER_STORAGE_KEY, sourceFilter);
  }, [sourceFilter]);

  const handleLogout = async () => {
    await logout();
    navigate('/researcher');
  };

  const handleSaveOwnUsername = async () => {
    const normalizedUsername = usernameInput.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      toast.error('Username must be 3-32 chars: letters, numbers, dot, underscore, hyphen');
      return;
    }

    setIsUpdatingUsername(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('update-researcher-username', {
        body: { username: normalizedUsername },
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to update username');
      }
      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      setDisplayUsername(normalizedUsername);
      setChangeUsernameOpen(false);
      toast.success('Username updated');
    } catch (error) {
      console.error('Error updating username:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update username');
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FlaskConical className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Research Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                {isGuestMode ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                    Guest • Demo Mode
                  </span>
                ) : (
                  <>
                    {user?.email} • {role === 'super_admin' ? 'Super Admin' : 'Viewer'}
                    {displayUsername ? ` • @${displayUsername}` : ''}
                  </>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!isGuestMode && (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/researcher/changelog')}
                >
                  <History className="h-4 w-4 mr-2" />
                  Changelog
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/researcher/statistics')}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Statistical Analysis
                </Button>
                {isSuperAdmin && (
                  <Button 
                    variant="outline" 
                    onClick={() => navigate('/researcher/users')}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Manage Users
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setUsernameInput(displayUsername || '');
                    setChangeUsernameOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Change Username
                </Button>
              </>
            )}
            <Button variant={isGuestMode ? "default" : "ghost"} onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              {isGuestMode ? 'Exit Demo' : 'Logout'}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Global Source Filter */}
        <div className="mb-6">
          <GlobalSourceFilter value={sourceFilter} onChange={setSourceFilter} />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
            <TabsTrigger value="summary" className="flex items-center gap-1.5 px-3 py-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Summary</span>
            </TabsTrigger>
            <TabsTrigger value="responses" className="flex items-center gap-1.5 px-3 py-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Responses</span>
            </TabsTrigger>
            <TabsTrigger value="time" className="flex items-center gap-1.5 px-3 py-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Time</span>
            </TabsTrigger>
            <TabsTrigger value="formality" className="flex items-center gap-1.5 px-3 py-2">
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">Formality</span>
            </TabsTrigger>
            <TabsTrigger value="prompts" className="flex items-center gap-1.5 px-3 py-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Prompts</span>
            </TabsTrigger>
            <TabsTrigger value="no-consent" className="flex items-center gap-1.5 px-3 py-2">
              <UserX className="h-4 w-4" />
              <span className="hidden sm:inline">No Consent</span>
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="activity" className="flex items-center gap-1.5 px-3 py-2">
                <Activity className="h-4 w-4" />
                <span className="hidden sm:inline">Activity</span>
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="archived" className="flex items-center gap-1.5 px-3 py-2">
                <Archive className="h-4 w-4" />
                <span className="hidden sm:inline">Archived</span>
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="settings" className="flex items-center gap-1.5 px-3 py-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Experiment Settings</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="summary">
            <DataSummary sourceFilter={sourceFilter} />
          </TabsContent>

          <TabsContent value="responses">
            <Card>
              <CardHeader>
                <CardTitle>All Responses</CardTitle>
                <CardDescription>
                  View all participant and researcher responses with completion status, experiment data, and journey timelines
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UnifiedParticipantsTable sourceFilter={sourceFilter} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="time">
            <TimeAnalysis sourceFilter={sourceFilter} />
          </TabsContent>

          <TabsContent value="formality">
            <FormalityCalculator />
          </TabsContent>

          <TabsContent value="prompts">
            <PromptLab />
          </TabsContent>

          <TabsContent value="no-consent">
            <NoConsentFeedbackTable sourceFilter={sourceFilter} />
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="activity">
              <Card>
                <CardHeader>
                  <CardTitle>Researcher Activity</CardTitle>
                  <CardDescription>
                    Track logins and data downloads by researchers
                    {isGuestMode && <span className="ml-2 text-xs text-primary">(Demo data)</span>}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ActivityLogsTable />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="archived">
              <Card>
                <CardHeader>
                  <CardTitle>Archived Responses</CardTitle>
                  <CardDescription>
                    Responses that have been archived (soft deleted) - only visible to super admins
                    {isGuestMode && <span className="ml-2 text-xs text-primary">(Demo data)</span>}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ArchivedResponsesTable />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isSuperAdmin && (
            <TabsContent value="settings">
              <ExperimentSettings />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <Dialog
        open={changeUsernameOpen}
        onOpenChange={(open) => {
          setChangeUsernameOpen(open);
          if (!open) {
            setUsernameInput(displayUsername || '');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Username</DialogTitle>
            <DialogDescription>
              You can sign in with this username or your email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="self-username">Username</Label>
            <Input
              id="self-username"
              type="text"
              placeholder="e.g. ovroom"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              3-32 chars, letters/numbers/dot/underscore/hyphen.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeUsernameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveOwnUsername} disabled={isUpdatingUsername}>
              {isUpdatingUsername ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResearcherDashboard;
