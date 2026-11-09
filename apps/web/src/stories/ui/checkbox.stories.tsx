import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const meta: Meta<typeof Checkbox> = {
  title: "UI/Checkbox",
  component: Checkbox,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
    defaultChecked: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  args: { id: "default" },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="verified" defaultChecked />
      <Label htmlFor="verified">Verification passed</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="disabled" disabled />
      <Label htmlFor="disabled" className="text-muted-foreground">
        Feature locked
      </Label>
    </div>
  ),
};

export const CheckList: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="c1" defaultChecked />
        <Label htmlFor="c1">Run unit tests</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c2" defaultChecked />
        <Label htmlFor="c2">Biome lint clean</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c3" />
        <Label htmlFor="c3">Build Storybook</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c4" />
        <Label htmlFor="c4">Open pull request</Label>
      </div>
    </div>
  ),
};
