import type { Meta, StoryObj } from "@storybook/react-vite";
import { Slider } from "@/components/ui/slider";

const meta: Meta<typeof Slider> = {
  title: "UI/Slider",
  component: Slider,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = {
  args: { defaultValue: [50], max: 100, step: 1, className: "w-64" },
};

export const ContextLimit: Story = {
  render: () => (
    <div className="w-72 space-y-3">
      <div className="flex justify-between text-sm">
        <span>Context limit</span>
        <span className="text-muted-foreground">64k tokens</span>
      </div>
      <Slider defaultValue={[64]} min={8} max={200} step={8} />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>8k</span>
        <span>200k</span>
      </div>
    </div>
  ),
};

export const Temperature: Story = {
  render: () => (
    <div className="w-72 space-y-3">
      <div className="flex justify-between text-sm">
        <span>Temperature</span>
        <span className="text-muted-foreground">0.7</span>
      </div>
      <Slider defaultValue={[0.7]} min={0} max={1} step={0.1} />
    </div>
  ),
};
