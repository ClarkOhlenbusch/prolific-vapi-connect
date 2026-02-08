import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
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
import { KeyRound, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface AdminPasswordResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetEmail?: string;
  targetUserId?: string;
}

export const AdminPasswordResetDialog = ({
  open,
  onOpenChange,
  targetEmail: initialEmail,
  targetUserId,
}: AdminPasswordResetDialogProps) => {
  const [email, setEmail] = useState(initialEmail || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(initialEmail || '');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [open, initialEmail]);

  const handleReset = async () => {
    if (!email.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('update-admin-password', {
        body: { targetEmail: email, newPassword },
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to reset password');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast.success(`Password reset successfully for ${email}`);
      onOpenChange(false);
      setEmail('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setEmail(initialEmail || '');
      setNewPassword('');
      setConfirmPassword('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Reset User Password
          </DialogTitle>
          <DialogDescription>
            Set a new password for a researcher account. The user will need to use this new password to log in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">User Email</Label>
            <Input
              id="reset-email"
              type="email"
              placeholder="researcher@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!initialEmail}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleReset} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resetting...
              </>
            ) : (
              'Reset Password'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
