import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const meta: Meta<typeof Popover> = {
  title: "UI/Popover",
  component: Popover,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Popover>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Session filter</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Filter sessions</h4>
          <div className="space-y-2">
            <Label htmlFor="branch-filter">Branch</Label>
            <Input id="branch-filter" placeholder="feat/*" />
          </div>
          <Button size="sm" className="w-full">
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const Info: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          What is P0?
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <p className="text-sm">
          P0 issues are critical blockers. They prevent a release and must be resolved before any
          other work.
        </p>
      </PopoverContent>
    </Popover>
  ),
};
