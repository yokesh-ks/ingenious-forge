import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const meta: Meta<typeof ScrollArea> = {
  title: "UI/ScrollArea",
  component: ScrollArea,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ScrollArea>;

const branches = [
  "main",
  "feat/chat-ui-45",
  "feat/storybook-161",
  "feat/session-board-72",
  "fix/api-types-98",
  "fix/ws-reconnect-103",
  "chore/biome-config-115",
  "docs/adr-0016-120",
  "refactor/feature-structure-130",
  "test/agent-turn-end-140",
];

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-48 w-56 rounded-md border">
      <div className="p-3">
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">Branches</h4>
        {branches.map((branch) => (
          <div key={branch}>
            <p className="py-1 text-sm font-mono">{branch}</p>
            <Separator />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const MessageLog: Story = {
  render: () => (
    <ScrollArea className="h-64 w-96 rounded-md border p-3">
      {Array.from({ length: 20 }, (_, i) => (
        <p key={i} className="mb-2 text-sm text-muted-foreground">
          [{String(i + 1).padStart(2, "0")}] Agent wrote{" "}
          <span className="font-mono text-foreground">src/stories/ui/component-{i + 1}.stories.tsx</span>
        </p>
      ))}
    </ScrollArea>
  ),
};
