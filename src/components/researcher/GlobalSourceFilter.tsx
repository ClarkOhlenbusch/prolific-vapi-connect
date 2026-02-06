import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Users, FlaskConical, UsersRound } from 'lucide-react';

export type SourceFilterValue = 'all' | 'participant' | 'researcher';

interface GlobalSourceFilterProps {
  value: SourceFilterValue;
  onChange: (value: SourceFilterValue) => void;
}

export const GlobalSourceFilter = ({ value, onChange }: GlobalSourceFilterProps) => {
  return (
    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
      <span className="text-sm font-medium text-muted-foreground">Data Source:</span>
      <ToggleGroup 
        type="single" 
        value={value} 
        onValueChange={(v) => v && onChange(v as SourceFilterValue)}
        className="justify-start"
      >
        <ToggleGroupItem 
          value="participant" 
          aria-label="Participants only"
          className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <Users className="h-4 w-4 mr-1.5" />
          Participants
        </ToggleGroupItem>
        <ToggleGroupItem 
          value="researcher" 
          aria-label="Researchers only"
          className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <FlaskConical className="h-4 w-4 mr-1.5" />
          Researchers
        </ToggleGroupItem>
        <ToggleGroupItem 
          value="all" 
          aria-label="All sources"
          className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <UsersRound className="h-4 w-4 mr-1.5" />
          All
        </ToggleGroupItem>
      </ToggleGroup>
      <span className="text-xs text-muted-foreground ml-2">
        (Affects Summary, Responses, Time, No Consent, and Statistics)
      </span>
    </div>
  );
};
