import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta: Meta<typeof Dialog> = {
  title: "UI/Dialog",
  component: Dialog,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>New session</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create session</DialogTitle>
          <DialogDescription>
            Configure the new Forge Agent session before starting.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Session name</Label>
            <Input id="name" placeholder="feat/my-feature-42" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="model">Model</Label>
            <Input id="model" defaultValue="claude-sonnet-4-6" />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">Start session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Confirmation: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Merge PR</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge pull request</DialogTitle>
          <DialogDescription>
            All CI checks are green. This will squash-merge into{" "}
            <code className="text-xs">main</code>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Merge</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
