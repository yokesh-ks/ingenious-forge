import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const meta: Meta<typeof Sheet> = {
  title: "UI/Sheet",
  component: Sheet,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Sheet>;

export const Right: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Session settings</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Session settings</SheetTitle>
          <SheetDescription>
            Configure the current Forge Agent session.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-6">
          <div className="grid gap-2">
            <Label htmlFor="model-sheet">Model</Label>
            <Input id="model-sheet" defaultValue="claude-sonnet-4-6" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="branch-sheet">Branch</Label>
            <Input id="branch-sheet" defaultValue="feat/storybook-161" />
          </div>
        </div>
        <SheetFooter>
          <Button>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open panel</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Browse your sessions and projects.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2 text-sm">
          <p className="text-muted-foreground">Sessions</p>
          <p className="font-mono">feat/chat-ui-45</p>
          <p className="font-mono">feat/storybook-161</p>
        </div>
      </SheetContent>
    </Sheet>
  ),
};
