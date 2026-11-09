import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "@/components/ui/badge";

const meta: Meta<typeof Badge> = {
  title: "UI/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: "Active" },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "In Progress" },
};

export const Destructive: Story = {
  args: { variant: "destructive", children: "Failed" },
};

export const Outline: Story = {
  args: { variant: "outline", children: "Draft" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Active</Badge>
      <Badge variant="secondary">In Progress</Badge>
      <Badge variant="destructive">Error</Badge>
      <Badge variant="outline">Draft</Badge>
    </div>
  ),
};

export const StatusBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>P0</Badge>
      <Badge variant="secondary">P1</Badge>
      <Badge variant="outline">P2</Badge>
      <Badge variant="destructive">Blocked</Badge>
      <Badge variant="secondary">feat</Badge>
      <Badge variant="outline">chore</Badge>
    </div>
  ),
};
