import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const meta: Meta<typeof ToggleGroup> = {
  title: "UI/ToggleGroup",
  component: ToggleGroup,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ToggleGroup>;

export const Single: Story = {
  render: () => (
    <ToggleGroup type="single" defaultValue="chat">
      <ToggleGroupItem value="chat">Chat</ToggleGroupItem>
      <ToggleGroupItem value="terminal">Terminal</ToggleGroupItem>
      <ToggleGroupItem value="git">Git</ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Multiple: Story = {
  render: () => (
    <ToggleGroup type="multiple" defaultValue={["p0", "p1"]}>
      <ToggleGroupItem value="p0">P0</ToggleGroupItem>
      <ToggleGroupItem value="p1">P1</ToggleGroupItem>
      <ToggleGroupItem value="p2">P2</ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <ToggleGroup type="single" defaultValue="left">
      <ToggleGroupItem value="left" aria-label="Align left">
        <AlignLeft className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <AlignCenter className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <AlignRight className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};
