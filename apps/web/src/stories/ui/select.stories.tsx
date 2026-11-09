import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const meta: Meta<typeof Select> = {
  title: "UI/Select",
  component: Select,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6</SelectItem>
        <SelectItem value="claude-opus-5-5">Claude Opus 5.5</SelectItem>
        <SelectItem value="claude-haiku-5-5">Claude Haiku 5.5</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex w-56 flex-col gap-2">
      <Label htmlFor="priority">Priority</Label>
      <Select>
        <SelectTrigger id="priority">
          <SelectValue placeholder="Choose priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="p0">P0 — Critical</SelectItem>
          <SelectItem value="p1">P1 — High</SelectItem>
          <SelectItem value="p2">P2 — Normal</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const WithGroups: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select area" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Frontend</SelectLabel>
          <SelectItem value="area:web-ui">Web UI</SelectItem>
          <SelectItem value="area:board">Board</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Backend</SelectLabel>
          <SelectItem value="area:server">Server</SelectItem>
          <SelectItem value="area:agent">Agent</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Process</SelectLabel>
          <SelectItem value="area:skills">Skills</SelectItem>
          <SelectItem value="area:docs">Docs</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};
