import type { Meta, StoryObj } from "@storybook/react-vite";
import { AspectRatio } from "@/components/ui/aspect-ratio";

const meta: Meta<typeof AspectRatio> = {
  title: "UI/AspectRatio",
  component: AspectRatio,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof AspectRatio>;

export const Widescreen: Story = {
  render: () => (
    <div className="w-80">
      <AspectRatio ratio={16 / 9} className="rounded-md bg-muted flex items-center justify-center">
        <span className="text-muted-foreground text-sm">16 / 9</span>
      </AspectRatio>
    </div>
  ),
};

export const Square: Story = {
  render: () => (
    <div className="w-48">
      <AspectRatio ratio={1} className="rounded-md bg-muted flex items-center justify-center">
        <span className="text-muted-foreground text-sm">1 / 1</span>
      </AspectRatio>
    </div>
  ),
};

export const Portrait: Story = {
  render: () => (
    <div className="w-32">
      <AspectRatio ratio={3 / 4} className="rounded-md bg-muted flex items-center justify-center">
        <span className="text-muted-foreground text-sm">3 / 4</span>
      </AspectRatio>
    </div>
  ),
};
