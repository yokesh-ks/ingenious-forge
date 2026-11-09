import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "@/components/ui/separator";

const meta: Meta<typeof Separator> = {
  title: "UI/Separator",
  component: Separator,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-64 space-y-2">
      <p className="text-sm">Sessions</p>
      <Separator />
      <p className="text-muted-foreground text-sm">3 active</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-8 items-center gap-2 text-sm">
      <span>main</span>
      <Separator orientation="vertical" />
      <span>feat/storybook</span>
      <Separator orientation="vertical" />
      <span>3 commits ahead</span>
    </div>
  ),
};
