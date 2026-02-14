import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  Map,
  Cloud,
  BookOpen
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
import { ProlificDemographicsImport } from '@/components/researcher/ProlificDemographicsImport';
import { ParticipantFlowSmokeTestCard } from '@/components/researcher/ParticipantFlowSmokeTestCard';

const SystemDesign = lazy(() => import('@/components/researcher/StudyMap'));

const TAB_STORAGE_KEY = 'researcher-dashboard-active-tab';
const SOURCE_FILTER_STORAGE_KEY = 'researcher-dashboard-source-filter';

export type SourceFilterValue = 'all' | 'participant' | 'researcher';

const ResearcherDashboard = () => {
  const { user, role, logout, isSuperAdmin, isGuestMode } = useResearcherAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openBatchCreate, setOpenBatchCreate] = useState(false);
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

  useEffect(() => {
    const s = location.state as { openTab?: string; openBatchCreate?: boolean } | undefined;
    if (s?.openTab) setActiveTab(s.openTab);
    if (s?.openBatchCreate) setOpenBatchCreate(true);
    if (s?.openTab || s?.openBatchCreate) navigate('/researcher/dashboard', { replace: true, state: {} });
  }, [location.state, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/researcher');
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
              <Button
                variant="outline"
                onClick={() => navigate('/researcher/backups')}
              >
                <Cloud className="h-4 w-4 mr-2" />
                Backups
              </Button>
            )}
            {!isGuestMode && (
              <Button
                variant="outline"
                onClick={() => navigate('/researcher/changelog')}
              >
                <History className="h-4 w-4 mr-2" />
                Changelog
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate('/researcher/statistics')}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Statistical Analysis
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/researcher/definitions')}
            >
              <BookOpen className="h-4 w-4 mr-2" />
              Status Definitions
            </Button>
            {!isGuestMode && isSuperAdmin && (
              <Button
                variant="outline"
                onClick={() => navigate('/researcher/users')}
              >
                <Settings className="h-4 w-4 mr-2" />
                Manage Users
              </Button>
            )}
            <Button variant={isGuestMode ? 'default' : 'ghost'} onClick={handleLogout}>
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
          <ParticipantFlowSmokeTestCard disabled={isGuestMode} />

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
            <TabsTrigger value="study-map" className="flex items-center gap-1.5 px-3 py-2">
              <Map className="h-4 w-4" />
              <span className="hidden sm:inline">System Design</span>
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
                <div className="mt-3 pt-3 border-t">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Prolific demographics</p>
                  <ProlificDemographicsImport />
                </div>
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

          <TabsContent value="study-map">
            <Suspense
              fallback={
                <Card>
                  <CardHeader>
                    <CardTitle>System Design</CardTitle>
                    <CardDescription>Loading interactive diagram…</CardDescription>
                  </CardHeader>
                </Card>
              }
            >
              <SystemDesign />
            </Suspense>
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
              <ExperimentSettings
                sourceFilter={sourceFilter}
                openBatchCreate={openBatchCreate}
                onBatchCreateConsumed={() => setOpenBatchCreate(false)}
              />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
};

export default ResearcherDashboard;
