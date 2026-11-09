import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

const meta: Meta<typeof Badge> = {
  title: "UI/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline", "ghost", "link"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: "Badge" },
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2 items-center">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="ghost">Ghost</Badge>
      <Badge variant="link">Link</Badge>
    </div>
  ),
};

export const InContext: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 items-center text-sm">
        <span>Status</span>
        <Badge variant="default">Running</Badge>
      </div>
      <div className="flex gap-2 items-center text-sm">
        <span>Priority</span>
        <Badge variant="destructive">P0</Badge>
      </div>
      <div className="flex gap-2 items-center text-sm">
        <span>Area</span>
        <Badge variant="secondary">web-ui</Badge>
        <Badge variant="secondary">server</Badge>
      </div>
    </div>
  ),
};
