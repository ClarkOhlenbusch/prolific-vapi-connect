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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, UserPlus, Trash2, Shield, Eye, KeyRound, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPasswordResetDialog } from '@/components/researcher/AdminPasswordResetDialog';

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

interface ResearcherUser {
  id: string;
  user_id: string;
  role: 'super_admin' | 'viewer';
  created_at: string;
  email: string;
  username?: string | null;
}

const ResearcherUserManagement = () => {
  const navigate = useNavigate();
  const { isSuperAdmin, user } = useResearcherAuth();
  const [users, setUsers] = useState<ResearcherUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserRole, setNewUserRole] = useState<'super_admin' | 'viewer'>('viewer');
  const [isAdding, setIsAdding] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordEmail, setResetPasswordEmail] = useState<string | undefined>();
  const [editUsernameOpen, setEditUsernameOpen] = useState(false);
  const [editUsernameValue, setEditUsernameValue] = useState('');
  const [editUsernameUserId, setEditUsernameUserId] = useState<string | null>(null);
  const [editUsernameUserEmail, setEditUsernameUserEmail] = useState<string>('');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);

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
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('list-researchers', {
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch users');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      setUsers(response.data?.users || []);
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

    if (!newUserPassword.trim()) {
      toast.error('Please enter a password');
      return;
    }

    if (newUserPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    const normalizedUsername = newUserUsername.trim().toLowerCase();
    if (normalizedUsername && !USERNAME_PATTERN.test(normalizedUsername)) {
      toast.error('Username must be 3-32 chars: letters, numbers, dot, underscore, hyphen');
      return;
    }

    setIsAdding(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('create-researcher', {
        body: { 
          email: newUserEmail, 
          password: newUserPassword,
          role: newUserRole,
          username: normalizedUsername || undefined,
        },
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create researcher');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast.success(response.data?.message || 'Researcher created successfully');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserUsername('');
      setNewUserRole('viewer');
      fetchUsers();
    } catch (error) {
      console.error('Error adding user:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add user');
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

  const openEditUsernameDialog = (targetUser: ResearcherUser) => {
    setEditUsernameUserId(targetUser.user_id);
    setEditUsernameUserEmail(targetUser.email);
    setEditUsernameValue((targetUser.username || '').trim());
    setEditUsernameOpen(true);
  };

  const handleUpdateUsername = async () => {
    if (!editUsernameUserId) return;

    const normalizedUsername = editUsernameValue.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      toast.error('Username must be 3-32 chars: letters, numbers, dot, underscore, hyphen');
      return;
    }

    setIsUpdatingUsername(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('update-researcher-username', {
        body: {
          targetUserId: editUsernameUserId,
          username: normalizedUsername,
        },
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

      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === editUsernameUserId
            ? { ...u, username: normalizedUsername }
            : u
        )
      );
      toast.success('Username updated');
      setEditUsernameOpen(false);
      setEditUsernameUserId(null);
      setEditUsernameUserEmail('');
      setEditUsernameValue('');
      // Refresh from backend as source of truth (edge metadata can be briefly stale).
      setTimeout(() => {
        void fetchUsers();
      }, 400);
    } catch (error) {
      console.error('Error updating username:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update username');
    } finally {
      setIsUpdatingUsername(false);
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
              Create Researcher Account
            </CardTitle>
            <CardDescription>
              Create a new researcher account with email and password. The user will be able to log in immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="researcher@example.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2 max-w-sm">
                <Label htmlFor="username">Username (Optional)</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="e.g. ovroom"
                  value={newUserUsername}
                  onChange={(e) => setNewUserUsername(e.target.value)}
                />
              </div>
              <div className="flex gap-4 items-end">
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
                  {isAdding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create Account
                    </>
                  )}
                </Button>
              </div>
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
                    <TableHead>Email</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((researcherUser) => (
                    <TableRow key={researcherUser.id}>
                      <TableCell className="font-medium">
                        {researcherUser.user_id === user?.id ? (
                          <span className="flex items-center gap-2">
                            {researcherUser.email}
                            <Badge variant="outline" className="text-xs">You</Badge>
                          </span>
                        ) : (
                          researcherUser.email
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {researcherUser.username || <span className="text-muted-foreground/70">Not set</span>}
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
                            onClick={() => openEditUsernameDialog(researcherUser)}
                            title="Edit Username"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setResetPasswordEmail(researcherUser.email);
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

      <Dialog
        open={editUsernameOpen}
        onOpenChange={(open) => {
          setEditUsernameOpen(open);
          if (!open) {
            setEditUsernameUserId(null);
            setEditUsernameUserEmail('');
            setEditUsernameValue('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Username</DialogTitle>
            <DialogDescription>
              Update username for {editUsernameUserEmail || 'researcher account'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="edit-username">Username</Label>
            <Input
              id="edit-username"
              type="text"
              placeholder="e.g. ovroom"
              value={editUsernameValue}
              onChange={(e) => setEditUsernameValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              3-32 chars, letters/numbers/dot/underscore/hyphen.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUsernameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUsername} disabled={isUpdatingUsername}>
              {isUpdatingUsername ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResearcherUserManagement;
