import type { Meta, StoryObj } from "@storybook/react-vite";
import { Download, Loader2, Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";

const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "xs", "icon"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: { children: "Start session" },
};

export const Destructive: Story = {
  args: { variant: "destructive", children: "Delete session" },
};

export const Outline: Story = {
  args: { variant: "outline", children: "View diff" },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Cancel" },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "Settings" },
};

export const Link: Story = {
  args: { variant: "link", children: "View on GitHub" },
};

export const WithIcon: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button>
        <Plus /> New session
      </Button>
      <Button variant="outline">
        <Download /> Export
      </Button>
      <Button variant="destructive">
        <Trash /> Delete
      </Button>
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <Button disabled>
      <Loader2 className="animate-spin" /> Building…
    </Button>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button size="lg">Large</Button>
      <Button>Default</Button>
      <Button size="sm">Small</Button>
      <Button size="xs">XS</Button>
    </div>
  ),
};
