import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";

const meta: Meta<typeof Menubar> = {
  title: "UI/Menubar",
  component: Menubar,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Menubar>;

export const Default: Story = {
  render: () => (
    <Menubar>
      <MenubarMenu>
        <MenubarTrigger>Session</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            New session <MenubarShortcut>⌘N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Open session <MenubarShortcut>⌘O</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>Close</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>Chat</MenubarItem>
          <MenubarItem>Terminal</MenubarItem>
          <MenubarItem>Git diff</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Tools</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            Command palette <MenubarShortcut>⌘K</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>Settings</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  ),
};
