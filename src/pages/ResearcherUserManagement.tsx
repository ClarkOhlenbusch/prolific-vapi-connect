import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, UserPlus, Trash2, Shield, Eye, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPasswordResetDialog } from '@/components/researcher/AdminPasswordResetDialog';

interface ResearcherUser {
  id: string;
  user_id: string;
  role: 'super_admin' | 'viewer';
  created_at: string;
  email?: string;
}

const ResearcherUserManagement = () => {
  const navigate = useNavigate();
  const { isSuperAdmin, user } = useResearcherAuth();
  const [users, setUsers] = useState<ResearcherUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'super_admin' | 'viewer'>('viewer');
  const [isAdding, setIsAdding] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordEmail, setResetPasswordEmail] = useState<string | undefined>();

  useEffect(() => {
    if (!isSuperAdmin) {
      navigate('/researcher/dashboard');
      return;
    }
    fetchUsers();
  }, [isSuperAdmin, navigate]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // Get all researcher roles
      const { data: roles, error } = await supabase
        .from('researcher_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // For now, we'll just show the user IDs since we can't query auth.users
      // In a real app, you'd use an edge function to get user emails
      setUsers(roles || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setIsAdding(true);
    try {
      // First, we need to find the user by email
      // This requires creating a user first via Supabase Auth
      // For now, we'll show an info message about the workflow
      toast.info(
        'To add a researcher, they must first create an account by logging in at /researcher. Then you can update their role here.',
        { duration: 5000 }
      );
      setNewUserEmail('');
    } catch (error) {
      console.error('Error adding user:', error);
      toast.error('Failed to add user');
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: 'super_admin' | 'viewer') => {
    // Prevent changing own role
    if (userId === user?.id) {
      toast.error("You cannot change your own role");
      return;
    }

    try {
      const { error } = await supabase
        .from('researcher_roles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) throw error;

      toast.success(`Role updated to ${newRole}`);
      fetchUsers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;

    // Prevent deleting own role
    if (deleteUserId === user?.id) {
      toast.error("You cannot remove your own access");
      setDeleteUserId(null);
      return;
    }

    try {
      const { error } = await supabase
        .from('researcher_roles')
        .delete()
        .eq('user_id', deleteUserId);

      if (error) throw error;

      toast.success('User access removed');
      setDeleteUserId(null);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Failed to remove user');
    }
  };

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/researcher/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-muted-foreground">Manage researcher access and roles</p>
          </div>
        </div>

        {/* Add User Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add Researcher Access
            </CardTitle>
            <CardDescription>
              Note: Users must first create an account by logging in at the researcher portal. 
              Once they have an account, their role will appear here and you can update it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="researcher@example.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
              </div>
              <div className="w-40 space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as 'super_admin' | 'viewer')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddUser} disabled={isAdding}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        <Card>
          <CardHeader>
            <CardTitle>Current Researchers</CardTitle>
            <CardDescription>
              Users with access to the researcher dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : users.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No researchers found
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((researcherUser) => (
                    <TableRow key={researcherUser.id}>
                      <TableCell className="font-mono text-sm">
                        {researcherUser.user_id === user?.id ? (
                          <span className="flex items-center gap-2">
                            {researcherUser.user_id.slice(0, 8)}...
                            <Badge variant="outline" className="text-xs">You</Badge>
                          </span>
                        ) : (
                          `${researcherUser.user_id.slice(0, 8)}...`
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={researcherUser.role}
                          onValueChange={(v) => handleUpdateRole(researcherUser.user_id, v as 'super_admin' | 'viewer')}
                          disabled={researcherUser.user_id === user?.id}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue>
                              {researcherUser.role === 'super_admin' ? (
                                <span className="flex items-center gap-2">
                                  <Shield className="h-3 w-3" />
                                  Super Admin
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  <Eye className="h-3 w-3" />
                                  Viewer
                                </span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">
                              <span className="flex items-center gap-2">
                                <Eye className="h-3 w-3" />
                                Viewer
                              </span>
                            </SelectItem>
                            <SelectItem value="super_admin">
                              <span className="flex items-center gap-2">
                                <Shield className="h-3 w-3" />
                                Super Admin
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(researcherUser.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setResetPasswordEmail(researcherUser.email || undefined);
                              setResetPasswordOpen(true);
                            }}
                            title="Reset Password"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteUserId(researcherUser.user_id)}
                            disabled={researcherUser.user_id === user?.id}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Researcher Access?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the user's access to the researcher dashboard. They will no longer
              be able to view experiment data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password Reset Dialog */}
      <AdminPasswordResetDialog
        open={resetPasswordOpen}
        onOpenChange={setResetPasswordOpen}
        targetEmail={resetPasswordEmail}
      />
    </div>
  );
};

export default ResearcherUserManagement;
