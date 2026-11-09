import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

const meta: Meta<typeof Toaster> = {
  title: "UI/Sonner",
  component: Toaster,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Toaster>;

export const Success: Story = {
  render: () => (
    <Button onClick={() => toast.success("Build succeeded", { description: "722 tests passed · 0 errors" })}>
      Show success
    </Button>
  ),
};

export const Error: Story = {
  render: () => (
    <Button
      variant="destructive"
      onClick={() => toast.error("Build failed", { description: "TypeScript error in api/types.ts" })}
    >
      Show error
    </Button>
  ),
};

export const Info: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() => toast.info("Branch pushed", { description: "feat/storybook-161 → origin" })}
    >
      Show info
    </Button>
  ),
};

export const Loading: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast.promise(new Promise((r) => setTimeout(r, 2000)), {
          loading: "Building Storybook…",
          success: "Storybook built successfully",
          error: "Build failed",
        })
      }
    >
      Show loading
    </Button>
  ),
};
