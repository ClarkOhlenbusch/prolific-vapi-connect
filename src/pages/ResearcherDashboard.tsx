import { useState } from 'react';
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
  Settings
} from 'lucide-react';
import { ExperimentResponsesTable } from '@/components/researcher/ExperimentResponsesTable';
import { ParticipantCallsTable } from '@/components/researcher/ParticipantCallsTable';
import { ArchivedResponsesTable } from '@/components/researcher/ArchivedResponsesTable';
import { DataSummary } from '@/components/researcher/DataSummary';
import { ExperimentSettings } from '@/components/researcher/ExperimentSettings';

const ResearcherDashboard = () => {
  const { user, role, logout, isSuperAdmin } = useResearcherAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('summary');

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
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid lg:grid-cols-5">
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
