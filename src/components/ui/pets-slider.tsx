import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface PetsSliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  hasInteracted?: boolean;
  onInteract?: () => void;
}

const PetsSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  PetsSliderProps
>(({ className, hasInteracted = false, onInteract, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    onPointerDown={onInteract}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      <SliderPrimitive.Range 
        className={cn(
          "absolute h-full bg-primary transition-opacity",
          !hasInteracted && "opacity-0"
        )} 
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb 
      className={cn(
        "block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        !hasInteracted && "opacity-0 scale-0"
      )}
    />
  </SliderPrimitive.Root>
));
PetsSlider.displayName = "PetsSlider";

export { PetsSlider };
