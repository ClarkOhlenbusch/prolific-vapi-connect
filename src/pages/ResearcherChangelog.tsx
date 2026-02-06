import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, FlaskConical } from 'lucide-react';

interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: 'added' | 'changed' | 'fixed' | 'removed';
    description: string;
  }[];
}

const changelog: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2024-02-06',
    changes: [
      { type: 'added', description: 'Initial release of the research dashboard' },
      { type: 'added', description: 'Participant response tracking and management' },
      { type: 'added', description: 'Formality calculator with batch processing' },
      { type: 'added', description: 'Statistical analysis tools' },
    ],
  },
];

const typeColors = {
  added: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  changed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  fixed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  removed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const ResearcherChangelog = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FlaskConical className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Changelog</h1>
              <p className="text-sm text-muted-foreground">Version history and updates</p>
            </div>
          </div>
          
          <Button variant="outline" onClick={() => navigate('/researcher/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Release History</CardTitle>
            <CardDescription>
              Track all changes, improvements, and fixes to the research platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-300px)]">
              <div className="space-y-8">
                {changelog.map((entry) => (
                  <div key={entry.version} className="border-l-2 border-primary/20 pl-4">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-lg font-semibold">v{entry.version}</span>
                      <span className="text-sm text-muted-foreground">{entry.date}</span>
                    </div>
                    <ul className="space-y-2">
                      {entry.changes.map((change, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${typeColors[change.type]}`}>
                            {change.type}
                          </span>
                          <span className="text-sm">{change.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ResearcherChangelog;
