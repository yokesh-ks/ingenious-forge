import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const meta: Meta<typeof Avatar> = {
  title: "UI/Avatar",
  component: Avatar,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const WithFallback: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="" alt="yokesh-ks" />
      <AvatarFallback>YK</AvatarFallback>
    </Avatar>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-[10px]">YK</AvatarFallback>
      </Avatar>
      <Avatar className="h-8 w-8">
        <AvatarFallback>YK</AvatarFallback>
      </Avatar>
      <Avatar className="h-10 w-10">
        <AvatarFallback>YK</AvatarFallback>
      </Avatar>
      <Avatar className="h-14 w-14">
        <AvatarFallback className="text-lg">YK</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const AgentAvatar: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback className="bg-primary text-primary-foreground">FA</AvatarFallback>
      </Avatar>
      <div>
        <p className="text-sm font-medium">Forge Agent</p>
        <p className="text-muted-foreground text-xs">Active session</p>
      </div>
    </div>
  ),
};
