import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronDown, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const meta: Meta<typeof Collapsible> = {
  title: "UI/Collapsible",
  component: Collapsible,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Collapsible>;

export const Default: Story = {
  render: () => (
    <Collapsible className="w-72">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between">
          <span className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            src/features/
          </span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 space-y-1">
        {["chat", "git", "session", "terminal", "workspace-panel"].map((dir) => (
          <p key={dir} className="text-sm text-muted-foreground py-0.5">
            {dir}/
          </p>
        ))}
      </CollapsibleContent>
    </Collapsible>
  ),
};
