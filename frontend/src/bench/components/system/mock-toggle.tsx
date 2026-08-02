
import { Switch } from '@bench/components/ui/switch';
import { useMockMode } from '@bench/lib/mock-mode';

export function MockToggle() {
  const [enabled, setEnabled] = useMockMode();

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <Switch checked={enabled} onCheckedChange={setEnabled} />
      Enable Mocks
    </label>
  );
}
