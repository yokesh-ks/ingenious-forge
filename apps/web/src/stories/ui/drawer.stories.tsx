import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

const meta: Meta<typeof Drawer> = {
  title: "UI/Drawer",
  component: Drawer,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Drawer>;

export const Default: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Open drawer</Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>Confirm action</DrawerTitle>
            <DrawerDescription>
              Push branch <code className="text-xs">feat/storybook-161</code> and open a pull
              request against <code className="text-xs">main</code>.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button>Push & open PR</Button>
            <Button variant="outline">Cancel</Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  ),
};
