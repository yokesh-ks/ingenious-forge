import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const meta: Meta<typeof Tabs> = {
  title: "UI/Tabs",
  component: Tabs,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="chat" className="w-96">
      <TabsList>
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="terminal">Terminal</TabsTrigger>
        <TabsTrigger value="git">Git</TabsTrigger>
      </TabsList>
      <TabsContent value="chat" className="rounded-md border p-4 text-sm">
        Agent conversation appears here.
      </TabsContent>
      <TabsContent value="terminal" className="rounded-md border p-4 text-sm font-mono">
        $ forge exec "build the web SPA"
      </TabsContent>
      <TabsContent value="git" className="rounded-md border p-4 text-sm">
        Branch: feat/storybook · 3 commits ahead of main
      </TabsContent>
    </Tabs>
  ),
};

export const SessionTabs: Story = {
  render: () => (
    <Tabs defaultValue="active" className="w-96">
      <TabsList className="w-full">
        <TabsTrigger value="active" className="flex-1">Active (2)</TabsTrigger>
        <TabsTrigger value="paused" className="flex-1">Paused (1)</TabsTrigger>
        <TabsTrigger value="done" className="flex-1">Done (5)</TabsTrigger>
      </TabsList>
      <TabsContent value="active" className="p-2 text-sm text-muted-foreground">
        2 sessions running
      </TabsContent>
      <TabsContent value="paused" className="p-2 text-sm text-muted-foreground">
        1 session waiting for input
      </TabsContent>
      <TabsContent value="done" className="p-2 text-sm text-muted-foreground">
        5 completed sessions
      </TabsContent>
    </Tabs>
  ),
};
