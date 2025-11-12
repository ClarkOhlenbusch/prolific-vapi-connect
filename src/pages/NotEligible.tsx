import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const NotEligible = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-2xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl text-center">Thank You for Your Interest</CardTitle>
          <CardDescription className="text-center">
            Unfortunately, you do not meet the eligibility criteria for this study.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            We appreciate your time and interest in participating. However, this study is specifically targeting participants aged 60 and above.
          </p>
          <p className="text-muted-foreground">
            Thank you for your understanding.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotEligible;
