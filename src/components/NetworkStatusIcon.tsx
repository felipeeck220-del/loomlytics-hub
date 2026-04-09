import { useNetworkStatus, type ConnectionQuality } from '@/hooks/useNetworkStatus';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { X } from 'lucide-react';

const COLORS: Record<ConnectionQuality, string> = {
  good: 'text-success',
  medium: 'text-warning',
  poor: 'text-destructive',
  offline: 'text-destructive',
};

function SignalBars({ quality }: { quality: ConnectionQuality }) {
  if (quality === 'offline') {
    return <X className="h-4 w-4 text-destructive" />;
  }

  const activeBars = quality === 'good' ? 4 : quality === 'medium' ? 2 : 1;
  const barHeights = [6, 9, 12, 16];
  const color = COLORS[quality];

  return (
    <div className="flex items-end gap-[2px] h-4">
      {barHeights.map((h, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-sm transition-colors ${
            i < activeBars ? color.replace('text-', 'bg-') : 'bg-muted-foreground/25'
          }`}
          style={{ height: `${h}px` }}
        />
      ))}
    </div>
  );
}

export default function NetworkStatusIcon() {
  const { quality, label } = useNetworkStatus();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center h-8 w-8 cursor-default">
          <SignalBars quality={quality} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
