import type { Meta, StoryObj } from "@storybook/react-vite";
import { Progress } from "@/components/ui/progress";

const meta: Meta<typeof Progress> = {
  title: "UI/Progress",
  component: Progress,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    value: { control: { type: "range", min: 0, max: 100, step: 1 } },
  },
};

export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  args: { value: 60, className: "w-80" },
};

export const Building: Story = {
  render: () => (
    <div className="w-80 space-y-2">
      <div className="flex justify-between text-sm">
        <span>Building…</span>
        <span>72%</span>
      </div>
      <Progress value={72} />
    </div>
  ),
};

export const Complete: Story = {
  render: () => (
    <div className="w-80 space-y-2">
      <div className="flex justify-between text-sm">
        <span>Tests passed</span>
        <span>722 / 722</span>
      </div>
      <Progress value={100} />
    </div>
  ),
};

export const Stages: Story = {
  render: () => (
    <div className="w-80 space-y-4">
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Type check</span>
          <span>100%</span>
        </div>
        <Progress value={100} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Unit tests</span>
          <span>87%</span>
        </div>
        <Progress value={87} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Storybook build</span>
          <span>34%</span>
        </div>
        <Progress value={34} />
      </div>
    </div>
  ),
};
