import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["default", "sm"] },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Session started</CardTitle>
        <CardDescription>Forge is ready to accept commands.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Use the terminal or chat interface to interact with the agent.
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Open terminal</Button>
        <Button size="sm" variant="outline">
          View logs
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Repository</CardTitle>
        <CardDescription>ingenious-forge · main</CardDescription>
        <CardAction>
          <Button size="xs" variant="outline">
            Clone
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">Last commit 2 minutes ago</p>
      </CardContent>
    </Card>
  ),
};

export const Small: Story = {
  render: () => (
    <Card size="sm" className="w-72">
      <CardHeader>
        <CardTitle>Compact card</CardTitle>
        <CardDescription>Uses reduced padding.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Content fits tighter spaces.</p>
      </CardContent>
    </Card>
  ),
};
