import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const meta: Meta<typeof Textarea> = {
  title: "UI/Textarea",
  component: Textarea,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: { placeholder: "Describe the task…", className: "w-80" },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <Label htmlFor="instructions">Agent instructions</Label>
      <Textarea
        id="instructions"
        placeholder="You are working in the ingenious-forge repository. Follow AGENTS.md principles…"
        rows={4}
      />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    defaultValue: "Session is read-only",
    disabled: true,
    className: "w-80",
  },
};
