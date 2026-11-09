import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const meta: Meta<typeof ResizablePanelGroup> = {
  title: "UI/Resizable",
  component: ResizablePanelGroup,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ResizablePanelGroup>;

export const Horizontal: Story = {
  render: () => (
    <ResizablePanelGroup direction="horizontal" className="h-48 max-w-2xl rounded-lg border">
      <ResizablePanel defaultSize={30}>
        <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
          File tree
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={70}>
        <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
          Editor / Chat
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};

export const Vertical: Story = {
  render: () => (
    <ResizablePanelGroup direction="vertical" className="h-64 max-w-sm rounded-lg border">
      <ResizablePanel defaultSize={60}>
        <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
          Chat
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={40}>
        <div className="flex h-full items-center justify-center p-4 font-mono text-sm text-muted-foreground">
          Terminal
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};

export const ThreePanels: Story = {
  render: () => (
    <ResizablePanelGroup direction="horizontal" className="h-48 max-w-2xl rounded-lg border">
      <ResizablePanel defaultSize={25}>
        <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
          Sidebar
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>
        <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
          Main
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={25}>
        <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
          Details
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};
