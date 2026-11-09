import type { Meta, StoryObj } from "@storybook/react-vite";
import { File, Folder, GitBranch, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";

const meta: Meta<typeof Item> = {
  title: "UI/Item",
  component: Item,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Item>;

export const Default: Story = {
  render: () => (
    <Item className="w-80">
      <ItemMedia variant="icon">
        <Terminal />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>feat/storybook-161</ItemTitle>
        <ItemDescription>Session started 5 minutes ago</ItemDescription>
      </ItemContent>
    </Item>
  ),
};

export const WithActions: Story = {
  render: () => (
    <Item className="w-96">
      <ItemMedia variant="icon">
        <GitBranch />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>feat/chat-ui</ItemTitle>
        <ItemDescription>3 commits ahead of main</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Badge variant="secondary">In Progress</Badge>
        <Button size="xs" variant="outline">View</Button>
      </ItemActions>
    </Item>
  ),
};

export const SessionList: Story = {
  render: () => (
    <ItemGroup className="w-96">
      {[
        { branch: "feat/chat-ui", desc: "Active · Claude Sonnet", icon: Terminal, status: "Active" },
        { branch: "fix/api-types", desc: "Done · Claude Haiku", icon: File, status: "Done" },
        { branch: "docs/adr-0016", desc: "Paused · Claude Sonnet", icon: Folder, status: "Paused" },
      ].map(({ branch, desc, icon: Icon, status }) => (
        <Item key={branch} variant="outline" size="sm">
          <ItemMedia variant="icon">
            <Icon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{branch}</ItemTitle>
            <ItemDescription>{desc}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Badge variant={status === "Active" ? "default" : "secondary"}>{status}</Badge>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  ),
};

export const WithSeparator: Story = {
  render: () => (
    <ItemGroup className="w-80">
      <Item>
        <ItemContent>
          <ItemTitle>Active sessions</ItemTitle>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>feat/storybook-161</ItemTitle>
          <ItemDescription>Running</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  ),
};
