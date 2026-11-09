import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const meta: Meta<typeof Switch> = {
  title: "UI/Switch",
  component: Switch,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["default", "sm"] },
    disabled: { control: "boolean" },
    defaultChecked: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  args: { id: "default" },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="auto-merge" />
      <Label htmlFor="auto-merge">Auto-merge when CI passes</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="hooks" defaultChecked />
      <Label htmlFor="hooks">Git hooks enabled</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="force-push" disabled />
      <Label htmlFor="force-push" className="text-muted-foreground">
        Force push (locked)
      </Label>
    </div>
  ),
};

export const SettingsList: Story = {
  render: () => (
    <div className="w-72 space-y-4">
      {[
        { id: "s1", label: "Show diff on commit", checked: true },
        { id: "s2", label: "Auto-stage on save", checked: false },
        { id: "s3", label: "Branch protection", checked: true },
        { id: "s4", label: "Verbose agent logs", checked: false },
      ].map(({ id, label, checked }) => (
        <div key={id} className="flex items-center justify-between">
          <Label htmlFor={id}>{label}</Label>
          <Switch id={id} defaultChecked={checked} />
        </div>
      ))}
    </div>
  ),
};
