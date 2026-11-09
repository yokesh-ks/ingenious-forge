import type { Meta, StoryObj } from "@storybook/react-vite";
import { Search, X } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

const meta: Meta<typeof InputGroup> = {
  title: "UI/InputGroup",
  component: InputGroup,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof InputGroup>;

export const WithIcon: Story = {
  render: () => (
    <InputGroup className="w-72">
      <InputGroupAddon>
        <InputGroupText>
          <Search className="h-4 w-4" />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="Search sessions…" />
    </InputGroup>
  ),
};

export const WithPrefix: Story = {
  render: () => (
    <InputGroup className="w-72">
      <InputGroupAddon>
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="github.com/ingenious-forge" />
    </InputGroup>
  ),
};

export const WithClearButton: Story = {
  render: () => (
    <InputGroup className="w-72">
      <InputGroupAddon>
        <InputGroupText>
          <Search className="h-4 w-4" />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput defaultValue="feat/storybook" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label="Clear">
          <X />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
};
