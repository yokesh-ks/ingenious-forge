import type { Meta, StoryObj } from "@storybook/react-vite";
import { Kbd } from "@/components/ui/kbd";

const meta: Meta<typeof Kbd> = {
  title: "UI/Kbd",
  component: Kbd,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Kbd>;

export const Default: Story = {
  args: { children: "⌘K" },
};

export const Shortcuts: Story = {
  render: () => (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-8">
        <span>Command palette</span>
        <Kbd>⌘K</Kbd>
      </div>
      <div className="flex items-center justify-between gap-8">
        <span>New session</span>
        <Kbd>⌘N</Kbd>
      </div>
      <div className="flex items-center justify-between gap-8">
        <span>Open terminal</span>
        <Kbd>⌘`</Kbd>
      </div>
      <div className="flex items-center justify-between gap-8">
        <span>Submit message</span>
        <span className="flex items-center gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
        </span>
      </div>
    </div>
  ),
};
