import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  FlaskConical, 
  LogOut, 
  FileText, 
  BarChart3, 
  Archive,
  Settings,
  Calculator,
  MessageSquare,
  Clock,
  Layers,
  UserX
} from 'lucide-react';
import { ExperimentResponsesTable } from '@/components/researcher/ExperimentResponsesTable';
import { ParticipantCallsTable } from '@/components/researcher/ParticipantCallsTable';
import { ArchivedResponsesTable } from '@/components/researcher/ArchivedResponsesTable';
import { DataSummary } from '@/components/researcher/DataSummary';
import { ExperimentSettings } from '@/components/researcher/ExperimentSettings';
import { FormalityCalculator } from '@/components/researcher/FormalityCalculator';
import { PromptLab } from '@/components/researcher/PromptLab';
import { TimeAnalysis } from '@/components/researcher/TimeAnalysis';
import { BatchManager } from '@/components/researcher/BatchManager';
import { NoConsentFeedbackTable } from '@/components/researcher/NoConsentFeedbackTable';

const TAB_STORAGE_KEY = 'researcher-dashboard-active-tab';

const ResearcherDashboard = () => {
  const { user, role, logout, isSuperAdmin } = useResearcherAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    return sessionStorage.getItem(TAB_STORAGE_KEY) || 'summary';
  });

  useEffect(() => {
    sessionStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

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
                {user?.email} • {role === 'super_admin' ? 'Super Admin' : 'Viewer'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
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
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid lg:grid-cols-10">
            <TabsTrigger value="summary" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Summary</span>
            </TabsTrigger>
            <TabsTrigger value="responses" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Responses</span>
            </TabsTrigger>
            <TabsTrigger value="calls" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Calls</span>
            </TabsTrigger>
            <TabsTrigger value="time" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Time Analysis</span>
            </TabsTrigger>
            <TabsTrigger value="formality" className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">Formality</span>
            </TabsTrigger>
            <TabsTrigger value="prompts" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Prompts</span>
            </TabsTrigger>
            <TabsTrigger value="batches" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Batches</span>
            </TabsTrigger>
            <TabsTrigger value="no-consent" className="flex items-center gap-2">
              <UserX className="h-4 w-4" />
              <span className="hidden sm:inline">No Consent</span>
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="archived" className="flex items-center gap-2">
                <Archive className="h-4 w-4" />
                <span className="hidden sm:inline">Archived</span>
              </TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Settings</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="summary">
            <DataSummary />
          </TabsContent>

          <TabsContent value="responses">
            <Card>
              <CardHeader>
                <CardTitle>Experiment Responses</CardTitle>
                <CardDescription>
                  View all participant experiment responses including PETS, TIAS, and feedback data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ExperimentResponsesTable />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calls">
            <Card>
              <CardHeader>
                <CardTitle>Participant Calls</CardTitle>
                <CardDescription>
                  Call session data and metadata
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ParticipantCallsTable />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="time">
            <TimeAnalysis />
          </TabsContent>

          <TabsContent value="formality">
            <FormalityCalculator />
          </TabsContent>

          <TabsContent value="prompts">
            <PromptLab />
          </TabsContent>

          <TabsContent value="batches">
            <BatchManager />
          </TabsContent>

          <TabsContent value="no-consent">
            <NoConsentFeedbackTable />
          </TabsContent>

          {isSuperAdmin && (
            <TabsContent value="archived">
              <Card>
                <CardHeader>
                  <CardTitle>Archived Responses</CardTitle>
                  <CardDescription>
                    Responses that have been archived (soft deleted) - only visible to super admins
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
    </div>
  );
};

export default ResearcherDashboard;
