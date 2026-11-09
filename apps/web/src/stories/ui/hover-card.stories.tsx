import type { Meta, StoryObj } from "@storybook/react-vite";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

const meta: Meta<typeof HoverCard> = {
  title: "UI/HoverCard",
  component: HoverCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof HoverCard>;

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="link">feat/storybook-161</Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72">
        <div className="flex gap-3">
          <GitBranch className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium">feat/storybook-161</p>
            <p className="text-xs text-muted-foreground">
              7 commits ahead of main · last push 2 minutes ago
            </p>
            <p className="text-xs text-muted-foreground">
              Linked to issue #161: Add Storybook for component development
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};
