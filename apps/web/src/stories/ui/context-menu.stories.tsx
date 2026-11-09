import type { Meta, StoryObj } from "@storybook/react-vite";
import { Edit, Eye, GitBranch, Trash } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const meta: Meta<typeof ContextMenu> = {
  title: "UI/ContextMenu",
  component: ContextMenu,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ContextMenu>;

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-20 w-72 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        Right-click here
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>feat/storybook-161</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem>
          <Eye className="mr-2 h-4 w-4" /> View session
        </ContextMenuItem>
        <ContextMenuItem>
          <GitBranch className="mr-2 h-4 w-4" /> Open branch
        </ContextMenuItem>
        <ContextMenuItem>
          <Edit className="mr-2 h-4 w-4" /> Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive">
          <Trash className="mr-2 h-4 w-4" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
};
