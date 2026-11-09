import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta: Meta<typeof Label> = {
  title: "UI/Label",
  component: Label,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = {
  args: { children: "Branch name" },
};

export const WithInput: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-2">
      <Label htmlFor="repo">Repository</Label>
      <Input id="repo" placeholder="ingenious-forge" />
    </div>
  ),
};

export const Required: Story = {
  render: () => (
    <div className="flex w-64 flex-col gap-2">
      <Label htmlFor="model">
        Model <span className="text-destructive">*</span>
      </Label>
      <Input id="model" placeholder="claude-sonnet-4-6" />
    </div>
  ),
};
