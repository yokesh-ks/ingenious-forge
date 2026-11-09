import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bold, Eye, GitBranch, Italic } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

const meta: Meta<typeof Toggle> = {
  title: "UI/Toggle",
  component: Toggle,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "outline"] },
    size: { control: "select", options: ["default", "sm", "lg"] },
  },
};

export default meta;
type Story = StoryObj<typeof Toggle>;

export const Default: Story = {
  args: { children: "Show diff" },
};

export const WithIcon: Story = {
  render: () => (
    <Toggle aria-label="Watch branch">
      <GitBranch className="h-4 w-4" />
      Watch
    </Toggle>
  ),
};

export const Pressed: Story = {
  args: { defaultPressed: true, children: "Active" },
};

export const Formatting: Story = {
  render: () => (
    <div className="flex gap-1">
      <Toggle size="sm" aria-label="Bold">
        <Bold className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" aria-label="Italic">
        <Italic className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" aria-label="Preview" defaultPressed>
        <Eye className="h-4 w-4" />
      </Toggle>
    </div>
  ),
};
