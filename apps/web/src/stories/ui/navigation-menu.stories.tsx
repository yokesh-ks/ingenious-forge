import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

const meta: Meta<typeof NavigationMenu> = {
  title: "UI/NavigationMenu",
  component: NavigationMenu,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof NavigationMenu>;

export const Default: Story = {
  render: () => (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Sessions</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid gap-2 p-4 w-64">
              <li>
                <NavigationMenuLink href="#" className="block rounded-md p-2 text-sm hover:bg-muted">
                  <div className="font-medium">Active sessions</div>
                  <div className="text-xs text-muted-foreground">Currently running agents</div>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="#" className="block rounded-md p-2 text-sm hover:bg-muted">
                  <div className="font-medium">Completed</div>
                  <div className="text-xs text-muted-foreground">Finished and merged sessions</div>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Board</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid gap-2 p-4 w-56">
              <li>
                <NavigationMenuLink href="#" className="block rounded-md p-2 text-sm hover:bg-muted">
                  Backlog
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="#" className="block rounded-md p-2 text-sm hover:bg-muted">
                  In Progress
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="#" className="block rounded-md p-2 text-sm hover:bg-muted">
                  Done
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="#" className={navigationMenuTriggerStyle()}>
            Docs
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
};
