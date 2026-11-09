import type { Meta, StoryObj } from "@storybook/react-vite";
import { File, GitBranch, Settings, Terminal } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const meta: Meta<typeof Command> = {
  title: "UI/Command",
  component: Command,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Command>;

export const Default: Story = {
  render: () => (
    <Command className="w-80 rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Sessions">
          <CommandItem>
            <Terminal className="mr-2 h-4 w-4" />
            New session
          </CommandItem>
          <CommandItem>
            <GitBranch className="mr-2 h-4 w-4" />
            Switch branch
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Files">
          <CommandItem>
            <File className="mr-2 h-4 w-4" />
            Open file
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>
            <Settings className="mr-2 h-4 w-4" />
            Preferences
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
