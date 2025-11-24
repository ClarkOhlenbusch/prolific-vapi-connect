import { useIsMobile } from "@/hooks/use-mobile";
import { Monitor } from "lucide-react";

export const ScreenSizeWarning = () => {
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <Monitor className="h-16 w-16 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Large Screen Required
          </h1>
          <p className="text-muted-foreground">
            This study must be completed on a larger screen device such as a desktop computer, laptop, or tablet (iPad).
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            Please access this study from a device with a screen width of at least 768 pixels.
          </p>
        </div>
      </div>
    </div>
  );
};
