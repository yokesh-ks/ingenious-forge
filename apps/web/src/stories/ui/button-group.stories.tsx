import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronDown, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";

const meta: Meta<typeof ButtonGroup> = {
  title: "UI/ButtonGroup",
  component: ButtonGroup,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ButtonGroup>;

export const Default: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">
        <Upload className="h-4 w-4" /> Push
      </Button>
      <Button variant="outline">
        <Download className="h-4 w-4" /> Pull
      </Button>
      <Button variant="outline">
        <ChevronDown className="h-4 w-4" />
      </Button>
    </ButtonGroup>
  ),
};

export const WithText: Story = {
  render: () => (
    <ButtonGroup>
      <ButtonGroupText>https://</ButtonGroupText>
      <Input placeholder="github.com/ingenious-forge" className="rounded-l-none border-l-0" />
    </ButtonGroup>
  ),
};

export const Vertical: Story = {
  render: () => (
    <ButtonGroup orientation="vertical">
      <Button variant="outline">Main</Button>
      <Button variant="outline">feat/chat-ui</Button>
      <Button variant="outline">fix/api-types</Button>
    </ButtonGroup>
  ),
};
