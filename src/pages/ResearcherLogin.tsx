import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FlaskConical, Loader2, AlertCircle, CheckCircle2, Eye, User } from 'lucide-react';

const ACTIVATION_KEY = 'kN&B981$%ZSK';
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

const ResearcherLogin = () => {
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [changeIdentifier, setChangeIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activationKey, setActivationKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const { login, isAuthenticated, isLoading: authLoading, enterGuestMode } = useResearcherAuth();
  const navigate = useNavigate();

  const resolveLoginEmail = async (identifier: string): Promise<{ email: string | null; error: string | null }> => {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      return { email: null, error: 'Please enter an email or username.' };
    }

    if (trimmedIdentifier.includes('@')) {
      return { email: trimmedIdentifier.toLowerCase(), error: null };
    }

    try {
      const { data, error } = await supabase.functions.invoke('resolve-researcher-identifier', {
        body: { identifier: trimmedIdentifier },
      });

      if (error) {
        return { email: null, error: 'Could not resolve username right now. Please try email or retry.' };
      }

      if (!data?.email) {
        return { email: null, error: 'Invalid email/username or password.' };
      }

      return { email: data.email, error: null };
    } catch {
      return { email: null, error: 'Could not resolve username right now. Please try email or retry.' };
    }
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/researcher/dashboard', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Show loading while checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { email, error: resolveError } = await resolveLoginEmail(loginIdentifier);
    if (resolveError || !email) {
      setError(resolveError || 'Invalid email/username or password.');
      setIsLoading(false);
      return;
    }

    const { error } = await login(email, password);
    
    if (error) {
      setError(error);
      setIsLoading(false);
    } else {
      navigate('/researcher/dashboard', { replace: true });
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    // Validate activation key
    if (activationKey !== ACTIVATION_KEY) {
      setError('Invalid activation key');
      setIsLoading(false);
      return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setIsLoading(false);
      return;
    }

    const normalizedUsername = createUsername.trim().toLowerCase();
    if (normalizedUsername && !USERNAME_PATTERN.test(normalizedUsername)) {
      setError('Username must be 3-32 characters and can only include letters, numbers, dot, underscore, or hyphen.');
      setIsLoading(false);
      return;
    }

    if (normalizedUsername) {
      const { email: existingEmail, error: usernameLookupError } = await resolveLoginEmail(normalizedUsername);
      if (usernameLookupError && !usernameLookupError.toLowerCase().includes('invalid email/username or password')) {
        setError('Could not validate username availability. Please try again.');
        setIsLoading(false);
        return;
      }
      if (existingEmail) {
        setError('This username is already in use. Please pick another one.');
        setIsLoading(false);
        return;
      }
    }

    try {
      // Create the account
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: createEmail.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: window.location.origin + '/researcher',
          data: normalizedUsername ? { username: normalizedUsername } : undefined,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
        return;
      }

      // Check if this is a repeated signup (user already exists)
      if (data.user?.identities?.length === 0) {
        setError('An account with this email already exists. Please sign in instead.');
        setIsLoading(false);
        return;
      }

      if (data.user) {
        // Add viewer role - use upsert to handle edge cases
        const { error: roleError } = await supabase
          .from('researcher_roles')
          .upsert(
            { user_id: data.user.id, role: 'viewer' },
            { onConflict: 'user_id' }
          );

        if (roleError) {
          console.error('Failed to add viewer role:', roleError);
          setError('Account created but role assignment failed. Please contact an administrator.');
          setIsLoading(false);
          return;
        }

        setSuccess('Account created successfully! You can now sign in.');
        setActiveTab('login');
        setLoginIdentifier(normalizedUsername || createEmail.trim().toLowerCase());
        setCreateEmail('');
        setCreateUsername('');
        setPassword('');
        setConfirmPassword('');
        setActivationKey('');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    // Validate new passwords match
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      setIsLoading(false);
      return;
    }

    // Validate password strength
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      setIsLoading(false);
      return;
    }

    try {
      const { email, error: resolveError } = await resolveLoginEmail(changeIdentifier);
      if (resolveError || !email) {
        setError(resolveError || 'Current email/username or password is incorrect');
        setIsLoading(false);
        return;
      }

      // First verify current credentials by signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError('Current email or password is incorrect');
        setIsLoading(false);
        return;
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
        setIsLoading(false);
        return;
      }

      // Sign out after password change
      await supabase.auth.signOut();

      setSuccess('Password changed successfully! Please sign in with your new password.');
      setActiveTab('login');
      setPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <FlaskConical className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Researcher Portal</CardTitle>
          <CardDescription>
            Sign in or create an account to access the research dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setError(null); setSuccess(null); }}>
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="create">Create</TabsTrigger>
              <TabsTrigger value="change-password">Password</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                {error && activeTab === 'login' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert className="border-green-500 bg-green-50 text-green-800">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="login-identifier">Email or Username</Label>
                  <Input
                    id="login-identifier"
                    type="text"
                    placeholder="researcher@university.edu or username"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => {
                    enterGuestMode();
                    navigate('/researcher/dashboard', { replace: true });
                  }}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  View as Guest
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => navigate('/')}
                >
                  <User className="mr-2 h-4 w-4" />
                  View as Participant
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Explore the dashboard with sample data
                </p>
              </form>
            </TabsContent>

            <TabsContent value="create">
              <form onSubmit={handleCreateAccount} className="space-y-4">
                {error && activeTab === 'create' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="create-activation">Activation Key</Label>
                  <Input
                    id="create-activation"
                    type="password"
                    placeholder="Enter activation key"
                    value={activationKey}
                    onChange={(e) => setActivationKey(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Contact your research administrator to obtain an activation key
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="create-email">Email</Label>
                  <Input
                    id="create-email"
                    type="email"
                    placeholder="researcher@university.edu"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-username">Username (Optional)</Label>
                  <Input
                    id="create-username"
                    type="text"
                    placeholder="e.g. ovroom"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    If set, you can sign in with this username or your email.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="create-password">Password</Label>
                  <Input
                    id="create-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-confirm">Confirm Password</Label>
                  <Input
                    id="create-confirm"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="change-password">
              <form onSubmit={handleChangePassword} className="space-y-4">
                {error && activeTab === 'change-password' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="change-identifier">Email or Username</Label>
                  <Input
                    id="change-identifier"
                    type="text"
                    placeholder="researcher@university.edu or username"
                    value={changeIdentifier}
                    onChange={(e) => setChangeIdentifier(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-new-password">Confirm New Password</Label>
                  <Input
                    id="confirm-new-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Changing Password...
                    </>
                  ) : (
                    'Change Password'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResearcherLogin;
