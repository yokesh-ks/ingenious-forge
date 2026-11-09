import type { Meta, StoryObj } from "@storybook/react-vite";
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const meta: Meta<typeof Empty> = {
  title: "UI/Empty",
  component: Empty,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Empty>;

export const Default: Story = {
  render: () => (
    <Empty className="w-96">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Terminal />
        </EmptyMedia>
        <EmptyTitle>No sessions yet</EmptyTitle>
        <EmptyDescription>
          Start a session to let Forge Agent work on a branch for you.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm">New session</Button>
      </EmptyContent>
    </Empty>
  ),
};

export const NoResults: Story = {
  render: () => (
    <Empty className="w-80">
      <EmptyHeader>
        <EmptyTitle>No results</EmptyTitle>
        <EmptyDescription>Try a different search term or clear the filter.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
};
